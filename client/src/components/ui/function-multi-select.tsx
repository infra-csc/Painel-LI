import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

  const toggleFunction = (functionId: string) => {
    if (selectedIds.includes(functionId)) {
      onSelectedChange(selectedIds.filter(id => id !== functionId));
    } else {
      onSelectedChange([...selectedIds, functionId]);
    }
  };

  const clearAll = () => {
    onSelectedChange([]);
  };

  const selectedFunctions = functions?.filter(f => selectedIds.includes(f.id)) || [];
  const displayText = selectedFunctions.length > 0
    ? `${selectedFunctions.length} função${selectedFunctions.length > 1 ? 'ões' : ''} selecionada${selectedFunctions.length > 1 ? 's' : ''}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 font-normal"
          data-testid={testId}
        >
          <span className="truncate">{displayText}</span>
          <div className="flex items-center gap-1 ml-2">
            {selectedIds.length > 0 && (
              <Badge 
                variant="secondary" 
                className="rounded-sm px-1 font-normal"
              >
                {selectedIds.length}
              </Badge>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="max-h-[300px] overflow-y-auto">
          <div className="p-2 border-b">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Funções</span>
              {selectedIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={clearAll}
                >
                  Limpar
                </Button>
              )}
            </div>
            {selectedFunctions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedFunctions.map((func) => (
                  <Badge
                    key={func.id}
                    variant="secondary"
                    className="text-xs flex items-center gap-1"
                  >
                    {func.name}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFunction(func.id);
                      }}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="p-2">
            {functions?.map((func) => (
              <div
                key={func.id}
                className={cn(
                  "flex items-center gap-2 p-2 cursor-pointer rounded-sm hover:bg-accent",
                  selectedIds.includes(func.id) && "bg-accent"
                )}
                onClick={() => toggleFunction(func.id)}
              >
                <div
                  className={cn(
                    "h-4 w-4 border rounded-sm flex items-center justify-center",
                    selectedIds.includes(func.id)
                      ? "bg-primary border-primary"
                      : "border-input"
                  )}
                >
                  {selectedIds.includes(func.id) && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
                <span className="text-sm flex-1">{func.name}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
