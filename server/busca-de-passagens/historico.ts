/**
 * Leitura do banco para as análises, a previsão e o acompanhamento da busca
 * de passagens (etapa 2, 09/10). Só LÊ e monta os tipos de entrada das regras
 * puras (shared/analise-da-busca.ts e shared/previsao-da-busca.ts) — nenhuma
 * conta é feita aqui.
 *
 * Datas de calendário saem como texto ("AAAA-MM-DD") direto do banco, e o
 * "dia da consulta" em São Paulo é `consultado_em − 3 h` (sem horário de
 * verão desde 2019) — o mesmo critério do consumo do mês.
 */
import { sql as drizzleSql } from "drizzle-orm";
import { db, linhasDe } from "../db";
import { planejarBusca, type AjusteDaBusca, type EventoDaBusca, type PernaDaRota, type VagaDaBusca } from "@shared/busca-de-passagens";
import { MIN_OPCOES_DO_HORARIO, PERIODOS_DO_DIA, type ConsultaDoHistorico, type HorarioDasOpcoes, type PassagemDaBusca, type SomaDoGrupo, type UsoDaBusca } from "@shared/analise-da-busca";
import type { VagaParaPrevisao } from "@shared/previsao-da-busca";

const bool = (v: unknown) => v === true || v === "t" || v === "true";
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const json = <T>(v: unknown): T | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } }
  return v as T;
};

/** Período das abas: últimos N dias (ou tudo). */
export type Periodo = "90" | "180" | "365" | "tudo";
export const PERIODOS: Periodo[] = ["90", "180", "365", "tudo"];
export const lerPeriodo = (v: unknown): Periodo => (PERIODOS.includes(v as Periodo) ? (v as Periodo) : "180");
export const desdeDoPeriodo = (p: Periodo, agora = Date.now()): Date | null => (p === "tudo" ? null : new Date(agora - Number(p) * 86_400_000));

export async function carregarConsultas(desde: Date | null): Promise<ConsultaDoHistorico[]> {
  const rows = await db.execute(drizzleSql`
    SELECT id, consultado_em, perna, origem, destino,
      to_char(data_ida, 'YYYY-MM-DD') AS data_ida, to_char(data_volta, 'YYYY-MM-DD') AS data_volta,
      to_char(consultado_em - interval '3 hours', 'YYYY-MM-DD') AS dia,
      (deslocamento IS NOT NULL) AS deslocada, antecedencia_dias, menor_preco_centavos, menor_por_cia
    FROM busca_passagens_consultas
    WHERE ${desde ? drizzleSql`consultado_em >= ${desde}` : drizzleSql`TRUE`}
    ORDER BY consultado_em
  `);
  return linhasDe<Record<string, unknown>>(rows).map((l) => ({
    id: String(l.id),
    consultadoEm: new Date(l.consultado_em as string).toISOString(),
    dia: String(l.dia),
    perna: l.perna as PernaDaRota,
    origem: String(l.origem),
    destino: String(l.destino),
    dataIda: String(l.data_ida),
    dataVolta: (l.data_volta as string | null) ?? null,
    deslocada: bool(l.deslocada),
    antecedenciaDias: num(l.antecedencia_dias),
    menorPrecoCentavos: num(l.menor_preco_centavos),
    menorPorCia: json<Record<string, number>>(l.menor_por_cia),
  }));
}

/**
 * Horário das opções JÁ SOMADO no banco (16/10). Antes as opções vinham linha
 * a linha (10 por consulta — dezenas de milhares de linhas, MBs pelo fio) só
 * para virar 4 números por período do dia. A conta é a mesma de
 * `horarioDasOpcoes` (shared/analise-da-busca.ts), e o teste
 * server/test/busca-de-passagens-analises.test.ts compara as duas: consulta
 * com ao menos MIN_OPCOES_DO_HORARIO opções e mediana ≠ 0; índice = preço ÷
 * mediana das opções da consulta (mediana par = média dos dois do meio
 * arredondada, como `mediana`); período pelo `THH:MM` da partida da ida (ou
 * da volta), como `minutoDoDia`.
 */
