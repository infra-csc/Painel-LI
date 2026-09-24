import { useMemo, useState, useEffect, useRef, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar, Search, X, ChevronDown, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Event } from "@shared/schema";

interface EventSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  events: Event[] | undefined;
  className?: string;
}

function useSortedEvents(events: Event[] | undefined) {
  return useMemo(() => {
    if (!events) return [];
    return [...events].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [events]);
}

function EventItems({ events, checkedClass }: { events: Event[]; checkedClass: string }) {
  return (
    <>
      {events.map((event, index) => (
        <TooltipProvider key={event.id} delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                {index > 0 && (
                  <div className="mx-2 h-px bg-muted" />
                )}
                <SelectItem
                  value={event.id}
                  className={`py-2.5 px-3 pl-8 text-sm rounded-md cursor-pointer ${checkedClass} data-[state=checked]:font-semibold focus:bg-surface-muted `}
                >
                  <span className="break-words">{event.name}</span>
                </SelectItem>
              </div>
            </TooltipTrigger>
            {event.name.length > 35 && (
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-sm">{event.name}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      ))}
    </>
  );
}

export function EventSelect({ value, onValueChange, events, className }: EventSelectProps) {
  const sorted = useSortedEvents(events);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`h-11 min-w-[280px] px-3.5 text-base rounded-lg border-slate-300 shadow-1 hover:border-slate-400 transition-colors ${className ?? ""}`}
      >
        <Calendar className="w-4.5 h-4.5 text-muted-foreground mr-2.5 shrink-0" aria-hidden="true" />
        <SelectValue placeholder="Selecionar evento" />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-2 border-border">
        <EventItems events={sorted} checkedClass="data-[state=checked]:bg-brand-soft dark:data-[state=checked]:bg-primary-hover/30 data-[state=checked]:text-primary dark:data-[state=checked]:text-primary/70" />
      </SelectContent>
    </Select>
  );
}

function fmtEventDate(start?: string, end?: string) {
  const target = end && end !== start ? end : start;
  if (!target) return "";
  const [y, m, day] = target.split("-");
  return `${day}/${m}/${y}`;
}

/**
 * Seletor de evento com busca — porta de entrada do Financeiro (Planejado,
 * Realizado, Notas Fiscais).
 *
 * Reescrito em 23/09 (code review): a escolha era só `onMouseDown`, então não
 * existia por teclado; o foco era invisível (`outline: none` sem substituto) e
 * o realce vinha de JS mexendo em `style` a cada `mouseenter`. Agora é um
 * combobox de verdade: setas percorrem a lista, Enter escolhe, Esc fecha, o
 * item ativo é anunciado por `aria-activedescendant`, o foco volta ao botão
 * que abriu e as cores são tokens do tema.
 */
export function EventSearchSelect({ value, onValueChange, events, className }: EventSelectProps) {
  const sorted = useSortedEvents(events);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selectedEvent = useMemo(() => events?.find(e => e.id === value), [events, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(e => e.name.toLowerCase().includes(q));
  }, [sorted, search]);

  const optionId = (index: number) => `${listId}-opt-${index}`;

  // Ao abrir ou mudar a busca, o item ativo volta para o selecionado (se
  // visível) ou para o primeiro — nunca fica apontando para fora da lista.
  useEffect(() => {
    if (!isOpen) return;
    const idx = filtered.findIndex(e => e.id === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [isOpen, filtered, value]);

  // Item ativo sempre à vista quando se navega pelas setas.
  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen]);

  function handleOpen() {
    setIsOpen(true);
    // O portal monta no próximo ciclo; o foco só pode ir depois disso.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch("");
    // Devolve o foco a quem abriu — sem isso o teclado "caía" no <body>.
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  function handleSelect(eventId: string) {
    onValueChange(eventId);
    handleClose();
  }

  function handleClear() {
    onValueChange("");
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length) setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length) setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(filtered.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const alvo = filtered[activeIndex];
      if (alvo) handleSelect(alvo.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    // Esc fecha mesmo com o foco fora do campo (ex.: depois de clicar na lista).
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  const activeId = filtered.length ? optionId(activeIndex) : undefined;

  // Paleta em portal no <body>: sempre centralizada, nunca cortada por
  // `overflow` de quem a usa.
  const palette = isOpen && createPortal(
    <div
      id="event-command-palette"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar evento"
        className="flex w-full max-w-[560px] max-h-[80vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-3 animate-in fade-in-0 zoom-in-95 duration-150"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Campo de busca: o anel de foco vai no contêiner (focus-within) —
            o input em si não tem borda para não duplicar o traço. */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 ring-inset ring-ring/40 focus-within:ring-2">
          <Search className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Buscar evento"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar evento..."
            className="flex-1 min-w-0 border-0 bg-transparent text-base font-medium text-foreground caret-primary outline-none placeholder:text-muted-foreground"
          />
          {search ? (
            <button
              type="button"
              onClick={() => { setSearch(""); inputRef.current?.focus(); }}
              aria-label="Limpar busca"
              className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-2xs text-muted-foreground" aria-hidden="true">ESC</kbd>
          )}
        </div>

        {!search && (
          <div className="px-5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {sorted.length} evento{sorted.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* Lista: `role=listbox` + `role=option`; o item ativo do teclado e o
            selecionado são coisas diferentes (aria-selected = selecionado). */}
        <div
          id={listId}
          role="listbox"
          aria-label="Eventos"
          className="event-search-list flex-1 overflow-y-auto px-2.5 pb-3 pt-1"
        >
          {filtered.length === 0 ? (
            <div role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 h-7 w-7 opacity-50" aria-hidden="true" />
              <div>Nenhum evento encontrado</div>
              <div className="mt-1 text-xs opacity-80">Tente outro termo de busca</div>
            </div>
          ) : (
            filtered.map((event, index) => {
              const isSelected = event.id === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={event.id}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => handleSelect(event.id)}
                  onMouseMove={() => { if (!isActive) setActiveIndex(index); }}
                  className={cn(
                    "mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors outline-none",
                    isSelected ? "bg-brand-soft" : isActive ? "bg-accent" : "hover:bg-accent",
                    isActive && "ring-2 ring-inset ring-ring/40",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      isSelected ? "bg-primary text-primary-foreground shadow-1" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Calendar className="h-[15px] w-[15px]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm font-semibold tracking-tight", isSelected ? "text-primary" : "text-foreground")}>
                      {event.name}
                    </div>
                    {(event.startDate || event.endDate) && (
                      <div className={cn("mt-0.5 text-xs", isSelected ? "text-primary/80" : "text-muted-foreground")}>
                        {fmtEventDate(event.startDate, event.endDate)}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" aria-hidden="true" strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className={cn("relative min-w-[280px]", className)}>
      {/* Botão que abre a paleta. O "limpar" NÃO fica dentro dele (botão dentro
          de botão é HTML inválido e confunde leitor de tela): é irmão, posicionado
          por cima da borda direita. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={selectedEvent ? `Evento: ${selectedEvent.name}. Trocar evento` : "Selecionar evento"}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-lg border bg-card px-3.5 text-sm shadow-1 transition-[border-color,box-shadow,transform]",
          "hover:scale-[1.015] active:scale-[0.985]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isOpen ? "border-primary ring-2 ring-primary/10" : "border-input",
          selectedEvent ? "pr-9 font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        <Search className={cn("h-3.5 w-3.5 shrink-0", isOpen ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
        <span className="flex-1 truncate text-left">
          {selectedEvent ? selectedEvent.name : "Selecionar evento"}
        </span>
        {!selectedEvent && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </button>
      {selectedEvent && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpar evento selecionado"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      {palette}
    </div>
  );
}

export function EventSelectCTA({
  value,
  onValueChange,
  events,
  accentColor = "blue",
}: EventSelectProps & { accentColor?: "blue" | "purple" | "emerald" }) {
  const sorted = useSortedEvents(events);

  const colorMap = {
    blue: {
      border: "border-primary/40 hover:border-primary",
      icon: "text-primary",
      checked: "data-[state=checked]:bg-brand-soft dark:data-[state=checked]:bg-primary-hover/30 data-[state=checked]:text-primary dark:data-[state=checked]:text-primary/70",
    },
    purple: {
      border: "border-primary/40 hover:border-primary",
      icon: "text-primary",
      checked: "data-[state=checked]:bg-brand-soft dark:data-[state=checked]:bg-primary-hover/30 data-[state=checked]:text-primary dark:data-[state=checked]:text-primary/70",
    },
    emerald: {
      border: "border-success/25 hover:border-success-strong",
      icon: "text-success-strong",
      checked: "data-[state=checked]:bg-success-soft dark:data-[state=checked]:bg-success/30 data-[state=checked]:text-success dark:data-[state=checked]:text-success-soft",
    },
  };

  const colors = colorMap[accentColor];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`w-72 h-11 px-3.5 text-base mx-auto bg-card ${colors.border} rounded-lg shadow-1 transition-colors`}
      >
        <Calendar className={`w-4.5 h-4.5 ${colors.icon} mr-2.5 shrink-0`} aria-hidden="true" />
        <SelectValue placeholder="Selecionar evento" />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-2 border-border">
        <EventItems events={sorted} checkedClass={`${colors.checked}`} />
      </SelectContent>
    </Select>
  );
}
