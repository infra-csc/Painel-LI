// Extraído de invoices.tsx em 25/09 (modularização): as consultas da tela de
// Notas Fiscais e os derivados que a página, o stepper e as abas consomem
// (nomes, elegibilidade de NF, contagens por etapa). Separado da
// apresentação para a página virar só composição.
//
// Os resolvedores (`getName`, `getInvoice`…) são memoizados aqui para o
// `React.memo` do card e da linha da tabela ter efeito — não muda resultado.
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useQueriesState } from "@/components/common/query-state";
import type { BudgetActual, Collaborator, Event, Function as FunctionRow, Invoice, PaymentCompany, TeamInclusion } from "@shared/schema";
import { isNfEligible, nfIsentaPorEscalacao } from "@shared/prestacao-rules";

export function useInvoicesData(selectedEventId: string) {
  const qEvents = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const activeEvents = useMemo(() => (qEvents.data ?? []).filter(e => e.status !== "excluído"), [qEvents.data]);

  const { data: paymentCompanies = [] } = useQuery<PaymentCompany[]>({ queryKey: ["/api/payment-companies"] });

  const qInvoices = useQuery<Invoice[]>({
    queryKey: ["/api/invoices", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/invoices?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });
  const invoices = useMemo(() => qInvoices.data ?? [], [qInvoices.data]);

  const qActuals = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/budget-actual?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });
  const budgetActuals = useMemo(() => qActuals.data ?? [], [qActuals.data]);

  const qCollaborators = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const qFunctions = useQuery<FunctionRow[]>({ queryKey: ["/api/functions"] });
  const collaborators = useMemo(() => qCollaborators.data ?? [], [qCollaborators.data]);
  const functions = useMemo(() => qFunctions.data ?? [], [qFunctions.data]);

  // Escalação do evento — fonte da flag "emite NF" de cada escalado
  const qInclusions = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", selectedEventId, "invoices"],
    queryFn: () => apiRequest("GET", `/api/team-inclusions?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });
  const teamInclusions = useMemo(() => qInclusions.data ?? [], [qInclusions.data]);

  // Erro/carregando (23/09): eram 9 consultas sem tratamento — a falha virava
  // "Nenhum colaborador com Realizado enviado". Um só aviso; "Tentar de novo"
  // refaz apenas o que falhou. Enquanto carrega, skeleton em vez do vazio falso.
  const estado = useQueriesState([qEvents, qCollaborators, qFunctions, qInvoices, qActuals, qInclusions]);
  const dataLoading = !!selectedEventId && estado.isLoading;

  const getName     = useCallback((id?: string | null) => collaborators.find(c => c.id === id)?.fullName || "—", [collaborators]);
  const getFuncName = useCallback((id?: string | null) => functions.find(f => f.id === id)?.name     || "—", [functions]);

  // Definido na escalação: se false, a tela não cobra NF deste colaborador.
  // Regra única em @shared/prestacao-rules — mesma da tela Controle de
  // Prestações (as cópias locais tinham divergido).
  const emitsNfFor = useCallback((actual: BudgetActual): boolean =>
    !nfIsentaPorEscalacao(
      teamInclusions,
      actual.collaboratorId,
      actual.functionId,
      actual.eventId ?? selectedEventId,
    ), [teamInclusions, selectedEventId]);

  // Elegibilidade da NF vem de @shared/prestacao-rules — a mesma regra que o
  // servidor aplica. Antes cada tela tinha sua cópia e elas divergiram.
  const approvedActuals = useMemo(() => budgetActuals.filter(
    a => isNfEligible(a) && !a.splitParentId
  ), [budgetActuals]);

  const getInvoice = useCallback((actualId: string) =>
    invoices.find(inv => inv.budgetActualId === actualId), [invoices]);

  // Ids dos itens NF-elegíveis do Realizado — mesmo recorte do Controle RH (rh-control).
  const eligibleActualIds = new Set(approvedActuals.map(a => a.id));

  // "Lançamento": itens NF-elegíveis que ainda dependem do colaborador — sem NF enviada
  // ("Aguardando lançamento") ou com NF devolvida. Equivale a "Aguardando lançamento"
  // + "NF devolvida" do card "Aguardando Colaborador" do Controle RH.
  const pendingCount  = approvedActuals.filter(a => {
    if (!emitsNfFor(a)) return false; // não emite NF — nada a cobrar
    const inv = getInvoice(a.id);
    return !inv || inv.status === "pendente" || inv.status === "devolvida";
  }).length;
  // "Aprovação RH" (em análise): NFs enviadas de itens NF-elegíveis — mesmo critério do Controle RH.
  const rhPendingCount = invoices.filter(i => i.status === "enviada" && eligibleActualIds.has(i.budgetActualId ?? "")).length;
  // "Check-in": NFs aprovadas de itens NF-elegíveis ainda sem check-in financeiro.
  const checkinPendingCount = invoices.filter(i => i.status === "aprovada" && !i.checkinAt && eligibleActualIds.has(i.budgetActualId ?? "")).length;

  return {
    qEvents,
    activeEvents,
    paymentCompanies,
    invoices,
    budgetActuals,
    estado,
    dataLoading,
    getName,
    getFuncName,
    emitsNfFor,
    approvedActuals,
    getInvoice,
    pendingCount,
    rhPendingCount,
    checkinPendingCount,
  };
}
