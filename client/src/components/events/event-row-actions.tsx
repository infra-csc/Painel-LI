/**
 * Ações de uma linha/cartão de evento (28/09, extraído de pages/events.tsx):
 * Editar (ou Ver, para quem não cadastra), Excluir (só admin) e Restaurar
 * (evento excluído). Usado pela tabela, pelo cartão do celular e pela Lista.
 *
 * 07/10 (redesenho): botões de 32px (44px no toque) acima do clique da linha
 * (`relative z-[1]`), lápis no lugar do ícone de "caixa com caneta", e
 * Restaurar com rótulo — é a única ação de um excluído e merece ser lida.
 */
import { Eye, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Event } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getEventStatus } from "@/lib/event-status";
import { ACTION_BTN } from "./events-shared";

export interface EventRowActionsProps {
  event: Event;
  onEdit: (e: Event) => void;
  /** Sem ele, o botão Excluir não aparece (só administrador, 18/09). */
  onDelete?: (e: Event) => void;
  onRestore: (e: Event) => void;
  busy?: boolean;
  podeEditar?: boolean;
}

export function EventRowActions({ event, onEdit, onDelete, onRestore, busy, podeEditar = true }: EventRowActionsProps) {
  const ds = getEventStatus(event);
  if (ds === "excluído") return (
    <button type="button" onClick={() => onRestore(event)} disabled={busy} aria-label={`Restaurar evento ${event.name}`}
      className="pas-alvo relative z-[1] inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-700 border border-border bg-card transition-colors hover:border-success/40 hover:bg-success-soft hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed">
      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />Restaurar
    </button>
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onEdit(event)} aria-label={podeEditar ? `Editar evento ${event.name}` : `Ver evento ${event.name}`}
            className={cn(ACTION_BTN, "evt-acao hover:bg-brand-soft hover:text-primary")}>
            {podeEditar ? <Pencil className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        </TooltipTrigger><TooltipContent>{podeEditar ? "Editar" : "Ver"}</TooltipContent>
      </Tooltip>
      {/* Excluir: só administrador (18/09). Sem a função, o botão não aparece. */}
      {onDelete && <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onDelete?.(event)} disabled={busy} aria-label={`Excluir evento ${event.name}`}
            className={cn(ACTION_BTN, "evt-acao hover:bg-danger-soft hover:text-danger-strong")}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
        </TooltipTrigger><TooltipContent>Excluir</TooltipContent>
      </Tooltip>}
    </>
  );
}

export default EventRowActions;
