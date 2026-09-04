import { memo } from "react";
import {
  CalendarDays, CheckCheck, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Clock, Lock,
  MessageSquareWarning, PencilLine, Trash2, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type SortConfig } from "@/components/common/sortable-header";
import { cn, formatDateRange, formatDiarias } from "@/lib/utils";
import { formatDateBr, formatDayMonthBr } from "@/lib/dates";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODE_LABELS, CHANGE_REQUEST_TYPE_LABELS,
  STALLED_DAYS, DANGER_DAYS, daysAwaitingApproval, pendingSeverity,
  type SugestaoStatus, type TransportMode, type ChangeRequestType,
  type LastDecisionInfo, type LastVagaDecisionInfo,
} from "@shared/scaling-validation-rules";
import {
  DECISION_TONE_CLASS, canRequestChange, canValidate, describeLastDecision, describeVagaDecision,
  lockReason, workDaysOf, ymd,
  type DecisionDescription, type SuggestionRow,
} from "./types";
import { CHIP_NEUTRAL, DayLabel, LegChip, NeedChips, TABLE_TH, dayText, legValue } from "./logistics-chips";

// Reexport: outros módulos (ex.: scaling-approval) importam daqui.
export { workDaysOf } from "./types";

// ── Badges ───────────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<SugestaoStatus, string> = {
  sugestao_pendente: "bg-amber-50 text-amber-700 border-amber-200",
  sugestao_validada: "bg-sky-50 text-sky-700 border-sky-200",
  sugestao_ajuste: "bg-violet-50 text-violet-700 border-violet-200",
  sugestao_aprovada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sugestao_negada: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Filete colorido no início da linha — leitura do status antes de ler o texto. */
const STATUS_RAIL: Record<SugestaoStatus, string> = {
  sugestao_pendente: "bg-amber-400",
  sugestao_validada: "bg-sky-400",
  sugestao_ajuste: "bg-violet-400",
  sugestao_aprovada: "bg-emerald-400",
  sugestao_negada: "bg-slate-300",
};

const railClass = (status: string) => STATUS_RAIL[status as SugestaoStatus] ?? "bg-slate-300";

const BADGE = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";

export function SuggestionStatusBadge({ status }: { status: string }) {
  const s = status as SugestaoStatus;
  const label = SUGESTAO_STATUS_LABELS[s] ?? status;
  return <span className={cn(BADGE, STATUS_CLASS[s] ?? "bg-slate-100 text-slate-600 border-slate-200")}>{label}</span>;
}

/** O mínimo que os badges de atraso precisam saber da vaga. */
export type PendingDaysRow = Pick<SuggestionRow, "status" | "daysPending" | "validatedAt">;

/**
 * Contador de dias parado — limiares vêm do shared (STALLED_DAYS / DANGER_DAYS).
 *
 * DUAS contagens, porque a bola muda de mão:
 *  - vaga ainda pendente → "pendente há N dias" desde o envio da logística;
 *  - vaga em `sugestao_validada` → "aguardando aprovação há N dias" contado do
 *    `validatedAt` (`daysAwaitingApproval`, o mesmo helper da coluna
 *    "Aguardando" da tela do aprovador). A área não pode ler "parada há 6 dias"
 *    numa vaga cujo atraso é do aprovador.
 *
 * `approverNames`: aprovador(es) da função, quando a tela souber — vai para o
 * tooltip da vaga validada ("quem tem de decidir"). Lista vazia é tratada pelo
 * `NoApproverBadge`.
 *
 * Selo SECUNDÁRIO (04/09): sem `tabIndex` — o texto do selo já diz tudo que
 * importa ("pendente há 6 dias"); o tooltip é complemento para o mouse. Um
 * tab-stop por selo fazia a fila de 40 linhas ter 120 paradas de teclado.
 */
