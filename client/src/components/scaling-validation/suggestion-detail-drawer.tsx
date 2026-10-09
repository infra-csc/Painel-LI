/**
 * Detalhe completo de uma vaga sugerida (leitura), em modal central.
 *
 * Desde 25/09 o vocabulário e as peças pequenas moram em
 * `suggestion-detail-helpers.tsx` e o cartão de histórico (com a consulta de
 * logs) em `suggestion-history-card.tsx` — este arquivo tinha 613 linhas.
 *
 * 07/10 (redesenho): cabeçalho em três camadas (número e fila; a função em
 * destaque; evento e status), seções com a moldura do modal da Escalação,
 * avisos do aprovador com filete de cor e o rodapé com UMA ação forte.
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
import { DayLabel, LegChip, NeedChip, SaiDeChip } from "./logistics-chips";
import {
  DECISION_TONE_CLASS, canRequestChange, canValidate,
  describeLastDecision, describeVagaDecision, workDaysOf, type SuggestionRow,
} from "./types";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { ValidationNoteBlock } from "./validation-note-blocks";
import { Card, DayChip, Destaque, fmtDateTime, hasAnyLeg, ondeEstaAVaga } from "./suggestion-detail-helpers";
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
  const hasLogistics = hasLeg || !!row?.needsTicket || !!row?.needsAccommodation || !!row?.city?.trim();

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

  const navBtn = "val-alvo flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-card disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Modal central e não gaveta lateral (30/08): a gaveta tinha 576px e os
          chips de logística e os dias de trabalho quebravam em duas linhas.
          Com 720px cabem numa linha só, e sobra menos rolagem para conferir. */}
      <DialogContent
        className="!max-w-[720px] w-[95vw] max-h-[88vh] rounded-xl !flex !flex-col p-0 gap-0 overflow-hidden focus:outline-none"
        // Foco inicial no próprio diálogo (07/10): ia para o "‹", que abria o
        // tooltip "Vaga anterior (←)" por cima do título ao abrir — e o
        // primeiro Esc fechava só o tooltip. O Tab segue a ordem de sempre.
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true }); }}
        // Sem preventDefault: o foco volta para quem abriu o detalhe, e só
        // depois disso a tela abre o diálogo que estava esperando.
        onCloseAutoFocus={() => onClosed?.()}
      >
        {row ? (
          <>
            <DialogHeader className="shrink-0 space-y-1.5 border-b border-border bg-card px-5 pb-4 pt-4 text-left">
              {/* Linha 1: número + navegação da fila (‹ ›, à esquerda do X). */}
              <div className="flex min-h-8 items-center gap-2 pr-8">
                <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground">#{row.inclusionNumber}</span>
                {/* Fila de 14 vagas não pode obrigar a fechar e reabrir. */}
                {canNavigate && (
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    <span className="mr-1 text-2xs tabular-nums text-muted-foreground">{index + 1} de {queue.length}</span>
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
              </div>
              <DialogTitle className="text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
                {functionName ?? "Função"}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                {/* Sem `event` (Decididas, Histórico) o nome vem da própria linha — era "Evento" seco. */}
                <span>{event?.name ?? row.eventName ?? "Evento"}</span>
                <span aria-hidden="true">·</span>
                {row.canEdit
                  ? <span className="font-medium text-primary">você valida esta função</span>
                  : <span>somente leitura</span>}
              </DialogDescription>
              <div className="pt-1"><StatusCell row={row} approverNames={approverNames} /></div>
            </DialogHeader>

            <div key={row.id} className="val-entra flex-1 min-h-0 overflow-y-auto bg-surface-muted/60">
              <div className="space-y-3 px-4 py-4 sm:px-5">
                {/* Decisão do aprovador (a vaga voltou) */}
                {row.lastDecision && decision && (
                  <Destaque id="det-decisao" tom={DECISION_TONE_CLASS[decision.tone]} icon={Undo2}
                    title={<>{decision.title} · pedido de {(CHANGE_REQUEST_TYPE_LABELS[row.lastDecision.requestType] ?? row.lastDecision.requestType).toLowerCase()}</>}
                    meta={<>{row.lastDecision.byName ?? "Aprovador"} · {fmtDateTime(row.lastDecision.at)}</>}>
                    {row.lastDecision.comment?.trim() ? row.lastDecision.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}
                  </Destaque>
                )}

                {/* Decisão do aprovador sobre a VAGA (devolvida/reprovada/aprovada) */}
                {row.lastVagaDecision && vagaDecision && (
                  <Destaque id="det-decisao-vaga" tom={DECISION_TONE_CLASS[vagaDecision.tone]} icon={Undo2}
                    title={vagaDecision.title}
                    meta={<>{row.lastVagaDecision.byName ?? "Aprovador"} · {fmtDateTime(row.lastVagaDecision.at)}</>}>
                    {row.lastVagaDecision.comment?.trim() ? row.lastVagaDecision.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}
                  </Destaque>
                )}

                {/* Observação de quem validou (dono, 24/09) — só enquanto a vaga
                    está validada: ao voltar para validação o servidor a zera. */}
                {row.status === SUGESTAO_STATUS.VALIDADA && (
                  <ValidationNoteBlock id="det-obs-validacao" note={row.validationNote} at={row.validatedAt} />
                )}

                {/* Pedido pendente */}
                {pending && (
                  <Destaque id="det-pedido" tom="border-primary/25 bg-brand-soft/70 text-primary" icon={MessageSquareWarning}
                    title={<>Pedido de {(CHANGE_REQUEST_TYPE_LABELS[pending.requestType as ChangeRequestType] ?? pending.requestType).toLowerCase()} aguardando o aprovador</>}
                    meta={<>por {pending.requestedByName} · {fmtDateTime(pending.createdAt)}</>}>
                    {pending.reason}
                  </Destaque>
                )}

                {/* Período e diárias */}
                <Card id="det-periodo" title="Período e diárias" icon={CalendarDays}
                  acessorio={<span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-semibold tabular-nums text-primary">{formatDiarias(days.length || row.dailyRates || 0)}</span>}>
                  <p className="text-sm font-medium text-foreground">
                    {start ? (
                      <>
                        <DayLabel v={start} />
                        {end && end !== start && <> <span className="text-muted-foreground" aria-hidden="true">–</span> <DayLabel v={end} /></>}
                      </>
                    ) : (
                      <span className="font-normal text-muted-foreground">Período não definido</span>
                    )}
                  </p>
                  <div className="space-y-1.5">
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
                        <SaiDeChip cidade={row.city} testId="det-sai-de" />
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
                    <p className="text-sm text-muted-foreground">Sem logística — esta vaga não precisa de passagem nem de hospedagem.</p>
                  )}
                </Card>

                {/* Observações */}
                <Card id="det-obs" title="Observações da vaga" icon={StickyNote}>
                  {row.observations?.trim() ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">{row.observations}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem observações — a logística não escreveu nada para esta vaga.</p>
                  )}
                </Card>

                <SuggestionHistoryCard row={row} open={open} />
              </div>
            </div>

            {showFooter && (
              <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
                {ondeEsta && (
                  <Link href={ondeEsta.href} className="val-alvo mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-primary transition-colors hover:border-primary/30 hover:bg-brand-soft">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" /> {ondeEsta.label}
                  </Link>
                )}
                {/* Pedir exclusão é o caminho mais raro: fica à esquerda, em
                    texto, longe do "Validar" (07/10 — era um contorno vermelho
                    colado ao botão verde). */}
                {mayRequest && onDelete && (
                  <Button type="button" variant="ghost" size="sm" className={cn("val-alvo h-9 rounded-lg px-2.5 text-danger hover:bg-danger-soft hover:text-danger", !ondeEsta && "sm:mr-auto")} onClick={() => onDelete(row)}>
                    <Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Pedir exclusão
                  </Button>
                )}
                {mayRequest && onAdjust && (
                  <Button type="button" variant="outline" size="sm" className="val-alvo h-9 rounded-lg" onClick={() => onAdjust(row)}>
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
                        className="val-alvo h-9 rounded-lg border-success/35 bg-success-soft text-success hover:border-success hover:bg-success-soft hover:text-success max-sm:flex-1"
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
                      <Button type="button" size="sm" className="val-alvo h-9 rounded-lg bg-success px-3.5 font-semibold text-white shadow-1 hover:bg-success/90 max-sm:w-full" onClick={() => onValidate!(row)}>
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
