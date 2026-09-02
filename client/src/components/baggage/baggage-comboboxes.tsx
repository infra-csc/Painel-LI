/**
 * Os dois comboboxes do formulário de bagagem: evento e colaborador.
 *
 * O de colaborador estava escrito inline dentro do JSX da página — 100 linhas
 * de listbox, teclado e `aria-activedescendant` no meio do formulário. Os dois
 * são o mesmo padrão, então agora moram juntos.
 *
 * Comportamento copiado, não reescrito: setas, Enter, Esc,
 * `aria-activedescendant` e o `onBlur` com atraso de 150ms (que existe para o
 * clique numa opção acontecer antes de a lista fechar).
 */
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fixEncoding } from "@/lib/utils";
import {
  eventPeriod, formatCpf, getCpf, toTitleCase,
  type CollaboratorItem, type EventOption,
} from "./baggage-core";

const CAMPO = "h-9 text-xs rounded-lg border-gray-200";
const LISTA = "absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto";
const OPCAO = "w-full text-left px-3 py-2 text-xs transition-colors border-b border-gray-50 last:border-0";
/** Escolhido: caixa azul com o valor e um X para trocar. */
const ESCOLHIDO = "flex items-center gap-2 h-9 px-3 rounded-lg border border-blue-200 bg-blue-50/50";

/** Teclado compartilhado pelos dois: setas percorrem, Enter escolhe, Esc fecha. */
function usarTeclado<T>(
  matches: T[],
  aberto: boolean,
  setAberto: (v: boolean) => void,
  ativo: number,
  setAtivo: (f: (i: number) => number) => void,
  escolher: (item: T) => void,
) {
  return (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!aberto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setAberto(true);
      setAtivo(() => 0);
      return;
    }
    if (!aberto || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo(i => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (ativo >= 0 && matches[ativo]) {
        e.preventDefault();
        escolher(matches[ativo]);
      }
    } else if (e.key === "Escape") {
      setAberto(false);
      setAtivo(() => -1);
    }
  };
}

export function EventCombobox({
  id, events, value, onChange, placeholder, invalid, describedBy, className = "",
}: {
  id: string;
  events: EventOption[];
  value: string;
  onChange: (eventId: string) => void;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = value ? events.find(e => e.id === value) : undefined;
  const listboxId = `${id}-listbox`;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? events.filter(e => e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q))
      : events;
    return base.slice(0, 50);
  }, [events, query]);

  const select = (eventId: string) => {
    onChange(eventId);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = usarTeclado(matches, open, setOpen, activeIndex, setActiveIndex, ev => select(ev.id));

  if (selected) {
    return (
      <div className={`${ESCOLHIDO} ${className}`}>
        <p className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate" title={selected.name}>
          {selected.name}
          {eventPeriod(selected) && (
            <span className="ml-2 font-mono font-normal text-[11px] text-[#64748B] whitespace-nowrap">{eventPeriod(selected)}</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => { onChange(""); setQuery(""); }}
          aria-label={`Remover evento ${selected.name}`}
          className="w-6 h-6 flex items-center justify-center rounded-md text-[#64748B] hover:text-slate-700 hover:bg-white transition-colors shrink-0"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Input
        id={id}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1); }, 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 && matches[activeIndex] ? `${id}-opt-${matches[activeIndex].id}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={CAMPO}
      />
      {open && (
        <div id={listboxId} role="listbox" aria-label="Eventos" className={`${LISTA} max-h-[260px] min-w-[240px]`}>
          {matches.length === 0 ? (
            <p className="text-[11px] text-[#64748B] text-center py-3 px-3">Nenhum evento encontrado.</p>
          ) : matches.map((ev, i) => (
            <button
              key={ev.id}
              id={`${id}-opt-${ev.id}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              ref={i === activeIndex ? el => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(ev.id)}
              className={`${OPCAO} ${i === activeIndex ? "bg-blue-50" : ""}`}
            >
              <span className="block font-semibold text-slate-700 truncate">{ev.name}</span>
              <span className="block text-[11px] text-[#64748B] mt-0.5 truncate">
                {eventPeriod(ev)}
                {ev.location && (eventPeriod(ev) ? ` · ${ev.location}` : ev.location)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CollaboratorCombobox({
  id, collaborators, value, onChange, invalid, describedBy,
}: {
  id: string;
  /** Já filtrada por ativos — colaborador inativo não entra na busca. */
  collaborators: CollaboratorItem[];
  value: string;
  onChange: (collaboratorId: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = value ? collaborators.find(c => c.id === value) : undefined;
  const listboxId = `${id}-listbox`;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, "");
    return collaborators
      .filter(c => {
        const name = fixEncoding(c.fullName || "").toLowerCase();
        if (name.includes(q)) return true;
        const cpf = getCpf(c).replace(/\D/g, "");
        return !!qDigits && cpf.includes(qDigits);
      })
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR"))
      .slice(0, 20);
  }, [collaborators, query]);

  const select = (collaboratorId: string) => {
    onChange(collaboratorId);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = usarTeclado(matches, open, setOpen, activeIndex, setActiveIndex, c => select(c.id));

  if (selected) {
    const cpf = getCpf(selected);
    return (
      <div className={ESCOLHIDO}>
        <p className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate">
          {toTitleCase(fixEncoding(selected.fullName))}
          {cpf && <span className="ml-2 font-mono font-normal text-[#64748B]">{formatCpf(cpf)}</span>}
        </p>
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Remover colaborador selecionado"
          className="w-6 h-6 flex items-center justify-center rounded-md text-[#64748B] hover:text-slate-700 hover:bg-white transition-colors shrink-0"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1); }, 150)}
        onKeyDown={onKeyDown}
        placeholder="Buscar por nome ou CPF..."
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 && matches[activeIndex] ? `${id}-opt-${matches[activeIndex].id}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={CAMPO}
      />
      {open && query.trim() && (
        <div id={listboxId} role="listbox" aria-label="Colaboradores" className={`${LISTA} max-h-[240px]`}>
          {matches.length === 0 ? (
            <p className="text-[11px] text-[#64748B] text-center py-3 px-3">Nenhum colaborador encontrado.</p>
          ) : matches.map((c, i) => {
            const cpf = getCpf(c);
            return (
              <button
                key={c.id}
                id={`${id}-opt-${c.id}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                ref={i === activeIndex ? el => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(c.id)}
                className={`${OPCAO} ${i === activeIndex ? "bg-blue-50" : ""}`}
              >
                <span className="font-semibold text-slate-700">{toTitleCase(fixEncoding(c.fullName))}</span>
                {cpf && <span className="ml-2 font-mono text-[11px] text-[#64748B]">{formatCpf(cpf)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
