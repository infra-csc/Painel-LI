import { db } from "./db";
import { horarioDoCarro, ANTECEDENCIA_MIN, ESPERA_POUSO_MIN } from "@shared/uber-routing";
import { lerPlanilhaDoEspelho, type PessoaDoEvento } from "@shared/mirror-import";
import { chaveDaColuna } from "@shared/mirror-columns";
import { recalcularDiasDaVaga } from "@shared/dias-de-trabalho";
import {
  events,
  teamInclusions,
  collaborators,
  functions,
  tickets,
  accommodations,
  logisticsExtraCosts,
  uberGroups,
  uberGroupMembers,
  hotelRoomGroups,
  hotelRoomGroupMembers,
  systemSettings,
  type Ticket,
} from "@shared/schema";
import { and, asc, eq, getTableColumns, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import {
  hotelTotalCents,
  type MirrorRow,
  type MirrorResponse,
  type MirrorSubtotal,
  type RoomGroup,
  type UberGroup,
} from "@shared/operational-mirror-types";

// ---------- Tipos do espelho operacional ----------
// O contrato (MirrorRow, MirrorTotals, MirrorResponse...) vive em
// shared/operational-mirror-types.ts e é compartilhado com o cliente.
export type { MirrorRow, MirrorResponse } from "@shared/operational-mirror-types";

/**
 * `db` ou a transação aberta por `db.transaction` — os dois expõem as mesmas
 * consultas. Assim a leitura do evento serve tanto ao GET do espelho quanto ao
 * recálculo de sugestões, que roda travado numa transação (23/09).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = Pick<Tx, "select" | "insert" | "update" | "delete" | "execute">;

// ---------- Config de sugestões ----------
interface LogisticsConfig {
  uberTimeWindowMinutes: number;
  uberMaxPeoplePerCar: number;
  /** Antecedência do carro na ida e espera pelo pouso na volta, em minutos. */
  uberAdvanceMinutes: number;
  uberPickupWaitMinutes: number;
  allowTripleRoom: boolean;
  hotelGroupBySameDepartmentPriority: boolean;
  requireSameGenderForSharedRoom: boolean;
  sameFunctionPriority: boolean;
}

async function getLogisticsConfig(): Promise<LogisticsConfig> {
  const settings = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return {
    uberTimeWindowMinutes: parseInt(map["uber_group_time_window_minutes"] || "90", 10),
    uberMaxPeoplePerCar: parseInt(map["uber_max_people_per_car"] || "4", 10),
    // Ajustáveis por evento/cidade: 3h de antecedência é a régua de São Paulo,
    // não uma lei da física.
    uberAdvanceMinutes: parseInt(map["uber_advance_minutes"] || String(ANTECEDENCIA_MIN), 10),
    uberPickupWaitMinutes: parseInt(map["uber_pickup_wait_minutes"] || String(ESPERA_POUSO_MIN), 10),
    allowTripleRoom: (map["allow_triple_room"] || "false") === "true",
    hotelGroupBySameDepartmentPriority: (map["hotel_group_by_same_department_priority"] || "true") === "true",
    // Juntar gente da MESMA FUNÇÃO no quarto (pedido do dono, 28/08). A chave
    // antiga olhava ti.area, que está vazia em todas as escalações do banco.
    sameFunctionPriority: (map["hotel_group_by_same_function_priority"] || "true") === "true",
    requireSameGenderForSharedRoom: (map["require_same_gender_for_shared_room"] || "true") === "true",
  };
}

export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

import { sugerirQuartos } from "@shared/room-pairing";
import { inferirGenero } from "@shared/gender-inference";

// ---------- Passagens: ida e volta em linhas separadas ----------
/**
 * Campos de um trecho, no nome da IDA → nome equivalente na VOLTA. Mesma
 * convenção de client/src/components/tickets/juntar-trechos.ts: o leitor de
 * voucher põe um trecho solto nos campos de IDA, e uma passagem "só volta"
 * fica nos campos de VOLTA.
 */
const IDA_PARA_VOLTA = {
  departureAirport: "returnOriginAirport",
  destinationAirport: "returnDestinationAirport",
  departureCityOrigin: "returnCityOrigin",
  departureCityDestination: "returnCityDestination",
  actualDepartureDate: "actualReturnDate",
  actualDepartureTime: "actualReturnTime",
  actualArrivalTime: "returnArrivalTime",
} as const;
type CampoIda = keyof typeof IDA_PARA_VOLTA;
const CAMPOS_IDA = Object.keys(IDA_PARA_VOLTA) as CampoIda[];

/** Campos que se SOMAM quando a vaga tem mais de uma passagem. */
const CAMPOS_SOMADOS = ["value", "baggageTotalCents"] as const;
/** Campos que se JUNTAM ("ABC123 / DEF456"), como o client já faz. */
const CAMPOS_JUNTADOS = ["locator", "purchaseOrderNumber"] as const;

const vazio = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

type Trecho = Record<CampoIda, unknown>;

function lerTrecho(row: Record<string, unknown>, lado: "ida" | "volta"): Trecho | null {
  const t = {} as Trecho;
  let algum = false;
  for (const k of CAMPOS_IDA) {
    const v = lado === "ida" ? row[k] : row[IDA_PARA_VOLTA[k]];
    t[k] = v ?? null;
    if (!vazio(v)) algum = true;
  }
  return algum ? t : null;
}

const assinaturaDoTrecho = (t: Trecho) =>
  [t.actualDepartureDate, t.actualDepartureTime, t.departureAirport, t.destinationAirport].map((v) => (vazio(v) ? "" : String(v).trim().toUpperCase())).join("|");

/**
 * Junta as passagens de UMA vaga numa só linha para o espelho (23/09).
 *
 * Antes o `Map` por vaga guardava só a ÚLTIMA passagem: quando ida e volta
 * eram registradas em linhas separadas (vouchers diferentes, 15/09), uma delas
 * sumia do espelho e dos totais. Agora:
 *   - o trecho mais cedo vira IDA e o mais tarde vira VOLTA (por data/hora);
 *   - valor e bagagem SOMAM; LOC e OC ficam juntos ("ABC / DEF");
 *   - os demais campos ficam com o último valor preenchido (ordem de criação);
 *   - linha cujo(s) trecho(s) já apareceram em outra (mesmo voucher relido ou
 *     importado duas vezes) é ignorada — somar dobraria o valor.
 *
 * Com UMA passagem devolve o próprio objeto, sem tocar em nada: o formato que
 * o client lê continua byte a byte o mesmo.
 */
