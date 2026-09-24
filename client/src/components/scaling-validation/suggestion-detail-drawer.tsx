import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowRight, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, History,
  ExternalLink, Luggage, MessageSquareWarning, PencilLine, StickyNote, Trash2, Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { formatDateBr } from "@/lib/dates";
import { scalingHref } from "@/lib/use-scaling-event";
import { cn, formatDiarias } from "@/lib/utils";
import type { Event } from "@shared/schema";
import {
  CHANGE_REQUEST_TYPE_LABELS, SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODES, TRANSPORT_MODE_LABELS,
  isSuggestionInclusion,
  type ChangeRequestType, type SugestaoStatus, type TransportMode,
} from "@shared/scaling-validation-rules";
import { StatusCell } from "./suggestions-list";
import { DayLabel, LegChip, NeedChip, SECTION_TITLE, dayInfo, dayText, legValue } from "./logistics-chips";
import {
  DECISION_TONE_CLASS, TEAM_INCLUSIONS_QUERY_KEY, canRequestChange, canValidate,
  describeLastDecision, describeVagaDecision, workDaysOf, type InclusionLog, type SuggestionRow,
} from "./types";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { ValidationNoteBlock } from "./validation-note-blocks";

interface SuggestionDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SuggestionRow | null;
  functionName?: string;
  event?: Event;
  /** Aprovador(es) da função — mesmo contrato do StatusCell (undefined = a tela não sabe). */
  approverNames?: string[];
  /**
   * Ações do rodapé — ausentes em modo leitura. Quais aparecem sai das mesmas
   * regras da linha (`canValidate` / `canRequestChange`).
   */
  onValidate?: (row: SuggestionRow) => void;
  onAdjust?: (row: SuggestionRow) => void;
  onDelete?: (row: SuggestionRow) => void;
  /**
   * Fila que o ‹ › percorre — a lista JÁ FILTRADA E ORDENADA da tela. Sem ela o
   * drawer continua funcionando, só sem navegação.
   */
  list?: SuggestionRow[];
  /** Trocar a vaga aberta sem fechar o drawer. */
  onNavigate?: (row: SuggestionRow) => void;
  /** Valida a vaga atual e abre a próxima ainda pendente da fila. */
  onValidateAndNext?: (row: SuggestionRow) => void;
  /** Existe próxima pendente depois desta? (decide o rótulo do botão) */
  hasNextValidatable?: boolean;
  /**
   * Mostra no rodapé o link para a tela onde a vaga está agora. Ligado pelo
   * Histórico: nas outras telas o link apontaria para a própria tela.
   */
  mostrarOndeEsta?: boolean;
  /**
   * Chamado quando o drawer TERMINOU de fechar (fim da animação, foco já
   * devolvido). A tela usa isto para só então abrir um diálogo: dois overlays
   * Radix trocando focus-trap/scroll-lock no mesmo tick deixam a página com o
   * scroll travado e o foco perdido.
   */
  onClosed?: () => void;
}

// ── Vocabulário: nada de chave de banco na tela ──────────────────────────────

/**
 * Fases de `team_inclusions` em pt-BR — mesma leitura do `getPhaseLabel` de
 * `client/src/components/scaling/scaling-utils.ts` (mapa local para não acoplar
 * o módulo da Validação ao da Escalação).
 */
const PHASE_LABELS: Record<string, string> = {
  sugestao: "Sugestão",
  inclusao: "Inclusão de Equipe",
  escalacao: "Escalação",
  passagem: "Compra de Passagem",
  hospedagem: "Hospedagem",
  aprovacao: "Aprovação",
};

/**
 * Status de `team_inclusions` FORA da sugestão (a vaga aprovada vira inclusão
 * comum) — mesmos rótulos do mapa pt-BR de
 * `client/src/components/scaling/swap-request-panel.tsx`.
 */
const INCLUSION_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  planejado: "Planejado",
  confirmado: "Confirmado",
  pendente: "Pendente",
  reaberto: "Reaberto",
  escalacao: "Escalado",
  passagem: "Aguardando passagem",
  passagem_comprada: "Passagem comprada",
  hospedagem: "Aguardando hospedagem",
  hospedagem_comprada: "Hospedagem reservada",
  hospedagem_passagem_comprada: "Passagem e hospedagem prontas",
  aprovacao: "Em aprovação",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
  aguardando_producao: "Aguardando a produção",
};

