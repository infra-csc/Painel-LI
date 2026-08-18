import { BudgetChat } from "@/components/budget-chat";

/** entityType gravado em budget_notes pelo servidor (server/scaling-validation.ts → addRequestNote). */
export const REQUEST_NOTE_ENTITY_TYPE = "scaling_change_request";

/**
 * Conversa do pedido — REUSA o BudgetChat (mesmos endpoints GET/POST
 * /api/budget-notes). Os comentários das decisões (aprovar/reajustar/negar)
 * já entram neste mesmo fio pelo servidor, então o histórico aparece completo.
 * Aqui Enter quebra linha e Ctrl+Enter envia (mensagens tendem a ser mais longas).
 */
export function RequestChat({ requestId, eventId }: { requestId: string; eventId?: string }) {
  return (
    <BudgetChat
      entityType={REQUEST_NOTE_ENTITY_TYPE}
      entityId={requestId}
      eventId={eventId}
      title="Conversa do pedido"
      placeholder="Escreva para a área ou para o aprovador…"
      submitOnEnter={false}
    />
  );
}

export default RequestChat;
