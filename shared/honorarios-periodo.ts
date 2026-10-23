/**
 * Filtro por PERÍODO da tela Honorários da cenotécnica (23/10).
 *
 * Dono: "e nessa tela põe filtro por período também". Regras:
 *  - atalhos (Este mês · Mês passado · Últimos 3 meses · Este ano · Tudo) ou
 *    "de/até" livre; os atalhos são relativos a HOJE em São Paulo, então o
 *    link "este mês" aberto em novembro mostra novembro;
 *  - em "A liberar" e nos Relatórios o período vale para a DATA DO EVENTO
 *    (início) — é o que o relatório "por mês" já usa;
 *  - em "Liberados" a pessoa escolhe a base: DATA DA LIBERAÇÃO (padrão) ou
 *    data do evento. O Financeiro fecha o mês pelo que PAGOU: em outubro,
 *    "liberados" são as OCs/DPs com data de outubro, mesmo de evento de
 *    setembro, e um pedido pago metade em setembro e metade em outubro entra
 *    em outubro só com a parte de outubro. Liberação estornada não conta.
 *
 * Tudo aqui é puro (datas "YYYY-MM-DD", comparação de texto), com teste em
 * shared/honorarios-periodo.test.ts. Nada muda as regras dos honorários.
 */
import { ehDataIso } from "./honorarios-ceno";

export type AtalhoDoPeriodo = "este-mes" | "mes-passado" | "ultimos-3-meses" | "este-ano" | "tudo" | "personalizado";

export const ATALHOS_DO_PERIODO: { id: Exclude<AtalhoDoPeriodo, "personalizado">; rotulo: string }[] = [
  { id: "este-mes", rotulo: "Este mês" },
  { id: "mes-passado", rotulo: "Mês passado" },
  { id: "ultimos-3-meses", rotulo: "Últimos 3 meses" },
  { id: "este-ano", rotulo: "Este ano" },
  { id: "tudo", rotulo: "Tudo" },
];

export const ehAtalhoDoPeriodo = (v: unknown): v is AtalhoDoPeriodo =>
  v === "personalizado" || ATALHOS_DO_PERIODO.some((a) => a.id === v);

/** A que data o período se aplica. */
export type BaseDoPeriodo = "evento" | "liberacao";
export const BASE_DO_PERIODO_LABEL: Record<BaseDoPeriodo, string> = {
  evento: "data do evento",
  liberacao: "data da liberação",
};

/** O que fica na URL. */
export interface EscolhaDoPeriodo {
  atalho: AtalhoDoPeriodo;
  /** Só no "personalizado". */
  de?: string | null;
  ate?: string | null;
}

/** Intervalo fechado [de, ate]; null = sem limite daquele lado. */
export interface Intervalo {
  de: string | null;
  ate: string | null;
}

const dois = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
/** Mês deslocado: (2026, 1, -1) → 2025-12. `mes` de 1 a 12. */
function mesDeslocado(ano: number, mes: number, delta: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) + delta;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}
const inicioDoMes = (ano: number, mes: number) => `${ano}-${dois(mes)}-01`;
const fimDoMes = (ano: number, mes: number) => `${ano}-${dois(mes)}-${dois(ultimoDia(ano, mes))}`;

/** O intervalo de datas da escolha, com `hoje` ("YYYY-MM-DD", em São Paulo). */
export function intervaloDoPeriodo(p: EscolhaDoPeriodo, hoje: string): Intervalo {
  const [ano, mes] = hoje.split("-").map(Number);
  switch (p.atalho) {
    case "este-mes":
      return { de: inicioDoMes(ano, mes), ate: fimDoMes(ano, mes) };
    case "mes-passado": {
      const m = mesDeslocado(ano, mes, -1);
      return { de: inicioDoMes(m.ano, m.mes), ate: fimDoMes(m.ano, m.mes) };
    }
    case "ultimos-3-meses": {
      // O mês corrente e os dois anteriores, inteiros (ago–out em outubro).
      const m = mesDeslocado(ano, mes, -2);
      return { de: inicioDoMes(m.ano, m.mes), ate: fimDoMes(ano, mes) };
    }
    case "este-ano":
      return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
    case "personalizado": {
      const de = ehDataIso(p.de) ? p.de : null;
      const ate = ehDataIso(p.ate) ? p.ate : null;
      // "de" depois do "até": troca, em vez de devolver um período vazio.
      if (de && ate && de > ate) return { de: ate, ate: de };
      return { de, ate };
    }
    case "tudo":
    default:
      return { de: null, ate: null };
  }
}

export const semLimite = (i: Intervalo) => !i.de && !i.ate;

/** A data cai no intervalo? Sem limite, tudo cai (inclusive sem data); com limite, sem data não cai. */
export function dentroDoIntervalo(data: string | null | undefined, i: Intervalo): boolean {
  if (semLimite(i)) return true;
  if (!data || !ehDataIso(data.slice(0, 10))) return false;
  const d = data.slice(0, 10);
  return (!i.de || d >= i.de) && (!i.ate || d <= i.ate);
}

const br = (iso: string) => iso.split("-").reverse().join("/");

