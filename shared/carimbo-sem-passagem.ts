/**
 * "Marcar como emitida" numa vaga SEM passagem (22/10 — vaga #4724, Blue Run
 * - Campinas, kit, Sugestão de volta "14h carro").
 *
 * O carimbo numa vaga sem passagem cria uma linha de passagem só com ele
 * (POST /api/tickets/emitidas). Numa vaga que vai de carro/van, essa linha é
 * uma passagem AÉREA em branco: o modal abre em "Modalidade: Aérea", LOC
 * vazio e valor 0, a vaga vai para "passagem comprada" e a tabela de
 * transporte terrestre continua vazia. Quem compra achou que tinha
 * "finalizado como van".
 *
 * Regra (só para a vaga sem passagem; passagem que existe é carimbada como
 * sempre):
 *  - todas as pernas já registradas como carro/van → não há bilhete a
 *    carimbar: pula, "já registrada como carro/van";
 *  - alguma perna INDICA transporte terrestre e ainda não foi registrada →
 *    pula, sem criar linha: "vai de carro/van — registre em 'Vai de carro/van'"
 *    (ônibus de linha é passagem rodoviária, registrada no modal da passagem —
 *    o motivo diz isso);
 *  - o resto (aérea; ou uma perna já registrada como terrestre e a outra
 *    aérea) → carimba, como hoje.
 *
 * Indicação, por perna — a mesma leitura de `sugestaoTerrestreDaVaga`: o
 * campo de transporte da Validação de Escala manda (qualquer valor que não
 * seja "aereo" é terrestre, inclusive "transfer"); sem ele, o texto do
 * horário sugerido com van, carro ou ônibus ("14h carro", "van - 7h"). Uber e
 * transfer no TEXTO não contam: "voo 9h + uber até o hotel" é viagem aérea.
 */
import {
  modoDoTexto,
  pernasDaVaga,
  type PernaDaViagem,
  type TrechoTerrestre,
  type VagaDaSugestao,
} from "./transporte-terrestre";

export const MOTIVO_VAI_DE_TERRESTRE = "vai de carro/van — registre em 'Vai de carro/van'";
export const MOTIVO_JA_TERRESTRE = "já registrada como carro/van";
export const MOTIVO_VAI_DE_ONIBUS = "vai de ônibus — registre a passagem rodoviária na passagem da vaga";

/**
 * Por que a vaga foi pulada, para a tela saber o que oferecer:
 *  - "terrestre": falta registrar o carro/van (a tela abre o "Vai de carro/van");
 *  - "ja_terrestre": nada a fazer;
 *  - "rodoviaria": ônibus — a passagem rodoviária se registra no modal.
 */
export type TipoDoPulo = "terrestre" | "ja_terrestre" | "rodoviaria";

export type DecisaoDoCarimbo =
  | { acao: "carimbar" }
  | { acao: "pular"; tipo: TipoDoPulo; motivo: string; pernas: PernaDaViagem[] };

const MODO_TERRESTRE_DO_CAMPO = (v: string | null | undefined): "onibus" | "outro" | null => {
  if (!v || v === "aereo") return null;
  return v === "onibus" ? "onibus" : "outro";
};

/** O modo que a perna indica: "onibus", "outro" (carro, van, transfer) ou null (aérea / sem indicação). */
function indicacaoDaPerna(v: VagaDaSugestao, perna: PernaDaViagem): "onibus" | "outro" | null {
  const campo = perna === "ida" ? v.transportModeIda : v.transportModeVolta;
  if (campo) return MODO_TERRESTRE_DO_CAMPO(campo);
  const texto = perna === "ida"
    ? modoDoTexto(v.flightDepartureSuggestedTime) ?? modoDoTexto(v.flightArrivalSuggestedTime)
    : modoDoTexto(v.flightReturnSuggestedTime);
  if (!texto) return null;
  return texto === "onibus" ? "onibus" : "outro";
}

/** As pernas da vaga que indicam transporte terrestre (Validação de Escala ou texto da Sugestão). */
export function pernasQueIndicamTerrestre(v: VagaDaSugestao): PernaDaViagem[] {
  return pernasDaVaga(v).filter((p) => indicacaoDaPerna(v, p) !== null);
}

/**
 * A vaga SEM passagem pode ganhar a linha só com o carimbo? `registros` são
 * os trechos terrestres já gravados da vaga.
 */
export function decidirCarimboSemPassagem(v: VagaDaSugestao, registros: readonly Pick<TrechoTerrestre, "trecho">[]): DecisaoDoCarimbo {
  const pernas = pernasDaVaga(v);
  const registradas = new Set(registros.map((r) => r.trecho));
  if (registradas.size > 0 && pernas.every((p) => registradas.has(p))) {
    return { acao: "pular", tipo: "ja_terrestre", motivo: MOTIVO_JA_TERRESTRE, pernas: [] };
  }
  const faltam = pernas.filter((p) => !registradas.has(p) && indicacaoDaPerna(v, p) !== null);
  if (faltam.length === 0) return { acao: "carimbar" };
  const soOnibus = faltam.every((p) => indicacaoDaPerna(v, p) === "onibus");
  return soOnibus
    ? { acao: "pular", tipo: "rodoviaria", motivo: MOTIVO_VAI_DE_ONIBUS, pernas: faltam }
    : { acao: "pular", tipo: "terrestre", motivo: MOTIVO_VAI_DE_TERRESTRE, pernas: faltam.filter((p) => indicacaoDaPerna(v, p) === "outro") };
}