export function consolidarPassagens<T extends Record<string, unknown>>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const ordem = (r: Record<string, unknown>) => {
    const c = r.createdAt as Date | string | null | undefined;
    if (!c) return 0;
    const ms = c instanceof Date ? c.getTime() : new Date(c).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };
  const ordenadas = rows.map((r, i) => ({ r, i })).sort((a, b) => ordem(a.r) - ordem(b.r) || a.i - b.i).map((x) => x.r);

  // Trechos de cada linha; linha duplicada (todos os trechos já vistos) sai.
  const vistos = new Set<string>();
  const trechos: { t: Trecho; lado: "ida" | "volta" }[] = [];
  const validas: Record<string, unknown>[] = [];
  for (const r of ordenadas) {
    const ida = lerTrecho(r, "ida");
    const volta = lerTrecho(r, "volta");
    const daLinha = [ida && { t: ida, lado: "ida" as const }, volta && { t: volta, lado: "volta" as const }].filter(Boolean) as { t: Trecho; lado: "ida" | "volta" }[];
    const novos = daLinha.filter(({ t }) => !vistos.has(assinaturaDoTrecho(t)));
    if (daLinha.length > 0 && novos.length === 0) continue; // duplicata
    for (const n of novos) {
      vistos.add(assinaturaDoTrecho(n.t));
      trechos.push(n);
    }
    validas.push(r);
  }
  if (validas.length === 0) validas.push(ordenadas[ordenadas.length - 1]);

  // Último valor preenchido de cada campo, na ordem de criação.
  const base: Record<string, unknown> = {};
  for (const r of validas) {
    for (const [k, v] of Object.entries(r)) {
      if (!(k in base) || v !== null && v !== undefined) base[k] = v;
    }
  }

  for (const k of CAMPOS_SOMADOS) {
    const nums = validas.map((r) => r[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (nums.length > 0) base[k] = nums.reduce((s, n) => s + n, 0);
  }
  for (const k of CAMPOS_JUNTADOS) {
    const distintos: string[] = [];
    for (const r of validas) {
      const v = r[k];
      if (!vazio(v) && !distintos.includes(String(v).trim())) distintos.push(String(v).trim());
    }
    if (distintos.length > 1) base[k] = distintos.join(" / ");
  }
  {
    const anexos: string[] = [];
    for (const r of validas) {
      const lista = r.attachmentIds;
      if (Array.isArray(lista)) for (const a of lista) if (typeof a === "string" && !anexos.includes(a)) anexos.push(a);
    }
    if (anexos.length > 0) base.attachmentIds = anexos;
  }

  if (trechos.length >= 2) {
    // Mais cedo → ida; mais tarde → volta. Ordenação estável: sem data/hora
    // fica na ordem de criação.
    const chave = (t: Trecho) => `${vazio(t.actualDepartureDate) ? "9999-99-99" : String(t.actualDepartureDate).slice(0, 10)} ${vazio(t.actualDepartureTime) ? "99:99" : String(t.actualDepartureTime)}`;
    const porHorario = trechos.map((x, i) => ({ x, i })).sort((a, b) => chave(a.x.t).localeCompare(chave(b.x.t)) || a.i - b.i).map((y) => y.x.t);
    const ida = porHorario[0];
    const volta = porHorario[porHorario.length - 1];
    for (const k of CAMPOS_IDA) {
      base[k] = ida[k] ?? null;
      base[IDA_PARA_VOLTA[k]] = volta[k] ?? null;
    }
  } else if (trechos.length === 1) {
    // Um trecho só: fica do lado em que foi registrado.
    const { t, lado } = trechos[0];
    for (const k of CAMPOS_IDA) base[lado === "ida" ? k : IDA_PARA_VOLTA[k]] = t[k] ?? null;
  }

  return base as T;
}

// ---------- Leitura dos dados do evento ----------
interface BaseDoEvento {
  event: typeof events.$inferSelect;
  inclusions: (typeof teamInclusions.$inferSelect)[];
  collabMap: Map<string, typeof collaborators.$inferSelect>;
  fnMap: Map<string, typeof functions.$inferSelect>;
  ticketByInclusion: Map<string, Ticket>;
  accByInclusion: Map<string, typeof accommodations.$inferSelect>;
}

/**
 * O que o espelho e o recálculo de sugestões precisam de UM evento (23/09).
 *
 * Antes cada chamada lia `collaborators`, `functions`, `tickets` e
 * `accommodations` INTEIROS (sem WHERE) em consultas sequenciais — o custo do
 * espelho de um evento de 20 pessoas era o do banco todo. Agora: as vagas do
 * evento primeiro, e depois só o que pertence a elas, tudo em paralelo.
 */
async function carregarBaseDoEvento(eventId: string, exec: Exec = db): Promise<BaseDoEvento | null> {
  const [[event], todasAsVagas] = await Promise.all([
    exec.select().from(events).where(eq(events.id, eventId)),
    exec.select().from(teamInclusions).where(eq(teamInclusions.eventId, eventId)),
  ]);
  if (!event) return null;

  // Sugestões de escala (phase 'sugestao') ainda não são vagas oficiais — ficam
  // fora do Espelho até a Validação de Escala aprová-las (filtro central).
  const inclusions = todasAsVagas.filter((ti) => !ti.deletedAt && ti.phase !== "sugestao");
  const inclusionIds = inclusions.map((ti) => ti.id);
  const collabIds = Array.from(new Set(inclusions.map((ti) => ti.collaboratorId).filter((x): x is string => !!x)));
  const fnIds = Array.from(new Set(inclusions.map((ti) => ti.functionId).filter((x): x is string => !!x)));

  const [collabRows, fnRows, ticketRows, accRows] = await Promise.all([
    collabIds.length ? exec.select().from(collaborators).where(inArray(collaborators.id, collabIds)) : Promise.resolve([]),
    fnIds.length ? exec.select().from(functions).where(inArray(functions.id, fnIds)) : Promise.resolve([]),
    inclusionIds.length
      ? exec.select().from(tickets).where(inArray(tickets.teamInclusionId, inclusionIds)).orderBy(asc(tickets.createdAt), asc(tickets.id))
      : Promise.resolve([]),
    inclusionIds.length
      ? exec.select().from(accommodations).where(inArray(accommodations.teamInclusionId, inclusionIds)).orderBy(asc(accommodations.createdAt), asc(accommodations.id))
      : Promise.resolve([]),
  ]);

  const collabMap = new Map(collabRows.map((c) => [c.id, c]));
  const fnMap = new Map(fnRows.map((f) => [f.id, f]));

  const ticketsPorVaga = new Map<string, Ticket[]>();
  for (const t of ticketRows) {
    const lista = ticketsPorVaga.get(t.teamInclusionId);
    if (lista) lista.push(t); else ticketsPorVaga.set(t.teamInclusionId, [t]);
  }
  const ticketByInclusion = new Map<string, Ticket>();
  // Array.from: o tsconfig do projeto não fixa `target`, e iterar Map direto não compila.
  for (const [id, lista] of Array.from(ticketsPorVaga.entries())) {
    const t = consolidarPassagens(lista as unknown as Record<string, unknown>[]);
    if (t) ticketByInclusion.set(id, t as unknown as Ticket);
  }

  // Hospedagem: uma por vaga; se houver mais de uma, vale a mais recente
  // (ordem por created_at — antes a ordem era a que o banco quisesse).
  const accByInclusion = new Map<string, typeof accommodations.$inferSelect>();
  for (const a of accRows) accByInclusion.set(a.teamInclusionId, a);

  return { event, inclusions, collabMap, fnMap, ticketByInclusion, accByInclusion };
}

/** Membros dos grupos do evento, via join — sem ler a tabela de membros inteira. */
function membrosDeUberDoEvento(exec: Exec, eventId: string) {
  return exec.select(getTableColumns(uberGroupMembers)).from(uberGroupMembers)
    .innerJoin(uberGroups, eq(uberGroups.id, uberGroupMembers.uberGroupId))
    .where(eq(uberGroups.eventId, eventId));
}
function membrosDeQuartoDoEvento(exec: Exec, eventId: string) {
  return exec.select(getTableColumns(hotelRoomGroupMembers)).from(hotelRoomGroupMembers)
    .innerJoin(hotelRoomGroups, eq(hotelRoomGroups.id, hotelRoomGroupMembers.hotelRoomGroupId))
    .where(eq(hotelRoomGroups.eventId, eventId));
}

/** Agrupa membros por grupo em O(n) — antes era um filter por grupo (grupos × membros). */
function agruparMembros<M extends Record<string, unknown>>(membros: M[], chave: keyof M): Map<string, M[]> {
  const porGrupo = new Map<string, M[]>();
  for (const m of membros) {
    const id = String(m[chave]);
    const lista = porGrupo.get(id);
    if (lista) lista.push(m); else porGrupo.set(id, [m]);
  }
  return porGrupo;
}

type ExtraCost = typeof logisticsExtraCosts.$inferSelect;

/**
 * Índice dos custos extras por (tipo, vaga) e, para o legado sem vaga, por
 * (tipo, colaborador). Devolve os itens na ORDEM ORIGINAL da consulta — o
 * `find` de OC/observação dependia dela. Antes: um filter na lista inteira
 * por linha × tipo.
 */
function indexarExtras(extras: ExtraCost[]) {
  type Item = { i: number; e: ExtraCost };
  const porVaga = new Map<string, Item[]>();
  const porColab = new Map<string, Item[]>();
  extras.forEach((e, i) => {
    if (e.teamInclusionId) {
      const k = `${e.type}|${e.teamInclusionId}`;
      (porVaga.get(k) ?? porVaga.set(k, []).get(k)!).push({ i, e });
    } else if (e.collaboratorId) {
      const k = `${e.type}|${e.collaboratorId}`;
      (porColab.get(k) ?? porColab.set(k, []).get(k)!).push({ i, e });
    }
  });
  return function extrasFor(inclusionId: string, collabId: string | null, type: string) {
    const a = porVaga.get(`${type}|${inclusionId}`) ?? [];
    const b = collabId ? porColab.get(`${type}|${collabId}`) ?? [] : [];
    const items = (a.length && b.length ? [...a, ...b].sort((x, y) => x.i - y.i) : a.length ? a : b).map((x) => x.e);
    const total = items.reduce((s, e) => s + (e.amountCents || 0), 0);
    return {
      total,
      oc: items.find((e) => e.oc)?.oc || null,
      notes: items.find((e) => e.notes)?.notes || null,
      company: items.find((e) => e.company)?.company || null,
      checkIn: items.find((e) => e.checkInReference)?.checkInReference || null,
    };
  };
}

// ---------- Buscar dados consolidados ----------
export async function getOperationalMirror(eventId: string): Promise<MirrorResponse | null> {
  const [base, extras, uberGroupRows, roomGroupRows, uberMemberRows, roomMemberRows] = await Promise.all([
    carregarBaseDoEvento(eventId),
    db.select().from(logisticsExtraCosts).where(eq(logisticsExtraCosts.eventId, eventId)),
    db.select().from(uberGroups).where(eq(uberGroups.eventId, eventId)).orderBy(asc(uberGroups.createdAt), asc(uberGroups.id)),
    db.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.eventId, eventId)).orderBy(asc(hotelRoomGroups.createdAt), asc(hotelRoomGroups.id)),
    membrosDeUberDoEvento(db, eventId),
    membrosDeQuartoDoEvento(db, eventId),
  ]);
  if (!base) return null;
  const { event, inclusions, collabMap, fnMap, ticketByInclusion, accByInclusion } = base;

  const uberMembrosPorGrupo = agruparMembros(uberMemberRows, "uberGroupId");
  const roomMembrosPorGrupo = agruparMembros(roomMemberRows, "hotelRoomGroupId");

  const uberGroupsWithMembers: UberGroup[] = uberGroupRows.map((g) => ({
    ...g,
    members: uberMembrosPorGrupo.get(g.id) ?? [],
  })) as UberGroup[];
  const roomGroupsWithMembers: RoomGroup[] = roomGroupRows.map((g) => ({
    ...g,
    members: roomMembrosPorGrupo.get(g.id) ?? [],
  })) as RoomGroup[];

  // mapear colaborador -> grupo (uber/quarto) do evento
  const collabToUberGroup = new Map<string, any>();
  for (const g of uberGroupsWithMembers) {
    for (const m of g.members) collabToUberGroup.set(m.collaboratorId, g);
  }
  const collabToRoomGroup = new Map<string, any>();
  for (const g of roomGroupsWithMembers) {
    for (const m of g.members) collabToRoomGroup.set(m.collaboratorId, g);
  }

  // extras por inclusão (preferencial) ou colaborador (legado) e tipo
  const extrasFor = indexarExtras(extras);

  const rows: MirrorRow[] = inclusions.map((ti: any) => {
    const collab: any = ti.collaboratorId ? collabMap.get(ti.collaboratorId) : null;
    const fn: any = ti.functionId ? fnMap.get(ti.functionId) : null;
    const ticket: any = ticketByInclusion.get(ti.id) || null;
    const acc: any = accByInclusion.get(ti.id) || null;

    const baggageExtra = extrasFor(ti.id, ti.collaboratorId, "baggage");
    const uberExtra = extrasFor(ti.id, ti.collaboratorId, "uber");
    const carExtra = extrasFor(ti.id, ti.collaboratorId, "car_rental");

    const baggageTotal = (ticket?.baggageTotalCents || 0) + baggageExtra.total;
    const uberGroup = ti.collaboratorId ? collabToUberGroup.get(ti.collaboratorId) : null;
    const roomGroup = ti.collaboratorId ? collabToRoomGroup.get(ti.collaboratorId) : null;

    // ----- Pendências automáticas -----
    const pendencies: string[] = [];
    if (ti.needsTicket && !ticket) pendencies.push("Sem passagem");
    if (ticket && !ticket.locator && !ticket.reservationNumber) pendencies.push("Passagem sem localizador");
    if (ticket && !ticket.purchaseOrderNumber) pendencies.push("Passagem sem OC");
    if (ticket && !ticket.fileUrl && (!ticket.attachmentIds || ticket.attachmentIds.length === 0)) pendencies.push("Passagem sem voucher");
    if (ti.needsAccommodation && !acc) pendencies.push("Sem hospedagem");
    if (acc && !acc.hotelName) pendencies.push("Hospedagem sem hotel");
    if (acc && !acc.reservationNumber) pendencies.push("Hospedagem sem reserva");
    if (acc && !acc.hotelOc) pendencies.push("Hospedagem sem OC");
    if (acc && (!acc.attachmentIds || acc.attachmentIds.length === 0)) pendencies.push("Hospedagem sem anexo");
    if (ti.needsAccommodation && (!collab?.gender || collab.gender === "unknown")) pendencies.push("Sem sexo/gênero cadastrado");
    // Sem gênero ainda dá para sugerir (pareia por função, 28/08). Só é
    // "impossível" quando faltam os dois dados de uma vez.
    if (ti.needsAccommodation && acc && !roomGroup && (!collab?.gender || collab.gender === "unknown") && !ti.functionId) pendencies.push("Impossível sugerir quarto (falta dado)");
    if (ti.needsTicket && ticket && !uberGroup) pendencies.push("Uber sem grupo sugerido");
    if (uberExtra.total > 0 && !uberExtra.oc) pendencies.push("Custo Uber sem OC");
    if (carExtra.total > 0 && !carExtra.oc) pendencies.push("Custo locação sem OC");
    if (ticket?.actualDepartureDate && ti.scheduleStartDate && ticket.actualDepartureDate !== ti.scheduleStartDate && ticket.actualDepartureDate > ti.scheduleStartDate) {
      pendencies.push("Data ida ≠ início da escala");
    }
    if (ticket?.actualReturnDate && ti.scheduleEndDate && ticket.actualReturnDate !== ti.scheduleEndDate && ticket.actualReturnDate < ti.scheduleEndDate) {
      pendencies.push("Data volta ≠ término da escala");
    }

    return {
      teamInclusionId: ti.id,
      collaborator: {
        id: collab?.id || null,
        fullName: collab?.fullName || "(sem colaborador)",
        gender: collab?.gender || null,
        city: collab?.city || null,
        state: collab?.state || null,
        type: collab?.type || null,
      },
      function: {
        id: fn?.id || null,
        name: fn?.name || null,
        costCenter: fn?.costCenter || null,
        area: ti.area || fn?.responsibleArea || null,
      },
      schedule: {
        startDate: ti.scheduleStartDate || null,
        endDate: ti.scheduleEndDate || null,
        flightDepartureDate: ti.flightDepartureDate || null,
        flightReturnDate: ti.flightReturnDate || null,
        dailyRates: ti.dailyRates ?? null,
      },
      ticket,
      accommodation: acc,
      observations: ti.observations || null,
      baggage: { totalCents: baggageTotal, extraCents: baggageExtra.total, oc: ticket?.baggageOc || baggageExtra.oc, notes: ticket?.baggageNotes || baggageExtra.notes, checkIn: baggageExtra.checkIn },
      uber: {
        totalCents: uberExtra.total,
        oc: uberExtra.oc,
        notes: uberExtra.notes,
        checkIn: uberExtra.checkIn,
        suggestedGroupId: uberGroup?.id || null,
        groupName: uberGroup?.groupName || null,
      },
      carRental: { company: carExtra.company, totalCents: carExtra.total, oc: carExtra.oc, notes: carExtra.notes, checkIn: carExtra.checkIn },
      skipUber: !!ti.skipUber,
      // Sinais de "em uso" da regra de pendência por bloco (02/09): quem não
      // precisa de passagem não fica pendente de passagem.
      needsTicket: !!ti.needsTicket,
      needsAccommodation: !!ti.needsAccommodation,
      suggestedRoomGroupId: roomGroup?.id || null,
      roomGroupLabel: roomGroup ? `${roomGroup.roomType || ""} ${roomGroup.confirmed ? "(Confirmado)" : "(Sugestão)"}`.trim() : null,
      pendencies,
    };
  });

  // ----- Totais -----
  let totalTickets = 0, totalHotel = 0, totalBaggage = 0, totalUber = 0, totalCarRental = 0;
  for (const r of rows) {
    totalTickets += r.ticket?.value || 0;
    totalHotel += hotelTotalCents(r);
    totalBaggage += r.baggage.totalCents;
    totalUber += r.uber.totalCents;
    totalCarRental += r.carRental.totalCents;
  }
  const grand = totalTickets + totalHotel + totalBaggage + totalUber + totalCarRental;

  // subtotais por função/departamento
  const byFunction: Record<string, MirrorSubtotal> = {};
  for (const r of rows) {
    const key = r.function.name || "(sem função)";
    if (!byFunction[key]) byFunction[key] = { name: key, tickets: 0, hotel: 0, baggage: 0, uber: 0, carRental: 0, total: 0 };
    const t = r.ticket?.value || 0;
    const h = hotelTotalCents(r);
    byFunction[key].tickets += t;
    byFunction[key].hotel += h;
    byFunction[key].baggage += r.baggage.totalCents;
    byFunction[key].uber += r.uber.totalCents;
    byFunction[key].carRental += r.carRental.totalCents;
    byFunction[key].total += t + h + r.baggage.totalCents + r.uber.totalCents + r.carRental.totalCents;
  }

  // subtotais por departamento (area)
  const byDepartment: Record<string, MirrorSubtotal> = {};
  for (const r of rows) {
    const key = r.function.area || r.function.name || "(sem departamento)";
    if (!byDepartment[key]) byDepartment[key] = { name: key, tickets: 0, hotel: 0, baggage: 0, uber: 0, carRental: 0, total: 0 };
    const t = r.ticket?.value || 0;
    const h = hotelTotalCents(r);
    byDepartment[key].tickets += t;
    byDepartment[key].hotel += h;
    byDepartment[key].baggage += r.baggage.totalCents;
    byDepartment[key].uber += r.uber.totalCents;
    byDepartment[key].carRental += r.carRental.totalCents;
    byDepartment[key].total += t + h + r.baggage.totalCents + r.uber.totalCents + r.carRental.totalCents;
  }

  // subtotais por CONTA (rateio contábil — functions.cost_center)
  const byAccount: Record<string, MirrorSubtotal> = {};
  for (const r of rows) {
    const key = r.function.costCenter || "(sem conta)";
    if (!byAccount[key]) byAccount[key] = { name: key, tickets: 0, hotel: 0, baggage: 0, uber: 0, carRental: 0, total: 0 };
    const t = r.ticket?.value || 0;
    const h = hotelTotalCents(r);
    byAccount[key].tickets += t;
    byAccount[key].hotel += h;
    byAccount[key].baggage += r.baggage.totalCents;
    byAccount[key].uber += r.uber.totalCents;
    byAccount[key].carRental += r.carRental.totalCents;
    byAccount[key].total += t + h + r.baggage.totalCents + r.uber.totalCents + r.carRental.totalCents;
  }

  const pendingCount = rows.reduce((s, r) => s + r.pendencies.length, 0);

  return {
    event: {
      id: event.id,
      name: event.name,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
    },
    rows,
    uberGroups: uberGroupsWithMembers,
    roomGroups: roomGroupsWithMembers,
    totals: {
      tickets: totalTickets,
      hotel: totalHotel,
      baggage: totalBaggage,
      uber: totalUber,
      carRental: totalCarRental,
      grand,
      byFunction: Object.values(byFunction),
      byDepartment: Object.values(byDepartment),
      // Maior primeiro: no fechamento o que importa é onde o dinheiro pesa.
      byAccount: Object.values(byAccount).sort((x, y) => y.total - x.total),
    },
    pendingCount,
    suggestedRoomCount: roomGroupRows.length,
    suggestedUberCount: uberGroupRows.length,
  };
}

