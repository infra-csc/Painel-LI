import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BedDouble, CalendarDays, CheckCheck, History, MessageSquareWarning,
  PencilLine, Route, StickyNote, Ticket, Trash2, Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { formatDateBr } from "@/lib/dates";
import { cn, formatDiarias } from "@/lib/utils";
import type { Event } from "@shared/schema";
import {
  CHANGE_REQUEST_TYPE_LABELS, SUGESTAO_STATUS_LABELS,
  type ChangeRequestType, type SugestaoStatus,
} from "@shared/scaling-validation-rules";
import { StatusCell } from "./suggestions-list";
import { CHIP_NEUTRAL, DayLabel, LegChip, NeedChip, dayInfo, dayText } from "./logistics-chips";
import {
  DECISION_TONE_CLASS, TEAM_INCLUSIONS_QUERY_KEY, canRequestChange, canValidate,
  describeLastDecision, describeVagaDecision, workDaysOf, type InclusionLog, type SuggestionRow,
} from "./types";

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

const SECTION = "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400";
const CARD = "rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2";

/** "Qua 20/08 14:32" — dia da semana como no resto do módulo. */
function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
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
  return (
    <span className={cn(
      "flex flex-col items-center min-w-[52px] rounded-lg border border-slate-200 px-2 py-1 text-[11px] leading-tight text-slate-600",
      h.isWeekend ? "bg-orange-50/50" : "bg-white",
    )}>
      <span className="font-semibold tabular-nums">{h.date}</span>
      <span className={cn("text-[10px]", h.isWeekend ? "text-orange-700" : "text-slate-500")}>{h.dayName}</span>
    </span>
  );
}

const NOT_NEEDED = {
  passagem: { Icon: Ticket, text: "Sem passagem", label: "Não precisa de passagem" },
  hotel: { Icon: BedDouble, text: "Sem hotel", label: "Não precisa de hospedagem" },
} as const;

/**
 * O detalhe afirma o que a lista deixa implícito: aqui "não precisa" aparece,
 * mas no MESMO chip, em estado neutro — nunca como texto solto.
 */
function NotNeededChip({ kind }: { kind: keyof typeof NOT_NEEDED }) {
  const { Icon, text, label } = NOT_NEEDED[kind];
  return (
    <span role="img" aria-label={label} title={label} className={cn(CHIP_NEUTRAL, "text-slate-400")}>
      <Icon className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
      {text}
    </span>
  );
}

