/**
 * Cabeçalho da Validação (25/09 — extraído da página): título + fila do módulo
 * + "Incluir escalação", a linha do evento (combobox, período, escopo, nota da
 * logística) e o banner de modo leitura.
 *
 * 07/10 (redesenho): o título, os passos do módulo e a ação principal viraram
 * a BARRA de 56px grudada no topo — a mesma da Escalação. Antes o título abria
 * a página com 50px de vazio em cima e sumia ao rolar, levando junto o
 * "Incluir escalação". O evento ficou logo abaixo, numa linha só: escolher o
 * evento à esquerda, o que se faz com ele (comentários, nota) à direita.
 */
import { useState } from "react";
import { CalendarDays, ChevronDown, ClipboardCheck, EyeOff, Flag, MapPin, Plus, StickyNote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import EventCombobox from "@/components/ui/event-combobox";
import { StatusBadge } from "@/components/common/status-badge";
import { cn, formatDateRange } from "@/lib/utils";
import { todayIso } from "@/lib/dates";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { EventCommentsButton } from "@/components/scaling-validation/event-comments-dialog";
import { ActionWithHint } from "./action-with-hint";
import { ALL, CHIP_BTN, eventos } from "./validation-shared";
import type { ValidationData } from "./use-validation-data";

export interface ValidationHeaderProps {
  d: ValidationData;
  eventId: string;
  setEventId: (id: string) => void;
  includeDisabledReason: string | null;
  onInclude: () => void;
}

/** Botão secundário da linha do evento (comentários, nota): contorno, 32px. */
const CONTEXT_BTN = cn(CHIP_BTN, "val-alvo h-8 whitespace-nowrap border-border bg-card text-slate-700 hover:border-primary/30 hover:bg-brand-soft/50 hover:text-primary");

export function ValidationHeader({ d, eventId, setEventId, includeDisabledReason, onInclude }: ValidationHeaderProps) {
  const [showEventComments, setShowEventComments] = useState(false);
  const { readOnlyMode, readOnlyReason, permissoesCarregando, loadingEvents, activeEvents, selectedEvent, eventsInList, scopeLabel } = d;
  /**
   * Evento que já terminou (07/10): a Validação continua liberada para as vagas
   * que já existem (VALIDACAO_APOS_EVENTO, 30/09) — o selo só avisa, para quem
   * abre um evento passado não achar que chegou tarde demais.
   */
  const encerrado = !!selectedEvent?.endDate && String(selectedEvent.endDate).slice(0, 10) < todayIso();
  /**
   * "Incluir escalação" — a área pode pedir vaga nova a QUALQUER momento, mesmo
   * com a lista vazia (evento sem sugestões, ou tudo já aprovado). Só depende de
   * ser validador de alguma função e de ter um evento escolhido. Mora no
   * cabeçalho; o estado vazio oferece o mesmo caminho como link, sem repetir
   * o botão (04/09).
   */
  const includeButton = (
    <ActionWithHint hint={includeDisabledReason} disabled={!!includeDisabledReason} side="bottom">
      <Button type="button" size="sm" className="val-alvo h-9 rounded-lg bg-primary px-3.5 font-semibold shadow-1 hover:bg-primary-hover" disabled={!!includeDisabledReason} onClick={onInclude}>
        <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> <span>Incluir<span className="hidden sm:inline">{" escalação"}</span></span>
      </Button>
    </ActionWithHint>
  );
  return (
    <>
      {/* Barra da tela — grudada abaixo da barra do app (`--sticky-top`). Uma
          linha de 56px a partir de xl (onde existe a tabela, cujo cabeçalho
          gruda logo abaixo dela); antes disso, título + ação em cima e os
          passos do módulo inteiros embaixo. */}
      <header className="sticky top-[var(--sticky-top)] z-30 -mx-[var(--page-gutter)] -mt-[var(--page-gutter)] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border bg-card px-[var(--page-gutter)] py-2 xl:flex xl:h-14 xl:gap-x-4 xl:py-0">
        <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-[-0.01em] text-foreground">
          <ClipboardCheck className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Validação de escala</span>
        </h1>
        <div className="order-last col-span-2 min-w-0 xl:order-none">
          <ScalingModuleNav current="validation" eventId={eventId} />
        </div>
        {/* Em modo leitura o botão nem aparece — o aviso logo abaixo explica o
            porquê. Permissão ainda carregando: esqueleto do mesmo tamanho,
            para a barra não mudar de forma. */}
        <div className="flex justify-end xl:ml-auto">
          {readOnlyMode ? null : permissoesCarregando
            ? <Skeleton className="h-9 w-[150px] rounded-lg" aria-hidden="true" />
            : includeButton}
        </div>
      </header>

      {/* Linha do evento — o "subtítulo" da tela: o evento e o que se faz com
          ele numa linha; embaixo, alinhada ao texto do seletor, a linha de
          fatos (datas, local, encerrado, o que você valida). */}
      <section aria-label="Evento" className="space-y-2">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
          {/* Cresce até 440px quando há espaço (31/08): em 260px fixos, nome
              de evento longo era cortado e o usuário não tinha como ler o
              resto — nem sabia em qual evento estava. */}
          <div className="flex min-w-0 items-center gap-2 sm:max-w-[480px] lg:w-[440px] lg:max-w-[60%]">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {loadingEvents ? (
                <div className="val-osso h-9" aria-hidden="true" />
              ) : (
                <EventCombobox
                  events={activeEvents} value={eventId || ALL} showAllOption
                  onValueChange={(v) => setEventId(v === ALL ? "" : v)}
                  placeholder="Todos os eventos" testId="scaling-validation-event"
                  className="h-9 font-semibold"
                />
              )}
            </div>
          </div>
          {selectedEvent && (
            <div className="flex flex-wrap gap-2 pl-6 lg:ml-auto lg:justify-end lg:pl-0">
              <EventCommentsButton eventId={selectedEvent.id} eventName={selectedEvent.name} className={cn(CONTEXT_BTN, "justify-center")} rotuloCurtoNoCelular />
              {/* "Nota da logística" (04/09): é o campo de observações do evento,
                  escrito pela logística ao montar a sugestão — "comentários"
                  confundia com a conversa do botão ao lado. */}
              {selectedEvent.observations && (
                <button
                  type="button"
                  className={cn(CONTEXT_BTN, "justify-center", showEventComments && "border-primary/30 bg-brand-soft text-primary")}
                  aria-expanded={showEventComments} aria-controls="val-event-obs"
                  onClick={() => setShowEventComments((v) => !v)}
                >
                  <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
                  Nota da logística
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", showEventComments && "rotate-180")} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-6 text-xs text-muted-foreground">
          {selectedEvent ? (
            <>
              <span className="whitespace-nowrap tabular-nums text-slate-700">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
              {selectedEvent.location && (
                <span className="inline-flex min-w-0 items-center gap-1" title={selectedEvent.location}>
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="max-w-[260px] truncate">{selectedEvent.location}</span>
                </span>
              )}
              {encerrado && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <StatusBadge tone="neutral" icon={Flag} tabIndex={0} data-testid="evento-encerrado">Evento encerrado</StatusBadge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    O evento já terminou, mas a validação continua: validar e pedir ajuste ou exclusão das vagas que já estão aqui seguem liberados. Vaga nova num evento encerrado só o administrador inclui.
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          ) : (
            <span>
              {eventsInList > 0
                ? `Vagas em validação de ${eventos(eventsInList)} — escolha um para filtrar.`
                : "Todos os eventos — escolha um para filtrar."}
            </span>
          )}
          {scopeLabel && (
            <>
              <span className="hidden h-3.5 w-px bg-border xl:block" aria-hidden="true" />
              <span className="flex basis-full items-start gap-1.5 xl:basis-auto xl:items-center">
                <Users className="mt-px h-3.5 w-3.5 shrink-0 sm:mt-0" aria-hidden="true" />
                <span>Você valida: <span className="font-medium text-slate-700">{scopeLabel}</span></span>
              </span>
            </>
          )}
        </div>
        {showEventComments && selectedEvent?.observations && (
          <div id="val-event-obs" className="val-entra ml-6 flex gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Nota da logística</p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{selectedEvent.observations}</p>
            </div>
          </div>
        )}
      </section>

      {readOnlyMode ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/70 px-4 py-3 text-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <p className="min-w-0 pt-1 text-slate-700"><span className="font-semibold text-foreground">Modo leitura</span> — {readOnlyReason}</p>
        </div>
      ) : permissoesCarregando ? (
        // Lugar do aviso reservado enquanto a permissão não chega (sem salto).
        <div className="h-[54px]" aria-hidden="true" />
      ) : null}
    </>
  );
}
