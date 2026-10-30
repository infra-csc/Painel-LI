/**
 * Painéis (30/10) — Atividade recente: o feed das últimas inclusões e
 * mudanças da escala, passagens, hospedagens, pedidos de ajuste e trocas.
 *
 * Pedido do dono: "pegar atualizações/inclusões o mais rápido possível para
 * tomar ações". As telas de trabalho mostram o ESTADO de cada vaga; nenhuma
 * dizia o que MUDOU desde a última vez que alguém olhou.
 *
 * Uma rota só, agregada no servidor:
 *   1. acha as vagas tocadas na janela (logs da vaga, criação/envio/validação/
 *      exclusão, passagem registrada/emitida, hospedagem registrada, trocas e
 *      pedidos abertos ou decididos) — as mais recentes primeiro, até
 *      MAX_VAGAS;
 *   2. monta o histórico de cada uma com `montarHistoricoDaVaga`
 *      (shared/inclusion-timeline.ts) — o MESMO vocabulário e a mesma
 *      deduplicação do histórico do modal da vaga — e fica só com o que
 *      aconteceu dentro da janela;
 *   3. junta os atos em lote (12 vagas criadas no mesmo instante, pelo mesmo
 *      autor, no mesmo evento, viram UMA linha), classifica cada linha num
 *      tipo (inclusão, mudança, passagem, hotel, pedido) e pagina por cursor.
 * Pedidos de INCLUSÃO ainda não aprovados não têm vaga: entram à parte, pelo
 * próprio pedido.
 *
 * Papéis: os mesmos das telas dos Painéis (canAccessScreen3 no client) —
 * admin, Compras e Produção (LOGISTICA_ROLES).
 *
 * Dado pessoal: só NOMES (colaborador, autor). O texto das observações e o
 * valor da diária ficam fora (o título diz que mudaram, sem o conteúdo); os
 * comentários de pedido/troca são cortados em 200 caracteres.
 *
 * Desempenho: a janela vai até 7 dias. `team_inclusion_logs` não tem índice
 * só por `created_at` — numa base grande vale criar
 * `team_inclusion_logs(created_at DESC)` (ver relatório de 30/10).
 */
import type { Express } from "express";
import { and, eq, gte, inArray, sql as drizzleSql } from "drizzle-orm";
import { db, linhasDe } from "../db";
import {
  accommodations, collaborators, events, functions, scalingChangeRequests, teamInclusionLogs, teamInclusions, tickets, users,
} from "@shared/schema";
import { montarHistoricoDaVaga, type EntradaDoHistorico, type FontesDoHistorico } from "@shared/inclusion-timeline";
import { trocaNaVisaoDaVaga, type TrocaCrua } from "@shared/swap-permuta";
import { hojeISO } from "@shared/hoje-sp";
import { LOGISTICA_ROLES, requireRoles } from "./_compartilhado";

// ── Contrato da resposta (espelhado em client/src/components/paineis/comum/atividade-tipos.ts) ──

export type TipoDaAtividade = "inclusao" | "mudanca" | "passagem" | "hotel" | "pedido";
export const TIPOS_DA_ATIVIDADE: TipoDaAtividade[] = ["inclusao", "mudanca", "passagem", "hotel", "pedido"];
export type PeriodoDaAtividade = "hoje" | "24h" | "7d";
export const PERIODOS_DA_ATIVIDADE: PeriodoDaAtividade[] = ["hoje", "24h", "7d"];

export interface VagaDaAtividade {
  id: string;
  numero: number | null;
  funcao: string | null;
  /** Nome do colaborador ATUAL da vaga (ou a empresa da empreita); null = sem nome. */
  colaborador: string | null;
  fase: "sugestao" | "escalacao";
  status: string;
  excluida: boolean;
  precisaPassagem: boolean;
  precisaHotel: boolean;
  /** Pedido de ajuste/exclusão em aberto agora — o link vai direto a ele na Aprovação. */
  pedidoPendenteId: string | null;
  trocaPendente: boolean;
}

