/**
 * Grade de diárias em lote (25/09 — extraída da tabela). Radix Dialog: Esc,
 * foco preso, aria; linhas com dias alterados ficam em azul.
 */
import { LayoutGrid, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fixEncoding } from "@/lib/utils";
import { DayButtons } from "./day-buttons";
import { generateDaysInRange, normDay } from "./inclusion-shared";
import type { BulkDays } from "./use-bulk-days";
import type { TeamInclusionData } from "./use-team-inclusion-data";

export function BulkDaysDialog({ bulk, getCollaboratorName, getFunctionName }: {
  bulk: BulkDays;
  getCollaboratorName: TeamInclusionData["getCollaboratorName"];
  getFunctionName: TeamInclusionData["getFunctionName"];
}) {
  const { showBatchDiarias, fechar, targets, batchDiariasSelections, toggleBatchDay, setDays, handleSaveBatchDiarias, isPending, descarteLote } = bulk;
  return (
    <>
      <Dialog open={showBatchDiarias} onOpenChange={(v) => { if (!v) descarteLote.pedirParaFechar(fechar); }}>
      {showBatchDiarias && (
            <DialogContent className="max-w-5xl flex flex-col max-h-[90vh] rounded-xl p-0 gap-0">

              {/* Header */}
              <DialogHeader className="flex flex-row items-center gap-2.5 space-y-0 px-6 py-4 pr-12 border-b border-border shrink-0 text-left">
                  <div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                    <LayoutGrid className="w-4 h-4 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <DialogTitle className="text-sm font-bold text-foreground leading-tight">Edição de diárias em lote</DialogTitle>
                    <DialogDescription className="text-2xs text-muted-foreground mt-0.5">
                      {targets.length} inclusão(ões) — selecione os dias de cada uma; a quantidade será calculada automaticamente
                    </DialogDescription>
                  </div>
              </DialogHeader>

              {/* Rows */}
              <div className="overflow-y-auto flex-1 divide-y divide-border">
                {targets.map((inc, idx) => {
                  const selectedDays = batchDiariasSelections[inc.id] ?? [];
                  const start = normDay(inc.scheduleStartDate);
                  const end = normDay(inc.scheduleEndDate);
                  const allDays = generateDaysInRange(start, end);
                  const origDays = (inc.workDays || []).map(normDay).filter(Boolean).sort();
                  const newDays = [...selectedDays].sort();
                  const changed = newDays.join(',') !== origDays.join(',') || newDays.length !== (inc.dailyRates ?? 0);

                  return (
                    <div
                      key={inc.id}
                      className={`px-6 py-4 transition-colors ${changed ? 'bg-brand-soft/50' : idx % 2 === 1 ? 'bg-surface-muted/30' : 'bg-card'}`}
                    >
                      {/* Info row */}
                      <div className="flex items-center gap-4 mb-3">
                        <span className="text-2xs font-mono text-muted-foreground w-10 shrink-0">#{inc.inclusionNumber ?? '—'}</span>
                        <span className="text-xs font-semibold text-foreground w-40 shrink-0 truncate">
                          {inc.collaboratorId
                            ? fixEncoding(getCollaboratorName(inc.collaboratorId))
                            : <span className="text-muted-foreground italic font-normal">Não escalado</span>}
                        </span>
                        <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{getFunctionName(inc.functionId)}</span>
                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                          <span className={`text-2xs font-bold px-2.5 py-0.5 rounded-full ${changed ? 'bg-primary text-primary-foreground' : 'bg-muted text-slate-600'}`}>
                            {selectedDays.length} dia{selectedDays.length !== 1 ? 's' : ''}
                          </span>
                          {allDays.length > 0 && (
                            <>
                              <button type="button" onClick={() => setDays(inc.id, allDays)} className="text-2xs text-muted-foreground hover:text-primary-hover underline">todos</button>
                              <button type="button" onClick={() => setDays(inc.id, [])} className="text-2xs text-muted-foreground hover:text-danger-strong underline">nenhum</button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Day picker */}
                      {allDays.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 ml-14">
                          <DayButtons allDays={allDays} isSelected={(d) => selectedDays.includes(d)} onToggle={(d) => toggleBatchDay(inc.id, d)} />
                        </div>
                      ) : (
                        <p className="ml-14 text-2xs text-muted-foreground italic">Sem período definido nesta inclusão</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
                <p className="text-2xs text-muted-foreground">
                  Linhas em <span className="text-primary font-semibold">azul</span> têm dias alterados. Status das escalações não será modificado.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => descarteLote.pedirParaFechar(fechar)} className="rounded-xl px-5">
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleSaveBatchDiarias} disabled={isPending} aria-busy={isPending} className="rounded-xl px-5 font-semibold shadow-1">
                    {isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
                    {isPending ? 'Salvando…' : 'Salvar alterações'}
                  </Button>
                </div>
              </div>

            </DialogContent>
      )}
      </Dialog>
      {descarteLote.Dialogo}
    </>
  );
}
