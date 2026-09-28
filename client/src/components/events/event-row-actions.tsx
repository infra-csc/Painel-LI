/**
 * Ações de uma linha/cartão de evento (28/09, extraído de pages/events.tsx):
 * Editar (ou Ver, para quem não cadastra), Excluir (só admin) e Restaurar
 * (evento excluído). Usado pela tabela, pelo cartão do celular e pela Lista.
 */
import { Edit, Eye, RotateCcw, Trash2 } from "lucide-react";
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
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={() => onRestore(event)} disabled={busy} aria-label={`Restaurar evento ${event.name}`}
          className={cn(ACTION_BTN, "hover:bg-success-soft hover:text-success")}><RotateCcw size={13} aria-hidden="true" /></button>
      </TooltipTrigger><TooltipContent>Restaurar</TooltipContent>
    </Tooltip>
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onEdit(event)} aria-label={podeEditar ? `Editar evento ${event.name}` : `Ver evento ${event.name}`}
            className={cn(ACTION_BTN, "hover:bg-brand-soft hover:text-primary")}>{podeEditar ? <Edit size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}</button>
        </TooltipTrigger><TooltipContent>{podeEditar ? "Editar" : "Ver"}</TooltipContent>
      </Tooltip>
      {/* Excluir: só administrador (18/09). Sem a função, o botão não aparece. */}
      {onDelete && <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onDelete?.(event)} disabled={busy} aria-label={`Excluir evento ${event.name}`}
            className={cn(ACTION_BTN, "hover:bg-danger-soft hover:text-danger-strong")}><Trash2 size={13} aria-hidden="true" /></button>
        </TooltipTrigger><TooltipContent>Excluir</TooltipContent>
      </Tooltip>}
    </>
  );
}

export default EventRowActions;
