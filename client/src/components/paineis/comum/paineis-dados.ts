/**
 * Painéis (30/10) — agregações PURAS da Visão geral, sobre a MESMA régua do
 * Quadro de prazos das Análises da Escalação:
 *   - a etapa em que cada vaga está parada vem de `quadroDoEvento`
 *     (scaling-analytics-data.ts) — uma etapa por vaga até a escala
 *     confirmada; Passagem e Hotel correm em paralelo;
 *   - o prazo de cada etapa é `prazoDaEtapa(dataDoEvento, etapa, dias)` e a
 *     situação é `situacaoDoPrazo` (shared/prazos-da-escala.ts): "atrasado"
 *     quando o prazo passou com vaga parada ali, "vence_logo" até 3 dias antes;
 *   - a data do evento é a do Quadro (`dataEvento`, que já respeita os Dia(s)
 *     do evento do cadastro).
 * Nada daqui recalcula regra própria: se o Quadro pinta a célula de vermelho,
 * a Visão geral conta a mesma vaga como atrasada.
 */
import {
  prazoDaEtapa, situacaoDoPrazo, diasDeAtraso, ROTULO_DA_ETAPA,
  type DiasDosPrazos,
} from "@shared/prazos-da-escala";
import {
  ETAPAS_DO_QUADRO, O_QUE_FALTA, quadroDoEvento, rotuloDaDataDoEvento,
  type AnalyticsContext, type EtapaDoQuadro, type EventoAnalisado,
} from "@/components/scaling/scaling-analytics-data";

export type SituacaoDeAlerta = "atrasado" | "vence_logo";

export interface AtrasoDaEtapa {
  etapa: EtapaDoQuadro;
  /** Vagas PARADAS nesta etapa — o número da célula do Quadro. */
  paradas: number;
  vagaIds: string[];
  /**
   * Passagem/Hotel: vagas que precisam e ainda estão ANTES (escala não
   * confirmada) com o prazo já vencido — não contam no número (a régua do
   * Quadro), mas a tela avisa que vão cair aqui.
   */
  aindaAntes: number;
  prazo: Date | null;
  situacao: SituacaoDeAlerta;
  /** atrasado: dias de atraso (≥ 1); vence_logo: dias que faltam (0 = vence hoje). */
  dias: number;
}

export interface EventoComAtraso {
  eventId: string;
  nome: string;
  /** "06/11" ou "05–06/11" — o rótulo do Quadro. */
  data: string;
  /** Dias até a escala começar (do Quadro). */
  prazoDias: number | null;
  totalVagas: number;
  etapas: AtrasoDaEtapa[];
}

/** Quanto pior, maior: atraso conta os dias; "vence logo" fica abaixo de qualquer atraso. */
export function gravidade(a: Pick<AtrasoDaEtapa, "situacao" | "dias">): number {
  return a.situacao === "atrasado" ? a.dias : -1 - a.dias;
}

const piorDoEvento = (e: EventoComAtraso) => Math.max(...e.etapas.map(gravidade));

/**
 * Os alertas de cada evento futuro, etapa por etapa — só as células que o
 * Quadro pinta (vermelho ou amarelo). Evento sem alerta não entra.
 */