/** Drawer lateral com o detalhe completo de uma vaga sugerida (leitura). */
export function SuggestionDetailDrawer({ open, onOpenChange, row, functionName, event, approverNames, onValidate, onAdjust, onDelete, onClosed }: SuggestionDetailDrawerProps) {
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
  const showFooter = mayValidate || (mayRequest && (!!onAdjust || !!onDelete));
  const start = days[0] ?? "";
  const end = days.length ? days[days.length - 1] : "";
  const hasLeg = !!row && !!(row.transportModeIda || row.flightDepartureDate || row.flightArrivalSuggestedTime
    || row.transportModeVolta || row.flightReturnDate || row.flightReturnSuggestedTime);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right" className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden"
        // Sem preventDefault: o foco volta para quem abriu o drawer, e só
        // depois disso a tela abre o diálogo que estava esperando.
        onCloseAutoFocus={() => onClosed?.()}
      >
        {row ? (
          <>
            <SheetHeader className="shrink-0 border-b border-slate-100 bg-white px-5 pb-3 pt-5 text-left space-y-2">
              <SheetTitle className="flex items-center gap-2 text-base leading-tight">
                <span className="inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-primary">#{row.inclusionNumber}</span>
                <span className="truncate font-semibold text-slate-900">{functionName ?? "Função"}</span>
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500">
                {event?.name ?? "Evento"}{row.area ? ` · ${row.area}` : ""}
                {row.canEdit ? " · você valida esta função" : " · somente leitura"}
              </SheetDescription>
              <StatusCell row={row} approverNames={approverNames} />
            </SheetHeader>

            <div className="flex-1 overflow-y-auto bg-slate-50/60">
              <div className="space-y-3 px-4 py-4">
                {/* Decisão do aprovador (a vaga voltou) */}
                {row.lastDecision && decision && (
                  <section aria-labelledby="det-decisao" className={cn("rounded-2xl border px-3.5 py-3 space-y-1", DECISION_TONE_CLASS[decision.tone])}>
                    <p id="det-decisao" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> {decision.title} · pedido de {(CHANGE_REQUEST_TYPE_LABELS[row.lastDecision.requestType] ?? row.lastDecision.requestType).toLowerCase()}
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.lastDecision.comment?.trim() ? row.lastDecision.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}</p>
                    <p className="text-[11px] text-slate-600">{row.lastDecision.byName ?? "Aprovador"} · {fmtDateTime(row.lastDecision.at)}</p>
                  </section>
                )}

                {/* Decisão do aprovador sobre a VAGA (devolvida/reprovada/aprovada) */}
                {row.lastVagaDecision && vagaDecision && (
                  <section aria-labelledby="det-decisao-vaga" className={cn("rounded-2xl border px-3.5 py-3 space-y-1", DECISION_TONE_CLASS[vagaDecision.tone])}>
                    <p id="det-decisao-vaga" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> {vagaDecision.title}
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.lastVagaDecision.comment?.trim() ? row.lastVagaDecision.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}</p>
                    <p className="text-[11px] text-slate-600">{row.lastVagaDecision.byName ?? "Aprovador"} · {fmtDateTime(row.lastVagaDecision.at)}</p>
                  </section>
                )}

                {/* Pedido pendente */}
                {pending && (
                  <section aria-labelledby="det-pedido" className="rounded-2xl border border-violet-200 bg-violet-50/60 px-3.5 py-3 space-y-1">
                    <p id="det-pedido" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">
                      <MessageSquareWarning className="w-3.5 h-3.5" aria-hidden="true" /> Pedido de {(CHANGE_REQUEST_TYPE_LABELS[pending.requestType as ChangeRequestType] ?? pending.requestType).toLowerCase()} aguardando o aprovador
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{pending.reason}</p>
                    <p className="text-[11px] text-slate-600">por {pending.requestedByName} · {fmtDateTime(pending.createdAt)}</p>
                  </section>
                )}

                {/* Período e diárias */}
                <Card id="det-periodo" title="Período e diárias" icon={CalendarDays}>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                    {start ? (
                      <span className="font-medium">
                        <DayLabel v={start} />
                        {end && end !== start && <> <span className="text-slate-300" aria-hidden="true">–</span> <DayLabel v={end} /></>}
                      </span>
                    ) : (
                      <span className="text-slate-400">Período não definido</span>
                    )}
                    <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                      {formatDiarias(days.length || row.dailyRates || 0)}
                    </span>
                  </div>
                  <div className="space-y-1.5 border-t border-slate-100 pt-2">
                    <p className="text-[11px] text-slate-500">
                      Dias de trabalho <span className="tabular-nums">({days.length})</span>
                    </p>
                    {days.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {days.map((d) => <DayChip key={d} v={d} />)}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Nenhum dia marcado.</p>
                    )}
                  </div>
                </Card>

                {/* Logística — mesmos chips da grade e da lista */}
                <Card id="det-log" title="Logística" icon={Route}>
                  {hasLeg ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} />
                      <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Sem viagem definida para esta vaga.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                    {row.needsTicket ? <NeedChip kind="passagem" /> : <NotNeededChip kind="passagem" />}
                    {row.needsAccommodation ? <NeedChip kind="hotel" /> : <NotNeededChip kind="hotel" />}
                  </div>
                </Card>

                {/* Observações */}
                <Card id="det-obs" title="Observações da vaga" icon={StickyNote}>
                  {row.observations ? (
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{row.observations}</p>
                  ) : (
                    <p className="text-xs text-slate-400">Sem observações.</p>
                  )}
                </Card>

                {/* Histórico */}
                <Card id="det-hist" title="Histórico" icon={History}>
                  {logsQuery.isLoading ? (
                    <div className="space-y-2" role="status" aria-label="Carregando histórico">
                      <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : logsQuery.isError ? (
                    <p className="text-xs text-slate-500">Não foi possível carregar o histórico.</p>
                  ) : !logsQuery.data?.length ? (
                    <p className="text-xs text-slate-400">Sem registros.</p>
                  ) : (
                    <ol className="relative ml-1.5 space-y-3 border-l border-slate-200">
                      {logsQuery.data.map((log) => {
                        const before = valueText(log.previousValue);
                        const after = valueText(log.newValue);
                        const phrase = log.details?.trim() || LOG_ACTION_LABELS[log.action] || "Atualização da vaga";
                        return (
                          <li key={log.id} className="ml-4">
                            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white bg-slate-300" aria-hidden="true" />
                            <p className="text-sm text-slate-800">{phrase}</p>
                            {/* Basta um dos dois lados: campo esvaziado tem "de"
                                sem "para", e guardar tudo pelo "para" fazia o
                                registro sumir inteiro. */}
                            {(before || after) && (
                              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                                {before && (
                                  <>
                                    <span className="line-through decoration-slate-300">{before}</span>
                                    {after && <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />}
                                  </>
                                )}
                                {after
                                  ? <span className="font-medium text-slate-500">{after}</span>
                                  : <span className="italic text-slate-400">(esvaziado)</span>}
                              </p>
                            )}
                            <p className="mt-0.5 text-[11px] text-slate-500">{log.userName} · {fmtDateTime(log.createdAt)}</p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Card>
              </div>
            </div>

            {showFooter && (
              <div className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
                {mayRequest && onDelete && (
                  <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-red-200 text-red-700 hover:bg-red-50" onClick={() => onDelete(row)}>
                    <Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Pedir exclusão
                  </Button>
                )}
                {mayRequest && onAdjust && (
                  <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => onAdjust(row)}>
                    <PencilLine className="w-4 h-4 mr-1.5" aria-hidden="true" /> Pedir ajuste
                  </Button>
                )}
                {mayValidate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" size="sm" className="h-9 rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-700" onClick={() => onValidate!(row)}>
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
          <div className="p-5"><SheetTitle className="sr-only">Detalhe da vaga</SheetTitle><SheetDescription className="text-sm text-slate-500">Nenhuma vaga selecionada.</SheetDescription></div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default SuggestionDetailDrawer;
