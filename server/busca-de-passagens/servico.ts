/**
 * Busca de passagens — banco e fornecedor (09/10): cache compartilhado,
 * registro de consumo, teto mensal e a escolha do fornecedor.
 *
 * Quem decide QUANTO se gasta é a regra pura (shared/busca-de-passagens.ts);
 * aqui só se executa: o que está no cache há menos de 3 h não vai ao
 * fornecedor; cada consulta de verdade vira uma linha de consumo; o teto do
 * mês vem de system_settings.
 */
import { and, eq, gte, inArray, sql as drizzleSql } from "drizzle-orm";
import { db, linhasDe } from "../db";
import { buscaPassagensCache, buscaPassagensConsultas, buscaPassagensConsumo, buscaPassagensOpcoes, systemSettings } from "@shared/schema";
import { resumoParaHistorico, type LinhaDeConsumo } from "@shared/consumo-da-busca";
import {
  CHAVE_DO_TETO_MENSAL,
  HORAS_DE_CACHE_DA_BUSCA,
  TETO_MENSAL_PADRAO,
  inicioDoMes,
  type ConsultaDePassagens,
  type ResultadoDaConsulta,
} from "@shared/busca-de-passagens";
import { hojeISO } from "@shared/hoje-sp";
import type { FornecedorDePassagens, LinkDeCompra } from "./fornecedor";
import { criarIgnav } from "./ignav";
import { criarSimulado } from "./simulado";

// ── Fornecedor ─────────────────────────────────────────────────────────────

let fornecedorDeTeste: FornecedorDePassagens | null | undefined;

/** Só para os testes de rota: troca o fornecedor (undefined volta ao padrão). */
export function definirFornecedorParaTestes(f: FornecedorDePassagens | null | undefined): void {
  fornecedorDeTeste = f;
}

/**
 * Com IGNAV_API_KEY → Ignav. Sem chave: simulado no demo/testes/dev; em
 * PRODUÇÃO nenhum (a rota responde "busca não configurada") — preço inventado
 * nunca aparece para Compras.
 */
export function fornecedorAtual(): FornecedorDePassagens | null {
  if (fornecedorDeTeste !== undefined) return fornecedorDeTeste;
  const chave = process.env.IGNAV_API_KEY?.trim();
  if (chave) return criarIgnav(chave);
  if (process.env.PAINEL_DB === "pglite" || process.env.NODE_ENV !== "production") return criarSimulado();
  return null;
}

// ── Cache ──────────────────────────────────────────────────────────────────

export interface EntradaDoCache<T = unknown> {
  resposta: T;
  consultadoEm: Date;
  fornecedor: string;
  consultadoPor: string | null;
}

/** Entradas ainda válidas (menos de HORAS_DE_CACHE_DA_BUSCA) das chaves dadas. */
export async function lerCache<T>(chaves: readonly string[], agora = new Date()): Promise<Map<string, EntradaDoCache<T>>> {
  const out = new Map<string, EntradaDoCache<T>>();
  const unicas = Array.from(new Set(chaves));
  if (unicas.length === 0) return out;
  const limite = new Date(agora.getTime() - HORAS_DE_CACHE_DA_BUSCA * 3600_000);
  const linhas = await db.select().from(buscaPassagensCache)
    .where(and(inArray(buscaPassagensCache.chave, unicas), gte(buscaPassagensCache.consultadoEm, limite)));
  for (const l of linhas) {
    const resposta = typeof l.resposta === "string" ? JSON.parse(l.resposta) : l.resposta;
    out.set(l.chave, { resposta: resposta as T, consultadoEm: new Date(l.consultadoEm), fornecedor: l.fornecedor, consultadoPor: l.consultadoPor ?? null });
  }
  return out;
}

export async function gravarCache(chave: string, fornecedor: string, resposta: unknown, usuarioId: string | null): Promise<Date> {
  const agora = new Date();
  await db.insert(buscaPassagensCache)
    .values({ chave, fornecedor, resposta, consultadoEm: agora, consultadoPor: usuarioId })
    .onConflictDoUpdate({ target: buscaPassagensCache.chave, set: { fornecedor, resposta, consultadoEm: agora, consultadoPor: usuarioId } });
  return agora;
}

