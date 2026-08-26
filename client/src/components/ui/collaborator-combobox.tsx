import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { fixEncoding } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Collaborator } from "@shared/schema";

function capitalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


interface CollaboratorComboboxProps {
  collaborators?: Collaborator[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  hideAll?: boolean;
  /** Trava o seletor (evento encerrado, pedido de ajuste em análise…). */
  disabled?: boolean;
  /** Vira o `title` do gatilho travado — diz POR QUE não dá para trocar. */
  disabledReason?: string | null;
}

export default function CollaboratorCombobox({
  collaborators,
  value,
  onValueChange,
  placeholder = "Selecionar colaborador",
  testId = "collaborator-combobox",
  hideAll = false,
  disabled = false,
  disabledReason,
}: CollaboratorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sortedCollaborators =
    collaborators
      ?.filter((c) => c.status === "aprovado" && (c as any).active !== false)
      ?.sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "pt-BR", { sensitivity: "base" })
      ) || [];

  const filtered = search.trim()
    ? sortedCollaborators.filter((c) =>
        fixEncoding(c.fullName).toLowerCase().includes(search.toLowerCase())
      )
    : sortedCollaborators;

  const selectedCollaborator = sortedCollaborators.find((c) => c.id === value);

  const displayValue =
    value === "all"
      ? "Todos os Colaboradores"
      : selectedCollaborator
      ? capitalizeName(fixEncoding(selectedCollaborator.fullName))
      : placeholder;

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
          disabled={disabled}
          title={disabled ? (disabledReason ?? undefined) : undefined}
          className="w-full h-9 flex items-center justify-between px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200"
        >
          <span className="truncate mr-2">{displayValue}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 bg-white min-w-[280px]"
        style={{ width: "var(--radix-popover-trigger-width, 280px)" }}
      >
        <div className="flex items-center gap-2 bg-slate-50 border-b border-slate-100 px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar colaborador..."
            className="w-full text-[13px] bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
          />
        </div>

        <div
          className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
          onWheel={(e) => e.stopPropagation()}
        >
          {!hideAll && (
            <div
              className={`px-3 py-2.5 text-[13px] font-medium border-b border-slate-100 cursor-pointer transition-colors ${
                value === "all"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-400 hover:bg-blue-50 hover:text-blue-700"
              }`}
              onClick={() => {
                onValueChange("all");
                close();
              }}
            >
              Todos os Colaboradores
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-slate-400 text-center">
              Nenhum colaborador encontrado.
            </div>
          ) : (
            filtered.map((collaborator) => {
              const name = capitalizeName(fixEncoding(collaborator.fullName));
              const isSelected = value === collaborator.id;
              return (
                <div
                  key={collaborator.id}
                  className={`px-3 py-2.5 text-[13px] cursor-pointer transition-colors whitespace-normal border-b border-slate-50 last:border-0 ${
                    isSelected
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                  onClick={() => {
                    onValueChange(collaborator.id);
                    close();
                  }}
                >
                  {name}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