/** "01/10/2026 a 31/10/2026", "a partir de 01/10/2026", "até 31/10/2026" ou "todo o período". */
export function descricaoDoIntervalo(i: Intervalo): string {
  if (i.de && i.ate) return i.de === i.ate ? br(i.de) : `${br(i.de)} a ${br(i.ate)}`;
  if (i.de) return `a partir de ${br(i.de)}`;
  if (i.ate) return `até ${br(i.ate)}`;
  return "todo o período";
}

/** Texto do botão: o nome do atalho ou as datas do personalizado. */
export function rotuloDoPeriodo(p: EscolhaDoPeriodo, hoje: string): string {
  if (p.atalho === "tudo") return "Todo o período";
  if (p.atalho === "personalizado") {
    const d = descricaoDoIntervalo(intervaloDoPeriodo(p, hoje));
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  return ATALHOS_DO_PERIODO.find((a) => a.id === p.atalho)?.rotulo ?? "Todo o período";
}

/** Pedaço do nome do arquivo: "" (tudo) ou "-2026-10-01-a-2026-10-31" (+ "-por-liberacao"). */
export function sufixoDoPeriodo(i: Intervalo, base: BaseDoPeriodo = "evento"): string {
  if (semLimite(i)) return "";
  const datas = i.de && i.ate ? `${i.de}-a-${i.ate}` : i.de ? `desde-${i.de}` : `ate-${i.ate}`;
  return `-${datas}${base === "liberacao" ? "-por-liberacao" : ""}`;
}

/** Linhas que abrem o CSV (antes do cabeçalho da tabela): de que recorte é o arquivo. */
export function preambuloDoCsv(titulo: string, i: Intervalo, base: BaseDoPeriodo, evento?: string | null): string[][] {
  return [
    [titulo],
    ["Período", `${descricaoDoIntervalo(i)}${semLimite(i) ? "" : ` (${BASE_DO_PERIODO_LABEL[base]})`}`],
    ...(evento ? [["Evento", evento]] : []),
    [],
  ];
}

// ── Recortes ────────────────────────────────────────────────────────────────

/** Pela data do evento (início) — "A liberar", Relatórios e "Liberados" na base evento. */
export function recortarPelaDataDoEvento<T extends { eventStartDate: string | null }>(linhas: readonly T[], i: Intervalo): T[] {
  if (semLimite(i)) return [...linhas];
  return linhas.filter((h) => dentroDoIntervalo(h.eventStartDate, i));
}

export interface LiberacaoParaPeriodo {
  data: string;
  valor: number;
  estornadaEm: string | null;
}

/** Liberações que valem (não estornadas) com a data no intervalo. */
export function liberacoesNoPeriodo<L extends LiberacaoParaPeriodo>(liberacoes: readonly L[], i: Intervalo): L[] {
  return liberacoes.filter((l) => !l.estornadaEm && dentroDoIntervalo(l.data, i));
}

export interface LinhaPagaNoPeriodo<T, L> {
  linha: T;
  /** Só as liberações do período (as de fora não aparecem nem somam). */
  liberacoes: L[];
  liberadoNoPeriodo: number;
}

/**
 * "Liberados" pela DATA DA LIBERAÇÃO: os pedidos com pelo menos uma OC/DP
 * válida no período — pagos por completo ou em parte —, cada um com só as
 * liberações do período e a soma delas.
 */
export function recortarPelaDataDaLiberacao<L extends LiberacaoParaPeriodo, T extends { liberacoes: readonly L[] }>(linhas: readonly T[], i: Intervalo): LinhaPagaNoPeriodo<T, L>[] {
  const out: LinhaPagaNoPeriodo<T, L>[] = [];
  for (const linha of linhas) {
    const libs = liberacoesNoPeriodo(linha.liberacoes, i);
    if (libs.length === 0) continue;
    out.push({ linha, liberacoes: libs, liberadoNoPeriodo: libs.reduce((s, l) => s + l.valor, 0) });
  }
  return out;
}

export interface TotaisPagosNoPeriodo {
  /** Soma das liberações do período. */
  liberado: number;
  /** Quantas OCs/DPs. */
  liberacoes: number;
  pedidos: number;
  eventos: number;
  /** O valor aprovado desses pedidos (inteiro, não só a parte do período). */
  aprovadoDessesPedidos: number;
  /** Desses pedidos, o que ainda falta liberar hoje (fora do período ou não). */
  faltaDessesPedidos: number;
}

export function totaisPagosNoPeriodo<T extends { eventId: string; falta: number; valorAprovado: number | null }, L>(recorte: readonly LinhaPagaNoPeriodo<T, L>[]): TotaisPagosNoPeriodo {
  return {
    liberado: recorte.reduce((s, r) => s + r.liberadoNoPeriodo, 0),
    liberacoes: recorte.reduce((s, r) => s + r.liberacoes.length, 0),
    pedidos: recorte.length,
    eventos: new Set(recorte.map((r) => r.linha.eventId)).size,
    aprovadoDessesPedidos: recorte.reduce((s, r) => s + (r.linha.valorAprovado ?? 0), 0),
    faltaDessesPedidos: recorte.reduce((s, r) => s + r.linha.falta, 0),
  };
}
