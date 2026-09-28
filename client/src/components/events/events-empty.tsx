/**
 * Vazio contextual da tela de Eventos (28/09, extraído de pages/events.tsx):
 * com filtros ativos oferece "Limpar filtros"; sem nenhum evento, "Novo evento".
 */
import { CalendarDays, CalendarX2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export function EventsEmpty({ hasFilters, onClear, onNew }: { hasFilters: boolean; onClear: () => void; onNew: () => void }) {
  return hasFilters ? (
    <EmptyState
      variant="filtered"
      icon={CalendarX2}
      title="Nenhum evento encontrado"
      description="Nenhum evento corresponde à busca ou aos filtros aplicados."
      onClearFilters={onClear}
    />
  ) : (
    <EmptyState
      icon={CalendarDays}
      title="Nenhum evento cadastrado"
      description="Crie o primeiro evento para começar a montar o cronograma logístico."
      action={<Button size="sm" onClick={onNew}><Plus className="w-4 h-4" aria-hidden="true" /> Novo evento</Button>}
    />
  );
}

export default EventsEmpty;