export interface ItemDaAtividade {
  id: string;
  /** ISO do acontecimento (no lote, o do primeiro). */
  at: string;
  tipo: TipoDaAtividade;
  titulo: string;
  detalhe: string | null;
  linhas: string[];
  comentario: string | null;
  autor: string | null;
  /** O marco da vaga (colaborador incluído) — o feed destaca. */
  destaque: boolean;
  eventId: string | null;
  eventName: string | null;
  /** As vagas do item (até MAX_VAGAS_NO_ITEM); `quantidade` é o total. */
  vagas: VagaDaAtividade[];
  quantidade: number;
  funcoes: string[];
  precisaPassagem: boolean;
  precisaHotel: boolean;
  /** Pedido citado pelo item (aberto ou decidido) — leva à Aprovação. */
  pedidoId: string | null;
  /** Data do evento (início) — a tela usa para "evento já passou". */
  eventStartDate: string | null;
}

export interface RespostaDaAtividade {
  itens: ItemDaAtividade[];
  /** Cursor da próxima página (null = acabou). */
  proximo: string | null;
  /** Total de itens na janela com os filtros (sem o de tipo, que é o `resumo`). */
  total: number;
  /** Quantos itens de cada tipo na janela (com evento/passagem/hotel aplicados). */
  resumo: Record<TipoDaAtividade, number>;
  desde: string;
  geradoEm: string;
  /** A janela tinha mais vagas tocadas que o limite — o feed mostra as mais recentes. */
  cortado: boolean;
}

// ── Limites ────────────────────────────────────────────────────────────────

const MAX_VAGAS = 3000;
const MAX_VAGAS_NO_ITEM = 30;
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;
const JANELA_DO_LOTE_MS = 10_000;
const MAX_COMENTARIO = 200;

// ── Funções puras (testadas em server/test/paineis.test.ts) ────────────────

/** Início da janela: "hoje" = meia-noite em São Paulo; "24h"/"7d" = agora menos isso. */
export function inicioDoPeriodo(periodo: PeriodoDaAtividade, agora: Date = new Date()): Date {
  if (periodo === "hoje") {
    // Brasil sem horário de verão desde 2019: -03:00 fixo.
    return new Date(`${hojeISO(undefined, agora)}T00:00:00-03:00`);
  }
  return new Date(agora.getTime() - (periodo === "7d" ? 7 : 1) * 86_400_000);
}

/** Status que o servidor DERIVA da passagem/hospedagem — eco do registro, não notícia. */
const STATUS_DE_ECO = new Set([
  "Status: Passagem comprada", "Status: Hospedagem reservada", "Status: Passagem e hospedagem prontas",
  "Status: Aguardando passagem", "Status: Aguardando hospedagem",
]);

/** Em qual filtro de tipo a linha do histórico cai. */
export function tipoDaEntrada(e: Pick<EntradaDoHistorico, "categoria" | "titulo" | "destaque">): TipoDaAtividade {
  if (e.categoria === "passagem" || e.titulo.startsWith("Passagem")) return "passagem";
  if (e.categoria === "hospedagem" || e.titulo.startsWith("Hospedagem")) return "hotel";
  if (e.categoria === "pedido" || e.categoria === "troca") return "pedido";
  if (e.destaque || e.titulo.startsWith("Vaga criada")) return "inclusao";
  return "mudanca";
}

/**
 * Tira o que não é para o feed: compra com dia fixo (sem hora — a "Passagem
 * registrada" já conta), eco de status derivado, e o CONTEÚDO de observação e
 * de valor (só o título diz que mudaram). Comentário cortado.
 */
export function entradaParaOFeed(e: EntradaDoHistorico): EntradaDoHistorico | null {
  if (e.diaFixo) return null;
  if (STATUS_DE_ECO.has(e.titulo)) return null;
  const semConteudo = e.titulo === "Observações alteradas" || e.titulo === "Valor da diária alterado" || e.titulo === "Observação registrada";
  const comentario = e.comentario && e.comentario.length > MAX_COMENTARIO ? `${e.comentario.slice(0, MAX_COMENTARIO - 1)}…` : e.comentario;
  return semConteudo ? { ...e, detalhe: null, linhas: [], comentario: null } : { ...e, comentario };
}

/** O id do pedido citado numa entrada do histórico ("pedido-<id>-aberto"). */
export function pedidoDaEntrada(id: string): string | null {
  const m = /^pedido-(.+)-[a-z_]+$/.exec(id);
  return m ? m[1] : null;
}

