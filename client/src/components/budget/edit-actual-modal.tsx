/**
 * Modal "Editar Prestação de Contas" do Realizado (casca) — 25/09
 * (modularização). Extraído de budget-actual.tsx: cabeçalho com planejado ×
 * realizado, banner somente-leitura, abas e rodapé. A aba Custos vive em
 * `EditActualCustosTab`; o estado em `useBudgetActualEditor`.
 */
import { AlertTriangle, Calendar, Check, CheckCircle2, Lock, TrendingDown, TrendingUp } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActivityTimeline, type ActivityLog } from "@/components/activity-timeline";
import { BudgetChat } from "@/components/budget-chat";
import { isFuncaoLocal, isPercursoFunction } from "@shared/calculation-rules";
import type { BudgetActual, BudgetPlanned, TeamInclusion } from "@shared/schema";
import type { EditorDoRealizado } from "@/hooks/use-budget-actual-editor";
import { EditActualCustosTab } from "./edit-actual-custos-tab";
import { reconstructDailyValues, subtotalDiariasDe, type DayCounts } from "./actual-utils";

const formatCurrency = formatarMoeda;

export interface EditActualModalProps {
  editor: EditorDoRealizado;
  budgetActual: BudgetActual[] | undefined;
  plannedLogs: ActivityLog[];
  /** Comentário geral do RH no comparativo (devolvido/rejeitado). */
  rhComment: string | null | undefined;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  getItemInclusion: (item: BudgetActual) => TeamInclusion | undefined;
  getItemDayCounts: (item: BudgetActual) => DayCounts;
  getPlannedRef: (item: BudgetActual) => BudgetPlanned | undefined;
  proportionalPlanned: (item: BudgetActual, rawPlan: BudgetPlanned) => BudgetPlanned;
  isSaving: boolean;
  onSave: () => void;
}

