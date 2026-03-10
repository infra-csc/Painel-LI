import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn, fixEncoding } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Collaborator } from "@shared/schema";

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
  testId = "collaborator-combobox"
}: CollaboratorComboboxProps) {
  const [open, setOpen] = useState(false);

  // Filtrar apenas colaboradores aprovados e ordenar alfabeticamente
  const sortedCollaborators = collaborators
    ?.filter(c => c.status === 'aprovado')
    ?.sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR', { sensitivity: 'base' })) || [];

  // Encontrar o colaborador selecionado
  const selectedCollaborator = sortedCollaborators.find(c => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid={testId}
        >
          <span className="truncate mr-2">
            {value === "all" ? "Todos os Colaboradores" : 
             selectedCollaborator ? fixEncoding(selectedCollaborator.fullName) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Buscar colaborador..." />
          <CommandList>
            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                key="all"
                value="all"
                onSelect={() => {
                  onValueChange("all");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "all" ? "opacity-100" : "opacity-0"
                  )}
                />
                Todos os Colaboradores
              </CommandItem>
              {sortedCollaborators.map((collaborator) => (
                <CommandItem
                  key={collaborator.id}
                  value={`${fixEncoding(collaborator.fullName)} ${collaborator.id}`}
                  onSelect={() => {
                    onValueChange(collaborator.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === collaborator.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {fixEncoding(collaborator.fullName)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}