export function PendingDaysBadge({ row, approverNames }: { row: PendingDaysRow; approverNames?: string[] }) {
  const awaiting = row.status === SUGESTAO_STATUS.VALIDADA;
  const days = awaiting ? daysAwaitingApproval(row) : row.daysPending;
  if (row.status === SUGESTAO_STATUS.APROVADA || row.status === SUGESTAO_STATUS.NEGADA) return null;
  const sev = pendingSeverity(days);
  if (sev === "ok") return null;
  const danger = sev === "danger";
  const who = approverNames?.length ? ` Quem decide: ${approverNames.join(", ")}.` : "";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(BADGE, danger ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
          <Clock className="w-3 h-3" aria-hidden="true" />
          {awaiting ? "aguardando aprovação" : "pendente"} há {days} {days === 1 ? "dia" : "dias"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {awaiting
          ? `A área já validou — a decisão está com o aprovador há ${days} ${days === 1 ? "dia" : "dias"}.${who}`
          : danger ? `Parada há ${DANGER_DAYS} dias ou mais — priorize.` : `Parada há ${STALLED_DAYS} dias ou mais.`}
      </TooltipContent>
    </Tooltip>
  );
}

// O badge vermelho "sem aprovador" foi REMOVIDO em 26/08 (decisão do dono: "não
// tem isso de sem aprovador" — existe um aprovador padrão do sistema, então
// nenhuma vaga validada fica sem quem decida). A salvaguarda continua onde ela
// é acionável: na aba "Validação de Escala" dentro de Funções, que mostra ao
// admin quais funções estão no aprovador padrão. Aqui, na tela da ÁREA, o aviso
// era só ruído — quem valida não cadastra aprovador.

function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = dayText(d).split(" ")[0];
  return `${weekday ? `${weekday} ` : ""}${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PendingRequestBadge({ row }: { row: SuggestionRow }) {
  const r = row.pendingRequest;
  if (!r) return null;
  const label = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Selo PRINCIPAL da vaga com pedido: fica focável — o motivo do pedido só existe no tooltip. */}
        <span tabIndex={0} className={cn(BADGE, "border-violet-200 bg-violet-50 text-violet-700")}>
          <MessageSquareWarning className="w-3 h-3" aria-hidden="true" /> Com pedido de {label.toLowerCase()}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        <p className="font-semibold">Aguardando o aprovador</p>
        {r.reason && <p className="whitespace-pre-wrap">{r.reason}</p>}
        <p className="text-muted-foreground">por {r.requestedByName}{r.createdAt ? ` · ${fmtDateTime(r.createdAt)}` : ""}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Badge + tooltip de uma decisão do aprovador (comentário, quem e quando). */
function DecisionBadge(
  { d, heading, label, comment, byName, at }:
  { d: DecisionDescription; heading: string; label?: string; comment: string | null; byName: string | null; at: string | null },
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(BADGE, DECISION_TONE_CLASS[d.tone])}>
          <Undo2 className="w-3 h-3" aria-hidden="true" /> {label ?? d.title}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
        <p className="font-semibold">{heading}</p>
        <p className="whitespace-pre-wrap">{comment?.trim() ? comment : <span className="italic text-muted-foreground">Sem comentário do aprovador.</span>}</p>
        <p className="text-muted-foreground">{byName ?? "Aprovador"}{at ? ` · ${fmtDateTime(at)}` : ""}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Decisão do aprovador sobre um PEDIDO: "Devolvida pelo aprovador" / "Pedido negado"… */
export function LastDecisionBadge({ info }: { info: LastDecisionInfo | null | undefined }) {
  const d = describeLastDecision(info);
  if (!info || !d) return null;
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
  return (
    <DecisionBadge
      d={d} heading={`${d.title} · pedido de ${typeLabel.toLowerCase()}`}
      comment={info.comment} byName={info.byName} at={info.at}
    />
  );
}

/**
 * Decisão do aprovador sobre a VAGA — devolver/reprovar/aprovar não criam
 * pedido, então vêm do `lastVagaDecision` do GET (lido de
 * `team_inclusion_logs`), com o comentário obrigatório do aprovador.
 */
export function VagaDecisionBadge({ info }: { info: LastVagaDecisionInfo | null | undefined }) {
  const d = describeVagaDecision(info);
  if (!info || !d) return null;
  return <DecisionBadge d={d} heading={d.title} comment={info.comment} byName={info.byName} at={info.at} />;
}

const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);

/**
 * UM selo "Voltou do aprovador" (04/09) no lugar de dois. A vaga podia carregar
 * ao mesmo tempo a decisão sobre um PEDIDO e a decisão sobre a VAGA, e a linha
 * mostrava dois selos compridos ("Devolvida pelo aprovador (reajuste)" +
 * "Devolvida pelo aprovador para nova validação") dizendo quase a mesma coisa.
 * Aqui vale a decisão MAIS RECENTE; o tooltip traz o título completo, o
 * comentário e quem decidiu, e o drawer continua mostrando as duas na íntegra.
 * O rótulo curto só vale quando a vaga de fato voltou (warn/danger); uma
 * decisão positiva mantém o próprio título.
 */
function ReturnedBadge({ row }: { row: Pick<SuggestionRow, "lastDecision" | "lastVagaDecision"> }) {
  const req = row.lastDecision ? describeLastDecision(row.lastDecision) : null;
  const vaga = row.lastVagaDecision ? describeVagaDecision(row.lastVagaDecision) : null;
  if (!req && !vaga) return null;
  const useVaga = !!vaga && (!req || ts(row.lastVagaDecision?.at) >= ts(row.lastDecision?.at));
  if (useVaga && vaga && row.lastVagaDecision) {
    const info = row.lastVagaDecision;
    return (
      <DecisionBadge d={vaga} heading={vaga.title} label={vaga.tone === "ok" ? undefined : "Voltou do aprovador"}
        comment={info.comment} byName={info.byName} at={info.at} />
    );
  }
  if (req && row.lastDecision) {
    const info = row.lastDecision;
    const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
    return (
      <DecisionBadge d={req} heading={`${req.title} · pedido de ${typeLabel.toLowerCase()}`} label={req.tone === "ok" ? undefined : "Voltou do aprovador"}
        comment={info.comment} byName={info.byName} at={info.at} />
    );
  }
  return null;
}

/**
 * Todos os badges de status de uma vaga (mesma ordem na tabela e nos cards):
 * selo principal + dias parada + "voltou do aprovador".
 * `approverNames`: aprovador(es) da função — `undefined` quando a tela não sabe
 * (aí nada é afirmado); `[]` significa "função sem aprovador cadastrado".
 */
export function StatusCell({ row, approverNames }: { row: SuggestionRow; approverNames?: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Com pedido em aberto, UM selo só — o do pedido, que diz o tipo certo e
          traz motivo/autor no tooltip. O status cru ("Com pedido de ajuste")
          ao lado de "pedido de exclusão" dizia duas coisas diferentes sobre a
          mesma vaga. */}
      {row.pendingRequest
        ? <PendingRequestBadge row={row} />
        : <SuggestionStatusBadge status={row.status} />}
      <PendingDaysBadge row={row} approverNames={approverNames} />
      <ReturnedBadge row={row} />
    </div>
  );
}

// ── Helpers de exibição ──────────────────────────────────────────────────────

export function periodLabel(row: SuggestionRow): string {
  const days = workDaysOf(row);
  if (days.length === 0) {
    const s = ymd(row.scheduleStartDate); const e = ymd(row.scheduleEndDate);
    if (!s) return "Sem período";
    return s === e || !e ? formatDayMonthBr(s) : `${formatDayMonthBr(s)} – ${formatDayMonthBr(e)}`;
  }
  const first = days[0]; const last = days[days.length - 1];
  return first === last ? formatDayMonthBr(first) : `${formatDayMonthBr(first)} – ${formatDayMonthBr(last)}`;
}
export function legLabel(mode: string | null | undefined, date: unknown, time: string | null | undefined): string {
  const parts: string[] = [];
  if (mode) parts.push(TRANSPORT_MODE_LABELS[mode as TransportMode] ?? mode);
  if (date) parts.push(formatDayMonthBr(ymd(date as string)));
  if (time) parts.push(time);
  // Ver legLabel do Histórico: perna ainda não decidida se diz em palavra.
  return parts.length ? parts.join(" ") : "A definir";
}

/** Pontas do período: dias de trabalho quando existem, senão o intervalo da escala. */
function periodEnds(row: SuggestionRow): [string, string] {
  const days = workDaysOf(row);
  if (days.length > 0) return [days[0], days[days.length - 1]];
  return [ymd(row.scheduleStartDate), ymd(row.scheduleEndDate)];
}

/** "Sáb 05/09 – Ter 08/09 · 4 diárias" com "N dias" (lista de dias) em tooltip. */
function PeriodCell({ row, className }: { row: SuggestionRow; className?: string }) {
  const days = workDaysOf(row);
  const [start, end] = periodEnds(row);
  const label = (
    <span className={cn("font-mono tabular-nums", className)}>
      {start
        ? <>
            <DayLabel v={start} />
            {end && end !== start && <> – <DayLabel v={end} /></>}
          </>
        // Travessão solto não diz nada a quem lê: a falta vira frase.
        : <span className="font-sans italic text-slate-500">Sem período</span>}
      {" "}<span className="text-slate-500 font-sans">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
    </span>
  );
  if (days.length === 0) return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">{label}</span></TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="font-semibold">{days.length} {days.length === 1 ? "dia" : "dias"} de trabalho</p>
        <p className="font-mono">{days.map((d) => dayText(d) || formatDayMonthBr(d)).join(", ")}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Ida/volta + o que a vaga precisa, em chips (uma coluna só de "Logística") —
 * mesma linguagem visual da grade da Sugestão (`logistics-chips`).
 *
 * `responsive` (04/09): abaixo de `xl` os chips saem na versão curta (só
 * "Ida · 15/10"), que cabe na coluna estreita; de `xl` para cima, a versão
 * inteira. São dois blocos com `hidden`, não uma media query em JS — a lista
 * não precisa re-renderizar ao redimensionar.
 */
function LogisticsChips({ row, responsive = false }: { row: SuggestionRow; responsive?: boolean }) {
  // `legValue` trata travessão solto como ausência: campo "—" não pode virar
  // chip nem fazer a vaga parecer que tem viagem.
  const hasLeg = [
    row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime,
    row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime,
  ].some((v) => legValue(v) !== null);
  if (!hasLeg && !row.needsTicket && !row.needsAccommodation) {
    return <span className="text-[11px] italic text-slate-500">Sem logística</span>;
  }
  const chips = (compact: boolean) => (
    <>
      <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} compact={compact} />
      <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} compact={compact} />
      <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
    </>
  );
  if (!responsive) return <div className="flex flex-wrap items-center gap-1.5">{chips(false)}</div>;
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 xl:hidden">{chips(true)}</div>
      <div className="hidden flex-wrap items-center gap-1.5 xl:flex">{chips(false)}</div>
    </>
  );
}

function IdChip({ row, onClick }: { row: SuggestionRow; onClick?: () => void }) {
  const cls = "inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-blue-800";
  if (!onClick) return <span className={cls}>#{row.inclusionNumber}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      aria-label={`Ver detalhes da vaga #${row.inclusionNumber}`}>
      #{row.inclusionNumber}
    </button>
  );
}

