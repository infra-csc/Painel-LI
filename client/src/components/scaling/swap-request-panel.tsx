/**
 * Troca de colaborador dentro do modal de detalhes:
 * - SwapStatusCard: card de status (pendente/aprovada/recusada) com as ações
 *   aprovar/recusar (Compras/admin) e cancelar (solicitante) + seus confirms;
 * - RequestSwapButton: botão "Solicitar troca";
 * - SwapRequestDialog: formulário de solicitação + modal de confirmação pós-envio.
 * Extraído de pages/scaling.tsx — comportamento preservado.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Clock, Check, X, ArrowRight, ArrowLeftRight, CheckCheck, XCircle, AlertCircle, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ExplicacaoDaTroca } from "./swap-explicacao";
import { explicarTroca, type TrocaParaExplicar } from "@shared/swap-explicacao";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import EscolherColaborador from "./escolher-colaborador";
import type { TeamInclusion, Collaborator } from "@shared/schema";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { formatShortDateTime, isCityFromSP, parseDay, type NormalizedSwap } from "./scaling-utils";
import { SAI_DE_SP, cidadeDeSaida, validarSaiDe } from "@shared/swap-sai-de";
import { EscolherVagaDaPermuta, LinhasDaPermuta, LinhasDaTransferencia, candidatasDaPermuta, periodoCurto } from "./swap-permuta";

// ── Campo "Sai de" do novo colaborador (14/09) ─────────────────────────────

/** Estado inicial do "Sai de" a partir de uma cidade (a do colaborador ou a já pedida). */
export function saiDeInicial(cidade: string | null | undefined): { saiDeSP: boolean; cidade: string } {
  const c = String(cidade ?? "").trim();
  if (!c) return { saiDeSP: false, cidade: "" };
  return isCityFromSP(c) ? { saiDeSP: true, cidade: SAI_DE_SP } : { saiDeSP: false, cidade: c };
}

/**
 * De onde o NOVO colaborador sai — o mesmo par "São Paulo - SP | Outra cidade"
 * do modal da Escalação. Usado no pedido de troca e na aprovação (Escalação e
 * Hospedagem/Passagem): aprovada a troca, a vaga passa a sair desta cidade.
 */
export function CampoSaiDe({
  id, saiDeSP, cidade, onChange, forcarErro = false, travado = false,
  rotulo = "Novo colaborador sai de",
  dicaTravado = "Escolha o novo colaborador — a cidade dele entra aqui e dá para corrigir.",
}: {
  /** Rótulo do campo (na permuta são dois, um por colaborador). */
  rotulo?: string;
  /** Dica enquanto o campo está travado. */
  dicaTravado?: string;
  id: string;
  saiDeSP: boolean;
  cidade: string;
  onChange: (saiDeSP: boolean, cidade: string) => void;
  /** Mostra o erro mesmo sem o usuário ter mexido (depois de tentar enviar/aprovar). */
  forcarErro?: boolean;
  /**
   * Ainda sem novo colaborador (14/09): o campo aparece, mas travado e dizendo
   * o que falta — escondido, ninguém sabia que o pedido pedia o "Sai de".
   */
  travado?: boolean;
}) {
  const erro = validarSaiDe(cidadeDeSaida(saiDeSP, cidade));
  const mostrarErro = !travado && !!erro && forcarErro;
  const botao = (on: boolean) =>
    `flex-1 px-2 py-1.5 rounded-lg text-2xs font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${on && !travado ? "bg-primary text-primary-foreground border-primary" : "bg-card text-slate-600 border-border hover:border-slate-300"}`;
  return (
    <div className="space-y-1.5" data-testid={id}>
      <p id={`${id}-rotulo`} className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3 w-3" aria-hidden="true" /> {rotulo} <span className="text-danger-strong">*</span>
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className="flex gap-1.5">
        <button type="button" role="radio" aria-checked={!travado && saiDeSP} disabled={travado} onClick={() => onChange(true, SAI_DE_SP)} className={botao(saiDeSP)} data-testid={`${id}-sp`}>
          São Paulo - SP
        </button>
        <button type="button" role="radio" aria-checked={!travado && !saiDeSP} disabled={travado} onClick={() => onChange(false, saiDeSP ? "" : cidade)} className={botao(!saiDeSP)} data-testid={`${id}-outra`}>
          Outra cidade
        </button>
      </div>
      {!travado && !saiDeSP && (
        <input
          type="text"
          value={cidade}
          maxLength={120}
          aria-label="Cidade de onde o novo colaborador sai"
          aria-invalid={mostrarErro || undefined}
          onChange={(e) => onChange(false, e.target.value)}
          placeholder="Ex: Rio de Janeiro - RJ"
          data-testid={`${id}-cidade`}
          className={`w-full px-3 py-2 text-sm border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${mostrarErro ? "border-danger/25" : "border-border"}`}
        />
      )}
      <p className={`text-2xs leading-snug ${mostrarErro ? "text-danger-strong" : "text-muted-foreground"}`}>
        {travado
          ? dicaTravado
          : mostrarErro ? erro : "Aprovada a troca, a vaga passa a sair desta cidade — é a origem da passagem."}
      </p>
    </div>
  );
}
import type { ScalingMutations } from "./use-scaling-mutations";

