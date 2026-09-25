/**
 * Decisão do RH no Comparativo — 25/09 (modularização).
 * `RhDecisionBar` (rodapé fixo: recusar/devolver/aprovar), `RhActionDialog`
 * (confirmação com observação obrigatória ao devolver/recusar) e
 * `ConfirmAdjustDialog` (aprovação com campos ajustados pelo RH).
 */
import { CheckCircle, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RequiredMark } from "@/components/forms/required-mark";
import type { AcoesDoComparativo } from "@/hooks/use-budget-comparison-actions";
import { avatarColor, fmt, initials, parseAdjustedFields, type ComparisonRow } from "./comparison-utils";

export interface RhDecisionBarProps {
  sidebarWidth: number;
  sortedData: ComparisonRow[];
  selectedItems: Set<string>;
  selectedTotals: { planned: number; actual: number; diff: number };
  acoes: AcoesDoComparativo;
}

/** Fixed RH Decision footer — apenas RH/admin decide. */
export function RhDecisionBar({ sidebarWidth, sortedData, selectedItems, selectedTotals, acoes }: RhDecisionBarProps) {
  const selectedRhAdjustedFields = sortedData
    .filter(row => selectedItems.has(row.actual.id))
    .reduce((total, row) => {
      const allActuals = [row.actual, ...(row.isSplit ? row.splitChildren : [])];
      return total + allActuals.reduce((n, a) => n + parseAdjustedFields(a.rhAdjustedFields).length, 0);
    }, 0);
  const hasAdjusted = selectedRhAdjustedFields > 0;
  return (
    <div className="fixed bottom-0 right-0 z-40 px-6 pb-4 pt-3 bg-card/95 backdrop-blur-sm border-t border-border shadow-2 transition-all duration-300" style={{ left: sidebarWidth }}>
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-foreground">Decisão do RH</h3>
          <p className={`text-xs mt-0.5 transition-colors ${selectedItems.size > 0 ? "text-success font-medium" : "text-muted-foreground"}`}>
            {selectedItems.size > 0
              ? <>
                  {selectedItems.size} selecionado{selectedItems.size !== 1 ? "s" : ""} para ação
                  <span className="text-muted-foreground font-normal tabular-nums">
                    {" "}· Plan. {fmt(selectedTotals.planned)} · Real. {fmt(selectedTotals.actual)} · Dif.{" "}
                    <span className={selectedTotals.diff > 0 ? "text-danger-strong font-semibold" : selectedTotals.diff < 0 ? "text-success font-semibold" : ""}>
                      {selectedTotals.diff > 0 ? "+" : selectedTotals.diff < 0 ? "−" : ""}{fmt(Math.abs(selectedTotals.diff))}
                    </span>
                  </span>
                </>
              : <>Selecione os itens pendentes acima para tomar uma decisão</>
            }
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Secondary actions */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-9 text-sm px-4 rounded-xl font-semibold bg-danger-soft hover:bg-danger-soft text-danger border-none shadow-none disabled:opacity-40"
                  onClick={() => acoes.setActionModal({ type: "reject" })}
                  disabled={selectedItems.size === 0}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Recusar{selectedItems.size > 0 ? ` (${selectedItems.size})` : ""}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                Rejeita a prestação — o responsável poderá corrigir e reenviar
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-9 text-sm px-4 rounded-xl font-semibold bg-warning-soft hover:bg-warning/20 text-warning border border-warning/25 shadow-none disabled:opacity-40"
                  onClick={() => acoes.setActionModal({ type: "return" })}
                  disabled={selectedItems.size === 0}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Devolver{selectedItems.size > 0 ? ` (${selectedItems.size})` : ""}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                Solicita correção — responsável pode editar e reenviar
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Divider */}
          <div className="w-px h-6 bg-border mx-1" />
          {/* Primary approve action */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-9 text-sm px-5 rounded-xl text-white font-bold bg-success hover:bg-success/90 shadow-2 disabled:opacity-40"
                  onClick={() => {
                    if (hasAdjusted) {
                      acoes.setConfirmAdjustOpen(true);
                    } else {
                      acoes.setActionModal({ type: "approve" });
                    }
                  }}
                  disabled={selectedItems.size === 0}
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  {hasAdjusted
                    ? `Aprovar com ajustes (${selectedRhAdjustedFields} campo${selectedRhAdjustedFields !== 1 ? "s" : ""})`
                    : selectedItems.size > 0 ? `Aprovar e Finalizar (${selectedItems.size})` : "Aprovar e Finalizar"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                Aprova a prestação — análise formal do RH
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

export interface RhActionDialogProps {
  acoes: AcoesDoComparativo;
  sortedData: ComparisonRow[];
  selectedItems: Set<string>;
  selectedTotals: { planned: number; actual: number; diff: number };
  getCollaboratorName: (id?: string | null) => string;
}

/** Action confirmation modal. */
export function RhActionDialog({ acoes, sortedData, selectedItems, selectedTotals, getCollaboratorName }: RhActionDialogProps) {
  const { actionModal, actionNote, setActionNote, actionNoteError, setActionNoteError, fecharActionModal, handleAction, rhActionMutation } = acoes;
  const selecionados = sortedData.filter(row => selectedItems.has(row.actual.id));
  return (
    <Dialog open={!!actionModal} onOpenChange={fecharActionModal}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {actionModal?.type === "approve" && (
              <><div className="w-8 h-8 rounded-xl bg-success-soft flex items-center justify-center shrink-0"><CheckCircle className="w-4 h-4 text-success" aria-hidden="true" /></div> Aprovar prestação</>
            )}
            {actionModal?.type === "reject" && (
              <><div className="w-8 h-8 rounded-xl bg-danger-soft flex items-center justify-center shrink-0"><XCircle className="w-4 h-4 text-danger" aria-hidden="true" /></div> <span className="text-danger">Recusar prestação</span></>
            )}
            {actionModal?.type === "return" && (
              <><div className="w-8 h-8 rounded-xl bg-warning-soft flex items-center justify-center shrink-0"><RotateCcw className="w-4 h-4 text-warning" aria-hidden="true" /></div> <span className="text-warning">Devolver para correção</span></>
            )}
          </DialogTitle>
          <p className="text-2xs text-muted-foreground mt-1 pl-1 leading-relaxed">
            {selecionados.map(row => getCollaboratorName(row.collaboratorId).split(" ")[0]).join(", ")}
          </p>
        </DialogHeader>
        <div className="space-y-4">
          {/* Collaborator chips */}
          <div className={`rounded-xl p-3 border ${actionModal?.type === "reject" ? "bg-danger-soft/60 border-danger/25" : actionModal?.type === "return" ? "bg-warning-soft/60 border-warning/25" : "bg-surface-muted border-border"}`}>
            <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold mb-2">
              {selectedItems.size} colaborador{selectedItems.size !== 1 ? "es" : ""} afetado{selectedItems.size !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {selecionados.map(row => {
                const n = getCollaboratorName(row.collaboratorId);
                return (
                  <div key={row.actual.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-2xs font-semibold ${avatarColor(n)}`}>
                    {initials(n)} <span className="opacity-90">{n}</span>
                  </div>
                );
              })}
            </div>
            {/* Totais do conjunto selecionado */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/70">
              <div>
                <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold">Planejado</p>
                <p className="text-sm font-semibold text-primary tabular-nums">{fmt(selectedTotals.planned)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold">Realizado</p>
                <p className="text-sm font-semibold text-primary tabular-nums">{fmt(selectedTotals.actual)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold">Diferença</p>
                <p className={`text-sm font-semibold tabular-nums ${selectedTotals.diff > 0 ? "text-danger" : selectedTotals.diff < 0 ? "text-success" : "text-muted-foreground"}`}>
                  {selectedTotals.diff > 0 ? "+" : selectedTotals.diff < 0 ? "−" : ""}{fmt(Math.abs(selectedTotals.diff))}
                </p>
              </div>
            </div>
          </div>

          {/* Comment field — o comentário é aplicado a todos os itens selecionados.
              Manual do Financeiro: obrigatório ao devolver/recusar; opcional só no aprovar */}
          <div>
            <label className="text-sm font-medium text-slate-700">
              {actionModal?.type === "approve" ? (
                <>
                  Comentário{" "}
                  <span className="text-muted-foreground font-normal">
                    (opcional{selectedItems.size > 1 ? ` — será aplicado a todos os ${selectedItems.size} colaboradores selecionados` : ""})
                  </span>
                </>
              ) : (
                <>
                  Observação<RequiredMark />{" "}
                  <span className="text-muted-foreground font-normal">
                    (obrigatória{selectedItems.size > 1 ? ` — será aplicada a todos os ${selectedItems.size} colaboradores selecionados` : ""})
                  </span>
                </>
              )}
            </label>
            <Textarea
              className={`mt-1.5 rounded-xl text-sm resize-none ${actionNoteError && actionModal?.type !== "approve" && !actionNote.trim() ? "border-danger-strong focus-visible:ring-danger/25" : ""}`}
              value={actionNote}
              onChange={e => { setActionNote(e.target.value); if (e.target.value.trim()) setActionNoteError(false); }}
              aria-required={actionModal?.type !== "approve"}
              placeholder={
                actionModal?.type === "approve"
                  ? "Adicionar um comentário…"
                  : actionModal?.type === "reject"
                  ? "Escreva o motivo da recusa (obrigatório)..."
                  : "Descreva o que precisa ser corrigido (obrigatório)..."
              }
              rows={3}
              autoFocus={actionModal?.type !== "approve"}
            />
            {actionNoteError && actionModal?.type !== "approve" && !actionNote.trim() && (
              <p className="text-2xs text-danger font-medium mt-1.5">
                A observação é obrigatória ao {actionModal?.type === "reject" ? "recusar" : "devolver"} — o responsável de função a receberá na tela do Realizado.
              </p>
            )}
            {actionModal?.type !== "approve" && actionNote.trim() && (
              <p className="text-2xs text-muted-foreground mt-1.5 italic">
                Esta observação ficará visível para o(s) colaborador(es) no card de prestação.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 mt-1">
          <Button variant="ghost" className="rounded-xl" onClick={fecharActionModal}>Cancelar</Button>
          <Button
            onClick={handleAction}
            disabled={rhActionMutation.isPending}
            className={`rounded-xl ${
              actionModal?.type === "approve" ? "bg-success hover:bg-success/90" :
              actionModal?.type === "reject" ? "bg-danger hover:bg-danger/90" :
              "bg-warning hover:bg-warning/90"
            } text-white shadow-1`}
          >
            {rhActionMutation.isPending ? "Processando…" :
             actionModal?.type === "approve" ? "Confirmar aprovação" :
             actionModal?.type === "reject" ? "Confirmar recusa" : "Devolver para ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Modal confirmação de aprovação com ajustes. */
export function ConfirmAdjustDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl p-6 gap-4">
        <DialogTitle className="sr-only">Aprovação com ajustes</DialogTitle>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning-soft flex items-center justify-center shrink-0">
              <span className="text-lg">⚠</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Aprovação com ajustes</h3>
              <p className="text-2xs text-muted-foreground mt-0.5">Revise antes de confirmar</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Você está aprovando itens com valores ajustados pelo RH em relação ao realizado do colaborador.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-9 text-sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-xl h-9 text-sm font-bold bg-success hover:bg-success/90 text-white"
              onClick={onConfirm}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Confirmar aprovação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
