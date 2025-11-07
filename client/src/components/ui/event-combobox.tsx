import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Event } from "@shared/schema";

interface EventComboboxProps {
  events?: Event[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
}

export default function EventCombobox({
  events,
  value,
  onValueChange,
  placeholder = "Selecionar evento",
  testId = "event-combobox"
}: EventComboboxProps) {
  const [open, setOpen] = useState(false);

  const sortedEvents = events
    ?.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })) || [];

  const selectedEvent = sortedEvents.find(e => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid={testId}
        >
          <span className="truncate mr-2">
            {value === "all" ? "Todos os Eventos" : 
             selectedEvent ? selectedEvent.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Buscar evento..." />
          <CommandList>
            <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                key="all"
                value="all"
                onSelect={() => {
                  onValueChange("all");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "all" ? "opacity-100" : "opacity-0"
                  )}
                />
                Todos os Eventos
              </CommandItem>
              {sortedEvents.map((event) => (
                <CommandItem
                  key={event.id}
                  value={`${event.name} ${event.id}`}
                  onSelect={() => {
                    onValueChange(event.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === event.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {event.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
