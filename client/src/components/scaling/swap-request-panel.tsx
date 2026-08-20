/**
 * Troca de colaborador dentro do modal de detalhes:
 * - SwapStatusCard: card de status (pendente/aprovada/recusada) com as ações
 *   aprovar/recusar (Compras/admin) e cancelar (solicitante) + seus confirms;
 * - RequestSwapButton: botão "Solicitar troca";
 * - SwapRequestDialog: formulário de solicitação + modal de confirmação pós-envio.
 * Extraído de pages/scaling.tsx — comportamento preservado.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Clock, Check, X, ArrowRight, ArrowLeftRight, CheckCheck, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import type { TeamInclusion, Collaborator } from "@shared/schema";
import ConfirmDialog from "./confirm-dialog";
import { formatShortDateTime, parseDay, type NormalizedSwap } from "./scaling-utils";
import type { ScalingMutations } from "./use-scaling-mutations";

// ── Card de status da troca ─────────────────────────────────────────────────

const VARIANTS: Record<string, { bg: string; border: string; icon: ReactNode; title: string; badge: string; badgeClass: string; msg: string }> = {
  pendente: {
    bg: "bg-amber-50/80", border: "border-amber-200",
    icon: <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
    title: "Troca solicitada", badge: "Aguardando aprovação",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    msg: "O colaborador atual será mantido até a aprovação.",
  },
  aprovado: {
    bg: "bg-green-50/80", border: "border-green-200",
    icon: <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />,
    title: "Troca aprovada", badge: "Aprovada por Compras",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    msg: "A alteração do colaborador foi liberada.",
  },
  rejeitado: {
    bg: "bg-red-50/70", border: "border-red-200",
    icon: <X className="w-3.5 h-3.5 text-red-500 shrink-0" />,
    title: "Troca recusada", badge: "Reprovada por Compras",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    msg: "A escala permanece com o colaborador atual.",
  },
};

export interface SwapStatusCardProps {
  pendingSwap: NormalizedSwap | undefined;
  latestSwap: NormalizedSwap | undefined;
  currentUserId: string | undefined;
  isAdminOrPurchasing: boolean;
  getCollaboratorName: (id?: string | null) => string;
  mutations: Pick<ScalingMutations, "approveSwap" | "rejectSwap" | "cancelSwap">;
  /** Evento encerrado: motivo do bloqueio (esconde aprovar/recusar/cancelar). */
  blockReason?: string | null;
}

