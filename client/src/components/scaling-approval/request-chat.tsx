import { BudgetChat } from "@/components/budget-chat";

/** entityType gravado em budget_notes pelo servidor (server/scaling-validation.ts → addRequestNote). */
export const REQUEST_NOTE_ENTITY_TYPE = "scaling_change_request";

/**
 * Chat do pedido de ajuste — REUSA o BudgetChat (mesmos endpoints
 * GET/POST /api/budget-notes). O servidor aceita qualquer entityType; a prop
 * do BudgetChat só está tipada como 'planned' | 'actual' por herança do
 * Financeiro, por isso o cast localizado aqui (não alteramos budget-chat.tsx).
 * Os comentários das decisões (aprovar/reajustar/negar) já entram neste mesmo
 * fio pelo servidor, então o histórico aparece completo.
 */
export function RequestChat({ requestId, eventId }: { requestId: string; eventId?: string }) {
  return (
    <BudgetChat
      entityType={REQUEST_NOTE_ENTITY_TYPE as unknown as "planned"}
      entityId={requestId}
      eventId={eventId}
    />
  );
}

export default RequestChat;
