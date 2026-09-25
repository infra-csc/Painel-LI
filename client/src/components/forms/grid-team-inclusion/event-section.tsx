/**
 * Escalação por Grade — evento, período e "Gerar Grade" (25/09, extraído do formulário).
 */
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Calendar, Check, ChevronsUpDown } from "lucide-react";
import type { Event } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import type { GridFormData } from "./grid-types";
import type { GridRows } from "./use-grid-rows";

export interface EventSectionProps {
  form: UseFormReturn<GridFormData>;
  events: Event[] | undefined;
  grid: Pick<GridRows, "gridHasContent" | "generateGrid" | "buildGrid" | "confirmRegenerate" | "setConfirmRegenerate">;
}

export function EventSection({ form, events, grid }: EventSectionProps) {
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
  const { gridHasContent, generateGrid, buildGrid, confirmRegenerate, setConfirmRegenerate } = grid;
  return (
    <>
      {/* Seleção de Evento */}
      <FormField
        control={form.control}
        name="eventId"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel className="text-2xs font-bold text-muted-foreground uppercase tracking-wide">Evento<RequiredMark /></FormLabel>
            <Popover open={openEventCombobox} onOpenChange={setOpenEventCombobox}>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between",
                      !field.value && "text-muted-foreground"
                    )}
                    data-testid="select-grid-event"
                  >
                    {field.value
                      ? events?.find((event) => event.id === field.value)?.name
                      : "Selecione um evento"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar evento…" />
                  <CommandList>
                    <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                    <CommandGroup>
                      {events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído').map((event) => (
                        <CommandItem
                          key={event.id}
                          value={event.name}
                          onSelect={() => {
                            form.setValue("eventId", event.id, { shouldValidate: true, shouldDirty: true });
                            setOpenEventCombobox(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              event.id === field.value
                                ? "opacity-100"
                                : "opacity-0"
                            )} aria-hidden="true" />
                          {event.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Datas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="startDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-2xs font-bold text-muted-foreground uppercase tracking-wide">Data Inicial<RequiredMark /></FormLabel>
              <FormControl>
                <Input
                  type="date"
                  className="h-9"
                  {...field}
                  data-testid="input-grid-start-date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="endDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-2xs font-bold text-muted-foreground uppercase tracking-wide">Data Final<RequiredMark /></FormLabel>
              <FormControl>
                <Input
                  type="date"
                  className="h-9"
                  {...field}
                  data-testid="input-grid-end-date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Botão para gerar grade */}
      <button
        type="button"
        onClick={generateGrid}
        className="w-full h-10 flex items-center justify-center gap-2 text-primary-foreground text-sm font-semibold rounded-lg transition-all bg-primary hover:bg-primary-hover hover:-translate-y-0.5 hover:shadow-2 shadow-1"
        data-testid="button-generate-grid"
      >
        <Calendar className="w-4 h-4" aria-hidden="true" />
        {gridHasContent ? "Regerar Grade de Funções" : "Gerar Grade de Funções"}
      </button>

      {/* Confirmação: regerar por cima de uma grade preenchida */}
      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regerar a grade para o novo período?</AlertDialogTitle>
            <AlertDialogDescription>
              A grade atual já tem dados. Você pode <strong>ajustar o período</strong> mantendo as
              funções, os dados de viagem e as quantidades dos dias que continuam no novo período
              (dias que saírem do período são descartados; dias novos entram vazios) — ou
              <strong> recomeçar do zero</strong> com todas as funções vazias.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <button
              type="button"
              onClick={() => { setConfirmRegenerate(false); buildGrid(false); }}
              className="h-10 px-4 text-sm font-medium text-danger border border-danger/25 rounded-md hover:bg-danger-soft transition-colors bg-card"
            >
              Recomeçar do zero
            </button>
            <AlertDialogAction onClick={() => buildGrid(true)}>
              Ajustar período mantendo dados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