// ---------- Edição célula a célula ----------
type FieldTarget =
  | { table: "team_inclusions"; col: string; type: "date" | "text" | "int" }
  | { table: "tickets"; col: string; type: "date" | "text" | "int" }
  | { table: "accommodations"; col: string; type: "date" | "text" | "int" | "bool" }
  | { table: "logistics"; logType: "baggage" | "uber" | "car_rental"; col: string; type: "text" | "int" };

const FIELD_MAP: Record<string, FieldTarget> = {
  // Escala (team_inclusions)
  "schedule.startDate": { table: "team_inclusions", col: "scheduleStartDate", type: "date" },
  "schedule.departureDate": { table: "team_inclusions", col: "flightDepartureDate", type: "date" },
  "schedule.endDate": { table: "team_inclusions", col: "scheduleEndDate", type: "date" },
  "schedule.returnDate": { table: "team_inclusions", col: "flightReturnDate", type: "date" },
  "function.area": { table: "team_inclusions", col: "area", type: "text" },
  "observations": { table: "team_inclusions", col: "observations", type: "text" },
  // Passagem (tickets)
  "ticket.value": { table: "tickets", col: "value", type: "int" },
  "ticket.departureAirport": { table: "tickets", col: "departureAirport", type: "text" },
  "ticket.actualDepartureTime": { table: "tickets", col: "actualDepartureTime", type: "text" },
  "ticket.actualReturnTime": { table: "tickets", col: "actualReturnTime", type: "text" },
  "ticket.returnOriginAirport": { table: "tickets", col: "returnOriginAirport", type: "text" },
  "ticket.locator": { table: "tickets", col: "locator", type: "text" },
  "ticket.ticketCompany": { table: "tickets", col: "ticketCompany", type: "text" },
  "ticket.purchaseOrderNumber": { table: "tickets", col: "purchaseOrderNumber", type: "text" },
  "ticket.checkIn3": { table: "tickets", col: "checkIn3", type: "text" },
  // Hospedagem (accommodations)
  "accommodation.nightsCount": { table: "accommodations", col: "nightsCount", type: "int" },
  "accommodation.roomType": { table: "accommodations", col: "roomType", type: "text" },
  "accommodation.dailyRate": { table: "accommodations", col: "dailyRate", type: "int" },
  "accommodation.lateCheckout": { table: "accommodations", col: "lateCheckout", type: "bool" },
  "accommodation.totalCents": { table: "accommodations", col: "totalCents", type: "int" },
  "accommodation.hotelName": { table: "accommodations", col: "hotelName", type: "text" },
  "accommodation.reservationNumber": { table: "accommodations", col: "reservationNumber", type: "text" },
  // Check-in/out reais da hospedagem — a sugestão de quarto usa acc.checkInDate/checkOutDate
  "accommodation.checkInDate": { table: "accommodations", col: "checkInDate", type: "date" },
  "accommodation.checkInTime": { table: "accommodations", col: "checkInTime", type: "text" },
  "accommodation.checkOutDate": { table: "accommodations", col: "checkOutDate", type: "date" },
  "accommodation.checkOutTime": { table: "accommodations", col: "checkOutTime", type: "text" },
  "accommodation.paymentCompany": { table: "accommodations", col: "paymentCompany", type: "text" },
  "accommodation.hotelOc": { table: "accommodations", col: "hotelOc", type: "text" },
  "accommodation.checkIn4": { table: "accommodations", col: "checkIn4", type: "text" },
  // Bagagem (logistics_extra_costs type baggage)
  "baggage.amountCents": { table: "logistics", logType: "baggage", col: "amountCents", type: "int" },
  "baggage.oc": { table: "logistics", logType: "baggage", col: "oc", type: "text" },
  "baggage.checkIn": { table: "logistics", logType: "baggage", col: "checkInReference", type: "text" },
  // Uber (logistics type uber)
  "uber.amountCents": { table: "logistics", logType: "uber", col: "amountCents", type: "int" },
  "uber.oc": { table: "logistics", logType: "uber", col: "oc", type: "text" },
  "uber.checkIn": { table: "logistics", logType: "uber", col: "checkInReference", type: "text" },
  // Locação (logistics type car_rental)
  "carRental.company": { table: "logistics", logType: "car_rental", col: "company", type: "text" },
  "carRental.amountCents": { table: "logistics", logType: "car_rental", col: "amountCents", type: "int" },
  "carRental.oc": { table: "logistics", logType: "car_rental", col: "oc", type: "text" },
  "carRental.checkIn": { table: "logistics", logType: "car_rental", col: "checkInReference", type: "text" },
};

