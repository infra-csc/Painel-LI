/**
 * Detalhe completo de uma vaga sugerida (leitura), em modal central.
 *
 * Desde 25/09 o vocabulário e as peças pequenas moram em
 * `suggestion-detail-helpers.tsx` e o cartão de histórico (com a consulta de
 * logs) em `suggestion-history-card.tsx` — este arquivo tinha 613 linhas.
 */
import { useEffect } from "react";
import { Link } from "wouter";
import {
  CalendarDays, CheckCheck, ChevronLeft, ChevronRight,
  ExternalLink, Luggage, MessageSquareWarning, PencilLine, StickyNote, Trash2, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatDiarias } from "@/lib/utils";
import type { Event } from "@shared/schema";
import { CHANGE_REQUEST_TYPE_LABELS, SUGESTAO_STATUS, type ChangeRequestType } from "@shared/scaling-validation-rules";
import { StatusCell } from "./suggestions-list";
import { DayLabel, LegChip, NeedChip } from "./logistics-chips";
import {
  DECISION_TONE_CLASS, canRequestChange, canValidate,
  describeLastDecision, describeVagaDecision, workDaysOf, type SuggestionRow,
} from "./types";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { ValidationNoteBlock } from "./validation-note-blocks";
import { Card, DayChip, fmtDateTime, hasAnyLeg, ondeEstaAVaga } from "./suggestion-detail-helpers";
import { SuggestionHistoryCard } from "./suggestion-history-card";

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

/** Modal com o detalhe completo de uma vaga sugerida (leitura). */
export function SuggestionDetailDrawer({
  open, onOpenChange, row, functionName, event, approverNames,
  onValidate, onAdjust, onDelete, onClosed,
  list, onNavigate, onValidateAndNext, hasNextValidatable,
  mostrarOndeEsta,
}: SuggestionDetailDrawerProps) {
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

  const navBtn = "flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent";

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
                      <button type="button" onClick={() => prevRow && onNavigate!(prevRow)} disabled={!prevRow} aria-label="Vaga anterior" className={navBtn}>
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </MotivoDesabilitado>
                    <MotivoDesabilitado motivo="Próxima vaga (→)" desabilitado={!nextRow}>
                      <button type="button" onClick={() => nextRow && onNavigate!(nextRow)} disabled={!nextRow} aria-label="Próxima vaga" className={navBtn}>
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

                <SuggestionHistoryCard row={row} open={open} />
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