export async function carregarHorarioDasOpcoes(desde: Date | null): Promise<HorarioDasOpcoes> {
  const periodo = drizzleSql.join(
    PERIODOS_DO_DIA.map((p) => drizzleSql`WHEN minuto BETWEEN ${p.de} AND ${p.ate} THEN ${p.chave}::text`),
    drizzleSql` `,
  );
  // Uma passada só (sem juntar CTEs: o planejador não tem estatística delas e
  // caía num laço aninhado opções × consultas): a posição de cada preço na
  // consulta e o total dão a mediana por janela.
  const rows = await db.execute(drizzleSql`
    WITH o AS (
      SELECT o.consulta_id, o.preco_centavos AS preco, COALESCE(o.ida_partida, o.volta_partida) AS partida,
        row_number() OVER (PARTITION BY o.consulta_id ORDER BY o.preco_centavos) AS pos,
        count(*) OVER (PARTITION BY o.consulta_id) AS total
      FROM busca_passagens_opcoes o
      JOIN busca_passagens_consultas c ON c.id = o.consulta_id
      WHERE ${desde ? drizzleSql`c.consultado_em >= ${desde}` : drizzleSql`TRUE`}
    ), m AS (
      SELECT preco, partida, total,
        round(avg(preco) FILTER (WHERE pos = (total + 1) / 2 OR pos = (total + 2) / 2) OVER (PARTITION BY consulta_id)) AS mediana
      FROM o
    ), i AS MATERIALIZED (
      -- MATERIALIZED: sem isto o Postgres copia a expressão (com a regex) em cada
      -- WHEN do CASE de baixo — 16 regex por linha em vez de 1 (medido: 4× mais lento).
      SELECT preco, preco::float8 / mediana::float8 AS indice, substring(partida from 'T([0-9]{2}:[0-9]{2})') AS hhmm
      FROM m
      WHERE total >= ${MIN_OPCOES_DO_HORARIO} AND mediana <> 0
    ), j AS (
      SELECT preco, indice, left(hhmm, 2)::int * 60 + right(hhmm, 2)::int AS minuto FROM i
    )
    SELECT CASE ${periodo} END AS grupo, count(*) AS itens,
      count(*) FILTER (WHERE preco > 0) AS n,
      COALESCE(sum(preco) FILTER (WHERE preco > 0), 0) AS soma_precos,
      COALESCE(sum(indice) FILTER (WHERE preco > 0), 0) AS soma_indices
    FROM j GROUP BY 1
  `);
  let itens = 0;
  const somas = new Map<string, SomaDoGrupo>();
  for (const l of linhasDe<Record<string, unknown>>(rows)) {
    itens += Number(l.itens);
    const n = Number(l.n);
    if (l.grupo === null || l.grupo === undefined || n === 0) continue;
    somas.set(String(l.grupo), { n, somaPrecos: Number(l.soma_precos), nIndices: n, somaIndices: Number(l.soma_indices) });
  }
  return { itens, somas };
}

/**
 * Passagens registradas (atuais e do histórico de troca) de vagas não
 * excluídas, com quem registrou (o log de criação; na falta, o último a
 * editar). Período: pela data da compra (ou o início do evento, sem compra).
 */
export async function carregarPassagens(desde: Date | null): Promise<PassagemDaBusca[]> {
  const desdeDia = desde ? desde.toISOString().slice(0, 10) : null;
  const rows = await db.execute(drizzleSql`
    SELECT t.id AS ticket_id, ti.event_id, e.name AS event_name, to_char(e.start_date, 'YYYY-MM-DD') AS event_start,
      t.value, t.baggage_total_cents,
      to_char(t.purchase_date, 'YYYY-MM-DD') AS data_compra,
      to_char(t.actual_departure_date, 'YYYY-MM-DD') AS data_ida,
      to_char(t.actual_return_date, 'YYYY-MM-DD') AS data_volta,
      t.actual_return_time AS hora_volta, t.ticket_company,
      COALESCE(NULLIF(trim(t.departure_airport), ''), t.departure_city_origin, NULLIF(trim(t.return_destination_airport), ''), t.return_city_destination) AS origem,
      COALESCE(NULLIF(trim(t.destination_airport), ''), t.departure_city_destination, NULLIF(trim(t.return_origin_airport), ''), t.return_city_origin) AS destino,
      (t.actual_departure_date IS NOT NULL AND t.actual_return_date IS NOT NULL) AS ida_e_volta,
      (t.ida_vem_de_inclusion_id IS NOT NULL) AS trecho_direto,
      COALESCE(lg.user_id, t.updated_by) AS registrado_por_id,
      COALESCE(lg.user_name, u.name) AS registrado_por_nome
    FROM tickets t
    JOIN team_inclusions ti ON ti.id = t.team_inclusion_id
    JOIN events e ON e.id = ti.event_id
    LEFT JOIN LATERAL (
      SELECT s.user_id, s.user_name FROM system_logs s
      WHERE s.entity_type = 'ticket' AND s.entity_id = t.id AND s.action = 'create'
      ORDER BY s.created_at LIMIT 1
    ) lg ON TRUE
    LEFT JOIN users u ON u.id = t.updated_by
    WHERE ti.deleted_at IS NULL
      AND ti.phase <> 'sugestao'
      AND e.status NOT IN ('excluido', 'excluído')
      AND (t.transport_type IS NULL OR t.transport_type = 'aereo')
      -- 28/10: volta de ônibus numa passagem aérea — o valor junta os dois, não é preço de voo.
      AND (t.return_transport_type IS NULL OR t.return_transport_type = 'aereo')
      AND ${desdeDia ? drizzleSql`COALESCE(t.purchase_date, e.start_date) >= ${desdeDia}::date` : drizzleSql`TRUE`}
  `);
  return linhasDe<Record<string, unknown>>(rows).map((l) => ({
    ticketId: String(l.ticket_id),
    eventId: String(l.event_id),
    eventName: String(l.event_name ?? "Evento"),
    eventStart: (l.event_start as string | null) ?? null,
    valor: num(l.value),
    bagagem: num(l.baggage_total_cents),
    dataCompra: (l.data_compra as string | null) ?? null,
    dataIda: (l.data_ida as string | null) ?? null,
    dataVolta: (l.data_volta as string | null) ?? null,
    horaDaVolta: (l.hora_volta as string | null) ?? null,
    companhia: (l.ticket_company as string | null) ?? null,
    origem: (l.origem as string | null) ?? null,
    destino: (l.destino as string | null) ?? null,
    idaEVolta: bool(l.ida_e_volta),
    trechoDireto: bool(l.trecho_direto),
    registradoPorId: (l.registrado_por_id as string | null) ?? null,
    registradoPorNome: (l.registrado_por_nome as string | null) ?? null,
  }));
}