// ── Consumo e teto ─────────────────────────────────────────────────────────

/** Início do mês corrente em São Paulo (sem horário de verão desde 2019: UTC−3). */
export function inicioDoMesEmSP(hoje = hojeISO()): Date {
  return new Date(`${inicioDoMes(hoje)}T00:00:00-03:00`);
}

export async function registrarConsumo(tipo: string, chave: string, fornecedor: string, usuarioId: string | null): Promise<void> {
  await db.insert(buscaPassagensConsumo).values({ tipo, chave, fornecedor, usuarioId, doCache: false });
}

/**
 * Resultados que esta pessoa recebeu do cache SEM ter consultado (aba
 * Consumo, "% atendido pelo cache"). Uma linha por pessoa × chave × consulta
 * em cache: abrir a mesma prévia dez vezes conta uma. Não conta no teto.
 */
export async function registrarAcertosDoCache(
  usuarioId: string,
  entradas: ReadonlyArray<{ chave: string; tipo: string; entrada: EntradaDoCache }>,
): Promise<void> {
  const deOutros = entradas.filter((e) => e.entrada.consultadoPor !== usuarioId);
  if (deOutros.length === 0) return;
  const desde = new Date(Math.min(...deOutros.map((e) => e.entrada.consultadoEm.getTime())));
  const ja = await db.select({ chave: buscaPassagensConsumo.chave, em: buscaPassagensConsumo.consultadoEm }).from(buscaPassagensConsumo)
    .where(and(
      eq(buscaPassagensConsumo.usuarioId, usuarioId),
      eq(buscaPassagensConsumo.doCache, true),
      gte(buscaPassagensConsumo.consultadoEm, desde),
      inArray(buscaPassagensConsumo.chave, deOutros.map((e) => e.chave)),
    ));
  const novas = deOutros.filter((e) => !ja.some((j) => j.chave === e.chave && new Date(j.em) >= e.entrada.consultadoEm));
  if (novas.length === 0) return;
  await db.insert(buscaPassagensConsumo).values(novas.map((e) => ({
    tipo: e.tipo, chave: e.chave, fornecedor: e.entrada.fornecedor, usuarioId, doCache: true,
  })));
}

/** Consumo agregado por mês (São Paulo) × usuário × cache × tipo — entrada de resumirConsumo. */
export async function linhasDeConsumo(meses = 6): Promise<LinhaDeConsumo[]> {
  const [a, m] = hojeISO().split("-").map(Number);
  const desde = new Date(`${new Date(Date.UTC(a, m - meses, 1)).toISOString().slice(0, 7)}-01T00:00:00-03:00`);
  const rows = await db.execute(drizzleSql`
    SELECT to_char(consultado_em - interval '3 hours', 'YYYY-MM') AS mes, usuario_id, do_cache, tipo, count(*)::int AS n
    FROM busca_passagens_consumo
    WHERE consultado_em >= ${desde}
    GROUP BY 1, 2, 3, 4
  `);
  return linhasDe<{ mes: string; usuario_id: string | null; do_cache: boolean | string; tipo: string; n: number | string }>(rows)
    .map((l) => ({ mes: l.mes, usuarioId: l.usuario_id, doCache: l.do_cache === true || l.do_cache === "t", tipo: l.tipo, n: Number(l.n) }));
}