/**
 * Alvo de um campo do espelho. `Object.hasOwn` de propósito (23/09): com
 * `FIELD_MAP[field]` direto, "__proto__" e "constructor" passavam pela
 * verificação e chegavam ao UPDATE como coluna.
 */
export function alvoDoCampo(field: string): FieldTarget | null {
  return Object.hasOwn(FIELD_MAP, field) ? FIELD_MAP[field] : null;
}

export function coerce(value: any, type: string): any {
  if (value === "" || value === undefined || value === null) {
    return type === "bool" ? false : null;
  }
  if (type === "int") {
    const n = typeof value === "number" ? value : parseInt(String(value), 10);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (type === "bool") return value === true || value === "true" || value === 1 || value === "1";
  if (type === "date") return String(value); // YYYY-MM-DD
  return String(value);
}

/**
 * O que gravar na vaga quando uma célula de team_inclusions muda (23/09).
 * Ao mexer em início/término da escala, refaz workDays e dailyRates com a
 * MESMA regra do PATCH /api/team-inclusions/:id (shared/dias-de-trabalho.ts) —
 * antes o espelho mudava a data e deixava as diárias do jeito antigo.
 */
export function patchDaVaga(
  inclusion: { scheduleStartDate: string | null; scheduleEndDate: string | null },
  col: string,
  value: unknown,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { [col]: value };
  if (col !== "scheduleStartDate" && col !== "scheduleEndDate") return patch;
  const atual = inclusion[col];
  if (value === atual || value === null || value === undefined) return patch;
  const inicio = col === "scheduleStartDate" ? String(value) : inclusion.scheduleStartDate;
  const fim = col === "scheduleEndDate" ? String(value) : inclusion.scheduleEndDate;
  const dias = recalcularDiasDaVaga(inicio, fim);
  if (dias) {
    patch.workDays = dias.workDays;
    patch.dailyRates = dias.dailyRates;
  }
  return patch;
}

export async function patchOperationalMirrorCell(eventId: string, rowId: string, field: string, rawValue: any) {
  const target = alvoDoCampo(field);
  if (!target) throw new Error(`Campo não permitido: ${field}`);

  const value = coerce(rawValue, target.type);

  // Tipo de quarto é um enum na UI (Select); rejeitar valores fora dele.
  if (field === "accommodation.roomType" && value !== null && !["single", "double", "triple"].includes(value)) {
    throw new Error("Tipo de quarto inválido: use single, double ou triple");
  }

  /**
   * Uma transação com a VAGA travada (`FOR UPDATE`). O "busca; se não existe,
   * insere" de passagem/hospedagem corria solto: dois campos do mesmo bloco
   * salvos em paralelo criavam duas passagens para a mesma vaga (a razão do
   * "sequencial de propósito" em routes.ts). Não há unique em
   * tickets.team_inclusion_id — o lock na vaga faz o papel dele.
   */
  return await db.transaction(async (tx) => {
    const [inclusion] = await tx.select().from(teamInclusions).where(eq(teamInclusions.id, rowId)).for("update");
    if (!inclusion || inclusion.eventId !== eventId) throw new Error("Inclusão não encontrada para o evento");

    if (target.table === "team_inclusions") {
      const patch = patchDaVaga(inclusion, target.col, value);
      await tx.update(teamInclusions).set({ ...patch, updatedAt: new Date() } as any).where(eq(teamInclusions.id, rowId));
      return { ok: true };
    }

    if (target.table === "tickets") {
      // Com mais de uma passagem na vaga (ida e volta separadas), edita a mais
      // recente — é a que o espelho usa de base ao consolidar.
      const [existing] = await tx.select({ id: tickets.id }).from(tickets)
        .where(eq(tickets.teamInclusionId, rowId))
        .orderBy(sql`${tickets.createdAt} DESC NULLS LAST`, sql`${tickets.id} DESC`).limit(1);
      if (existing) {
        await tx.update(tickets).set({ [target.col]: value, updatedAt: new Date() } as any).where(eq(tickets.id, existing.id));
      } else {
        await tx.insert(tickets).values({ teamInclusionId: rowId, [target.col]: value } as any);
      }
      return { ok: true };
    }

    if (target.table === "accommodations") {
      const [existing] = await tx.select({ id: accommodations.id }).from(accommodations)
        .where(eq(accommodations.teamInclusionId, rowId))
        .orderBy(sql`${accommodations.createdAt} DESC NULLS LAST`, sql`${accommodations.id} DESC`).limit(1);
      if (existing) {
        await tx.update(accommodations).set({ [target.col]: value, updatedAt: new Date() } as any).where(eq(accommodations.id, existing.id));
      } else {
        await tx.insert(accommodations).values({ teamInclusionId: rowId, [target.col]: value } as any);
      }
      return { ok: true };
    }

    // logistics_extra_costs por inclusão + tipo. Só as linhas que interessam
    // (antes lia todos os extras do evento e filtrava em memória): a da vaga
    // tem preferência; a legada (sem vaga, por colaborador) é o fallback.
    const candidatos = await tx.select().from(logisticsExtraCosts).where(and(
      eq(logisticsExtraCosts.eventId, eventId),
      eq(logisticsExtraCosts.type, target.logType),
      inclusion.collaboratorId
        ? or(eq(logisticsExtraCosts.teamInclusionId, rowId), and(isNull(logisticsExtraCosts.teamInclusionId), eq(logisticsExtraCosts.collaboratorId, inclusion.collaboratorId)))
        : eq(logisticsExtraCosts.teamInclusionId, rowId),
    ));
    const existing = candidatos.find((e) => e.teamInclusionId === rowId) || candidatos.find((e) => !e.teamInclusionId);
    if (existing) {
      await tx.update(logisticsExtraCosts)
        .set({ [target.col]: value, teamInclusionId: rowId, updatedAt: new Date() } as any)
        .where(eq(logisticsExtraCosts.id, existing.id));
    } else {
      await tx.insert(logisticsExtraCosts).values({
        eventId,
        teamInclusionId: rowId,
        collaboratorId: inclusion.collaboratorId || null,
        type: target.logType,
        [target.col]: value,
      } as any);
    }
    return { ok: true };
  });
}

// ---------- Recalcular sugestões (sem sobrescrever confirmados) ----------

/** Um carro sugerido, antes de ir ao banco. */
export interface GrupoUberSugerido {
  groupName: string;
  direction: "ida" | "volta";
  origin: string;
  destination: string;
  date: string;
  time: string | null;
  members: string[];
}

export type UberCand = { collabId: string; date: string; airport: string; hotel: string; minutes: number | null };

/**
 * Agrupa candidatos em carros — regra pura, separada da gravação (23/09).
 * Por data + aeroporto + hotel (não juntar quem vai/vem de locais
 * diferentes), ordenado por horário, dentro da janela e do máximo por carro.
 */
export function montarGruposUber(
  cands: UberCand[],
  direction: "ida" | "volta",
  config: Pick<LogisticsConfig, "uberTimeWindowMinutes" | "uberMaxPeoplePerCar" | "uberAdvanceMinutes" | "uberPickupWaitMinutes">,
): GrupoUberSugerido[] {
  const buckets = new Map<string, UberCand[]>();
  for (const c of cands) {
    const key = `${c.date}|${c.airport}|${c.hotel}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }
  const grupos: GrupoUberSugerido[] = [];
  for (const [key, list] of Array.from(buckets.entries())) {
    // ordenar por horário
    list.sort((a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999));
    let current: UberCand[] = [];
    let anchor: number | null = null;
    const flush = () => {
      if (current.length === 0) return;
      const [date, airport, hotel] = key.split("|");
      // Ida: base → aeroporto (embarcar). Volta: aeroporto → base (buscar).
      const origin = direction === "ida" ? hotel : airport;
      const destination = direction === "ida" ? airport : hotel;
      // Ninguém sai na média: quem voa 04:55 e quem voa 05:50 saíam juntos num
      // horário que servia mal para os dois. O carro é pensado pelo extremo que
      // não pode falhar — ver shared/uber-routing.ts.
      const timeStr = horarioDoCarro(
        current.map((c) => ({ id: c.collabId, data: c.date, aeroporto: c.airport, minutos: c.minutes })),
        direction,
        { antecedenciaMin: config.uberAdvanceMinutes, esperaPousoMin: config.uberPickupWaitMinutes },
      );
      grupos.push({
        groupName: `${direction === "ida" ? "Ida" : "Volta"} ${airport} ${date}`,
        direction, origin, destination, date,
        time: timeStr,
        members: current.map((c) => c.collabId),
      });
    };
    for (const c of list) {
      if (current.length === 0) {
        current.push(c);
        anchor = c.minutes;
        continue;
      }
      // Quem não tem horário não entra em carro alheio: seria decidir por um
      // dado que não existe.
      const within = anchor != null && c.minutes != null && c.minutes - anchor <= config.uberTimeWindowMinutes;
      if (within && current.length < config.uberMaxPeoplePerCar) {
        current.push(c);
      } else {
        flush();
        current = [c];
        anchor = c.minutes;
      }
    }
    flush();
  }
  return grupos;
}

/** INSERT multi-linha em lotes — o Postgres aceita até 65.535 parâmetros por comando. */
const TAMANHO_DO_LOTE = 500;
async function inserirEmLotes<T>(inserir: (lote: T[]) => Promise<unknown>, linhas: T[]) {
  for (let i = 0; i < linhas.length; i += TAMANHO_DO_LOTE) {
    await inserir(linhas.slice(i, i + TAMANHO_DO_LOTE));
  }
}

export async function recalculateLogisticsSuggestions(eventId: string) {
  const config = await getLogisticsConfig();

  /**
   * Uma transação por evento, travada por advisory lock (23/09). Antes eram
   * um DELETE por grupo e um INSERT por membro, soltos: dois cliques em
   * "Refazer sugestões" ao mesmo tempo apagavam e recriavam em paralelo e o
   * evento ficava com os grupos duplicados. O lock faz a segunda chamada
   * esperar a primeira terminar; o rollback garante que uma falha no meio não
   * deixa o evento sem sugestão nenhuma.
   */
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"mirror:" + eventId}))`);

    const base = await carregarBaseDoEvento(eventId, tx);
    if (!base) throw new Error("Evento não encontrado");
    const { inclusions, collabMap, ticketByInclusion, accByInclusion } = base;

    const [existingRoomGroups, roomMembers, existingUberGroups, uberMembers] = await Promise.all([
      tx.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.eventId, eventId)),
      membrosDeQuartoDoEvento(tx, eventId),
      tx.select().from(uberGroups).where(eq(uberGroups.eventId, eventId)),
      membrosDeUberDoEvento(tx, eventId),
    ]);

    // ===== QUARTOS =====
    // Colaboradores já em grupos confirmados ficam onde estão.
    const confirmedRoomGroupIds = new Set(existingRoomGroups.filter((g) => g.confirmed).map((g) => g.id));
    const lockedCollabRoom = new Set<string>();
    for (const m of roomMembers) {
      if (confirmedRoomGroupIds.has(m.hotelRoomGroupId)) lockedCollabRoom.add(m.collaboratorId);
    }
    // Apagar grupos sugeridos (não confirmados) — em lote. Os membros saem
    // antes, explicitamente: não depender do ON DELETE CASCADE existir no
    // banco publicado (dev e produção são bancos diferentes).
    const quartosSugeridos = tx.select({ id: hotelRoomGroups.id }).from(hotelRoomGroups)
      .where(and(eq(hotelRoomGroups.eventId, eventId), eq(hotelRoomGroups.confirmed, false)));
    await tx.delete(hotelRoomGroupMembers).where(inArray(hotelRoomGroupMembers.hotelRoomGroupId, quartosSugeridos));
    await tx.delete(hotelRoomGroups).where(and(eq(hotelRoomGroups.eventId, eventId), eq(hotelRoomGroups.confirmed, false)));

    // Candidatos a quarto: inclusões com hospedagem e colaborador, não travados
    const roomCandidates = inclusions.filter((ti) => {
      if (!ti.collaboratorId) return false;
      if (lockedCollabRoom.has(ti.collaboratorId)) return false;
      const acc = accByInclusion.get(ti.id);
      return ti.needsAccommodation || !!acc;
    }).map((ti) => {
      const acc = accByInclusion.get(ti.id);
      const collab = collabMap.get(ti.collaboratorId!);
      return {
        inclusion: ti,
        collab,
        acc,
        hotelName: acc?.hotelName || null,
        checkIn: acc?.checkInDate || ti.scheduleStartDate || null,
        checkOut: acc?.checkOutDate || ti.scheduleEndDate || null,
        // Sem gênero no cadastro, o primeiro nome dá o palpite (96% da base
        // é reconhecida). O cadastro SEMPRE vence; nome ambíguo fica "unknown"
        // e cai na regra de mesma função.
        gender: (collab?.gender && collab.gender !== "unknown")
          ? collab.gender
          : (inferirGenero(collab?.fullName || "").genero || "unknown"),
        area: ti.area || null,
        functionId: ti.functionId || null,
        functionName: null as string | null,
      };
    });

    // A regra de quem divide com quem mora em shared/room-pairing.ts, com
    // testes sobre casos reais de evento: pareia por NOITES EM COMUM (e não por
    // datas idênticas), respeita gênero quando ele existe e, quando não existe,
    // só junta pessoas da mesma função.
    const sugeridos = sugerirQuartos(
      roomCandidates.map((c) => ({
        collaboratorId: c.inclusion.collaboratorId!,
        checkIn: c.checkIn,
        checkOut: c.checkOut,
        hotelName: c.hotelName,
        gender: c.gender,
        functionId: c.functionId,
        functionName: c.functionName,
      })),
      {
        allowTripleRoom: config.allowTripleRoom,
        requireSameGenderForSharedRoom: config.requireSameGenderForSharedRoom,
        sameFunctionPriority: config.sameFunctionPriority,
      },
    );
    // Ids gerados aqui: o INSERT multi-linha não promete devolver o RETURNING
    // na ordem dos VALUES, e os membros precisam apontar para o grupo certo.
    const groupsToCreate = sugeridos.map((q) => ({
      id: randomUUID(),
      eventId,
      hotelName: q.hotelName,
      roomType: q.roomType as string,
      genderRule: q.genderRule as string,
      checkInDate: q.checkIn,
      checkOutDate: q.checkOut,
      // Quem divide quarto com períodos diferentes precisa ser conferido com o
      // hotel (entrada/saída em dias distintos), então a sugestão já diz isso.
      notes: q.partialOverlap
        ? `Datas diferentes entre os ocupantes — ${q.sharedNights} ${q.sharedNights === 1 ? "noite" : "noites"} em comum. Confirme entrada/saída com o hotel.`
        : null,
      suggested: true,
      confirmed: false,
      members: q.members,
    }));

    if (groupsToCreate.length > 0) {
      await inserirEmLotes(
        (lote) => tx.insert(hotelRoomGroups).values(lote.map(({ members: _m, ...g }) => g)),
        groupsToCreate,
      );
      await inserirEmLotes(
        (lote) => tx.insert(hotelRoomGroupMembers).values(lote),
        groupsToCreate.flatMap((g) => g.members.map((cid) => ({ hotelRoomGroupId: g.id, collaboratorId: cid, confirmed: false }))),
      );
    }

    // ===== UBER =====
    const confirmedUberGroupIds = new Set(existingUberGroups.filter((g) => g.confirmed).map((g) => g.id));
    const lockedCollabUber = new Set<string>();
    for (const m of uberMembers) {
      if (confirmedUberGroupIds.has(m.uberGroupId)) lockedCollabUber.add(m.collaboratorId);
    }
    const carrosSugeridos = tx.select({ id: uberGroups.id }).from(uberGroups)
      .where(and(eq(uberGroups.eventId, eventId), eq(uberGroups.confirmed, false)));
    await tx.delete(uberGroupMembers).where(inArray(uberGroupMembers.uberGroupId, carrosSugeridos));
    await tx.delete(uberGroups).where(and(eq(uberGroups.eventId, eventId), eq(uberGroups.confirmed, false)));

    // Construir candidatos de ida e volta a partir das passagens
    // hotel = ponto comum no destino/local do evento (separa quem vai para lugares diferentes)
    /**
     * O carro é na cidade de ORIGEM (31/08): a equipe sai da base para embarcar e
     * é buscada quando pousa de volta. Antes o agrupamento usava o aeroporto de
     * DESTINO na ida, como se o Uber fosse no destino da viagem.
     *
     * Ida: hora do VOO (é dela que sai a antecedência).
     * Volta: hora do POUSO (é dela que sai a espera) — a hora da decolagem
     * deixava quem lia fazendo a conta de cabeça.
     */
    const idaCands: UberCand[] = [];
    const voltaCands: UberCand[] = [];
    for (const ti of inclusions) {
      if (!ti.collaboratorId || lockedCollabUber.has(ti.collaboratorId)) continue;
      // Dispensado da roteirização: não entra em carro, não gera custo e não
      // puxa o horário de ninguém. Antes essas pessoas apareciam num carro que
      // ninguém ia usar.
      if (ti.skipUber) continue;
      const ticket = ticketByInclusion.get(ti.id);
      if (!ticket) continue;
      const acc = accByInclusion.get(ti.id);
      const hotel = acc?.hotelName || "Hotel/Local do evento";
      if (ticket.actualDepartureDate && (ticket.departureAirport || ticket.departureCityOrigin)) {
        idaCands.push({
          collabId: ti.collaboratorId,
          date: ticket.actualDepartureDate,
          airport: ticket.departureAirport || ticket.departureCityOrigin || "",
          hotel,
          minutes: timeToMinutes(ticket.actualDepartureTime),
        });
      }
      if (ticket.actualReturnDate && (ticket.returnDestinationAirport || ticket.returnCityDestination || ticket.departureAirport)) {
        voltaCands.push({
          collabId: ti.collaboratorId,
          date: ticket.actualReturnDate,
          airport: ticket.returnDestinationAirport || ticket.returnCityDestination || ticket.departureAirport || "",
          hotel,
          // Pouso da volta; sem ele, a decolagem — que é o melhor palpite que sobra.
          minutes: timeToMinutes(ticket.returnArrivalTime) ?? timeToMinutes(ticket.actualReturnTime),
        });
      }
    }

    const carros = [
      ...montarGruposUber(idaCands, "ida", config),
      ...montarGruposUber(voltaCands, "volta", config),
    ].map((g) => ({ id: randomUUID(), ...g }));

    if (carros.length > 0) {
      await inserirEmLotes(
        (lote) => tx.insert(uberGroups).values(lote.map((g) => ({
          id: g.id,
          eventId,
          groupName: g.groupName,
          direction: g.direction,
          origin: g.origin,
          destination: g.destination,
          date: g.date,
          // O cálculo fica registrado à parte do que vale: é o que permite
          // dizer "isto foi ajustado à mão" e mostrar o que o sistema sugeria.
          time: g.time,
          suggestedTime: g.time,
          suggested: true,
          confirmed: false,
          status: "sugerido",
        }))),
        carros,
      );
      await inserirEmLotes(
        (lote) => tx.insert(uberGroupMembers).values(lote),
        carros.flatMap((g) => g.members.map((cid) => ({ uberGroupId: g.id, collaboratorId: cid, confirmed: false }))),
      );
    }

    return { ok: true, roomGroupsCreated: groupsToCreate.length };
  });
}

