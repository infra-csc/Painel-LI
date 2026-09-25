/**
 * Modal de edição de uma inclusão (25/09 — extraído da tabela). Radix Dialog
 * (Esc, foco preso, aria) com proteção de descarte; formulário não controlado.
 */
import { Edit, Loader2 } from "lucide-react";
import type { Function } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPorChaveBadge } from "@/components/common/status-badge";
import { RequiredMark } from "@/components/forms/required-mark";
import { DayButtons } from "./day-buttons";
import { generateDaysInRange, getDisplayStatus } from "./inclusion-shared";
import type { EditInclusion } from "./use-edit-inclusion";

const FIELD = "border border-border rounded-xl bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/25 focus:border-primary w-full transition-all";
const LABEL = "block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1";
const TRAVEL_FIELD = "border border-border rounded-lg bg-card px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-primary/25";
const TRAVEL_LABEL = "block text-2xs uppercase tracking-wider text-muted-foreground mb-1";

export function EditInclusionDialog({ edit, functions }: { edit: EditInclusion; functions: Function[] | undefined }) {
  const {
    showEditModal, editingInclusion, editStartDate, editEndDate, editSelectedDays, setEditDirty,
    fecharEdicao, changeStartDate, changeEndDate, selectAllDays, selectNoDays, toggleDay, submit, isPending, descarteEdicao,
  } = edit;
  const allDays = editStartDate && editEndDate ? generateDaysInRange(editStartDate, editEndDate) : [];
  const selectedCount = allDays.filter(d => editSelectedDays.has(d)).length;
  return (
    <>
      <Dialog open={showEditModal && !!editingInclusion} onOpenChange={(v) => { if (!v) descarteEdicao.pedirParaFechar(fecharEdicao); }}>
        {editingInclusion && (
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl p-6 gap-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (document.getElementById("edit-function-id") as HTMLSelectElement | null)?.focus();
          }}
        >
            {/* Header */}
            <DialogHeader className="-mx-6 -mt-6 px-6 py-4 rounded-t-xl mb-6 flex flex-row items-center gap-3 space-y-0 bg-surface-muted border-b-2 border-border text-left">
              <div className="w-9 h-9 rounded-lg bg-primary shadow-2 flex items-center justify-center shrink-0">
                <Edit className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground leading-tight">Editar inclusão</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">Inclusão #{editingInclusion.inclusionNumber}</DialogDescription>
              </div>
            </DialogHeader>

            <form onChange={() => setEditDirty(true)} onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
              <div className="grid grid-cols-2 gap-6">
                {/* Coluna Esquerda */}
                <div className="space-y-4">
                  <div>
                    <label htmlFor="edit-function-id" className={LABEL}>Função<RequiredMark /></label>
                    <select id="edit-function-id" name="functionId" defaultValue={editingInclusion.functionId} className={FIELD} required>
                      {functions?.map((func) => (
                        <option key={func.id} value={func.id}>{func.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    {/* Somente leitura (23/09): o status é decidido pelo fluxo
                        (escalação, gestor, compras) — o select antigo não tinha
                        planejado/aprovado/escalacao e gravava "incluido". */}
                    <span className={LABEL}>Status</span>
                    <div className="flex items-center min-h-[42px]" data-testid="edit-status-readonly">
                      <StatusPorChaveBadge status={getDisplayStatus(editingInclusion)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="edit-start-date" className={LABEL}>Data de início<RequiredMark /></label>
                      <input id="edit-start-date" type="date" value={editStartDate} onChange={(e) => changeStartDate(e.target.value)} className={FIELD} required />
                    </div>
                    <div>
                      <label htmlFor="edit-end-date" className={LABEL}>Data de fim<RequiredMark /></label>
                      <input id="edit-end-date" type="date" value={editEndDate} onChange={(e) => changeEndDate(e.target.value)} className={FIELD} required />
                    </div>
                  </div>
                  {editStartDate && editEndDate && editEndDate < editStartDate && (
                    <p className="text-2xs font-semibold text-danger-strong -mt-2">
                      A data de fim não pode ser anterior à data de início.
                    </p>
                  )}

                  {/* Seletor de dias individuais */}
                  {allDays.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Dias trabalhados
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-primary bg-brand-soft rounded-lg px-2 py-0.5">{selectedCount} dia{selectedCount !== 1 ? 's' : ''}</span>
                          <button type="button" onClick={() => selectAllDays(allDays)}
                            className="text-2xs text-muted-foreground hover:text-primary-hover underline">todos</button>
                          <button type="button" onClick={selectNoDays}
                            className="text-2xs text-muted-foreground hover:text-danger-strong underline">nenhum</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <DayButtons allDays={allDays} isSelected={(d) => editSelectedDays.has(d)} onToggle={toggleDay} ariaPressed />
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="edit-needs-ticket" className={LABEL}>Precisa de Passagem?</label>
                    <select id="edit-needs-ticket" name="needsTicket" defaultValue={editingInclusion.needsTicket ? 'true' : 'false'} className={FIELD}>
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="edit-needs-accommodation" className={LABEL}>Precisa de Hospedagem?</label>
                    <select id="edit-needs-accommodation" name="needsAccommodation" defaultValue={editingInclusion.needsAccommodation ? 'true' : 'false'} className={FIELD}>
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>
                </div>

                {/* Coluna Direita - Sugestões de Viagem */}
                <div>
                  <div className="bg-brand-soft border border-primary/25 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-primary flex items-center gap-2 mb-1">
                      ✈️ Sugestões de Viagem
                    </h4>
                    <p className="text-xs text-primary/70 mb-4">Essas informações aparecerão como sugestões na tela de escalação</p>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Card IDA */}
                      <div className="bg-card rounded-xl border border-primary/25 p-3 shadow-1">
                        <p className="text-2xs font-bold uppercase tracking-wider text-primary mb-2">IDA</p>
                        <div className="space-y-2">
                          <div>
                            <label className={TRAVEL_LABEL}>Dia</label>
                            <input type="date" name="ida" defaultValue={editingInclusion.flightDepartureDate || ''} className={TRAVEL_FIELD} />
                          </div>
                          <div>
                            <label className={TRAVEL_LABEL}>Horário</label>
                            <input type="text" name="chegada" defaultValue={editingInclusion.flightArrivalSuggestedTime || ''} placeholder="Ex: 9h, manhã" className={TRAVEL_FIELD} />
                          </div>
                        </div>
                      </div>

                      {/* Card RETORNO */}
                      <div className="bg-card rounded-xl border border-primary/25 p-3 shadow-1">
                        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground mb-2">RETORNO</p>
                        <div className="space-y-2">
                          <div>
                            <label className={TRAVEL_LABEL}>Dia</label>
                            <input type="date" name="retorno" defaultValue={editingInclusion.flightReturnDate || ''} className={TRAVEL_FIELD} />
                          </div>
                          <div>
                            <label className={TRAVEL_LABEL}>Horário</label>
                            <input type="text" name="horarioRetorno" defaultValue={editingInclusion.flightReturnSuggestedTime || ''} placeholder="Ex: 18h, final da tarde" className={TRAVEL_FIELD} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-brand-soft/60 rounded-lg px-3 py-2 text-xs text-primary mt-3 flex items-start gap-1.5">
                      <span className="font-semibold">Dica:</span>
                      <span>Use descrições claras como "sábado", "9h", "domingo", "18h" ou datas específicas</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rodapé */}
              <div className="border-t border-border pt-4 mt-4 flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => descarteEdicao.pedirParaFechar(fecharEdicao)} className="rounded-xl px-6">
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending} aria-busy={isPending} className="rounded-lg px-6 font-semibold shadow-1">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isPending ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              </div>
            </form>
        </DialogContent>
        )}
      </Dialog>
      {descarteEdicao.Dialogo}
    </>
  );
}
