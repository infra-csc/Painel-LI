/**
 * Filtro + ordenação da lista da Escalação (25/09 — extraído de
 * use-scaling-data.ts). Função pura: recebe a lista já recortada pela
 * permissão, os filtros, a ordenação e os resolvedores de nome.
 */
import type { SortConfig } from "@/components/common/sortable-header";
import type { TeamInclusion } from "@shared/schema";
import { getScalingStatusLabel } from "./scaling-status";
import { isEscalated } from "./scaling-utils";
import type { ScalingFilters } from "./scaling-data-types";

/**
 * Um comparador só, criado uma vez.
 *
 * `String.localeCompare` monta um Intl.Collator novo a cada chamada. Num sort
 * de 3.700 linhas são ~45 mil chamadas, e a tela congelava perto de dois
 * segundos a cada clique de ordenação.
 */
const COLLATOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export interface ResolvedoresDeNome {
  getEventName: (eventId: string | null) => string;
  getFunctionName: (functionId: string | null) => string;
  getCollaboratorName: (collaboratorId?: string | null) => string;
  getCollaboratorCity: (collaboratorId?: string | null) => string | null;
  purchasedTicketByInclusion: Map<string, unknown>;
  accommodationByInclusion: Map<string, unknown>;
}

export function filtrarEOrdenarVagas(
  filteredTeamInclusions: TeamInclusion[],
  filters: ScalingFilters,
  sortConfig: SortConfig | null,
  h: ResolvedoresDeNome,
): TeamInclusion[] {
  const { getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity, purchasedTicketByInclusion, accommodationByInclusion } = h;
  // Busca por ID, colaborador, função, evento ou cidade (normalizada uma vez)
  const q = filters.searchId.replace(/#/g, "").trim().toLowerCase();
  const filtered = filteredTeamInclusions.filter(inclusion => {
    // Seleção múltipla: dentro de um mesmo filtro os valores marcados somam
    // (OU) — basta a linha casar com UM deles; entre filtros continua E.
    if (filters.eventId.length > 0 && !filters.eventId.includes(inclusion.eventId)) return false;
    if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
    if (filters.collaboratorId.length > 0 && (!inclusion.collaboratorId || !filters.collaboratorId.includes(inclusion.collaboratorId))) return false;

    if (filters.escalationStatus.length > 0) {
      const escalated = isEscalated(inclusion);
      const isCanceled = inclusion.status === "cancelado";
      const matches = filters.escalationStatus.some((v) =>
        v === "pending" ? (!escalated && !isCanceled)
        : v === "escalated" ? (escalated && !isCanceled && inclusion.status !== "aguardando_producao")
        : v === "aguardando_producao" ? inclusion.status === "aguardando_producao"
        : v === "cancelado" ? isCanceled
        : false,
      );
      if (!matches) return false;
    }

    // Passagem: "needs/no-need" cortam pela NECESSIDADE (needsTicket);
    // "purchased/not-purchased" olham o registro da compra (purchaseDate).
    if (filters.ticketStatus.length > 0) {
      const purchased = purchasedTicketByInclusion.has(inclusion.id);
      const matches = filters.ticketStatus.some((v) =>
        v === "needs" ? inclusion.needsTicket
        : v === "no-need" ? !inclusion.needsTicket
        : v === "purchased" ? purchased
        : v === "not-purchased" ? !purchased
        : false,
      );
      if (!matches) return false;
    }

    if (filters.accommodationStatus.length > 0) {
      const hasAccommodation = accommodationByInclusion.has(inclusion.id);
      const matches = filters.accommodationStatus.some((v) =>
        v === "needs" ? inclusion.needsAccommodation
        : v === "no-need" ? !inclusion.needsAccommodation
        : v === "reserved" ? hasAccommodation
        : v === "not-reserved" ? !hasAccommodation
        : false,
      );
      if (!matches) return false;
    }

    if (!q) return true;
    // Empreita por empresa (10/09): a busca acha pelo nome da empresa.
    const collaboratorName = inclusion.collaboratorId ? getCollaboratorName(inclusion.collaboratorId).toLowerCase() : (inclusion.empreitaEmpresa ?? "").toLowerCase();
    const city = (inclusion.city || getCollaboratorCity(inclusion.collaboratorId) || "").toLowerCase();
    return (
      String(inclusion.inclusionNumber ?? "").toLowerCase().includes(q) ||
      collaboratorName.includes(q) ||
      getFunctionName(inclusion.functionId).toLowerCase().includes(q) ||
      getEventName(inclusion.eventId).toLowerCase().includes(q) ||
      city.includes(q)
    );
  });

  /**
   * Ordena por CHAVE pré-computada.
   *
   * O comparador antigo chamava getCollaboratorName/getEventName dentro do
   * sort — e getCollaboratorName passa por fixEncoding, que reprocessa a
   * string inteira. Numa lista de 3.700 linhas isso rodava ~45 mil vezes por
   * clique. Calcular a chave uma vez por linha troca isso por 3.700.
   */
  const ordenarPorChave = <T,>(
    itens: TeamInclusion[],
    chave: (i: TeamInclusion) => T,
    compara: (a: T, b: T) => number,
    multiplier: number,
  ) => itens
    .map((item, idx) => ({ item, idx, k: chave(item) }))
    // idx como desempate mantém a ordem estável entre iguais — sem ele, duas
    // linhas equivalentes trocavam de lugar a cada rerender.
    .sort((a, b) => { const r = compara(a.k, b.k) * multiplier; return r !== 0 ? r : a.idx - b.idx; })
    .map((x) => x.item);

  if (sortConfig) {
    const { field, direction } = sortConfig;
    const multiplier = direction === "asc" ? 1 : -1;
    switch (field) {
      case "id":
        return ordenarPorChave(filtered, (i) => i.inclusionNumber || 0, (a, b) => a - b, multiplier);
      case "event":
        return ordenarPorChave(filtered, (i) => getEventName(i.eventId), COLLATOR.compare, multiplier);
      case "function":
        return ordenarPorChave(filtered, (i) => getFunctionName(i.functionId), COLLATOR.compare, multiplier);
      // Vaga sem nome vai SEMPRE para o fim, nos DOIS sentidos: ordenar por
      // colaborador é procurar uma pessoa, e "Não escalado" alfabetizado no
      // "N" enfia o que não tem nome no meio de quem tem. A checagem vem
      // antes da direção, senão inverter a ordem traria as vazias para cima.
      case "collaborator":
        return filtered
          .map((item, idx) => ({ item, idx, k: item.collaboratorId ? getCollaboratorName(item.collaboratorId) : (item.empreitaEmpresa ?? "") }))
          .sort((a, b) => {
            const semA = a.k ? 0 : 1;
            const semB = b.k ? 0 : 1;
            if (semA !== semB) return semA - semB;
            const r = COLLATOR.compare(a.k, b.k) * multiplier;
            return r !== 0 ? r : a.idx - b.idx;
          })
          .map((x) => x.item);
      case "period":
        return ordenarPorChave(filtered, (i) => i.scheduleStartDate ?? null,
          (a, b) => (!a && !b ? 0 : !a ? 1 : !b ? -1 : (a < b ? -1 : a > b ? 1 : 0)), multiplier);
      // A coluna Situação passou a ser ordenável no redesenho (01/09).
      // Ordena pelo RÓTULO, que é o que a pessoa lê — não pelo status
      // gravado, cujos nomes internos não têm ordem que signifique nada.
      case "status":
        return ordenarPorChave(filtered, (i) => getScalingStatusLabel(i), COLLATOR.compare, multiplier);
      default:
        return filtered;
    }
  }

  // Default: Evento → Função → Data
  return ordenarPorChave(
    filtered,
    (i) => `${getEventName(i.eventId)}\u0000${getFunctionName(i.functionId)}\u0000${i.scheduleStartDate ?? "9999"}`,
    COLLATOR.compare,
    1,
  );
}