export function atrasosDosEventos(eventos: EventoAnalisado[], ctx: AnalyticsContext, dias: DiasDosPrazos, hoje: Date): EventoComAtraso[] {
  const out: EventoComAtraso[] = [];
  for (const e of eventos) {
    if (e.jaTerminou) continue;
    const quadro = quadroDoEvento(e.vagas, ctx);
    const etapas: AtrasoDaEtapa[] = [];
    for (const etapa of ETAPAS_DO_QUADRO) {
      const coluna = quadro.colunas[etapa];
      const prazo = prazoDaEtapa(e.dataEvento ?? e.ini, etapa, dias);
      const situacao = situacaoDoPrazo(prazo, hoje, coluna.paradas.length);
      if (situacao !== "atrasado" && situacao !== "vence_logo") continue;
      const atraso = diasDeAtraso(prazo, hoje) ?? 0;
      const logistica = etapa === "passagem" || etapa === "hotel";
      const precisa = (i: EventoAnalisado["vagas"][number]) => (etapa === "passagem" ? !!i.needsTicket : !!i.needsAccommodation);
      etapas.push({
        etapa,
        paradas: coluna.paradas.length,
        vagaIds: coluna.paradas.map((i) => i.id),
        aindaAntes: logistica && situacao === "atrasado" ? coluna.antes.filter(precisa).length : 0,
        prazo,
        situacao,
        dias: situacao === "atrasado" ? atraso : -atraso,
      });
    }
    if (etapas.length === 0) continue;
    out.push({ eventId: e.eventId, nome: e.nome, data: rotuloDaDataDoEvento(e), prazoDias: e.prazoDias, totalVagas: e.total, etapas });
  }
  return ordenarPorGravidade(out);
}