/** Título de um lote: "12 vagas criadas", "3 colaboradores incluídos"… */
const PLURAL_DO_LOTE: Record<string, (n: number) => string> = {
  "Vaga criada": (n) => `${n} vagas criadas`,
  "Vaga criada por pedido de inclusão": (n) => `${n} vagas criadas por pedido de inclusão`,
  "Vaga excluída": (n) => `${n} vagas excluídas`,
  "Vaga cancelada": (n) => `${n} vagas canceladas`,
  "Colaborador incluído": (n) => `${n} colaboradores incluídos`,
  "Enviada para validação da área": (n) => `${n} vagas enviadas para validação da área`,
  "Validada pela área": (n) => `${n} vagas validadas pela área`,
  "Aprovada pelo aprovador": (n) => `${n} vagas aprovadas pelo aprovador`,
  "Reprovada pelo aprovador": (n) => `${n} vagas reprovadas pelo aprovador`,
  "Devolvida para a área": (n) => `${n} vagas devolvidas para a área`,
  "Aprovada pelo gestor": (n) => `${n} vagas aprovadas pelo gestor`,
  "Passagem registrada": (n) => `${n} passagens registradas`,
  "Passagem emitida": (n) => `${n} passagens emitidas`,
  "Hospedagem registrada": (n) => `${n} hospedagens registradas`,
  "Período alterado": (n) => `Período alterado em ${n} vagas`,
  "Dias de trabalho alterados": (n) => `Dias de trabalho alterados em ${n} vagas`,
  "Datas de viagem alteradas": (n) => `Datas de viagem alteradas em ${n} vagas`,
};

/** O que é comum aos atos do mesmo lote: o título sem o nome da pessoa. */
export function tituloBase(titulo: string): string {
  if (titulo.startsWith("Colaborador incluído")) return "Colaborador incluído";
  return titulo;
}

export function tituloDoLote(base: string, n: number): string {
  const f = PLURAL_DO_LOTE[base];
  if (f) return f(n);
  return `${base} · ${n} vagas`;
}

function listaCurta(nomes: string[], max = 3): string {
  const unicos = Array.from(new Set(nomes.filter(Boolean)));
  if (unicos.length <= max) return unicos.join(", ");
  return `${unicos.slice(0, max).join(", ")} +${unicos.length - max}`;
}

interface Lote { item: ItemDaAtividade; base: string; t0: number; todas: VagaDaAtividade[]; nomes: string[] }

/** Título de um lote com status: "6 vagas com status “Escalado”". */
function tituloDoLoteDeStatus(base: string, n: number): string | null {
  return base.startsWith("Status: ") ? `${n} vagas com status “${base.slice(8)}”` : null;
}

/**
 * Junta atos do MESMO lote numa linha: mesmo evento, mesmo tipo, mesmo título
 * base, mesmo autor e até 10 s do primeiro. Os atos de um lote podem vir
 * intercalados com outros (a grade grava vaga por vaga, e a criação, o envio e
 * a validação se alternam no mesmo segundo) — por isso o lote fica ABERTO
 * enquanto a janela dele durar, e não só enquanto os itens forem vizinhos.
 * A linha do lote fica na posição do seu primeiro ato.
 */
export function agruparEmLote(itens: ItemDaAtividade[]): ItemDaAtividade[] {
  const slots: (ItemDaAtividade | Lote)[] = [];
  const abertos = new Map<string, Lote>();
  for (const item of itens) {
    const vaga = item.vagas.length === 1 ? item.vagas[0] : null;
    // Só item de UMA vaga entra em lote (pedido de inclusão sem vaga, troca entre duas vagas…).
    if (!vaga) { slots.push(item); continue; }
    const base = tituloBase(item.titulo);
    const t = new Date(item.at).getTime();
    const chave = [item.eventId ?? "", item.tipo, base, item.autor ?? ""].join("|");
    const l = abertos.get(chave);
    if (l && Math.abs(l.t0 - t) <= JANELA_DO_LOTE_MS && !l.todas.some((v) => v.id === vaga.id)) {
      l.todas.push(vaga);
      l.nomes.push(vaga.colaborador ?? "");
      continue;
    }
    const novo: Lote = { item, base, t0: t, todas: [vaga], nomes: [vaga.colaborador ?? ""] };
    abertos.set(chave, novo);
    slots.push(novo);
  }
  return slots.map((s) => {
    if (!("todas" in s)) return s;
    const n = s.todas.length;
    if (n <= 1) return s.item;
    const funcoes = Array.from(new Set(s.todas.map((v) => v.funcao).filter((f): f is string => !!f)));
    return {
      ...s.item,
      titulo: tituloDoLoteDeStatus(s.base, n) ?? tituloDoLote(s.base, n),
      detalhe: s.base === "Colaborador incluído" ? listaCurta(s.nomes) : listaCurta(funcoes),
      linhas: [],
      comentario: null,
      vagas: s.todas.slice(0, MAX_VAGAS_NO_ITEM),
      quantidade: n,
      funcoes,
      precisaPassagem: s.todas.some((v) => v.precisaPassagem),
      precisaHotel: s.todas.some((v) => v.precisaHotel),
      pedidoId: null,
    };
  });
}

