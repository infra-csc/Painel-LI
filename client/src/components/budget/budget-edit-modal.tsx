/**
 * Modal de edição do orçamento PLANEJADO (casca) — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx: cabeçalho, banner de visualização, abas
 * (Custos / Observações / Histórico) e rodapé com total e botões. A aba Custos
 * vive em `EditModalCustosTab`; estado e ações em `useBudgetEditModal`.
 *
 * 08/10 (redesenho): cabeçalho branco da família (iniciais, nome, tipo,
 * função · período, dias úteis/fds) no lugar da faixa azul; abas sublinhadas
 * de verdade (tablist); rodapé fixo numa faixa só — total que será gravado,
 * diferença para o original, a divisão por bloco e as ações. Tela cheia no
 * celular. Os cálculos abaixo são os mesmos.
 */
import { Briefcase, Calendar, CheckCheck, Eye, Loader2, Lock, MessageSquare, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ActivityTimeline } from "@/components/activity-timeline";
import { BudgetChat } from "@/components/budget-chat";
import { calcDeflatedDailies, deflationFactorsFromSettings, type DeflationSegment } from "@shared/calculation-rules";
import type { ControladorDoModalDeEdicao } from "@/hooks/use-budget-edit-modal";
import { EditModalCustosTab } from "./edit-modal-custos-tab";
import { formatCurrency, type BudgetEdit } from "./types";

/** Mesma moldura dos modais da família: rodapé fixo, corpo rola; tela cheia no celular. */
const MOLDURA = "!max-w-[700px] w-[95vw] max-h-[90vh] !flex !flex-col p-0 gap-0 overflow-hidden rounded-xl max-sm:w-full max-sm:!max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0";

