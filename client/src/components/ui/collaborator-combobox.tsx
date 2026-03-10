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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] || "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface CollaboratorComboboxProps {
  collaborators?: Collaborator[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
}

export default function CollaboratorCombobox({
  collaborators,
  value,
  onValueChange,
  placeholder = "Selecionar colaborador",
  testId = "collaborator-combobox",
}: CollaboratorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sortedCollaborators =
    collaborators
      ?.filter((c) => c.status === "aprovado")
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
          className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/30 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <span className="truncate mr-2">{displayValue}</span>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 bg-white"
        style={{ width: "var(--radix-popover-trigger-width, 280px)" }}
      >
        <div className="flex items-center border-b border-slate-100 px-3 py-2.5">
          <Search className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar colaborador..."
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
            Todos os Colaboradores
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-400 text-center">
              Nenhum colaborador encontrado.
            </div>
          ) : (
            filtered.map((collaborator) => {
              const name = capitalizeName(fixEncoding(collaborator.fullName));
              const initials = getInitials(collaborator.fullName);
              const isSelected = value === collaborator.id;
              return (
                <div
                  key={collaborator.id}
                  className={`flex items-center px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                  onClick={() => {
                    onValueChange(collaborator.id);
                    close();
                  }}
                >
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center mr-2 flex-shrink-0">
                    {initials}
                  </div>
                  <span className="truncate">{name}</span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
