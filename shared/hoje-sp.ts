/**
 * "Hoje" no fuso da operação (23/09).
 *
 * O servidor roda em UTC. `new Date().toISOString().slice(0, 10)` devolve o
 * dia em UTC — entre 21h e meia-noite de Brasília já é "amanhã", e um
 * lançamento feito às 22h ganhava a data do dia seguinte. A operação é toda no
 * Brasil, então a data de negócio é a de São Paulo.
 *
 * Um helper só para o servidor inteiro usar (flash-credit, routes...). O
 * mesmo cálculo já existia em shared/event-window.ts (`todayIsoDate`); este
 * aceita o fuso como parâmetro para os testes e para um eventual evento fora
 * do país.
 */

export const FUSO_DA_OPERACAO = "America/Sao_Paulo";

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(tz: string): Intl.DateTimeFormat {
  let f = formatadores.get(tz);
  if (!f) {
    // "en-CA" escreve YYYY-MM-DD; formatToParts evita depender disso.
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    formatadores.set(tz, f);
  }
  return f;
}

/** Data de hoje ("YYYY-MM-DD") no fuso dado; `agora` existe para os testes. */
export function hojeISO(tz: string = FUSO_DA_OPERACAO, agora: Date = new Date()): string {
  const partes = formatador(tz).formatToParts(agora);
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${pegar("year")}-${pegar("month")}-${pegar("day")}`;
}
