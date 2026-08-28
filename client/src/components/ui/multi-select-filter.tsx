/**
 * Seleção múltipla genérica para as barras de filtro (pedido do dono, 28/08:
 * "pode selecionar mais de um nos filtros"). Mesmo desenho do multi-select de
 * Funções — trigger com contador, popover com busca opcional e checkboxes.
 *
 * Semântica: lista vazia = "todos" (nenhum corte). Não existe item "Todos" na
 * lista — limpar a seleção faz esse papel (X no cabeçalho do popover).
 */
import { useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Texto do trigger quando nada está selecionado (ex.: "Todos os Eventos"). */
  placeholder: string;
  /** Mostra campo de busca no topo (listas longas: eventos, colaboradores). */
  searchable?: boolean;
  searchPlaceholder?: string;
  testId?: string;
}

export default function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder,
  searchable = false,
  searchPlaceholder = "Buscar...",
  testId = "multi-select-filter",
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? placeholder
        : `${selected.length} selecionados`;

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
          className="w-full h-9 flex items-center justify-between px-3 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 cursor-pointer hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <span className="flex-1 text-left flex items-center gap-2 truncate">
            <span className="truncate">{displayText}</span>
            {selected.length > 1 && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full flex-shrink-0">
                {selected.length}
              </span>
            )}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 min-w-[220px]"
        style={{ width: "var(--radix-popover-trigger-width, 220px)" }}
      >
        {(searchable || selected.length > 0) && (
          <div className="flex items-center gap-2 bg-slate-50 border-b border-slate-100 px-3 py-2.5">
            {searchable ? (
              <>
                <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full text-[13px] bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
                />
              </>
            ) : (
              <span className="flex-1 text-[12px] text-slate-500">
                {selected.length} selecionado{selected.length > 1 ? "s" : ""}
              </span>
            )}
            {selected.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors"
                title="Limpar seleção"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-slate-400 text-center">
              Nada encontrado.
            </div>
          ) : (
            filtered.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <div
                  key={option.value}
                  className={`flex items-center gap-3 px-3 py-2.5 text-[13px] cursor-pointer transition-colors whitespace-normal border-b border-slate-50 last:border-0 ${
                    isSelected
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                  onClick={() => toggle(option.value)}
                >
                  <div
                    className={`w-4 h-4 flex-shrink-0 rounded border-[1.5px] flex items-center justify-center transition-colors ${
                      isSelected ? "bg-[#2563EB] border-[#2563EB]" : "border-slate-300"
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {option.label}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
