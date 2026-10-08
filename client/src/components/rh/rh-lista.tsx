// Lista da fila do Controle RH — redesenho 08/10.
//
// Uma tabela só, agrupada por evento: a régua (quantos eventos e itens, quanto
// somam, expandir/recolher todos), o cabeçalho das colunas que gruda abaixo
// da barra de contexto e, para cada evento, a faixa do grupo e as linhas. Na
// largura útil estreita (container query, < 880px) o cabeçalho some e cada
// linha vira um cartão — só CSS (crh-).
import { ChevronsDownUp, ChevronsUpDown, Loader2 } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import type { EventGroup } from "./prestacao-types";
import { RhEventGroup, type RhEventGroupProps } from "./rh-event-group";

export interface RhListaProps extends Omit<RhEventGroupProps, "group" | "isOpen" | "onToggle"> {
  eventGroups: EventGroup[];
  totalItens: number;
  expandedEvents: Set<string>;
  onToggleEvent: (eventId: string) => void;
  onExpandirTudo: () => void;
  onRecolherTudo: () => void;
  /** Já há lista e o servidor está devolvendo outro recorte. */
  atualizando: boolean;
}

export function RhLista({ eventGroups, totalItens, expandedEvents, onToggleEvent, onExpandirTudo, onRecolherTudo, atualizando, ...linha }: RhListaProps) {
  const tudoAberto = eventGroups.length > 0 && eventGroups.every(g => expandedEvents.has(g.event.id));
  const soma = eventGroups.reduce((s, g) => s + g.items.reduce((t, i) => (i.planned?.didNotAttend || i.actual?.didNotAttend) ? t : t + (i.actual?.totalValue ?? i.planned?.totalValue ?? 0), 0), 0);

  return (
    // `atualizando`: trocar evento/recorte mantém a lista anterior esmaecida
    // até o novo recorte chegar (placeholderData), em vez de piscar o esqueleto.
    <div id="rh-listing" className={`crh-lista transition-opacity duration-150 ${atualizando ? "opacity-60" : ""}`} aria-busy={atualizando}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 min-h-8">
        <p className="m-0 text-xs text-muted-foreground tabular-nums" aria-live="polite">
          <span className="font-medium text-slate-600">Por evento</span>
          <span className="ml-2">{eventGroups.length} evento{eventGroups.length !== 1 ? "s" : ""} · {totalItens} ite{totalItens === 1 ? "m" : "ns"}</span>
          <span className="hidden sm:inline"> · {formatarMoeda(soma)}</span>
        </p>
        {atualizando && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status">
            <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Atualizando…
          </span>
        )}
        <button
          type="button"
          onClick={tudoAberto ? onRecolherTudo : onExpandirTudo}
          aria-expanded={tudoAberto}
          className="pas-alvo ml-auto inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
          data-testid="rh-expandir-eventos"
        >
          {tudoAberto ? <ChevronsDownUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronsUpDown className="w-3.5 h-3.5" aria-hidden="true" />}
          {tudoAberto ? "Recolher tudo" : "Expandir tudo"}
        </button>
      </div>

      <div className="crh-tabela">
        <div className="crh-cabecalho" aria-hidden="true">
          <span>Colaborador</span>
          <span>Etapa</span>
          <span>Prazo</span>
          <span className="crh-num">Valor</span>
          <span>Nota fiscal</span>
          <span>Próxima ação</span>
          <span />
        </div>
        {eventGroups.map(group => (
          <RhEventGroup
            key={group.event.id}
            group={group}
            isOpen={expandedEvents.has(group.event.id)}
            onToggle={onToggleEvent}
            {...linha}
          />
        ))}
      </div>
    </div>
  );
}
