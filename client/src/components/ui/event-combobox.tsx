import { useState } from "react";
import { Search, ChevronDown, X, Calendar } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
}

export default function EventCombobox({
  events,
  value,
  onValueChange,
  placeholder = "Selecionar evento",
  testId = "event-combobox",
  showAllOption = true,
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
      <PopoverTrigger asChild>
        <button
          data-testid={testId}
          type="button"
          className="w-full h-9 flex items-center justify-between px-3 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 cursor-pointer hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <span className="flex-1 text-left truncate text-slate-700">
            {displayValue}
          </span>
          {value && value !== "all" ? (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onValueChange("all"); }}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
        style={{ width: "var(--radix-popover-trigger-width, 240px)", minWidth: 240 }}
      >
        {/* Search field */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
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
              className={`px-3 py-2.5 text-sm font-medium border-b border-slate-100 cursor-pointer transition-colors ${
                value === "all"
                  ? "bg-violet-50 text-violet-700"
                  : "text-slate-400 hover:bg-violet-50 hover:text-violet-700"
              }`}
              onClick={() => { onValueChange("all"); close(); }}
            >
              Todos os Eventos
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-400 text-center">
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
                      ? "bg-violet-50 text-violet-700"
                      : "text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                  }`}
                  onClick={() => { onValueChange(event.id); close(); }}
                >
                  <Calendar className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-violet-500" : "text-slate-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${isSelected ? "font-semibold" : ""}`}>{event.name}</div>
                    {dateLabel && (
                      <div className={`text-[11px] mt-0.5 ${isSelected ? "text-violet-400" : "text-slate-400"}`}>{dateLabel}</div>
                    )}
                  </div>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