/** Estados que o servidor escreve à mão no log (server/scaling-validation.ts). */
const SPECIAL_STATE_LABELS: Record<string, string> = {
  removida: "Removida da sugestão",
};

/**
 * Ações de log em pt-BR — só as que este módulo gera. Mesma ideia do
 * `LOG_ACTION_LABELS` de `client/src/components/scaling/inclusion-details-tabs.tsx`
 * (aqui sem emoji, e usado apenas como reserva quando o log vem sem frase).
 */
const LOG_ACTION_LABELS: Record<string, string> = {
  created: "Criada",
  create: "Criada",
  update: "Atualizada",
  deleted: "Excluída",
  delete: "Excluída",
  status_changed: "Status alterado",
  suggestion_sent: "Escala sugerida enviada",
  suggestion_validated: "Validada pela área",
  suggestion_approved: "Aprovada pelo aprovador",
  suggestion_rejected: "Reprovada pelo aprovador",
  suggestion_returned: "Devolvida para a área",
  suggestion_change_requested: "Pedido aberto pela área",
  created_from_change_request: "Criada por pedido de inclusão",
  change_request_approved: "Pedido aprovado",
  change_request_reajustar: "Pedido reajustado",
  change_request_negar: "Pedido negado",
  suggestion_bypass_approve: "Aprovada sem validação da área",
  suggestion_bypass_reject: "Reprovada sem validação da área",
};

/** Chave técnica (snake_case, com ou sem "fase/status") — nunca vai para a tela. */
const TECHNICAL_KEY_RE = /^[a-z][a-z0-9_]*(?:\/[a-z][a-z0-9_]*)?$/;

const statusLabel = (s: string): string | null =>
  SUGESTAO_STATUS_LABELS[s as SugestaoStatus] ?? INCLUSION_STATUS_LABELS[s] ?? SPECIAL_STATE_LABELS[s] ?? null;

/**
 * Estado da vaga em pt-BR a partir do que o log guardou ("sugestao/
 * sugestao_pendente", "sugestao_pendente", "inclusao/planejado", "removida").
 * `null` quando não há rótulo — a regra é não mostrar nada, jamais a chave crua.
 */
function stateLabel(raw: string): string | null {
  if (raw.includes("/")) {
    const [phase, status] = raw.split("/");
    const st = statusLabel(status);
    if (!st) return null;
    const ph = PHASE_LABELS[phase];
    // Dentro da sugestão o próprio rótulo do status já diz a fase.
    return ph && phase !== "sugestao" ? `${ph} · ${st}` : st;
  }
  return statusLabel(raw);
}

/**
 * Um lado do "de → para" do log. Estado conhecido vira rótulo pt-BR; chave
 * técnica sem rótulo (dado legado, fase nova) some; valor humano que o log já
 * grava em português (nome, período, observação) passa como está.
 */
function valueText(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const state = stateLabel(v);
  if (state) return state;
  return TECHNICAL_KEY_RE.test(v) ? null : v;
}

// ── Estilo ───────────────────────────────────────────────────────────────────

// Título de seção do módulo (04/09): antes 10px/slate-400 só aqui — o mesmo
// título era 11px/slate-500 nos cartões vizinhos, e o contraste de 400 sobre
// branco não passa para texto.
const SECTION = cn("flex items-center gap-1.5", SECTION_TITLE);
const CARD = "rounded-xl border border-border bg-card p-3.5 space-y-2";