export async function carregarUsos(desde: Date | null): Promise<UsoDaBusca[]> {
  const rows = await db.execute(drizzleSql`
    SELECT b.id, to_char(b.usado_em - interval '3 hours', 'YYYY-MM-DD') AS dia, b.usuario_id, u.name AS usuario_nome,
      b.ticket_id, t.value AS valor_pago, COALESCE(t.ticket_company, b.companhia) AS companhia,
      ti.event_id, e.name AS event_name, b.chave, b.preco_encontrado_centavos
    FROM busca_passagens_usos b
    LEFT JOIN tickets t ON t.id = b.ticket_id
    LEFT JOIN team_inclusions ti ON ti.id = b.team_inclusion_id
    LEFT JOIN events e ON e.id = ti.event_id
    LEFT JOIN users u ON u.id = b.usuario_id
    WHERE ${desde ? drizzleSql`b.usado_em >= ${desde}` : drizzleSql`TRUE`}
  `);
  return linhasDe<Record<string, unknown>>(rows).map((l) => ({
    id: String(l.id),
    dia: String(l.dia),
    usuarioId: (l.usuario_id as string | null) ?? null,
    usuarioNome: (l.usuario_nome as string | null) ?? null,
    ticketId: (l.ticket_id as string | null) ?? null,
    valorPago: num(l.valor_pago),
    companhia: (l.companhia as string | null) ?? null,
    eventId: (l.event_id as string | null) ?? null,
    eventName: (l.event_name as string | null) ?? null,
    chave: String(l.chave),
    precoEncontrado: Number(l.preco_encontrado_centavos),
  }));
}

/** Eventos (não excluídos) no formato da regra da busca. */
export async function carregarEventosDaBusca(): Promise<Map<string, EventoDaBusca & { startDate: string | null }>> {
  const rows = await db.execute(drizzleSql`
    SELECT id, name, location, aeroporto_iata, to_char(start_date, 'YYYY-MM-DD') AS start_date FROM events
  `);
  return new Map(linhasDe<Record<string, unknown>>(rows).map((l) => [String(l.id), {
    id: String(l.id), name: (l.name as string | null) ?? null, location: (l.location as string | null) ?? null,
    aeroportoIata: (l.aeroporto_iata as string | null) ?? null, startDate: (l.start_date as string | null) ?? null,
  }]));
}

/**
 * Escalações que PRECISAM de passagem e ainda NÃO têm (pendentes): vaga ativa,
 * fora da Validação de Escala, não cancelada, de evento não excluído e que
 * ainda não terminou (15/10), com a
 * viagem a partir de hoje. Cada uma com as rotas que a busca consultaria
 * (mesma regra do servidor — planejarBusca) ou o que falta para saber.
 */
