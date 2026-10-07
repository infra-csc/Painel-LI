/**
 * Tabela de Eventos sobre o DataTable (28/09). Antes era uma tabela HTML própria
 * em pages/events.tsx com `<th role="button">` (sem botão de verdade) e um
 * modo cartão separado; agora as colunas são declaradas e o DataTable cuida da
 * ordenação acessível, do `caption` e da troca por cartões abaixo de `md`
 * (o cartão é o `EventCard`, o mesmo da visualização "Lista").
 *
 * 07/10 (redesenho), na família de Passagens/Hospedagem:
 *  - Nº como etiqueta da marca; evento e local na MESMA célula (o local em
 *    coluna própria quebrava em duas linhas em 1366 e empurrava a altura);
 *  - Período com "quando acontece" por extenso embaixo (começa em 2 dias…);
 *  - Escalações com rótulo inteiro (era "Escal.") e alinhadas à direita;
 *  - a linha inteira abre o evento (o nome é o botão; o ::after cobre a
 *    linha) e as ações ficam à vista, discretas — só apareciam no hover, e no
 *    toque/teclado ninguém sabia que existiam;
 *  - cabeçalho grudado abaixo da barra da tela ao rolar;
 *  - a troca tabela ↔ cartões segue a LARGURA ÚTIL (useLarguraUtil), não a
 *    janela: em tablet e com o menu aberto em telas médias a tabela de 720px
 *    rolava de lado e escondia as ações — lá viram cartões em duas colunas;
 *  - em telas largas o local volta a ter coluna própria (a coluna do evento
 *    ficava com metade da tabela vazia em 1920).
 */
import type { Event } from "@shared/schema";
import { MapPin } from "lucide-react";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { getEventStatus } from "@/lib/event-status";
import { EventRowActions, type EventRowActionsProps } from "./event-row-actions";
import { EventCard } from "./events-list";
import { EventStatusBadge, formatPeriod, quandoAcontece, type SortDir, type SortKey } from "./events-shared";

/** Chaves das colunas: as ordenáveis são `SortKey`; as demais só identificam a coluna. */
type ColKey = SortKey | "location" | "esc" | "acoes";

/** Abaixo disto a tabela (720px) não cabe sem rolar de lado: cartões. */
const LARGURA_MINIMA_DA_TABELA = 860;
/** A partir disto o local ganha coluna própria. */
const LARGURA_DO_LOCAL_EM_COLUNA = 1280;

export interface EventsTableProps extends Omit<EventRowActionsProps, "event"> {
  events: Event[];
  escalacoes: Record<string, number>;
  sortKey: SortKey;
  sortDir: SortDir;
  handleSort: (k: SortKey) => void;
  empty: React.ReactNode;
}

export function EventsTable({ events, escalacoes, sortKey, sortDir, handleSort, empty, ...acoes }: EventsTableProps) {
  // Em cartões (celular, tablet, menu aberto em tela média) não há a moldura
  // (borda/sombra) da tabela — cada cartão tem a sua.
  const isMobile = useIsMobile();
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  const emCartoes = isMobile || (largura !== null && largura < LARGURA_MINIMA_DA_TABELA);
  const localEmColuna = largura !== null && largura >= LARGURA_DO_LOCAL_EM_COLUNA;
  // O contêiner medido existe sempre (também no vazio): sem ele a medição não começa.
  if (events.length === 0) return <div ref={ref}>{empty}</div>;

  const columns: ColunaDaTabela<Event, ColKey>[] = [
    {
      key: "eventNumber", header: "Nº", width: 76, sortable: true, papel: "oculta",
      cell: ev => (
        <span className="inline-flex items-center h-[22px] px-1.5 rounded-md bg-brand-soft text-2xs font-semibold font-mono text-primary tabular-nums">
          #{ev.eventNumber}
        </span>
      ),
    },
    {
      key: "name", header: "Evento", sortable: true, papel: "principal",
      cell: ev => {
        const excluido = getEventStatus(ev) === "excluído";
        return (
          <div className="min-w-0 py-0.5">
            {excluido ? (
              <span className="block text-sm font-semibold leading-5 text-muted-foreground line-through decoration-muted-foreground/50">{ev.name}</span>
            ) : (
              <button type="button" onClick={() => acoes.onEdit(ev)} className="evt-abrir block max-w-full text-left text-sm font-semibold leading-5 text-foreground rounded-sm focus-visible:outline-none">
                {ev.name}
              </button>
            )}
            {!localEmColuna && (
              <span className="mt-0.5 flex items-start gap-1 text-xs leading-[18px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate" title={ev.location}>{ev.location}</span>
              </span>
            )}
          </div>
        );
      },
    },
    ...(localEmColuna ? [{
      key: "location" as const, header: "Local", width: 300,
      cell: (ev: Event) => (
        <span className="flex items-start gap-1.5 text-sm leading-5 text-slate-600">
          <MapPin className="h-3.5 w-3.5 mt-[3px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">{ev.location}</span>
        </span>
      ),
    }] : []),
    {
      key: "period", header: "Período", width: 172, sortable: true,
      cell: ev => {
        const ds = getEventStatus(ev);
        const quando = quandoAcontece(ev);
        return (
          <div className="leading-5">
            <span className="block text-sm text-foreground tabular-nums whitespace-nowrap">{formatPeriod(ev.startDate, ev.endDate)}</span>
            {quando && <span className={cn("block text-xs leading-[18px] whitespace-nowrap", ds === "em andamento" ? "text-primary font-medium" : "text-muted-foreground")}>{quando}</span>}
          </div>
        );
      },
    },
    { key: "status", header: "Status", width: 148, sortable: true, cell: ev => <EventStatusBadge ds={getEventStatus(ev)} /> },
    {
      key: "esc", header: "Escalações", width: 112, align: "right", headerTip: "Escalações ativas do evento (sem as sugestões)",
      cell: ev => {
        const esc = escalacoes[ev.id] ?? 0;
        return esc > 0
          ? <span className="text-sm font-semibold text-foreground tabular-nums">{esc}</span>
          : <span className="text-sm text-muted-foreground/50" aria-label="Nenhuma">—</span>;
      },
    },
    {
      key: "acoes", header: "", headerLabel: "Ações", width: 104, align: "right", papel: "acoes",
      cell: ev => (
        <div className="flex items-center justify-end gap-0.5">
          <EventRowActions event={ev} {...acoes} />
        </div>
      ),
    },
  ];

  return (
    <div ref={ref}>
    <div className={cn(!emCartoes && "evt-moldura bg-card rounded-xl border border-border shadow-1")}>
      <DataTable
        columns={columns}
        rows={events}
        getRowId={ev => ev.id}
        caption="Eventos cadastrados"
        density="compact"
        minWidthClassName="min-w-[720px]"
        className="evt-rolagem"
        tableClassName="evt-tabela"
        sort={{ key: sortKey, dir: sortDir }}
        onSort={k => handleSort(k as SortKey)}
        // `evt-linha`: o clique da linha inteira (::after do nome) e as ações discretas até o hover.
        rowClassName={ev => cn("evt-linha", getEventStatus(ev) === "excluído" && "evt-excluido")}
        cardMode={emCartoes ? "always" : "never"}
        cardListClassName={cn("gap-3", !isMobile && "grid grid-cols-2")}
        cardRender={ev => <EventCard ev={ev} escalacoes={escalacoes[ev.id] ?? 0} {...acoes} />}
      />
    </div>
    </div>
  );
}

export default EventsTable;
