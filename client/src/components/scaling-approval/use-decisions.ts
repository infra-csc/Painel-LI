import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
 * Mutations das decisões do aprovador. Toda decisão invalida pedidos,
 * sugestões e inclusões (a vaga pode ter virado Inclusão de Equipe).
 */
export function useDecisionMutations(opts: { onSettledRequest?: () => void } = {}) {
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
    toast({ title, description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
  };

  const approve = useMutation({
    mutationFn: async (vars: { id: string; comment?: string }) =>
      (await apiRequest("PATCH", `${APPROVAL_QUERY_KEYS.requests}/${vars.id}/approve`, vars.comment ? { comment: vars.comment } : {})).json(),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Pedido aprovado", description: "A decisão foi aplicada na vaga." });
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
      toast({ title: what, description: reviewOutcomeMessage(vars.kind, vars.body.then, vars.requestType) });
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