/** Ordem do feed: mais recente primeiro; empates juntos por evento e título (para o lote). */
export function ordemDoFeed(a: ItemDaAtividade, b: ItemDaAtividade): number {
  return b.at.localeCompare(a.at)
    || (a.eventId ?? "").localeCompare(b.eventId ?? "")
    || tituloBase(a.titulo).localeCompare(tituloBase(b.titulo))
    || Number(b.destaque) - Number(a.destaque)
    || a.id.localeCompare(b.id);
}

/** Cursor = "<at>|<id>" do último item entregue. */
export function aposOCursor(itens: ItemDaAtividade[], cursor: string | null): ItemDaAtividade[] {
  if (!cursor) return itens;
  const i = itens.findIndex((x) => `${x.at}|${x.id}` === cursor);
  if (i >= 0) return itens.slice(i + 1);
  // O item do cursor sumiu (a janela andou): continua do instante dele.
  const at = cursor.split("|")[0];
  return itens.filter((x) => x.at < at);
}

// ── Banco ──────────────────────────────────────────────────────────────────

type Quando = string | Date | null;
const iso = (q: Quando): string | null => {
  if (!q) return null;
  const d = q instanceof Date ? q : new Date(q);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function emLotes<T>(ids: string[], fn: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 900) out.push(...await fn(ids.slice(i, i + 900)));
  return out;
}

/** As vagas tocadas na janela, a mais recente primeiro. */
async function vagasTocadas(desde: string, eventId: string | null): Promise<{ ids: string[]; cortado: boolean }> {
  const d = drizzleSql`${desde}::timestamptz`;
  const doEvento = eventId ? drizzleSql`AND ti.event_id = ${eventId}` : drizzleSql``;
  const res = await db.execute(drizzleSql`
    SELECT x.id, max(x.at) AS at FROM (
      SELECT team_inclusion_id AS id, created_at AS at FROM team_inclusion_logs WHERE created_at >= ${d}
      UNION ALL SELECT id, created_at FROM team_inclusions WHERE created_at >= ${d}
      UNION ALL SELECT id, suggestion_sent_at FROM team_inclusions WHERE suggestion_sent_at >= ${d}
      UNION ALL SELECT id, validated_at FROM team_inclusions WHERE validated_at >= ${d}
      UNION ALL SELECT id, deleted_at FROM team_inclusions WHERE deleted_at >= ${d}
      UNION ALL SELECT team_inclusion_id, created_at FROM tickets WHERE created_at >= ${d}
      UNION ALL SELECT team_inclusion_id, emitted_at FROM tickets WHERE emitted_at >= ${d}
      UNION ALL SELECT team_inclusion_id, created_at FROM accommodations WHERE created_at >= ${d}
      UNION ALL SELECT team_inclusion_id, created_at FROM swap_requests WHERE created_at >= ${d}
      UNION ALL SELECT team_inclusion_id, reviewed_at FROM swap_requests WHERE reviewed_at >= ${d}
      UNION ALL SELECT paired_inclusion_id, created_at FROM swap_requests WHERE paired_inclusion_id IS NOT NULL AND created_at >= ${d}
      UNION ALL SELECT paired_inclusion_id, reviewed_at FROM swap_requests WHERE paired_inclusion_id IS NOT NULL AND reviewed_at >= ${d}
      UNION ALL SELECT team_inclusion_id, created_at FROM scaling_change_requests WHERE team_inclusion_id IS NOT NULL AND created_at >= ${d}
      UNION ALL SELECT team_inclusion_id, reviewed_at FROM scaling_change_requests WHERE team_inclusion_id IS NOT NULL AND reviewed_at >= ${d}
    ) x
    JOIN team_inclusions ti ON ti.id = x.id
    JOIN events e ON e.id = ti.event_id
    WHERE coalesce(e.status, '') NOT IN ('excluído', 'excluido') ${doEvento}
    GROUP BY x.id
    ORDER BY max(x.at) DESC
    LIMIT ${MAX_VAGAS + 1}
  `);
  const linhas = linhasDe<{ id: string }>(res);
  return { ids: linhas.slice(0, MAX_VAGAS).map((l) => String(l.id)), cortado: linhas.length > MAX_VAGAS };
}

