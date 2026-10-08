/**
 * Modal "Ajustar o realizado" (ajuste do RH) do Comparativo — 25/09
 * (modularização); redesenho 08/10.
 *
 * Antes: três caixas tingidas (azul, âmbar, azul) com rótulos soltos (sem
 * ligação com o campo), o título sem dizer DE QUEM era o realizado e dois
 * botões de mesmo peso que ocupavam o rodapé inteiro.
 *
 * Agora: quem é no cabeçalho (opcional — a página passa os nomes), as três
 * categorias como seções do formulário com o ponto de cor da família, rótulos
 * ligados aos campos, números à direita, o total gravado de referência no
 * rodapé e "Salvar ajuste" como a ação forte. O formulário (texto) e o salvar
 * (só campos alterados) continuam em `useComparisonActions`.
 */
import { Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AcoesDoComparativo } from "@/hooks/use-budget-comparison-actions";
import { fmt } from "./comparison-utils";

const ALIM_FIELDS = [
  { key: "weekdayLunch", label: "Almoço (dias úteis)" },
  { key: "weekdayDinner", label: "Jantar (dias úteis)" },
  { key: "weekendLunch", label: "Almoço (fim de semana)" },
  { key: "weekendDinner", label: "Jantar (fim de semana)" },
];

function Secao({ titulo, cor, children }: { titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 p-0 border-0 min-w-0">
      <legend className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${cor}`} />{titulo}
      </legend>
      {children}
    </fieldset>
  );
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs text-muted-foreground mb-1">{rotulo}</label>
      {children}
    </div>
  );
}

const CAMPO = "h-9 rounded-lg text-sm text-right tabular-nums";

export function RhEditActualDialog({ acoes, getCollaboratorName, getFunctionName }: {
  acoes: AcoesDoComparativo;
  /** Opcionais (08/10): com eles o cabeçalho diz de quem é o realizado. */
  getCollaboratorName?: (id?: string | null) => string;
  getFunctionName?: (id?: string | null) => string;
}) {
  const { editingActual, setEditingActual, editForm, setEditForm, saveEditModal, patchActualMutation } = acoes;
  const salvando = patchActualMutation.isPending;
  return (
    <Dialog open={!!editingActual} onOpenChange={(open) => { if (!open) setEditingActual(null); }}>
      <DialogContent className="max-w-[500px] max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden" data-testid="dialogo-ajuste-rh">
        {editingActual ? (
          <>
            <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-start gap-3 pr-6">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-warning-soft text-warning shrink-0" aria-hidden="true">
                  <PencilLine className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold leading-6">
                    Ajustar o realizado
                    {getCollaboratorName && <span className="font-normal text-muted-foreground"> · {getCollaboratorName(editingActual.collaboratorId)}</span>}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-sm text-slate-600">
                    {getFunctionName ? `${getFunctionName(editingActual.functionId)} · ` : ""}Ajuste do RH — fica registrado no histórico da prestação.
                  </DialogDescription>
                </div>
              </div>
            </div>

            <form
              id="form-ajuste-rh"
              className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5"
              onSubmit={(e) => { e.preventDefault(); if (!salvando) saveEditModal(); }}
            >
              <Secao titulo="Diárias" cor="bg-primary">
                <div className="grid grid-cols-2 gap-3">
                  <Campo id="aj-qtd" rotulo="Quantidade">
                    <Input id="aj-qtd" type="number" min={0} value={editForm.dailyQuantity}
                      onChange={e => setEditForm(f => ({ ...f, dailyQuantity: e.target.value }))} className={CAMPO} />
                  </Campo>
                  <Campo id="aj-valor-dia" rotulo="Valor por dia (R$)">
                    <Input id="aj-valor-dia" type="text" inputMode="decimal" value={editForm.dailyValue}
                      onChange={e => setEditForm(f => ({ ...f, dailyValue: e.target.value }))} onFocus={e => e.target.select()} className={CAMPO} />
                  </Campo>
                </div>
              </Secao>

              <Secao titulo="Alimentação" cor="bg-warning-strong">
                <div className="grid grid-cols-2 gap-3">
                  {ALIM_FIELDS.map(({ key, label }) => (
                    <Campo key={key} id={`aj-${key}`} rotulo={`${label} (R$)`}>
                      <Input id={`aj-${key}`} type="text" inputMode="decimal" value={editForm[key]}
                        onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} onFocus={e => e.target.select()} className={CAMPO} />
                    </Campo>
                  ))}
                </div>
              </Secao>

              <Secao titulo="Mobilidade" cor="bg-slate-400">
                <div className="grid grid-cols-2 gap-3">
                  <Campo id="aj-mob" rotulo="Total (R$)">
                    <Input id="aj-mob" type="text" inputMode="decimal" value={editForm.mobility}
                      onChange={e => setEditForm(f => ({ ...f, mobility: e.target.value }))} onFocus={e => e.target.select()} className={CAMPO} />
                  </Campo>
                </div>
              </Secao>

              <div>
                <label htmlFor="aj-obs" className="block text-sm font-medium text-foreground">
                  Observação do ajuste <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Textarea
                  id="aj-obs"
                  rows={3}
                  placeholder="Descreva o motivo do ajuste nos valores…"
                  value={editForm.rhAdjustNote || ""}
                  onChange={e => setEditForm(f => ({ ...f, rhAdjustNote: e.target.value }))}
                  className="mt-1.5 rounded-lg text-sm resize-none"
                />
              </div>
            </form>

            <DialogFooter className="px-6 py-3.5 border-t border-border bg-surface-muted/40 shrink-0 flex-row items-center gap-2 sm:justify-between">
              <p className="m-0 mr-auto text-xs text-muted-foreground tabular-nums max-[420px]:hidden">
                Total gravado <span className="font-medium text-slate-700">{fmt(editingActual.totalValue)}</span>
              </p>
              <div className="flex items-center gap-2 max-[420px]:w-full max-[420px]:[&>*]:flex-1">
                <Button type="button" variant="outline" className="rounded-lg" onClick={() => setEditingActual(null)}>
                  Cancelar
                </Button>
                <Button type="submit" form="form-ajuste-rh" className="rounded-lg gap-1.5 bg-warning-strong hover:bg-warning text-white" disabled={salvando} data-testid="comparativo-salvar-ajuste">
                  {salvando && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {salvando ? "Salvando…" : "Salvar ajuste"}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : <DialogTitle className="sr-only">Ajustar o realizado</DialogTitle>}
      </DialogContent>
    </Dialog>
  );
}

export default RhEditActualDialog;
