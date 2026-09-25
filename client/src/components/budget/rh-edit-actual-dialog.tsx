/**
 * Modal "Editar Realizado — ajuste do RH" do Comparativo — 25/09
 * (modularização). Extraído de budget-comparison.tsx; o formulário (texto) e
 * o salvar (só campos alterados) vivem em `useComparisonActions`.
 */
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AcoesDoComparativo } from "@/hooks/use-budget-comparison-actions";

const ALIM_FIELDS = [
  { key: "weekdayLunch", label: "Almoço (Sem.)" },
  { key: "weekdayDinner", label: "Jantar (Sem.)" },
  { key: "weekendLunch", label: "Almoço (FdS)" },
  { key: "weekendDinner", label: "Jantar (FdS)" },
];

export function RhEditActualDialog({ acoes }: { acoes: AcoesDoComparativo }) {
  const { editingActual, setEditingActual, editForm, setEditForm, saveEditModal, patchActualMutation } = acoes;
  return (
    <Dialog open={!!editingActual} onOpenChange={(open) => { if (!open) setEditingActual(null); }}>
      <DialogContent style={{ maxHeight: "90vh", maxWidth: "480px" }} className="rounded-xl p-0 gap-0 flex flex-col">
        <DialogTitle className="sr-only">Editar Realizado — ajuste do RH</DialogTitle>
        {editingActual && (
          <>
            <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-warning-soft flex items-center justify-center shrink-0">
                  <Pencil className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Editar Realizado</h3>
                  <p className="text-2xs text-warning font-medium">Ajuste do RH — ficará registrado no histórico</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
              {/* Diárias */}
              <div className="rounded-xl border border-primary/25 bg-brand-soft/40 p-4 space-y-3">
                <span className="text-2xs font-bold uppercase tracking-widest text-primary">Diárias</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs text-muted-foreground font-medium block mb-1">Quantidade</label>
                    <Input
                      type="number" min={0}
                      value={editForm.dailyQuantity}
                      onChange={e => setEditForm(f => ({ ...f, dailyQuantity: e.target.value }))}
                      className="h-8 text-sm text-right tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-2xs text-muted-foreground font-medium block mb-1">Valor/dia (R$)</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={editForm.dailyValue}
                      onChange={e => setEditForm(f => ({ ...f, dailyValue: e.target.value }))}
                      onFocus={e => e.target.select()}
                      className="h-8 text-sm text-right tabular-nums"
                    />
                  </div>
                </div>
              </div>
              {/* Alimentação */}
              <div className="rounded-xl border border-warning/25 bg-warning-soft/40 p-4 space-y-3">
                <span className="text-2xs font-bold uppercase tracking-widest text-warning">Alimentação</span>
                <div className="grid grid-cols-2 gap-3">
                  {ALIM_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-2xs text-muted-foreground font-medium block mb-1">{label}</label>
                      <Input
                        type="text" inputMode="decimal"
                        value={editForm[key]}
                        onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                        onFocus={e => e.target.select()}
                        className="h-8 text-sm text-right tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {/* Mobilidade */}
              <div className="rounded-xl border border-primary/25 bg-brand-soft/40 p-4 space-y-3">
                <span className="text-2xs font-bold uppercase tracking-widest text-primary">Mobilidade</span>
                <div>
                  <label className="text-2xs text-muted-foreground font-medium block mb-1">Total (R$)</label>
                  <Input
                    type="text" inputMode="decimal"
                    value={editForm.mobility}
                    onChange={e => setEditForm(f => ({ ...f, mobility: e.target.value }))}
                    onFocus={e => e.target.select()}
                    className="h-8 text-sm text-right tabular-nums"
                  />
                </div>
              </div>
              {/* Observação do ajuste */}
              <div className="rounded-xl border border-border bg-surface-muted/60 p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Observação do Ajuste</span>
                  <span className="text-2xs text-muted-foreground">(opcional)</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Descreva o motivo do ajuste nos valores…"
                  value={editForm.rhAdjustNote || ""}
                  onChange={e => setEditForm(f => ({ ...f, rhAdjustNote: e.target.value }))}
                  className="w-full text-sm text-slate-700 border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong bg-card placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
              <Button variant="outline" className="flex-1 rounded-xl h-9 text-sm" onClick={() => setEditingActual(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-xl h-9 text-sm font-bold bg-warning-strong hover:bg-warning/90 text-white"
                onClick={saveEditModal}
                disabled={patchActualMutation.isPending}
              >
                {patchActualMutation.isPending ? "Salvando…" : "Salvar ajuste"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RhEditActualDialog;
