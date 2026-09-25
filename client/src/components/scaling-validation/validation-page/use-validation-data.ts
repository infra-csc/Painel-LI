/**
 * Dados da Validação de escala (25/09 — extraído da página): consultas, escopo
 * do usuário (o que ele valida), filtros da barra e o resumo.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, User as UserType } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { SUGESTAO_STATUS, pendingSeverity } from "@shared/scaling-validation-rules";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import type { SortConfig } from "@/components/common/sortable-header";
import type { SuggestionSortField } from "@/components/scaling-validation/suggestions-list";
import { useEscalaManagers } from "@/components/scaling-validation/use-escala-managers";
import { SUGGESTIONS_QUERY_KEY, canActOn, canValidate, workDaysOf, type FunctionWithManagers, type SuggestionRow } from "@/components/scaling-validation/types";
import { KPI_MATCH, NO_NAMES, type KpiFiltro } from "./validation-shared";

export interface UseValidationDataArgs {
  user: UserType | null;
  eventId: string;
  sanitize: (ids: string[]) => void;
}

export function useValidationData({ user, eventId, sanitize }: UseValidationDataArgs) {
  // Nomes dos responsáveis: o cadastro da Escala guarda ids.
  const { data: usuariosParaNome } = useQuery<UserType[]>({ queryKey: ["/api/users"] });
  const isAdmin = normalizeRole(user?.role) === "admin";
  const canAccess = hasPermission(user, "canAccessScalingValidation");
  /** Papel que VALIDA (matriz §7: admin e área responsável). Logística/compras/RH só acompanham. */
  const canValidateByRole = hasPermission(user, "canEditScalingValidation");

  const [search, setSearch] = useState("");
  /**
   * A busca filtra com o valor ADIADO (04/09): o campo responde na hora e a
   * lista (200 linhas, ordenação, agrupamento) corre atrás no próximo quadro —
   * sem isso cada tecla travava o campo por um instante.
   */
  const deferredSearch = useDeferredValue(search);
  /** Funções marcadas (15/09: seleção múltipla). Vazio = todas. */
  const [functionFilter, setFunctionFilter] = useState<Set<string>>(() => new Set());
  const [onlyMine, setOnlyMine] = useState(false);
  /**
   * Card do resumo que está filtrando a lista (04/09). Antes só "Minhas
   * pendentes" respondia ao clique; os outros cinco tinham cara de botão e não
   * faziam nada — o usuário clicava em "Aguardando aprovação" e a lista não
   * mudava. Um card de cada vez: eles são recortes exclusivos por status.
   */
  const [kpiFiltro, setKpiFiltro] = useState<KpiFiltro | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig<SuggestionSortField> | null>(null);

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: funcoesCruas, isLoading: loadingFunctions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  // `managers` desta tela vem do cadastro PRÓPRIO da Escala (27/08), não da
  // lista clássica de responsáveis da função.
  const { functions } = useEscalaManagers(funcoesCruas, usuariosParaNome);
  /**
   * Permissões ainda carregando (04/09): enquanto /api/functions não responde a
   * tela não sabe se o usuário valida alguma função. Em vez de mostrar o botão
   * e depois trocá-lo pelo banner de modo leitura (salto de layout), o botão
   * vira um esqueleto e o lugar do banner fica reservado.
   */
  const permissoesCarregando = loadingFunctions && !functions;
  // Sem evento a rota devolve as vagas em validação de TODOS os eventos (o
  // servidor aplica o teto de ALL_EVENTS_ROW_LIMIT linhas, as mais antigas
  // primeiro, e anuncia o corte no cabeçalho `X-Scaling-Truncated`).
  //
  // Chave PRÓPRIA desta tela ("validacao"): a Aprovação e o "Copiar evento"
  // usam `[SUGGESTIONS_QUERY_KEY, eventId]` esperando um ARRAY; aqui o cache
  // guarda `{ rows, truncated }` — partilhar a chave quebraria as outras. A
  // invalidação por prefixo (`invalidateScalingQueries`) continua alcançando.
  const suggestionsQuery = useQuery<{ rows: SuggestionRow[]; truncated: boolean }>({
    queryKey: [SUGGESTIONS_QUERY_KEY, "validacao", eventId || "__todos__"],
    queryFn: async () => {
      const res = await apiRequest("GET", eventId ? `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(eventId)}` : SUGGESTIONS_QUERY_KEY);
      const rows = (await res.json()) as SuggestionRow[];
      // O cabeçalho é a fonte de verdade do corte (04/09): antes a tela
      // deduzia pelo tamanho (`>= limite`) e avisava "pode haver outras"
      // numa lista que tinha EXATAMENTE o limite, sem nada cortado.
      return { rows, truncated: res.headers.get("X-Scaling-Truncated") === "1" };
    },
    // Quem não tem acesso vê o cartão de "Acesso negado" — nem chega a buscar.
    enabled: canAccess,
    staleTime: 15_000,
  });
  const rows = useMemo(() => suggestionsQuery.data?.rows ?? [], [suggestionsQuery.data]);
  /** O servidor cortou a lista? (teto só existe no modo "todos os eventos"). */
  const truncated = !eventId && !!suggestionsQuery.data?.truncated;
  /** Quantos eventos há no conjunto exibido — só faz sentido no modo "todos". */
  const eventsInList = useMemo(() => new Set(rows.map((r) => r.eventId)).size, [rows]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  useEffect(() => { if (events) sanitize(activeEvents.map((e) => e.id)); }, [events, activeEvents, sanitize]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId);

  /**
   * Evento de UMA vaga — o que os diálogos e o drawer precisam.
   *
   * Em "Todos os eventos" não existe `selectedEvent`, e sem ele o seletor de
   * dias ficava sem período: só os dias já marcados apareciam, então não dava
   * para ACRESCENTAR um dia no pedido de ajuste. Cada linha já vem com o nome e
   * o período do seu evento (o servidor anexa), e é daí que sai o intervalo.
   */
  const eventOfRow = (row: SuggestionRow | null): Event | undefined => {
    if (!row) return selectedEvent;
    const known = activeEvents.find((e) => e.id === row.eventId);
    if (known) return known;
    if (!row.eventStartDate && !row.eventEndDate) return selectedEvent;
    return {
      ...(selectedEvent ?? ({} as Event)),
      id: row.eventId,
      name: row.eventName ?? "Evento",
      startDate: row.eventStartDate ?? "",
      endDate: row.eventEndDate ?? "",
    } as Event;
  };
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);

  /**
   * Funções em que o usuário está CADASTRADO como validador — admin incluído
   * (o cadastro é o que ele quer ver quando liga "Só as minhas funções").
   * Base do filtro (11/09): antes o filtro usava canActOn, que é "posso agir
   * AGORA" — escondia as vagas já validadas das minhas funções e, para admin
   * (canEdit em tudo), não filtrava nada. O dono: "não está funcionando".
   */
  const minhasFuncoesIds = useMemo(
    () => new Set((functions ?? []).filter((f) => f.managers?.some((m) => m.userId === user?.id && m.role === "validador")).map((f) => f.id)),
    [functions, user?.id],
  );
  /** A vaga é de uma das minhas funções? Sem cadastro, vale o canEdit do servidor. */
  const daMinhaFuncao = useCallback(
    (r: SuggestionRow) => (minhasFuncoesIds.size > 0 ? minhasFuncoesIds.has(r.functionId) : r.canEdit),
    [minhasFuncoesIds],
  );
  /** Funções em que o usuário é validador (ou todas, se admin) — para "Incluir escalação". */
  const requestableFunctions = useMemo(() => {
    const list = functions ?? [];
    if (isAdmin) return list;
    return list.filter((f) => f.managers?.some((m) => m.userId === user?.id && m.role === "validador"));
  }, [functions, isAdmin, user?.id]);
  const isValidatorOfAny = isAdmin || requestableFunctions.length > 0;
  /**
   * Modo leitura por DUAS razões, unificadas numa mensagem só (a mais específica
   * vence): o papel não valida (§7) ou o papel valida mas o usuário não é
   * validador de nenhuma função. O servidor barra os dois casos; a tela some com
   * checkboxes, barra de ações e "Incluir escalação" para não prometer o 403.
   * Quem É validador cadastrado de alguma função valida SEMPRE, qualquer que
   * seja o papel (em produção existe validador com papel `purchasing`) — o
   * cadastro em Funções é a fonte de verdade, igual ao servidor.
   */
  const readOnlyMode = !isValidatorOfAny && (!canValidateByRole || !!functions);
  const readOnlyReason = !canValidateByRole
    ? "seu perfil acompanha a validação das áreas, mas não valida vagas nem abre pedidos."
    : "você não é validador de nenhuma função. Dá para consultar a escala, mas não validar nem pedir mudanças.";

  /** "Você valida: Kit, Almoxarifado…" — o escopo do usuário, direto na barra de contexto. */
  const scopeLabel = useMemo(() => {
    if (readOnlyMode) return null;
    if (isAdmin) return "todas as funções";
    const names = requestableFunctions.map((f) => f.name).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
    if (names.length === 0) return null;
    return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} e mais ${names.length - 3}`;
  }, [readOnlyMode, isAdmin, requestableFunctions]);

  // ── Filtros ──
  const functionsInEvent = useMemo(() => {
    const ids = new Set(rows.map((r) => r.functionId));
    return (functions ?? []).filter((f) => ids.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [rows, functions]);

  /**
   * Aprovador(es) cadastrados por função (/api/functions já traz `managers`) —
   * serve ao tooltip da vaga validada ("quem tem de decidir").
   *
   * O alarme de "função sem aprovador" saiu daqui em 26/08 (decisão do dono:
   * "não tem isso de sem aprovador" — o sistema tem um aprovador padrão). A
   * salvaguarda mudou de lugar, não sumiu: quem cadastra aprovador é o admin,
   * e é na aba "Validação de Escala" de Funções que ele vê quais funções estão
   * no aprovador padrão. Na tela da área o aviso era só ruído.
   */
  const approverNamesByFunctionId = useMemo(
    () => new Map((functions ?? []).map((f) => [
      f.id,
      (f.managers ?? []).filter((m) => m.role === "aprovador").map((m) => m.userName).filter(Boolean),
    ])),
    [functions],
  );
  // Só depois que /api/functions responde: enquanto carrega, a tela não sabe
  // quem aprova (o tooltip da vaga validada omite). Função ESTÁVEL entre
  // renders — é o que deixa as linhas `memo` da tabela pularem o re-render.
  const approverNamesFor = useMemo(
    () => (functions ? (r: SuggestionRow) => approverNamesByFunctionId.get(r.functionId) ?? NO_NAMES : undefined),
    [functions, approverNamesByFunctionId],
  );

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    // "#123" acha a vaga 123 (04/09): o chip da lista mostra "#123" e era isso
    // que a pessoa copiava para a busca — e não achava nada. O "#" sai só da
    // comparação com o número; nos textos (função, área, observação) a busca
    // continua literal.
    const qNum = q.replace(/^#/, "");
    const nameOf = (r: SuggestionRow) => functionNameById.get(r.functionId) ?? "";
    const periodKey = (r: SuggestionRow) => workDaysOf(r)[0] ?? String(r.scheduleStartDate ?? "").slice(0, 10) ?? "";
    const list = rows
      .filter((r) => functionFilter.size === 0 || functionFilter.has(r.functionId))
      // "Só as minhas funções" = vagas das funções em que sou validador, em
      // QUALQUER situação (validada, com pedido…). O recorte por situação é
      // dos cards do resumo, não deste botão.
      .filter((r) => !onlyMine || daMinhaFuncao(r))
      .filter((r) => !kpiFiltro || KPI_MATCH[kpiFiltro](r))
      .filter((r) => {
        if (!q) return true;
        return nameOf(r).toLowerCase().includes(q) || (qNum !== "" && String(r.inclusionNumber).includes(qNum)) || (r.observations ?? "").toLowerCase().includes(q);
      });
    const byDefault = (a: SuggestionRow, b: SuggestionRow) => nameOf(a).localeCompare(nameOf(b), "pt-BR") || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0);
    if (!sortConfig) return list.sort(byDefault);
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const cmp: Record<SuggestionSortField, (a: SuggestionRow, b: SuggestionRow) => number> = {
      id: (a, b) => (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0),
      function: byDefault,
      period: (a, b) => periodKey(a).localeCompare(periodKey(b)) || byDefault(a, b),
    };
    return list.sort((a, b) => dir * cmp[sortConfig.field](a, b));
  }, [rows, functionFilter, onlyMine, daMinhaFuncao, kpiFiltro, deferredSearch, functionNameById, sortConfig]);

  const onSort = (field: SuggestionSortField) =>
    setSortConfig((prev) => (prev?.field === field ? (prev.direction === "asc" ? { field, direction: "desc" } : null) : { field, direction: "asc" }));

  const hasActiveFilters = search.trim() !== "" || functionFilter.size > 0 || onlyMine || kpiFiltro !== null;
  /** O que a aba Decididas aplica da barra: busca, função e "minhas funções" (os cards de situação não valem lá). */
  const filtroDasDecididas = useMemo(() => ({
    busca: deferredSearch,
    functionIds: functionFilter.size > 0 ? functionFilter : null,
    soMinhas: onlyMine ? daMinhaFuncao : null,
  }), [deferredSearch, functionFilter, onlyMine, daMinhaFuncao]);
  const clearFilters = () => { setSearch(""); setFunctionFilter(new Set()); setOnlyMine(false); setKpiFiltro(null); };

  // Selecionável = aceita ALGUMA ação da área — pela regra atual (26/08) é o
  // mesmo que "ainda pendente". Em modo leitura não há seleção nenhuma.
  const selectableAll = useMemo(
    () => new Set<string>(readOnlyMode ? [] : rows.filter(canActOn).map((r) => r.id)),
    [rows, readOnlyMode],
  );
  /**
   * Subconjunto que aceita "Validar" agora. Derivado das selecionáveis (é um
   * subconjunto delas), em vez de uma segunda varredura em todas as linhas.
   */
  const validatableAll = useMemo(() => {
    const out = new Set<string>();
    selectableAll.forEach((id) => { const r = rowById.get(id); if (r && canValidate(r)) out.add(id); });
    return out;
  }, [selectableAll, rowById]);

  // ── Resumo ──
  const counts = useMemo(() => ({
    total: rows.length,
    pendentes: rows.filter((r) => r.status === SUGESTAO_STATUS.PENDENTE).length,
    aguardandoAprovacao: rows.filter((r) => r.status === SUGESTAO_STATUS.VALIDADA).length,
    comPedido: rows.filter((r) => r.status === SUGESTAO_STATUS.AJUSTE).length,
    // "Minhas pendentes" = o que dá para VALIDAR agora (validadas não entram).
    minhas: validatableAll.size,
    atrasadas: rows.filter((r) => r.status === SUGESTAO_STATUS.PENDENTE && pendingSeverity(r.daysPending) !== "ok").length,
  }), [rows, validatableAll]);

  return {
    isAdmin, canAccess, loadingEvents, loadingFunctions, functions, permissoesCarregando,
    suggestionsQuery, rows, truncated, eventsInList, rowById, activeEvents, selectedEvent, eventOfRow, functionNameById,
    minhasFuncoesIds, daMinhaFuncao, requestableFunctions, readOnlyMode, readOnlyReason, scopeLabel,
    functionsInEvent, approverNamesByFunctionId, approverNamesFor,
    search, setSearch, functionFilter, setFunctionFilter, onlyMine, setOnlyMine, kpiFiltro, setKpiFiltro, sortConfig, onSort,
    filteredRows, hasActiveFilters, filtroDasDecididas, clearFilters, selectableAll, validatableAll, counts,
  };
}

export type ValidationData = ReturnType<typeof useValidationData>;
