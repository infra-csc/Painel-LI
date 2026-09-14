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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import EscolherColaborador from "./escolher-colaborador";
import type { TeamInclusion, Collaborator } from "@shared/schema";
import ConfirmDialog from "./confirm-dialog";
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
    `flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${on && !travado ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`;
  return (
    <div className="space-y-1.5" data-testid={id}>
      <p id={`${id}-rotulo`} className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <MapPin className="h-3 w-3" aria-hidden="true" /> {rotulo} <span className="text-red-500">*</span>
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
          className={`w-full px-3 py-2 text-[13px] border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${mostrarErro ? "border-red-300" : "border-slate-200"}`}
        />
      )}
      <p className={`text-[10px] leading-snug ${mostrarErro ? "text-red-500" : "text-slate-500"}`}>
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
  /** Permuta (14/09): dois escalados trocam de vaga — o cartão diz quem vai para onde. */
  const permuta = swap.swapKind === "permuta";
  /** Transferência (14/09): alguém de outra vaga entra nesta, que estava aberta. */
  const transferencia = swap.swapKind === "transferencia";

  return (
    <>
      <div className={`rounded-xl border ${v.border} ${v.bg} px-3 py-2.5 space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {v.icon}
            <span className="text-[12px] font-semibold text-slate-700">{permuta ? v.title.replace("Troca", "Troca entre vagas") : transferencia ? v.title.replace("Troca", "Transferência") : v.title}</span>
          </div>
          <span className={`text-[10px] font-medium border rounded-full px-2 py-px leading-tight ${v.badgeClass}`}>{v.badge}</span>
        </div>

        {isResolved ? (
          <div className="bg-white/70 rounded-lg border border-slate-100 p-2 space-y-1.5">
            {permuta ? <LinhasDaPermuta swap={swap} getCollaboratorName={getCollaboratorName} /> : transferencia ? <LinhasDaTransferencia swap={swap} getCollaboratorName={getCollaboratorName} /> : (<>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 line-through">{currentCollabName || "—"}</span>
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className={`font-semibold ${swap.status === "aprovado" ? "text-green-700" : "text-slate-500"}`}>{newCollabName || "—"}</span>
            </div>
            {swap.newCity && (
              <div className="flex items-center gap-1 text-[10px] text-slate-500" data-testid="swap-sai-de-resolvido">
                <MapPin className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span>Sai de <span className="font-semibold text-slate-700">{swap.newCity}</span></span>
              </div>
            )}
            </>)}
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
            {permuta ? (
              <LinhasDaPermuta swap={swap} getCollaboratorName={getCollaboratorName} />
            ) : transferencia ? (
              <LinhasDaTransferencia swap={swap} getCollaboratorName={getCollaboratorName} />
            ) : (
              <>
            <div className="flex items-start gap-1.5 text-[11px]">
              <span className="text-slate-400 shrink-0">Novo colaborador:</span>
              <span className="font-medium text-slate-700">{newCollabName}</span>
            </div>
            <div className="flex items-start gap-1.5 text-[11px]" data-testid="swap-sai-de-pendente">
              <span className="text-slate-400 shrink-0">Sai de:</span>
              <span className="font-medium text-slate-700">{swap.newCity || "não informado (pedido antigo)"}</span>
            </div>
              </>
            )}
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
        title={pendingSwap?.swapKind === "permuta" ? "Aprovar troca entre vagas?" : pendingSwap?.swapKind === "transferencia" ? "Aprovar transferência de colaborador?" : "Aprovar troca de colaborador?"}
        description={pendingSwap?.swapKind === "permuta"
          ? "Confira as duas vagas. Ao confirmar, os dois trocam de vaga ao mesmo tempo, cada um saindo da cidade informada no pedido."
          : pendingSwap?.swapKind === "transferencia"
          ? "Confira as duas vagas. Ao confirmar, a pessoa sai da vaga onde está, entra nesta saindo da cidade informada, e a vaga de origem fica aberta."
          : "Confira os dados do novo colaborador. Ao confirmar, ele assume a vaga e ela passa a sair da cidade informada no pedido."}
        confirmLabel="Confirmar aprovação"
        pendingLabel="Aprovando..."
        isPending={approveSwap.isPending}
        onConfirm={() => { if (pendingSwap) { approveSwap.mutate(pendingSwap.id); setConfirmAction(null); } }}
      >
        {pendingSwap && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[12px]">
            {pendingSwap.swapKind === "permuta" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2" data-testid="swap-permuta-aprovacao">
                <LinhasDaPermuta swap={pendingSwap} getCollaboratorName={getCollaboratorName} />
              </div>
            )}
            {pendingSwap.swapKind === "transferencia" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2" data-testid="swap-transferencia-aprovacao">
                <LinhasDaTransferencia swap={pendingSwap} getCollaboratorName={getCollaboratorName} />
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-slate-400 font-medium shrink-0">Atual:</span>
              <span className="font-semibold text-slate-700">{pendingSwap.currentCollaboratorId ? getCollaboratorName(pendingSwap.currentCollaboratorId) : "vaga aberta"}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-slate-400 font-medium shrink-0">Solicitado:</span>
              <span className="font-semibold text-blue-700">{getCollaboratorName(pendingSwap.newCollaboratorId)}</span>
            </div>
            {/* Só leitura (dono, 14/09): o aprovador vê e decide, não muda nada. */}
            <div className="flex items-start gap-2" data-testid="swap-sai-de-aprovacao">
              <span className="text-slate-400 font-medium shrink-0">Sai de:</span>
              <span className="font-semibold text-slate-700">{pendingSwap.newCity || "cidade do cadastro do novo colaborador (pedido antigo)"}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-slate-400 font-medium shrink-0">Motivo:</span>
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
        <DialogContent className="max-w-[760px] p-0 gap-0 rounded-[14px] overflow-hidden">
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
                    className={`rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${on ? "border-primary bg-brand-soft" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    data-testid={`tipo-de-troca-${k}`}
                  >
                    <span className={`block text-[12px] font-semibold ${on ? "text-primary" : "text-slate-700"}`}>{titulo}</span>
                    <span className="block text-[11px] leading-snug text-slate-500">{desc}</span>
                  </button>
                );
              })}
            </div>
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
              {permuta ? (
              <div>
                <label className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5 block">Vaga do outro colaborador</label>
                {vagaPermuta ? (
                  <div className="rounded-lg border border-primary/30 bg-brand-soft px-3 py-2" data-testid="vaga-permuta-escolhida">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-slate-900 break-words">{getCollaboratorName(vagaPermuta.collaboratorId)}</div>
                        <div className="text-[11px] text-slate-600 break-words">
                          #{vagaPermuta.inclusionNumber} · {getEventName(vagaPermuta.eventId)} · {getFunctionName(vagaPermuta.functionId)} · {periodoCurto(vagaPermuta)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setVagaPermutaId(""); setNewCollaboratorId(""); setSaiDe(saiDeInicial(null)); setSaiDeOutro(saiDeInicial(null)); }}
                        className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
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
                {submitAttempted && !vagaPermuta && <p className="text-[10px] text-red-500 mt-1">Escolha a vaga do outro colaborador.</p>}
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                  Aprovada a troca, os dois trocam de lugar ao mesmo tempo — sem conflito de datas, porque ninguém fica em dois lugares.
                </p>
              </div>
              ) : (
              <div>
                <label className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5 block">Novo colaborador</label>
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
              )}
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
        <DialogContent className="max-w-[460px] p-0 gap-0 rounded-[14px] overflow-hidden">
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
                  {cidadeSaida && <div className="text-[10px] text-slate-500 leading-snug">Sai de {cidadeSaida}</div>}
                </div>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5 mb-5">
              <p className="text-[11px] text-blue-800 leading-relaxed">
                <span className="font-semibold">A escala continuará com o colaborador atual</span> até que a troca seja aprovada pelo time de Compras.
                {permuta && vagaPermuta && <> Na troca entre vagas, {currentCollabName} vai para a vaga #{vagaPermuta.inclusionNumber} ({getEventName(vagaPermuta.eventId)}), saindo de {cidadeSaidaOutro}.</>}
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
