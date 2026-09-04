import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CalendarDays, CheckCheck, CheckSquare, ChevronDown, ChevronUp, ClipboardCheck, CloudOff, Eye, EyeOff,
  Gauge, History, Info, PencilLine, Plus, Search, Square, StickyNote, Trash2, TriangleAlert, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastAction } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EventCombobox from "@/components/ui/event-combobox";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import type { SortConfig } from "@/components/common/sortable-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn, formatDateRange } from "@/lib/utils";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import { normalizeRole } from "@shared/roles";
import type { Event, User as UserType } from "@shared/schema";
import { ALL_EVENTS_ROW_LIMIT, SUGESTAO_STATUS, STALLED_DAYS, pendingSeverity } from "@shared/scaling-validation-rules";
import { EventLine, SuggestionsList, groupRowsByEvent, periodLabel, type SuggestionSortField } from "@/components/scaling-validation/suggestions-list";
import { SECTION_TITLE } from "@/components/scaling-validation/logistics-chips";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { AdjustRequestDialog, DeleteRequestDialog, IncludeRequestDialog } from "@/components/scaling-validation/change-request-dialogs";
import { SuggestionDetailDrawer } from "@/components/scaling-validation/suggestion-detail-drawer";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { DecidedPanel } from "@/components/scaling-validation/decided-panel";
import { EventCommentsButton } from "@/components/scaling-validation/event-comments-dialog";
import { useEscalaManagers } from "@/components/scaling-validation/use-escala-managers";
import {
  SUGGESTIONS_QUERY_KEY, canActOn, canValidate, invalidateScalingQueries, workDaysOf,
  type ApiError, type FunctionWithManagers, type SuggestionRow, type ValidateResult,
} from "@/components/scaling-validation/types";

const ALL = "all";
const BASE_PATH = "/scaling-validation";
const PULSE_MS = 2000;
/** Realce mais longo para "Ver quais" (o usuário sai do toast e ainda precisa achar as linhas). */
const PULSE_LONG_MS = 5000;
/** Rede de segurança caso o drawer não avise que terminou de fechar (ver `runAfterDrawer`). */
const AFTER_DRAWER_FALLBACK_MS = 400;
/** Acima disto, "selecionar todas" pede confirmação — um clique no cabeçalho não pode montar um lote de 200. */
const BIG_SELECTION = 50;
/** Lista vazia congelada: `approverNamesFor` devolve sempre a MESMA referência para "sem aprovador" (as linhas são `memo`). */
const NO_NAMES: string[] = [];

/** Botão-chip da barra de contexto/filtros (mesma altura dos selects). */
const CHIP_BTN = "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";

/** "3 vagas" / "1 vaga" — plural de verdade, sem "(s)". */
const vagas = (n: number) => `${n} ${n === 1 ? "vaga" : "vagas"}`;
const eventos = (n: number) => `${n} ${n === 1 ? "evento" : "eventos"}`;

/**
 * Botão com dica que também funciona no teclado.
 *
 * Botão HABILITADO: o gatilho é o PRÓPRIO botão — a dica aparece no hover e no
 * foco. Botão DESABILITADO: elemento desabilitado não emite hover/focus, então
 * o gatilho passa a ser um `<span tabIndex={0}>` em volta (o padrão do resto do
 * app). Sem dica, devolve o botão puro.
 */
