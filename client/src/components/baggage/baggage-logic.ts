/**
 * A regra do Controle de Bagagem, isolada do React.
 *
 * Filtro, ordenação, agregações e validação viviam dentro do componente de
 * página. Os contadores dos popovers precisam da MESMA regra do filtro — "quantas
 * linhas sobram se eu marcar este evento, mantendo o resto do recorte" — e um
 * contador com cópia própria da regra começa a mentir na primeira mudança. Em
 * Passagens isso aconteceu: o popover prometia 15 linhas e a lista entregava 1.
 *
 * Copiado do arquivo original, não reescrito de memória.
 */
import { parseBrNumber, fixEncoding } from "@/lib/utils";
import {
  ciaGroup, getCpf, toTitleCase,
  type BaggageHistoryItem, type BaggageRequestItem, type CiaGroup,
  type CollaboratorItem, type EventItem, type FormErrors, type FormState,
} from "./baggage-core";

export interface FiltrosDaLista {
  eventId: string;
  /** Seleção múltipla — vazio significa "todos". */
  collaboratorIds: string[];
  search: string;
  /** Bloco da fila por companhia; null quando nenhum está ativo. */
  cia: CiaGroup | null;
}

export const FILTROS_VAZIOS: FiltrosDaLista = {
  eventId: "", collaboratorIds: [], search: "", cia: null,
};

export interface ContextoDaLista {
  collabById: Map<string, CollaboratorItem>;
  eventById: Map<string, EventItem>;
}

/**
 * A linha passa pelo recorte atual?
 *
 * A busca varre nome, LOC, OS, nome do evento e CPF — a mesma lista de campos
 * que o `placeholder` promete.
 */
export function passaNosFiltros(r: BaggageRequestItem, f: FiltrosDaLista, ctx: ContextoDaLista): boolean {
  if (f.eventId && r.eventId !== f.eventId) return false;
  if (f.collaboratorIds.length > 0 && !f.collaboratorIds.includes(r.collaboratorId)) return false;
  if (f.cia && ciaGroup(r.cia) !== f.cia) return false;

  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, "");
  const c = ctx.collabById.get(r.collaboratorId);
  const name = fixEncoding(c?.fullName || "").toLowerCase();
  if (name.includes(q)) return true;
  if ((r.loc || "").toLowerCase().includes(q)) return true;
  if ((r.os || "").toLowerCase().includes(q)) return true;
  const evName = fixEncoding(ctx.eventById.get(r.eventId)?.name || "").toLowerCase();
  if (evName.includes(q)) return true;
  const cpf = c ? getCpf(c).replace(/\D/g, "") : "";
  return !!qDigits && cpf.includes(qDigits);
}

// ── Ordenação ────────────────────────────────────────────────────────────────

export type CampoDeOrdem = "boarding" | "collaborator" | "value" | "cia";
export interface Ordem { campo: CampoDeOrdem; desc: boolean }

/** A ordem que a tela sempre teve: embarque mais recente primeiro. */
export const ORDEM_PADRAO: Ordem = { campo: "boarding", desc: true };

export const NOME_DA_ORDEM: Record<CampoDeOrdem, string> = {
  boarding: "embarque", collaborator: "colaborador", value: "valor", cia: "companhia",
};

function chaveDeOrdem(r: BaggageRequestItem, campo: CampoDeOrdem, ctx: ContextoDaLista): string | number {
  switch (campo) {
    case "boarding": return r.boardingDate || "";
    case "collaborator": return toTitleCase(fixEncoding(ctx.collabById.get(r.collaboratorId)?.fullName || ""));
    case "value": return r.valueCents || 0;
    case "cia": return ciaGroup(r.cia);
  }
}

/**
 * Ordena sem mutar a lista recebida.
 *
 * O desempate por `createdAt` é o que a tela sempre teve e fica: duas bagagens
 * do mesmo embarque precisam de uma ordem estável, senão a lista se remonta
 * sozinha a cada refetch.
 */