export async function carregarPendentes(
  hoje: string,
  somenteIds?: readonly string[],
  /** Ajuste da busca por vaga (o acompanhamento guarda o da hora em que começou). */
  ajustes?: Record<string, AjusteDaBusca | undefined>,
): Promise<VagaParaPrevisao[]> {
  const rows = await db.execute(drizzleSql`
    SELECT ti.id, ti.inclusion_number, ti.event_id, ti.function_id, ti.city, c.city AS cidade_colab, c.full_name,
      f.name AS funcao, ti.needs_ticket,
      -- 16/10: perna registrada como carro/van/ônibus (transporte terrestre) não é aérea.
      COALESCE((SELECT tt.modo FROM transportes_terrestres tt WHERE tt.team_inclusion_id = ti.id AND tt.trecho = 'ida'), ti.transport_mode_ida) AS transport_mode_ida,
      COALESCE((SELECT tt.modo FROM transportes_terrestres tt WHERE tt.team_inclusion_id = ti.id AND tt.trecho = 'volta'), ti.transport_mode_volta) AS transport_mode_volta,
      to_char(ti.flight_departure_date, 'YYYY-MM-DD') AS ida, ti.flight_arrival_suggested_time,
      to_char(ti.flight_return_date, 'YYYY-MM-DD') AS volta, ti.flight_return_suggested_time,
      ti.trechos_sugeridos, ti.ida_vem_do_evento_id, ti.volta_segue_para_evento_id
    FROM team_inclusions ti
    JOIN events e ON e.id = ti.event_id
    LEFT JOIN collaborators c ON c.id = ti.collaborator_id
    LEFT JOIN functions f ON f.id = ti.function_id
    WHERE ti.deleted_at IS NULL
      AND ti.phase <> 'sugestao'
      AND ti.status <> 'cancelado'
      AND ti.needs_ticket = TRUE
      AND e.status NOT IN ('excluido', 'excluído')
      -- Só eventos que ainda não terminaram (15/10): o mesmo recorte padrão da aba Buscar.
      AND e.end_date::date >= ${hoje}::date
      AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.team_inclusion_id = ti.id AND t.archived_at IS NULL)
      AND COALESCE(ti.flight_departure_date, ti.flight_return_date, ti.schedule_start_date, e.start_date)::date >= ${hoje}::date
      ${somenteIds && somenteIds.length > 0 ? drizzleSql`AND ti.id IN (${drizzleSql.join(somenteIds.map((id) => drizzleSql`${id}`), drizzleSql`, `)})` : drizzleSql``}
  `);
  const eventos = await carregarEventosDaBusca();
  const out: VagaParaPrevisao[] = [];
  for (const l of linhasDe<Record<string, unknown>>(rows)) {
    const vaga: VagaDaBusca = {
      id: String(l.id), inclusionNumber: num(l.inclusion_number), eventId: String(l.event_id),
      cidadeDeSaida: (l.city as string | null) || (l.cidade_colab as string | null) || null,
      needsTicket: true,
      transportModeIda: (l.transport_mode_ida as string | null) ?? null,
      transportModeVolta: (l.transport_mode_volta as string | null) ?? null,
      flightDepartureDate: (l.ida as string | null) ?? null,
      flightArrivalSuggestedTime: (l.flight_arrival_suggested_time as string | null) ?? null,
      flightReturnDate: (l.volta as string | null) ?? null,
      flightReturnSuggestedTime: (l.flight_return_suggested_time as string | null) ?? null,
      trechosSugeridos: (l.trechos_sugeridos as string | null) ?? null,
      idaVemDoEventoId: (l.ida_vem_do_evento_id as string | null) ?? null,
      voltaSegueParaEventoId: (l.volta_segue_para_evento_id as string | null) ?? null,
    };
    const plano = planejarBusca({ vagas: [vaga], eventos, hoje, ajustes: ajustes ? { [vaga.id]: ajustes[vaga.id] } : undefined });
    if (plano.faltando.some((f) => f.tipo === "nao_precisa" || f.tipo === "sem_trecho_aereo")) continue;
    const ev = eventos.get(vaga.eventId);
    out.push({
      vagaId: vaga.id,
      numero: vaga.inclusionNumber ?? null,
      colaborador: (l.full_name as string | null) ?? "A definir",
      funcao: (l.funcao as string | null) ?? "Função",
      eventId: vaga.eventId,
      eventName: ev?.name ?? "Evento",
      eventStart: ev?.startDate ?? null,
      rotas: plano.rotas.map((r) => ({ perna: r.perna, origem: r.origem, destino: r.destino, dataIda: r.dataIda, dataVolta: r.dataVolta, chave: r.chave })),
      falta: plano.faltando[0]?.mensagem ?? null,
    });
  }
  return out;
}
