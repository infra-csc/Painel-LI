import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";
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
  testId = "event-combobox",
}: EventComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sortedEvents =
    events?.sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    ) || [];

  const filtered = search.trim()
    ? sortedEvents.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase())
      )
    : sortedEvents;

  const selectedEvent = sortedEvents.find((e) => e.id === value);

  const displayValue =
    value === "all" ? "Todos os Eventos" : selectedEvent ? selectedEvent.name : placeholder;

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          data-testid={testId}
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 cursor-pointer hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <span className="mr-2">{displayValue}</span>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 min-w-[220px]"
        style={{ width: "var(--radix-popover-trigger-width, 220px)" }}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
          />
        </div>

        <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div
            className={`px-4 py-2.5 text-sm font-medium border-b border-slate-100 cursor-pointer transition-colors ${
              value === "all"
                ? "bg-blue-50 text-blue-700"
                : "text-slate-400 hover:bg-blue-50 hover:text-blue-700"
            }`}
            onClick={() => {
              onValueChange("all");
              close();
            }}
          >
            Todos os Eventos
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-400 text-center">
              Nenhum evento encontrado.
            </div>
          ) : (
            filtered.map((event) => (
              <div
                key={event.id}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors whitespace-normal ${
                  value === event.id
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                }`}
                onClick={() => {
                  onValueChange(event.id);
                  close();
                }}
              >
                {event.name}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
