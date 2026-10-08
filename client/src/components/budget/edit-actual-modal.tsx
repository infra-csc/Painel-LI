/**
 * Modal "Prestação de contas" do Realizado (casca) — 25/09 (modularização);
 * redesenho 08/10.
 *
 * Cabeçalho, avisos, abas e rodapé. A aba Custos vive em
 * `EditActualCustosTab`; o estado em `useBudgetActualEditor`.
 *
 * 08/10: a MESMA moldura do modal do Planejado — cabeçalho branco (iniciais,
 * nome, tipo, função · período, dias úteis/fds e os selos), abas sublinhadas
 * de verdade (tablist), corpo que rola e rodapé fixo numa faixa só: o total
 * realizado que será gravado, a diferença para o planejado, a conta por bloco
 * (com o planejado ao lado) e as ações. Tela cheia no celular. Fechar com
 * alterações pergunta antes de descartar (o mesmo diálogo do app inteiro).
 * Os cálculos abaixo são os mesmos.
 */
import { useRef } from "react";
import { Calendar, CheckCheck, Loader2, Lock, MessageSquareWarning, Sun, Briefcase, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ActivityTimeline, type ActivityLog } from "@/components/activity-timeline";
import { BudgetChat } from "@/components/budget-chat";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { isFuncaoLocal, isPercursoFunction } from "@shared/calculation-rules";
import type { BudgetActual, BudgetPlanned, TeamInclusion } from "@shared/schema";
import type { EditorDoRealizado } from "@/hooks/use-budget-actual-editor";
import { cn } from "@/lib/utils";
import { EditActualCustosTab } from "./edit-actual-custos-tab";
import { reconstructDailyValues, subtotalDiariasDe, type DayCounts } from "./actual-utils";
import { formatCurrency } from "./types";

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

/** Mesma moldura dos modais da família: rodapé fixo, corpo rola; tela cheia no celular. */
const MOLDURA = "!max-w-[700px] w-[95vw] max-h-[90vh] !flex !flex-col p-0 gap-0 overflow-hidden rounded-xl max-sm:w-full max-sm:!max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0";