async function montarItens(desde: string, eventId: string | null): Promise<{ itens: ItemDaAtividade[]; cortado: boolean }> {
  const { ids, cortado } = await vagasTocadas(desde, eventId);
  const desdeMs = new Date(desde).getTime();
  // Logs um pouco antes da janela: a deduplicação do histórico olha 2 min em volta.
  const logsDesde = new Date(desdeMs - 5 * 60_000);

  // Sem vaga tocada, `emLotes` não vai ao banco.
  const [vagas, logs, passagens, hospedagens, pedidos, trocas] = await Promise.all([
    emLotes(ids, (lote) => db.select({
      id: teamInclusions.id, inclusionNumber: teamInclusions.inclusionNumber, eventId: teamInclusions.eventId,
      eventName: events.name, eventStartDate: events.startDate, functionName: functions.name,
      collaboratorName: collaborators.fullName, empreitaEmpresa: teamInclusions.empreitaEmpresa,
      status: teamInclusions.status, phase: teamInclusions.phase,
      needsTicket: teamInclusions.needsTicket, needsAccommodation: teamInclusions.needsAccommodation,
      createdAt: teamInclusions.createdAt, suggestionSentAt: teamInclusions.suggestionSentAt,
      validatedAt: teamInclusions.validatedAt, validatedByName: users.name, deletedAt: teamInclusions.deletedAt,
    }).from(teamInclusions)
      .innerJoin(events, eq(events.id, teamInclusions.eventId))
      .leftJoin(functions, eq(functions.id, teamInclusions.functionId))
      .leftJoin(collaborators, eq(collaborators.id, teamInclusions.collaboratorId))
      .leftJoin(users, eq(users.id, teamInclusions.validatedBy))
      .where(inArray(teamInclusions.id, lote))),
    emLotes(ids, (lote) => db.select({
      id: teamInclusionLogs.id, teamInclusionId: teamInclusionLogs.teamInclusionId, action: teamInclusionLogs.action,
      details: teamInclusionLogs.details, previousValue: teamInclusionLogs.previousValue, newValue: teamInclusionLogs.newValue,
      userName: teamInclusionLogs.userName, createdAt: teamInclusionLogs.createdAt,
    }).from(teamInclusionLogs).where(and(inArray(teamInclusionLogs.teamInclusionId, lote), gte(teamInclusionLogs.createdAt, logsDesde)))),
    emLotes(ids, (lote) => db.select({
      id: tickets.id, teamInclusionId: tickets.teamInclusionId, createdAt: tickets.createdAt, purchaseDate: tickets.purchaseDate,
      emittedAt: tickets.emittedAt, emittedByName: users.name, ticketStatus: tickets.ticketStatus, transportType: tickets.transportType,
      returnTransportType: tickets.returnTransportType, departureCityOrigin: tickets.departureCityOrigin, departureCityDestination: tickets.departureCityDestination,
    }).from(tickets).leftJoin(users, eq(users.id, tickets.emittedBy)).where(inArray(tickets.teamInclusionId, lote))),
    emLotes(ids, (lote) => db.select({
      id: accommodations.id, teamInclusionId: accommodations.teamInclusionId, createdAt: accommodations.createdAt,
      hotelName: accommodations.hotelName, checkInDate: accommodations.checkInDate, checkOutDate: accommodations.checkOutDate, hotelStatus: accommodations.hotelStatus,
    }).from(accommodations).where(inArray(accommodations.teamInclusionId, lote))),
    emLotes(ids, (lote) => db.select({
      id: scalingChangeRequests.id, teamInclusionId: scalingChangeRequests.teamInclusionId, createdAt: scalingChangeRequests.createdAt,
      requestType: scalingChangeRequests.requestType, requestedByName: scalingChangeRequests.requestedByName, reason: scalingChangeRequests.reason,
      status: scalingChangeRequests.status, reviewedAt: scalingChangeRequests.reviewedAt, reviewedByName: scalingChangeRequests.reviewedByName,
      reviewComment: scalingChangeRequests.reviewComment,
    }).from(scalingChangeRequests).where(inArray(scalingChangeRequests.teamInclusionId, lote))),
    emLotes(ids, async (lote) => {
      const lista = drizzleSql.join(lote.map((id) => drizzleSql`${id}`), drizzleSql`, `);
      return linhasDe<TrocaCrua>(await db.execute(drizzleSql`
        SELECT sr.*, cc.full_name AS current_collaborator_name, nc.full_name AS new_collaborator_name,
               ti.inclusion_number AS inclusion_number, me.name AS event_name,
               pti.inclusion_number AS paired_inclusion_number, pe.name AS paired_event_name
        FROM swap_requests sr
        LEFT JOIN collaborators cc ON sr.current_collaborator_id = cc.id
        LEFT JOIN collaborators nc ON sr.new_collaborator_id = nc.id
        LEFT JOIN team_inclusions ti ON sr.team_inclusion_id = ti.id
        LEFT JOIN events me ON ti.event_id = me.id
        LEFT JOIN team_inclusions pti ON sr.paired_inclusion_id = pti.id
        LEFT JOIN events pe ON pti.event_id = pe.id
        WHERE sr.team_inclusion_id IN (${lista}) OR sr.paired_inclusion_id IN (${lista})
      `));
    }),
  ]);

  const porVaga = <T extends { teamInclusionId: string | null }>(lista: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const x of lista) {
      if (!x.teamInclusionId) continue;
      const l = m.get(x.teamInclusionId);
      if (l) l.push(x); else m.set(x.teamInclusionId, [x]);
    }
    return m;
  };
  const logsDa = porVaga(logs);
  const passagensDa = porVaga(passagens);
  const hospedagensDa = porVaga(hospedagens);
  const pedidosDa = porVaga(pedidos);
  const trocasDa = new Map<string, TrocaCrua[]>();
  const vistas = new Set<string>();
  for (const t of trocas) {
    // A mesma troca pode vir duas vezes (dois lotes); o par entra nas duas vagas.
    const chave = String(t.id);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    for (const vid of [t.team_inclusion_id, t.paired_inclusion_id]) {
      if (!vid) continue;
      const l = trocasDa.get(vid);
      if (l) l.push(t); else trocasDa.set(vid, [t]);
    }
  }

  const itens: ItemDaAtividade[] = [];
  const trocaJaListada = new Map<string, ItemDaAtividade>();
  for (const v of vagas) {
    const pedidosDaVaga = pedidosDa.get(v.id) ?? [];
    const trocasDaVaga = trocasDa.get(v.id) ?? [];
    const vaga: VagaDaAtividade = {
      id: v.id,
      numero: v.inclusionNumber ?? null,
      funcao: v.functionName ?? null,
      colaborador: v.collaboratorName ?? (v.empreitaEmpresa ? `Empreita · ${v.empreitaEmpresa}` : null),
      fase: v.phase === "sugestao" || String(v.status).startsWith("sugestao_") ? "sugestao" : "escalacao",
      status: v.status,
      excluida: !!v.deletedAt,
      precisaPassagem: !!v.needsTicket,
      precisaHotel: !!v.needsAccommodation,
      pedidoPendenteId: pedidosDaVaga.find((p) => p.status === "pendente")?.id ?? null,
      trocaPendente: trocasDaVaga.some((t) => (t.status ?? "pendente") === "pendente"),
    };
    const fontes: FontesDoHistorico = {
      vaga: { id: v.id, createdAt: v.createdAt, suggestionSentAt: v.suggestionSentAt, validatedAt: v.validatedAt, validatedByName: v.validatedByName, deletedAt: v.deletedAt },
      logs: logsDa.get(v.id) ?? [],
      passagens: passagensDa.get(v.id) ?? [],
      hospedagens: hospedagensDa.get(v.id) ?? [],
      trocas: trocasDaVaga.map((t) => trocaNaVisaoDaVaga(t, v.id)),
      pedidos: pedidosDaVaga,
    };
    for (const bruta of montarHistoricoDaVaga(fontes)) {
      if (new Date(bruta.at).getTime() < desdeMs) continue;
      const e = entradaParaOFeed(bruta);
      if (!e) continue;
      // A troca entre duas vagas (permuta/transferência) entra no histórico das
      // DUAS: uma linha só, com as duas vagas.
      const daTroca = e.id.startsWith("troca-") ? trocaJaListada.get(`${e.id}|${e.titulo}`) : undefined;
      if (daTroca) {
        if (!daTroca.vagas.some((x) => x.id === vaga.id)) {
          daTroca.vagas.push(vaga);
          daTroca.quantidade = daTroca.vagas.length;
          daTroca.funcoes = Array.from(new Set([...daTroca.funcoes, ...(v.functionName ? [v.functionName] : [])]));
          daTroca.precisaPassagem ||= vaga.precisaPassagem;
          daTroca.precisaHotel ||= vaga.precisaHotel;
        }
        continue;
      }
      const novoItem: ItemDaAtividade = {
        id: `${v.id}:${e.id}`,
        at: e.at,
        tipo: tipoDaEntrada(e),
        titulo: e.titulo,
        detalhe: e.detalhe,
        linhas: e.linhas,
        comentario: e.comentario,
        autor: e.autor,
        destaque: !!e.destaque,
        eventId: v.eventId,
        eventName: v.eventName,
        vagas: [vaga],
        quantidade: 1,
        funcoes: v.functionName ? [v.functionName] : [],
        precisaPassagem: vaga.precisaPassagem,
        precisaHotel: vaga.precisaHotel,
        pedidoId: pedidoDaEntrada(e.id) ?? vaga.pedidoPendenteId,
        eventStartDate: v.eventStartDate ? String(v.eventStartDate).slice(0, 10) : null,
      };
      if (e.id.startsWith("troca-")) trocaJaListada.set(`${e.id}|${e.titulo}`, novoItem);
      itens.push(novoItem);
    }
  }

  // Pedidos de INCLUSÃO ainda sem vaga: o pedido é a notícia.
  const inclusoes = await db.select({
    id: scalingChangeRequests.id, eventId: scalingChangeRequests.eventId, eventName: events.name, eventStartDate: events.startDate,
    eventStatus: events.status, functionName: functions.name, requestedByName: scalingChangeRequests.requestedByName,
    reason: scalingChangeRequests.reason, status: scalingChangeRequests.status, createdAt: scalingChangeRequests.createdAt,
    reviewedAt: scalingChangeRequests.reviewedAt, reviewedByName: scalingChangeRequests.reviewedByName, reviewComment: scalingChangeRequests.reviewComment,
  }).from(scalingChangeRequests)
    .innerJoin(events, eq(events.id, scalingChangeRequests.eventId))
    .leftJoin(functions, eq(functions.id, scalingChangeRequests.functionId))
    .where(and(
      drizzleSql`${scalingChangeRequests.teamInclusionId} IS NULL`,
      drizzleSql`(${scalingChangeRequests.createdAt} >= ${desde}::timestamptz OR ${scalingChangeRequests.reviewedAt} >= ${desde}::timestamptz)`,
      eventId ? eq(scalingChangeRequests.eventId, eventId) : undefined,
    ));
  const DECISAO: Record<string, string> = { aprovado: "aprovado", reajustado: "reajustado pelo aprovador", negado: "negado", reenviado_validacao: "devolvido para a área" };
  for (const p of inclusoes) {
    if (["excluído", "excluido"].includes(String(p.eventStatus ?? ""))) continue;
    const comum = {
      tipo: "pedido" as const, detalhe: p.functionName ? `Função: ${p.functionName}` : null, linhas: [], destaque: false,
      eventId: p.eventId, eventName: p.eventName, vagas: [], quantidade: 1, funcoes: p.functionName ? [p.functionName] : [],
      precisaPassagem: false, precisaHotel: false, pedidoId: p.id,
      eventStartDate: p.eventStartDate ? String(p.eventStartDate).slice(0, 10) : null,
    };
    const corta = (s: string | null) => (s && s.length > MAX_COMENTARIO ? `${s.slice(0, MAX_COMENTARIO - 1)}…` : s);
    const aberto = iso(p.createdAt);
    if (aberto && new Date(aberto).getTime() >= desdeMs) {
      itens.push({ ...comum, id: `inclusao:${p.id}:aberto`, at: aberto, titulo: "Pedido de inclusão aberto", comentario: corta(p.reason), autor: p.requestedByName ?? null });
    }
    const revisto = iso(p.reviewedAt);
    if (revisto && p.status !== "pendente" && new Date(revisto).getTime() >= desdeMs) {
      itens.push({ ...comum, id: `inclusao:${p.id}:${p.status}`, at: revisto, titulo: `Pedido de inclusão ${DECISAO[p.status] ?? p.status}`, comentario: corta(p.reviewComment), autor: p.reviewedByName ?? null });
    }
  }

  return { itens: agruparEmLote(itens.sort(ordemDoFeed)), cortado };
}