function LockedHint({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex items-center justify-center text-slate-400" aria-label={reason}>
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

// ── Lista ────────────────────────────────────────────────────────────────────

export type SuggestionSortField = "id" | "function" | "period";

// ── Agrupamento por evento (modo "Todos os eventos", 26/08) ──────────────────

export interface EventGroup {
  key: string;
  name: string;
  /** "05/09 – 08/09/2026" — vazio quando o servidor não sabe o período. */
  period: string;
  rows: SuggestionRow[];
}

/** Período do evento de uma linha, no formato do resto do módulo. */
export function eventPeriodLabel(row: Pick<SuggestionRow, "eventStartDate" | "eventEndDate">): string {
  const start = ymd(row.eventStartDate);
  if (!start) return "";
  return formatDateRange(start, ymd(row.eventEndDate) || start, { withYear: true });
}

/**
 * Agrupa as vagas por EVENTO mantendo a ordem que a tela já escolheu dentro de
 * cada grupo (função, período, o que o usuário ordenou). Os grupos saem do mais
 * recente para o mais antigo — quem abre "Todos os eventos" quer ver primeiro o
 * que está acontecendo agora; sem data, o desempate é pelo nome.
 */
export function groupRowsByEvent(rows: SuggestionRow[]): EventGroup[] {
  const groups = new Map<string, EventGroup & { start: string }>();
  for (const row of rows) {
    const key = row.eventId ?? "";
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: row.eventName ?? "Evento sem nome",
        period: eventPeriodLabel(row),
        start: ymd(row.eventStartDate),
        rows: [],
      };
      groups.set(key, g);
    }
    g.rows.push(row);
  }
  return Array.from(groups.values()).sort(
    (a, b) => b.start.localeCompare(a.start) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );
}

