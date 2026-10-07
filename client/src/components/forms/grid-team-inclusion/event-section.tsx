/**
 * Escalação por grade — evento, período e "Gerar grade" (25/09, extraído do formulário).
 *
 * 07/10 (redesenho): eram três campos empilhados em largura total e um botão
 * azul de 40px por baixo — a montagem ocupava a primeira tela inteira antes de
 * ter qualquer grade. Agora é UMA fileira (evento · início · fim · gerar),
 * que empilha no celular. A lista de eventos mostra período e local e separa
 * "Próximos e em andamento" de "Concluídos"; escolhido o evento, a linha de
 * baixo diz onde e quando ele acontece e oferece usar essas datas no período
 * (só preenche os campos — gerar continua sendo um clique da pessoa).
 */
import { useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { CalendarCheck, Check, ChevronsUpDown, Grid3x3, MapPin, RefreshCw } from "lucide-react";
import type { Event } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RequiredMark } from "@/components/forms/required-mark";
import { formatPeriod } from "@/components/events/events-shared";
import { getEventStatus } from "@/lib/event-status";
import { cn } from "@/lib/utils";
import type { GridFormData } from "./grid-types";
import type { GridRows } from "./use-grid-rows";

export interface EventSectionProps {
  form: UseFormReturn<GridFormData>;
  events: Event[] | undefined;
  grid: Pick<GridRows, "gridHasContent" | "generateGrid" | "buildGrid" | "confirmRegenerate" | "setConfirmRegenerate">;
}

const LABEL = "block mb-1.5 text-xs font-medium text-slate-600";
const CAMPO = "w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12 aria-[invalid=true]:border-danger";
const dia = (v: unknown) => (v ? String(v).split("T")[0] : "");

