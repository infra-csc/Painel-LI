// Extraído de flash-account.tsx em 25/09 (modularização): tipos locais das
// respostas da API, constantes-alvo do adiantamento e utilitários puros da
// Conta corrente Flash. Sem React.
import { formatarMoeda } from "@/lib/format";

// Valores-alvo do adiantamento: o colaborador deve sempre ter esses saldos
// disponíveis no Flash Benefícios (crédito inicial na admissão; cada evento
// com alimentação/mobilidade é reembolsado para recompor o saldo).
export const TARGET_FOOD_CENTS = 35000;     // R$ 350,00 alimentação
export const TARGET_MOBILITY_CENTS = 15000; // R$ 150,00 mobilidade

export const formatCurrency = formatarMoeda;
export function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}
export function todayISO() {
  return new Date().toISOString().split("T")[0];
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-08-14" → "2026-08" (chave do mês no extrato). */
export function mesDe(d?: string | null): string {
  return String(d || "").split("T")[0].slice(0, 7);
}
/** "2026-08" → "Agosto de 2026". */
export function rotuloDoMes(chave: string): string {
  const [y, m] = chave.split("-");
  const nome = MESES[Number(m) - 1];
  if (!nome || !y) return "Sem data";
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${y}`;
}
/** "2026-08-14" → { dia: "14/08", semana: "sex" } — a data do extrato, legível. */
export function dataDoExtrato(d?: string | null): { dia: string; semana: string } {
  const iso = String(d || "").split("T")[0];
  const [y, m, day] = iso.split("-");
  if (!y || !m || !day) return { dia: "—", semana: "" };
  const dt = new Date(Number(y), Number(m) - 1, Number(day));
  return { dia: `${day}/${m}`, semana: Number.isNaN(dt.getTime()) ? "" : DIAS[dt.getDay()] };
}

/** Quanto falta para o alvo (0 quando já está no alvo ou acima). */
export function faltaParaOAlvo(saldo: number, alvo: number): number {
  return Math.max(0, alvo - saldo);
}
/** Proporção do saldo sobre o alvo, de 0 a 1 (para a barrinha). */
export function proporcaoDoAlvo(saldo: number, alvo: number): number {
  if (alvo <= 0) return 1;
  return Math.min(1, Math.max(0, saldo / alvo));
}

export const ROTULO_CATEGORIA: Record<string, string> = { alimentacao: "Alimentação", mobilidade: "Mobilidade" };

export type Balance = { food: number; mobility: number; count: number };

// Formas locais das respostas da API (apenas os campos usados nesta tela)
export interface Collaborator {
  id: string;
  fullName: string;
  active?: boolean | null;
}
export interface EventItem {
  id: string;
  name: string;
}
export interface FlashMovement {
  id: string;
  collaboratorId: string;
  eventId?: string | null;
  category: string; // alimentacao | mobilidade
  type: string;     // credito | debito
  amountCents: number;
  movementDate: string;
  description?: string | null;
  createdAt?: string | null;
  /**
   * 'manual' (tela), 'comparativo' (crédito automático da aprovação do
   * comparativo — regra 19/08, somente leitura) ou 'oc' (legado da regra de
   * 17/08, quando o crédito vinha da OC da NF — congelado, somente leitura).
   */
  sourceType?: string | null;
  sourceRef?: string | null;
}

/** Linha do extrato com sinal e saldos acumulados. */
export type ExtratoLinha = FlashMovement & { signed: number; runningFood: number; runningMobility: number };

/** Filtro do extrato por origem do lançamento */
export type SourceFilter = "todos" | "manual" | "automatico";

/** Extrai o nº da OC da descrição legada "Automático — OC nº X · Evento" */
export function ocFromDescription(desc?: string | null): string {
  const m = /OC nº\s*([^·]+)/.exec(desc || "");
  return m ? m[1].trim() : "";
}

/** Etiqueta do lançamento automático no extrato, por origem. */
export function automaticBadgeLabel(m: FlashMovement): string {
  if (m.sourceType === "oc") {
    const oc = ocFromDescription(m.description);
    return `Automático · OC nº ${oc || "—"}`;
  }
  return "Automático · Comparativo";
}
