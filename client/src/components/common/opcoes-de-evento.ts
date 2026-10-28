/**
 * Opções do seletor de evento das filas (Passagens, Hospedagem, Inclusão de
 * equipe) — 28/10, decisão do dono.
 *
 * Com um evento escolhido a lista vem só dele (`?eventId=`), então a tela não
 * sabe quantas linhas os OUTROS eventos teriam: contá-los exigiria baixar a
 * lista inteira. Em vez de mostrar 0 (mentira) ou sumir com eles (Passagens),
 * os outros aparecem SEM número (`n: null`); o escolhido continua com o dele.
 * Sem evento escolhido, tudo como antes.
 */
import type { Event } from "@shared/schema";
import type { OpcaoDeFiltro } from "./filter-popover";

const excluido = (e: Pick<Event, "status">) => e.status === "excluido" || e.status === "excluído";

export function opcoesDeEvento(
  eventos: readonly Pick<Event, "id" | "name" | "status">[] | undefined,
  /** Quantas linhas cada evento deixaria (a MESMA regra da lista). */
  porEvento: ReadonlyMap<string, number>,
  /** Evento(s) escolhido(s) no filtro; vazio = "todos". */
  escolhidos: readonly string[],
  opts: {
    /** Sem evento escolhido, lista só quem tem linha no recorte (Passagens). */
    somenteComLinhas?: boolean;
  } = {},
): OpcaoDeFiltro[] {
  const ativos = (eventos ?? []).filter((e) => !excluido(e));
  if (escolhidos.length === 0) {
    return ativos
      .filter((e) => !opts.somenteComLinhas || porEvento.has(e.id))
      .map((e) => ({ id: e.id, nome: e.name, n: porEvento.get(e.id) ?? 0 }));
  }
  const marcados = new Set(escolhidos);
  return ativos.map((e) => ({ id: e.id, nome: e.name, n: marcados.has(e.id) ? (porEvento.get(e.id) ?? 0) : null }));
}
