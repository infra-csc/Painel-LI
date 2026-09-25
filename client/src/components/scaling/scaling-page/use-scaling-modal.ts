/**
 * Modal da vaga na Escalação (25/09 — extraído de pages/scaling.tsx): qual
 * vaga está aberta, o rascunho editado, navegação ‹ › pela lista, trocas já
 * vistas, anexos, as mutations de salvar/confirmar e o payload que vai ao servidor.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TeamInclusion, User } from "@shared/schema";
import { markSwapSeen, getSeenState } from "@/lib/seenSwaps";
import { isRhOrAdmin } from "@/lib/role-utils";
import type { useToast } from "@/hooks/use-toast";
import { toastSucessoDaVaga } from "@/components/common/toast-sucesso";
import type { DetailsTab } from "../inclusion-details-dialog";
import type { SentToProductionInfo } from "../production-approval-card";
import { useInclusionDetails, type ScalingData } from "../use-scaling-data";
import { useScalingMutations, type InclusionSavePayload } from "../use-scaling-mutations";
import { useAttachments } from "../use-attachments";
import { getSaveBlockReason, getConfirmBlockReason } from "../scaling-validation";
import { modalDataFromInclusion, type ModalData, isEscalated } from "../scaling-utils";

type Toast = ReturnType<typeof useToast>["toast"];

const EMPTY_MODAL: ModalData = { collaboratorId: "", observations: "", dailyValue: 0, city: "", departureFromSP: true, atendimentoTipo: "", percurseiroTipo: "", empreitaModo: false, empreitaEmpresa: "", empreitaPessoas: "", empreitaValor: "" };

export function useScalingModal({ user, toast, data, visibleRows }: { user: User | null; toast: Toast; data: ScalingData; visibleRows: TeamInclusion[] }) {
  const { getFunctionName, getCollaboratorName, getAccommodation, getPurchasedTicket, firstSwapByInclusion } = data;

  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<DetailsTab>("resumo");
  const [modalData, setModalData] = useState<ModalData>(EMPTY_MODAL);
  const [abrirEscolhaDeColaborador, setAbrirEscolhaDeColaborador] = useState(false);
  const [sentToProductionInfo, setSentToProductionInfo] = useState<SentToProductionInfo | null>(null);
  /** Direção da navegação que espera a confirmação de descarte. */
  const [descartePendente, setDescartePendente] = useState<-1 | 1 | null>(null);

  // IDs de trocas pendentes já visualizadas pelo solicitante
  const readSeen = () => {
    if (!user) return new Set<string>();
    const state = getSeenState(user.id);
    return new Set(Object.entries(state).filter(([, v]) => v.pendingSeen).map(([k]) => k));
  };
  const [seenSwapIds, setSeenSwapIds] = useState<Set<string>>(readSeen);
  useEffect(() => {
    const handler = () => setSeenSwapIds(readSeen());
    window.addEventListener("swapSeenUpdated", handler);
    return () => window.removeEventListener("swapSeenUpdated", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const details = useInclusionDetails(selectedInclusion?.id);

  // ── Abrir / navegar ─────────────────────────────────────────────────────
  const markInclusionSwapSeen = (inclusionId: string) => {
    if (!user) return;
    const swap = firstSwapByInclusion.get(inclusionId);
    if (!swap || swap.requestedBy !== user.id) return;
    if (swap.status === "pendente") markSwapSeen(user.id, swap.id, "pending");
    else if (["aprovado", "rejeitado"].includes(swap.status)) markSwapSeen(user.id, swap.id, "responded");
  };

  const openInclusion = useCallback((inclusion: TeamInclusion, tab: DetailsTab = "resumo", escolherColaborador = false) => {
    setSelectedInclusion(inclusion);
    setModalData(modalDataFromInclusion(inclusion));
    setModalInitialTab(tab);
    setAbrirEscolhaDeColaborador(escolherColaborador);
    setShowModal(true);
    markInclusionSwapSeen(inclusion.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSwapByInclusion, user?.id]);

  const handleViewComments = (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation();
    openInclusion(inclusion, "comentarios");
  };

  /** "Escalar alguém" na linha: abre o modal já com a escolha do nome aberta. */
  const handleEscalar = (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation();
    openInclusion(inclusion, "resumo", true);
  };

  const navIndex = selectedInclusion ? visibleRows.findIndex(i => i.id === selectedInclusion.id) : -1;
  const modalIsDirty = !!selectedInclusion && JSON.stringify(modalData) !== JSON.stringify(modalDataFromInclusion(selectedInclusion));
  const navigate = useCallback((direction: -1 | 1) => {
    if (navIndex < 0) return;
    const next = visibleRows[navIndex + direction];
    if (!next) return;
    // window.confirm() aparece fora da janela, com a cara do navegador e sem
    // dizer o que se perde. Perguntar sobre trabalho não salvo merece a mesma
    // linguagem do resto da tela.
    if (modalIsDirty) { setDescartePendente(direction); return; }
    openInclusion(next, "resumo");
  }, [navIndex, visibleRows, openInclusion, modalIsDirty]);

  const confirmarDescarte = () => {
    const direcao = descartePendente;
    setDescartePendente(null);
    if (direcao === null || navIndex < 0) return;
    const next = visibleRows[navIndex + direcao];
    if (next) openInclusion(next, "resumo");
  };

  // ── Anexos / lightbox ───────────────────────────────────────────────────
  const prefetchAttachmentIds = useMemo(() => {
    if (!selectedInclusion) return [] as string[];
    return [
      ...(getAccommodation(selectedInclusion.id)?.attachmentIds || []),
      ...(getPurchasedTicket(selectedInclusion.id)?.attachmentIds || []),
    ];
  }, [selectedInclusion, getAccommodation, getPurchasedTicket]);
  const { openAttachment, lightbox, setLightbox } = useAttachments({
    prefetchIds: prefetchAttachmentIds,
    active: showModal && !!selectedInclusion,
    onBeforeOpenLightbox: () => setShowModal(false),
  });

  // ── Mutations ───────────────────────────────────────────────────────────
  const mutations = useScalingMutations({
    selectedInclusionId: selectedInclusion?.id,
    currentUserId: user?.id,
    setSelectedInclusion: (updater) => setSelectedInclusion(prev => updater(prev)),
    closeModal: () => setShowModal(false),
    onInclusionSaved: (updated, action, thenNext) => {
      const collabId = updated.collaboratorId || modalData.collaboratorId || selectedInclusion?.collaboratorId;
      const funcName = getFunctionName(updated.functionId || selectedInclusion?.functionId || null);
      const collabName = collabId ? getCollaboratorName(collabId) : "—";
      const inclusionNumber = updated.inclusionNumber ?? selectedInclusion?.inclusionNumber ?? null;
      if (thenNext) {
        toast({ title: "Alterações salvas", description: `Escalação #${inclusionNumber ?? "—"} · ${collabName}` });
        navigate(1);
        return;
      }
      if (action === "confirm" && updated.status === "aguardando_producao") {
        setSentToProductionInfo({ collaboratorName: collabName, functionName: funcName, inclusionNumber });
        setShowModal(false);
        return;
      }
      // "Salvar" com colaborador escolhido NÃO escala (04/09, #4166): a vaga
      // segue aberta com nome até "Confirmar Escalação" — e é o Confirmar que
      // manda cenotécnica para o gestor. A mensagem precisa dizer isso, senão
      // a pessoa fecha o modal achando que escalou.
      const salvouSemConfirmar = action !== "confirm" && !!updated.collaboratorId && !isEscalated(updated);
      // Toast de sucesso (23/09) no lugar do modal bloqueante "Sucesso" + OK:
      // título diz O QUE aconteceu; o aviso da vaga aberta continua explícito.
      toastSucessoDaVaga(
        action === "confirm" ? "Escalação confirmada" : salvouSemConfirmar ? "Colaborador salvo — vaga ainda aberta" : "Alterações salvas",
        {
          inclusionNumber,
          eventName: data.eventById.get(updated.eventId || selectedInclusion?.eventId || "")?.name ?? "—",
          collaboratorName: collabName,
          functionName: funcName,
        },
        salvouSemConfirmar ? "A vaga continua aberta até você clicar em Confirmar Escalação." : undefined,
      );
      setShowModal(false);
    },
  });

  // ── Salvar / Confirmar ──────────────────────────────────────────────────
  const buildPayload = (inclusion: TeamInclusion): InclusionSavePayload => {
    const payload: InclusionSavePayload = {
      collaboratorId: modalData.collaboratorId,
      observations: modalData.observations,
      city: modalData.departureFromSP ? "São Paulo - SP" : (modalData.city || ""),
      atendimentoTipo: modalData.atendimentoTipo || null,
      percurseiroTipo: modalData.percurseiroTipo || null,
      // CRÍTICO: preservar campos de necessidade de passagem/hospedagem
      needsTicket: inclusion.needsTicket,
      needsAccommodation: inclusion.needsAccommodation,
    };
    // Empreita por empresa (10/09): sem colaborador, sem passagem/hospedagem;
    // valor entra em centavos. Desligar o modo limpa os três campos.
    if (modalData.empreitaModo) {
      payload.collaboratorId = "";
      payload.empreitaEmpresa = modalData.empreitaEmpresa.trim();
      payload.empreitaPessoas = Number(modalData.empreitaPessoas);
      payload.empreitaValor = Math.round(Number(modalData.empreitaValor) * 100);
      payload.needsTicket = false;
      payload.needsAccommodation = false;
    } else if (inclusion.empreitaEmpresa) {
      payload.empreitaEmpresa = null;
      payload.empreitaPessoas = null;
      payload.empreitaValor = null;
    }
    // Valor da diária é dinheiro (24/09): o PATCH responde 403 se ele MUDAR por
    // quem não é RH/admin. Só entra no corpo quando o usuário pode e alterou.
    if (modalData.dailyValue && modalData.dailyValue > 0 && isRhOrAdmin(user)) {
      const centavos = Math.round(modalData.dailyValue * 100);
      if (centavos !== Number(inclusion.dailyValue ?? 0)) payload.dailyValue = centavos;
    }
    return payload;
  };

  const handleSave = (thenNext: boolean) => {
    if (!selectedInclusion || mutations.saveInclusion.isPending) return;
    if (getSaveBlockReason(selectedInclusion, modalData, data)) return;
    mutations.saveInclusion.mutate({ id: selectedInclusion.id, data: buildPayload(selectedInclusion), action: "save", thenNext });
  };

  const handleConfirm = () => {
    if (!selectedInclusion || mutations.saveInclusion.isPending) return;
    if (getConfirmBlockReason(selectedInclusion, modalData, data)) return;
    // status/fase são decididos no servidor (POST /confirm)
    mutations.saveInclusion.mutate({ id: selectedInclusion.id, data: buildPayload(selectedInclusion), action: "confirm" });
  };

  return {
    selectedInclusion, showModal, setShowModal, modalInitialTab, modalData, setModalData, abrirEscolhaDeColaborador,
    sentToProductionInfo, setSentToProductionInfo, descartePendente, setDescartePendente, seenSwapIds, details,
    openInclusion, handleViewComments, handleEscalar, navIndex, navigate, confirmarDescarte,
    openAttachment, lightbox, setLightbox, mutations, handleSave, handleConfirm,
  };
}

export type ScalingModal = ReturnType<typeof useScalingModal>;
