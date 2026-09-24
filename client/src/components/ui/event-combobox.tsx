import { useState, type Ref } from "react";
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
  /**
   * Trava o gatilho (e o "limpar"). A Sugestão de Escala usa isto durante o
   * envio: trocar de evento no meio do POST fazia o `onSuccess` limpar o
   * rascunho do evento ERRADO. Opcional — as outras telas não mudam.
   */
  disabled?: boolean;
  /** Ref do botão gatilho, para quem precisa abrir/focar o seletor por código (sem `querySelector`). */
  triggerRef?: Ref<HTMLButtonElement>;
}

export default function EventCombobox({
  events,
  value,
  onValueChange,
  placeholder = "Selecionar evento",
  testId = "event-combobox",
  showAllOption = true,
  className,
  disabled,
  triggerRef,
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
            ref={triggerRef}
            data-testid={testId}
            type="button"
            disabled={disabled}
            // O nome do evento é longo e o gatilho é estreito: sem o `title`,
            // "CIRCUITO DAS ESTAÇÕES - Outono - BRASÍLIA - 2026" virava
            // "CIRCUITO DAS ESTAÇÕES - Outo…" e não havia como ler o resto.
            title={displayValue}
            // Azul da marca (tokens), não `blue-*` cru: o hover/foco precisa ser
            // o MESMO azul dos outros controles da tela.
            className={cn("w-full h-9 flex items-center justify-between pl-3 pr-9 border border-border rounded-lg bg-card text-sm text-slate-700 cursor-pointer hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60", className)}
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
            disabled={disabled}
            onClick={e => { e.stopPropagation(); onValueChange("all"); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 bg-card border border-border rounded-xl shadow-2 overflow-hidden z-50"
        style={{ width: "var(--radix-popover-trigger-width, 240px)", minWidth: 240 }}
      >
        {/* Search field */}
        <div className="flex items-center gap-2 bg-surface-muted border-b border-border px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar evento…"
            className="w-full text-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm placeholder:text-muted-foreground text-slate-700"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-slate-600 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="max-h-[260px] overflow-y-auto" role="listbox" aria-label="Eventos">
          {/* "Todos" option */}
          {showAllOption && !search && (
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              className={`w-full text-left px-3 py-2.5 text-sm font-medium border-b border-border cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-brand-soft ${
                value === "all"
                  ? "bg-brand-soft text-primary"
                  : "text-muted-foreground hover:bg-brand-soft hover:text-primary"
              }`}
              onClick={() => { onValueChange("all"); close(); }}
            >
              Todos os eventos
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted-foreground text-center">
              Nenhum evento encontrado.
            </div>
          ) : (
            filtered.map(event => {
              const isSelected = value === event.id;
              const dateLabel = fmtEventDate(event.startDate, event.endDate);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={event.id}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-border last:border-0 focus-visible:outline-none focus-visible:bg-brand-soft ${
                    isSelected
                      ? "bg-brand-soft text-primary"
                      : "text-slate-700 hover:bg-brand-soft hover:text-primary"
                  }`}
                  onClick={() => { onValueChange(event.id); close(); }}
                >
                  <Calendar className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm whitespace-normal break-words ${isSelected ? "font-semibold" : ""}`}>{event.name}</div>
                    {dateLabel && (
                      <div className={`text-2xs mt-0.5 ${isSelected ? "text-primary/70" : "text-muted-foreground"}`}>{dateLabel}</div>
                    )}
                  </div>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" aria-hidden="true" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