// ── Card de status da troca ─────────────────────────────────────────────────

const VARIANTS: Record<string, { bg: string; border: string; icon: ReactNode; title: string; badge: string; badgeClass: string; msg: string }> = {
  pendente: {
    bg: "bg-warning-soft/80", border: "border-warning/25",
    icon: <Clock className="w-3.5 h-3.5 text-warning-strong shrink-0" />,
    title: "Troca solicitada", badge: "Aguardando aprovação",
    badgeClass: "bg-warning-soft text-warning border-warning/25",
    msg: "O colaborador atual será mantido até a aprovação.",
  },
  aprovado: {
    bg: "bg-success-soft/80", border: "border-success/25",
    icon: <Check className="w-3.5 h-3.5 text-success shrink-0" />,
    title: "Troca aprovada", badge: "Aprovada por Compras",
    badgeClass: "bg-success-soft text-success border-success/25",
    msg: "A alteração do colaborador foi liberada.",
  },
  rejeitado: {
    bg: "bg-danger-soft/70", border: "border-danger/25",
    icon: <X className="w-3.5 h-3.5 text-danger-strong shrink-0" />,
    title: "Troca recusada", badge: "Reprovada por Compras",
    badgeClass: "bg-danger-soft text-danger border-danger/25",
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
  /** Permuta (14/09): dois escalados trocam de vaga — o cartão diz quem vai para onde. */
  const permuta = swap.swapKind === "permuta";
  /** Transferência (14/09): alguém de outra vaga entra nesta, que estava aberta. */
  const transferencia = swap.swapKind === "transferencia";
  /** O que muda ao aprovar (16/09) — mesmo texto no cartão e nas confirmações. */
  const trocaExplicada: TrocaParaExplicar = {
    ...swap,
    currentCollaboratorName: swap.currentCollaboratorId ? currentCollabName : null,
    newCollaboratorName: newCollabName || swap.newCollaboratorName,
  };

  return (
    <>
      <div className={`rounded-xl border ${v.border} ${v.bg} px-3 py-2.5 space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {v.icon}
            <span className="text-xs font-semibold text-slate-700">{permuta ? v.title.replace("Troca", "Troca entre vagas") : transferencia ? v.title.replace("Troca", "Transferência") : v.title}</span>
          </div>
          <span className={`text-2xs font-medium border rounded-full px-2 py-px leading-tight ${v.badgeClass}`}>{v.badge}</span>
        </div>

        {isResolved ? (
          <div className="bg-card/70 rounded-lg border border-border p-2 space-y-1.5">
            {permuta ? <LinhasDaPermuta swap={swap} getCollaboratorName={getCollaboratorName} /> : transferencia ? <LinhasDaTransferencia swap={swap} getCollaboratorName={getCollaboratorName} /> : (<>
            <div className="flex items-center gap-1.5 text-2xs">
              <span className="text-muted-foreground line-through">{currentCollabName || "—"}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className={`font-semibold ${swap.status === "aprovado" ? "text-success" : "text-muted-foreground"}`}>{newCollabName || "—"}</span>
            </div>
            {swap.newCity && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground" data-testid="swap-sai-de-resolvido">
                <MapPin className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>Sai de <span className="font-semibold text-slate-700">{swap.newCity}</span></span>
              </div>
            )}
            </>)}
            {swap.requestedByName && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" />
                <span>Solicitado por <span className="font-medium text-slate-600">{swap.requestedByName}</span>{swap.createdAt && <> · {formatShortDateTime(swap.createdAt)}</>}</span>
              </div>
            )}
            {swap.reviewedByName && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                <Check className="w-2.5 h-2.5 shrink-0" />
                <span>{swap.status === "aprovado" ? "Aprovada" : "Rejeitada"} por <span className="font-medium text-slate-600">{swap.reviewedByName}</span>{swap.reviewedAt && <> · {formatShortDateTime(swap.reviewedAt)}</>}</span>
              </div>
            )}
            <div className="flex items-start gap-1 text-2xs text-muted-foreground">
              <span className="shrink-0">Motivo:</span>
              <span className="text-muted-foreground leading-snug">{swap.reason}</span>
            </div>
            {swap.reviewComment && (
              <div className="flex items-start gap-1 text-2xs text-muted-foreground">
                <span className="shrink-0">Obs.:</span>
                <span className="text-muted-foreground leading-snug italic">{swap.reviewComment}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-2xs text-muted-foreground leading-snug">Aguardando análise do time de Compras.</p>
            {swap.requestedByName && (
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                <ArrowLeftRight className="w-2.5 h-2.5 shrink-0" />
                <span>Solicitado por <span className="font-medium text-slate-600">{swap.requestedByName}</span>{swap.createdAt && <> · {formatShortDateTime(swap.createdAt)}</>}</span>
              </div>
            )}
            <ExplicacaoDaTroca troca={trocaExplicada} titulo="Se for aprovada" />
            <div className="flex items-start gap-1.5 text-2xs">
              <span className="text-muted-foreground shrink-0">Motivo:</span>
              <span className="text-slate-600 leading-snug">{swap.reason}</span>
            </div>
            {isAdminOrPurchasing && blocked && (
              <p className="pt-1.5 text-2xs text-warning bg-warning-soft border border-warning/25 rounded-lg px-2 py-1.5 leading-snug" role="status" data-testid="text-swap-block-reason">
                {blockReason}
              </p>
            )}
            {isAdminOrPurchasing && !blocked && (
              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmAction("approve")}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-success hover:bg-success/90 text-white text-2xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  data-testid="button-approve-swap"
                >
                  <CheckCheck className="w-3.5 h-3.5" />Aprovar troca
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmAction("reject"); setRejectReason(""); }}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-danger hover:bg-danger/90 text-white text-2xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  data-testid="button-reject-swap"
                >
                  <XCircle className="w-3.5 h-3.5" />Recusar troca
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <p className="text-2xs text-muted-foreground italic leading-tight">{v.msg}</p>
          {canCancel && (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="text-2xs text-muted-foreground hover:text-danger-strong transition-colors underline underline-offset-2 shrink-0"
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
        tone="danger"
        title="Cancelar solicitação de troca?"
        description="A solicitação será cancelada e o colaborador atual será mantido. Uma nova solicitação poderá ser feita."
        cancelLabel="Manter solicitação"
        confirmLabel="Sim, cancelar"
        pending={cancelSwap.isPending}
        onConfirm={() => { if (pendingSwap) cancelSwap.mutate(pendingSwap.id, { onSuccess: () => setShowCancelConfirm(false) }); }}
      />

      {/* Confirm: aprovar troca (Compras) */}
      <ConfirmDialog
        open={confirmAction === "approve" && !!pendingSwap}
        onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
        icon={CheckCheck}
        tone="default"
        title={pendingSwap?.swapKind === "permuta" ? "Aprovar troca entre vagas?" : pendingSwap?.swapKind === "transferencia" ? "Aprovar transferência de colaborador?" : "Aprovar troca de colaborador?"}
        description="Confira abaixo exatamente o que muda. Ao confirmar, a mudança é aplicada na hora."
        confirmLabel="Confirmar aprovação"
        pending={approveSwap.isPending}
        onConfirm={() => { if (pendingSwap) { approveSwap.mutate(pendingSwap.id); setConfirmAction(null); } }}
      >
        {pendingSwap && (
          <div className="bg-surface-muted border border-border rounded-xl p-3 space-y-2 text-xs">
            <ExplicacaoDaTroca troca={trocaExplicada} />
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground font-medium shrink-0">Motivo:</span>
              <span className="text-slate-600 leading-snug">{pendingSwap.reason}</span>
            </div>
          </div>
        )}
      </ConfirmDialog>

      {/* Confirm: recusar troca (Compras) */}
      <ConfirmDialog
        open={confirmAction === "reject" && !!pendingSwap}
        onOpenChange={(o) => { if (!o) { setConfirmAction(null); setRejectReason(""); } }}
        icon={XCircle}
        tone="danger"
        title={permuta ? "Recusar troca entre vagas?" : transferencia ? "Recusar transferência?" : "Recusar troca de colaborador?"}
        description={explicarTroca(trocaExplicada).recusa}
        confirmLabel="Confirmar recusa"
        pending={rejectSwap.isPending}
        confirmDisabled={!rejectReason.trim()}
        onConfirm={() => {
          if (!rejectReason.trim() || !pendingSwap) return;
          rejectSwap.mutate({ id: pendingSwap.id, comment: rejectReason });
          setConfirmAction(null);
          setRejectReason("");
        }}
      >
        <div>
          <label htmlFor="swap-reject-reason" className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Motivo da recusa <span className="text-danger-strong">*</span></label>
          <textarea
            id="swap-reject-reason"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            className="mt-1.5 w-full border border-border rounded-xl p-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
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
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-primary/25 bg-brand-soft/60 text-primary text-xs font-medium transition-all hover:bg-brand-soft hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1 active:bg-brand-soft disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-soft/60"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
        Solicitar troca
      </button>
      <p className="text-center text-2xs text-muted-foreground leading-tight">
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
  /** Todas as vagas — candidatas da permuta (14/09). */
  inclusions?: TeamInclusion[] | undefined;
}

export function SwapRequestDialog({
  open, onOpenChange, inclusion, collaborators, getCollaboratorName, getEventName, getFunctionName,
  getCollaboratorConflicts, createSwapRequest, inclusions,
}: SwapRequestDialogProps) {
  const [newCollaboratorId, setNewCollaboratorId] = useState("");
  const [reason, setReason] = useState("");
  /** De onde o novo colaborador sai (14/09) — preenchido pela cidade dele ao escolher. */
  const [saiDe, setSaiDe] = useState(() => saiDeInicial(null));
  /** Troca simples × permuta com o colaborador de outra vaga (14/09). */
  const [modo, setModo] = useState<"substituicao" | "permuta">("substituicao");
  const [vagaPermutaId, setVagaPermutaId] = useState("");
  /** De onde o colaborador ATUAL sai para a outra vaga (só na permuta). */
  const [saiDeOutro, setSaiDeOutro] = useState(() => saiDeInicial(null));
  const [success, setSuccess] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Ao abrir, começa limpo (o botão "Solicitar troca" zerava os campos)
  useEffect(() => {
    if (open) { setNewCollaboratorId(""); setReason(""); setSaiDe(saiDeInicial(null)); setModo("substituicao"); setVagaPermutaId(""); setSaiDeOutro(saiDeInicial(null)); setSubmitAttempted(false); setSuccess(false); }
  }, [open]);

  const resetAndClose = () => {
    setSuccess(false);
    setNewCollaboratorId("");
    setReason("");
    setSaiDe(saiDeInicial(null));
    setModo("substituicao");
    setVagaPermutaId("");
    setSaiDeOutro(saiDeInicial(null));
    setSubmitAttempted(false);
    onOpenChange(false);
  };

  const currentCollabName = getCollaboratorName(inclusion.collaboratorId || undefined);
  const newCollabName = newCollaboratorId ? getCollaboratorName(newCollaboratorId) : null;
  const isSameCollab = !!(newCollaboratorId && newCollaboratorId === inclusion.collaboratorId);
  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 10;
  const reasonEmpty = submitAttempted && !reason.trim();
  const collabEmpty = submitAttempted && !newCollaboratorId;
  const cidadeSaida = cidadeDeSaida(saiDe.saiDeSP, saiDe.cidade);
  const erroSaiDe = validarSaiDe(cidadeSaida);
  const permuta = modo === "permuta";
  const candidatasPermuta = permuta ? candidatasDaPermuta(inclusion, inclusions ?? []) : [];
  const vagaPermuta = permuta ? (inclusions ?? []).find((i) => i.id === vagaPermutaId) ?? null : null;
  const cidadeSaidaOutro = cidadeDeSaida(saiDeOutro.saiDeSP, saiDeOutro.cidade);
  const erroSaiDeOutro = permuta ? validarSaiDe(cidadeSaidaOutro) : null;
  const canSubmit = !!newCollaboratorId && !isSameCollab && reason.trim().length >= 10 && !erroSaiDe && !erroSaiDeOutro
    && (!permuta || !!vagaPermuta) && !createSwapRequest.isPending;

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
        {/* Altura limitada (dono, 16/09: "o modal está cortando"): cabeçalho e
            botões fixos, só o miolo rola — em tela baixa o "Enviar para
            aprovação" sumia para fora da janela. */}
        <DialogContent className="max-w-[760px] max-h-[92vh] flex flex-col p-0 gap-0 rounded-xl overflow-hidden">
          <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border bg-brand-soft">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary shadow-2 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="h-[17px] w-[17px] text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base font-bold text-foreground leading-tight">Solicitar troca de colaborador</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">A troca só será efetivada após aprovação do time de Compras.</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border px-4 py-2.5 shadow-1 grid grid-cols-4 gap-3">
              <div>
                <div className="text-2xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Evento</div>
                <div className="text-2xs font-semibold text-slate-700 truncate" title={getEventName(inclusion.eventId)}>{getEventName(inclusion.eventId)}</div>
              </div>
              <div>
                <div className="text-2xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Função</div>
                <div className="text-2xs font-semibold text-slate-700 truncate" title={getFunctionName(inclusion.functionId)}>{getFunctionName(inclusion.functionId)}</div>
              </div>
              <div>
                <div className="text-2xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Período</div>
                <div className="text-2xs font-medium text-slate-600">{periodo}</div>
              </div>
              <div className="flex flex-col">
                <div className="text-2xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Status</div>
                <div className="flex items-start">
                  <span className="text-2xs font-medium bg-brand-soft text-primary border border-primary/25 rounded-full px-2 py-px leading-snug">{statusLabel}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
            {/* Troca simples × permuta (dono, 14/09): dois colaboradores já
                escalados no mesmo período não conseguiam trocar de vaga — cada
                vaga acusava conflito com a outra. */}
            <div role="radiogroup" aria-label="Tipo de troca" className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="tipo-de-troca">
              {([
                ["substituicao", "Colocar outro colaborador", "Quem entra ainda não está escalado no mesmo período."],
                ["permuta", "Trocar com alguém de outra vaga", "Os dois já estão escalados e trocam de lugar — ex.: mesmo fim de semana, eventos diferentes."],
              ] as const).map(([k, titulo, desc]) => {
                const on = modo === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setModo(k);
                      setNewCollaboratorId("");
                      setVagaPermutaId("");
                      setSaiDe(saiDeInicial(null));
                      setSaiDeOutro(saiDeInicial(null));
                      setSubmitAttempted(false);
                    }}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${on ? "border-primary bg-brand-soft" : "border-border bg-card hover:border-slate-300"}`}
                    data-testid={`tipo-de-troca-${k}`}
                  >
                    <span className={`block text-xs font-semibold ${on ? "text-primary" : "text-slate-700"}`}>{titulo}</span>
                    <span className="block text-2xs leading-snug text-muted-foreground">{desc}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 bg-surface-muted rounded-xl border border-border px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Colaborador atual</div>
                <div className="text-sm font-semibold text-foreground leading-snug break-words">{currentCollabName}</div>
              </div>
              <div className="w-7 h-7 rounded-full bg-card border border-border shadow-1 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 text-right">
                <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Novo colaborador</div>
                {newCollabName
                  ? <div className="text-sm font-semibold text-primary leading-snug break-words">{newCollabName}</div>
                  : <div className="text-xs text-muted-foreground italic">Ainda não selecionado</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {permuta ? (
              <div>
                <label className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-1.5 block">Vaga do outro colaborador</label>
                {vagaPermuta ? (
                  <div className="rounded-lg border border-primary/30 bg-brand-soft px-3 py-2" data-testid="vaga-permuta-escolhida">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground break-words">{getCollaboratorName(vagaPermuta.collaboratorId)}</div>
                        <div className="text-2xs text-slate-600 break-words">
                          #{vagaPermuta.inclusionNumber} · {getEventName(vagaPermuta.eventId)} · {getFunctionName(vagaPermuta.functionId)} · {periodoCurto(vagaPermuta)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setVagaPermutaId(""); setNewCollaboratorId(""); setSaiDe(saiDeInicial(null)); setSaiDeOutro(saiDeInicial(null)); }}
                        className="shrink-0 text-2xs font-semibold text-primary hover:underline"
                        data-testid="button-trocar-vaga-permuta"
                      >
                        Trocar
                      </button>
                    </div>
                  </div>
                ) : (
                  <EscolherVagaDaPermuta
                    candidatas={candidatasPermuta}
                    getCollaboratorName={getCollaboratorName}
                    getEventName={getEventName}
                    getFunctionName={getFunctionName}
                    onEscolher={(v) => {
                      setVagaPermutaId(v.id);
                      setNewCollaboratorId(v.collaboratorId ?? "");
                      // Cada um vem com a cidade de saída que já tem: quem chega,
                      // a do cadastro; quem sai para a outra vaga, a desta vaga.
                      setSaiDe(saiDeInicial((collaborators || []).find((c) => c.id === v.collaboratorId)?.city));
                      setSaiDeOutro(saiDeInicial(inclusion.city || (collaborators || []).find((c) => c.id === inclusion.collaboratorId)?.city));
                      setSubmitAttempted(false);
                    }}
                  />
                )}
                {submitAttempted && !vagaPermuta && <p className="text-2xs text-danger-strong mt-1">Escolha a vaga do outro colaborador.</p>}
                <p className="mt-1.5 text-2xs leading-snug text-muted-foreground">
                  Aprovada a troca, os dois trocam de lugar ao mesmo tempo — sem conflito de datas, porque ninguém fica em dois lugares.
                </p>
              </div>
              ) : (
              <div>
                <label className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-1.5 block">Novo colaborador</label>
                {/* O conflito de agenda aparece NA LISTA, não depois de
                    escolher: descobrir que a pessoa não pode só ao selecioná-la
                    é fazer o trabalho duas vezes. */}
                <EscolherColaborador
                  colaboradores={(collaborators || []).filter(c => c.id !== inclusion.collaboratorId)}
                  inclusion={inclusion}
                  getConflitos={getCollaboratorConflicts}
                  getEventName={getEventName}
                  onEscolher={(v) => {
                    setNewCollaboratorId(v);
                    // Mesma regra do modal: a cidade de saída acompanha o
                    // colaborador escolhido (quem é de SP já vem com SP marcado).
                    setSaiDe(saiDeInicial((collaborators || []).find((c) => c.id === v)?.city));
                    setSubmitAttempted(false);
                  }}
                />
                {collabEmpty && <p className="text-2xs text-danger-strong mt-1">Selecione um novo colaborador.</p>}
                {isSameCollab && <p className="text-2xs text-danger-strong mt-1">Precisa ser diferente do atual.</p>}
                {hasConflict && conflicts && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-warning/25 bg-warning-soft px-2.5 py-1.5 mt-1">
                    <AlertCircle className="w-3 h-3 text-warning-strong shrink-0 mt-0.5" />
                    <p className="text-2xs text-warning leading-snug">
                      <span className="font-semibold">Já escalado</span>
                      {conflicts.sameEvent.length > 0 && <span> neste evento</span>}
                      {conflicts.sameEvent.length > 0 && conflicts.dateOverlap.length > 0 && <span> e</span>}
                      {conflicts.dateOverlap.length > 0 && <span> em datas sobrepostas</span>}
                      .
                    </p>
                  </div>
                )}
              </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="swap-reason" className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground">Motivo da troca <span className="text-danger-strong">*</span></label>
                  <span className={`text-2xs ${reason.trim().length >= 10 ? "text-success-strong" : "text-muted-foreground"}`}>{reason.trim().length}/10</span>
                </div>
                <Textarea
                  id="swap-reason"
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setSubmitAttempted(false); }}
                  placeholder="Informe o motivo da troca. Ex: colaborador indisponível, ajuste operacional ou substituição solicitada."
                  className="resize-none text-xs rounded-xl"
                  rows={3}
                  style={{ minHeight: 82 }}
                />
                {(reasonEmpty || reasonTooShort)
                  ? <p className="text-2xs text-danger-strong mt-1">{reasonEmpty ? "Informe um motivo." : "Mínimo de 10 caracteres."}</p>
                  : <p className="text-2xs text-muted-foreground mt-1">Mínimo de 10 caracteres.</p>}
                {/* "Sai de" (dono, 14/09): sempre visível; travado até escolher.
                    Na permuta são DOIS — um para quem chega, outro para quem vai. */}
                <div className="mt-4 space-y-3">
                  <CampoSaiDe
                    id="swap-sai-de-pedido"
                    rotulo={permuta && vagaPermuta ? `${getCollaboratorName(vagaPermuta.collaboratorId)} sai de (vem para esta vaga)` : "Novo colaborador sai de"}
                    dicaTravado={permuta ? "Escolha a vaga do outro colaborador — a cidade de cada um entra aqui e dá para corrigir." : "Escolha o novo colaborador — a cidade dele entra aqui e dá para corrigir."}
                    saiDeSP={saiDe.saiDeSP}
                    cidade={saiDe.cidade}
                    onChange={(sp, cidade) => { setSaiDe({ saiDeSP: sp, cidade }); setSubmitAttempted(false); }}
                    forcarErro={submitAttempted}
                    travado={!newCollaboratorId}
                  />
                  {permuta && (
                    <CampoSaiDe
                      id="swap-sai-de-outro"
                      rotulo={`${currentCollabName} sai de (vai para a outra vaga)`}
                      dicaTravado="Escolha a vaga do outro colaborador."
                      saiDeSP={saiDeOutro.saiDeSP}
                      cidade={saiDeOutro.cidade}
                      onChange={(sp, cidade) => { setSaiDeOutro({ saiDeSP: sp, cidade }); setSubmitAttempted(false); }}
                      forcarErro={submitAttempted}
                      travado={!vagaPermuta}
                    />
                  )}
                </div>
              </div>
            </div>
            {/* Antes de enviar (16/09): o mesmo quadro que Compras vai ler. */}
            {newCollaboratorId && (
              <ExplicacaoDaTroca
                titulo="Se for aprovada"
                troca={{
                  swapKind: permuta ? "permuta" : "substituicao",
                  inclusionNumber: inclusion.inclusionNumber ?? null,
                  eventName: getEventName(inclusion.eventId),
                  pairedInclusionNumber: vagaPermuta?.inclusionNumber ?? null,
                  pairedEventName: vagaPermuta ? getEventName(vagaPermuta.eventId) : null,
                  pairedFunctionName: vagaPermuta ? getFunctionName(vagaPermuta.functionId) : null,
                  currentCollaboratorName: currentCollabName,
                  newCollaboratorName: newCollabName,
                  newCity: cidadeSaida || null,
                  pairedNewCity: permuta ? cidadeSaidaOutro || null : null,
                }}
              />
            )}
          </div>

          <div className="shrink-0 px-6 pb-5 pt-3 flex gap-3 border-t border-border">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-10 text-sm font-medium"
              onClick={() => { setSubmitAttempted(false); onOpenChange(false); }}
              disabled={createSwapRequest.isPending}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 h-10 text-sm font-semibold rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground transition-all"
              disabled={!canSubmit}
              onClick={() => {
                setSubmitAttempted(true);
                if (!canSubmit) return;
                createSwapRequest.mutate(
                  {
                    teamInclusionId: inclusion.id, newCollaboratorId, reason: reason.trim(), newCity: cidadeSaida,
                    ...(permuta && vagaPermuta ? { kind: "permuta" as const, pairedInclusionId: vagaPermuta.id, pairedNewCity: cidadeSaidaOutro } : {}),
                  },
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
        <DialogContent className="max-w-[460px] p-0 gap-0 rounded-xl overflow-hidden">
          <div className="px-8 py-8">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-success-soft border border-success/25 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="18" r="17" className="stroke-success-strong" strokeWidth="1.5" strokeOpacity="0.25"/>
                  <path d="M10 19L15.5 24.5L26 13" className="stroke-success-strong" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <DialogTitle className="text-base font-bold text-foreground mb-1">Solicitação enviada para aprovação</DialogTitle>
              <p className="text-xs text-muted-foreground leading-relaxed">A troca foi enviada para análise do time de Compras.</p>
            </div>
            <div className="bg-surface-muted rounded-xl border border-border p-4 mb-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Escala</div>
                  <div className="text-xs font-semibold text-foreground leading-tight truncate">{getEventName(inclusion.eventId)}</div>
                  <div className="text-2xs text-muted-foreground leading-tight">Função: {getFunctionName(inclusion.functionId)}</div>
                </div>
                <span className="text-2xs font-medium bg-warning-soft text-warning border border-warning/25 rounded-full px-2.5 py-1 shrink-0 leading-tight">Aguardando aprovação</span>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Colaborador atual</div>
                  <div className="text-xs font-semibold text-slate-700 leading-snug">{currentCollabName}</div>
                </div>
                <div className="w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-2xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Colaborador solicitado</div>
                  <div className="text-xs font-semibold text-primary leading-snug">{newCollabName || "—"}</div>
                  {cidadeSaida && <div className="text-2xs text-muted-foreground leading-snug">Sai de {cidadeSaida}</div>}
                </div>
              </div>
            </div>
            <div className="bg-brand-soft border border-primary/25 rounded-xl px-3.5 py-2.5 mb-5">
              <p className="text-2xs text-primary leading-relaxed">
                <span className="font-semibold">A escala continuará com o colaborador atual</span> até que a troca seja aprovada pelo time de Compras.
                {permuta && vagaPermuta && <> Na troca entre vagas, {currentCollabName} vai para a vaga #{vagaPermuta.inclusionNumber} ({getEventName(vagaPermuta.eventId)}), saindo de {cidadeSaidaOutro}.</>}
              </p>
            </div>
            <Button className="w-full bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl h-10 font-semibold text-sm" onClick={resetAndClose}>
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
