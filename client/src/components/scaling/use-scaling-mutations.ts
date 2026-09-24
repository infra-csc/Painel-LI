/**
 * Mutations da tela de Escalação (toasts + invalidações).
 * Extraído de pages/scaling.tsx. Efeitos locais de UI (fechar um dialog de
 * confirmação, limpar um campo) ficam nos componentes via `mutate(vars, { onSuccess })`.
 */
import { apiErrorMessage, apiErrorStatus, isApiError } from "@/lib/api-error";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { avisarAgenda, AVISO_LOGISTICA_PARA_REVISAR, semAvisos, useCancelarVaga } from "@/hooks/use-vaga-acoes";
import type { TeamInclusion } from "@shared/schema";
import { CENO_FREELA_TIPO_LABELS, type CenoFreelaTipo } from "@shared/cenotecnica-empreita";

export type ScalingSaveAction = "save" | "confirm";

/** Vaga devolvida por PATCH / POST /confirm — com `avisosDeAgenda` quando há aviso (24/09). */
export type TeamInclusionComAvisos = TeamInclusion & { avisosDeAgenda?: unknown };

/**
 * Payload do Salvar (PATCH) e do Confirmar (POST /confirm).
 *
 * NUNCA leva status/phase/previousStatus/dailyRates (24/09): o PATCH responde
 * 400 a status/fase diferentes do atual e `dailyRates` é sempre o tamanho de
 * `workDays` no servidor. `dailyValue` só entra quando o usuário é RH/admin e
 * alterou o valor (403 para os demais) — quem monta o payload decide.
 */
export interface InclusionSavePayload {
  collaboratorId: string;
  /** Empreita por empresa (10/09) — null limpa. */
  empreitaEmpresa?: string | null;
  empreitaPessoas?: number | null;
  empreitaValor?: number | null;
  observations: string;
  city: string;
  atendimentoTipo: string | null;
  percurseiroTipo: string | null;
  needsTicket: boolean | null;
  needsAccommodation: boolean | null;
  dailyValue?: number;
}

const readErrorMessage = async (err: unknown): Promise<string | undefined> => {
  if (!isApiError(err)) return undefined;
  if (err.serverMessage) return err.serverMessage;
  const msg = await err.response.json().catch(() => null);
  return typeof msg?.message === "string" ? msg.message : undefined;
};

/** POST /api/team-inclusions/:id/confirm — o servidor decide status/fase (409 se já confirmada ou com conflito de agenda). */
export async function confirmInclusionRequest(id: string, data: Partial<InclusionSavePayload>): Promise<TeamInclusionComAvisos> {
  const response = await apiRequest("POST", `/api/team-inclusions/${id}/confirm`, data);
  return response.json();
}

