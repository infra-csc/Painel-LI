/**
 * Escalação por grade — o formulário (25/09).
 *
 * Só orquestra: os hooks de linhas, rascunho, colagem e envio e as seções em
 * ./grid-team-inclusion/*. Tinha 1.785 linhas num componente só.
 *
 * 07/10 (redesenho): vira a seção "Montar vagas" da tela — título curto que
 * diz o que se faz aqui, evento e período numa fileira só, e a grade, a
 * prévia e "Criar N vagas" logo abaixo, separados por um filete (antes eram
 * cartão dentro de cartão, com cabeçalho cinza e um parágrafo longo). Antes
 * de gerar a grade, "Carregar rascunho" fica à mão no cabeçalho (só aparecia
 * depois de gerar). Depois de criar, a seção diz quantas vagas entraram e
 * leva até a lista. Quem não monta grade nem vê a seção (a página decide).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, CheckCircle2, Download, X } from "lucide-react";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import type { Event, Function } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useEventLock } from "@/lib/event-lock";
import { gridFormSchema, sortFunctionsByOrder, type GridFormData } from "./grid-team-inclusion/grid-types";
import { useGridRows } from "./grid-team-inclusion/use-grid-rows";
import { useGridDraft } from "./grid-team-inclusion/use-grid-draft";
import { useGridPaste } from "./grid-team-inclusion/use-grid-paste";
import { useGridSubmit } from "./grid-team-inclusion/use-grid-submit";
import { EventSection } from "./grid-team-inclusion/event-section";
import { FunctionsGrid } from "./grid-team-inclusion/functions-grid";
import { GridActions, GridPreview } from "./grid-team-inclusion/grid-preview";
import { ExcelPasteDialog, FunctionSelectDialog, ScheduleCopyDialog } from "./grid-team-inclusion/grid-dialogs";

export default function GridTeamInclusionForm() {
  const [showHelp, setShowHelp] = useState(false);
  // Última criação: quantas vagas e em qual evento (o aviso de sucesso da seção).
  const [criadas, setCriadas] = useState<{ n: number; evento: string } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // A checagem de permissão fica logo antes do return principal: um early
  // return ANTES dos hooks mudava o número de hooks quando o usuário não tinha
  // permissão (Rules of Hooks — "rendered more hooks than during the previous render").
  const canEditGrid = hasPermission(user, 'canEditScreen1');

  const form = useForm<GridFormData>({
    resolver: zodResolver(gridFormSchema),
    defaultValues: {
      eventId: "",
      startDate: "",
      endDate: "",
    },
  });

  // Evento escolhido (reativo) — habilita/desabilita o botão de criar
  const selectedEventId = form.watch("eventId");

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  // Evento encerrado (regra 20/08): criar escalação em evento que já passou é
  // 403 no servidor — o botão fica desabilitado com o motivo.
  const eventLock = useEventLock();
  const eventoEncerrado = eventLock.isLockedEvent(selectedEventId);
  // Motivo exato (encerrado x fora da lista) para o tooltip e o rótulo do botão.
  const motivoBloqueio = eventLock.lockReason(selectedEventId);

  // Sorted once per change in functions list
  const sortedFunctions = useMemo(
    () => sortFunctionsByOrder([...(functions || [])]),
    [functions]
  );

  const grid = useGridRows({ form, functions, sortedFunctions, toast });
  const { functionRows, setFunctionRows, dates, setDates, showGrid, setShowGrid } = grid;
  const draft = useGridDraft({ userId: user?.id, form, functionRows, setFunctionRows, dates, setDates, setShowGrid, toast });
  const paste = useGridPaste({ form, events, functions, dates, setFunctionRows, toast });
  const submit = useGridSubmit({
    form, functionRows, dates, functions, userId: user?.id, toast,
    onCreated: () => {
      // Lido ANTES do reset: a closure é a do render em que "Criar" foi clicado.
      setCriadas({ n: submit.processedRanges.length, evento: events?.find(e => e.id === selectedEventId)?.name ?? "" });
      grid.resetGrid(); draft.clearStored();
    },
  });

  // Guarda de permissão: agora DEPOIS de todos os hooks
  if (!canEditGrid) {
    return (
      <div className="bg-card rounded-xl border border-border px-6 py-5">
        <p className="m-0 text-sm text-muted-foreground text-center">Você não tem permissão para usar a escalação por grade.</p>
      </div>
    );
  }

  const irParaLista = () => document.getElementById("vagas-incluidas")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <section aria-labelledby="inc-montar-titulo" className="rounded-xl border border-border bg-card" data-testid="secao-montar-vagas">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 sm:px-5 pt-4">
        <div className="min-w-0">
          <h2 id="inc-montar-titulo" className="m-0 text-[15px] font-semibold text-foreground">Montar vagas</h2>
          <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground max-w-[720px]">
            Escolha o evento e o período e diga, em cada dia, quantas pessoas de cada função trabalham. Cada pessoa vira uma vaga com os dias em que trabalha.
          </p>
        </div>
        {!showGrid && (
          <button
            type="button"
            onClick={draft.loadDraftOrWarn}
            className="pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 -mr-1 rounded-lg text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="button-load-draft-inicio"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            Carregar rascunho
          </button>
        )}
      </div>

      <Form {...form}>
        <div className="px-4 sm:px-5 pt-3.5 pb-4">
          <EventSection form={form} events={events} grid={grid} />
        </div>

        {/* Sucesso da última criação: quantas, onde, e o caminho até a lista. */}
        {criadas && !showGrid && (
          <div role="status" className="pas-entra mx-4 sm:mx-5 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-success/25 bg-success-soft px-3.5 py-2.5 text-sm text-success" data-testid="aviso-vagas-criadas">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] sm:basis-0">
              <strong className="font-semibold">{criadas.n === 1 ? "1 vaga criada" : `${criadas.n} vagas criadas`}</strong>
              {criadas.evento && <> em {criadas.evento}</>}. Já aparecem na lista abaixo, aguardando escalação.
            </span>
            <button type="button" onClick={irParaLista} className="ml-auto sm:ml-0 inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-semibold hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Ver na lista <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setCriadas(null)} aria-label="Fechar o aviso" className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Grade de Escalação */}
        {showGrid && (
          <div className="pas-entra flex flex-col gap-4 border-t border-border px-4 sm:px-5 pt-4 pb-4">
            <FunctionsGrid
              grid={grid} gridSummary={submit.gridSummary} rowsMissingFlightDate={submit.rowsMissingFlightDate}
              showHelp={showHelp} onToggleHelp={() => setShowHelp(!showHelp)}
              autoSave={draft.autoSave} setAutoSave={draft.setAutoSave}
              onOpenPaste={() => paste.setShowPasteModal(true)}
            />

            <GridPreview processedRanges={submit.processedRanges} previewGroups={submit.previewGroups} />

            <div className="border-t border-border pt-3.5">
              <GridActions
                onSaveDraft={draft.saveDraft} onLoadDraft={draft.loadDraftOrWarn} onSubmit={() => { setCriadas(null); submit.handleSubmit(); }}
                isProcessing={submit.isProcessing} recordsCount={submit.processedRanges.length}
                selectedEventId={selectedEventId} eventoEncerrado={eventoEncerrado} motivoBloqueio={motivoBloqueio}
                bannerMessage={eventLock.bannerMessage(selectedEventId)}
                autoSave={draft.autoSave} setAutoSave={draft.setAutoSave}
              />
            </div>
          </div>
        )}
      </Form>

      <FunctionSelectDialog grid={grid} functions={functions} sortedFunctions={sortedFunctions} />
      <ScheduleCopyDialog grid={grid} sortedFunctions={sortedFunctions} />
      <ExcelPasteDialog paste={paste} />
    </section>
  );
}
