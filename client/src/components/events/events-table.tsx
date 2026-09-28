/**
 * Tabela de Eventos sobre o DataTable (28/09). Antes era uma tabela HTML própria
 * em pages/events.tsx com `<th role="button">` (sem botão de verdade) e um
 * modo cartão separado; agora as colunas são declaradas e o DataTable cuida da
 * ordenação acessível, do `caption` e da troca por cartões abaixo de `md`
 * (o cartão é o `EventCard`, o mesmo da visualização "Lista").
 */
import type { Event } from "@shared/schema";
import { MapPin } from "lucide-react";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { getEventStatus } from "@/lib/event-status";
import { EventRowActions, type EventRowActionsProps } from "./event-row-actions";
import { EventCard } from "./events-list";
import { EventStatusBadge, formatPeriod, type SortDir, type SortKey } from "./events-shared";

/** Chaves das colunas: as ordenáveis são `SortKey`; as demais só identificam a coluna. */
type ColKey = SortKey | "location" | "esc" | "acoes";

export interface EventsTableProps extends Omit<EventRowActionsProps, "event"> {
  events: Event[];
  escalacoes: Record<string, number>;
  sortKey: SortKey;
  sortDir: SortDir;
  handleSort: (k: SortKey) => void;
  empty: React.ReactNode;
}

export function EventsTable({ events, escalacoes, sortKey, sortDir, handleSort, empty, ...acoes }: EventsTableProps) {
  // No celular o DataTable devolve a lista de cartões — que não leva a moldura
  // (borda/sombra) da tabela; a antiga Lista também não levava.
  const isMobile = useIsMobile();
  if (events.length === 0) return <>{empty}</>;

  const columns: ColunaDaTabela<Event, ColKey>[] = [
    {
      key: "eventNumber", header: "Nº", width: 60, align: "center", sortable: true, papel: "oculta",
      cell: ev => <span className="text-2xs font-bold text-muted-foreground tabular-nums">#{ev.eventNumber}</span>,
    },
    {
      key: "name", header: "Evento", sortable: true, papel: "principal",
      cell: ev => (
        <div className="flex items-center gap-2">
          {getEventStatus(ev) === "em andamento" && <span className="animate-pulse motion-reduce:animate-none w-[7px] h-[7px] rounded-full bg-warning-strong shrink-0" />}
          <span className="text-sm font-semibold text-foreground">{ev.name}</span>
        </div>
      ),
    },
    {
      key: "location", header: "Localização", width: 170,
      cell: ev => (
        <span className="flex items-center gap-[5px] text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {ev.location}
        </span>
      ),
    },
    {
      key: "period", header: "Período", width: 140, sortable: true,
      cell: ev => <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatPeriod(ev.startDate, ev.endDate)}</span>,
    },
    { key: "status", header: "Status", width: 135, sortable: true, cell: ev => <EventStatusBadge ds={getEventStatus(ev)} /> },
    {
      key: "esc", header: "Escal.", width: 65, align: "center", headerTip: "Escalações ativas",
      cell: ev => {
        const esc = escalacoes[ev.id] ?? 0;
        return esc > 0
          ? <span className="text-xs font-bold text-slate-700">{esc}</span>
          : <span className="text-xs text-slate-200">—</span>;
      },
    },
    {
      key: "acoes", header: "", headerLabel: "Ações", width: 75, align: "right", papel: "acoes",
      cell: ev => (
        <div className="flex items-center justify-end gap-px opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
          <EventRowActions event={ev} {...acoes} />
        </div>
      ),
    },
  ];

  return (
    <div className={cn(!isMobile && "bg-card rounded-xl border border-border overflow-hidden shadow-1")}>
      <DataTable
        columns={columns}
        rows={events}
        getRowId={ev => ev.id}
        caption="Eventos cadastrados"
        density="compact"
        minWidthClassName="min-w-[720px]"
        sort={{ key: sortKey, dir: sortDir }}
        onSort={k => handleSort(k as SortKey)}
        // `group` liga o hover das ações; excluído fica esmaecido, como antes.
        rowClassName={ev => cn("group", getEventStatus(ev) === "excluído" && "opacity-50")}
        cardRender={ev => <EventCard ev={ev} escalacoes={escalacoes[ev.id] ?? 0} {...acoes} />}
      />
    </div>
  );
}

export default EventsTable;