/**
 * Rótulo do evento na linha/no card — mesmo padrão tipográfico do módulo.
 * Exportado (04/09): a confirmação do lote na tela usa a MESMA linha para
 * dizer de que evento é cada vaga no modo "Todos os eventos".
 */
export function EventLine({ row, className }: { row: Pick<SuggestionRow, "eventName" | "eventStartDate" | "eventEndDate">; className?: string }) {
  const period = eventPeriodLabel(row);
  return (
    <span className={cn("flex items-center gap-1 text-[11px] text-slate-500 min-w-0", className)}>
      <CalendarDays className="w-3 h-3 shrink-0 text-slate-400" aria-hidden="true" />
      <span className="truncate font-semibold text-slate-600">{row.eventName ?? "Evento sem nome"}</span>
      {period && <span className="font-mono text-slate-500 whitespace-nowrap">· {period}</span>}
    </span>
  );
}

/** Ações por vaga (uma linha da tabela / um card). */
export interface SuggestionRowActions {
  onValidate?: (row: SuggestionRow) => void;
  onAdjust?: (row: SuggestionRow) => void;
  onDelete?: (row: SuggestionRow) => void;
}

export interface SuggestionsListProps extends SuggestionRowActions {
  rows: SuggestionRow[];
  functionNameById: Map<string, string>;
  /** Vagas (visíveis) que aceitam ação do usuário. */
  selectableIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  showSelection: boolean;
  sortConfig: SortConfig<SuggestionSortField> | null;
  onSort: (field: SuggestionSortField) => void;
  onOpenDetail?: (row: SuggestionRow) => void;
  /** Linhas realçadas por um instante (pedido enviado; "Ver quais" do lote parcial). */
  highlightIds?: ReadonlySet<string>;
  /**
   * Aprovador(es) cadastrados da função da linha (de /api/functions). Lista
   * vazia → a vaga validada não tem para quem ir (aviso na linha + banner da
   * tela). Prop ausente → a tela não sabe e nada é afirmado.
   */
  approverNamesFor?: (row: SuggestionRow) => string[];
  /**
   * Modo "Todos os eventos": a tabela ganha cabeçalho de grupo por evento e o
   * card ganha a linha do evento. Com um evento selecionado fica `false` — a
   * barra de contexto já diz qual é, repetir em toda linha seria ruído.
   */
  showEvent?: boolean;
}

