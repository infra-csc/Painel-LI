import { useState } from "react";
import { Search, ChevronDown, X, Calendar } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Event } from "@shared/schema";

function fmtDate(d?: string | null) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtEventDate(start?: string, end?: string) {
  const target = end && end !== start ? end : start;
  return fmtDate(target);
}

interface EventComboboxProps {
  events?: Event[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  showAllOption?: boolean;
  /** Classes extras do botão (ex.: `h-8 font-semibold` na barra de contexto da Sugestão). */
  className?: string;
}

export default function EventCombobox({
  events,
  value,
  onValueChange,
  placeholder = "Selecionar evento",
  testId = "event-combobox",
  showAllOption = true,
  className,
}: EventComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sorted = [...(events ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );

  const filtered = search.trim()
    ? sorted.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const selectedEvent = sorted.find(e => e.id === value);

  const displayValue =
    value === "all" ? "Todos os Eventos" : selectedEvent ? selectedEvent.name : placeholder;

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <button
            data-testid={testId}
            type="button"
            // O nome do evento é longo e o gatilho é estreito: sem o `title`,
            // "CIRCUITO DAS ESTAÇÕES - Outono - BRASÍLIA - 2026" virava
            // "CIRCUITO DAS ESTAÇÕES - Outo…" e não havia como ler o resto.
            title={displayValue}
            className={cn("w-full h-9 flex items-center justify-between pl-3 pr-9 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 cursor-pointer hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200", className)}
          >
            <span className="flex-1 text-left truncate text-slate-700">
              {displayValue}
            </span>
          </button>
        </PopoverTrigger>
        {value && value !== "all" ? (
          <button
            type="button"
            aria-label="Limpar evento selecionado"
            onClick={e => { e.stopPropagation(); onValueChange("all"); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        )}
      </div>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
        style={{ width: "var(--radix-popover-trigger-width, 240px)", minWidth: 240 }}
      >
        {/* Search field */}
        <div className="flex items-center gap-2 bg-slate-50 border-b border-slate-100 px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            className="w-full text-[13px] bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-[260px] overflow-y-auto">
          {/* "Todos" option */}
          {showAllOption && !search && (
            <div
              className={`px-3 py-2.5 text-[13px] font-medium border-b border-slate-100 cursor-pointer transition-colors ${
                value === "all"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-400 hover:bg-blue-50 hover:text-blue-700"
              }`}
              onClick={() => { onValueChange("all"); close(); }}
            >
              Todos os Eventos
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-slate-400 text-center">
              Nenhum evento encontrado.
            </div>
          ) : (
            filtered.map(event => {
              const isSelected = value === event.id;
              const dateLabel = fmtEventDate(event.startDate, event.endDate);
              return (
                <div
                  key={event.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${
                    isSelected
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                  onClick={() => { onValueChange(event.id); close(); }}
                >
                  <Calendar className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-blue-500" : "text-slate-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] whitespace-normal break-words ${isSelected ? "font-semibold" : ""}`}>{event.name}</div>
                    {dateLabel && (
                      <div className={`text-[11px] mt-0.5 ${isSelected ? "text-blue-400" : "text-slate-400"}`}>{dateLabel}</div>
                    )}
                  </div>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