const ddmmAno = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function EditActualModal(p: EditActualModalProps) {
  const { editor, budgetActual, plannedLogs, rhComment, getCollaboratorName, getFunctionName, getItemInclusion, getItemDayCounts, getPlannedRef, proportionalPlanned, isSaving, onSave } = p;
  const { editingItem, editFormData, editDayEntries, modalActualTab, setModalActualTab, fechar, fecharBotao } = editor;

  // Alterações não salvas: o que o salvar mandaria agora × o que mandaria ao
  // abrir (fotografado na primeira renderização de cada prestação).
  const fotoRef = useRef<{ id: string; payload: string } | null>(null);
  const payloadAtual = editingItem && editFormData && !editingItem.sentForReview
    ? JSON.stringify(editor.montarPayloadParaSalvar()?.data ?? null)
    : null;
  if (editingItem && payloadAtual !== null && fotoRef.current?.id !== editingItem.id) {
    fotoRef.current = { id: editingItem.id, payload: payloadAtual };
  }
  if (!editingItem && fotoRef.current) fotoRef.current = null;
  const sujo = !!editingItem && payloadAtual !== null && fotoRef.current?.id === editingItem.id && fotoRef.current.payload !== payloadAtual;
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(sujo, { salvando: isSaving });

  return (
    <>
    <Dialog open={!!editingItem && !!editFormData} onOpenChange={(v) => { if (!v) pedirParaFechar(fechar); }}>
      <DialogContent aria-describedby={undefined} className={MOLDURA}>
        {!(editingItem && editFormData) && <DialogTitle className="sr-only">Prestação de contas</DialogTitle>}

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
          const plannedAlim = planned ? planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner : 0;

          const mName = getCollaboratorName(editingItem.collaboratorId);
          const mInit = mName.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          const isCasa = editingItem.collaboratorType === "casa";
          const planejadoAlterado = !!editingItem.plannedId && plannedLogs.some(l => l.entity_id === editingItem.plannedId && l.action === "update");
          const comentarioRh = editingItem.rhStatus === "devolvido" ? (editingItem.rhComment || rhComment) : null;
          const periodo = itemDays.startDate && itemDays.endDate
            ? (itemDays.startDate === itemDays.endDate ? ddmmAno(itemDays.startDate) : `${ddmmAno(itemDays.startDate)} a ${ddmmAno(itemDays.endDate)}`)
            : itemDays.startDate ? ddmmAno(itemDays.startDate) : itemDays.endDate ? ddmmAno(itemDays.endDate) : null;

          // Linha do extrato do rodapé: realizado e, quando há referência, o planejado.
          const linhaRodape = (rotulo: string, real: number, plano: number | null) => (
            <>
              <dt>{rotulo}</dt>
              <dd className="m-0 text-right font-medium text-slate-700">{formatCurrency(real)}</dd>
              {planned && <dd className="m-0 text-right max-sm:hidden">{plano !== null ? formatCurrency(plano) : "—"}</dd>}
            </>
          );

          return (
            <>
              {/* ── Cabeçalho: de quem, quando — e o que já se sabe da prestação ── */}
              <div className="flex items-start gap-3.5 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card shrink-0">
                <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-brand-soft text-primary text-sm font-semibold" aria-hidden="true">
                  {mInit || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <DialogTitle className="m-0 p-0 text-base font-semibold leading-6 text-foreground truncate"><span className="sr-only">Prestação de contas de </span>{mName}</DialogTitle>
                    <span className={cn("inline-flex items-center h-5 px-1.5 rounded-md text-2xs font-medium", isCasa ? "bg-brand-soft text-primary" : "bg-muted text-slate-600")}>
                      {isCasa ? "Casa" : "Freela"}
                    </span>
                    {isReadOnly && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-2xs font-medium bg-muted text-slate-600">
                        <Lock className="w-3 h-3" aria-hidden="true" />Bloqueado
                      </span>
                    )}
                    {planejadoAlterado && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-2xs font-medium bg-warning-soft text-warning border border-warning/25">
                        <TriangleAlert className="w-3 h-3" aria-hidden="true" />Planejado alterado pelo RH
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">{modalFunctionName}</span>
                    {periodo && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums"><Calendar className="w-3 h-3" aria-hidden="true" />{periodo}</span>
                      </>
                    )}
                  </p>
                  <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1"><Briefcase className="w-3 h-3" aria-hidden="true" />{itemDays.weekdays}d úteis</span>
                    <span className="inline-flex items-center gap-1"><Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />{itemDays.weekends} fds</span>
                    {planned && (
                      <span className={cn("font-medium", !hasDivergence ? "text-success" : difference > 0 ? "text-danger" : "text-success")}>
                        {!hasDivergence ? "Dentro do planejado" : difference > 0 ? "Acima do planejado" : "Abaixo do planejado"}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Comentário do RH: apenas em itens efetivamente devolvidos — não em aprovados/pendentes */}
              {comentarioRh && (
                <div className="flex items-start gap-2.5 px-5 sm:px-6 py-2.5 bg-warning-soft border-b border-warning/25 shrink-0" role="note">
                  <MessageSquareWarning className="w-4 h-4 mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
                  <p className="m-0 text-xs leading-5 text-warning">
                    <span className="font-semibold">Devolvida pelo RH:</span> {comentarioRh}
                  </p>
                </div>
              )}

              {/* ── Somente leitura: diz por que nada se edita ── */}
              {isReadOnly && (
                <div className="flex items-center gap-2.5 px-5 sm:px-6 py-2 bg-surface-muted border-b border-border shrink-0">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <p className="m-0 text-xs text-slate-600">Valores enviados para revisão — somente leitura.</p>
                </div>
              )}

              {/* ── Abas ── */}
              <div role="tablist" aria-label="Seções da prestação" className="flex gap-1 pl-3 sm:pl-4 pr-4 border-b border-border bg-card shrink-0">
                {([
                  { id: "custos", label: "Custos" },
                  { id: "observacoes", label: "Observações" },
                  { id: "historico", label: "Histórico" },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={modalActualTab === id}
                    onClick={() => setModalActualTab(id)}
                    className={cn(
                      "relative -mb-px px-3 sm:px-4 py-2.5 border-b-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      modalActualTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
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
                <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
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
                <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
                  <ActivityTimeline entityType="budget_actual" entityId={editingItem.id} defaultOpen={true} />
                </div>
              )}

              {/* ── Rodapé fixo: o total que vai ser gravado, contra o planejado, e as ações ── */}
              <div className="shrink-0 px-5 sm:px-6 pt-3 pb-3 border-t border-border bg-surface-muted">
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-xs font-medium text-slate-600">{planned ? "Total realizado" : "Total da prestação"}</span>
                      {planned && (
                        difference === 0 ? (
                          <span className="inline-flex items-center h-5 px-1.5 rounded-md text-2xs font-semibold bg-muted text-slate-600">igual ao planejado</span>
                        ) : (
                          <span className={cn("pla-diferenca inline-flex items-center h-5 px-1.5 rounded-md text-2xs font-semibold tabular-nums", difference > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
                            {difference > 0 ? "▲" : "▼"} {formatCurrency(Math.abs(difference))} vs planejado
                          </span>
                        )
                      )}
                    </div>
                    <div className="text-[1.375rem] font-semibold leading-7 tracking-[-0.01em] tabular-nums text-primary" aria-live="polite">{formatCurrency(modalTotal)}</div>
                    {planned && <div className="text-xs text-muted-foreground tabular-nums">Planejado {formatCurrency(plannedTotal)}</div>}
                  </div>
                  {/* A conta do total, como um extrato miúdo à direita (com o planejado ao lado). */}
                  <dl className={cn("m-0 grid gap-x-3 text-2xs leading-4 tabular-nums text-muted-foreground", planned ? "grid-cols-[auto_auto] sm:grid-cols-[auto_auto_auto]" : "grid-cols-[auto_auto]")}>
                    {planned && (
                      <>
                        <span className="max-sm:hidden" aria-hidden="true" />
                        <span className="max-sm:hidden text-right text-[11px] font-semibold uppercase tracking-[0.04em]">Realizado</span>
                        <span className="max-sm:hidden text-right text-[11px] font-semibold uppercase tracking-[0.04em]">Planejado</span>
                      </>
                    )}
                    {linhaRodape("Diárias", subtotalDiariasRaw, planned ? plannedSubDiarias : null)}
                    {linhaRodape("Alimentação", totalAlimentacao, planned ? plannedAlim : null)}
                    {linhaRodape("Mobilidade", modalMobility, planned ? planned.mobility : null)}
                    {editingItem.transport > 0 && linhaRodape("Translado", editingItem.transport, planned ? planned.transport : null)}
                  </dl>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
                  {isReadOnly ? (
                    <Button variant="outline" className="h-9 px-4 rounded-lg text-sm font-medium" onClick={fecharBotao}>
                      Fechar
                    </Button>
                  ) : (
                    <>
                      {sujo && <span className="mr-auto text-xs text-muted-foreground">Alterações não salvas</span>}
                      <Button variant="outline" className="h-9 px-4 rounded-lg text-sm font-medium" disabled={isSaving} onClick={() => pedirParaFechar(fecharBotao)}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={onSave}
                        disabled={isSaving}
                        className="h-9 px-4 rounded-lg gap-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground"
                        data-testid="realizado-salvar-prestacao"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="w-4 h-4" aria-hidden="true" />}
                        {isSaving ? "Salvando…" : "Salvar prestação"}
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
    {DialogoDescarte}
    </>
  );
}

export default EditActualModal;