/** Guarda a consulta real no HISTÓRICO (para sempre) com as 10 opções mais baratas. */
export async function registrarHistorico(entrada: {
  chave: string;
  consulta: ConsultaDePassagens;
  resultado: ResultadoDaConsulta;
  fornecedor: string;
  usuarioId: string | null;
  vagaIds: string[];
  eventoIds: string[];
  deslocamento: { ida: number; volta: number } | null;
}): Promise<string> {
  const hoje = hojeISO();
  const { menorPrecoCentavos, menorPorCia, opcoes } = resumoParaHistorico(entrada.resultado.itinerarios, entrada.consulta.perna);
  const antecedencia = Math.round((Date.parse(`${entrada.consulta.dataIda}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  const observado = entrada.resultado.observadoEm ? new Date(entrada.resultado.observadoEm) : null;
  const [linha] = await db.insert(buscaPassagensConsultas).values({
    usuarioId: entrada.usuarioId,
    fornecedor: entrada.fornecedor,
    chave: entrada.chave,
    perna: entrada.consulta.perna,
    origem: entrada.consulta.origem,
    destino: entrada.consulta.destino,
    dataIda: entrada.consulta.dataIda,
    dataVolta: entrada.consulta.dataVolta,
    maxParadas: entrada.consulta.maxParadas,
    filtros: { horarioIda: entrada.consulta.horarioIda, horarioVolta: entrada.consulta.horarioVolta },
    deslocamento: entrada.deslocamento,
    vagaIds: entrada.vagaIds,
    eventoIds: entrada.eventoIds,
    antecedenciaDias: antecedencia,
    qtdOpcoes: entrada.resultado.itinerarios.length,
    menorPrecoCentavos,
    menorPorCia,
    observadoEm: observado && !Number.isNaN(observado.getTime()) ? observado : null,
  }).returning({ id: buscaPassagensConsultas.id });
  if (opcoes.length > 0) {
    await db.insert(buscaPassagensOpcoes).values(opcoes.map((o) => ({ ...o, consultaId: linha.id })));
  }
  return linha.id;
}

export async function consumoDoMes(): Promise<number> {
  const r = await db.select({ n: drizzleSql<number>`count(*)::int` }).from(buscaPassagensConsumo)
    .where(and(gte(buscaPassagensConsumo.consultadoEm, inicioDoMesEmSP()), eq(buscaPassagensConsumo.doCache, false)));
  return Number(r[0]?.n ?? 0);
}

export async function tetoMensal(): Promise<number> {
  const [linha] = await db.select().from(systemSettings).where(eq(systemSettings.key, CHAVE_DO_TETO_MENSAL));
  const n = linha ? Number(String(linha.value).trim()) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : TETO_MENSAL_PADRAO;
}

// ── Diária de hotel do evento (para o custo total) ─────────────────────────

/**
 * Diária média das hospedagens já registradas de cada evento (centavos).
 * Evento sem hospedagem com diária → fora do mapa (a tela mostra só o selo).
 */
export async function diariaMediaPorEvento(eventIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = Array.from(new Set(eventIds)).filter(Boolean);
  if (ids.length === 0) return out;
  const rows = await db.execute(drizzleSql`
    SELECT ti.event_id, round(avg(a.daily_rate))::int AS diaria
    FROM accommodations a
    JOIN team_inclusions ti ON ti.id = a.team_inclusion_id
    WHERE ti.event_id IN (${drizzleSql.join(ids.map((id) => drizzleSql`${id}`), drizzleSql`, `)})
      AND ti.deleted_at IS NULL
      AND a.daily_rate > 0
    GROUP BY ti.event_id
  `);
  for (const l of linhasDe<{ event_id: string; diaria: number | string }>(rows)) {
    const v = Number(l.diaria);
    if (Number.isFinite(v) && v > 0) out.set(l.event_id, v);
  }
  return out;
}

// ── Consulta com deduplicação em voo ───────────────────────────────────────

/**
 * Dois cliques (ou dois usuários) pedindo a MESMA chave ao mesmo tempo nesta
 * instância → uma chamada só ao fornecedor; o segundo espera o primeiro.
 */
const emAndamento = new Map<string, Promise<ResultadoDaConsulta>>();

export function consultarUmaVez(chave: string, f: FornecedorDePassagens, c: ConsultaDePassagens): { promessa: Promise<ResultadoDaConsulta>; nova: boolean } {
  const atual = emAndamento.get(chave);
  if (atual) return { promessa: atual, nova: false };
  const promessa = f.buscar(c).finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, promessa);
  return { promessa, nova: true };
}

const linksEmAndamento = new Map<string, Promise<LinkDeCompra[]>>();
export function linksUmaVez(id: string, f: FornecedorDePassagens): { promessa: Promise<LinkDeCompra[]>; nova: boolean } {
  const atual = linksEmAndamento.get(id);
  if (atual) return { promessa: atual, nova: false };
  const promessa = f.linksDeCompra(id).finally(() => linksEmAndamento.delete(id));
  linksEmAndamento.set(id, promessa);
  return { promessa, nova: true };
}
