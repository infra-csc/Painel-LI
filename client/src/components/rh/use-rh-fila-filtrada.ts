// Extraído de rh-control.tsx em 25/09 (modularização): aplica os filtros da
// UI sobre a fila e agrupa por evento.
//
// Desde o endpoint agregado (25/09) evento e status — inclusive os quatro
// card-filtros rh_action/col_action/nf_andamento/concluidos — são resolvidos
// pelo servidor (`linhaPassaNoFiltro` em shared/controle-rh). Aqui ficam só os
// filtros baratos sobre a lista já enxuta: busca por colaborador, função,
// "colaborador a definir", status da NF, "só check-ins" e a regra de esconder
// concluídos/recusados por padrão.
import { useMemo } from "react";
import { ACTIONABLE_STATUSES, type EventGroup, type PrestacaoItem } from "./prestacao-types";
import { getDiffDays } from "./prestacao-utils";
import type { RhControlData } from "./use-rh-control-data";
import type { RhFiltros } from "./use-rh-filtros";

export interface RhFilaFiltrada {
  filteredItems: PrestacaoItem[];
  eventGroups: EventGroup[];
}

/** "Concluído" = aprovada_faturamento + NF aprovada + check-in realizado (checkinAt). */
const estaConcluida = (item: PrestacaoItem) =>
  item.status === "aprovada_faturamento" && item.invoice?.status === "aprovada" && !!item.invoice?.checkinAt;

export function useRhFilaFiltrada(
  dados: Pick<RhControlData, "prestacaoItems">,
  filtros: Pick<RhFiltros, "filterStatus" | "filterFunction" | "filterCollaborator" | "filterInvoiceStatus" | "buscaAplicada" | "showConcluded" | "filterCheckinOnly">,
): RhFilaFiltrada {
  const { prestacaoItems } = dados;
  const { filterStatus, filterFunction, filterCollaborator, filterInvoiceStatus, buscaAplicada, showConcluded, filterCheckinOnly } = filtros;

  const filteredItems = useMemo(() => {
    const busca = buscaAplicada.trim().toLowerCase();
    return prestacaoItems.filter(item => {
      // Sem status escolhido, concluídos E recusados ficam ocultos por padrão
      // (manual); com o toggle ligado eles são ACRESCENTADOS à lista (mostra
      // tudo), não substituem. Com um status/card ativo o servidor já decidiu.
      if (filterStatus === "all" && filterInvoiceStatus === "all" && !showConcluded) {
        if (estaConcluida(item) || item.status === "recusada") return false;
      }
      if (filterFunction !== "all" && item.functionId !== filterFunction) return false;
      if (filterCollaborator === "a_definir" && item.collaboratorId) return false;
      if (filterCollaborator === "definido" && !item.collaboratorId) return false;
      if (filterInvoiceStatus !== "all") {
        // Mesma regra de elegibilidade dos contadores (isNfEligible, resolvida
        // pelo servidor em `nfElegivel`): NF liberada com o envio do Realizado.
        if (!item.actual || !item.nfElegivel) return false;
        if ((item.invoice?.status || "pendente") !== filterInvoiceStatus) return false;
      }
      if (busca && !(item.collaboratorName ?? "-").toLowerCase().includes(busca)) return false;
      if (filterCheckinOnly) {
        const inv = item.invoice;
        const isCheckinPending = item.status === "aprovada_faturamento" && inv?.status === "aprovada" && !inv?.checkinAt;
        if (!isCheckinPending) return false;
      }
      return true;
    });
  }, [prestacaoItems, filterStatus, filterFunction, filterCollaborator, filterInvoiceStatus, buscaAplicada, showConcluded, filterCheckinOnly]);

  const eventGroups = useMemo((): EventGroup[] => {
    const map = new Map<string, EventGroup>();
    for (const item of filteredItems) {
      const eid = item.event.id;
      if (!map.has(eid)) {
        map.set(eid, { event: item.event, items: [], actionNeeded: 0 });
      }
      const g = map.get(eid)!;
      g.items.push(item);
      if (ACTIONABLE_STATUSES.includes(item.status)) g.actionNeeded++;
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      if (b.actionNeeded !== a.actionNeeded) return b.actionNeeded - a.actionNeeded;
      const maxStalledA = Math.max(...a.items.map(i => getDiffDays(i.lastActivityDate)), 0);
      const maxStalledB = Math.max(...b.items.map(i => getDiffDays(i.lastActivityDate)), 0);
      return maxStalledB - maxStalledA;
    });
    return groups;
  }, [filteredItems]);

  return { filteredItems, eventGroups };
}
