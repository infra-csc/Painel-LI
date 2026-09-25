/**
 * Escalação por Grade — o formulário (25/09).
 *
 * Só orquestra: os hooks de linhas, rascunho, colagem e envio e as seções em
 * ./grid-team-inclusion/*. Tinha 1.785 linhas num componente só.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Grid3x3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    onCreated: () => { grid.resetGrid(); draft.clearStored(); },
  });

  // Guarda de permissão: agora DEPOIS de todos os hooks
  if (!canEditGrid) {
    return (
      <div className="bg-card rounded-lg shadow-1 border border-border p-6">
        <p className="text-muted-foreground text-center">Você não tem permissão para usar a escalação por grade.</p>
      </div>
    );
  }

  return (
    <Card className="border-border shadow-1 rounded-xl overflow-hidden">
      <CardHeader className="border-b border-border px-6 py-4 bg-surface-muted border-b-2 border-b-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-soft text-primary shrink-0">
            <Grid3x3 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-foreground">Escalação por Grade</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Em cada célula, informe quantas pessoas daquela função trabalham no dia. Cada pessoa vira 1 registro com os dias em que trabalha.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <div className="space-y-4">
            <EventSection form={form} events={events} grid={grid} />

            {/* Grade de Escalação */}
            {showGrid && (
              <div className="space-y-3 border-t border-border mt-6 pt-6">
                <FunctionsGrid
                  grid={grid} gridSummary={submit.gridSummary} rowsMissingFlightDate={submit.rowsMissingFlightDate}
                  showHelp={showHelp} onToggleHelp={() => setShowHelp(!showHelp)}
                  autoSave={draft.autoSave} setAutoSave={draft.setAutoSave}
                  onOpenPaste={() => paste.setShowPasteModal(true)}
                />

                <GridPreview processedRanges={submit.processedRanges} previewGroups={submit.previewGroups} />

                <GridActions
                  onSaveDraft={draft.saveDraft} onLoadDraft={draft.loadDraftOrWarn} onSubmit={submit.handleSubmit}
                  isProcessing={submit.isProcessing} recordsCount={submit.processedRanges.length}
                  selectedEventId={selectedEventId} eventoEncerrado={eventoEncerrado} motivoBloqueio={motivoBloqueio}
                  bannerMessage={eventLock.bannerMessage(selectedEventId)}
                />
              </div>
            )}
          </div>
        </Form>
      </CardContent>

      <FunctionSelectDialog grid={grid} functions={functions} sortedFunctions={sortedFunctions} />
      <ScheduleCopyDialog grid={grid} sortedFunctions={sortedFunctions} />
      <ExcelPasteDialog paste={paste} />
    </Card>
  );
}
