import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ToastActionElement } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/utils";
import type { ApiError } from "@/components/scaling-validation/types";
import { APPROVAL_QUERY_KEYS, type RequestType, type ReviewBody } from "./types";

type ReviewRequestType = RequestType | string;

/**
 * Texto do toast de sucesso de reajustar/negar, fiel ao que o servidor faz
 * (server/scaling-validation.ts, reviewHandler):
 *  - then 'reenviar_validacao' → pedido volta para a área (inclusão: cria as
 *    vagas como sugestão pendente; ajuste/exclusão: vaga volta a pendente);
 *  - reajustar + aprovar_direto → aplica ajustes e vira Inclusão (inclusão: cria as vagas);
 *  - negar + aprovar_direto → inclusão: nada é criado; ajuste/exclusão: vaga
 *    aprovada como estava e vira Inclusão.
 */
export function reviewOutcomeMessage(kind: "reajustar" | "negar", then: ReviewBody["then"], requestType?: ReviewRequestType): string {
  if (then === "reenviar_validacao") {
    return requestType === "inclusao"
      ? "Devolvido para validação da área. As vagas do pedido foram criadas como sugestões pendentes."
      : "Devolvido para validação da área.";
  }
  // then === "aprovar_direto"
  if (kind === "reajustar") {
    return requestType === "inclusao"
      ? "Ajustes aplicados e vagas criadas já aprovadas (viraram Inclusão)."
      : "Ajustes aplicados e vaga aprovada (virou Inclusão).";
  }
  // negar + aprovar_direto
  if (requestType === "inclusao") return "Pedido negado. Nada foi criado.";
  if (requestType === "exclusao") return "Pedido negado; a vaga foi mantida e aprovada como estava (virou Inclusão).";
  return "Pedido negado; a vaga foi aprovada como estava e virou Inclusão.";
}

/**
 * Respostas que significam "o item já não está mais como você viu": 404 (pedido/vaga
 * sumiu) e 409 (o servidor devolve "Este pedido já foi decidido" — server/scaling-validation.ts,
 * `ALREADY_DECIDED`). Só nesses casos vale recarregar e fechar o que estiver aberto.
 *
 * 400 NÃO entra aqui: no servidor 400 é erro de validação do corpo ("Dados inválidos",
 * mensagens do zod, `editedChanges` inconsistente). Fechar o diálogo nesse caso jogava
 * fora o comentário obrigatório e os campos editados do Reajustar, ainda por cima com
 * uma mensagem enganosa de "este item mudou".
 */
const STALE_STATUSES = new Set([404, 409]);

interface DecisionOptions {
  /** Chamado após sucesso de aprovar/reajustar/negar (fechar Sheet/diálogos). */
  onSettledRequest?: () => void;
  /**
   * Chamado quando o servidor responde 404/409 em qualquer decisão: o item
   * mudou por baixo (outro aprovador decidiu, ou a vaga sumiu). A lista já foi
   * invalidada. Erros de validação (400) e de servidor (5xx) NÃO disparam isto —
   * o diálogo continua aberto para o usuário corrigir e tentar de novo.
   */
  onStale?: () => void;
  /** Ação opcional do toast de sucesso de aprovar/reajustar/negar (ex.: "Abrir próximo pendente"). */
  successAction?: () => ToastActionElement | undefined;
}

/**
 * Mutations das decisões do aprovador. Toda decisão invalida pedidos,
 * sugestões e inclusões (a vaga pode ter virado Inclusão de Equipe).
 */
export function useDecisionMutations(opts: DecisionOptions = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [APPROVAL_QUERY_KEYS.requests] });
    queryClient.invalidateQueries({ queryKey: [APPROVAL_QUERY_KEYS.suggestions] });
    queryClient.invalidateQueries({ queryKey: [APPROVAL_QUERY_KEYS.teamInclusions] });
    queryClient.invalidateQueries({ queryKey: [APPROVAL_QUERY_KEYS.eventView] });
    queryClient.invalidateQueries({ queryKey: ["/api/budget-notes"] });
  };

  const fail = (title: string) => (err: ApiError) => {
    const status = err?.status;

    if (status !== undefined && STALE_STATUSES.has(status)) {
      // Item já decidido/alterado por outra pessoa: avisa, recarrega e fecha o que estiver aberto.
      toast({
        title,
        description: `${apiErrorMessage(err, "Este item mudou desde que você o abriu.")} A lista foi atualizada.`,
        variant: "destructive",
      });
      invalidateAll();
      opts.onStale?.();
      return;
    }

    if (status !== undefined && status >= 500) {
      // Falha do servidor: a mensagem crua não ajuda o usuário. Nada é fechado nem
      // recarregado — o que ele preencheu continua ali para tentar de novo.
      toast({ title, description: "Não foi possível concluir. Tente novamente.", variant: "destructive" });
      return;
    }

    // 400 (validação), 401/403 e falhas de rede: mostra a mensagem real do servidor
    // (apiErrorMessage já traduz 401/403) e mantém diálogo/Sheet abertos.
    toast({ title, description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
  };

  const approve = useMutation({
    mutationFn: async (vars: { id: string; comment?: string }) =>
      (await apiRequest("PATCH", `${APPROVAL_QUERY_KEYS.requests}/${vars.id}/approve`, vars.comment ? { comment: vars.comment } : {})).json(),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Pedido aprovado", description: "A decisão foi aplicada na vaga.", action: opts.successAction?.() });
      opts.onSettledRequest?.();
    },
    onError: fail("Não foi possível aprovar o pedido"),
  });

  const review = useMutation({
    mutationFn: async (vars: { id: string; kind: "reajustar" | "negar"; body: ReviewBody; requestType?: ReviewRequestType }) =>
      (await apiRequest("PATCH", `${APPROVAL_QUERY_KEYS.requests}/${vars.id}/${vars.kind}`, vars.body)).json(),
    onSuccess: (_data, vars) => {
      invalidateAll();
      const what = vars.kind === "reajustar" ? "Pedido reajustado" : "Pedido negado";
      toast({ title: what, description: reviewOutcomeMessage(vars.kind, vars.body.then, vars.requestType), action: opts.successAction?.() });
      opts.onSettledRequest?.();
    },
    onError: (err: ApiError, vars) => fail(vars.kind === "reajustar" ? "Não foi possível reajustar o pedido" : "Não foi possível negar o pedido")(err),
  });

  const bypass = useMutation({
    mutationFn: async (vars: { inclusionId: string; kind: "approve" | "reject"; comment?: string }) =>
      (await apiRequest("PATCH", `${APPROVAL_QUERY_KEYS.suggestions}/${vars.inclusionId}/bypass-${vars.kind}`, vars.comment ? { comment: vars.comment } : {})).json(),
    onSuccess: (_data, vars) => {
      invalidateAll();
      toast({
        title: vars.kind === "approve" ? "Vaga aprovada direto" : "Vaga reprovada",
        description: vars.kind === "approve" ? "A vaga virou Inclusão sem validação da área." : "A vaga fica registrada como negada.",
      });
    },
    onError: (err: ApiError, vars) => fail(vars.kind === "approve" ? "Não foi possível aprovar a vaga" : "Não foi possível reprovar a vaga")(err),
  });

  return { approve, review, bypass, invalidateAll };
}