// ---------- Excel: leitura e export ----------
import * as XLSX from "xlsx";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Linhas que uma aba pode ter para ser lida. Um evento tem dezenas de pessoas, não milhares. */
export const LIMITE_DE_LINHAS_DA_PLANILHA = 5000;
/** Tempo máximo para o worker responder a uma leitura. */
const TEMPO_MAXIMO_DE_LEITURA_MS = 45_000;

interface AbaLida { matriz: unknown[][]; truncada: boolean }
/** Quem lê a planilha: no worker (padrão) ou no próprio processo (fallback). */
interface LeitorDePlanilha {
  nomes(): Promise<string[]>;
  aba(nome: string): Promise<AbaLida>;
  fechar(): void;
}

/**
 * Código que roda DENTRO do worker — JavaScript puro numa string, sem imports
 * do projeto (o worker não passa pelo tsx/esbuild). Recebe o caminho do xlsx
 * já resolvido pelo processo principal; `require` solto num worker `eval`
 * resolve a partir do cwd, que em produção não é a raiz do projeto.
 *
 * Só a aba pedida é interpretada (`sheets: [nome]`) e só até o limite de
 * linhas (`sheetRows`); `dense` guarda a aba como matriz, mais leve que um
 * objeto por célula. `cellDates: false` de propósito — ver lerPlanilhaParaOEspelho.
 */