export function ordenar(linhas: BaggageRequestItem[], ordem: Ordem, ctx: ContextoDaLista): BaggageRequestItem[] {
  const sinal = ordem.desc ? -1 : 1;
  return [...linhas].sort((a, b) => {
    const ka = chaveDeOrdem(a, ordem.campo, ctx);
    const kb = chaveDeOrdem(b, ordem.campo, ctx);
    let cmp = 0;
    if (typeof ka === "string" && typeof kb === "string") cmp = ka.localeCompare(kb, "pt-BR");
    else cmp = (ka as number) - (kb as number);
    if (cmp !== 0) return cmp * sinal;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

// ── Resumo do recorte ────────────────────────────────────────────────────────

export interface ResumoDoRecorte { records: number; bags: number; cents: number }

export function resumir(linhas: BaggageRequestItem[]): ResumoDoRecorte {
  let bags = 0, cents = 0;
  for (const r of linhas) { bags += r.quantity || 0; cents += r.valueCents || 0; }
  return { records: linhas.length, bags, cents };
}

// ── Fila por companhia aérea ─────────────────────────────────────────────────

export interface ResumoDaCia { bags: number; cents: number; records: number }

/**
 * Uma passagem só sobre a lista para os quatro contadores da fila.
 *
 * Quatro `filter` encadeados custariam quatro varreduras a cada tecla digitada
 * na busca — em Escalação, a versão ingênua desse mesmo cálculo congelava a
 * tela.
 */
export function contadoresPorCia(linhas: BaggageRequestItem[]): Record<CiaGroup, ResumoDaCia> {
  const vazio = (): ResumoDaCia => ({ bags: 0, cents: 0, records: 0 });
  const acc: Record<CiaGroup, ResumoDaCia> = {
    Azul: vazio(), Gol: vazio(), TAM: vazio(), Outros: vazio(),
  };
  for (const r of linhas) {
    const g = acc[ciaGroup(r.cia)];
    g.bags += r.quantity || 0;
    g.cents += r.valueCents || 0;
    g.records += 1;
  }
  return acc;
}

// ── Contadores cruzados dos popovers ─────────────────────────────────────────

/**
 * Quantas linhas cada opção deixaria, mantendo o resto do recorte.
 *
 * Roda a lista inteira IGNORANDO o próprio campo — senão, com um evento já
 * escolhido, todos os outros mostrariam zero e o número não ajudaria a escolher
 * outro.
 */
export function contarPorOpcao(
  todas: BaggageRequestItem[],
  filtros: FiltrosDaLista,
  campo: "eventId" | "collaboratorId",
  ctx: ContextoDaLista,
): Map<string, number> {
  const neutro: FiltrosDaLista = {
    ...filtros,
    ...(campo === "eventId" ? { eventId: "" } : { collaboratorIds: [] }),
  };
  const contagem = new Map<string, number>();
  for (const r of todas) {
    if (!passaNosFiltros(r, neutro, ctx)) continue;
    const chave = r[campo];
    if (!chave) continue;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return contagem;
}

// ── Agregação por colaborador (registros do sistema + histórico importado) ───

export interface AgregadoDoColaborador {
  byCia: Record<CiaGroup, number>;
  histByCia: Record<CiaGroup, number>;
  totalBags: number;
  totalCents: number;
  historyBags: number;
}

/**
 * Bagagens por colaborador, agregadas por CIA.
 *
 * 100% derivado dos registros — nada de contador manual, que é a dívida que o
 * HTML de origem trazia. O histórico importado da planilha antiga entra nas
 * CIAs e no total de bagagens, mas **não tem valor**: por isso soma em
 * `totalBags` e nunca em `totalCents`.
 */
export function agregarPorColaborador(
  requests: BaggageRequestItem[],
  historico: BaggageHistoryItem[],
): Map<string, AgregadoDoColaborador> {
  const map = new Map<string, AgregadoDoColaborador>();
  const getAgg = (id: string) => {
    const agg = map.get(id) || {
      byCia: { Azul: 0, Gol: 0, TAM: 0, Outros: 0 }, histByCia: { Azul: 0, Gol: 0, TAM: 0, Outros: 0 },
      totalBags: 0, totalCents: 0, historyBags: 0,
    };
    map.set(id, agg);
    return agg;
  };
  for (const r of requests) {
    const agg = getAgg(r.collaboratorId);
    agg.byCia[ciaGroup(r.cia)] += r.quantity || 0;
    agg.totalBags += r.quantity || 0;
    agg.totalCents += r.valueCents || 0;
  }
  for (const h of historico) {
    const agg = getAgg(h.collaboratorId);
    const g = ciaGroup(h.cia);
    agg.byCia[g] += h.quantity || 0;
    agg.histByCia[g] += h.quantity || 0;
    agg.totalBags += h.quantity || 0;
    agg.historyBags += h.quantity || 0;
  }
  return map;
}

// ── Validação e payload do formulário ────────────────────────────────────────

export function validate(f: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!f.eventId) errs.eventId = "Selecione o evento";
  if (!f.collaboratorId) errs.collaboratorId = "Selecione o colaborador";
  if (!f.loc.trim()) errs.loc = "Informe o localizador (LOC)";
  if (f.ciaSelect === "Outros" && !f.ciaOther.trim()) errs.cia = "Informe a companhia aérea";
  const cents = Math.round(parseBrNumber(f.valueText) * 100);
  if (!f.valueText.trim()) errs.value = "Informe o valor";
  else if (!/\d/.test(f.valueText)) errs.value = "Valor inválido — use números, ex.: 1.500,00";
  else if (cents < 0) errs.value = "Valor não pode ser negativo";
  if (!f.os.trim()) errs.os = "Informe a OS";
  const qty = parseInt(f.quantityText, 10);
  if (!f.quantityText.trim() || Number.isNaN(qty) || qty < 1) errs.quantity = "Quantidade mínima é 1";
  if (f.agencySelect === "Outros" && !f.agencyOther.trim()) errs.agency = "Informe a agência";
  if (!f.requestDate) errs.requestDate = "Informe a data da solicitação";
  if (!f.boardingDate) errs.boardingDate = "Informe a data do embarque";
  else if (f.requestDate && f.boardingDate < f.requestDate) {
    errs.boardingDate = "O embarque não pode ser anterior à solicitação";
  }
  return errs;
}

export function buildPayload(f: FormState) {
  return {
    eventId: f.eventId,
    collaboratorId: f.collaboratorId,
    loc: f.loc.trim().toUpperCase(),
    cia: f.ciaSelect === "Outros" ? f.ciaOther.trim() : f.ciaSelect,
    valueCents: Math.round(parseBrNumber(f.valueText) * 100),
    os: f.os.trim(),
    quantity: parseInt(f.quantityText, 10),
    agency: f.agencySelect === "Outros" ? f.agencyOther.trim() : f.agencySelect,
    requestDate: f.requestDate,
    boardingDate: f.boardingDate,
    notes: f.notes.trim() || null,
  };
}

/**
 * Outra solicitação com o MESMO localizador.
 *
 * Não é erro: bagagem extra do mesmo bilhete acontece. Mas quem digita um LOC
 * que já existe quase sempre está duplicando por engano, e o aviso nomeia para
 * quem o LOC já está — sem isso a pessoa só descobre na conferência.
 */
export function locJaRegistrado(
  loc: string,
  requests: BaggageRequestItem[],
  editandoId: string | null,
): BaggageRequestItem | null {
  const alvo = loc.trim().toUpperCase();
  if (!alvo) return null;
  return requests.find(r => r.id !== editandoId && (r.loc || "").trim().toUpperCase() === alvo) ?? null;
}
