/**
 * Estado do modal "Detalhes da Escalação" (25/09 — extraído do dialog):
 * aba ativa, escolha de colaborador, sub-diálogos, navegação ‹ › pelo teclado,
 * travas (evento encerrado, pedido em análise) e os Valores Padrão.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PAST_EVENT_BLOCK_MSG } from "@shared/event-window";
import { isCenotecnicaFunction as isCenoEmpreitaFunction } from "@shared/alimentacao";
import { pendingRequestLock, podePedirAjuste, useChangeWindow } from "../adjust-request-panel";
import type { InclusionDetailsDialogProps } from "./details-shared";
import { isTypingTarget } from "./details-shared";

export function useInclusionDialogState(props: InclusionDetailsDialogProps) {
  const { open, inclusion, initialTab, abrirEscolhaDeColaborador = false, data, details, user, navIndex, navTotal, onNavigate } = props;

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showSwapModal, setShowSwapModal] = useState(false);
  /** Transferência (14/09): quem, escalado em outra vaga do período, é pedido para esta vaga aberta. */
  const [transferirColaboradorId, setTransferirColaboradorId] = useState<string | null>(null);
  /**
   * A lista de nomes está aberta dentro do cartão. Nasce aberta quando a vaga
   * chegou vazia ou quando o clique veio do "Escalar alguém" da linha — nos
   * dois casos a pessoa já disse o que quer fazer.
   */
  const [escolhendoColaborador, setEscolhendoColaborador] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);
  /** Diálogo "Pedir ajuste" — aberto pelo cartão do Resumo OU pelo rodapé fixo (14/09). */
  const [pedirAjusteAberto, setPedirAjusteAberto] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Valores Padrão (tabelas do percurseiro e da empreita de cenotécnica) — só
  // busca quando a função é de percurso ou de cenotécnica; sem resposta,
  // percurseiroDiariaCents / cenoEmpreitaTotalCents caem nos defaults do shared.
  const isPercursoInclusion = !!inclusion && data.isPercursoInclusion(inclusion);
  const isCenoEmpreitaInclusion = !!inclusion && isCenoEmpreitaFunction(data.getFunctionName(inclusion.functionId));
  // Sem `queryFn` caseiro (23/09): o padrão do queryClient checa `res.ok`,
  // trata 401 e HTML de servidor desatualizado — o de antes gravava o corpo
  // do erro no cache como se fossem os valores.
  const { data: systemSettings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
    enabled: open && (isPercursoInclusion || isCenoEmpreitaInclusion),
    staleTime: 5 * 60 * 1000,
  });

  // A escolha acompanha a vaga: reabre sozinha na que está sem nome e fecha
  // ao navegar para uma que já tem.
  useEffect(() => {
    if (!open) { setEscolhendoColaborador(false); return; }
    setEscolhendoColaborador(abrirEscolhaDeColaborador || !inclusion?.collaboratorId);
  }, [open, inclusion?.id, abrirEscolhaDeColaborador, inclusion?.collaboratorId]);

  // Ao abrir (ou navegar para outra escalação) volta para a aba pedida
  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setShowAllLogs(false);
  }, [open, inclusion?.id, initialTab]);

  const hasPrev = navIndex > 0;
  const hasNext = navIndex >= 0 && navIndex < navTotal - 1;

  // Atalhos ← → quando o foco não está num campo de texto nem num sub-dialog
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      // Nas abas (Radix roving focus) e em combobox/radiogroup as setas já têm dono
      const role = (e.target as HTMLElement | null)?.getAttribute?.("role");
      if (role === "tab" || role === "radio" || role === "option" || role === "combobox" || role === "slider") return;
      const target = e.target as Node | null;
      const inside = target === document.body || (!!contentRef.current && !!target && contentRef.current.contains(target));
      if (!inside) return; // foco num dialog aninhado (troca, confirm…)
      if (e.key === "ArrowLeft" && hasPrev) { e.preventDefault(); onNavigate(-1); }
      if (e.key === "ArrowRight" && hasNext) { e.preventDefault(); onNavigate(1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hasPrev, hasNext, onNavigate]);

  // Evento encerrado (regra 20/08): só o administrador age. Espelha o
  // 403 do servidor — nenhuma ação daqui pode prometer o que a API vai negar.
  const eventLocked = !!inclusion && data.isEventLocked(inclusion);
  const eventLockReason = eventLocked ? PAST_EVENT_BLOCK_MSG : null;
  // Pedido de ajuste em análise: a escalação inteira fica travada até o
  // aprovador decidir (mesma consulta do painel "Precisa mudar algo?").
  const changeWindow = useChangeWindow(inclusion?.id, open && !!inclusion?.id);
  const requestLockReason = pendingRequestLock(changeWindow.data);
  const mostrarPedirAjusteNoRodape = podePedirAjuste(changeWindow.data);
  /** Um motivo só para os cartões internos: pedido em análise vence evento encerrado. */
  const actionLockReason = requestLockReason ?? eventLockReason;

  const getUserName = (userId: string): string => {
    if (user?.id === userId) return "Você";
    return details.users?.find(u => u.id === userId)?.name || "Usuário";
  };

  const selectedTicket = inclusion ? data.getTicket(inclusion.id) : undefined;
  const accommodation = inclusion ? data.getAccommodation(inclusion.id) : undefined;

  return {
    activeTab, setActiveTab, showAllLogs, setShowAllLogs, newComment, setNewComment,
    showSwapModal, setShowSwapModal, transferirColaboradorId, setTransferirColaboradorId,
    escolhendoColaborador, setEscolhendoColaborador, showReactivateConfirm, setShowReactivateConfirm,
    pedirAjusteAberto, setPedirAjusteAberto, contentRef,
    isPercursoInclusion, isCenoEmpreitaInclusion, systemSettings,
    hasPrev, hasNext, eventLocked, requestLockReason, mostrarPedirAjusteNoRodape, actionLockReason,
    getUserName, selectedTicket, accommodation,
  };
}

export type InclusionDialogState = ReturnType<typeof useInclusionDialogState>;
