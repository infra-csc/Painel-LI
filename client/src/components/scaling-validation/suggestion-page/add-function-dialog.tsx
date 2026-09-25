/**
 * "Adicionar função" (multi-seleção) da Sugestão de escala (25/09 — extraído da página).
 */
import { Check } from "lucide-react";
import type { Function as FunctionType } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { SuggestionGridEdit } from "./use-suggestion-grid-edit";

export function AddFunctionDialog({ edit, sortedFunctions }: { edit: SuggestionGridEdit; sortedFunctions: FunctionType[] }) {
  const { showAddFunction, setShowAddFunction, selectedToAdd, toggleToAdd, presentFunctionIds, missingFunctionsCount, addAllFunctions, addSelectedFunctions } = edit;
  return (
    <Dialog open={showAddFunction} onOpenChange={(o) => { if (!o) setShowAddFunction(false); }}>
      {/* min-w-0 nos filhos do grid: o rodapé com três botões forçava a
          largura mínima do diálogo além da caixa e o overflow-hidden cortava
          descrição, badge e botão (04/09). */}
      <DialogContent className="max-w-lg p-0 overflow-hidden w-[calc(100%-2rem)] rounded-xl sm:w-full [&>*]:min-w-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Adicionar funções à grade</DialogTitle>
          <DialogDescription>Marque uma ou mais funções. A mesma função pode entrar mais de uma vez (ex.: turmas com dias de viagem diferentes).</DialogDescription>
        </DialogHeader>
        <Command className="border-t border-border">
          <CommandInput placeholder="Buscar função…" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Nenhuma função encontrada.</CommandEmpty>
            <CommandGroup>
              {sortedFunctions.map((f) => {
                const checked = selectedToAdd.has(f.id);
                return (
                  <CommandItem key={f.id} value={f.name} onSelect={() => toggleToAdd(f.id)} data-checked={checked || undefined} className="gap-2">
                    <span aria-hidden="true" className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "bg-primary border-primary text-primary-foreground" : "border-slate-300 bg-card")}>
                      {checked && <Check className="h-3 w-3" aria-hidden="true" />}
                    </span>
                    <span className="flex-1 truncate">{f.name}</span>
                    {/* Badge, não texto solto: "na grade" lia como parte do nome da função. */}
                    {presentFunctionIds.has(f.id) && <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-2xs font-semibold text-primary">já na grade</span>}
                    {f.responsibleArea && <span className="text-xs text-muted-foreground shrink-0">{f.responsibleArea}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <DialogFooter className="flex flex-row flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-border sm:justify-between">
          {/* Com a contagem o botão diz o que vai acontecer; com 0 não há o que adicionar. */}
          <Button type="button" variant="ghost" size="sm" className="rounded-lg" disabled={missingFunctionsCount === 0} onClick={addAllFunctions}>
            Adicionar todas que faltam ({missingFunctionsCount})
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setShowAddFunction(false)}>Cancelar</Button>
            <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" disabled={selectedToAdd.size === 0} onClick={addSelectedFunctions}>
              Adicionar{selectedToAdd.size > 0 ? ` (${selectedToAdd.size})` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
