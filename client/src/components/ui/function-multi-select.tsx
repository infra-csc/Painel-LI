import { useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Function as FunctionType } from "@shared/schema";

interface FunctionMultiSelectProps {
  functions: FunctionType[] | undefined;
  selectedIds: string[];
  onSelectedChange: (selectedIds: string[]) => void;
  placeholder?: string;
  testId?: string;
}

export default function FunctionMultiSelect({
  functions,
  selectedIds,
  onSelectedChange,
  placeholder = "Selecionar funções",
  testId = "function-multi-select",
}: FunctionMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const toggleFunction = (functionId: string) => {
    if (selectedIds.includes(functionId)) {
      onSelectedChange(selectedIds.filter((id) => id !== functionId));
    } else {
      onSelectedChange([...selectedIds, functionId]);
    }
  };

  const clearAll = () => onSelectedChange([]);

  const sorted = functions?.slice().sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  ) || [];

  const filtered = search.trim()
    ? sorted.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const displayText =
    selectedIds.length > 0
      ? `${selectedIds.length} função${selectedIds.length > 1 ? "ões" : ""} selecionada${selectedIds.length > 1 ? "s" : ""}`
      : placeholder;

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
            {selectedIds.length > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full flex-shrink-0">
                {selectedIds.length}
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
        <div className="flex items-center gap-2 bg-slate-50 border-b border-slate-100 px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar função..."
            className="w-full text-[13px] bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
          />
          {selectedIds.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); clearAll(); }}
              className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-slate-400 text-center">
              Nenhuma função encontrada.
            </div>
          ) : (
            filtered.map((func) => {
              const isSelected = selectedIds.includes(func.id);
              return (
                <div
                  key={func.id}
                  className={`flex items-center gap-3 px-3 py-2.5 text-[13px] cursor-pointer transition-colors whitespace-normal border-b border-slate-50 last:border-0 ${
                    isSelected
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                  onClick={() => toggleFunction(func.id)}
                >
                  <div
                    className={`w-4 h-4 flex-shrink-0 rounded border-[1.5px] flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-[#2563EB] border-[#2563EB]"
                        : "border-slate-300"
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {func.name}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
