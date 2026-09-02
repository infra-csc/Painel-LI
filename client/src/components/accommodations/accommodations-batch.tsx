/**
 * O lote de hospedagem: barra de seleção, confirmação e resultado.
 *
 * Antes era um card recolhido acima da tabela ("Aplicar em Lote"), e as caixas
 * de seleção da lista só existiam DEPOIS de expandi-lo. Ninguém descobre um
 * formulário que só aparece atrás de um clique num acordeão — e o formulário
 * pedia os dados antes de existir qualquer linha selecionada, invertendo a
 * ordem natural do trabalho.
 *
 * Agora o caminho é o inverso: marcar linhas na lista faz subir a barra, e o
 * formulário aparece na confirmação, junto da lista do que vai ser afetado.
 *
 * **Nenhum campo do lote saiu**: hotel, localização, check-in e check-out com
 * hora e observações continuam todos aqui.
 */
import { AlertCircle, BedDouble, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import type { BatchDraft } from "./types";
import { isCheckOutAfterCheckIn, toDateInput, toTitleCase } from "./utils";

const INPUT = "h-10 bg-slate-50 border-slate-200 rounded-xl text-[13px]";
const LBL = "text-[11px] font-semibold text-[#64748B] uppercase tracking-tight";

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
    <div
      className="sticky bottom-4 z-30 mx-auto w-fit max-w-full flex items-center gap-3 h-[38px] px-3 rounded-xl bg-slate-900 text-white shadow-[0_16px_40px_rgba(15,23,42,.28)]"
      role="region"
      aria-label="Ações da seleção"
      data-testid="barra-selecao-lote"
    >
      <span className="text-[13px] font-medium tabular-nums whitespace-nowrap">
        {selectedCount} {plural}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 text-[12px] text-slate-300 hover:text-white transition-colors whitespace-nowrap"
        data-testid="button-clear-selection"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="h-[28px] px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors whitespace-nowrap"
          data-testid="button-apply-to-selected"
        >
          <BedDouble className="w-3.5 h-3.5" aria-hidden="true" />
          {applying ? "Aplicando…" : `Aplicar o mesmo hotel (${selectedCount})`}
        </button>
      )}
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
      <DialogContent className="max-w-[560px] rounded-2xl" data-testid="dialog-batch-confirm">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-black text-slate-900">
            Aplicar a {n} {n === 1 ? "hospedagem" : "hospedagens"}?
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#64748B]">
            O mesmo hotel vai para todas as vagas marcadas, e o status de cada uma avança para hospedagem registrada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="batch-hotel-name" className={LBL}>Nome do Hotel *</Label>
              <Input id="batch-hotel-name" placeholder="Hotel Copacabana" value={draft.hotelName || ""}
                onChange={(e) => onChange("hotelName", e.target.value)} className={INPUT} data-testid="input-quick-hotel-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-hotel-location" className={LBL}>Localização *</Label>
              <Input id="batch-hotel-location" placeholder="Rio de Janeiro, RJ" value={draft.hotelLocation || ""}
                onChange={(e) => onChange("hotelLocation", e.target.value)} className={INPUT} data-testid="input-quick-hotel-location" />
            </div>
          </div>

          {/* Datas do lote — opcionais: em branco, cada inclusão usa seu período de trabalho. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={LBL}>Check-in <span className="text-[#94A3B8] normal-case">(opcional)</span></Label>
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <Input type="date" aria-label="Data de check-in do lote" value={draft.checkInDate || ""}
                  onChange={(e) => onChange("checkInDate", e.target.value)} className={INPUT} data-testid="input-quick-checkin-date" />
                <Input type="time" aria-label="Hora de check-in do lote" value={draft.checkInTime || ""}
                  onChange={(e) => onChange("checkInTime", e.target.value)} className={INPUT} data-testid="input-quick-checkin-time" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={LBL}>Check-out <span className="text-[#94A3B8] normal-case">(opcional)</span></Label>
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <Input type="date" aria-label="Data de check-out do lote" min={draft.checkInDate || undefined} value={draft.checkOutDate || ""}
                  onChange={(e) => onChange("checkOutDate", e.target.value)} className={INPUT} data-testid="input-quick-checkout-date" />
                <Input type="time" aria-label="Hora de check-out do lote" value={draft.checkOutTime || ""}
                  onChange={(e) => onChange("checkOutTime", e.target.value)} className={INPUT} data-testid="input-quick-checkout-time" />
              </div>
            </div>
          </div>

          {!datasOk && (
            <p className="text-[12px] text-[#B91C1C] flex items-center gap-1.5" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> O check-out deve ser igual ou posterior ao check-in.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="batch-observations" className={LBL}>Observações <span className="text-[#94A3B8] normal-case">(opcional)</span></Label>
            <Textarea id="batch-observations" placeholder="Informações adicionais…" value={draft.accommodationObservations || ""}
              onChange={(e) => onChange("accommodationObservations", e.target.value)}
              className="text-[13px] resize-none bg-slate-50 border-slate-200 rounded-xl h-[64px]" data-testid="textarea-quick-accommodation-observations" />
          </div>

          {(!draft.checkInDate || !draft.checkOutDate) && (
            <p className="text-[12px] text-[#0033CC] bg-[#EEF2FF] rounded-xl px-3 py-2">
              As datas em branco usam o período de trabalho de cada inclusão.
            </p>
          )}

          {comConflito.length > 0 && (
            <p className="text-[12px] text-[#92400E] bg-[#FEF3C7] rounded-xl px-3 py-2" role="alert">
              {comConflito.length === 1
                ? "1 pessoa começa a trabalhar antes deste check-in — ela fica sem hotel na primeira noite."
                : `${comConflito.length} pessoas começam a trabalhar antes deste check-in — ficam sem hotel na primeira noite.`}
            </p>
          )}

          <div className="rounded-xl border border-border overflow-hidden">
            <p className="px-3 py-2 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-[0.06em] text-[#64748B]">
              Vai ser aplicado a
            </p>
            <ul className="max-h-[132px] overflow-y-auto divide-y divide-slate-100" data-testid="lista-do-lote">
              {inclusoes.map((i) => {
                const c = i.collaboratorId ? collaboratorById.get(i.collaboratorId) : undefined;
                return (
                  <li key={i.id} className="px-3 py-1.5 text-[13px] text-slate-700 flex items-center gap-2">
                    <span className="text-[12px] text-[#64748B] tabular-nums shrink-0">#{i.inclusionNumber}</span>
                    <span className="truncate">{toTitleCase(c?.fullName) || "Sem colaborador"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="rounded-xl text-[#64748B] hover:text-slate-700"
            onClick={onClearDraft}
            disabled={rascunhoVazio}
            data-testid="button-clear-quick"
          >
            Limpar campos
          </Button>
          <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} data-testid="button-cancel-batch">
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!podeAplicar}
            className="rounded-xl bg-primary hover:bg-primary-hover text-white disabled:opacity-50"
            data-testid="button-confirm-batch"
          >
            <Save className="w-4 h-4 mr-1.5" aria-hidden="true" />
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
    <AlertDialog open={aberto} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent className="max-w-[460px] rounded-2xl" data-testid="dialog-batch-result">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[17px] font-black text-slate-900">
            {houveFalha ? "Lote concluído com falhas" : "Lote concluído"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] text-[#64748B]">
            {resultado?.registradas ?? 0} {resultado?.registradas === 1 ? "hospedagem registrada" : "hospedagens registradas"}
            {houveFalha ? ` · ${resultado!.falhas.length} ${resultado!.falhas.length === 1 ? "falha" : "falhas"}` : ""}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {houveFalha && (
          <ul className="max-h-[180px] overflow-y-auto rounded-xl border border-[#FECACA] bg-[#FEF2F2] divide-y divide-[#FECACA]" data-testid="lista-falhas-lote">
            {resultado!.falhas.map((f, i) => (
              <li key={i} className="px-3 py-1.5 text-[12px] text-[#B91C1C]">{f}</li>
            ))}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogAction className="w-full rounded-xl bg-primary hover:bg-primary-hover" data-testid="button-batch-result-ok">
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
