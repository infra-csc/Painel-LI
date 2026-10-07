/**
 * Vazio contextual da tela de Eventos (28/09, extraído de pages/events.tsx):
 * com filtros ativos oferece "Limpar filtros"; sem nenhum evento, "Novo evento".
 *
 * 07/10 (redesenho):
 *  - o vazio filtrado repete a busca ("Nenhum evento com “x”");
 *  - o recorte padrão (planejado + em andamento) vazio NÃO é "nenhum evento
 *    cadastrado" — dizia isso mesmo com dezenas de eventos concluídos; agora
 *    diz quantos existem e leva a "Todos os status";
 *  - "Novo evento" só para quem pode cadastrar — para o RH o botão abria um
 *    formulário que não podia ser salvo.
 */
import { CalendarCheck2, CalendarDays, CalendarX2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export function EventsEmpty({ hasFilters, onClear, onNew, busca, totalCadastrados = 0, onVerTodos }: {
  hasFilters: boolean;
  onClear: () => void;
  /** Sem ele (quem não cadastra), o vazio não oferece "Novo evento". */
  onNew?: () => void;
  /** A busca digitada — o vazio diz o que não foi achado. */
  busca?: string;
  /** Quantos eventos existem (com excluídos) — distingue "nada cadastrado" de "nada no recorte padrão". */
  totalCadastrados?: number;
  /** Mostra todos os status (sai do recorte padrão). */
  onVerTodos?: () => void;
}) {
  const q = busca?.trim();
  const novo = onNew ? <Button size="sm" onClick={onNew} className="rounded-lg"><Plus className="w-4 h-4" aria-hidden="true" /> Novo evento</Button> : null;
  if (hasFilters) return (
    <EmptyState
      variant="filtered"
      icon={CalendarX2}
      title={q ? <>Nenhum evento com “{q}”</> : "Nenhum evento neste recorte"}
      description={q ? "Confira a grafia ou procure pela cidade. Os filtros de status, mês e ano também valem." : "Nenhum evento corresponde aos filtros aplicados. Tente outro status, mês ou ano."}
      onClearFilters={onClear}
      className="pas-entra"
    />
  );
  if (totalCadastrados > 0) return (
    <EmptyState
      icon={CalendarCheck2}
      title="Nada planejado ou em andamento"
      description={`${totalCadastrados === 1 ? "O evento cadastrado já foi concluído ou excluído" : `Os ${totalCadastrados} eventos cadastrados já foram concluídos ou excluídos`}.`}
      action={<>
        {onVerTodos && <Button size="sm" variant="outline" onClick={onVerTodos} className="rounded-lg">Ver todos os status</Button>}
        {novo}
      </>}
      className="pas-entra"
    />
  );
  return (
    <EmptyState
      icon={CalendarDays}
      title="Nenhum evento cadastrado"
      description={onNew ? "Crie o primeiro evento para começar a montar o cronograma logístico." : "Os eventos aparecem aqui assim que Logística ou Compras cadastrarem."}
      action={novo ?? undefined}
      className="pas-entra"
    />
  );
}

export default EventsEmpty;
