/**
 * Legado do Módulo de Honorários — data de corte (decisão do dono, 26/10).
 *
 * Eventos que TERMINAM antes da data de corte são "legado": a fila deles
 * (3.599 pendentes no Controle em 20/10, slide 13 da reunião de 21/10) fica
 * fora do fluxo novo. No Painel de honorários aparecem num recorte próprio,
 * só leitura, com "Concluir em lote" (marca como concluído fora do fluxo,
 * com motivo, sem apagar nada); nas demais telas do Financeiro saem da lista
 * de eventos por padrão, com um filtro para ver.
 *
 * A data mora em `system_settings` (chave `honorarios_data_corte`, texto
 * AAAA-MM-DD) e só o administrador muda (Tabela de valores). Sem linha
 * gravada, vale a data decidida: 01/11/2026.
 *
 * Funções puras — servidor e tela.
 */

/** Chave em `system_settings`. */
export const CHAVE_DATA_DE_CORTE = "honorarios_data_corte";
/** Decisão do dono (26/10): eventos que terminam ANTES de 01/11/2026 são legado. */
export const DATA_DE_CORTE_PADRAO = "2026-11-01";

/** "AAAA-MM-DD" de uma data que existe no calendário. */
export function dataDeCorteValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

/** O valor gravado, se válido; senão a data padrão. */
export function lerDataDeCorte(valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  return dataDeCorteValida(v) ? v : DATA_DE_CORTE_PADRAO;
}

/**
 * O evento é legado? O FIM do evento é anterior à data de corte (comparação
 * de datas de calendário, sem fuso). Evento sem data de fim fica no fluxo novo.
 */
export function ehEventoLegado(endDate: string | Date | null | undefined, dataDeCorte: string): boolean {
  if (!endDate) return false;
  const fim = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : String(endDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) return false;
  return fim < dataDeCorte;
}

/** Recorte do Painel de honorários. Padrão: o fluxo novo. */
export type RecorteDoLegado = "fluxo_novo" | "legado" | "todos";
export const RECORTES_DO_LEGADO: readonly RecorteDoLegado[] = ["fluxo_novo", "legado", "todos"];
export const RECORTE_PADRAO: RecorteDoLegado = "fluxo_novo";

export function ehRecorteDoLegado(v: unknown): v is RecorteDoLegado {
  return typeof v === "string" && (RECORTES_DO_LEGADO as readonly string[]).includes(v);
}

/** O evento entra no recorte? */
export function eventoNoRecorte(legado: boolean, recorte: RecorteDoLegado): boolean {
  if (recorte === "todos") return true;
  return recorte === "legado" ? legado : !legado;
}

/** "01/11/2026" (para os textos de tela). */
export function dataDeCorteLegivel(dataDeCorte: string): string {
  const [a, m, d] = dataDeCorte.split("-");
  return `${d}/${m}/${a}`;
}

/** Limites do motivo de "Concluir em lote" (o motivo vai para a auditoria). */
export const MOTIVO_MINIMO = 5;
export const MOTIVO_MAXIMO = 500;
/** Teto de linhas por pedido de "Concluir em lote". */
export const LIMITE_DO_LOTE_DO_LEGADO = 5000;
