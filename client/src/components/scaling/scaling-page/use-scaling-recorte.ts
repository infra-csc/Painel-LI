/**
 * As camadas do recorte da Escalação (25/09 — extraídas de pages/scaling.tsx).
 *
 * Cada camada serve de base ao contador do filtro seguinte: o número ao lado
 * de uma opção responde "quantas sobram se eu marcar ISTO mantendo o resto".
 * Aqui também moram os contextos compartilhados pela fila, pelos filtros e
 * pelas Análises, e os textos do topo (resumo, contagem, nomes dos filtros).
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import type { TeamInclusion, User } from "@shared/schema";
import { buildDateList } from "@/components/scaling-validation/scaling-grid-utils";
import type { SuggestionRow } from "@/components/scaling-validation/types";
import type { ScalingData } from "../use-scaling-data";
import { getBulkConfirmBlockReason } from "../scaling-validation";
import { fazTesteDePeriodo, fazTesteDeRecorte, rotuloDoPeriodo, temRecorteDePeriodo, type RecorteDeEventos } from "../scaling-period";
import { ordenarEscalacoes } from "../scaling-sort";
import { getScalingStatusLabel } from "../scaling-status";
import { FLAG_GROUPS, contarFlagsAtivas, fazTesteDeFlags, normalizarBusca, testeDaFila, QUEUE_META, type QueueContext } from "../scaling-queue";
import type { AnalyticsContext } from "../scaling-analytics-data";
import type { ScalingFiltersState } from "./use-scaling-filters";

export function useScalingRecorte({ data, filtros, user }: { data: ScalingData; filtros: ScalingFiltersState; user: User | null }) {
  const { aba, fila, busca, periodo, flags, verExcluidos, recorteEventos, sortConfig, hoje, eventosMarcados, funcoesMarcadas, temRecorte } = filtros;
  const { teamInclusions, scalingInclusions, pendingSwapByInclusion, getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity } = data;

  // ── Contexto compartilhado pela fila, pelos filtros e pelas Análises ─────
  /**
   * Motivo de bloqueio por linha, memoizado.
   *
   * Depende de `filteredTeamInclusions` (o recorte de permissão) e NÃO da
   * lista já ordenada: ordenar não muda quem pode ser confirmado, e usar a
   * lista ordenada fazia este mapa — 3.700 avaliações que varrem conflito de
   * agenda — ser refeito a cada clique num cabeçalho de coluna.
   */
  const bulkBlockReasonById = useMemo(
    () => new Map(data.filteredTeamInclusions.map(i => [i.id, getBulkConfirmBlockReason(i, data)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.filteredTeamInclusions, teamInclusions, data.functionById, data.eventById, data.collaboratorById, data.userFunctionIds, user?.id, user?.role],
  );
  const getSelectBlockReason = useCallback(
    (inclusion: TeamInclusion) => bulkBlockReasonById.get(inclusion.id) ?? getBulkConfirmBlockReason(inclusion, data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bulkBlockReasonById],
  );

  const queueContext = useMemo<QueueContext>(() => ({
    temNome: (i) => !!i.collaboratorId || vagaComEmpreita(i),
    temTroca: (i) => pendingSwapByInclusion.has(i.id),
    temPedido: (i) => !!data.pendingChangeByInclusion?.get(i.id),
    bloqueioParaConfirmar: getSelectBlockReason,
    temPassagemComprada: (i) => data.purchasedTicketByInclusion.has(i.id),
    temHospedagemReservada: (i) => data.accommodationByInclusion.has(i.id),
    ehCenoEmpreita: (i) => data.isCenotecnicaFunction(i.functionId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pendingSwapByInclusion, data.pendingChangeByInclusion, data.purchasedTicketByInclusion, data.accommodationByInclusion, getSelectBlockReason]);

  const analyticsContext = useMemo<AnalyticsContext>(() => ({
    temNome: queueContext.temNome,
    temTroca: queueContext.temTroca,
    temPedido: queueContext.temPedido,
    getEventName, getFunctionName, getCollaboratorName,
    getEventDates: (id) => (id ? data.eventById.get(id) : undefined),
    // Passagem registrada = emitida para o time (18/09); hotel registrado = reservado.
    temPassagem: (i) => data.purchasedTicketByInclusion.has(i.id),
    temHotel: (i) => data.accommodationByInclusion.has(i.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [queueContext, data.eventById, data.functionById, data.collaboratorById, data.purchasedTicketByInclusion, data.accommodationByInclusion]);

  // ── As camadas do recorte ───────────────────────────────────────────────
  // Datas dos eventos: permitem medir o período pela DATA DO EVENTO (22/09).
  const datasDoEvento = useCallback((id: string | null | undefined) => (id ? data.eventById.get(id) : undefined), [data.eventById]);
  const testePeriodo = useMemo(() => fazTesteDePeriodo(periodo, hoje, datasDoEvento), [periodo, hoje, datasDoEvento]);
  const testeRecorte = useMemo(() => fazTesteDeRecorte(recorteEventos, hoje), [recorteEventos, hoje]);
  // Função entra na mesma camada do evento/período: é recorte "do que existe",
  // não filtro de trabalho — a fila e os contadores contam sobre ela.
  const testeFuncao = useMemo(() => {
    if (funcoesMarcadas.length === 0) return () => true;
    const set = new Set(funcoesMarcadas);
    return (i: TeamInclusion) => set.has(i.functionId);
  }, [funcoesMarcadas]);
  const comPeriodo = useMemo(
    () => scalingInclusions.filter((i) => testePeriodo(i) && testeRecorte(i) && testeFuncao(i)),
    [scalingInclusions, testePeriodo, testeRecorte, testeFuncao],
  );
  // Análises (18/09): as vagas ainda na Validação/Aprovação de Escala, com o
  // MESMO recorte da tela (evento, período, futuros/realizados, função e quem
  // vê o quê). Só são buscadas com a aba aberta — a fila não precisa delas.
  const { data: sugestoesRaw } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions?phase=sugestao"],
    enabled: aba === "analises",
    staleTime: 60_000,
  });
  const sugestoesDoRecorte = useMemo(() => {
    const veemTodasAsFuncoes = ["production", "function_area", "purchasing", "financial"];
    return (sugestoesRaw ?? []).filter((i) => {
      if (i.deletedAt) return false;
      const ev = data.eventById.get(i.eventId);
      if (!ev || ev.status === "excluído" || ev.status === "excluido") return false;
      if (eventosMarcados.length > 0 && !eventosMarcados.includes(i.eventId)) return false;
      const podeVer = data.isAdminRole || veemTodasAsFuncoes.includes(String(user?.role ?? "")) || data.userFunctionIds.has(i.functionId);
      return podeVer && testePeriodo(i) && testeRecorte(i) && testeFuncao(i);
    });
  }, [sugestoesRaw, data.eventById, data.isAdminRole, data.userFunctionIds, user?.role, eventosMarcados, testePeriodo, testeRecorte, testeFuncao]);

  // Opções de função: base com tudo aplicado menos a própria função.
  const opcoesDeFuncao = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of scalingInclusions) {
      if (!testePeriodo(i) || !testeRecorte(i)) continue;
      conta.set(i.functionId, (conta.get(i.functionId) ?? 0) + 1);
    }
    return Array.from(conta.entries()).map(([id, n]) => ({ id, nome: getFunctionName(id), n }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scalingInclusions, testePeriodo, testeRecorte, data.functionById]);
  // Contador de cada posição do recorte: tudo aplicado menos ele.
  const contagemPorRecorte = useMemo<Record<RecorteDeEventos, number>>(() => {
    const base = scalingInclusions.filter((i) => testePeriodo(i) && testeFuncao(i));
    const t = { futuros: fazTesteDeRecorte("futuros", hoje), realizados: fazTesteDeRecorte("realizados", hoje) };
    return { futuros: base.filter(t.futuros).length, realizados: base.filter(t.realizados).length, todos: base.length };
  }, [scalingInclusions, testePeriodo, testeFuncao, hoje]);

  const comBusca = useMemo(() => {
    const q = normalizarBusca(busca.replace(/#/g, ""));
    if (!q) return comPeriodo;
    return comPeriodo.filter((i) =>
      String(i.inclusionNumber ?? "").includes(q) ||
      normalizarBusca(getCollaboratorName(i.collaboratorId)).includes(q) ||
      normalizarBusca(getFunctionName(i.functionId)).includes(q) ||
      normalizarBusca(getEventName(i.eventId)).includes(q) ||
      normalizarBusca(i.city ?? getCollaboratorCity(i.collaboratorId) ?? "").includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comPeriodo, busca, data.collaboratorById, data.functionById, data.eventById]);

  const testeFlags = useMemo(() => fazTesteDeFlags(flags, queueContext), [flags, queueContext]);
  const comFlags = useMemo(() => comBusca.filter(testeFlags), [comBusca, testeFlags]);
  /**
   * Relatório "O que falta" (18/09): sem filtro de situação, entra também o que
   * está na validação e na aprovação; com filtro (ex.: "Salvo · falta
   * confirmar"), segue o filtro. Memoizado: o diálogo recalcula a cada troca.
   */
  const linhasDoRelatorio = useMemo(
    () => (Object.values(flags).some(Boolean) ? comFlags : [...comFlags, ...sugestoesDoRecorte]),
    [flags, comFlags, sugestoesDoRecorte],
  );

  const contagensDaFila = useMemo(() => {
    const out = {} as Record<string, number>;
    // A fila conta sobre o recorte de evento/período/excluídas — não sobre a
    // busca nem sobre os grupos: ela precisa dizer quanto trabalho EXISTE,
    // não quanto sobrou do filtro que você acabou de montar.
    for (const { key } of QUEUE_META) out[key] = comPeriodo.filter(testeDaFila(key, queueContext)).length;
    return out as Record<(typeof QUEUE_META)[number]["key"], number>;
  }, [comPeriodo, queueContext]);

  const daFila = useMemo(
    () => (fila ? comFlags.filter(testeDaFila(fila, queueContext)) : comFlags),
    [comFlags, fila, queueContext],
  );

  const visibleRows = useMemo(
    () => ordenarEscalacoes(daFila, sortConfig, {
      getEventName, getFunctionName, getCollaboratorName, getScalingStatusLabel,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daFila, sortConfig, data.eventById, data.functionById, data.collaboratorById],
  );

  const opcoesDeEvento = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of data.filteredTeamInclusions) {
      if (!verExcluidos && (i.status === "cancelado" || i.deletedAt)) continue;
      conta.set(i.eventId, (conta.get(i.eventId) ?? 0) + 1);
    }
    return Array.from(conta.entries()).map(([id, n]) => ({ id, nome: getEventName(id), n }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.filteredTeamInclusions, verExcluidos, data.eventById]);

  /**
   * Quadro função × dia (04/09) — o mesmo da Validação, sobre as vagas do
   * recorte. Quem escala abria a Validação para saber "quantas pessoas por
   * dia" e voltava aqui para escalar; agora a visão mora nas duas telas.
   * Vaga sem dias listados usa o período de trabalho; cancelada não soma.
   */
  const linhasDoQuadro = useMemo<SuggestionRow[]>(() => comFlags.map((i) => {
    const listados = (i.workDays ?? []).map((d) => String(d).slice(0, 10)).filter(Boolean);
    const inicio = i.scheduleStartDate ? String(i.scheduleStartDate).slice(0, 10) : "";
    const fim = i.scheduleEndDate ? String(i.scheduleEndDate).slice(0, 10) : "";
    const dias = listados.length > 0 ? listados : (inicio && fim ? buildDateList(inicio, fim) : []);
    return {
      ...i,
      workDays: dias,
      status: i.status === "cancelado" ? SUGESTAO_STATUS.NEGADA : i.status,
      canEdit: false, canDecide: false, daysPending: 0, pendingRequest: null, lastDecision: null, lastVagaDecision: null,
    } as unknown as SuggestionRow;
  }), [comFlags]);
  const nomesDasFuncoes = useMemo(
    () => new Map(Array.from(data.functionById.values()).map((f) => [f.id, f.name] as const)),
    [data.functionById],
  );

  // ── Textos do topo ──────────────────────────────────────────────────────
  // O resumo do topo e a contagem da barra falam do MESMO universo (o recorte
  // de evento, período e excluídas). Contar vivas aqui e todas ali punha dois
  // números diferentes na mesma tela para o mesmo recorte.
  const resumoTopo = (() => {
    if (comPeriodo.length === 0) return "nenhuma vaga no recorte";
    const semNome = comPeriodo.filter(i => !i.collaboratorId && !vagaComEmpreita(i) && i.status !== "cancelado").length;
    const nEventos = new Set(comPeriodo.map(i => i.eventId)).size;
    return [
      `${comPeriodo.length} ${comPeriodo.length === 1 ? "vaga" : "vagas"} em ${nEventos} ${nEventos === 1 ? "evento" : "eventos"}`,
      semNome > 0 ? `${semNome} sem nome` : null,
    ].filter(Boolean).join(" · ");
  })();

  /*
   * A contagem segue a aba: a Fila mostra o que a tabela lista (com o bloco da
   * fila de trabalho aplicado), as Análises mostram o que os gráficos e o
   * relatório usam. Uma contagem só diria "18 vagas" ao lado de um painel que
   * analisa 3.741.
   */
  const linhasDaAba = aba === "fila" ? visibleRows : comFlags;
  const contagem = temRecorte && linhasDaAba.length !== comPeriodo.length
    ? `${linhasDaAba.length} de ${comPeriodo.length} vagas`
    : `${linhasDaAba.length} ${linhasDaAba.length === 1 ? "vaga" : "vagas"}`;

  const rotuloDasFlags = contarFlagsAtivas(flags) ? FLAG_GROUPS.flatMap(g => g.opcoes).filter(o => flags[o.key]).map(o => o.label).join(", ") : null;
  const nomesDosFiltrosAtivos = [
    busca.trim() ? `“${busca.trim()}”` : null,
    eventosMarcados.length ? `${eventosMarcados.length} ${eventosMarcados.length === 1 ? "evento" : "eventos"}` : null,
    funcoesMarcadas.length ? `${funcoesMarcadas.length} ${funcoesMarcadas.length === 1 ? "função" : "funções"}` : null,
    temRecorteDePeriodo(periodo) ? "período" : null,
    rotuloDasFlags,
    fila ? QUEUE_META.find(q => q.key === fila)?.label.toLowerCase() ?? null : null,
  ].filter(Boolean).join(" · ");

  /*
   * O que o relatório exportado declara como recorte.
   *
   * Busca e situações entraram junto com a barra de filtros nas Análises: elas
   * passaram a recortar o que sai no arquivo, e um cabeçalho que só citasse
   * evento e período diria um recorte e entregaria outro.
   */
  const nomesDosFiltrosDoRecorte = [
    eventosMarcados.length ? `${eventosMarcados.length} ${eventosMarcados.length === 1 ? "evento" : "eventos"}` : null,
    funcoesMarcadas.length ? `funções: ${funcoesMarcadas.map((id) => getFunctionName(id)).join(", ")}` : null,
    temRecorteDePeriodo(periodo) ? rotuloDoPeriodo(periodo) : null,
    busca.trim() ? `busca “${busca.trim()}”` : null,
    rotuloDasFlags,
    verExcluidos ? "incluindo excluídas" : null,
    recorteEventos === "realizados" ? "só eventos realizados" : recorteEventos === "todos" ? "eventos passados incluídos" : null,
  ].filter(Boolean).join(" · ");

  return {
    getSelectBlockReason, queueContext, analyticsContext, datasDoEvento,
    comPeriodo, sugestoesDoRecorte, opcoesDeFuncao, contagemPorRecorte, comBusca, comFlags, linhasDoRelatorio,
    contagensDaFila, visibleRows, opcoesDeEvento, linhasDoQuadro, nomesDasFuncoes,
    resumoTopo, contagem, nomesDosFiltrosAtivos, nomesDosFiltrosDoRecorte,
  };
}

export type ScalingRecorte = ReturnType<typeof useScalingRecorte>;