export function useScalingMutations(opts: {
  selectedInclusionId: string | undefined;
  currentUserId: string | undefined;
  /** Atualiza o registro selecionado (o modal precisa refletir o backend). */
  setSelectedInclusion: (updater: (prev: TeamInclusion | null) => TeamInclusion | null) => void;
  closeModal: () => void;
  /** Chamado após Salvar/Confirmar com sucesso — a página decide o feedback. */
  onInclusionSaved: (updated: TeamInclusion, action: ScalingSaveAction, thenNext: boolean) => void;
}) {
  const { selectedInclusionId, currentUserId, setSelectedInclusion, closeModal, onInclusionSaved } = opts;
  const { toast } = useToast();

  const invalidateInclusionSwaps = () => {
    // Todas as vagas: a permuta (14/09) mexe em duas.
    queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion"] });
    queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
  };
  const invalidateAndRefetchInclusions = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    queryClient.refetchQueries({ queryKey: ["/api/team-inclusions"] });
  };

  const createSwapRequest = useMutation({
    mutationFn: async (data: {
      teamInclusionId: string; newCollaboratorId: string; reason: string; newCity: string;
      /** Permuta (14/09): a outra vaga e de onde sai quem vai para ela. */
      kind?: "substituicao" | "permuta" | "transferencia"; pairedInclusionId?: string; pairedNewCity?: string;
    }) => {
      const r = await apiRequest("POST", "/api/swap-requests", data);
      return r.json();
    },
    onSuccess: () => invalidateInclusionSwaps(),
    onError: async (err: unknown) => {
      if (apiErrorStatus(err) === 401) {
        toast({
          title: "Sessão expirada",
          description: "Sua sessão expirou. Atualize a página e entre novamente para solicitar a troca.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Não foi possível criar a solicitação", description: (await readErrorMessage(err)) || "Tente de novo em instantes.", variant: "destructive" });
    },
  });

  const cancelSwap = useMutation({
    mutationFn: async (swapId: string) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${swapId}/cancel`, {});
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Solicitação cancelada", description: "A solicitação de troca foi cancelada com sucesso." });
      invalidateInclusionSwaps();
    },
    onError: async (err: unknown) => {
      toast({ title: "Não foi possível cancelar a solicitação", description: (await readErrorMessage(err)) || "Tente de novo em instantes.", variant: "destructive" });
    },
  });

  const approveSwap = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {});
      return r.json() as Promise<{ message?: string; logisticaParaRevisar?: boolean }>;
    },
    onSuccess: (resposta) => {
      toast({ title: "Troca aprovada", description: "O colaborador e a cidade de saída foram atualizados na escalação." });
      // Passagem/hospedagem já registradas para o colaborador antigo (24/09).
      if (resposta?.logisticaParaRevisar) toast({ title: "Compras precisa revisar", description: AVISO_LOGISTICA_PARA_REVISAR });
      invalidateInclusionSwaps();
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: async (err: unknown) => {
      toast({ title: "Não foi possível aprovar a troca", description: (await readErrorMessage(err)) || "Tente de novo em instantes.", variant: "destructive" });
    },
  });

  const rejectSwap = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${id}/reject`, { reviewComment: comment || "" });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Troca rejeitada", description: "A escala permanece com o colaborador atual." });
      invalidateInclusionSwaps();
    },
    onError: async (err: unknown) => {
      toast({ title: "Não foi possível rejeitar a troca", description: (await readErrorMessage(err)) || "Tente de novo em instantes.", variant: "destructive" });
    },
  });

  // Alterna se o escalado emite nota fiscal
  const toggleEmitsNf = useMutation({
    mutationFn: async ({ id, emitsNf }: { id: string; emitsNf: boolean }) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${id}`, { emitsNf });
      return r.json();
    },
    onSuccess: (updatedInclusion: TeamInclusion) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setSelectedInclusion(prev => prev && prev.id === updatedInclusion.id ? { ...prev, emitsNf: updatedInclusion.emitsNf } : prev);
      toast({
        title: updatedInclusion.emitsNf ? "Marcado como emissor de NF" : "Marcado como não emissor de NF",
        description: updatedInclusion.emitsNf
          ? "A tela de Notas Fiscais vai cobrar a nota deste escalado."
          : "A tela de Notas Fiscais não vai cobrar nota deste escalado.",
      });
    },
    onError: async (err: unknown) => {
      toast({ title: "Não foi possível atualizar a emissão de NF", description: (await readErrorMessage(err)) || "Tente de novo em instantes.", variant: "destructive" });
    },
  });

  // Modalidade de EMPREITA do cenotécnico (Freela Viagem / SP / Local A / Local B).
  // Regra do usuário (19/08): o tipo é escolhido NA ESCALAÇÃO, por vaga. Grava
  // na hora pela rota dedicada (espelho de /percurseiro-tipo) — não espera o
  // Salvar do modal, para o Planejado já ver o valor fechado.
  const setCenoFreelaTipo = useMutation({
    mutationFn: async ({ id, cenoFreelaTipo }: { id: string; cenoFreelaTipo: CenoFreelaTipo }) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${id}/ceno-freela-tipo`, { cenoFreelaTipo });
      return r.json() as Promise<TeamInclusion>;
    },
    onSuccess: (updated: TeamInclusion, vars) => {
      setSelectedInclusion(prev => (prev && prev.id === updated.id ? updated : prev));
      invalidateAndRefetchInclusions();
      toast({
        title: "Tipo de freela definido",
        description: `${CENO_FREELA_TIPO_LABELS[vars.cenoFreelaTipo]} — o Planejado passa a usar o valor fechado desta modalidade.`,
      });
    },
    onError: async (err: unknown) => {
      // O 403 pode ser falta de permissão OU evento encerrado — a mensagem do
      // servidor diz qual; só caímos no texto genérico se ela faltar.
      const serverMsg = await readErrorMessage(err);
      const status = apiErrorStatus(err);
      toast({
        title: status === 401 ? "Sessão expirada" : "Não foi possível definir o tipo de freela",
        description: status === 401
          ? "Sua sessão expirou. Atualize a página e entre novamente — o tipo não foi salvo."
          : serverMsg
            || (status === 403 ? "Você não tem permissão para definir o tipo de freela desta cenotécnica." : "Erro ao definir o tipo de freela"),
        variant: "destructive",
      });
    },
  });

  // Reprovação de cenotécnica pelo gestor (remove colaborador, volta p/ escalacao)
  const rejectProduction = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${id}/reject-production`, {});
      return r.json();
    },
    onSuccess: () => {
      closeModal();
      toast({ title: "Escalação reprovada", description: "O colaborador foi removido e a vaga voltou para escalação." });
      invalidateAndRefetchInclusions();
    },
    onError: async (err: unknown) => {
      toast({ title: "Erro ao reprovar", description: (await readErrorMessage(err)) || "Erro ao reprovar escalação", variant: "destructive" });
    },
  });

  // Aprovação de cenotécnica pelo gestor
  const approveProduction = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${id}/approve-production`, {});
      return r.json();
    },
    onSuccess: () => {
      closeModal();
      toast({ title: "Aprovado pelo gestor", description: "Escalação de cenotécnica aprovada e enviada ao fluxo normal." });
      invalidateAndRefetchInclusions();
    },
    onError: async (err: unknown) => {
      toast({ title: "Erro ao aprovar", description: (await readErrorMessage(err)) || "Erro ao aprovar escalação", variant: "destructive" });
    },
  });

  // Reativar escalação cancelada (admin)
  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${id}/reactivate`, {});
      return r.json();
    },
    onSuccess: () => {
      closeModal();
      toast({ title: "Escalação reativada", description: "A escalação foi reativada e voltou ao status Pendente." });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: async (err: unknown) => {
      toast({ title: "Não foi possível reativar a escalação", description: (await readErrorMessage(err)) || "Tente de novo em instantes.", variant: "destructive" });
    },
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      if (!currentUserId || !selectedInclusionId) throw new Error("User or inclusion not found");
      const response = await apiRequest("POST", "/api/comments", {
        teamInclusionId: selectedInclusionId,
        userId: currentUserId,
        content,
        phase: "escalacao",
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ variant: "success", title: "Comentário adicionado", description: "Já aparece no histórico da vaga." });
      queryClient.invalidateQueries({ queryKey: ["/api/comments", selectedInclusionId] });
    },
    onError: (err: unknown) => {
      toast({
        title: apiErrorStatus(err) === 401 ? "Sessão expirada" : "Não foi possível adicionar o comentário",
        description: apiErrorStatus(err) === 401
          ? "Sua sessão expirou. Atualize a página e entre novamente para comentar."
          : apiErrorMessage(err, "Erro ao adicionar comentário"),
        variant: "destructive",
      });
    },
  });

  // Cancelar (POST /cancel, 24/09) — toasts e invalidação no hook compartilhado.
  const cancelInclusion = useCancelarVaga({ onSuccess: closeModal });

  // Salvar (PATCH) e Confirmar (POST /confirm) — mesmo pós-processamento
  const saveInclusion = useMutation({
    mutationFn: async ({ id, data, action }: { id: string; data: InclusionSavePayload; action: ScalingSaveAction; thenNext?: boolean }) => {
      if (action === "confirm") return confirmInclusionRequest(id, data);
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, data);
      return response.json() as Promise<TeamInclusionComAvisos>;
    },
    onSuccess: (resposta, vars) => {
      // `avisosDeAgenda` (duas viagens no mesmo dia) é aviso, não erro — e não
      // entra no registro selecionado.
      const updatedInclusion = semAvisos(resposta) as TeamInclusion;
      avisarAgenda(toast, resposta.avisosDeAgenda);
      // CRITICAL: refletir os dados frescos do backend no registro selecionado
      setSelectedInclusion(prev => (prev && updatedInclusion.id === prev.id ? updatedInclusion : prev));
      invalidateAndRefetchInclusions();
      onInclusionSaved(updatedInclusion, vars.action, !!vars.thenNext);
    },
    onError: (err: unknown) => {
      toast({
        title: apiErrorStatus(err) === 401 ? "Sessão expirada" : "Não foi possível atualizar a escalação",
        description: apiErrorStatus(err) === 401
          ? "Sua sessão expirou. Atualize a página e entre novamente — nada foi salvo."
          : apiErrorMessage(err, "Erro ao atualizar escalação"),
        variant: "destructive",
      });
    },
  });

  return {
    createSwapRequest, cancelSwap, approveSwap, rejectSwap,
    toggleEmitsNf, setCenoFreelaTipo, rejectProduction, approveProduction, reactivate, cancelInclusion,
    addComment, saveInclusion,
  };
}

export type ScalingMutations = ReturnType<typeof useScalingMutations>;
