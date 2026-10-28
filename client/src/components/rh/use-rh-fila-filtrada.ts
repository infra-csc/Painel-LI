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
import type { FiltroDePrazo, RhFiltros } from "./use-rh-filtros";
import { urgenciaDoPrazo } from "@shared/prazos-honorarios";

export interface RhFilaFiltrada {
  filteredItems: PrestacaoItem[];
  eventGroups: EventGroup[];
}

/** "Concluído" = aprovada_faturamento + NF aprovada + check-in realizado (checkinAt). */
export const estaConcluida = (item: PrestacaoItem) =>
  // 26/10: o legado concluído fora do fluxo também é "concluído" (some por padrão).
  !!item.conclusaoForaDoFluxo ||
  (item.status === "aprovada_faturamento" && item.invoice?.status === "aprovada" && !!item.invoice?.checkinAt);

/** A linha passa no filtro de prazo (28/10)? Pelo PIOR prazo dela — o mesmo que conta no chip. */
export function passaNoFiltroDePrazo(item: Pick<PrestacaoItem, "prazo" | "contestacao">, filtro: FiltroDePrazo): boolean {
  if (filtro === "all") return true;
  if (filtro === "contestacoes") return !!item.contestacao && !item.contestacao.respondida;
  const s = item.prazo?.pior?.situacao;
  return filtro === "atrasados" ? s === "atrasado" : s === "vence_hoje";
}

/** Urgência da linha para "mais atrasado primeiro" (sem prazo vai para o fim). */
export const urgenciaDaLinha = (item: Pick<PrestacaoItem, "prazo">) => urgenciaDoPrazo(item.prazo?.pior);

export function useRhFilaFiltrada(
  dados: Pick<RhControlData, "prestacaoItems">,
  filtros: Pick<RhFiltros, "filterStatus" | "filterFunction" | "filterCollaborator" | "filterInvoiceStatus" | "buscaAplicada" | "showConcluded" | "filterCheckinOnly">
    & Partial<Pick<RhFiltros, "filtroPrazo" | "ordem">>,
): RhFilaFiltrada {
  const { prestacaoItems } = dados;
  const { filterStatus, filterFunction, filterCollaborator, filterInvoiceStatus, buscaAplicada, showConcluded, filterCheckinOnly } = filtros;
  const filtroPrazo = filtros.filtroPrazo ?? "all";
  // "Atrasados" já ordena pelo mais atrasado (é o que se quer cobrar primeiro).
  const porAtraso = filtros.ordem === "atraso" || filtroPrazo === "atrasados";

  const filteredItems = useMemo(() => {
    const busca = buscaAplicada.trim().toLowerCase();
    const lista = prestacaoItems.filter(item => {
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
      if (!passaNoFiltroDePrazo(item, filtroPrazo)) return false;
      return true;
    });
    // Mais atrasado primeiro (28/10): estável — empate mantém a ordem do servidor.
    return porAtraso ? lista.map((item, i) => ({ item, i, u: urgenciaDaLinha(item) })).sort((a, b) => (b.u - a.u) || (a.i - b.i)).map((x) => x.item) : lista;
  }, [prestacaoItems, filterStatus, filterFunction, filterCollaborator, filterInvoiceStatus, buscaAplicada, showConcluded, filterCheckinOnly, filtroPrazo, porAtraso]);

  const eventGroups = useMemo((): EventGroup[] => {
    const map = new Map<string, EventGroup>();
    for (const item of filteredItems) {
      const eid = item.event.id;
      if (!map.has(eid)) {
        map.set(eid, { event: item.event, items: [], actionNeeded: 0, rhNeeded: 0 });
      }
      const g = map.get(eid)!;
      g.items.push(item);
      if (ACTIONABLE_STATUSES.includes(item.status)) g.actionNeeded++;
      if (item.rhPrecisaAgir) g.rhNeeded++;
    }
    const groups = Array.from(map.values());
    if (porAtraso) {
      const maior = (g: EventGroup) => Math.max(...g.items.map(urgenciaDaLinha));
      return groups.sort((a, b) => maior(b) - maior(a));
    }
    groups.sort((a, b) => {
      if (b.actionNeeded !== a.actionNeeded) return b.actionNeeded - a.actionNeeded;
      const maxStalledA = Math.max(...a.items.map(i => getDiffDays(i.lastActivityDate)), 0);
      const maxStalledB = Math.max(...b.items.map(i => getDiffDays(i.lastActivityDate)), 0);
      return maxStalledB - maxStalledA;
    });
    return groups;
  }, [filteredItems, porAtraso]);

  return { filteredItems, eventGroups };
}
