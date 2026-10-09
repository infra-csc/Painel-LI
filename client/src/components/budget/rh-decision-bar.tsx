/**
 * Decisão do RH no Comparativo — 25/09 (modularização); redesenho 08/10.
 *
 * `RhDecisionBar`: antes era um rodapé FIXO, sempre presente enquanto
 * houvesse pendente (com "Selecione os itens pendentes acima…" e três botões
 * apagados), que cobria a lista e acompanhava a largura do menu lateral.
 * Agora é a barra de seleção da família (a do Planejado e do Realizado): só
 * aparece com algo marcado, sobe do rodapé da lista, diz quantas e quanto
 * (planejado, realizado, diferença) e carrega Recusar, Devolver e Aprovar.
 *
 * `RhActionDialog` (aprovar/recusar/devolver, observação obrigatória ao
 * devolver/recusar) e `ConfirmAdjustDialog` (aprovação com campos ajustados
 * pelo RH, agora listando os ajustes campo a campo) — mesmas regras, mesmos
 * caminhos; só a apresentação mudou.
 */
import { CheckCircle, Loader2, PencilLine, RotateCcw, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/forms/required-mark";
import type { AcoesDoComparativo } from "@/hooks/use-budget-comparison-actions";
import { fmt, lerAdjustedFields, parseAdjustedFields, type ComparisonRow } from "./comparison-utils";

type Totais = { planned: number; actual: number; diff: number };

const comSinal = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmt(Math.abs(d))}`;

/** Quantos campos o RH ajustou nas prestações marcadas (filhos de divisão inclusos). */
export function contarAjustesDoRh(sortedData: ComparisonRow[], selectedItems: Set<string>): number {
  return sortedData
    .filter(row => selectedItems.has(row.actual.id))
    .reduce((total, row) => {
      const allActuals = [row.actual, ...(row.isSplit ? row.splitChildren : [])];
      return total + allActuals.reduce((n, a) => n + parseAdjustedFields(a.rhAdjustedFields).length, 0);
    }, 0);
}

export interface RhDecisionBarProps {
  sortedData: ComparisonRow[];
  selectedItems: Set<string>;
  selectedTotals: Totais;
  acoes: AcoesDoComparativo;
  onClearSelection: () => void;
}

/** Barra de seleção — apenas RH/admin decide. */
export function RhDecisionBar({ sortedData, selectedItems, selectedTotals, acoes, onClearSelection }: RhDecisionBarProps) {
  const n = selectedItems.size;
  if (n === 0) return null;
  const nAjustes = contarAjustesDoRh(sortedData, selectedItems);
  const hasAdjusted = nAjustes > 0;
  const BOTAO = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 disabled:opacity-60";
  return (
    <div className="sticky bottom-3 z-20 pas-sobe" role="region" aria-label="Decisão do RH sobre a seleção" data-testid="barra-decisao-rh">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
        <div className="min-w-0 flex-1 basis-[260px]">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="m-0 text-sm font-semibold tabular-nums" aria-live="polite">
              {n} {n === 1 ? "selecionada" : "selecionadas"}
              <span className="font-normal text-background/70"> · {fmt(selectedTotals.actual)}</span>
            </p>
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
              data-testid="comparativo-limpar-selecao"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
            </button>
          </div>
          <p className="m-0 text-2xs leading-4 text-background/65 tabular-nums truncate">
            Planejado {fmt(selectedTotals.planned)} · diferença{" "}
            <span className={cn("font-semibold", selectedTotals.diff > 0 ? "cmp-dif-acima" : selectedTotals.diff < 0 ? "cmp-dif-abaixo" : "")}>{comSinal(selectedTotals.diff)}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 max-sm:w-full">
          <button
            type="button"
            className={cn(BOTAO, "max-sm:flex-1 justify-center text-background/85 hover:bg-background/10 hover:text-background")}
            onClick={() => acoes.setActionModal({ type: "reject" })}
            title="Recusa a prestação — o responsável poderá corrigir e reenviar"
            data-testid="comparativo-recusar"
          >
            <XCircle className="w-4 h-4" aria-hidden="true" />Recusar
          </button>
          <button
            type="button"
            className={cn(BOTAO, "max-sm:flex-1 justify-center text-background/85 hover:bg-background/10 hover:text-background")}
            onClick={() => acoes.setActionModal({ type: "return" })}
            title="Solicita correção — o responsável pode editar e reenviar"
            data-testid="comparativo-devolver"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />Devolver
          </button>
          <button
            type="button"
            className={cn(BOTAO, "max-sm:flex-[2] justify-center px-3.5 bg-success-strong text-white hover:bg-success")}
            onClick={() => (hasAdjusted ? acoes.setConfirmAdjustOpen(true) : acoes.setActionModal({ type: "approve" }))}
            title="Aprova a prestação — análise formal do RH"
            data-testid="comparativo-aprovar"
          >
            <CheckCircle className="w-4 h-4" aria-hidden="true" />
            {hasAdjusted ? `Aprovar com ajustes (${nAjustes} ${nAjustes === 1 ? "campo" : "campos"})` : `Aprovar (${n})`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Planejado · Realizado · Diferença do conjunto — três números alinhados. */
function TotaisDoConjunto({ t }: { t: Totais }) {
  return (
    <dl className="m-0 grid grid-cols-3 rounded-lg border border-border bg-surface-muted/60 divide-x divide-border">
      {[
        { r: "Planejado", v: fmt(t.planned), c: "text-slate-700" },
        { r: "Realizado", v: fmt(t.actual), c: "text-foreground font-semibold" },
        { r: "Diferença", v: comSinal(t.diff), c: t.diff > 0 ? "text-danger font-semibold" : t.diff < 0 ? "text-success font-semibold" : "text-muted-foreground" },
      ].map(x => (
        <div key={x.r} className="min-w-0 px-2.5 sm:px-3 py-2">
          <dt className="text-2xs text-muted-foreground">{x.r}</dt>
          <dd className={cn("m-0 text-xs sm:text-sm tabular-nums whitespace-nowrap", x.c)}>{x.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface RhActionDialogProps {
  acoes: AcoesDoComparativo;
  sortedData: ComparisonRow[];
  selectedItems: Set<string>;
  selectedTotals: Totais;
  getCollaboratorName: (id?: string | null) => string;
}

const TEXTO = {
  approve: {
    titulo: (n: number) => (n === 1 ? "Aprovar a prestação?" : `Aprovar as ${n} prestações?`),
    efeito: "Análise formal do RH: a prestação fica aprovada e sai da fila de análise.",
    icone: CheckCircle, cor: "bg-success-soft text-success",
    botao: "Confirmar aprovação", classe: "bg-success-strong hover:bg-success text-white",
    placeholder: "Adicionar um comentário…",
  },
  reject: {
    titulo: (n: number) => (n === 1 ? "Recusar a prestação?" : `Recusar as ${n} prestações?`),
    efeito: "O responsável de função recebe a observação no Realizado e pode corrigir e reenviar.",
    icone: XCircle, cor: "bg-danger-soft text-danger",
    botao: "Confirmar recusa", classe: "bg-danger hover:bg-danger/90 text-white",
    placeholder: "Escreva o motivo da recusa",
  },
  return: {
    titulo: (n: number) => (n === 1 ? "Devolver a prestação para correção?" : `Devolver as ${n} prestações para correção?`),
    efeito: "O responsável de função recebe a observação no Realizado, corrige e reenvia para revisão.",
    icone: RotateCcw, cor: "bg-warning-soft text-warning",
    botao: "Devolver para ajuste", classe: "bg-warning-strong hover:bg-warning text-white",
    placeholder: "Descreva o que precisa ser corrigido",
  },
} as const;

/** Confirmação da decisão: quem entra, quanto soma e a observação. */
export function RhActionDialog({ acoes, sortedData, selectedItems, selectedTotals, getCollaboratorName }: RhActionDialogProps) {
  const { actionModal, actionNote, setActionNote, actionNoteError, setActionNoteError, fecharActionModal, handleAction, rhActionMutation } = acoes;
  const selecionados = sortedData.filter(row => selectedItems.has(row.actual.id));
  const tipo = actionModal?.type ?? "approve";
  const t = TEXTO[tipo];
  const n = selectedItems.size;
  const obrigatoria = tipo !== "approve";
  const mostraErro = actionNoteError && obrigatoria && !actionNote.trim();
  const Icone = t.icone;
  return (
    <Dialog open={!!actionModal} onOpenChange={fecharActionModal}>
      <DialogContent className="max-w-[480px] p-0 gap-0 flex flex-col overflow-hidden" data-testid="dialogo-decisao-rh">
        <DialogHeader className="px-6 pt-5 pb-3 text-left space-y-0">
          <div className="flex items-start gap-3 pr-6">
            <span className={cn("inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0", t.cor)} aria-hidden="true">
              <Icone className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-6">{t.titulo(n)}</DialogTitle>
              <DialogDescription className="mt-0.5 text-sm leading-relaxed text-slate-600">{t.efeito}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
          <section aria-label="Prestações afetadas" className="space-y-2">
            <p className="m-0 text-xs font-medium text-slate-600">
              {n} {n === 1 ? "colaborador afetado" : "colaboradores afetados"}
            </p>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {selecionados.map(row => (
                <li key={row.actual.id} className="inline-flex items-center h-6 px-2 rounded-md bg-muted text-xs font-medium text-slate-700">
                  {getCollaboratorName(row.collaboratorId)}
                </li>
              ))}
            </ul>
            <TotaisDoConjunto t={selectedTotals} />
          </section>

          {/* Comentário — aplicado a todos os itens selecionados. Manual do
              Financeiro: obrigatório ao devolver/recusar; opcional só no aprovar. */}
          <div>
            <label htmlFor="rh-acao-observacao" className="block text-sm font-medium text-foreground">
              {obrigatoria ? <>Observação<RequiredMark /></> : "Comentário"}
              <span className="ml-1 font-normal text-muted-foreground">
                {obrigatoria ? "(obrigatória" : "(opcional"}{n > 1 ? ` — vale para os ${n} colaboradores` : ""})
              </span>
            </label>
            <Textarea
              id="rh-acao-observacao"
              className={cn("mt-1.5 rounded-lg text-sm resize-none", mostraErro && "border-danger-strong focus-visible:ring-danger/25")}
              value={actionNote}
              onChange={e => { setActionNote(e.target.value); if (e.target.value.trim()) setActionNoteError(false); }}
              aria-required={obrigatoria}
              aria-invalid={mostraErro || undefined}
              aria-describedby="rh-acao-ajuda"
              placeholder={t.placeholder}
              rows={3}
              autoFocus={obrigatoria}
            />
            <p id="rh-acao-ajuda" className={cn("m-0 mt-1.5 text-xs leading-5", mostraErro ? "text-danger font-medium" : "text-muted-foreground")}>
              {mostraErro
                ? `A observação é obrigatória ao ${tipo === "reject" ? "recusar" : "devolver"} — o responsável de função a receberá na tela do Realizado.`
                : obrigatoria
                  ? "Fica visível para o responsável no card da prestação."
                  : "Fica registrado junto da aprovação."}
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 py-3.5 border-t border-border bg-surface-muted/40 gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-lg" onClick={fecharActionModal}>Cancelar</Button>
          <Button
            onClick={handleAction}
            disabled={rhActionMutation.isPending}
            className={cn("rounded-lg gap-1.5", t.classe)}
            data-testid="comparativo-confirmar-decisao"
          >
            {rhActionMutation.isPending && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {rhActionMutation.isPending ? "Processando…" : t.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aprovação de itens com valores ajustados pelo RH — lista o que mudou antes de seguir. */
export function ConfirmAdjustDialog({ open, onOpenChange, onConfirm, sortedData, selectedItems, getCollaboratorName }: {
  open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void;
  /** Opcionais (08/10): com eles o modal mostra os ajustes campo a campo. */
  sortedData?: ComparisonRow[]; selectedItems?: Set<string>; getCollaboratorName?: (id?: string | null) => string;
}) {
  const ajustes = sortedData && selectedItems
    ? sortedData
        .filter(row => selectedItems.has(row.actual.id))
        .flatMap(row => [row.actual, ...(row.isSplit ? row.splitChildren : [])])
        .map(a => ({
          id: a.id,
          nome: getCollaboratorName ? getCollaboratorName(a.collaboratorId) : "",
          campos: Object.values(lerAdjustedFields(a.rhAdjustedFields) as Record<string, { from: number; to: number; label: string }>),
        }))
        .filter(x => x.campos.length > 0)
    : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] p-0 gap-0 flex flex-col overflow-hidden" data-testid="dialogo-aprovar-com-ajustes">
        <DialogHeader className="px-6 pt-5 pb-3 text-left space-y-0">
          <div className="flex items-start gap-3 pr-6">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 bg-warning-soft text-warning" aria-hidden="true">
              <PencilLine className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-6">Aprovar com os ajustes do RH?</DialogTitle>
              <DialogDescription className="mt-0.5 text-sm leading-relaxed text-slate-600">
                Você está aprovando itens com valores ajustados pelo RH em relação ao realizado do colaborador. Revise antes de confirmar.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {ajustes.length > 0 && (
          <ul className="m-0 mx-6 mb-4 p-0 list-none max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {ajustes.map(x => (
              <li key={x.id} className="px-3 py-2">
                <p className="m-0 text-xs font-semibold text-foreground">{x.nome}</p>
                {x.campos.map((f, i) => (
                  <p key={i} className="m-0 flex flex-wrap items-baseline gap-x-1.5 text-xs leading-5 text-slate-600">
                    <span>{f.label}:</span>
                    <span className="tabular-nums line-through text-muted-foreground">{fmt(f.from)}</span>
                    <span aria-hidden="true">→</span><span className="sr-only">para</span>
                    <span className="tabular-nums font-semibold text-warning">{fmt(f.to)}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="px-6 py-3.5 border-t border-border bg-surface-muted/40 gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-lg gap-1.5 bg-success-strong hover:bg-success text-white" onClick={onConfirm} data-testid="comparativo-seguir-com-ajustes">
            <CheckCircle className="w-4 h-4" aria-hidden="true" />
            Seguir para a aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