/** "Qua 20/08 14:32" — dia da semana como no resto do módulo. */
function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "Sem data";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Sem data";
  const weekday = dayText(d).split(" ")[0];
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${weekday ? `${weekday} ` : ""}${formatDateBr(d)} ${time}`;
}

function Card({ id, title, icon: Icon, children }: {
  id: string; title: string; icon?: LucideIcon; children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={CARD}>
      <h3 id={id} className={SECTION}>
        {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Chip de dia em leitura — mesma caixa do `WorkDaysPicker`, sem clique. */
function DayChip({ v }: { v: string }) {
  const h = dayInfo(v);
  if (!h) return null;
  // Sem fundo pintado no fim de semana: fundo aqui significaria "marcado"
  // (mesma regra do seletor de dias) — o sinal fica no nome do dia.
  return (
    <span className="flex flex-col items-center min-w-[52px] rounded-lg border border-border bg-card px-2 py-1 text-2xs leading-tight text-slate-600">
      <span className="font-semibold tabular-nums">{h.date}</span>
      <span className={cn("text-2xs", h.isWeekend ? "text-warning" : "text-muted-foreground")}>{h.dayName}</span>
    </span>
  );
}

/**
 * Uma perna em texto corrido para a frase do histórico: "ida ônibus Qua 09/09
 * 07:30". Devolve "" quando a perna não tem nada de real.
 */
function legPhrase(dir: "ida" | "volta", mode: unknown, date: unknown, time: unknown): string {
  const m = legValue(mode as string | null) as string | null;
  const modeLabel = m && (TRANSPORT_MODES as readonly string[]).includes(m)
    ? TRANSPORT_MODE_LABELS[m as TransportMode].toLowerCase() : "";
  const day = dayText(legValue(date as string | null));
  const hour = (legValue(time as string | null) as string | null) ?? "";
  const parts = [modeLabel, day, hour].filter(Boolean);
  return parts.length ? `${dir} ${parts.join(" ")}` : "";
}

/**
 * Como a vaga foi sugerida, em uma frase — a entrada de criação do histórico.
 *
 * Existe porque a linha do tempo não pode AFIRMAR o que não aconteceu: quando a
 * vaga ainda não tem log nenhum, o único fato verdadeiro é que a logística a
 * sugeriu, e a frase descreve a própria vaga. A unidade sai de `formatDiarias`
 * ("3 diárias"), nunca o número cru, que cortava a frase pela metade.
 */
function describeSuggestedVaga(row: SuggestionRow): string {
  const days = workDaysOf(row);
  const diarias = formatDiarias(days.length || row.dailyRates || 0);
  const legs = [
    legPhrase("ida", row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime),
    legPhrase("volta", row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime),
  ].filter(Boolean);
  const tail = legs.length ? legs.join(", ") : "sem logística";
  return `Vaga sugerida pela logística — ${diarias}, ${tail}`;
}

/**
 * A vaga tem ALGUMA perna de viagem?
 *
 * Passa por `legValue`, que trata travessão solto ("—", "-", "--:--") como
 * ausência: sem isso um campo "vazio preenchido com traço" virava chip
 * "Volta · —", que afirma viagem onde não há nenhuma.
 */
function hasAnyLeg(row: SuggestionRow): boolean {
  return [
    row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime,
    row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime,
  ].some((v) => legValue(v) !== null);
}

/**
 * Em que tela a vaga se encontra AGORA. É o que responde "e daí, onde ela
 * está?" depois de ler a trilha — sem isso a ficha termina no passado.
 */
function ondeEstaAVaga(row: SuggestionRow): { href: string; label: string } | null {
  if (row.deletedAt) return null; // vaga excluída não está em fila nenhuma
  if (!isSuggestionInclusion(row)) return { href: scalingHref("/scaling", row.eventId), label: "Abrir na Escalação" };
  switch (row.status) {
    case SUGESTAO_STATUS.PENDENTE:
      return { href: scalingHref("/scaling-validation", row.eventId), label: "Abrir na Validação" };
    case SUGESTAO_STATUS.VALIDADA:
    case SUGESTAO_STATUS.AJUSTE:
      return { href: scalingHref("/scaling-approval", row.eventId), label: "Abrir na Aprovação" };
    case SUGESTAO_STATUS.APROVADA:
      return { href: scalingHref("/scaling", row.eventId), label: "Abrir na Escalação" };
    default:
      return null; // negada: fica só no Histórico, que é onde a ficha já está
  }
}

/** Modal com o detalhe completo de uma vaga sugerida (leitura). */
export function SuggestionDetailDrawer({
  open, onOpenChange, row, functionName, event, approverNames,
  onValidate, onAdjust, onDelete, onClosed,
  list, onNavigate, onValidateAndNext, hasNextValidatable,
  mostrarOndeEsta,
}: SuggestionDetailDrawerProps) {
  const logsQuery = useQuery<InclusionLog[]>({
    queryKey: [TEAM_INCLUSIONS_QUERY_KEY, row?.id, "logs"],
    queryFn: async () => (await apiRequest("GET", `${TEAM_INCLUSIONS_QUERY_KEY}/${row!.id}/logs`)).json(),
    enabled: open && !!row?.id,
    staleTime: 30_000,
  });

  const days = row ? workDaysOf(row) : [];
  const decision = row ? describeLastDecision(row.lastDecision) : null;
  const vagaDecision = row ? describeVagaDecision(row.lastVagaDecision) : null;
  const pending = row?.pendingRequest ?? null;
  const mayValidate = !!row && !!onValidate && canValidate(row);
  const mayRequest = !!row && canRequestChange(row);
  const ondeEsta = mostrarOndeEsta && row ? ondeEstaAVaga(row) : null;
  const showFooter = mayValidate || (mayRequest && (!!onAdjust || !!onDelete)) || !!ondeEsta;
  const start = days[0] ?? "";
  const end = days.length ? days[days.length - 1] : "";
  const hasLeg = !!row && hasAnyLeg(row);
  const hasLogistics = hasLeg || !!row?.needsTicket || !!row?.needsAccommodation;

  // ── Navegação pela fila (‹ ›, ← →) ──
  const queue = list ?? [];
  const index = row ? queue.findIndex((r) => r.id === row.id) : -1;
  const prevRow = index > 0 ? queue[index - 1] : null;
  const nextRow = index >= 0 && index < queue.length - 1 ? queue[index + 1] : null;
  const canNavigate = !!onNavigate && index >= 0 && queue.length > 1;

  useEffect(() => {
    if (!open || !canNavigate) return;
    const onKey = (e: KeyboardEvent) => {
      // Digitando (comentário, busca) as setas são do campo, não da fila.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft" && prevRow) { e.preventDefault(); onNavigate!(prevRow); }
      if (e.key === "ArrowRight" && nextRow) { e.preventDefault(); onNavigate!(nextRow); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canNavigate, prevRow, nextRow, onNavigate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Modal central e não gaveta lateral (30/08): a gaveta tinha 576px e os
          chips de logística e os dias de trabalho quebravam em duas linhas.
          Com 720px cabem numa linha só, e sobra menos rolagem para conferir. */}
      <DialogContent
        className="!max-w-[720px] w-[95vw] max-h-[88vh] rounded-xl !flex !flex-col p-0 gap-0 overflow-hidden"
        // Sem preventDefault: o foco volta para quem abriu o detalhe, e só
        // depois disso a tela abre o diálogo que estava esperando.
        onCloseAutoFocus={() => onClosed?.()}
      >
        {row ? (
          <>
            <DialogHeader className="shrink-0 border-b border-border bg-card px-5 pb-3 pt-5 text-left space-y-2">
              <DialogTitle className="flex items-center gap-2 text-base leading-tight">
                <span className="inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-primary">#{row.inclusionNumber}</span>
                <span className="truncate font-semibold text-foreground">{functionName ?? "Função"}</span>
                {/* Fila de 14 vagas não pode obrigar a fechar e reabrir. O ‹ ›
                    fica à esquerda do X (pr-8 reserva o lugar dele). */}
                {canNavigate && (
                  <span className="ml-auto mr-8 flex shrink-0 items-center gap-1.5">
                    <span className="text-2xs tabular-nums text-muted-foreground">{index + 1} de {queue.length}</span>
                    <MotivoDesabilitado motivo="Vaga anterior (←)" desabilitado={!prevRow}>
                      <button
                      type="button" onClick={() => prevRow && onNavigate!(prevRow)} disabled={!prevRow}
                      aria-label="Vaga anterior"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    </MotivoDesabilitado>
                    <MotivoDesabilitado motivo="Próxima vaga (→)" desabilitado={!nextRow}>
                      <button
                      type="button" onClick={() => nextRow && onNavigate!(nextRow)} disabled={!nextRow}
                      aria-label="Próxima vaga"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    </MotivoDesabilitado>
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {event?.name ?? "Evento"}
                {row.canEdit ? " · você valida esta função" : " · somente leitura"}
              </DialogDescription>
              <StatusCell row={row} approverNames={approverNames} />
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto bg-surface-muted/60">
              <div className="space-y-3 px-4 py-4">
                {/* Decisão do aprovador (a vaga voltou) */}
                {row.lastDecision && decision && (
                  <section aria-labelledby="det-decisao" className={cn("rounded-xl border px-3.5 py-3 space-y-1", DECISION_TONE_CLASS[decision.tone])}>
                    <p id="det-decisao" className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide">
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> {decision.title} · pedido de {(CHANGE_REQUEST_TYPE_LABELS[row.lastDecision.requestType] ?? row.lastDecision.requestType).toLowerCase()}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{row.lastDecision.comment?.trim() ? row.lastDecision.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}</p>
                    <p className="text-2xs text-slate-600">{row.lastDecision.byName ?? "Aprovador"} · {fmtDateTime(row.lastDecision.at)}</p>
                  </section>
                )}

                {/* Decisão do aprovador sobre a VAGA (devolvida/reprovada/aprovada) */}
                {row.lastVagaDecision && vagaDecision && (
                  <section aria-labelledby="det-decisao-vaga" className={cn("rounded-xl border px-3.5 py-3 space-y-1", DECISION_TONE_CLASS[vagaDecision.tone])}>
                    <p id="det-decisao-vaga" className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide">
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> {vagaDecision.title}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{row.lastVagaDecision.comment?.trim() ? row.lastVagaDecision.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}</p>
                    <p className="text-2xs text-slate-600">{row.lastVagaDecision.byName ?? "Aprovador"} · {fmtDateTime(row.lastVagaDecision.at)}</p>
                  </section>
                )}

                {/* Observação de quem validou (dono, 24/09) — só enquanto a vaga
                    está validada: ao voltar para validação o servidor a zera. */}
                {row.status === SUGESTAO_STATUS.VALIDADA && (
                  <ValidationNoteBlock id="det-obs-validacao" note={row.validationNote} at={row.validatedAt} />
                )}

                {/* Pedido pendente */}
                {pending && (
                  <section aria-labelledby="det-pedido" className="rounded-xl border border-primary/25 bg-brand-soft/60 px-3.5 py-3 space-y-1">
                    <p id="det-pedido" className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-primary">
                      <MessageSquareWarning className="w-3.5 h-3.5" aria-hidden="true" /> Pedido de {(CHANGE_REQUEST_TYPE_LABELS[pending.requestType as ChangeRequestType] ?? pending.requestType).toLowerCase()} aguardando o aprovador
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{pending.reason}</p>
                    <p className="text-2xs text-slate-600">por {pending.requestedByName} · {fmtDateTime(pending.createdAt)}</p>
                  </section>
                )}

                {/* Período e diárias */}
                <Card id="det-periodo" title="Período e diárias" icon={CalendarDays}>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                    {start ? (
                      <span className="font-medium">
                        <DayLabel v={start} />
                        {end && end !== start && <> <span className="text-muted-foreground" aria-hidden="true">–</span> <DayLabel v={end} /></>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Período não definido</span>
                    )}
                    <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-semibold tabular-nums text-primary">
                      {formatDiarias(days.length || row.dailyRates || 0)}
                    </span>
                  </div>
                  <div className="space-y-1.5 border-t border-border pt-2">
                    <p className="text-2xs text-muted-foreground">
                      Dias de trabalho <span className="tabular-nums">({days.length})</span>
                    </p>
                    {days.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {days.map((d) => <DayChip key={d} v={d} />)}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum dia marcado.</p>
                    )}
                  </div>
                </Card>

                {/* Logística — mesmos chips da grade e da lista. Ausência não
                    vira chip: sem nada, uma frase; e nunca "Sem passagem" ao
                    lado de um chip positivo (peso visual igual para presença e
                    ausência confunde). */}
                <Card id="det-log" title="Logística" icon={Luggage}>
                  {hasLogistics ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} />
                        <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} />
                        {row.needsTicket && <NeedChip kind="passagem" />}
                        {row.needsAccommodation && <NeedChip kind="hotel" />}
                      </div>
                      <p className="text-2xs text-muted-foreground">
                        Modal, datas e horários vêm da sugestão da logística — mudar isso é pedido de ajuste.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">Sem logística — esta vaga não precisa de passagem nem de hospedagem.</p>
                  )}
                </Card>

                {/* Observações */}
                <Card id="det-obs" title="Observações da vaga" icon={StickyNote}>
                  {row.observations?.trim() ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">{row.observations}</p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">Sem observações — a logística não escreveu nada para esta vaga.</p>
                  )}
                </Card>

                {/* Histórico */}
                <Card id="det-hist" title="Histórico" icon={History}>
                  {logsQuery.isLoading ? (
                    <div className="space-y-2" role="status" aria-label="Carregando histórico">
                      <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : logsQuery.isError ? (
                    <p className="text-xs text-muted-foreground">Não foi possível carregar o histórico.</p>
                  ) : !logsQuery.data?.length ? (
                    // Sem log gravado, a linha do tempo mostra o único fato que
                    // existe — a vaga sugerida —, descrevendo a própria vaga.
                    // Nunca entradas fixas de devolução/ajuste: afirmariam
                    // evento que não aconteceu.
                    <ol className="relative ml-1.5 space-y-3 border-l border-border">
                      <li className="ml-4">
                        <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white bg-slate-300" aria-hidden="true" />
                        <p className="text-sm text-foreground">{describeSuggestedVaga(row)}</p>
                        {row.suggestionSentAt && (
                          <p className="mt-0.5 text-2xs text-muted-foreground">{fmtDateTime(row.suggestionSentAt)}</p>
                        )}
                      </li>
                    </ol>
                  ) : (
                    <ol className="relative ml-1.5 space-y-3 border-l border-border">
                      {logsQuery.data.map((log, i) => {
                        const before = valueText(log.previousValue);
                        const after = valueText(log.newValue);
                        const phrase = log.details?.trim() || LOG_ACTION_LABELS[log.action] || "Atualização da vaga";
                        // A última entrada é onde a vaga está: marcá-la evita
                        // ler a trilha inteira para descobrir o presente.
                        const agora = i === logsQuery.data!.length - 1;
                        return (
                          <li key={log.id} className="ml-4">
                            <span className={cn("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white", agora ? "bg-primary" : "bg-slate-300")} aria-hidden="true" />
                            <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                              {/* `whitespace-pre-line`: o log de validação traz a
                                  observação numa linha própria ("\nObservação: …"). */}
                              <span className="whitespace-pre-line break-words">{phrase}</span>
                              {agora && <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-primary">agora</span>}
                            </p>
                            {/* Basta um dos dois lados: campo esvaziado tem "de"
                                sem "para", e guardar tudo pelo "para" fazia o
                                registro sumir inteiro. */}
                            {(before || after) && (
                              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
                                {before && (
                                  <>
                                    <span className="line-through decoration-slate-300">{before}</span>
                                    {after && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
                                  </>
                                )}
                                {after
                                  ? <span className="font-medium text-slate-600">{after}</span>
                                  : <span className="italic">(esvaziado)</span>}
                              </p>
                            )}
                            <p className="mt-0.5 text-2xs text-muted-foreground">{log.userName} · {fmtDateTime(log.createdAt)}</p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Card>
              </div>
            </div>

            {showFooter && (
              <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">
                {ondeEsta && (
                  <Link href={ondeEsta.href} className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-primary transition-colors hover:border-primary/30 hover:bg-brand-soft">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" /> {ondeEsta.label}
                  </Link>
                )}
                {mayRequest && onDelete && (
                  <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-danger/25 text-danger hover:bg-danger-soft" onClick={() => onDelete(row)}>
                    <Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Pedir exclusão
                  </Button>
                )}
                {mayRequest && onAdjust && (
                  <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => onAdjust(row)}>
                    <PencilLine className="w-4 h-4 mr-1.5" aria-hidden="true" /> Pedir ajuste
                  </Button>
                )}
                {/* Encadeia a fila: valida e já abre a próxima pendente, sem
                    passar pela tabela. Só aparece quando existe próxima. */}
                {mayValidate && onValidateAndNext && hasNextValidatable && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button" size="sm" variant="outline"
                        className="h-9 rounded-lg border-success/25 bg-success-soft text-success hover:bg-success-soft"
                        onClick={() => onValidateAndNext(row)}
                      >
                        <CheckCheck className="w-4 h-4 mr-1.5" aria-hidden="true" /> Validar e próxima
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Valida esta vaga e já abre a próxima pendente.
                    </TooltipContent>
                  </Tooltip>
                )}
                {mayValidate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" size="sm" className="h-9 rounded-lg bg-success font-semibold text-white hover:bg-success/90" onClick={() => onValidate!(row)}>
                        <CheckCheck className="w-4 h-4 mr-1.5" aria-hidden="true" /> Validar vaga
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      A área confirma a vaga como está — ela segue para o aprovador.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="p-5"><DialogTitle className="sr-only">Detalhe da vaga</DialogTitle><DialogDescription className="text-sm text-muted-foreground">Nenhuma vaga selecionada.</DialogDescription></div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SuggestionDetailDrawer;