/** Filtros da tela que o servidor aplica; "atrasados" e "não vistos" são do client. */
export interface FiltrosDaAtividade {
  periodo: PeriodoDaAtividade;
  eventId: string | null;
  tipo: TipoDaAtividade | null;
  comPassagem: boolean;
  comHotel: boolean;
  limite: number;
  cursor: string | null;
}

export function lerFiltros(q: Record<string, unknown>): FiltrosDaAtividade {
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const periodo = texto(q.periodo);
  const tipo = texto(q.tipo);
  const limite = Number.parseInt(String(q.limite ?? ""), 10);
  return {
    periodo: PERIODOS_DA_ATIVIDADE.includes(periodo as PeriodoDaAtividade) ? (periodo as PeriodoDaAtividade) : "24h",
    eventId: texto(q.eventId),
    tipo: TIPOS_DA_ATIVIDADE.includes(tipo as TipoDaAtividade) ? (tipo as TipoDaAtividade) : null,
    comPassagem: q.passagem === "1" || q.passagem === "true",
    comHotel: q.hotel === "1" || q.hotel === "true",
    limite: Number.isFinite(limite) ? Math.min(LIMITE_MAXIMO, Math.max(1, limite)) : LIMITE_PADRAO,
    cursor: texto(q.cursor),
  };
}