const ddmm = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function EditActualModal(p: EditActualModalProps) {
  const { editor, budgetActual, plannedLogs, rhComment, getCollaboratorName, getFunctionName, getItemInclusion, getItemDayCounts, getPlannedRef, proportionalPlanned, isSaving, onSave } = p;
  const { editingItem, editFormData, editDayEntries, modalActualTab, setModalActualTab, fechar, fecharBotao } = editor;

  return (
    <Dialog open={!!editingItem && !!editFormData} onOpenChange={fechar}>
      <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden shadow-3 border border-black/6 flex flex-col" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="sr-only">
          <DialogTitle>Editar Prestação de Contas</DialogTitle>
        </DialogHeader>

        {editingItem && editFormData && (() => {
          const isReadOnly = !!editingItem.sentForReview;
          const itemDays = getItemDayCounts(editingItem);
          const activeDayEntries = editDayEntries.filter(d => d.active);
          const subtotalDiariasRaw = activeDayEntries.reduce((sum, d) => sum + d.valueCents, 0);
          const modalMobility = editFormData.mobilityIda + editFormData.mobilityVolta;
          // Inclui transport para o total exibido bater com o totalValue gravado pelo saveEdit
          const modalTotalRaw = subtotalDiariasRaw + modalMobility + editFormData.weekdayLunch + editFormData.weekdayDinner +
            editFormData.weekendLunch + editFormData.weekendDinner + editingItem.transport;
          const modalTotal = Math.abs(modalTotalRaw - editingItem.totalValue) <= 1 ? editingItem.totalValue : modalTotalRaw;
          const totalAlimentacao = editFormData.weekdayLunch + editFormData.weekdayDinner + editFormData.weekendLunch + editFormData.weekendDinner;
          // ── Viagem / alimentação ────────────────────────────────────────
          const modalInclusion = getItemInclusion(editingItem);
          const modalFunctionName = getFunctionName(editingItem.functionId);
          const modalVoa = !!modalInclusion?.needsTicket;
          const modalPercurso = isPercursoFunction(modalFunctionName);
          const modalFuncaoLocal = isFuncaoLocal(modalFunctionName);
          const semAlimentacao = modalPercurso || modalFuncaoLocal;
          const rawPlannedModal = (() => {
            const own = getPlannedRef(editingItem);
            if (own) return own;
            // Split child: no planned for the new collaborator — fall back to parent's planned
            if (editingItem.splitParentId) {
              const parent = budgetActual?.find(a => a.id === editingItem.splitParentId);
              return parent ? getPlannedRef(parent) : undefined;
            }
            return undefined;
          })();
          // For split children: scale using real weekday/weekend counts from the group
          const planned = (() => {
            if (!rawPlannedModal) return undefined;
            if (!editingItem.splitParentId) return rawPlannedModal;
            return proportionalPlanned(editingItem, rawPlannedModal);
          })();
          const plannedSubDiarias = planned ? subtotalDiariasDe(planned) : 0;
          const { valorUtil: plannedValorUtil, valorFds: plannedValorFds } =
            reconstructDailyValues(plannedSubDiarias, itemDays.weekdays, itemDays.weekends);
          const plannedTotal = planned ? planned.totalValue : 0;
          const rawDifference = modalTotal - plannedTotal;
          const hasDivergence = planned && Math.abs(rawDifference) > 1;
          const difference = Math.abs(rawDifference) <= 1 ? 0 : rawDifference;

          const statusBadge = !planned ? null : !hasDivergence
            ? { label: "Dentro do planejado", bg: "bg-success-soft", text: "text-success", border: "border-success/25", icon: <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> }
            : difference > 0
              ? { label: "Acima do planejado", bg: "bg-danger-soft", text: "text-danger", border: "border-danger/25", icon: <TrendingUp className="w-3 h-3" aria-hidden="true" /> }
              : { label: "Abaixo do planejado", bg: "bg-warning-soft", text: "text-warning", border: "border-warning/25", icon: <TrendingDown className="w-3 h-3" aria-hidden="true" /> };

          const mName = getCollaboratorName(editingItem.collaboratorId);
          const mInit = mName.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

          return (
            <>
              {/* ── Header ── */}
              <div className="shrink-0 bg-primary-hover">
                <div className="flex items-center gap-3 py-3.5 px-5">
                  <div className="rounded-lg bg-card/20 border border-white/30 flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38 }}>
                    <span className="text-white text-sm font-bold">{mInit || "?"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-white truncate leading-tight text-base">{getCollaboratorName(editingItem.collaboratorId)}</h2>
                    <p className="text-2xs text-white/70">{getFunctionName(editingItem.functionId)}</p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className={`inline-flex items-center text-2xs font-bold px-2 rounded-md ${editingItem.collaboratorType === "casa" ? "bg-primary/30 text-primary-foreground/80" : "bg-warning-strong/30 text-warning-soft"}`} style={{ height: 20 }}>
                        {editingItem.collaboratorType === "casa" ? "Casa" : "Freela"}
                      </span>
                      {(itemDays.startDate || itemDays.endDate) && (
                        <span className="inline-flex items-center gap-1 text-2xs text-white/70" style={{ height: 20 }}>
                          <Calendar className="w-3 h-3" aria-hidden="true" />
                          {itemDays.startDate && itemDays.endDate
                            ? `${ddmm(itemDays.startDate)} → ${ddmm(itemDays.endDate)}`
                            : itemDays.startDate
                              ? ddmm(itemDays.startDate)
                              : ddmm(itemDays.endDate!)
                          }
                        </span>
                      )}
                      {itemDays.weekdays > 0 && (
                        <span className="inline-flex items-center text-2xs px-2 rounded-md bg-card/12 text-white/85" style={{ height: 20 }}>
                          {itemDays.weekdays}d úteis{itemDays.weekends > 0 ? ` · ${itemDays.weekends} fds` : ""}
                        </span>
                      )}
                      {isReadOnly && (
                        <span className="inline-flex items-center text-2xs px-2 rounded-md bg-card/15 text-white gap-1" style={{ height: 20 }}>
                          <Lock className="w-2.5 h-2.5" aria-hidden="true" /> Bloqueado
                        </span>
                      )}
                      {editingItem.plannedId && plannedLogs.some(l => l.entity_id === editingItem.plannedId && l.action === "update") && (
                        <span className="inline-flex items-center text-2xs px-2 rounded-md bg-warning-strong/25 text-warning-soft border border-warning/30 gap-1 font-semibold" style={{ height: 20 }}>
                          ⚠️ Planejado alterado pelo RH
                        </span>
                      )}
                    </div>
                  </div>
                  {planned && statusBadge && (
                    <div className="flex items-center gap-1 px-2 rounded-lg text-2xs font-semibold border flex-shrink-0 mr-6 bg-transparent text-white/90 border-white/35" style={{ height: 22 }}>
                      {statusBadge.icon}
                      {statusBadge.label}
                    </div>
                  )}
                </div>
                {/* Comentário do RH: apenas em itens efetivamente devolvidos — não em aprovados/pendentes */}
                {editingItem.rhStatus === "devolvido" && (editingItem.rhComment || rhComment) && (
                  <div className="mt-2.5 p-2 rounded-xl bg-card/10 border border-white/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning-soft mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div>
                        <span className="text-2xs uppercase text-warning-soft font-bold tracking-wider">Comentário do RH</span>
                        <p className="text-2xs text-white/80 mt-0.5">{editingItem.rhComment || rhComment}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Read-only banner ── */}
              {isReadOnly && (
                <div className="flex items-center gap-2.5 px-5 py-2 bg-warning-soft border-b border-warning/25 shrink-0">
                  <Lock className="w-3.5 h-3.5 text-warning-strong flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs font-medium text-warning">Valores enviados para revisão — somente leitura</span>
                </div>
              )}

              {/* ── Barra de Abas ── */}
              <div className="flex border-b border-border bg-card shrink-0">
                {([
                  { id: "custos", label: "Custos" },
                  { id: "observacoes", label: "Observações" },
                  { id: "historico", label: "Histórico" },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setModalActualTab(id)}
                    className={[
                      "flex-1 h-10 text-sm font-medium transition-colors",
                      modalActualTab === id
                        ? "text-primary border-b-2 border-primary bg-brand-soft/40"
                        : "text-muted-foreground hover:text-slate-700 hover:bg-surface-muted",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Aba: Custos ── */}
              {modalActualTab === "custos" && (
                <EditActualCustosTab
                  editor={editor}
                  editingItem={editingItem}
                  editFormData={editFormData}
                  isReadOnly={isReadOnly}
                  planned={planned}
                  plannedValorUtil={plannedValorUtil}
                  plannedValorFds={plannedValorFds}
                  plannedSubDiarias={plannedSubDiarias}
                  subtotalDiariasRaw={subtotalDiariasRaw}
                  modalMobility={modalMobility}
                  totalAlimentacao={totalAlimentacao}
                  modalVoa={modalVoa}
                  modalFuncaoLocal={modalFuncaoLocal}
                  semAlimentacao={semAlimentacao}
                />
              )}

              {/* ── Aba: Observações ── */}
              {modalActualTab === "observacoes" && (
                <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted/40" style={{ maxHeight: "52vh" }}>
                  <BudgetChat
                    entityType="actual"
                    entityId={editingItem.id}
                    linkedEntityType={editingItem.plannedId ? "planned" : undefined}
                    linkedEntityId={editingItem.plannedId || undefined}
                  />
                </div>
              )}

              {/* ── Aba: Histórico ── */}
              {modalActualTab === "historico" && (
                <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted/40" style={{ maxHeight: "52vh" }}>
                  <ActivityTimeline entityType="budget_actual" entityId={editingItem.id} defaultOpen={true} />
                </div>
              )}

              {/* ── Footer ── */}
              <div className="border-t border-border bg-card shrink-0">
                {/* Linha Planejado / Realizado / Diferença */}
                <div className="flex items-center divide-x divide-border" style={{ height: 52 }}>
                  {planned ? (
                    <>
                      <div className="flex-1 flex flex-col items-center justify-center px-3">
                        <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider">Planejado</span>
                        <span className="text-base font-bold text-slate-600 tabular-nums">{formatCurrency(plannedTotal)}</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center px-3">
                        <span className="text-2xs uppercase font-semibold tracking-wider text-primary">Realizado</span>
                        <span className="text-base font-bold tabular-nums text-primary">{formatCurrency(modalTotal)}</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center px-3">
                        <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider">Diferença</span>
                        {Math.abs(difference) <= 1 ? (
                          <span className="text-base font-bold text-muted-foreground">—</span>
                        ) : (
                          <span className={`text-base font-bold tabular-nums ${difference > 0 ? "text-danger" : "text-success"}`}>
                            {difference > 0 ? "▲ " : "▼ "}{formatCurrency(Math.abs(difference))}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center px-3">
                      <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider">Total da prestação</span>
                      <span className="text-base font-bold tabular-nums text-primary">{formatCurrency(modalTotal)}</span>
                    </div>
                  )}
                </div>
                {/* Botões */}
                <div className="px-5 pb-4 flex items-center justify-end gap-3">
                  {isReadOnly ? (
                    <Button variant="ghost" className="h-10 px-6 text-sm rounded-xl text-slate-600 hover:text-foreground hover:bg-muted" onClick={fecharBotao}>
                      Fechar
                    </Button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-sm text-muted-foreground hover:text-slate-600 transition-colors px-2"
                        onClick={fecharBotao}
                      >
                        Cancelar
                      </button>
                      <Button
                        onClick={onSave}
                        disabled={isSaving}
                        className="h-10 px-5 text-sm font-semibold rounded-xl text-white shadow-1 bg-primary-hover"
                      >
                        <Check className="w-4 h-4 mr-1.5" aria-hidden="true" />
                        {isSaving ? "Salvando…" : "Salvar Prestação"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}

export default EditActualModal;