function ActionWithHint({ hint, disabled, side = "top", wrapClassName, children }: {
  hint?: ReactNode; disabled?: boolean; side?: "top" | "bottom";
  /** Classes do `<span>` que envolve o botão DESABILITADO (ex.: `flex-1` na barra empilhada do celular). */
  wrapClassName?: string; children: ReactElement;
}) {
  if (!hint) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span tabIndex={0} className={cn("inline-flex", wrapClassName)}>{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side={side} className="text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Esqueleto da tela (04/09) com a MESMA forma do que vai aparecer — faixa de
 * resumo, barra de filtros e linhas — para o conteúdo não "pular" quando os
 * dados chegam. O `LoadingState` genérico (só linhas) fazia a página crescer
 * 200px de uma vez.
 */
function ValidationSkeleton({ label }: { label: string }) {
  // Só as partes decorativas ficam `aria-hidden`: o `LoadingState` no fim é
  // quem anuncia o carregamento (role="status") ao leitor de tela.
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-hidden="true">
        <div className="h-10 border-b border-slate-200 bg-slate-50/60" />
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[58px] rounded-xl" />)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5" aria-hidden="true">
        <Skeleton className="h-9 min-w-[240px] flex-1 rounded-lg" />
        <Skeleton className="h-9 w-[180px] rounded-lg" />
        <Skeleton className="h-9 w-[160px] rounded-lg" />
      </div>
      <LoadingState count={5} className="rounded-2xl" label={label} />
    </div>
  );
}

/** Recortes dos cards do resumo — a mesma leitura de status dos contadores. */
type KpiFiltro = "pendentes" | "aguardandoAprovacao" | "comPedido" | "atrasadas";
const KPI_MATCH: Record<KpiFiltro, (r: SuggestionRow) => boolean> = {
  pendentes: (r) => r.status === SUGESTAO_STATUS.PENDENTE,
  aguardandoAprovacao: (r) => r.status === SUGESTAO_STATUS.VALIDADA,
  comPedido: (r) => r.status === SUGESTAO_STATUS.AJUSTE,
  atrasadas: (r) => r.status === SUGESTAO_STATUS.PENDENTE && pendingSeverity(r.daysPending) !== "ok",
};

/** Depois de validar, a vaga é do aprovador — a frase única da tela (toast, dica e confirmação). */
const AFTER_VALIDATE_MSG = "Depois de validar, a vaga fica com o aprovador e não muda mais — se faltar gente, use Incluir escalação.";

export default function ScalingValidationPage() {
  usePageTitle("Validação de Escala");
  const { user } = useAuth();
  const { toast } = useToast();
  // Nomes dos responsáveis: o cadastro da Escala guarda ids.
  const { data: usuariosParaNome } = useQuery<UserType[]>({ queryKey: ["/api/users"] });
  const queryClient = useQueryClient();
  const isAdmin = normalizeRole(user?.role) === "admin";
  const canAccess = hasPermission(user, "canAccessScalingValidation");
  /** Papel que VALIDA (matriz §7: admin e área responsável). Logística/compras/RH só acompanham. */
  const canValidateByRole = hasPermission(user, "canEditScalingValidation");

  // ── Estado ──
  // A tela ABRE em "Todos os eventos" (regra do dono, 26/08): o combobox virou
  // FILTRO. Sem `?eventId=` na URL, nada é pré-selecionado.
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, { allEventsDefault: true });
  const [tab, setTab] = useState<"lista" | "escala" | "decididas">("lista");
  const [search, setSearch] = useState("");
  /**
   * A busca filtra com o valor ADIADO (04/09): o campo responde na hora e a
   * lista (200 linhas, ordenação, agrupamento) corre atrás no próximo quadro —
   * sem isso cada tecla travava o campo por um instante.
   */
  const deferredSearch = useDeferredValue(search);
  const [functionFilter, setFunctionFilter] = useState(ALL);
  const [areaFilter, setAreaFilter] = useState(ALL);
  const [onlyMine, setOnlyMine] = useState(false);
  /**
   * Card do resumo que está filtrando a lista (04/09). Antes só "Minhas
   * pendentes" respondia ao clique; os outros cinco tinham cara de botão e não
   * faziam nada — o usuário clicava em "Aguardando aprovação" e a lista não
   * mudava. Um card de cada vez: eles são recortes exclusivos por status.
   */
  const [kpiFiltro, setKpiFiltro] = useState<KpiFiltro | null>(null);
  const [showEventComments, setShowEventComments] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig<SuggestionSortField> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmValidate, setConfirmValidate] = useState(false);
  /** "Selecionar todas" com mais de BIG_SELECTION vagas visíveis pede confirmação. */
  const [confirmSelectAll, setConfirmSelectAll] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(false);
  /** Vaga alvo dos diálogos de pedido (linha ou seleção única). */
  const [requestTargetId, setRequestTargetId] = useState<string | null>(null);
  /**
   * Alvo da confirmação de validação: `null` = o lote selecionado; uma lista =
   * a(s) vaga(s) da ação por LINHA. A validação por linha NÃO mexe na seleção
   * do lote (o usuário pode ter montado um lote de 8 vagas antes de clicar).
   */
  const [validateTargetIds, setValidateTargetIds] = useState<string[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  /** Linhas realçadas por um instante (pedido enviado, "Ver quais" do lote parcial). */
  const [pulseIds, setPulseIds] = useState<ReadonlySet<string>>(() => new Set());
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  /** Ação que espera o drawer terminar de fechar — ver `runAfterDrawer`. */
  const pendingAfterDrawer = useRef<(() => void) | null>(null);
  const afterDrawerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Vaga a abrir no drawer assim que a validação corrente terminar ("Validar e próxima"). */
  const chainNextId = useRef<string | null>(null);
  /** Espelho de `detailId` para os callbacks estáveis (as linhas da tabela são `memo`). */
  const detailIdRef = useRef<string | null>(null);
  detailIdRef.current = detailId;

  // Trocou de evento: limpa a seleção (evita agir em vaga que sumiu da lista).
  useEffect(() => { setSelected(new Set()); setDetailId(null); setRequestTargetId(null); setValidateTargetIds(null); }, [eventId]);
  useEffect(() => () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    if (afterDrawerTimer.current) clearTimeout(afterDrawerTimer.current);
  }, []);

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
  /** Aba efetiva: sem evento, o quadro "Escala" não existe — cai na Lista. */
  const boardTab = !eventId && tab === "escala" ? "lista" : tab;
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
  const areas = useMemo(() => Array.from(new Set(rows.map((r) => r.area).filter((a): a is string => !!a))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
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
      .filter((r) => functionFilter === ALL || r.functionId === functionFilter)
      .filter((r) => areaFilter === ALL || r.area === areaFilter)
      // "Só as minhas funções" = tudo em que o usuário PODE AGIR (validar OU
      // pedir ajuste/exclusão) — o mesmo conjunto das linhas selecionáveis.
      .filter((r) => !onlyMine || canActOn(r))
      .filter((r) => !kpiFiltro || KPI_MATCH[kpiFiltro](r))
      .filter((r) => {
        if (!q) return true;
        return nameOf(r).toLowerCase().includes(q) || (qNum !== "" && String(r.inclusionNumber).includes(qNum)) || (r.area ?? "").toLowerCase().includes(q) || (r.observations ?? "").toLowerCase().includes(q);
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
  }, [rows, functionFilter, areaFilter, onlyMine, kpiFiltro, deferredSearch, functionNameById, sortConfig]);

  const onSort = (field: SuggestionSortField) =>
    setSortConfig((prev) => (prev?.field === field ? (prev.direction === "asc" ? { field, direction: "desc" } : null) : { field, direction: "asc" }));

  const hasActiveFilters = search.trim() !== "" || functionFilter !== ALL || areaFilter !== ALL || onlyMine || kpiFiltro !== null;
  const clearFilters = () => { setSearch(""); setFunctionFilter(ALL); setAreaFilter(ALL); setOnlyMine(false); setKpiFiltro(null); };

  // ── Seleção ──
  // Selecionáveis no evento inteiro (a seleção sobrevive ao filtro) e só as
  // visíveis (para o "selecionar todas"). Selecionável = aceita ALGUMA ação da
  // área (validar / pedir ajuste / pedir exclusão) — pela regra atual (26/08)
  // é o mesmo que "ainda pendente": a vaga validada não aceita mais nada.
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
  const visibleIds = useMemo(() => new Set(filteredRows.map((r) => r.id)), [filteredRows]);
  const selectableVisible = useMemo(() => new Set(filteredRows.filter((r) => selectableAll.has(r.id)).map((r) => r.id)), [filteredRows, selectableAll]);
  const effectiveSelected = useMemo(() => Array.from(selected).filter((id) => selectableAll.has(id)), [selected, selectableAll]);
  const effectiveSelectedSet = useMemo(() => new Set(effectiveSelected), [effectiveSelected]);
  const selectedRows = useMemo(() => effectiveSelected.map((id) => rowById.get(id)).filter((r): r is SuggestionRow => !!r), [effectiveSelected, rowById]);
  /** Selecionadas que ainda dá para validar (as já validadas ficam de fora do lote). */
  const validatableSelected = useMemo(() => effectiveSelected.filter((id) => validatableAll.has(id)), [effectiveSelected, validatableAll]);
  /** Alvo corrente da confirmação: a(s) vaga(s) da linha ou o lote selecionado. */
  const validateTarget = validateTargetIds ?? effectiveSelected;
  const validateIds = useMemo(
    () => validateTarget.filter((id) => validatableAll.has(id)),
    [validateTarget, validatableAll],
  );
  const validateRows = useMemo(
    () => validateIds.map((id) => rowById.get(id)).filter((r): r is SuggestionRow => !!r),
    [validateIds, rowById],
  );
  /** Lote da confirmação agrupado por evento (só importa no modo "Todos os eventos"). */
  const validateGroups = useMemo(() => groupRowsByEvent(validateRows), [validateRows]);
  const hiddenSelectedCount = useMemo(() => effectiveSelected.filter((id) => !visibleIds.has(id)).length, [effectiveSelected, visibleIds]);
  const singleSelected = selectedRows.length === 1 ? selectedRows[0] : null;
  // Em modo leitura não há seleção nem barra de ações — nem para o eventual
  // usuário que o servidor deixaria validar: a matriz §7 é quem manda na tela.
  const anyEditable = !readOnlyMode && rows.some((r) => r.canEdit);
  const detailRow = detailId ? rowById.get(detailId) ?? null : null;
  /** Alvo dos diálogos de ajuste/exclusão: a linha clicada ou a seleção única. */
  const requestTarget = requestTargetId ? rowById.get(requestTargetId) ?? null : null;

  const toggle = useCallback((id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const allVisibleSelected = useMemo(() => Array.from(selectableVisible).every((id) => selected.has(id)), [selectableVisible, selected]);
  const applyToggleAll = (all: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      selectableVisible.forEach((id) => { if (all) n.delete(id); else n.add(id); });
      return n;
    });
  };
  const toggleAll = () => {
    // Marcar mais de BIG_SELECTION vagas de uma vez pede confirmação (04/09):
    // em "Todos os eventos" um clique no cabeçalho montava um lote de 200
    // vagas de eventos diferentes, e "Validar (200)" ficava a um clique.
    if (!allVisibleSelected && selectableVisible.size > BIG_SELECTION) { setConfirmSelectAll(true); return; }
    applyToggleAll(allVisibleSelected);
  };

  /** Realça uma ou mais linhas por um instante (a última chamada substitui a anterior). */
  const pulseRows = (ids: (string | null)[], ms = PULSE_MS) => {
    const valid = ids.filter((id): id is string => !!id);
    if (valid.length === 0) return;
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulseIds(new Set(valid));
    pulseTimer.current = setTimeout(() => setPulseIds(new Set()), ms);
  };
  const pulseRow = (id: string | null) => pulseRows([id]);
  /**
   * Pedido enviado: sai da seleção SÓ a vaga que virou pedido (ela deixa de
   * aceitar ações). Pedir ajuste pela LINHA de uma vaga não pode apagar o lote
   * que o usuário montou nas outras.
   */
  const onRequestSent = (inclusionId: string | null) => {
    if (inclusionId) {
      setSelected((prev) => {
        if (!prev.has(inclusionId)) return prev;
        const n = new Set(prev);
        n.delete(inclusionId);
        return n;
      });
    }
    pulseRow(inclusionId);
  };

  // ── Ações por vaga (linha, card e rodapé do drawer) ──
  // Todas com `useCallback` (04/09): são props das linhas `memo` da tabela —
  // recriadas a cada render, elas anulariam o memo.
  /** Executa a ação pendente que esperava o drawer fechar (idempotente). */
  const flushAfterDrawer = useCallback(() => {
    if (afterDrawerTimer.current) { clearTimeout(afterDrawerTimer.current); afterDrawerTimer.current = null; }
    const fn = pendingAfterDrawer.current;
    pendingAfterDrawer.current = null;
    fn?.();
  }, []);
  /**
   * Abre um diálogo só DEPOIS que o drawer terminou de fechar: dois overlays
   * Radix trocando focus-trap/scroll-lock no mesmo tick deixam a página com o
   * scroll travado. O drawer avisa pelo `onClosed`; o timer é a rede de
   * segurança (animação desligada, remontagem…).
   */
  const runAfterDrawer = useCallback((fn: () => void) => {
    if (!detailIdRef.current) { fn(); return; }
    pendingAfterDrawer.current = fn;
    setDetailId(null);
    if (afterDrawerTimer.current) clearTimeout(afterDrawerTimer.current);
    afterDrawerTimer.current = setTimeout(flushAfterDrawer, AFTER_DRAWER_FALLBACK_MS);
  }, [flushAfterDrawer]);

  /** Validar uma vaga só: mesma confirmação do lote, mas com alvo próprio — a seleção fica intacta. */
  const validateOne = useCallback((row: SuggestionRow) => runAfterDrawer(() => { setValidateTargetIds([row.id]); setConfirmValidate(true); }), [runAfterDrawer]);

  /**
   * "Validar e próxima" (rodapé do drawer): encadeia a fila sem passar pela
   * tabela. A próxima é a PRÓXIMA VALIDÁVEL na lista filtrada e ordenada que
   * está na tela — não a próxima do evento inteiro. Guardada antes de validar,
   * porque depois de validar a vaga atual sai da conta de "pendentes".
   */
  const nextValidatableAfter = (row: SuggestionRow): SuggestionRow | null => {
    const i = filteredRows.findIndex((r) => r.id === row.id);
    if (i < 0) return null;
    for (let j = i + 1; j < filteredRows.length; j++) {
      if (validatableAll.has(filteredRows[j].id)) return filteredRows[j];
    }
    return null;
  };
  const validateAndNext = (row: SuggestionRow) => {
    chainNextId.current = nextValidatableAfter(row)?.id ?? null;
    validateOne(row);
  };
  const openAdjust = useCallback((row: SuggestionRow) => runAfterDrawer(() => { setRequestTargetId(row.id); setAdjustOpen(true); }), [runAfterDrawer]);
  const openDelete = useCallback((row: SuggestionRow) => runAfterDrawer(() => { setRequestTargetId(row.id); setDeleteOpen(true); }), [runAfterDrawer]);
  const openDetail = useCallback((row: SuggestionRow) => setDetailId(row.id), []);

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

  // ── Validar em massa ──
  const validateMutation = useMutation({
    mutationFn: async ({ ids }: { ids: string[]; fromRow: boolean }) =>
      (await apiRequest("POST", "/api/scaling-suggestions/validate", { inclusionIds: ids })).json() as Promise<ValidateResult>,
    onSuccess: (res, { ids, fromRow }) => {
      invalidateScalingQueries(queryClient);
      // Saem da seleção só as vagas efetivamente validadas — o resto do lote
      // que o usuário montou continua marcado.
      setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
      setValidateTargetIds(null);
      setConfirmValidate(false);
      if (fromRow) {
        // "Validar e próxima": abre a próxima vaga no drawer em vez de devolver
        // o usuário para a tabela. Sem próxima, cai no comportamento de sempre.
        const next = chainNextId.current;
        chainNextId.current = null;
        if (next) setDetailId(next); else pulseRow(ids[0] ?? null);
      } else if (topRef.current) {
        // Lote: volta ao topo mantendo filtros — as vagas continuam na lista
        // (agora "aguardando aprovação") e o resumo do topo é o que muda.
        topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      const okN = res.ok?.length ?? 0;
      const skipped = res.skipped ?? [];
      const reasons = Array.from(new Set(skipped.map((s) => s.reason))).slice(0, 3).join(" · ");
      if (okN > 0 && skipped.length > 0) {
        // Resultado PARCIAL num toast só (04/09): dois toasts empilhados (um
        // verde, um vermelho) sobre o mesmo lote confundiam — e o vermelho
        // não dizia QUAIS ficaram de fora. "Ver quais" realça as linhas.
        toast({
          title: `${okN} ${okN === 1 ? "validada" : "validadas"} · ${skipped.length} não ${skipped.length === 1 ? "validada" : "validadas"}`,
          description: reasons,
          action: (
            <ToastAction altText="Realçar na lista as vagas que não foram validadas" onClick={() => pulseRows(skipped.map((s) => s.id), PULSE_LONG_MS)}>
              Ver quais
            </ToastAction>
          ),
        });
      } else if (okN > 0) {
        toast({
          title: `${vagas(okN)} ${okN === 1 ? "validada" : "validadas"}`,
          description: `${okN === 1 ? "Ela segue" : "Elas seguem"} para o aprovador. ${AFTER_VALIDATE_MSG}`,
        });
      } else if (skipped.length > 0) {
        toast({ title: `${vagas(skipped.length)} não ${skipped.length === 1 ? "validada" : "validadas"}`, description: reasons, variant: "destructive" });
      }
    },
    onError: (err: ApiError) => {
      setConfirmValidate(false);
      setValidateTargetIds(null);
      chainNextId.current = null; // a corrente para aqui: nada de abrir a próxima
      toast({ title: "Não foi possível validar", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

  // ── Render ──
  if (!canAccess) {
    return (
      <PageContainer>
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso negado</h3>
          <p className="text-muted-foreground text-sm">Você não tem permissão para acessar a Validação de Escala.</p>
        </div>
      </PageContainer>
    );
  }

  const loadError = suggestionsQuery.error as ApiError | null;
  const includeDisabledReason = !eventId
    ? "Selecione um evento primeiro"
    : loadingFunctions ? "Carregando funções…"
      : requestableFunctions.length === 0 ? (isAdmin ? "Nenhuma função cadastrada" : "Você não é validador de nenhuma função")
        : null;
  const nSel = effectiveSelected.length;
  /** Quantas das selecionadas ainda dá para validar — o botão "Validar" age só sobre estas. */
  const nVal = validatableSelected.length;
  /** Números do diálogo de confirmação: o alvo corrente (linha ou lote). */
  const nConfirm = validateIds.length;

  /**
   * "Incluir escalação" — a área pode pedir vaga nova a QUALQUER momento, mesmo
   * com a lista vazia (evento sem sugestões, ou tudo já aprovado). Só depende de
   * ser validador de alguma função e de ter um evento escolhido. Mora no
   * cabeçalho; o estado vazio oferece o mesmo caminho como link, sem repetir
   * o botão (04/09).
   */
  const includeButton = (
    <ActionWithHint hint={includeDisabledReason} disabled={!!includeDisabledReason} side="bottom">
      <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" disabled={!!includeDisabledReason} onClick={() => setIncludeOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" /> Incluir escalação
      </Button>
    </ActionWithHint>
  );

  /** Vaga já aprovada saiu da sugestão: quem ajusta é a Escalação (tela 2). */
  const approvedGoesToScaling = (
    <p className="text-center text-xs text-slate-500">
      Vagas já aprovadas saem desta tela e são ajustadas na{" "}
      {hasPermission(user, "canAccessScreen2")
        ? <Link href="/scaling" className="text-primary underline-offset-2 hover:underline">Escalação</Link>
        : <span className="font-semibold">Escalação</span>}.
    </p>
  );

  const KPI_TOOLTIPS: Record<string, string> = {
    // Só as que dependem da ÁREA: o atraso das validadas é do aprovador e
    // aparece no badge "aguardando aprovação há N dias" de cada linha.
    Atrasadas: `Vagas que a área ainda não validou há ${STALLED_DAYS} dias ou mais.`,
    // O número conta o que FALTA validar; o clique liga o filtro "Só as
    // minhas funções" — o mesmo conjunto (regra de 26/08: validada não aceita
    // mais nada da área).
    "Minhas pendentes": "Vagas que você pode validar agora (sem pedido pendente). Clique para filtrar a lista pelas suas funções.",
    "Com pedido": "Vagas com pedido de ajuste/exclusão aguardando o aprovador.",
    "Aguardando aprovação": `Vagas que a área já validou e agora aguardam a decisão do aprovador. ${AFTER_VALIDATE_MSG}`,
  };
  type Kpi = { label: string; n: number; cls: string; filtro?: KpiFiltro | "minhas" };
  /** O funil: da vaga sugerida à decisão do aprovador. */
  const FUNIL: Kpi[] = [
    { label: "Vagas", n: counts.total, cls: "text-slate-800" },
    { label: "Aguardando validação", n: counts.pendentes, cls: "text-amber-700", filtro: "pendentes" },
    { label: "Aguardando aprovação", n: counts.aguardandoAprovacao, cls: "text-sky-700", filtro: "aguardandoAprovacao" },
    { label: "Com pedido", n: counts.comPedido, cls: "text-violet-700", filtro: "comPedido" },
  ];
  /** Recortes de "Aguardando validação" — não somam com o funil. */
  const RECORTES: Kpi[] = [
    { label: "Atrasadas", n: counts.atrasadas, cls: counts.atrasadas ? "text-red-600" : "text-slate-800", filtro: "atrasadas" },
    { label: "Minhas pendentes", n: counts.minhas, cls: "text-primary", filtro: "minhas" },
  ];
  const KPI_BOX = "rounded-xl border px-3 py-2 text-left";
  const renderKpi = ({ label, n, cls, filtro }: Kpi) => {
    const tip = KPI_TOOLTIPS[label];
    // "Vagas" é o total — não há o que recortar. "Minhas pendentes"
    // liga o filtro "Só as minhas funções" (como sempre); os demais
    // recortam por status, um de cada vez.
    const ativo = filtro === "minhas" ? onlyMine : filtro !== undefined && kpiFiltro === filtro;
    const clickable = filtro === "minhas" ? anyEditable : filtro !== undefined && (n > 0 || ativo);
    const alternar = () => {
      if (filtro === "minhas") { setOnlyMine((v) => !v); return; }
      if (filtro) setKpiFiltro((atual) => (atual === filtro ? null : filtro));
    };
    const box = (
      <div
        key={label}
        className={cn(KPI_BOX, "relative border-slate-200 bg-white",
          clickable && "transition-colors hover:border-primary/30",
          ativo && "border-primary/30 bg-brand-soft",
          !clickable && tip && "cursor-help")}
        tabIndex={!clickable && tip ? 0 : undefined}
      >
        <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}{tip && <Info className="w-3 h-3 text-slate-400" aria-hidden="true" />}
        </dt>
        <dd className={cn("mt-0.5 text-xl font-bold tabular-nums", cls)}>
          {n}
          {/* Botão em cima do cartão inteiro: mantém o clique no KPI sem
              quebrar o par <dt>/<dd> (botão não pode conter dt/dd). */}
          {clickable && (
            <button
              type="button" aria-pressed={ativo}
              aria-label={filtro === "minhas" ? `${label}: ${n}. Filtrar a lista pelas minhas funções` : `${label}: ${n}. ${ativo ? "Tirar o filtro" : "Filtrar a lista"}`}
              onClick={alternar}
              className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
        </dd>
      </div>
    );
    if (!tip) return box;
    return (
      <Tooltip key={label}>
        <TooltipTrigger asChild>{box}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">{tip}</TooltipContent>
      </Tooltip>
    );
  };

  /** Texto ao lado das abas — um por aba, para a aba "Decididas" não herdar a frase do quadro. */
  const contadorDaAba = (() => {
    switch (boardTab) {
      case "lista":
        return `${filteredRows.length} de ${vagas(rows.length)}${!eventId && eventsInList > 0 ? ` · ${eventos(eventsInList)}` : ""}`;
      case "escala":
        return "Quadro de todas as áreas (somente leitura)";
      case "decididas":
        return "Decisões já tomadas pelo aprovador (somente leitura)";
    }
  })();

  return (
    <PageContainer fluid className="pb-24">
      <div ref={topRef} aria-hidden="true" />
      {/* Cabeçalho + linha de contexto num bloco só (04/09): antes o evento
          ficava num card próprio abaixo do título, e a página abria com três
          faixas (título, evento, resumo) antes da primeira vaga. A linha do
          evento é o "subtítulo" da página — fora do <p> do PageHeader porque
          o combobox é um <div>. */}
      <div className="space-y-2.5">
        <PageHeader
          icon={ClipboardCheck}
          title="Validação de escala"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ScalingModuleNav current="validation" eventId={eventId} />
              {/* Em modo leitura o botão nem aparece — o banner já explica o
                  porquê. Permissão ainda carregando: esqueleto do mesmo
                  tamanho, para o cabeçalho não mudar de altura. */}
              {readOnlyMode ? null : permissoesCarregando
                ? <Skeleton className="h-9 w-[150px] rounded-lg" aria-hidden="true" />
                : includeButton}
            </div>
          }
        />
        <section aria-label="Evento" className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-11">
          <CalendarDays className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
          {/* Cresce até 420px quando há espaço (31/08): em 260px fixos, nome
              de evento longo era cortado e o usuário não tinha como ler o
              resto — nem sabia em qual evento estava. */}
          <div className="w-[260px] max-w-full shrink-0 lg:w-auto lg:min-w-[260px] lg:max-w-[420px] lg:flex-1">
            {loadingEvents ? (
              <div className="h-8 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox
                events={activeEvents} value={eventId || ALL} showAllOption
                onValueChange={(v) => setEventId(v === ALL ? "" : v)}
                placeholder="Todos os eventos" testId="scaling-validation-event"
                className="h-8 font-semibold"
              />
            )}
          </div>
          {selectedEvent ? (
            <p className="text-xs text-slate-500 truncate max-w-[300px]">
              <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
              {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              {eventsInList > 0
                ? `Vagas em validação de ${eventos(eventsInList)} — escolha um para filtrar.`
                : "Todos os eventos — escolha um para filtrar."}
            </p>
          )}
          {scopeLabel && (
            <>
              <span className="hidden md:block h-6 w-px bg-slate-200" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <Users className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Você valida: <span className="font-semibold text-slate-800">{scopeLabel}</span>
              </span>
            </>
          )}
          {selectedEvent && (
            <EventCommentsButton
              eventId={selectedEvent.id} eventName={selectedEvent.name}
              className={cn(CHIP_BTN, "ml-auto h-8 border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary")}
            />
          )}
          {/* "Nota da logística" (04/09): é o campo de observações do evento,
              escrito pela logística ao montar a sugestão — "comentários"
              confundia com a conversa do botão ao lado. */}
          {selectedEvent?.observations && (
            <button
              type="button" className={cn(CHIP_BTN, "h-8 border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary")}
              aria-expanded={showEventComments} aria-controls="val-event-obs"
              onClick={() => setShowEventComments((v) => !v)}
            >
              <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
              Nota da logística
              {showEventComments ? <ChevronUp className="w-3 h-3 text-slate-400" aria-hidden="true" /> : <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden="true" />}
            </button>
          )}
        </section>
        {showEventComments && selectedEvent?.observations && (
          <p id="val-event-obs" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600 whitespace-pre-wrap sm:ml-11">
            <span className="font-semibold text-slate-500">Nota da logística: </span>{selectedEvent.observations}
          </p>
        )}
      </div>

      {readOnlyMode ? (
        <div role="status" className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-700">
          <EyeOff className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
          <span><span className="font-semibold">Modo leitura</span> — {readOnlyReason}</span>
        </div>
      ) : permissoesCarregando ? (
        // Lugar do banner reservado enquanto a permissão não chega (sem salto).
        <div className="h-[38px]" aria-hidden="true" />
      ) : null}

      {/* Resumo — soma SEMPRE o conjunto exibido (um evento ou todos). Card
          com faixa de cabeçalho (04/09), como os cartões do detalhe da
          inclusão: os seis números soltos na página pareciam parte dos
          filtros. Funil de um lado, recortes do outro — "Atrasadas" e
          "Minhas pendentes" são fatias de "Aguardando validação", não etapas,
          e lado a lado com o funil pareciam somar com ele. */}
      {rows.length > 0 && (
        <section aria-labelledby="val-resumo" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-brand-soft/60 px-4 py-2.5">
            <Gauge className="w-4 h-4 text-primary" aria-hidden="true" />
            <h2 id="val-resumo" className="text-[11px] font-black uppercase tracking-[0.12em] text-primary">
              Resumo {eventId ? "do evento" : "de todos os eventos"}
            </h2>
            <span className="ml-auto text-[11px] text-slate-500">Clique num indicador para filtrar a lista.</span>
          </div>
          <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            {/* <dl>/<dt>/<dd>: cada KPI é um par rótulo/valor de verdade para o
                leitor de tela (um <div aria-label> sem role seria ignorado).
                Grade que QUEBRA (04/09) em vez de rolar para o lado: a faixa
                de uma linha só escondia o último indicador sem barra visível. */}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Funil das vagas">
              {FUNIL.map(renderKpi)}
            </dl>
            <div className="space-y-1.5 border-t border-slate-200 pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
              <p className={SECTION_TITLE}>Recortes de “Aguardando validação”</p>
              <dl className="grid grid-cols-2 gap-2 xl:grid-cols-[repeat(2,minmax(150px,1fr))]" aria-label="Recortes de aguardando validação">
                {RECORTES.map(renderKpi)}
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* Teto do modo "todos os eventos": a lista foi cortada, o filtro é a saída. */}
      {truncated && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <span className="font-semibold">Mostrando as {ALL_EVENTS_ROW_LIMIT} vagas que esperam há mais tempo</span> — há outras fora da lista.
            Escolha um evento no filtro acima para ver a lista completa dele.
          </span>
        </p>
      )}

      {suggestionsQuery.isLoading || permissoesCarregando ? (
        <ValidationSkeleton label={loadingFunctions ? "Carregando funções…" : "Carregando escala sugerida…"} />
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
          <CloudOff className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800">Não foi possível carregar a escala</p>
            <p className="text-xs text-red-700">{apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto rounded-lg" onClick={() => suggestionsQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-2">
          <EmptyState
            title={eventId ? "Nenhuma vaga sugerida neste evento" : "Nenhuma vaga em validação"}
            description={eventId
              ? "A logística ainda não enviou a escala sugerida deste evento, ou todas as vagas já foram aprovadas e seguiram para a Inclusão de Equipe. Você pode pedir a inclusão de uma vaga nova a qualquer momento."
              : "Nenhum evento tem vaga aguardando validação, pedido em aberto ou vaga esperando aprovação. Para pedir a inclusão de uma vaga nova, escolha um evento no filtro acima."}
            // O botão "Incluir escalação" já está no cabeçalho; aqui o mesmo
            // caminho vira um link, para não haver dois botões primários iguais.
            action={!readOnlyMode && eventId && !includeDisabledReason ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => setIncludeOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Pedir uma vaga nova
              </Button>
            ) : undefined}
          />
          {hasPermission(user, "canAccessScalingEventView") && (
            <p className="text-center">
              <Link href={scalingHref("/scaling-event-view", eventId)} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-primary underline-offset-2 hover:underline">
                <History className="w-3 h-3" aria-hidden="true" /> {eventId ? "Ver histórico completo do evento" : "Ver o histórico da escala"}
              </Link>
            </p>
          )}
          {/* Fila vazia costuma significar TUDO APROVADO — e era justamente
              quando as Decididas ficavam inalcançáveis (o vazio engolia as
              abas). O histórico aparece aqui mesmo, sem aba. */}
          <div className="pt-3">
            <h3 className={cn("mb-2 flex items-center gap-1.5", SECTION_TITLE)}>
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Decididas
            </h3>
            <DecidedPanel eventId={eventId} functionNameById={functionNameById} />
          </div>
        </div>
      ) : (
        <Tabs value={boardTab} onValueChange={(v) => setTab(v as "lista" | "escala" | "decididas")} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="rounded-xl">
              <TabsTrigger value="lista" className="rounded-lg">Lista</TabsTrigger>
              {/* O quadro é função × dia DE UM evento: sem evento escolhido ele
                  somaria dias de eventos diferentes na mesma coluna. */}
              {eventId && <TabsTrigger value="escala" className="rounded-lg">Escala</TabsTrigger>}
              <TabsTrigger value="decididas" className="rounded-lg">Decididas</TabsTrigger>
            </TabsList>
            <p className="text-xs text-slate-500" aria-live="polite">{contadorDaAba}</p>
          </div>

          <TabsContent value="lista" className="space-y-3 mt-0">
            {/* Filtros */}
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[240px]">
                <Label htmlFor="val-search" className="sr-only">Buscar vaga</Label>
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input id="val-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área ou observação" className="h-9 pl-8 rounded-lg bg-slate-50" />
              </div>
              <div className="w-[180px]">
                <Label htmlFor="val-function" className="sr-only">Função</Label>
                <Select value={functionFilter} onValueChange={setFunctionFilter}>
                  <SelectTrigger id="val-function" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as funções</SelectItem>
                    {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[160px]">
                <Label htmlFor="val-area" className="sr-only">Área</Label>
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger id="val-area" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as áreas</SelectItem>
                    {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {anyEditable && (
                <button
                  type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)}
                  className={cn(CHIP_BTN, onlyMine ? "border-primary/30 bg-brand-soft text-primary" : "border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary")}
                >
                  {onlyMine ? <CheckSquare className="w-4 h-4" aria-hidden="true" /> : <Square className="w-4 h-4" aria-hidden="true" />}
                  Só as minhas funções
                </button>
              )}
              {/* O ÚNICO "Limpar filtros" da barra (04/09) — o estado vazio
                  filtrado tem o dele; o aviso de seleção oculta, logo abaixo,
                  já não repete o botão. */}
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters}
                  className="h-9 rounded-lg px-2 text-xs font-medium text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Limpar filtros
                </button>
              )}
            </div>

            {hiddenSelectedCount > 0 && (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {hiddenSelectedCount} {hiddenSelectedCount === 1 ? "vaga selecionada ficou oculta" : "vagas selecionadas ficaram ocultas"} pelo filtro — {hiddenSelectedCount === 1 ? "ela continua" : "elas continuam"} na seleção.
              </p>
            )}

            {filteredRows.length === 0 ? (
              <EmptyState variant="filtered" title="Nenhuma vaga com esses filtros" onClearFilters={hasActiveFilters ? clearFilters : undefined} />
            ) : (
              <SuggestionsList
                rows={filteredRows}
                functionNameById={functionNameById}
                selectableIds={selectableVisible}
                selectedIds={effectiveSelectedSet}
                onToggle={toggle}
                onToggleAll={toggleAll}
                showSelection={anyEditable}
                sortConfig={sortConfig}
                onSort={onSort}
                onOpenDetail={openDetail}
                onValidate={validateOne}
                onAdjust={openAdjust}
                onDelete={openDelete}
                highlightIds={pulseIds}
                approverNamesFor={approverNamesFor}
                // "Todos os eventos": a lista agrupa por evento e cada card
                // ganha a linha do evento; com filtro, a barra já diz qual é.
                showEvent={!eventId}
              />
            )}
            {approvedGoesToScaling}
          </TabsContent>

          <TabsContent value="escala" className="mt-0 space-y-2">
            {/* O quadro soma TODAS as vagas do evento, sempre — quem chega da
                Lista com filtro ligado precisa saber que os números aqui não
                são os da lista filtrada (04/09). */}
            {hasActiveFilters && (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                O quadro sempre soma todas as áreas — os filtros da Lista não valem aqui.
              </p>
            )}
            <ScheduleBoard rows={rows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
            <p className="text-[11px] text-slate-500">Quadro de todas as áreas, somente leitura — vagas negadas não entram na soma.</p>
          </TabsContent>

          {/* Histórico do que já foi decidido (28/08): a vaga aprovada sumia da
              tela e a área não sabia se tinha dado certo. Leitura pura. */}
          <TabsContent value="decididas" className="mt-0">
            <DecidedPanel eventId={eventId} functionNameById={functionNameById} />
          </TabsContent>
        </Tabs>
      )}

      {/* Barra de ações em massa — empilha abaixo de `sm` (04/09): no celular
          os quatro botões não cabiam numa linha com o contador e a barra
          estourava a largura da tela. */}
      {nSel > 0 && (
        <div role="region" aria-label="Ações para as vagas selecionadas"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex w-[calc(100%-2rem)] max-w-3xl flex-col items-stretch gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:flex-row sm:items-center">
          <div className="min-w-0 sm:mr-auto">
            <span className="block text-sm font-semibold text-slate-700">{vagas(nSel)} {nSel === 1 ? "selecionada" : "selecionadas"}</span>
            {/* Frase inteira, nunca cortada no meio: em 1366px a dica encolhe
                antes dos botões (min-w-0 + truncate), que ficam sempre na mesma
                linha graças ao flex-nowrap do grupo ao lado. Abaixo de `sm`
                ela sai — o espaço é dos botões. */}
            <span className="hidden truncate text-[11px] text-slate-500 sm:block">
              {nSel > 1 ? "Ajuste e exclusão: uma vaga por vez." : "Validar envia a vaga para o aprovador."}
            </span>
          </div>
          <div className="flex flex-nowrap items-center gap-2 sm:flex-shrink-0">
          <Button type="button" size="sm" variant="ghost" className="shrink-0 rounded-lg text-slate-500" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X className="w-4 h-4" />
          </Button>
          <ActionWithHint
            disabled={!singleSelected} wrapClassName="flex-1 sm:flex-none"
            hint={singleSelected ? "Pedido para a vaga selecionada" : "Selecione apenas uma vaga para pedir ajuste"}
          >
            <Button type="button" size="sm" variant="outline" className="w-full flex-1 rounded-lg sm:w-auto sm:flex-none" disabled={!singleSelected} onClick={() => singleSelected && openAdjust(singleSelected)}>
              <PencilLine className="w-4 h-4 sm:mr-1.5" /> <span className="sr-only sm:not-sr-only">Pedir ajuste</span>
            </Button>
          </ActionWithHint>
          <ActionWithHint
            disabled={!singleSelected} wrapClassName="flex-1 sm:flex-none"
            hint={singleSelected ? "Pedido para a vaga selecionada" : "Selecione apenas uma vaga para pedir exclusão"}
          >
            <Button type="button" size="sm" variant="outline" className="w-full flex-1 rounded-lg border-red-200 text-red-700 hover:bg-red-50 sm:w-auto sm:flex-none" disabled={!singleSelected} onClick={() => singleSelected && openDelete(singleSelected)}>
              <Trash2 className="w-4 h-4 sm:mr-1.5" /> <span className="sr-only sm:not-sr-only">Pedir exclusão</span>
            </Button>
          </ActionWithHint>
          {/* Sem dica de "já validada": pela regra de 26/08 uma vaga validada
              nem entra na seleção — o caso não existe mais. */}
          <Button type="button" size="sm" className="flex-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-none"
            onClick={() => { setValidateTargetIds(null); setConfirmValidate(true); }} disabled={nVal === 0 || validateMutation.isPending}>
            <CheckCheck className="w-4 h-4 mr-1.5" /> Validar ({nVal})
          </Button>
          </div>
        </div>
      )}

      {/* Confirmar "selecionar todas" acima do teto */}
      <AlertDialog open={confirmSelectAll} onOpenChange={setConfirmSelectAll}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Selecionar {vagas(selectableVisible.size)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Você vai marcar {vagas(selectableVisible.size)} de uma vez{!eventId && eventsInList > 1 ? `, de ${eventos(eventsInList)}` : ""}.
              A validação em lote ainda pede confirmação, mas confira a lista antes — é fácil validar o que não devia num lote grande.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Voltar</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg" onClick={() => { applyToggleAll(false); setConfirmSelectAll(false); }}>
              Selecionar {vagas(selectableVisible.size)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar validação */}
      {/* Fechar/cancelar zera só o alvo — a seleção do lote não é tocada. */}
      <AlertDialog open={confirmValidate} onOpenChange={(o) => { setConfirmValidate(o); if (!o) { setValidateTargetIds(null); chainNextId.current = null; } }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Validar {vagas(nConfirm)}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Você confirma que a escala sugerida está correta para {nConfirm === 1 ? "esta vaga" : "estas vagas"}.
                  {" "}{nConfirm === 1 ? "Ela segue" : "Elas seguem"} para o aprovador e {nConfirm === 1 ? "fica" : "ficam"} na lista como
                  “Validada pela área — aguardando aprovação”.
                </p>
                {/* A consequência dita ANTES do clique (04/09) — o texto antigo
                    prometia "ainda dá para pedir ajuste", o que a regra de
                    26/08 não permite. */}
                <p className="text-xs">{AFTER_VALIDATE_MSG}</p>
                {/* Lote de vários eventos (só em "Todos os eventos"): dito em
                    destaque, porque o número no título não conta isso. */}
                {!eventId && validateGroups.length > 1 && (
                  <p role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    <TriangleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    Este lote tem vagas de {eventos(validateGroups.length)}.
                  </p>
                )}
                {/* Lista COMPLETA e rolável (04/09): antes eram 5 e "… e mais
                    N" — a pessoa confirmava um lote sem poder conferir o que
                    havia nele. Em "Todos os eventos", agrupada por evento. */}
                <ul className="max-h-[220px] overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs text-slate-700" aria-label="Vagas deste lote">
                  {(eventId ? [{ key: "__evento__", name: "", period: "", rows: validateRows }] : validateGroups).map((g) => (
                    <li key={g.key}>
                      {!eventId && (
                        <div className="sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-1">
                          <EventLine row={g.rows[0]} />
                        </div>
                      )}
                      <ul className="divide-y divide-slate-100">
                        {g.rows.map((r) => (
                          <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800">#{r.inclusionNumber}</span>
                            <span className="truncate font-semibold">{functionNameById.get(r.functionId) ?? "Sem função"}</span>
                            <span className="ml-auto font-mono text-slate-500 whitespace-nowrap">{periodLabel(r)}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={validateMutation.isPending}>Voltar</AlertDialogCancel>
            {/* O botão declara a consequência — o mesmo padrão dos diálogos de decisão da Aprovação. */}
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); validateMutation.mutate({ ids: validateIds, fromRow: validateTargetIds !== null }); }}
              disabled={nConfirm === 0 || validateMutation.isPending} className="rounded-lg min-w-[200px] bg-emerald-600 hover:bg-emerald-700"
            >
              {validateMutation.isPending ? "Validando…" : `Validar ${vagas(nConfirm)} · enviar para aprovação`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdjustRequestDialog
        open={adjustOpen} onOpenChange={(o) => { setAdjustOpen(o); if (!o) setRequestTargetId(null); }}
        inclusion={requestTarget} event={eventOfRow(requestTarget)}
        functionName={requestTarget ? functionNameById.get(requestTarget.functionId) : undefined} onSent={onRequestSent}
      />
      <DeleteRequestDialog
        open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setRequestTargetId(null); }}
        inclusion={requestTarget}
        functionName={requestTarget ? functionNameById.get(requestTarget.functionId) : undefined} onSent={onRequestSent}
      />
      <IncludeRequestDialog open={includeOpen} onOpenChange={setIncludeOpen} event={selectedEvent} functions={requestableFunctions} onSent={onRequestSent} />
      <SuggestionDetailDrawer
        open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailId(null); }}
        // Drawer fechado de vez: agora dá para abrir o diálogo que esperava
        // (o setTimeout deixa o Radix devolver o foco antes).
        onClosed={() => setTimeout(flushAfterDrawer, 0)}
        row={detailRow} event={eventOfRow(detailRow)}
        functionName={detailRow ? functionNameById.get(detailRow.functionId) : undefined}
        approverNames={functions && detailRow ? approverNamesByFunctionId.get(detailRow.functionId) ?? [] : undefined}
        // ‹ › e as setas do teclado andam nesta lista — a filtrada e ordenada
        // que está na tela, não em todas as vagas do evento.
        list={filteredRows}
        onNavigate={openDetail}
        // Fora do modo leitura o rodapé do drawer repete as ações da linha.
        onValidate={anyEditable ? validateOne : undefined}
        onValidateAndNext={anyEditable ? validateAndNext : undefined}
        hasNextValidatable={!!detailRow && !!nextValidatableAfter(detailRow)}
        onAdjust={anyEditable ? openAdjust : undefined}
        onDelete={anyEditable ? openDelete : undefined}
      />
    </PageContainer>
  );
}