export async function consultarAtividade(f: FiltrosDaAtividade, agora: Date = new Date()): Promise<RespostaDaAtividade> {
  const desde = inicioDoPeriodo(f.periodo, agora).toISOString();
  const { itens, cortado } = await montarItens(desde, f.eventId);
  const recorte = itens.filter((i) => (!f.comPassagem || i.precisaPassagem) && (!f.comHotel || i.precisaHotel));
  const resumo = Object.fromEntries(TIPOS_DA_ATIVIDADE.map((t) => [t, 0])) as Record<TipoDaAtividade, number>;
  for (const i of recorte) resumo[i.tipo] += 1;
  const doTipo = f.tipo ? recorte.filter((i) => i.tipo === f.tipo) : recorte;
  const resto = aposOCursor(doTipo, f.cursor);
  const pagina = resto.slice(0, f.limite);
  const ultimo = pagina[pagina.length - 1];
  return {
    itens: pagina,
    proximo: resto.length > f.limite && ultimo ? `${ultimo.at}|${ultimo.id}` : null,
    total: doTipo.length,
    resumo,
    desde,
    geradoEm: agora.toISOString(),
    cortado,
  };
}

export function registrarPaineis(app: Express): void {
  /**
   * GET /api/paineis/atividade?periodo=hoje|24h|7d&eventId=&tipo=&passagem=1&hotel=1&limite=&cursor=
   * → RespostaDaAtividade. Admin, Compras e Produção.
   */
  app.get("/api/paineis/atividade", async (req, res) => {
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
    try {
      const resposta = await consultarAtividade(lerFiltros(req.query as Record<string, unknown>));
      res.set("Cache-Control", "no-store");
      res.json(resposta);
    } catch (error) {
      console.error("Erro ao montar a atividade recente:", error);
      res.status(500).json({ message: "Erro ao carregar a atividade recente" });
    }
  });
}