function ordenarPorGravidade(lista: EventoComAtraso[]): EventoComAtraso[] {
  return lista.sort((a, b) => piorDoEvento(b) - piorDoEvento(a)
    || (a.prazoDias ?? Infinity) - (b.prazoDias ?? Infinity)
    || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Só as etapas pedidas (um bloco da tela), sem os eventos que ficaram vazios. */
export function recortarPorEtapas(lista: EventoComAtraso[], etapas: readonly EtapaDoQuadro[]): EventoComAtraso[] {
  const quer = new Set(etapas);
  return ordenarPorGravidade(lista
    .map((e) => ({ ...e, etapas: e.etapas.filter((a) => quer.has(a.etapa)) }))
    .filter((e) => e.etapas.length > 0));
}

export interface TotaisDoBloco {
  /** Vagas paradas em etapa com prazo vencido. */
  vagasAtrasadas: number;
  eventosAtrasados: number;
  /** Vagas paradas em etapa que vence em até 3 dias. */
  vagasVencendo: number;
  eventosVencendo: number;
  /** O maior atraso, em dias (0 sem atraso). */
  maiorAtraso: number;
}

export function totaisDoBloco(lista: EventoComAtraso[]): TotaisDoBloco {
  const t: TotaisDoBloco = { vagasAtrasadas: 0, eventosAtrasados: 0, vagasVencendo: 0, eventosVencendo: 0, maiorAtraso: 0 };
  for (const e of lista) {
    const atrasadas = e.etapas.filter((a) => a.situacao === "atrasado");
    const vencendo = e.etapas.filter((a) => a.situacao === "vence_logo");
    t.vagasAtrasadas += atrasadas.reduce((s, a) => s + a.paradas, 0);
    t.vagasVencendo += vencendo.reduce((s, a) => s + a.paradas, 0);
    if (atrasadas.length) t.eventosAtrasados += 1;
    else if (vencendo.length) t.eventosVencendo += 1;
    for (const a of atrasadas) t.maiorAtraso = Math.max(t.maiorAtraso, a.dias);
  }
  return t;
}

/**
 * Vaga → etapa em que está parada com o prazo VENCIDO. É o "atrasada" do
 * feed da Atividade recente (mesma régua). Uma vaga confirmada sem passagem e
 * sem hotel aparece nas duas colunas; fica a primeira (passagem).
 */
export function vagasAtrasadas(lista: EventoComAtraso[]): Map<string, EtapaDoQuadro> {
  const m = new Map<string, EtapaDoQuadro>();
  for (const e of lista) {
    for (const a of e.etapas) {
      if (a.situacao !== "atrasado") continue;
      for (const id of a.vagaIds) if (!m.has(id)) m.set(id, a.etapa);
    }
  }
  return m;
}

/** "3 sem nome" / "1 a emitir" — o texto do Quadro. */
export function textoDaEtapa(a: Pick<AtrasoDaEtapa, "etapa" | "paradas">): string {
  return `${a.paradas} ${O_QUE_FALTA[a.etapa]}`;
}

/** "7 dias atrasado" / "vence hoje" / "vence em 2 dias". */
export function textoDaSituacao(a: Pick<AtrasoDaEtapa, "situacao" | "dias">): string {
  if (a.situacao === "atrasado") return `${a.dias} ${a.dias === 1 ? "dia" : "dias"} de atraso`;
  if (a.dias <= 0) return "vence hoje";
  return `vence em ${a.dias} ${a.dias === 1 ? "dia" : "dias"}`;
}

export { ROTULO_DA_ETAPA };

// ── Pedidos de ajuste e trocas ──────────────────────────────────────────────

/** Só os campos que os Painéis leem de GET /api/scaling-change-requests?status=pendente. */
export interface PedidoPendente {
  id: string;
  eventId: string;
  requestType: string;
  createdAt?: string | null;
  functionName?: string | null;
  eventName?: string | null;
  inclusionNumber?: number | null;
  requestedByName?: string | null;
  teamInclusionId?: string | null;
}

export interface ResumoDosPedidos {
  total: number;
  /** Do mais antigo para o mais novo. */
  maisAntigos: (PedidoPendente & { diasEsperando: number | null })[];
  porEvento: { eventId: string; nome: string; n: number; maisAntigoDias: number | null }[];
  /** Esperando há 3 dias ou mais. */
  parados: number;
}

const MS_DIA = 86_400_000;
export const DIAS_PEDIDO_PARADO = 3;

function diasDesde(iso: string | null | undefined, hoje: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((a - b) / MS_DIA));
}

export function resumirPedidos(pedidos: PedidoPendente[], hoje: Date): ResumoDosPedidos {
  const comDias = pedidos
    .map((p) => ({ ...p, diasEsperando: diasDesde(p.createdAt, hoje) }))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  const porEvento = new Map<string, { eventId: string; nome: string; n: number; maisAntigoDias: number | null }>();
  for (const p of comDias) {
    const atual = porEvento.get(p.eventId) ?? { eventId: p.eventId, nome: p.eventName || "Evento", n: 0, maisAntigoDias: p.diasEsperando };
    atual.n += 1;
    porEvento.set(p.eventId, atual);
  }
  return {
    total: pedidos.length,
    maisAntigos: comDias,
    porEvento: Array.from(porEvento.values()).sort((a, b) => b.n - a.n || (b.maisAntigoDias ?? -1) - (a.maisAntigoDias ?? -1)),
    parados: comDias.filter((p) => (p.diasEsperando ?? 0) >= DIAS_PEDIDO_PARADO).length,
  };
}

export const ROTULO_DO_PEDIDO: Record<string, string> = { ajuste: "Ajuste", inclusao: "Inclusão", exclusao: "Exclusão" };

// ── Tempo ───────────────────────────────────────────────────────────────────

/** "agora", "há 5 min", "há 2 h", "ontem às 14:32", "28/10 às 09:15". */
export function quandoFoi(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.floor((agora.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dias = diasDesde(iso, agora) ?? 0;
  if (dias === 0) return `há ${Math.floor(min / 60)} h`;
  if (dias === 1) return `ontem às ${hora}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} às ${hora}`;
}

/** "Hoje", "Ontem", "qua, 28/10" — o cabeçalho de cada dia do feed. */
export function rotuloDoDia(iso: string, agora: Date = new Date()): string {
  const dias = diasDesde(iso, agora) ?? 0;
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  const d = new Date(iso);
  const sem = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getDay()];
  return `${sem}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "atualizado agora" / "atualizado há 3 min". */
export function textoAtualizado(ms: number | null | undefined, agora: number = Date.now()): string {
  if (!ms) return "";
  const s = Math.max(0, Math.floor((agora - ms) / 1000));
  if (s < 60) return "atualizado agora";
  const min = Math.floor(s / 60);
  if (min < 60) return `atualizado há ${min} min`;
  return `atualizado há ${Math.floor(min / 60)} h`;
}

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