export function EventSection({ form, events, grid }: EventSectionProps) {
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
  const { gridHasContent, generateGrid, buildGrid, confirmRegenerate, setConfirmRegenerate } = grid;

  // Próximos/em andamento primeiro (do mais perto ao mais longe); concluídos
  // depois (do mais recente ao mais antigo). Excluídos nunca entram.
  const { proximos, concluidos } = useMemo(() => {
    const ativos = (events ?? []).filter(e => e.status !== 'excluido' && e.status !== 'excluído');
    const conc = ativos.filter(e => getEventStatus(e) === "concluído");
    const prox = ativos.filter(e => getEventStatus(e) !== "concluído");
    prox.sort((a, b) => dia(a.startDate).localeCompare(dia(b.startDate)));
    conc.sort((a, b) => dia(b.startDate).localeCompare(dia(a.startDate)));
    return { proximos: prox, concluidos: conc };
  }, [events]);

  const eventId = form.watch("eventId");
  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  const escolhido = events?.find((event) => event.id === eventId);
  const inicioDoEvento = dia(escolhido?.startDate);
  const fimDoEvento = dia(escolhido?.endDate);
  const podeUsarDatas = !!escolhido && !!inicioDoEvento && !!fimDoEvento && (startDate !== inicioDoEvento || endDate !== fimDoEvento);

  const itemDoEvento = (event: Event) => (
    <CommandItem
      key={event.id}
      value={`${event.name} ${event.location ?? ""} ${event.id}`}
      onSelect={() => {
        form.setValue("eventId", event.id, { shouldValidate: true, shouldDirty: true });
        setOpenEventCombobox(false);
      }}
      className="items-start gap-2 py-2"
    >
      <Check className={cn("mt-0.5 h-4 w-4 shrink-0 text-primary", event.id === eventId ? "opacity-100" : "opacity-0")} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{event.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatPeriod(dia(event.startDate), dia(event.endDate))}{event.location ? ` · ${event.location}` : ""}
        </span>
      </span>
    </CommandItem>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_168px_168px_auto] lg:items-start">
        {/* Seleção de Evento */}
        <FormField
          control={form.control}
          name="eventId"
          render={({ field, fieldState }) => (
            <FormItem className="col-span-2 lg:col-span-1 space-y-0">
              <span className={LABEL} id="grid-evento-rotulo">Evento<RequiredMark /></span>
              <Popover open={openEventCombobox} onOpenChange={setOpenEventCombobox}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openEventCombobox}
                      aria-labelledby="grid-evento-rotulo"
                      aria-invalid={!!fieldState.error || undefined}
                      className={cn(
                        "w-full h-10 justify-between rounded-lg px-3 font-normal text-sm hover:bg-card hover:border-slate-300 data-[state=open]:border-primary aria-[invalid=true]:border-danger",
                        !field.value && "text-muted-foreground"
                      )}
                      data-testid="select-grid-event"
                    >
                      <span className="truncate">
                        {field.value
                          ? escolhido?.name
                          : "Selecione um evento"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[min(520px,calc(100vw-24px))] lg:w-[var(--radix-popover-trigger-width)] p-0 rounded-xl overflow-hidden" align="start" collisionPadding={12}>
                  <Command>
                    <CommandInput placeholder="Buscar evento ou local…" />
                    <CommandList className="max-h-[320px]">
                      <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                      {proximos.length > 0 && <CommandGroup heading="Próximos e em andamento">{proximos.map(itemDoEvento)}</CommandGroup>}
                      {concluidos.length > 0 && <CommandGroup heading="Concluídos">{concluidos.map(itemDoEvento)}</CommandGroup>}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage className="mt-1 text-xs" />
            </FormItem>
          )}
        />

        {/* Datas */}
        <FormField
          control={form.control}
          name="startDate"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-0">
              <label htmlFor="grid-start-date" className={LABEL}>Data inicial<RequiredMark /></label>
              <FormControl>
                <input id="grid-start-date" type="date" className={CAMPO} aria-invalid={!!fieldState.error || undefined} {...field} data-testid="input-grid-start-date" />
              </FormControl>
              <FormMessage className="mt-1 text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="endDate"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-0">
              <label htmlFor="grid-end-date" className={LABEL}>Data final<RequiredMark /></label>
              <FormControl>
                <input id="grid-end-date" type="date" className={CAMPO} aria-invalid={!!fieldState.error || undefined} {...field} data-testid="input-grid-end-date" />
              </FormControl>
              <FormMessage className="mt-1 text-xs" />
            </FormItem>
          )}
        />

        {/* Botão para gerar grade — a fileira tem rótulo, o botão alinha com os campos */}
        <div className="col-span-2 lg:col-span-1 lg:pt-[22px]">
          <button
            type="button"
            onClick={generateGrid}
            className={`w-full lg:w-auto h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              gridHasContent
                ? "border border-border bg-card text-foreground hover:bg-muted"
                : "bg-primary text-primary-foreground hover:bg-primary-hover shadow-1"
            }`}
            data-testid="button-generate-grid"
          >
            {gridHasContent ? <RefreshCw className="w-4 h-4" aria-hidden="true" /> : <Grid3x3 className="w-4 h-4" aria-hidden="true" />}
            {gridHasContent ? "Regerar grade" : "Gerar grade"}
          </button>
        </div>
      </div>

      {/* O evento escolhido: onde e quando — e o atalho para usar as datas dele. */}
      {escolhido && (
        <div className="pas-entra mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground" data-testid="grid-evento-contexto">
          {escolhido.location && (
            <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{escolhido.location}</span></span>
          )}
          {inicioDoEvento && fimDoEvento && (
            <span className="tabular-nums">Evento: {formatPeriod(inicioDoEvento, fimDoEvento)}</span>
          )}
          {podeUsarDatas && (
            <button
              type="button"
              onClick={() => {
                form.setValue("startDate", inicioDoEvento, { shouldValidate: true, shouldDirty: true });
                form.setValue("endDate", fimDoEvento, { shouldValidate: true, shouldDirty: true });
              }}
              className="inline-flex items-center gap-1 h-7 px-2 -my-1 rounded-md font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="button-usar-datas-evento"
            >
              <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Usar as datas do evento
            </button>
          )}
        </div>
      )}

      {/* Confirmação: regerar por cima de uma grade preenchida */}
      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent className="sm:max-w-[600px] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Regerar a grade para o novo período?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5 text-sm text-muted-foreground">
                <p className="m-0">A grade atual já tem dados. Escolha o que fazer com eles:</p>
                <ul className="m-0 p-0 list-none space-y-2">
                  <li className="rounded-lg border border-border bg-surface-muted px-3 py-2">
                    <strong className="block text-foreground font-semibold">Ajustar o período mantendo os dados</strong>
                    Ficam as funções, os dados de viagem e as quantidades dos dias que continuam no novo período. Dias que saem são descartados; dias novos entram vazios.
                  </li>
                  <li className="rounded-lg border border-border bg-surface-muted px-3 py-2">
                    <strong className="block text-foreground font-semibold">Recomeçar do zero</strong>
                    Todas as funções voltam vazias.
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="h-9 rounded-lg mt-0">Cancelar</AlertDialogCancel>
            <button
              type="button"
              onClick={() => { setConfirmRegenerate(false); buildGrid(false); }}
              className="h-9 px-4 whitespace-nowrap text-sm font-medium text-danger border border-danger/25 rounded-lg hover:bg-danger-soft transition-colors bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Recomeçar do zero
            </button>
            <AlertDialogAction onClick={() => buildGrid(true)} className="h-9 rounded-lg whitespace-nowrap">
              Ajustar período mantendo dados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