export function SwapStatusCard({ pendingSwap, latestSwap, currentUserId, isAdminOrPurchasing, getCollaboratorName, mutations, blockReason }: SwapStatusCardProps) {
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const swap = pendingSwap || (latestSwap && ["rejeitado", "aprovado"].includes(latestSwap.status) ? latestSwap : null);
  if (!swap) return null;

  const { approveSwap, rejectSwap, cancelSwap } = mutations;
  const blocked = !!blockReason;
  const canCancel = swap.status === "pendente" && !blocked && !!currentUserId && swap.requestedBy === currentUserId;
  const v = VARIANTS[swap.status] || VARIANTS.pendente;
  const currentCollabName = getCollaboratorName(swap.currentCollaboratorId);
  const newCollabName = getCollaboratorName(swap.newCollaboratorId);
  const isResolved = swap.status === "aprovado" || swap.status === "rejeitado";
  const busy = approveSwap.isPending || rejectSwap.isPending;

  return (
    <>
      <div className={`rounded-xl border ${v.border} ${v.bg} px-3 py-2.5 space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {v.icon}
            <span className="text-[12px] font-semibold text-slate-700">{v.title}</span>
          </div>
          <span className={`text-[10px] font-medium border rounded-full px-2 py-px leading-tight ${v.badgeClass}`}>{v.badge}</span>
        </div>

        {isResolved ? (
          <div className="bg-white/70 rounded-lg border border-slate-100 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 line-through">{currentCollabName || "—"}</span>
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className={`font-semibold ${swap.status === "aprovado" ? "text-green-700" : "text-slate-500"}`}>{newCollabName || "—"}</span>
            </div>
            {swap.requestedByName && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" />
                <span>Solicitado por <span className="font-medium text-slate-600">{swap.requestedByName}</span>{swap.createdAt && <> · {formatShortDateTime(swap.createdAt)}</>}</span>
              </div>
            )}
            {swap.reviewedByName && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Check className="w-2.5 h-2.5 shrink-0" />
                <span>{swap.status === "aprovado" ? "Aprovado" : "Recusado"} por <span className="font-medium text-slate-600">{swap.reviewedByName}</span>{swap.reviewedAt && <> · {formatShortDateTime(swap.reviewedAt)}</>}</span>
              </div>
            )}
            <div className="flex items-start gap-1 text-[10px] text-slate-400">
              <span className="shrink-0">Motivo:</span>
              <span className="text-slate-500 leading-snug">{swap.reason}</span>
            </div>
            {swap.reviewComment && (
              <div className="flex items-start gap-1 text-[10px] text-slate-400">
                <span className="shrink-0">Obs.:</span>
                <span className="text-slate-500 leading-snug italic">{swap.reviewComment}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[10.5px] text-slate-500 leading-snug">Aguardando análise do time de Compras.</p>
            {swap.requestedByName && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" />
                <span>Solicitado por <span className="font-medium text-slate-600">{swap.requestedByName}</span>{swap.createdAt && <> · {formatShortDateTime(swap.createdAt)}</>}</span>
              </div>
            )}
            <div className="flex items-start gap-1.5 text-[11px]">
              <span className="text-slate-400 shrink-0">Novo colaborador:</span>
              <span className="font-medium text-slate-700">{newCollabName}</span>
            </div>
            <div className="flex items-start gap-1.5 text-[11px]">
              <span className="text-slate-400 shrink-0">Motivo:</span>
              <span className="text-slate-600 leading-snug">{swap.reason}</span>
            </div>
            {isAdminOrPurchasing && blocked && (
              <p className="pt-1.5 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-snug" role="status" data-testid="text-swap-block-reason">
                {blockReason}
              </p>
            )}
            {isAdminOrPurchasing && !blocked && (
              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmAction("approve")}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  data-testid="button-approve-swap"
                >
                  <CheckCheck className="w-3.5 h-3.5" />Aprovar troca
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmAction("reject"); setRejectReason(""); }}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  data-testid="button-reject-swap"
                >
                  <XCircle className="w-3.5 h-3.5" />Recusar troca
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <p className="text-[10px] text-slate-400 italic leading-tight">{v.msg}</p>
          {canCancel && (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors underline underline-offset-2 shrink-0"
            >
              Cancelar solicitação
            </button>
          )}
        </div>
      </div>

      {/* Confirm: cancelar solicitação (solicitante) */}
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        icon={X}
        tone="red"
        title="Cancelar solicitação de troca?"
        description="A solicitação será cancelada e o colaborador atual será mantido. Uma nova solicitação poderá ser feita."
        cancelLabel="Manter solicitação"
        confirmLabel="Sim, cancelar"
        pendingLabel="Cancelando..."
        isPending={cancelSwap.isPending}
        onConfirm={() => { if (pendingSwap) cancelSwap.mutate(pendingSwap.id, { onSuccess: () => setShowCancelConfirm(false) }); }}
      />

      {/* Confirm: aprovar troca (Compras) */}
      <ConfirmDialog
        open={confirmAction === "approve" && !!pendingSwap}
        onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
        icon={CheckCheck}
        tone="emerald"
        title="Aprovar troca de colaborador?"
        description="Ao confirmar, a alteração do colaborador será liberada para esta escala."
        confirmLabel="Confirmar aprovação"
        pendingLabel="Aprovando..."
        isPending={approveSwap.isPending}
        onConfirm={() => { if (pendingSwap) { approveSwap.mutate(pendingSwap.id); setConfirmAction(null); } }}
      >
        {pendingSwap && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[12px]">
            <div className="flex items-start gap-2">
              <span className="text-slate-400 font-medium shrink-0">Atual:</span>
              <span className="font-semibold text-slate-700">{getCollaboratorName(pendingSwap.currentCollaboratorId)}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-slate-400 font-medium shrink-0">Solicitado:</span>
              <span className="font-semibold text-blue-700">{getCollaboratorName(pendingSwap.newCollaboratorId)}</span>
            </div>
          </div>
        )}
      </ConfirmDialog>

      {/* Confirm: recusar troca (Compras) */}
      <ConfirmDialog
        open={confirmAction === "reject" && !!pendingSwap}
        onOpenChange={(o) => { if (!o) { setConfirmAction(null); setRejectReason(""); } }}
        icon={XCircle}
        tone="red"
        title="Recusar troca de colaborador?"
        description="A solicitação será recusada e a escala continuará com o colaborador atual."
        confirmLabel="Confirmar recusa"
        pendingLabel="Recusando..."
        isPending={rejectSwap.isPending}
        confirmDisabled={!rejectReason.trim()}
        onConfirm={() => {
          if (!rejectReason.trim() || !pendingSwap) return;
          rejectSwap.mutate({ id: pendingSwap.id, comment: rejectReason });
          setConfirmAction(null);
          setRejectReason("");
        }}
      >
        <div>
          <label htmlFor="swap-reject-reason" className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Motivo da recusa <span className="text-red-400">*</span></label>
          <textarea
            id="swap-reject-reason"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            className="mt-1.5 w-full border border-slate-200 rounded-xl p-2.5 text-[13px] text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
            rows={3}
            placeholder="Descreva o motivo da recusa..."
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

// ── Botão "Solicitar troca" ─────────────────────────────────────────────────

export function RequestSwapButton({ onClick, blockReason }: { onClick: () => void; blockReason?: string | null }) {
  const blocked = !!blockReason;
  return (
    <div className="space-y-1">
      <button
        type="button"
        // Com evento encerrado o servidor devolve 403: o botão não pode prometer a troca
        title={blockReason || "Após aprovado pelo time de Compras, a alteração do colaborador será liberada."}
        onClick={blocked ? undefined : onClick}
        disabled={blocked}
        data-testid="button-request-swap"
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50/60 text-blue-700 text-[12px] font-medium transition-all hover:bg-blue-100 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 active:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-50/60"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
        Solicitar troca
      </button>
      <p className="text-center text-[10px] text-slate-400 leading-tight">
        {blocked ? blockReason : "Requer aprovação de Compras"}
      </p>
    </div>
  );
}

// ── Formulário de solicitação + confirmação pós-envio ───────────────────────

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho", planejado: "Planejado", confirmado: "Confirmado",
  pendente: "Pendente", reaberto: "Reaberto", escalacao: "Escalado",
  passagem: "Aguardando passagem", passagem_comprada: "Passagem comprada",
  hospedagem: "Aguardando hospedagem", hospedagem_comprada: "Hospedagem reservada",
  hospedagem_passagem_comprada: "Passagem e hospedagem prontas",
  aprovacao: "Em aprovação", aprovado: "Aprovado", cancelado: "Cancelado",
};

export interface SwapRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inclusion: TeamInclusion;
  collaborators: Collaborator[] | undefined;
  getCollaboratorName: (id?: string | null) => string;
  getEventName: (id: string | null) => string;
  getFunctionName: (id: string | null) => string;
  getCollaboratorConflicts: (collaboratorId: string, ref: TeamInclusion | null | undefined) => { sameEvent: TeamInclusion[]; dateOverlap: TeamInclusion[] };
  createSwapRequest: ScalingMutations["createSwapRequest"];
}

export function SwapRequestDialog({
  open, onOpenChange, inclusion, collaborators, getCollaboratorName, getEventName, getFunctionName,
  getCollaboratorConflicts, createSwapRequest,
}: SwapRequestDialogProps) {
  const [newCollaboratorId, setNewCollaboratorId] = useState("");
  const [reason, setReason] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Ao abrir, começa limpo (o botão "Solicitar troca" zerava os campos)
  useEffect(() => {
    if (open) { setNewCollaboratorId(""); setReason(""); setSubmitAttempted(false); setSuccess(false); }
  }, [open]);

  const resetAndClose = () => {
    setSuccess(false);
    setNewCollaboratorId("");
    setReason("");
    setSubmitAttempted(false);
    onOpenChange(false);
  };

  const currentCollabName = getCollaboratorName(inclusion.collaboratorId || undefined);
  const newCollabName = newCollaboratorId ? getCollaboratorName(newCollaboratorId) : null;
  const isSameCollab = !!(newCollaboratorId && newCollaboratorId === inclusion.collaboratorId);
  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 10;
  const reasonEmpty = submitAttempted && !reason.trim();
  const collabEmpty = submitAttempted && !newCollaboratorId;
  const canSubmit = !!newCollaboratorId && !isSameCollab && reason.trim().length >= 10 && !createSwapRequest.isPending;

  const statusLabel = STATUS_LABELS[inclusion.status] || inclusion.status;
  const startDay = parseDay(inclusion.scheduleStartDate);
  const endDay = parseDay(inclusion.scheduleEndDate);
  const startDate = startDay ? format(startDay, "dd/MM/yyyy", { locale: ptBR }) : null;
  const endDate = endDay ? format(endDay, "dd/MM/yyyy", { locale: ptBR }) : null;
  const periodo = startDate && endDate ? `${startDate} a ${endDate}` : startDate || endDate || "—";

  const conflicts = newCollaboratorId ? getCollaboratorConflicts(newCollaboratorId, inclusion) : null;
  const hasConflict = !!conflicts && (conflicts.sameEvent.length > 0 || conflicts.dateOverlap.length > 0);

  return (
    <>
      {/* Formulário */}
      <Dialog open={open && !success} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        <DialogContent className="max-w-[700px] p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-slate-100" style={{ background: "linear-gradient(135deg, #f0f7ff 0%, #ffffff 55%)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0" style={{ boxShadow: "0 3px 10px #2563EB30" }}>
                <ArrowLeftRight style={{ width: 17, height: 17, color: "#fff" }} />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">Solicitar troca de colaborador</DialogTitle>
                <p className="text-[12px] text-slate-400 mt-0.5">A troca só será efetivada após aprovação do time de Compras.</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm grid grid-cols-4 gap-3">
              <div>
                <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Evento</div>
                <div className="text-[11px] font-semibold text-slate-700 truncate" title={getEventName(inclusion.eventId)}>{getEventName(inclusion.eventId)}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Função</div>
                <div className="text-[11px] font-semibold text-slate-700 truncate" title={getFunctionName(inclusion.functionId)}>{getFunctionName(inclusion.functionId)}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Período</div>
                <div className="text-[11px] font-medium text-slate-600">{periodo}</div>
              </div>
              <div className="flex flex-col">
                <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Status</div>
                <div className="flex items-start">
                  <span className="text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-px leading-[18px]">{statusLabel}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Colaborador atual</div>
                <div className="text-[13px] font-semibold text-slate-800 leading-snug" style={{ wordBreak: "break-word" }}>{currentCollabName}</div>
              </div>
              <div className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0 text-right">
                <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Novo colaborador</div>
                {newCollabName
                  ? <div className="text-[13px] font-semibold text-blue-700 leading-snug" style={{ wordBreak: "break-word" }}>{newCollabName}</div>
                  : <div className="text-[12px] text-slate-300 italic">Ainda não selecionado</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5 block">Novo colaborador</label>
                <CollaboratorCombobox
                  collaborators={(collaborators || []).filter(c => c.id !== inclusion.collaboratorId)}
                  value={newCollaboratorId}
                  onValueChange={(v) => { setNewCollaboratorId(v); setSubmitAttempted(false); }}
                  placeholder="Selecione o colaborador"
                  hideAll={true}
                />
                {collabEmpty && <p className="text-[10px] text-red-500 mt-1">Selecione um novo colaborador.</p>}
                {isSameCollab && <p className="text-[10px] text-red-500 mt-1">Precisa ser diferente do atual.</p>}
                {hasConflict && conflicts && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 mt-1">
                    <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 leading-snug">
                      <span className="font-semibold">Já escalado</span>
                      {conflicts.sameEvent.length > 0 && <span> neste evento</span>}
                      {conflicts.sameEvent.length > 0 && conflicts.dateOverlap.length > 0 && <span> e</span>}
                      {conflicts.dateOverlap.length > 0 && <span> em datas sobrepostas</span>}
                      .
                    </p>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="swap-reason" className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Motivo da troca <span className="text-red-500">*</span></label>
                  <span className={`text-[10px] ${reason.trim().length >= 10 ? "text-green-500" : "text-slate-300"}`}>{reason.trim().length}/10</span>
                </div>
                <Textarea
                  id="swap-reason"
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setSubmitAttempted(false); }}
                  placeholder="Informe o motivo da troca. Ex: colaborador indisponível, ajuste operacional ou substituição solicitada."
                  className="resize-none text-[12px] rounded-xl"
                  rows={3}
                  style={{ minHeight: 82 }}
                />
                {(reasonEmpty || reasonTooShort)
                  ? <p className="text-[10px] text-red-500 mt-1">{reasonEmpty ? "Informe um motivo." : "Mínimo de 10 caracteres."}</p>
                  : <p className="text-[10px] text-slate-400 mt-1">Mínimo de 10 caracteres.</p>}
              </div>
            </div>
          </div>

          <div className="px-6 pb-5 pt-3 flex gap-3 border-t border-slate-100">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-10 text-[13px] font-medium"
              onClick={() => { setSubmitAttempted(false); onOpenChange(false); }}
              disabled={createSwapRequest.isPending}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 h-10 text-[13px] font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all"
              disabled={!canSubmit}
              onClick={() => {
                setSubmitAttempted(true);
                if (!canSubmit) return;
                createSwapRequest.mutate(
                  { teamInclusionId: inclusion.id, newCollaboratorId, reason: reason.trim() },
                  { onSuccess: () => setSuccess(true) },
                );
              }}
            >
              {createSwapRequest.isPending ? "Enviando..." : "Enviar para aprovação"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação pós-envio */}
      <Dialog open={success} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        <DialogContent className="max-w-[480px] p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="px-8 py-8">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="18" r="17" stroke="#16A34A" strokeWidth="1.5" strokeOpacity="0.25"/>
                  <path d="M10 19L15.5 24.5L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <DialogTitle className="text-[16px] font-bold text-slate-900 mb-1">Solicitação enviada para aprovação</DialogTitle>
              <p className="text-[12px] text-slate-400 leading-relaxed">A troca foi enviada para análise do time de Compras.</p>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 mb-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Escala</div>
                  <div className="text-[12px] font-semibold text-slate-800 leading-tight truncate">{getEventName(inclusion.eventId)}</div>
                  <div className="text-[11px] text-slate-500 leading-tight">Função: {getFunctionName(inclusion.functionId)}</div>
                </div>
                <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1 shrink-0 leading-tight">Aguardando aprovação</span>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Colaborador atual</div>
                  <div className="text-[12px] font-semibold text-slate-700 leading-snug">{currentCollabName}</div>
                </div>
                <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Colaborador solicitado</div>
                  <div className="text-[12px] font-semibold text-blue-600 leading-snug">{newCollabName || "—"}</div>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5 mb-5">
              <p className="text-[11px] text-blue-800 leading-relaxed">
                <span className="font-semibold">A escala continuará com o colaborador atual</span> até que a troca seja aprovada pelo time de Compras.
              </p>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 font-semibold text-[13px]" onClick={resetAndClose}>
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