/** Observações e Histórico só existem depois que o planejamento vira registro. */
function AindaSemRegistro({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground mb-2.5" aria-hidden="true">
        <MessageSquare className="w-4 h-4" />
      </span>
      <p className="m-0 text-sm font-semibold text-foreground">{titulo} ainda não disponível</p>
      <p className="m-0 mt-1 max-w-[340px] text-xs leading-5 text-muted-foreground">Disponível após o envio para o Realizado.</p>
    </div>
  );
}

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
      <DialogContent aria-describedby={undefined} className={MOLDURA}>
        {!(editingBudget && editingBudgetInfo) && <DialogTitle className="sr-only">Editar orçamento planejado</DialogTitle>}

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
            {/* ── Cabeçalho: o que é, de quem, quando — e o que já se sabe da vaga ── */}
            <div className="flex items-start gap-3.5 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card shrink-0">
              <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-brand-soft text-primary text-sm font-semibold" aria-hidden="true">
                {modalInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <DialogTitle className="m-0 p-0 text-base font-semibold leading-6 text-foreground truncate"><span className="sr-only">Orçamento planejado de </span>{editingBudgetInfo.name}</DialogTitle>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-md text-2xs font-medium ${editingBudgetInfo.type === "Casa" ? "bg-brand-soft text-primary" : "bg-muted text-slate-600"}`}>
                    {editingBudgetInfo.type}
                  </span>
                  {modalViewMode && (
                    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-2xs font-medium bg-muted text-slate-600">
                      <Lock className="w-3 h-3" aria-hidden="true" />Somente leitura
                    </span>
                  )}
                </div>
                <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                  <span className="font-medium text-foreground">{editingBudgetInfo.functionName}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums"><Calendar className="w-3 h-3" aria-hidden="true" />{editingBudgetInfo.period}</span>
                </p>
                <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="w-3 h-3" aria-hidden="true" />
                    {editingBudgetInfo.weekdays}d úteis
                    {editingBudgetInfo.regraDiaria === "fds" && <span>· sem diária (CLT)</span>}
                    {editingBudgetInfo.regraDiaria === "nenhuma" && <span>· sem diária (ceno CLT)</span>}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />
                    {editingBudgetInfo.weekends} fds
                  </span>
                </p>
              </div>
            </div>

            {/* ── Modo visualização: diz por que nada se edita ── */}
            {modalViewMode && (
              <div className="flex items-center gap-2.5 px-5 sm:px-6 py-2 bg-surface-muted border-b border-border shrink-0">
                <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                <p className="m-0 text-xs text-slate-600">
                  Modo de visualização — edição de valores bloqueada para esta fase: este planejamento já foi enviado ao Realizado.
                </p>
              </div>
            )}

            {/* ── Abas ── */}
            <div role="tablist" aria-label="Seções do orçamento" className="flex gap-1 pl-3 sm:pl-4 pr-4 border-b border-border bg-card shrink-0">
              {([
                { id: "custos", label: "Custos" },
                { id: "observacoes", label: "Observações" },
                { id: "historico", label: "Histórico" },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={modalTab === id}
                  onClick={() => setModalTab(id)}
                  className={[
                    "relative -mb-px px-3 sm:px-4 py-2.5 border-b-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    modalTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
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
                  <AindaSemRegistro titulo="Observações" />
                )}
              </div>
            )}

            {/* ── Aba: Histórico ── */}
            {modalTab === "historico" && (
              <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
                {editingBudgetPlannedId ? (
                  <ActivityTimeline entityType="budget_planned" entityId={editingBudgetPlannedId} defaultOpen={true} />
                ) : (
                  <AindaSemRegistro titulo="Histórico" />
                )}
              </div>
            )}

            {/* ── Rodapé fixo: o total que vai ser gravado e as ações ── */}
            <div className="shrink-0 px-5 sm:px-6 pt-3 pb-3 border-t border-border bg-surface-muted">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-slate-600">Total planejado</span>
                  {hasChanges && diff !== 0 && (
                    <span className={`pla-diferenca inline-flex items-center h-5 px-1.5 rounded-md text-2xs font-semibold tabular-nums ${diff > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
                      {diff > 0 ? "▲" : "▼"} {formatCurrency(Math.abs(diff))} vs original
                    </span>
                  )}
                </div>
                <div className="text-[1.375rem] font-semibold leading-7 tracking-[-0.01em] tabular-nums text-primary" aria-live="polite">{formatCurrency(modalTotal)}</div>
              </div>
              {/* A conta do total, como um extrato miúdo à direita. */}
              <dl className="m-0 grid grid-cols-[auto_auto] gap-x-3 text-2xs leading-4 tabular-nums text-muted-foreground">
                <dt>Diárias</dt><dd className="m-0 text-right font-medium text-slate-700">{formatCurrency(totalDiarias)}</dd>
                <dt>Alimentação</dt><dd className="m-0 text-right font-medium text-slate-700">{formatCurrency(totalAlimentacao)}</dd>
                <dt>Mobilidade</dt><dd className="m-0 text-right font-medium text-slate-700">{formatCurrency(editingBudget.mobilidade)}</dd>
              </dl>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
                {!modalViewMode && differsFromDefault && (
                  <button
                    type="button"
                    onClick={restoreDefaults}
                    title="Volta aos valores da regra atual (atendimento/freela/casa + deflação + voo)"
                    className="pas-alvo inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mr-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                    Restaurar padrão
                  </button>
                )}
                <Button
                  variant="outline"
                  className="h-9 px-4 rounded-lg text-sm font-medium"
                  disabled={savingTipo}
                  onClick={() => pedirFecharEdicao(fecharModalEdicao)}
                >
                  {modalViewMode ? "Fechar" : "Cancelar"}
                </Button>
                {!modalViewMode && (
                  <Button
                    onClick={() => { void saveEdit(); }}
                    disabled={!hasChanges || savingTipo}
                    className="h-9 px-4 rounded-lg gap-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground"
                  >
                    {savingTipo ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="w-4 h-4" aria-hidden="true" />}
                    {savingTipo ? "Salvando…" : hasChanges && diff !== 0 ? `Salvar (${diff > 0 ? "+" : ""}${formatCurrency(diff)})` : "Salvar"}
                  </Button>
                )}
              </div>
            </div>
          </>
        );})()}
      </DialogContent>
    </Dialog>
  );
}

export default BudgetEditModal;
