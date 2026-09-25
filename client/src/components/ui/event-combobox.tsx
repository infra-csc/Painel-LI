import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
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

/** Valor da opção "Todos os eventos" — o mesmo que o `value` recebe. */
const TODOS = "all";

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

/**
 * Seletor de evento com busca. Segue o padrão "combobox" da WAI-ARIA (25/09):
 * o gatilho é `role="combobox"` (aria-expanded/aria-controls/aria-haspopup=
 * "listbox"), a lista é `role="listbox"` com `role="option"` + aria-selected,
 * e o teclado anda pela lista SEM sair do campo de busca — ↑/↓ movem a opção
 * ativa (exposta em `aria-activedescendant`), Home/End vão às pontas, Enter
 * escolhe a ativa e Esc fecha devolvendo o foco ao gatilho (Radix Popover).
 * As opções continuam sendo botões alcançáveis por Tab, porque era assim que
 * os usuários de teclado já usavam o componente; focar uma opção também a
 * torna a ativa, então o destaque acompanha os dois jeitos de navegar.
 */
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
  /** Opção destacada pelo teclado (`TODOS` ou id do evento); null = nenhuma. */
  const [ativa, setAtiva] = useState<string | null>(null);
  const baseId = useId();
  const listboxId = `${baseId}-lista`;
  const idDaOpcao = (opcao: string) => `${baseId}-opcao-${opcao}`;
  const refsDasOpcoes = useRef(new Map<string, HTMLButtonElement>());

  const sorted = [...(events ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );

  const filtered = search.trim()
    ? sorted.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const mostrarTodos = showAllOption && !search;
  /** Ordem das opções na tela — é por ela que as setas andam. */
  const opcoes = [...(mostrarTodos ? [TODOS] : []), ...filtered.map(e => e.id)];

  const selectedEvent = sorted.find(e => e.id === value);

  const displayValue =
    value === TODOS ? "Todos os Eventos" : selectedEvent ? selectedEvent.name : placeholder;

  // A opção ativa some da lista quando a busca muda: volta para a primeira.
  const ativaValida = ativa !== null && opcoes.includes(ativa) ? ativa : (opcoes[0] ?? null);

  useEffect(() => {
    if (!open || !ativaValida) return;
    refsDasOpcoes.current.get(ativaValida)?.scrollIntoView({ block: "nearest" });
  }, [open, ativaValida]);

  const close = () => {
    setOpen(false);
    setSearch("");
    setAtiva(null);
  };

  const escolher = (opcao: string) => {
    onValueChange(opcao);
    close();
  };

  const aoAbrir = (o: boolean) => {
    setOpen(o);
    if (o) {
      // Começa na opção já escolhida (ou na primeira), como um <select>.
      setAtiva(opcoes.includes(value) ? value : (opcoes[0] ?? null));
    } else {
      setSearch("");
      setAtiva(null);
    }
  };

  const aoDigitarNaBusca = (texto: string) => {
    setSearch(texto);
    setAtiva(null); // `ativaValida` cai na primeira opção do novo filtro
  };

  const mover = (indice: number) => {
    if (opcoes.length === 0) return;
    setAtiva(opcoes[Math.max(0, Math.min(opcoes.length - 1, indice))]);
  };

  const teclasDaBusca = (e: KeyboardEvent<HTMLInputElement>) => {
    const atual = ativaValida ? opcoes.indexOf(ativaValida) : -1;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); mover(atual + 1); break;
      case "ArrowUp": e.preventDefault(); mover(atual - 1); break;
      case "Home": e.preventDefault(); mover(0); break;
      case "End": e.preventDefault(); mover(opcoes.length - 1); break;
      case "Enter":
        e.preventDefault();
        if (ativaValida) escolher(ativaValida);
        break;
      // Esc: o Popover fecha e devolve o foco ao gatilho (onOpenChange → aoAbrir(false)).
    }
  };

  const registrarOpcao = (opcao: string) => (el: HTMLButtonElement | null) => {
    if (el) refsDasOpcoes.current.set(opcao, el);
    else refsDasOpcoes.current.delete(opcao);
  };

  return (
    <Popover open={open} onOpenChange={aoAbrir}>
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            data-testid={testId}
            type="button"
            disabled={disabled}
            // O Radix marca o gatilho como `aria-haspopup="dialog"` e aponta
            // `aria-controls` para o painel; aqui o que ele abre é uma lista.
            role="combobox"
            aria-haspopup="listbox"
            aria-controls={listboxId}
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
        {value && value !== TODOS ? (
          <button
            type="button"
            aria-label="Limpar evento selecionado"
            disabled={disabled}
            onClick={e => { e.stopPropagation(); onValueChange(TODOS); }}
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
            onChange={e => aoDigitarNaBusca(e.target.value)}
            onKeyDown={teclasDaBusca}
            placeholder="Buscar evento…"
            aria-label="Buscar evento"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={ativaValida ? idDaOpcao(ativaValida) : undefined}
            className="w-full text-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm placeholder:text-muted-foreground text-slate-700"
          />
          {search && (
            <button
              type="button"
              onClick={() => aoDigitarNaBusca("")}
              aria-label="Limpar busca"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-slate-600 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div id={listboxId} className="max-h-[260px] overflow-y-auto" role="listbox" aria-label="Eventos">
          {/* "Todos" option */}
          {mostrarTodos && (
            <button
              type="button"
              role="option"
              id={idDaOpcao(TODOS)}
              ref={registrarOpcao(TODOS)}
              aria-selected={value === TODOS}
              data-active={ativaValida === TODOS || undefined}
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm font-medium border-b border-border cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-brand-soft",
                value === TODOS ? "bg-brand-soft text-primary" : "text-muted-foreground hover:bg-brand-soft hover:text-primary",
                ativaValida === TODOS && "bg-brand-soft text-primary",
              )}
              onClick={() => escolher(TODOS)}
              onFocus={() => setAtiva(TODOS)}
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
              const isActive = ativaValida === event.id;
              const dateLabel = fmtEventDate(event.startDate, event.endDate);
              return (
                <button
                  type="button"
                  role="option"
                  id={idDaOpcao(event.id)}
                  ref={registrarOpcao(event.id)}
                  aria-selected={isSelected}
                  data-active={isActive || undefined}
                  key={event.id}
                  className={cn(
                    "w-full text-left flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-border last:border-0 focus-visible:outline-none focus-visible:bg-brand-soft",
                    isSelected ? "bg-brand-soft text-primary" : "text-slate-700 hover:bg-brand-soft hover:text-primary",
                    isActive && "bg-brand-soft text-primary",
                  )}
                  onClick={() => escolher(event.id)}
                  onFocus={() => setAtiva(event.id)}
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
