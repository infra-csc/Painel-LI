/**
 * O lote de hospedagem: barra de seleção, confirmação e resultado.
 *
 * Antes era um card recolhido acima da tabela ("Aplicar em lote"), e as caixas
 * de seleção da lista só existiam DEPOIS de expandi-lo. Ninguém descobre um
 * formulário que só aparece atrás de um clique num acordeão — e o formulário
 * pedia os dados antes de existir qualquer linha selecionada, invertendo a
 * ordem natural do trabalho.
 *
 * Agora o caminho é o inverso: marcar linhas na lista faz subir a barra, e o
 * formulário aparece na confirmação, junto da lista do que vai ser afetado.
 *
 * 07/10 (redesenho): a barra de seleção é a MESMA de Passagens (escura, larga,
 * no rodapé da lista, sobe ao aparecer); o diálogo ganhou a forma dos outros
 * diálogos da família — campos de 36px, rótulos em caixa normal, data e hora
 * lado a lado sem estourar a caixa, a lista de quem recebe com a contagem e o
 * motivo do botão desabilitado dito embaixo dele.
 *
 * **Nenhum campo do lote saiu**: hotel, localização, check-in e check-out com
 * hora e observações continuam todos aqui.
 */
import { AlertCircle, BedDouble, CheckCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import type { BatchDraft } from "./types";
import { formatDate, isCheckOutAfterCheckIn, toDateInput, toTitleCase } from "./utils";
import { RequiredMark } from "@/components/forms/required-mark";

/** Rótulo dos campos — o mesmo do formulário do modal (e do de Passagens). */
const LBL = "text-xs font-medium text-slate-600 mb-1.5 block";
const OPCIONAL = "font-normal text-muted-foreground";

/**
 * Barra `sticky` no rodapé da lista, visível só com linhas marcadas.
 *
 * Escura de propósito: ela aparece por cima do conteúdo e some sozinha, então
 * precisa ser lida como camada, não como mais uma faixa da página.
 */
export function BatchSelectionBar({ selectedCount, canEdit, applying, onClear, onApply }: {
  selectedCount: number;
  canEdit: boolean;
  applying: boolean;
  onClear: () => void;
  onApply: () => void;
}) {
  if (selectedCount === 0) return null;
  const plural = selectedCount === 1 ? "hospedagem selecionada" : "hospedagens selecionadas";

  return (
    <div className="sticky bottom-3 z-20 pas-sobe" role="region" aria-label="Ações da seleção" data-testid="barra-selecao-lote">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="m-0 text-sm font-semibold tabular-nums" aria-live="polite">
              {selectedCount} {plural}
            </p>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
              data-testid="button-clear-selection"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
            </button>
          </div>
          {canEdit && (
            <p className="m-0 hidden lg:block text-2xs leading-4 text-background/65 truncate">
              O mesmo hotel vai para todas as vagas marcadas. Datas em branco usam o período de trabalho de cada uma.
            </p>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 shrink-0"
            data-testid="button-apply-to-selected"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <BedDouble className="w-4 h-4" aria-hidden="true" />}
            {applying ? "Aplicando…" : `Aplicar o mesmo hotel (${selectedCount})`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Formulário do lote + a lista do que ele vai atingir, na mesma tela.
 *
 * Ver os nomes antes de confirmar é o que separa "aplicar a 3 hospedagens" de
 * "aplicar a estas três pessoas".
 */
export function BatchConfirmDialog({
  open, onOpenChange, draft, onChange, onClearDraft, inclusoes, collaboratorById, applying, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: BatchDraft;
  onChange: <K extends keyof BatchDraft>(field: K, value: NonNullable<BatchDraft[K]>) => void;
  /** Zera o rascunho — sem isso um hotel digitado por engano volta no próximo lote. */
  onClearDraft: () => void;
  inclusoes: TeamInclusion[];
  collaboratorById: Map<string, Collaborator>;
  applying: boolean;
  onConfirm: () => void;
}) {
  const n = inclusoes.length;
  const rascunhoVazio = Object.values(draft).every((v) => !v);
  const datasOk = isCheckOutAfterCheckIn(draft);
  // Hotel e localização são os dois campos que o servidor exige; sem eles o
  // botão fica desabilitado em vez de deixar o usuário descobrir no erro.
  const podeAplicar = !!draft.hotelName && !!draft.hotelLocation && datasOk && n > 0 && !applying;
  const faltando = [!draft.hotelName && "o nome do hotel", !draft.hotelLocation && "a localização"].filter(Boolean) as string[];

  // Conflito de período: a data escolhida para todos não cobre o período de
  // trabalho de alguém. É aviso, não impedimento — às vezes é intencional.
  const comConflito = draft.checkInDate
    ? inclusoes.filter((i) => {
        const inicio = toDateInput(i.scheduleStartDate);
        return inicio && draft.checkInDate! > inicio;
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[580px] gap-0 p-0 overflow-hidden max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:rounded-none max-sm:border-0 flex flex-col max-h-[92vh] max-sm:max-h-none" data-testid="dialog-batch-confirm">
        <DialogHeader className="text-left px-5 sm:px-6 pt-5 pb-4 pr-12 border-b border-border">
          <DialogTitle className="text-base font-semibold text-foreground">
            Aplicar a {n} {n === 1 ? "hospedagem" : "hospedagens"}?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            O mesmo hotel vai para todas as vagas marcadas, e o status de cada uma avança para hospedagem registrada.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 [scrollbar-width:thin]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="batch-hotel-name" className={LBL}>Nome do hotel<RequiredMark /></Label>
              <Input id="batch-hotel-name" placeholder="Ex.: Hotel Copacabana" value={draft.hotelName || ""} autoComplete="off"
                onChange={(e) => onChange("hotelName", e.target.value)} data-testid="input-quick-hotel-name" />
            </div>
            <div>
              <Label htmlFor="batch-hotel-location" className={LBL}>Localização<RequiredMark /></Label>
              <Input id="batch-hotel-location" placeholder="Ex.: Rio de Janeiro, RJ" value={draft.hotelLocation || ""} autoComplete="off"
                onChange={(e) => onChange("hotelLocation", e.target.value)} data-testid="input-quick-hotel-location" />
            </div>
          </div>

          {/* Datas do lote — opcionais: em branco, cada inclusão usa seu período de trabalho. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className={LBL}>Check-in <span className={OPCIONAL}>(opcional)</span></legend>
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                <Input type="date" aria-label="Data de check-in do lote" value={draft.checkInDate || ""}
                  onChange={(e) => onChange("checkInDate", e.target.value)} data-testid="input-quick-checkin-date" />
                <Input type="time" aria-label="Hora de check-in do lote" value={draft.checkInTime || ""}
                  onChange={(e) => onChange("checkInTime", e.target.value)} data-testid="input-quick-checkin-time" />
              </div>
            </fieldset>
            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className={LBL}>Check-out <span className={OPCIONAL}>(opcional)</span></legend>
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                <Input type="date" aria-label="Data de check-out do lote" min={draft.checkInDate || undefined} value={draft.checkOutDate || ""}
                  aria-invalid={!datasOk || undefined}
                  className={!datasOk ? "border-danger-strong focus-visible:ring-danger/25" : undefined}
                  onChange={(e) => onChange("checkOutDate", e.target.value)} data-testid="input-quick-checkout-date" />
                <Input type="time" aria-label="Hora de check-out do lote" value={draft.checkOutTime || ""}
                  onChange={(e) => onChange("checkOutTime", e.target.value)} data-testid="input-quick-checkout-time" />
              </div>
            </fieldset>
          </div>

          {!datasOk && (
            <p className="m-0 -mt-1 text-xs text-danger-strong flex items-center gap-1.5" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> O check-out deve ser igual ou posterior ao check-in.
            </p>
          )}

          {(!draft.checkInDate || !draft.checkOutDate) && (
            <p className="m-0 text-xs text-slate-600 leading-relaxed">
              As datas em branco usam o período de trabalho de cada inclusão.
            </p>
          )}

          {comConflito.length > 0 && (
            <p className="pas-entra m-0 flex items-start gap-2 text-xs text-warning bg-warning-soft rounded-lg px-3 py-2" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-warning-strong" aria-hidden="true" />
              {comConflito.length === 1
                ? "1 pessoa começa a trabalhar antes deste check-in — ela fica sem hotel na primeira noite."
                : `${comConflito.length} pessoas começam a trabalhar antes deste check-in — ficam sem hotel na primeira noite.`}
            </p>
          )}

          <div>
            <Label htmlFor="batch-observations" className={LBL}>Observações <span className={OPCIONAL}>(opcional)</span></Label>
            <Textarea id="batch-observations" placeholder="Informações adicionais…" value={draft.accommodationObservations || ""}
              onChange={(e) => onChange("accommodationObservations", e.target.value)}
              className="text-sm resize-none h-[72px]" data-testid="textarea-quick-accommodation-observations" />
          </div>

          <div>
            <p className="m-0 mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Vai ser aplicado a ({n})
            </p>
            <ul className="m-0 p-0 list-none max-h-[148px] overflow-y-auto rounded-xl border border-border divide-y divide-border [scrollbar-width:thin]" data-testid="lista-do-lote">
              {inclusoes.map((i) => {
                const c = i.collaboratorId ? collaboratorById.get(i.collaboratorId) : undefined;
                const inicio = toDateInput(i.scheduleStartDate);
                const fim = toDateInput(i.scheduleEndDate);
                return (
                  <li key={i.id} className="px-3 py-1.5 text-sm text-slate-700 flex items-center gap-2">
                    <span className="text-2xs font-mono font-semibold text-primary tabular-nums shrink-0">#{i.inclusionNumber}</span>
                    <span className="truncate min-w-0 flex-1">{toTitleCase(c?.fullName) || "Sem colaborador"}</span>
                    {(inicio || fim) && (
                      <span className="text-2xs text-muted-foreground tabular-nums shrink-0" title="Período de trabalho da escala">
                        {inicio ? formatDate(inicio).slice(0, 5) : "—"} → {fim ? formatDate(fim).slice(0, 5) : "—"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <DialogFooter className="px-5 sm:px-6 py-3 border-t border-border bg-surface-muted flex-row flex-wrap items-center gap-2 sm:justify-between sm:space-x-0">
          {/* Por que o "Confirmar" está apagado — dito ao lado dele, não descoberto no erro. */}
          {!podeAplicar && !applying && faltando.length > 0 && (
            <p className="m-0 w-full text-right text-2xs text-muted-foreground" aria-live="polite" data-testid="lote-falta">
              Falta {faltando.join(" e ")} para aplicar.
            </p>
          )}
          <Button
            variant="ghost"
            className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-slate-700"
            onClick={onClearDraft}
            disabled={rascunhoVazio}
            data-testid="button-clear-quick"
          >
            Limpar campos
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" className="h-9 rounded-lg px-4 text-sm font-medium" onClick={() => onOpenChange(false)} data-testid="button-cancel-batch">
              Cancelar
            </Button>
            <Button
              onClick={onConfirm}
              disabled={!podeAplicar}
              className="h-9 rounded-lg px-4 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground"
              data-testid="button-confirm-batch"
            >
              {applying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <CheckCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />}
              {applying ? "Aplicando…" : "Confirmar e aplicar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface BatchResult {
  registradas: number;
  falhas: string[];
}

/**
 * O resultado do lote como diálogo, não como torrada.
 *
 * Uma lista de falhas dentro de um toast que some em segundos é a mesma coisa
 * que não mostrar as falhas.
 */
export function BatchResultDialog({ resultado, onClose }: {
  resultado: BatchResult | null;
  onClose: () => void;
}) {
  const aberto = resultado !== null;
  const houveFalha = (resultado?.falhas.length ?? 0) > 0;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[480px]" data-testid="dialog-batch-result">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            {houveFalha
              ? <><AlertCircle className="w-5 h-5 text-warning-strong" aria-hidden="true" /> Lote concluído com falhas</>
              : <><CheckCircle className="w-5 h-5 text-success-strong" aria-hidden="true" /> Lote concluído</>}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {resultado?.registradas ?? 0} {resultado?.registradas === 1 ? "hospedagem registrada" : "hospedagens registradas"}
            {houveFalha ? ` · ${resultado!.falhas.length} ${resultado!.falhas.length === 1 ? "falha" : "falhas"}` : ""}.
          </DialogDescription>
        </DialogHeader>

        {houveFalha && (
          <ul className="m-0 max-h-48 overflow-y-auto bg-danger-soft rounded-xl py-2.5 pr-3 text-xs text-danger space-y-1 list-disc pl-7" data-testid="lista-falhas-lote">
            {resultado!.falhas.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}

        <div className="flex justify-end">
          <Button onClick={onClose} className="h-9 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg px-5" data-testid="button-batch-result-ok">
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
