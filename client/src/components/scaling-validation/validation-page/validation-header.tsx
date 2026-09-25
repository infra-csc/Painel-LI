/**
 * Cabeçalho da Validação (25/09 — extraído da página): título + fila do módulo
 * + "Incluir escalação", a linha do evento (combobox, período, escopo, nota da
 * logística) e o banner de modo leitura.
 */
import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, ClipboardCheck, EyeOff, Plus, StickyNote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EventCombobox from "@/components/ui/event-combobox";
import { PageHeader } from "@/components/common/page-header";
import { cn, formatDateRange } from "@/lib/utils";
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

export function ValidationHeader({ d, eventId, setEventId, includeDisabledReason, onInclude }: ValidationHeaderProps) {
  const [showEventComments, setShowEventComments] = useState(false);
  const { readOnlyMode, readOnlyReason, permissoesCarregando, loadingEvents, activeEvents, selectedEvent, eventsInList, scopeLabel } = d;
  /**
   * "Incluir escalação" — a área pode pedir vaga nova a QUALQUER momento, mesmo
   * com a lista vazia (evento sem sugestões, ou tudo já aprovado). Só depende de
   * ser validador de alguma função e de ter um evento escolhido. Mora no
   * cabeçalho; o estado vazio oferece o mesmo caminho como link, sem repetir
   * o botão (04/09).
   */
  const includeButton = (
    <ActionWithHint hint={includeDisabledReason} disabled={!!includeDisabledReason} side="bottom">
      <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" disabled={!!includeDisabledReason} onClick={onInclude}>
        <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Incluir escalação
      </Button>
    </ActionWithHint>
  );
  return (
    <>
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
          <CalendarDays className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {/* Cresce até 420px quando há espaço (31/08): em 260px fixos, nome
              de evento longo era cortado e o usuário não tinha como ler o
              resto — nem sabia em qual evento estava. */}
          <div className="w-[260px] max-w-full shrink-0 lg:w-auto lg:min-w-[260px] lg:max-w-[420px] lg:flex-1">
            {loadingEvents ? (
              <div className="h-8 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" aria-hidden="true" />
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
            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
              <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
              {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {eventsInList > 0
                ? `Vagas em validação de ${eventos(eventsInList)} — escolha um para filtrar.`
                : "Todos os eventos — escolha um para filtrar."}
            </p>
          )}
          {scopeLabel && (
            <>
              <span className="hidden md:block h-6 w-px bg-border" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <Users className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                Você valida: <span className="font-semibold text-foreground">{scopeLabel}</span>
              </span>
            </>
          )}
          {selectedEvent && (
            <EventCommentsButton
              eventId={selectedEvent.id} eventName={selectedEvent.name}
              className={cn(CHIP_BTN, "ml-auto h-8 border-border bg-card text-slate-600 hover:border-primary/30 hover:text-primary")}
            />
          )}
          {/* "Nota da logística" (04/09): é o campo de observações do evento,
              escrito pela logística ao montar a sugestão — "comentários"
              confundia com a conversa do botão ao lado. */}
          {selectedEvent?.observations && (
            <button
              type="button" className={cn(CHIP_BTN, "h-8 border-border bg-card text-slate-600 hover:border-primary/30 hover:text-primary")}
              aria-expanded={showEventComments} aria-controls="val-event-obs"
              onClick={() => setShowEventComments((v) => !v)}
            >
              <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
              Nota da logística
              {showEventComments ? <ChevronUp className="w-3 h-3 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" aria-hidden="true" />}
            </button>
          )}
        </section>
        {showEventComments && selectedEvent?.observations && (
          <p id="val-event-obs" className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-slate-600 whitespace-pre-wrap sm:ml-11">
            <span className="font-semibold text-muted-foreground">Nota da logística: </span>{selectedEvent.observations}
          </p>
        )}
      </div>

      {readOnlyMode ? (
        <div role="status" className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-slate-700">
          <EyeOff className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span><span className="font-semibold">Modo leitura</span> — {readOnlyReason}</span>
        </div>
      ) : permissoesCarregando ? (
        // Lugar do banner reservado enquanto a permissão não chega (sem salto).
        <div className="h-[38px]" aria-hidden="true" />
      ) : null}
    </>
  );
}