/** `<th>` no padrão do módulo (mesma tipografia do quadro "Escala"). */
const TH = cn("px-3 py-2 text-left whitespace-nowrap", TABLE_TH);

/** Botão de ordenação usado dentro dos `<th>` (o `<th>` carrega o `aria-sort`). */
function SortButton({
  field, label, sortConfig, onSort, className,
}: {
  field: SuggestionSortField; label: string;
  sortConfig: SortConfig<SuggestionSortField> | null;
  onSort: (field: SuggestionSortField) => void;
  className?: string;
}) {
  const active = sortConfig?.field === field;
  const dir = active ? sortConfig!.direction : null;
  return (
    <button
      type="button" onClick={() => onSort(field)} data-testid={`header-${field}`}
      aria-label={`Ordenar por ${label}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm uppercase tracking-[inherit] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active ? "text-primary" : "hover:text-slate-700",
        className,
      )}
    >
      <span>{label}</span>
      {dir === "asc" && <ChevronUp className="w-3 h-3" aria-hidden="true" />}
      {dir === "desc" && <ChevronDown className="w-3 h-3" aria-hidden="true" />}
      {!dir && <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" aria-hidden="true" />}
    </button>
  );
}

const ariaSort = (sortConfig: SortConfig<SuggestionSortField> | null, ...fields: SuggestionSortField[]) =>
  sortConfig && fields.includes(sortConfig.field)
    ? (sortConfig.direction === "asc" ? "ascending" : "descending")
    : "none";

const ICON_BTN = "inline-flex items-center justify-center w-7 h-7 rounded-lg border bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Ações da vaga na própria linha (mockup): validar em destaque, pedir ajuste e
 * pedir exclusão como ícones, detalhe no fim. Quais aparecem sai de
 * `canValidate`/`canRequestChange` (availableSuggestionActions); travada mostra
 * o motivo — nunca `title` em elemento desabilitado.
 *
 * Na tabela (04/09) cada botão tem um LUGAR reservado: quando a ação não
 * existe, entra um espaço invisível do mesmo tamanho, e a coluna "Ações" sai
 * alinhada de cima a baixo — antes o botão "Ver detalhe" pulava para a
 * esquerda nas linhas sem "Validar". Nos cards (`compact`) não há coluna a
 * alinhar, então os espaços não entram.
 *
 * Os ícones usam `title` + `aria-label` em vez de Tooltip (04/09): três
 * tooltips Radix por linha eram ~600 nós a mais numa lista de 200 vagas, para
 * dizer o mesmo que o `title` nativo diz.
 */
function RowActions({ row, onValidate, onAdjust, onDelete, onOpenDetail, compact }: SuggestionRowActions & {
  row: SuggestionRow; onOpenDetail?: (row: SuggestionRow) => void; compact?: boolean;
}) {
  const mayValidate = onValidate && canValidate(row);
  const mayRequest = canRequestChange(row);
  // A coluna Status já diz "Com pedido de exclusão" e "Validada — aguardando
  // aprovação". Repetir o mesmo motivo aqui em texto fazia a linha dizer três
  // vezes a mesma coisa: aqui fica só o que o Status NÃO conta (a função não é
  // sua). O cadeado da primeira coluna continua explicando no tooltip.
  const lock = mayValidate || mayRequest ? null : lockReason(row);
  const reason = lock && !row.pendingRequest && row.status !== SUGESTAO_STATUS.VALIDADA ? lock : null;
  /** Espaço do tamanho do botão ausente (só na tabela). */
  const vazio = (w: string) => (compact ? null : <span className={cn("inline-block h-7", w)} aria-hidden="true" />);
  const n = row.inclusionNumber;
  return (
    <div className={cn("inline-flex items-center gap-1.5", compact && "flex-wrap")}>
      {reason && <span className="mr-1 text-[11px] text-slate-500">{reason}</span>}
      {mayValidate ? (
        <Button type="button" size="sm" onClick={() => onValidate!(row)}
          className="h-7 w-[76px] rounded-lg bg-emerald-600 px-2 text-xs font-semibold text-white hover:bg-emerald-700">
          <CheckCheck className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Validar
        </Button>
      ) : vazio("w-[76px]")}
      {mayRequest && onAdjust ? (
        <button type="button" onClick={() => onAdjust(row)} aria-label={`Pedir ajuste da vaga #${n}`} title="Pedir ajuste"
          className={cn(ICON_BTN, "border-slate-200 text-slate-600 hover:border-primary/30 hover:text-primary")}>
          <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ) : vazio("w-7")}
      {mayRequest && onDelete ? (
        <button type="button" onClick={() => onDelete(row)} aria-label={`Pedir exclusão da vaga #${n}`} title="Pedir exclusão"
          className={cn(ICON_BTN, "border-red-200 text-red-700 hover:bg-red-50")}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ) : vazio("w-7")}
      {onOpenDetail && (
        <button type="button" onClick={() => onOpenDetail(row)} aria-label={`Ver detalhe da vaga #${n}`} title="Ver detalhe"
          className={cn(ICON_BTN, "border-slate-200 text-slate-600 hover:border-primary/30 hover:text-primary")}>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Blocos compartilhados entre a linha da tabela e o card ──────────────────

/** Nome da função — botão que abre o detalhe quando a lista permite. */
function NameButton({ name, onOpen }: { name: string; onOpen?: () => void }) {
  return onOpen ? (
    <button type="button" onClick={onOpen} title={name}
      className="block max-w-full truncate text-left text-[13px] font-semibold hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
      {name}
    </button>
  ) : (
    <span className="block truncate text-[13px] font-semibold" title={name}>{name}</span>
  );
}

/**
 * "Área · observação" — a segunda linha do bloco "Vaga" (04/09): a área vira um
 * chip neutro (é um rótulo, não uma frase) e a observação ganha duas linhas
 * antes de cortar — numa linha só, "Levar rádio e colete; chegar às 6h para a
 * montagem" virava "Levar rádio e col…", e o corte comia justamente a instrução.
 */
function AreaLine({ row }: { row: SuggestionRow }) {
  const obs = row.observations?.trim();
  return (
    <span className="flex items-start gap-1.5 min-w-0">
      <span className={cn(CHIP_NEUTRAL, "shrink-0")}>{row.area ?? "Sem área"}</span>
      {obs && <span className="line-clamp-2 text-[11px] leading-4 text-slate-500" title={obs}>{obs}</span>}
    </span>
  );
}

/** Pulso da linha que acabou de receber um pedido — sem animação para quem pediu menos movimento. */
const PULSE = "animate-pulse motion-reduce:animate-none ring-2 ring-inset ring-primary/40";

interface TableRowProps extends SuggestionRowActions {
  row: SuggestionRow;
  name: string;
  zebra: boolean;
  selectable: boolean;
  selected: boolean;
  showSelection: boolean;
  highlighted: boolean;
  approverNames?: string[];
  onToggle: (id: string) => void;
  onOpenDetail?: (row: SuggestionRow) => void;
}

/**
 * Uma linha da tabela — `memo` (04/09): digitar na busca ou marcar uma vaga
 * re-renderizava a tela inteira, e com ela as 200 linhas. Com props primitivas
 * e callbacks estáveis (a tela usa `useCallback`), só a linha que mudou volta
 * a renderizar.
 */
const SuggestionTableRow = memo(function SuggestionTableRow({
  row, name, zebra, selectable, selected, showSelection, highlighted, approverNames,
  onToggle, onOpenDetail, onValidate, onAdjust, onDelete,
}: TableRowProps) {
  const reason = selectable ? null : lockReason(row);
  const open = onOpenDetail ? () => onOpenDetail(row) : undefined;
  return (
    <tr data-testid={`suggestion-row-${row.inclusionNumber}`}
      className={cn("border-b border-slate-100 transition-colors", selected ? "bg-brand-soft/50" : zebra ? "bg-slate-50/40" : "bg-white",
        row.canEdit ? "text-slate-800" : "text-slate-600", highlighted && PULSE)}>
      {/* Filete na altura toda da linha (absoluto dentro da célula): com 36px
          fixos ele parecia um traço solto nas linhas de duas ou três alturas. */}
      <td className="relative w-9 p-0">
        <span className={cn("absolute inset-y-1.5 left-2 w-1 rounded-full", railClass(row.status))} aria-hidden="true" />
      </td>
      {showSelection && (
        <td className="px-1 py-2 text-center">
          {selectable ? (
            <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
          ) : (
            <LockedHint reason={reason ?? "Sem ações disponíveis"} />
          )}
        </td>
      )}
      {/* `align-top` nas duas: o chip "#" fica na linha do NOME, não flutuando
          no meio de um bloco de três linhas. */}
      <td className="px-3 py-2.5 align-top"><IdChip row={row} onClick={open} /></td>
      <td className="px-3 py-2 align-top max-w-[300px]">
        <div className="min-w-0 space-y-0.5">
          <NameButton name={name} onOpen={open} />
          <AreaLine row={row} />
          {/* Abaixo de 2xl o período mora aqui, como 3ª linha do bloco "Vaga" —
              a coluna própria só existe quando a tabela cabe inteira. */}
          <span className="block text-xs 2xl:hidden"><PeriodCell row={row} /></span>
        </div>
      </td>
      <td className="hidden px-3 py-2 text-xs whitespace-nowrap 2xl:table-cell"><PeriodCell row={row} /></td>
      <td className="px-3 py-2"><LogisticsChips row={row} responsive /></td>
      <td className="px-3 py-2 min-w-[220px]"><StatusCell row={row} approverNames={approverNames} /></td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <RowActions row={row} onValidate={onValidate} onAdjust={onAdjust} onDelete={onDelete} onOpenDetail={onOpenDetail} />
      </td>
    </tr>
  );
});

export function SuggestionsList({
  rows, functionNameById, selectableIds, selectedIds, onToggle, onToggleAll, showSelection, sortConfig, onSort,
  onOpenDetail, highlightIds, approverNamesFor, showEvent = false, onValidate, onAdjust, onDelete,
}: SuggestionsListProps) {
  const selectableList = Array.from(selectableIds);
  const selectedVisible = selectableList.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectableList.length > 0 && selectedVisible === selectableList.length;
  const someSelected = selectedVisible > 0 && !allSelected;
  /** Ações por linha só quando a tela permite agir (fora do modo leitura). */
  const acoes: SuggestionRowActions = showSelection ? { onValidate, onAdjust, onDelete } : {};

  const nameOf = (row: SuggestionRow) => functionNameById.get(row.functionId) ?? "Sem função";
  const rowTone = (row: SuggestionRow) => (row.canEdit ? "text-slate-800" : "text-slate-600");

  /** Uma linha da tabela (a mesma, agrupada por evento ou não). */
  const tableRow = (row: SuggestionRow, i: number) => (
    <SuggestionTableRow
      key={row.id}
      row={row}
      name={nameOf(row)}
      zebra={i % 2 === 1}
      selectable={selectableIds.has(row.id)}
      selected={selectedIds.has(row.id)}
      showSelection={showSelection}
      highlighted={!!highlightIds?.has(row.id)}
      approverNames={approverNamesFor?.(row)}
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
      {...acoes}
    />
  );

  /** Colunas da tabela — o cabeçalho de grupo atravessa todas. */
  const colCount = showSelection ? 8 : 7;
  const groups = showEvent ? groupRowsByEvent(rows) : [];

  return (
    <>
      {/* Tabela (≥ md) */}
      {/* Nada de `overflow-hidden` aqui: qualquer ancestral com overflow vira
          um contêiner de rolagem e o `sticky` do cabeçalho passa a se ancorar
          NELE — que não rola — ou seja, o cabeçalho não gruda em lugar nenhum. */}
      <div className="hidden md:block rounded-2xl border border-slate-200 bg-white">
        {/* Sem altura máxima: a lista rola COM a página (nada de barra dentro de
            barra). Até `xl` a tabela (820px) pode não caber e precisa da barra
            horizontal; de `xl` para cima ela cabe, o overflow volta a `visible`
            e só então o cabeçalho consegue grudar no topo da página.
            Por que `xl` e não `lg` (04/09): em 1024px a área útil é 1024 −
            248 do sidebar − 64 de padding = 712px — nenhuma tabela de sete
            colunas cabe, e overflow visível ali só faria a tabela vazar do
            card. Em 1280px (968px úteis) a versão compacta (~880px) cabe. */}
        <div className="overflow-x-auto xl:overflow-x-visible">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">Vagas sugeridas do evento</caption>
            {/* --sticky-top (main-layout) = barra do topo + banner de simulação:
                o cabeçalho para EMBAIXO do que está fixo, nunca atrás. */}
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-[var(--sticky-top,3.5rem)] z-10 shadow-[0_1px_0_0_rgb(226_232_240)] [&>tr>th:first-child]:rounded-tl-2xl [&>tr>th:last-child]:rounded-tr-2xl">
              <tr className="group">
                <th scope="col" className="w-9 p-0"><span className="sr-only">Situação</span></th>
                {showSelection && (
                  <th scope="col" className={cn(TH, "w-10 px-1 text-center")}>
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      disabled={selectableList.length === 0}
                      onCheckedChange={onToggleAll}
                      className="data-[state=indeterminate]:bg-primary/70 data-[state=indeterminate]:text-primary-foreground"
                      aria-label={allSelected ? "Desmarcar todas as vagas visíveis" : "Selecionar todas as vagas visíveis em que posso agir"}
                    />
                  </th>
                )}
                {/* "#" e "Vaga" em colunas próprias (04/09): cada uma com o seu
                    `aria-sort` — num `<th>` só, o leitor de tela anunciava
                    "ordenado" sem dizer por qual dos dois. */}
                <th scope="col" className={cn(TH, "w-[64px] pr-1")} aria-sort={ariaSort(sortConfig, "id")}>
                  <SortButton field="id" label="#" sortConfig={sortConfig} onSort={onSort} />
                </th>
                <th scope="col" className={TH} aria-sort={ariaSort(sortConfig, "function")}>
                  <SortButton field="function" label="Vaga" sortConfig={sortConfig} onSort={onSort} />
                </th>
                <th scope="col" className={cn(TH, "hidden 2xl:table-cell")} aria-sort={ariaSort(sortConfig, "period")}>
                  <SortButton field="period" label="Período / diárias" sortConfig={sortConfig} onSort={onSort} />
                </th>
                <th scope="col" className={TH}>Logística</th>
                <th scope="col" className={cn(TH, "min-w-[220px]")}>Status</th>
                <th scope="col" className={cn(TH, "min-w-[180px] text-right")}>Ações</th>
              </tr>
            </thead>
            {/* Um <tbody> por evento no modo "Todos os eventos" (HTML válido:
                a tabela aceita vários), com um cabeçalho de grupo por bloco. */}
            {showEvent ? (
              groups.map((g) => (
                <tbody key={g.key}>
                  <tr className="bg-slate-50/80">
                    <th scope="colgroup" colSpan={colCount} className="border-y border-slate-200 px-3 py-1.5 text-left">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className={TABLE_TH}>Evento</span>
                        <span className="text-[13px] font-semibold text-slate-800">{g.name}</span>
                        {g.period && <span className="font-mono text-[11px] text-slate-500">{g.period}</span>}
                        <span className="text-[11px] text-slate-500">· {g.rows.length} {g.rows.length === 1 ? "vaga" : "vagas"}</span>
                      </span>
                    </th>
                  </tr>
                  {g.rows.map((row, i) => tableRow(row, i))}
                </tbody>
              ))
            ) : (
              <tbody>{rows.map((row, i) => tableRow(row, i))}</tbody>
            )}
          </table>
        </div>
      </div>

      {/* Cards (< md) */}
      <ul className="md:hidden space-y-2" aria-label="Vagas sugeridas">
        {rows.map((row) => {
          const selectable = selectableIds.has(row.id);
          const selected = selectedIds.has(row.id);
          const reason = selectable ? null : lockReason(row);
          const open = onOpenDetail ? () => onOpenDetail(row) : undefined;
          return (
            <li key={row.id} className={cn("overflow-hidden rounded-2xl border bg-white", selected ? "border-primary/40 bg-brand-soft/40" : "border-slate-200", rowTone(row), highlightIds?.has(row.id) && PULSE)}>
              <div className="flex">
                <span className={cn("w-1 shrink-0", railClass(row.status))} aria-hidden="true" />
                <div className="flex-1 min-w-0 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {showSelection && (
                      <span className="w-4 h-4 mt-0.5 shrink-0 inline-flex items-center justify-center">
                        {selectable
                          ? <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                          : <LockedHint reason={reason ?? "Sem ações disponíveis"} />}
                      </span>
                    )}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <IdChip row={row} onClick={open} />
                        <span className="min-w-0 flex-1"><NameButton name={nameOf(row)} onOpen={open} /></span>
                      </div>
                      <AreaLine row={row} />
                      {showEvent && <EventLine row={row} />}
                    </div>
                  </div>
                  <p className="text-xs"><PeriodCell row={row} /></p>
                  <LogisticsChips row={row} />
                  <StatusCell row={row} approverNames={approverNamesFor?.(row)} />
                  <div className="flex justify-end pt-0.5">
                    <RowActions row={row} {...acoes} onOpenDetail={onOpenDetail} compact />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default SuggestionsList;
