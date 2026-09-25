/**
 * Modal de edição do orçamento PLANEJADO (casca) — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx: cabeçalho, banner de visualização, abas
 * (Custos / Observações / Histórico) e rodapé com total e botões. A aba Custos
 * vive em `EditModalCustosTab`; estado e ações em `useBudgetEditModal`.
 */
import { Briefcase, Calendar, CheckCheck, Eye, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActivityTimeline } from "@/components/activity-timeline";
import { BudgetChat } from "@/components/budget-chat";
import { calcDeflatedDailies, deflationFactorsFromSettings, type DeflationSegment } from "@shared/calculation-rules";
import type { ControladorDoModalDeEdicao } from "@/hooks/use-budget-edit-modal";
import { EditModalCustosTab } from "./edit-modal-custos-tab";
import { formatCurrency, type BudgetEdit } from "./types";

export interface BudgetEditModalProps {
  ctrl: ControladorDoModalDeEdicao;
}

export function BudgetEditModal({ ctrl }: BudgetEditModalProps) {
  const {
    editingBudget, editingBudgetInfo, editingBudgetPlannedId, pendingAtendimentoTipo, pendingPercurseiroTipo, savingTipo,
    modalTab, setModalTab, modalViewMode, originalModalTotal, originalModalValues, defaultBudgetValues,
    setEditingBudget, setModalBufs, fecharModalEdicao, pedirFecharEdicao, saveEdit, systemSettings, selectedEventId,
  } = ctrl;

  return (
    <Dialog open={!!editingBudget} onOpenChange={v => { if (!v) pedirFecharEdicao(fecharModalEdicao); }}>
      <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden border-0 shadow-3 flex flex-col" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="sr-only">
          <DialogTitle>Editar Orçamento Planejado</DialogTitle>
        </DialogHeader>

        {editingBudget && editingBudgetInfo && (() => {
          const noWeekdays = editingBudgetInfo.weekdays === 0;
          const noWeekends = editingBudgetInfo.weekends === 0;
          // Dias que recebem diária (casa: só fds) — mesma regra do motor
          const diasDiariaModal = editingBudgetInfo.diasComDiaria;
          // Empreita cenotécnica: valor FECHADO da tabela, sem deflação. Só
          // deixa de valer se o usuário editar a diária à mão (override).
          const empreitaModal = editingBudgetInfo.cenoEmpreita ?? null;
          const empreitaEditadaModal = !!empreitaModal && !!defaultBudgetValues
            && editingBudget.valorDiaria !== defaultBudgetValues.valorDiaria;
          // Mesma conta do card: diária plana COM deflação por período
          const deflatedModal = editingBudgetInfo.isPercurso
            ? { totalCents: editingBudget.valorDiaria * diasDiariaModal, segments: [] as DeflationSegment[] } // pacote fechado: sem deflação
            : empreitaModal
            // Empreita: os dias são os da EMPREITA (`empreitaModal.dias`,
            // vindos de `diasEmpreita`) — o card usa os mesmos, senão o modal
            // mostraria um total e a linha do card outro.
            ? { totalCents: empreitaEditadaModal ? editingBudget.valorDiaria * empreitaModal.dias : empreitaModal.totalCents, segments: [] as DeflationSegment[] }
            : calcDeflatedDailies(editingBudget.valorDiaria, diasDiariaModal, deflationFactorsFromSettings(systemSettings));
          const totalDiarias = deflatedModal.totalCents;
          const effectiveAlmocoSemana = noWeekdays ? 0 : editingBudget.almocoSemana;
          const effectiveJantarSemana = noWeekdays ? 0 : editingBudget.jantarSemana;
          const effectiveAlmocoFds = noWeekends ? 0 : editingBudget.almocoFds;
          const effectiveJantarFds = noWeekends ? 0 : editingBudget.jantarFds;
          const modalTotal = totalDiarias +
            editingBudget.mobilidade + effectiveAlmocoSemana + effectiveJantarSemana +
            effectiveAlmocoFds + effectiveJantarFds;
          const totalAlimentacao = effectiveAlmocoSemana + effectiveJantarSemana + effectiveAlmocoFds + effectiveJantarFds;
          const diff = modalTotal - originalModalTotal;
          // Campo a campo: edições que se compensam no total também contam
          // Tipo (atendimento/percurseiro) escolhido e ainda não gravado também
          // é mudança: acende o Salvar mesmo com a diária mantida manualmente.
          const hasPendingTipo = pendingAtendimentoTipo != null || pendingPercurseiroTipo != null;
          const hasChanges = hasPendingTipo || (!!originalModalValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[])
            .some(k => editingBudget[k] !== originalModalValues![k]));
          // Difere do MOTOR ATUAL (override herdado ou edição da sessão) → habilita "Restaurar padrão"
          const differsFromDefault = !!defaultBudgetValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[])
            .some(k => k !== "inclusionId" && editingBudget[k] !== defaultBudgetValues![k]);
          const modalInitials = editingBudgetInfo.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

          const restoreDefaults = () => {
            if (defaultBudgetValues) {
              setEditingBudget({ ...defaultBudgetValues });
              setModalBufs({});
            }
          };

          return (
          <>
            {/* ── Header ── */}
            <div className="px-5 py-3.5 relative shrink-0 bg-primary">
              <div className="flex items-center gap-3">
                {/* Avatar 40px */}
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-base shrink-0 bg-card/15 text-white border border-white/25">
                  {modalInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-white leading-tight truncate">{editingBudgetInfo.name}</h2>
                  <p className="text-xs text-white/70">{editingBudgetInfo.functionName}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="inline-flex items-center h-[22px] text-2xs font-bold px-2 rounded-md bg-card/15 text-white">
                      {editingBudgetInfo.type}
                    </span>
                    <span className="inline-flex items-center gap-1 h-[22px] text-2xs text-white/70">
                      <Calendar className="w-3 h-3" aria-hidden="true" />
                      {editingBudgetInfo.period}
                    </span>
                    <span className="inline-flex items-center gap-1 h-[22px] text-2xs px-2 rounded-md bg-card/12 text-white/85">
                      <Briefcase className="w-3 h-3" aria-hidden="true" />
                      {editingBudgetInfo.weekdays}d úteis
                      {editingBudgetInfo.regraDiaria === "fds" && <span className="opacity-70">· sem diária (CLT)</span>}
                      {editingBudgetInfo.regraDiaria === "nenhuma" && <span className="opacity-70">· sem diária (ceno CLT)</span>}
                    </span>
                    <span className="inline-flex items-center gap-1 h-[22px] text-2xs px-2 rounded-md bg-warning-strong/20 text-warning-soft">
                      <Sun className="w-3 h-3" aria-hidden="true" />
                      {editingBudgetInfo.weekends} fds
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Banner modo visualização ── */}
            {modalViewMode && (
              <div className="flex items-center gap-2.5 px-5 py-2.5 bg-warning-soft border-b border-warning/25 shrink-0">
                <Eye className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
                <p className="text-2xs font-semibold text-warning">
                  Modo de Visualização — Edição de valores bloqueada para esta fase
                </p>
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
                  onClick={() => setModalTab(id)}
                  className={[
                    "flex-1 h-10 text-sm font-medium transition-colors",
                    modalTab === id
                      ? "text-primary border-b-2 border-primary bg-brand-soft/40"
                      : "text-muted-foreground hover:text-slate-700 hover:bg-surface-muted",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Corpo (aba Custos) ── */}
            {modalTab === "custos" && (
              <EditModalCustosTab
                ctrl={ctrl}
                editingBudget={editingBudget}
                info={editingBudgetInfo}
                totalDiarias={totalDiarias}
                deflatedSegments={deflatedModal.segments}
                empreitaModal={empreitaModal}
                empreitaEditadaModal={empreitaEditadaModal}
                diasDiariaModal={diasDiariaModal}
                noWeekdays={noWeekdays}
                noWeekends={noWeekends}
                totalAlimentacao={totalAlimentacao}
                effectiveAlmocoSemana={effectiveAlmocoSemana}
                effectiveJantarSemana={effectiveJantarSemana}
                effectiveAlmocoFds={effectiveAlmocoFds}
                effectiveJantarFds={effectiveJantarFds}
              />
            )}

            {/* ── Aba: Observações ── */}
            {modalTab === "observacoes" && (
              <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
                {editingBudgetPlannedId ? (
                  <BudgetChat
                    entityType="planned"
                    entityId={editingBudgetPlannedId}
                    eventId={selectedEventId}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs">
                    Disponível após o envio para o Realizado.
                  </div>
                )}
              </div>
            )}

            {/* ── Aba: Histórico ── */}
            {modalTab === "historico" && (
              <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
                {editingBudgetPlannedId ? (
                  <ActivityTimeline entityType="budget_planned" entityId={editingBudgetPlannedId} defaultOpen={true} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs">
                    Disponível após o envio para o Realizado.
                  </div>
                )}
              </div>
            )}

            {/* ── Footer ── */}
            <div className="shrink-0 border-t border-t-border bg-surface-muted">
              {/* Faixa de total */}
              <div className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-2xs uppercase font-semibold tracking-wider text-muted-foreground">Total Planejado</div>
                  <div className="text-2xl font-extrabold leading-none mt-0.5 transition-all text-primary">{formatCurrency(modalTotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xs text-muted-foreground leading-tight">
                    Diárias <span className="font-semibold text-slate-600">{formatCurrency(totalDiarias)}</span>
                  </div>
                  <div className="text-2xs text-muted-foreground mt-0.5 leading-tight">
                    Alimentação <span className="font-semibold text-slate-600">{formatCurrency(totalAlimentacao)}</span>
                  </div>
                  <div className="text-2xs text-muted-foreground mt-0.5 leading-tight">
                    Mobilidade <span className="font-semibold text-slate-600">{formatCurrency(editingBudget.mobilidade)}</span>
                  </div>
                  {hasChanges && diff !== 0 && (
                    <div className={`text-2xs font-bold mt-1 ${diff > 0 ? "text-danger-strong" : "text-success-strong"}`}>
                      {diff > 0 ? "▲" : "▼"} {formatCurrency(Math.abs(diff))} vs original
                    </div>
                  )}
                </div>
              </div>
              {/* Botões */}
              <div className="px-5 pb-3 flex justify-between items-center gap-2 border-t border-t-border pt-2.5 bg-card">
                <div>
                  {!modalViewMode && differsFromDefault && (
                    <button
                      onClick={restoreDefaults}
                      title="Volta aos valores da regra atual (atendimento/freela/casa + deflação + voo)"
                      className="flex items-center gap-1 text-2xs font-medium text-primary hover:text-primary-hover transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      Restaurar padrão
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="h-9 px-4 text-muted-foreground hover:text-slate-700 rounded-lg text-sm"
                    disabled={savingTipo}
                    onClick={() => pedirFecharEdicao(fecharModalEdicao)}
                  >
                    Cancelar
                  </Button>
                  {!modalViewMode && (
                    <Button
                      onClick={() => { void saveEdit(); }}
                      disabled={!hasChanges || savingTipo}
                      className={`h-9 px-5 text-primary-foreground font-semibold rounded-lg gap-2 text-sm ${hasChanges ? "bg-primary hover:bg-primary-hover shadow-2" : ""}`}
                    >
                      <CheckCheck className="w-4 h-4" aria-hidden="true" />
                      {savingTipo ? "Salvando…" : hasChanges && diff !== 0 ? `Salvar (${diff > 0 ? "+" : ""}${formatCurrency(diff)})` : "Salvar"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>
        );})()}
      </DialogContent>
    </Dialog>
  );
}

export default BudgetEditModal;