const CODIGO_DO_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const XLSX = require(workerData.xlsxPath);
const buf = Buffer.from(workerData.buffer);
const limite = workerData.limite;
parentPort.on("message", (msg) => {
  try {
    if (msg.acao === "nomes") {
      const wb = XLSX.read(buf, { type: "buffer", bookSheets: true });
      parentPort.postMessage({ ok: true, nomes: wb.SheetNames });
      return;
    }
    if (msg.acao === "aba") {
      const wb = XLSX.read(buf, { type: "buffer", cellDates: false, sheets: [msg.nome], sheetRows: limite + 1, dense: true });
      const ws = wb.Sheets[msg.nome];
      const matriz = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) : [];
      parentPort.postMessage({ ok: true, matriz, truncada: matriz.length > limite });
      return;
    }
    parentPort.postMessage({ ok: false, erro: "ação desconhecida: " + msg.acao });
  } catch (e) {
    parentPort.postMessage({ ok: false, erro: String((e && e.message) || e) });
  }
});
`;

function leitorEmWorker(arquivo: Buffer, limite: number): LeitorDePlanilha {
  const xlsxPath = createRequire(import.meta.url).resolve("xlsx");
  // Cópia exata do trecho do arquivo, transferida (não clonada) para o worker.
  const buffer = arquivo.buffer.slice(arquivo.byteOffset, arquivo.byteOffset + arquivo.byteLength);
  const worker = new Worker(CODIGO_DO_WORKER, { eval: true, workerData: { buffer, xlsxPath, limite }, transferList: [buffer] });
  let ocupado: Promise<unknown> = Promise.resolve();

  const pedir = <T>(msg: Record<string, unknown>): Promise<T> => {
    // Uma pergunta por vez: o protocolo é pergunta → resposta.
    const p = ocupado.then(() => new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        limpar();
        void worker.terminate();
        reject(new Error("A leitura da planilha demorou demais. Tente um arquivo menor ou só com a aba do evento."));
      }, TEMPO_MAXIMO_DE_LEITURA_MS);
      const onMessage = (r: any) => {
        limpar();
        if (r?.ok) resolve(r as T);
        else reject(new Error(r?.erro || "Falha ao ler a planilha."));
      };
      const onError = (e: Error) => { limpar(); reject(e); };
      const onExit = (code: number) => { limpar(); reject(new Error(`O leitor da planilha encerrou inesperadamente (código ${code}).`)); };
      const limpar = () => {
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
      };
      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.on("exit", onExit);
      worker.postMessage(msg);
    }));
    ocupado = p.catch(() => undefined);
    return p;
  };

  return {
    nomes: async () => (await pedir<{ nomes: string[] }>({ acao: "nomes" })).nomes,
    aba: async (nome) => {
      const r = await pedir<{ matriz: unknown[][]; truncada: boolean }>({ acao: "aba", nome });
      return { matriz: r.matriz, truncada: r.truncada };
    },
    fechar: () => { void worker.terminate(); },
  };
}

/** Mesmo algoritmo do worker, no processo — para quando o worker não sobe. */
function leitorNoProcesso(arquivo: Buffer, limite: number): LeitorDePlanilha {
  return {
    nomes: async () => XLSX.read(arquivo, { type: "buffer", bookSheets: true }).SheetNames,
    aba: async (nome) => {
      const wb = XLSX.read(arquivo, { type: "buffer", cellDates: false, sheets: [nome], sheetRows: limite + 1, dense: true });
      const ws = wb.Sheets[nome];
      const matriz = ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" }) : [];
      return { matriz, truncada: matriz.length > limite };
    },
    fechar: () => {},
  };
}

export interface PlanilhaLida {
  nomes: string[];
  /** Aba escolhida (a que tem o cabeçalho; senão a primeira). */
  escolhida: { nome: string; matriz: unknown[][] } | null;
  /** Aba que passou do limite de linhas — a leitura para nela. */
  abaGrande: string | null;
}

/** A aba tem a linha de cabeçalho do template ("NOME" e "DEPARTAMENTO")? */
export function temCabecalhoDoEspelho(m: unknown[][]): boolean {
  return m.some((linha) => {
    if (!Array.isArray(linha)) return false;
    const chaves = linha.map(chaveDaColuna);
    return chaves.includes("NOME") && chaves.includes("DEPARTAMENTO");
  });
}

/**
 * Lê a planilha fora da thread principal (23/09). `XLSX.read` +
 * `sheet_to_json` são síncronos; num arquivo de 10 MB com três abas eles
 * paravam o servidor inteiro por segundos — para todo mundo, não só para
 * quem importava. A leitura roda em `worker_threads`, uma aba por vez,
 * e para na primeira que tem o cabeçalho do template.
 */
export async function lerPlanilhaEmWorker(arquivo: Buffer, limite = LIMITE_DE_LINHAS_DA_PLANILHA): Promise<PlanilhaLida> {
  let leitor: LeitorDePlanilha;
  try {
    leitor = leitorEmWorker(arquivo, limite);
  } catch (e) {
    console.warn("[espelho] worker da planilha indisponível, lendo no processo:", (e as Error)?.message);
    leitor = leitorNoProcesso(arquivo, limite);
  }
  try {
    const nomes = await leitor.nomes();
    let primeira: { nome: string; matriz: unknown[][] } | null = null;
    for (const nome of nomes) {
      const { matriz, truncada } = await leitor.aba(nome);
      if (truncada) return { nomes, escolhida: null, abaGrande: nome };
      if (temCabecalhoDoEspelho(matriz)) return { nomes, escolhida: { nome, matriz }, abaGrande: null };
      if (!primeira) primeira = { nome, matriz };
    }
    return { nomes, escolhida: primeira, abaGrande: null };
  } finally {
    leitor.fechar();
  }
}

/**
 * Lê a planilha do espelho e devolve o que MUDARIA — sem gravar (31/08).
 *
 * A equipe já trabalha nesse arquivo: exporta, preenche em lote (uma agência
 * manda 30 localizadores de uma vez) e devolve. O caminho de volta não existia,
 * e cada célula voltava para o sistema na mão.
 *
 * Preview e gravação são chamadas separadas de propósito: ninguém aplica 200
 * alterações num evento sem ver antes o que vai mudar.
 *
 * `cellDates: false` de propósito.
 *
 * Com `true`, uma célula de HORA volta como Date de 30/12/1899 montada com o
 * fuso local embutido: a célula que mostra 15:55 chega como
 * "1899-12-30T19:01:28Z", e ler as horas dela dá 16:01 — hora errada, gravada
 * em silêncio. O valor cru (0,6631944 = fração do dia) converte exato, e é o
 * mesmo caminho já usado para as datas em número de série.
 *
 * A aba com os dados, não a primeira do arquivo.
 *
 * A planilha que a equipe usa tem três abas — "DASH", a do evento e "NÃO
 * MEXER" — e a de dados é a do meio. Ler sempre a primeira fazia a
 * importação recusar o arquivo inteiro dizendo que o formato era inválido.
 */
export async function lerPlanilhaParaOEspelho(eventId: string, arquivo: Buffer) {
  // O espelho (banco) e a planilha (worker) não dependem um do outro.
  const [data, planilha] = await Promise.all([getOperationalMirror(eventId), lerPlanilhaEmWorker(arquivo)]);
  if (!data) return null;

  if (planilha.abaGrande) {
    return {
      linhas: [],
      avisos: [`A aba "${planilha.abaGrande}" tem mais de ${LIMITE_DE_LINHAS_DA_PLANILHA.toLocaleString("pt-BR")} linhas. Exporte a planilha pelo botão "Exportar planilha", preencha sobre ela e mande só as linhas do evento.`],
      formatoInvalido: true,
    };
  }
  if (planilha.nomes.length === 0 || !planilha.escolhida) {
    return { linhas: [], avisos: ["A planilha está vazia."], formatoInvalido: true };
  }
  const { nome: nomeDaAba, matriz } = planilha.escolhida;

  const pessoas: PessoaDoEvento[] = data.rows.map((r) => ({
    teamInclusionId: r.teamInclusionId,
    nome: r.collaborator.fullName,
    ler: (campo: string) => lerCampoDaLinha(r, campo),
  }));

  const leitura = lerPlanilhaDoEspelho(matriz, pessoas);
  if (planilha.nomes.length > 1 && !leitura.formatoInvalido) {
    leitura.avisos.unshift(`Li a aba "${nomeDaAba}" — o arquivo tem ${planilha.nomes.length} abas.`);
  }
  return leitura;
}

/** Valor atual de um campo do espelho, pelo caminho que a planilha usa. */
function lerCampoDaLinha(r: MirrorRow, campo: string): unknown {
  const [grupo, chave] = campo.split(".");
  if (grupo === "schedule") {
    const s = r.schedule as unknown as Record<string, unknown>;
    if (chave === "departureDate") return s.flightDepartureDate;
    if (chave === "returnDate") return s.flightReturnDate;
    return s[chave];
  }
  if (grupo === "baggage" && chave === "amountCents") return r.baggage.extraCents;
  if (grupo === "uber" && chave === "amountCents") return r.uber.totalCents;
  if (grupo === "carRental" && chave === "amountCents") return r.carRental.totalCents;
  const bloco = (r as unknown as Record<string, unknown>)[grupo] as Record<string, unknown> | null;
  return bloco ? bloco[chave] : null;
}

export async function exportOperationalMirrorExcel(eventId: string): Promise<Buffer | null> {
  const data = await getOperationalMirror(eventId);
  if (!data) return null;

  // Ordem EXATA do anexo modelo
  const header = [
    "NOME", "DEPARTAMENTO",
    "INÍCIO", "DATA IDA", "TÉRMINO", "DATA VOLTA",
    "PASSAGENS TT R$", "AERO IDA", "HR IDA", "HR VOLTA", "AERO VOLTA", "LOCALIZADOR", "EMPRESA", "OC", "CHECK IN 3",
    "DIÁRIAS", "QUARTO", "R$ DIARIA H", "LATE CHECK OUT", "HOTEL TT R$", "HOTEL", "EMPRESA PAGAMENTO", "OC", "CHECK IN 4",
    "BAGAGEM TT R$", "OC", "CHECK IN 1",
    "UBER TT R$", "OC", "CHECK IN 2",
    "EMPRESA LOCAÇÃO", "TT R$", "OC", "CHECK IN",
    "PENDÊNCIAS",
  ];

  const aoa: any[][] = [];
  aoa.push([`Evento: ${data.event.name}`]);
  aoa.push([`Endereço: ${data.event.location || ""}`]);
  aoa.push([`Data: ${data.event.startDate} a ${data.event.endDate}`]);
  aoa.push([]);
  aoa.push(header);

  for (const r of data.rows) {
    const hotelTotal = hotelTotalCents(r);
    aoa.push([
      r.collaborator.fullName,
      r.function.area || r.function.name || "",
      r.schedule.startDate || "",
      r.schedule.flightDepartureDate || "",
      r.schedule.endDate || "",
      r.schedule.flightReturnDate || "",
      r.ticket?.value ? brl(r.ticket.value) : "",
      r.ticket?.departureAirport || "",
      r.ticket?.actualDepartureTime || "",
      r.ticket?.actualReturnTime || "",
      r.ticket?.returnOriginAirport || "",
      // reservationNumber é campo legado que não existe mais no schema de tickets;
      // mantido como fallback para não alterar o comportamento da exportação.
      r.ticket?.locator || (r.ticket as { reservationNumber?: string | null } | null)?.reservationNumber || "",
      r.ticket?.ticketCompany || "",
      r.ticket?.purchaseOrderNumber || "",
      r.ticket?.checkIn3 || "",
      r.accommodation?.nightsCount ?? "",
      r.accommodation?.roomType || "",
      r.accommodation?.dailyRate ? brl(r.accommodation.dailyRate) : "",
      r.accommodation?.lateCheckout ? "Sim" : "",
      hotelTotal ? brl(hotelTotal) : "",
      r.accommodation?.hotelName || "",
      r.accommodation?.paymentCompany || "",
      r.accommodation?.hotelOc || "",
      r.accommodation?.checkIn4 || "",
      r.baggage.totalCents ? brl(r.baggage.totalCents) : "",
      r.baggage.oc || "",
      r.baggage.checkIn || "",
      r.uber.totalCents ? brl(r.uber.totalCents) : "",
      r.uber.oc || "",
      r.uber.checkIn || "",
      r.carRental.company || "",
      r.carRental.totalCents ? brl(r.carRental.totalCents) : "",
      r.carRental.oc || "",
      r.carRental.checkIn || "",
      r.pendencies.join("; "),
    ]);
  }

  // Subtotais
  aoa.push([]);
  aoa.push(["SUBTOTAIS POR FUNÇÃO"]);
  aoa.push(["Função", "Passagem", "Hospedagem", "Bagagem", "Uber", "Locação", "Total"]);
  for (const f of data.totals.byFunction) {
    aoa.push([f.name, brl(f.tickets), brl(f.hotel), brl(f.baggage), brl(f.uber), brl(f.carRental), brl(f.total)]);
  }
  aoa.push([]);
  aoa.push(["TOTAL GERAL", brl(data.totals.tickets), brl(data.totals.hotel), brl(data.totals.baggage), brl(data.totals.uber), brl(data.totals.carRental), brl(data.totals.grand)]);

  // A escrita fica síncrona: é uma aba pequena (dezenas de linhas) montada
  // por nós — o custo que travava o servidor era a LEITURA de arquivo alheio.
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Espelho Operacional");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}
