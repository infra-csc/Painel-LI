import { db } from "./db";
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
} from "@shared/schema";
import { eq } from "drizzle-orm";

// ---------- Tipos do espelho operacional ----------
export interface MirrorRow {
  teamInclusionId: string;
  collaborator: {
    id: string | null;
    fullName: string;
    gender: string | null;
    city: string | null;
    state: string | null;
    type: string | null;
  };
  function: {
    id: string | null;
    name: string | null;
    costCenter: string | null;
    area: string | null;
  };
  schedule: {
    startDate: string | null;
    endDate: string | null;
    flightDepartureDate: string | null;
    flightReturnDate: string | null;
    dailyRates: number | null;
  };
  ticket: any | null;
  accommodation: any | null;
  baggage: { totalCents: number; oc: string | null; notes: string | null };
  uber: { totalCents: number; oc: string | null; notes: string | null; suggestedGroupId: string | null; groupName: string | null };
  carRental: { company: string | null; totalCents: number; oc: string | null; notes: string | null };
  suggestedRoomGroupId: string | null;
  roomGroupLabel: string | null;
  pendencies: string[];
}

// ---------- Config de sugestões ----------
interface LogisticsConfig {
  uberTimeWindowMinutes: number;
  uberMaxPeoplePerCar: number;
  allowTripleRoom: boolean;
  hotelGroupBySameDepartmentPriority: boolean;
  requireSameGenderForSharedRoom: boolean;
}

async function getLogisticsConfig(): Promise<LogisticsConfig> {
  const settings = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return {
    uberTimeWindowMinutes: parseInt(map["uber_group_time_window_minutes"] || "90", 10),
    uberMaxPeoplePerCar: parseInt(map["uber_max_people_per_car"] || "4", 10),
    allowTripleRoom: (map["allow_triple_room"] || "false") === "true",
    hotelGroupBySameDepartmentPriority: (map["hotel_group_by_same_department_priority"] || "true") === "true",
    requireSameGenderForSharedRoom: (map["require_same_gender_for_shared_room"] || "true") === "true",
  };
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// ---------- Buscar dados consolidados ----------
export async function getOperationalMirror(eventId: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return null;

  // team inclusions do evento (não excluídas)
  const inclusions = (await db.select().from(teamInclusions).where(eq(teamInclusions.eventId, eventId)))
    .filter((ti: any) => !ti.deletedAt);

  const collabRows = await db.select().from(collaborators);
  const collabMap = new Map(collabRows.map((c: any) => [c.id, c]));
  const fnRows = await db.select().from(functions);
  const fnMap = new Map(fnRows.map((f: any) => [f.id, f]));

  const ticketRows = await db.select().from(tickets);
  const ticketByInclusion = new Map<string, any>();
  for (const t of ticketRows) ticketByInclusion.set(t.teamInclusionId, t);

  const accRows = await db.select().from(accommodations);
  const accByInclusion = new Map<string, any>();
  for (const a of accRows) accByInclusion.set(a.teamInclusionId, a);

  const extras = await db.select().from(logisticsExtraCosts).where(eq(logisticsExtraCosts.eventId, eventId));

  // grupos de uber e quarto com membros
  const uberGroupRows = await db.select().from(uberGroups).where(eq(uberGroups.eventId, eventId));
  const uberMemberRows = await db.select().from(uberGroupMembers);
  const roomGroupRows = await db.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.eventId, eventId));
  const roomMemberRows = await db.select().from(hotelRoomGroupMembers);

  const uberGroupIds = new Set(uberGroupRows.map((g: any) => g.id));
  const roomGroupIds = new Set(roomGroupRows.map((g: any) => g.id));

  const uberGroupsWithMembers = uberGroupRows.map((g: any) => ({
    ...g,
    members: uberMemberRows.filter((m: any) => m.uberGroupId === g.id),
  }));
  const roomGroupsWithMembers = roomGroupRows.map((g: any) => ({
    ...g,
    members: roomMemberRows.filter((m: any) => m.hotelRoomGroupId === g.id),
  }));

  // mapear colaborador -> grupo (uber/quarto) do evento
  const collabToUberGroup = new Map<string, any>();
  for (const g of uberGroupsWithMembers) {
    for (const m of g.members) collabToUberGroup.set(m.collaboratorId, g);
  }
  const collabToRoomGroup = new Map<string, any>();
  for (const g of roomGroupsWithMembers) {
    for (const m of g.members) collabToRoomGroup.set(m.collaboratorId, g);
  }

  // extras por colaborador e tipo
  function extrasFor(collabId: string | null, type: string) {
    if (!collabId) return { total: 0, oc: null as string | null, notes: null as string | null, company: null as string | null };
    const items = extras.filter((e: any) => e.collaboratorId === collabId && e.type === type);
    const total = items.reduce((s: number, e: any) => s + (e.amountCents || 0), 0);
    return {
      total,
      oc: items.find((e: any) => e.oc)?.oc || null,
      notes: items.find((e: any) => e.notes)?.notes || null,
      company: items.find((e: any) => e.company)?.company || null,
    };
  }

  const rows: MirrorRow[] = inclusions.map((ti: any) => {
    const collab: any = ti.collaboratorId ? collabMap.get(ti.collaboratorId) : null;
    const fn: any = ti.functionId ? fnMap.get(ti.functionId) : null;
    const ticket = ticketByInclusion.get(ti.id) || null;
    const acc = accByInclusion.get(ti.id) || null;

    const baggageExtra = extrasFor(ti.collaboratorId, "baggage");
    const uberExtra = extrasFor(ti.collaboratorId, "uber");
    const carExtra = extrasFor(ti.collaboratorId, "car_rental");

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
    if (ti.needsAccommodation && acc && !roomGroup && (!collab?.gender || collab.gender === "unknown")) pendencies.push("Impossível sugerir quarto (falta dado)");
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
      baggage: { totalCents: baggageTotal, oc: ticket?.baggageOc || baggageExtra.oc, notes: ticket?.baggageNotes || baggageExtra.notes },
      uber: {
        totalCents: uberExtra.total,
        oc: uberExtra.oc,
        notes: uberExtra.notes,
        suggestedGroupId: uberGroup?.id || null,
        groupName: uberGroup?.groupName || null,
      },
      carRental: { company: carExtra.company, totalCents: carExtra.total, oc: carExtra.oc, notes: carExtra.notes },
      suggestedRoomGroupId: roomGroup?.id || null,
      roomGroupLabel: roomGroup ? `${roomGroup.roomType || ""} ${roomGroup.confirmed ? "(Confirmado)" : "(Sugestão)"}`.trim() : null,
      pendencies,
    };
  });

  // ----- Totais -----
  let totalTickets = 0, totalHotel = 0, totalBaggage = 0, totalUber = 0, totalCarRental = 0;
  for (const r of rows) {
    totalTickets += r.ticket?.value || 0;
    totalHotel += r.accommodation?.totalCents || ((r.accommodation?.dailyRate || 0) * (r.schedule.dailyRates || 0)) || 0;
    totalBaggage += r.baggage.totalCents;
    totalUber += r.uber.totalCents;
    totalCarRental += r.carRental.totalCents;
  }
  const grand = totalTickets + totalHotel + totalBaggage + totalUber + totalCarRental;

  // subtotais por função/departamento
  const byFunction: Record<string, { name: string; tickets: number; hotel: number; baggage: number; uber: number; carRental: number; total: number }> = {};
  for (const r of rows) {
    const key = r.function.name || "(sem função)";
    if (!byFunction[key]) byFunction[key] = { name: key, tickets: 0, hotel: 0, baggage: 0, uber: 0, carRental: 0, total: 0 };
    const t = r.ticket?.value || 0;
    const h = r.accommodation?.totalCents || ((r.accommodation?.dailyRate || 0) * (r.schedule.dailyRates || 0)) || 0;
    byFunction[key].tickets += t;
    byFunction[key].hotel += h;
    byFunction[key].baggage += r.baggage.totalCents;
    byFunction[key].uber += r.uber.totalCents;
    byFunction[key].carRental += r.carRental.totalCents;
    byFunction[key].total += t + h + r.baggage.totalCents + r.uber.totalCents + r.carRental.totalCents;
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
    },
    pendingCount,
    suggestedRoomCount: roomGroupRows.length,
    suggestedUberCount: uberGroupRows.length,
  };
}

// ---------- Recalcular sugestões (sem sobrescrever confirmados) ----------
export async function recalculateLogisticsSuggestions(eventId: string) {
  const config = await getLogisticsConfig();

  const inclusions = (await db.select().from(teamInclusions).where(eq(teamInclusions.eventId, eventId)))
    .filter((ti: any) => !ti.deletedAt);
  const collabRows = await db.select().from(collaborators);
  const collabMap = new Map(collabRows.map((c: any) => [c.id, c]));
  const ticketRows = await db.select().from(tickets);
  const ticketByInclusion = new Map<string, any>();
  for (const t of ticketRows) ticketByInclusion.set(t.teamInclusionId, t);
  const accRows = await db.select().from(accommodations);
  const accByInclusion = new Map<string, any>();
  for (const a of accRows) accByInclusion.set(a.teamInclusionId, a);

  // ===== QUARTOS =====
  // Coletar IDs de colaboradores já em grupos confirmados
  const existingRoomGroups = await db.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.eventId, eventId));
  const allRoomMembers = await db.select().from(hotelRoomGroupMembers);
  const confirmedRoomGroupIds = new Set(existingRoomGroups.filter((g: any) => g.confirmed).map((g: any) => g.id));
  const lockedCollabRoom = new Set<string>();
  for (const m of allRoomMembers) {
    if (confirmedRoomGroupIds.has(m.hotelRoomGroupId)) lockedCollabRoom.add(m.collaboratorId);
  }
  // Apagar grupos sugeridos (não confirmados)
  for (const g of existingRoomGroups) {
    if (!g.confirmed) {
      await db.delete(hotelRoomGroupMembers).where(eq(hotelRoomGroupMembers.hotelRoomGroupId, g.id));
      await db.delete(hotelRoomGroups).where(eq(hotelRoomGroups.id, g.id));
    }
  }

  // Candidatos a quarto: inclusões com hospedagem e colaborador, não travados
  const roomCandidates = inclusions.filter((ti: any) => {
    if (!ti.collaboratorId) return false;
    if (lockedCollabRoom.has(ti.collaboratorId)) return false;
    const acc = accByInclusion.get(ti.id);
    return ti.needsAccommodation || !!acc;
  }).map((ti: any) => {
    const acc = accByInclusion.get(ti.id);
    const collab: any = collabMap.get(ti.collaboratorId);
    return {
      inclusion: ti,
      collab,
      acc,
      hotelName: acc?.hotelName || null,
      checkIn: acc?.checkInDate || ti.scheduleStartDate || null,
      checkOut: acc?.checkOutDate || ti.scheduleEndDate || null,
      gender: collab?.gender || "unknown",
      area: ti.area || null,
    };
  });

  // Emparelhar: mesma data + mesmo hotel + mesmo gênero
  const used = new Set<string>();
  const groupsToCreate: { roomType: string; genderRule: string; hotelName: string | null; checkIn: string | null; checkOut: string | null; members: string[] }[] = [];

  for (let i = 0; i < roomCandidates.length; i++) {
    const a = roomCandidates[i];
    if (used.has(a.collab.id)) continue;
    // gênero desconhecido -> quarto single (pendência tratada na tela)
    if (config.requireSameGenderForSharedRoom && (a.gender === "unknown" || !a.gender)) {
      used.add(a.collab.id);
      groupsToCreate.push({ roomType: "single", genderRule: "none", hotelName: a.hotelName, checkIn: a.checkIn, checkOut: a.checkOut, members: [a.collab.id] });
      continue;
    }
    // procurar parceiro compatível
    const partners: typeof roomCandidates = [];
    for (let j = i + 1; j < roomCandidates.length; j++) {
      const b = roomCandidates[j];
      if (used.has(b.collab.id)) continue;
      const sameGender = !config.requireSameGenderForSharedRoom || a.gender === b.gender;
      const sameHotel = (a.hotelName || "") === (b.hotelName || "");
      const sameDates = a.checkIn === b.checkIn && a.checkOut === b.checkOut;
      if (sameGender && sameHotel && sameDates && b.gender !== "unknown") {
        partners.push(b);
      }
    }
    // priorizar mesmo departamento
    if (config.hotelGroupBySameDepartmentPriority) {
      partners.sort((x, y) => {
        const xs = x.area === a.area ? 0 : 1;
        const ys = y.area === a.area ? 0 : 1;
        return xs - ys;
      });
    }
    const maxRoom = config.allowTripleRoom ? 3 : 2;
    const members = [a.collab.id];
    for (const p of partners) {
      if (members.length >= maxRoom) break;
      members.push(p.collab.id);
      used.add(p.collab.id);
    }
    used.add(a.collab.id);
    const roomType = members.length === 1 ? "single" : members.length === 2 ? "double" : "triple";
    const genderRule = a.gender === "male" ? "male" : a.gender === "female" ? "female" : "none";
    groupsToCreate.push({ roomType, genderRule, hotelName: a.hotelName, checkIn: a.checkIn, checkOut: a.checkOut, members });
  }

  for (const g of groupsToCreate) {
    const [created] = await db.insert(hotelRoomGroups).values({
      eventId,
      hotelName: g.hotelName,
      roomType: g.roomType,
      genderRule: g.genderRule,
      checkInDate: g.checkIn,
      checkOutDate: g.checkOut,
      suggested: true,
      confirmed: false,
    }).returning();
    for (const cid of g.members) {
      await db.insert(hotelRoomGroupMembers).values({ hotelRoomGroupId: created.id, collaboratorId: cid, confirmed: false });
    }
  }

  // ===== UBER =====
  const existingUberGroups = await db.select().from(uberGroups).where(eq(uberGroups.eventId, eventId));
  const allUberMembers = await db.select().from(uberGroupMembers);
  const confirmedUberGroupIds = new Set(existingUberGroups.filter((g: any) => g.confirmed).map((g: any) => g.id));
  const lockedCollabUber = new Set<string>();
  for (const m of allUberMembers) {
    if (confirmedUberGroupIds.has(m.uberGroupId)) lockedCollabUber.add(m.collaboratorId);
  }
  for (const g of existingUberGroups) {
    if (!g.confirmed) {
      await db.delete(uberGroupMembers).where(eq(uberGroupMembers.uberGroupId, g.id));
      await db.delete(uberGroups).where(eq(uberGroups.id, g.id));
    }
  }

  // Construir candidatos de ida e volta a partir das passagens
  // hotel = ponto comum no destino/local do evento (separa quem vai para lugares diferentes)
  type UberCand = { collabId: string; date: string; airport: string; hotel: string; minutes: number | null };
  const idaCands: UberCand[] = [];
  const voltaCands: UberCand[] = [];
  for (const ti of inclusions) {
    if (!ti.collaboratorId || lockedCollabUber.has(ti.collaboratorId)) continue;
    const ticket = ticketByInclusion.get(ti.id);
    if (!ticket) continue;
    const acc = accByInclusion.get(ti.id);
    const hotel = acc?.hotelName || "Hotel/Local do evento";
    if (ticket.actualDepartureDate && (ticket.destinationAirport || ticket.departureCityDestination)) {
      idaCands.push({
        collabId: ti.collaboratorId,
        date: ticket.actualDepartureDate,
        airport: ticket.destinationAirport || ticket.departureCityDestination || "",
        hotel,
        minutes: timeToMinutes(ticket.actualDepartureTime),
      });
    }
    if (ticket.actualReturnDate && (ticket.returnOriginAirport || ticket.returnCityOrigin || ticket.destinationAirport)) {
      voltaCands.push({
        collabId: ti.collaboratorId,
        date: ticket.actualReturnDate,
        airport: ticket.returnOriginAirport || ticket.destinationAirport || "",
        hotel,
        minutes: timeToMinutes(ticket.actualReturnTime),
      });
    }
  }

  async function buildUberGroups(cands: UberCand[], direction: "ida" | "volta") {
    // agrupar por data + aeroporto + hotel (não juntar quem vai/vem de locais diferentes)
    const buckets = new Map<string, UberCand[]>();
    for (const c of cands) {
      const key = `${c.date}|${c.airport}|${c.hotel}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(c);
    }
    for (const [key, list] of Array.from(buckets.entries())) {
      // ordenar por horário
      list.sort((a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999));
      // agrupar dentro da janela de tempo, max pessoas por carro
      let current: UberCand[] = [];
      let anchor: number | null = null;
      const flush = async () => {
        if (current.length === 0) return;
        const [date, airport, hotel] = key.split("|");
        // ida: aeroporto -> hotel | volta: hotel -> aeroporto
        const origin = direction === "ida" ? airport : hotel;
        const destination = direction === "ida" ? hotel : airport;
        const times = current.map((c) => c.minutes).filter((m): m is number => m != null);
        const avg = times.length ? Math.round(times.reduce((s, m) => s + m, 0) / times.length) : null;
        const timeStr = avg != null ? `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}` : null;
        const [g] = await db.insert(uberGroups).values({
          eventId,
          groupName: `${direction === "ida" ? "Ida" : "Volta"} ${airport} ${date}`,
          direction,
          origin,
          destination,
          date,
          time: timeStr,
          suggested: true,
          confirmed: false,
          status: "sugerido",
        }).returning();
        for (const c of current) {
          await db.insert(uberGroupMembers).values({ uberGroupId: g.id, collaboratorId: c.collabId, confirmed: false });
        }
      };
      for (const c of list) {
        if (current.length === 0) {
          current.push(c);
          anchor = c.minutes;
          continue;
        }
        const within = anchor == null || c.minutes == null || Math.abs((c.minutes ?? 0) - (anchor ?? 0)) <= config.uberTimeWindowMinutes;
        if (within && current.length < config.uberMaxPeoplePerCar) {
          current.push(c);
        } else {
          await flush();
          current = [c];
          anchor = c.minutes;
        }
      }
      await flush();
    }
  }

  await buildUberGroups(idaCands, "ida");
  await buildUberGroups(voltaCands, "volta");

  return { ok: true, roomGroupsCreated: groupsToCreate.length };
}

// ---------- Export Excel ----------
import * as XLSX from "xlsx";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function exportOperationalMirrorExcel(eventId: string): Promise<Buffer | null> {
  const data = await getOperationalMirror(eventId);
  if (!data) return null;

  const header = [
    "Colaborador", "Departamento/Função", "Centro de Custo", "Tipo", "Sexo", "Cidade", "UF",
    "Início escala", "Término escala", "Data ida", "Data volta", "Diárias",
    "Passagem R$", "Aero ida", "Hr ida", "Aero volta", "Hr volta", "Localizador", "Empresa pass.", "OC pass.", "Status pass.",
    "Check-in", "Check-out", "Tipo quarto", "Diária hotel", "Late check-out", "Hotel R$", "Nome hotel", "Local hotel", "Empresa pag.", "OC hotel", "Status hosp.",
    "Bagagem R$", "OC bagagem",
    "Uber R$", "OC uber", "Grupo uber",
    "Locação empresa", "Locação R$", "OC locação",
    "Pendências",
  ];

  const aoa: any[][] = [];
  aoa.push([`Evento: ${data.event.name}`]);
  aoa.push([`Local: ${data.event.location}`]);
  aoa.push([`Período: ${data.event.startDate} a ${data.event.endDate}`]);
  aoa.push([]);
  aoa.push(header);

  for (const r of data.rows) {
    const hotelTotal = r.accommodation?.totalCents || ((r.accommodation?.dailyRate || 0) * (r.schedule.dailyRates || 0)) || 0;
    aoa.push([
      r.collaborator.fullName,
      r.function.name || "",
      r.function.costCenter || "",
      r.collaborator.type || "",
      r.collaborator.gender || "",
      r.collaborator.city || "",
      r.collaborator.state || "",
      r.schedule.startDate || "",
      r.schedule.endDate || "",
      r.ticket?.actualDepartureDate || "",
      r.ticket?.actualReturnDate || "",
      r.schedule.dailyRates ?? "",
      r.ticket?.value ? brl(r.ticket.value) : "",
      r.ticket?.destinationAirport || "",
      r.ticket?.actualDepartureTime || "",
      r.ticket?.returnOriginAirport || "",
      r.ticket?.actualReturnTime || "",
      r.ticket?.locator || r.ticket?.reservationNumber || "",
      r.ticket?.ticketCompany || "",
      r.ticket?.purchaseOrderNumber || "",
      r.ticket?.ticketStatus || "",
      r.accommodation?.checkInDate || "",
      r.accommodation?.checkOutDate || "",
      r.accommodation?.roomType || "",
      r.accommodation?.dailyRate ? brl(r.accommodation.dailyRate) : "",
      r.accommodation?.lateCheckout ? "Sim" : "",
      hotelTotal ? brl(hotelTotal) : "",
      r.accommodation?.hotelName || "",
      r.accommodation?.hotelLocation || "",
      r.accommodation?.paymentCompany || "",
      r.accommodation?.hotelOc || "",
      r.accommodation?.hotelStatus || "",
      r.baggage.totalCents ? brl(r.baggage.totalCents) : "",
      r.baggage.oc || "",
      r.uber.totalCents ? brl(r.uber.totalCents) : "",
      r.uber.oc || "",
      r.uber.groupName || "",
      r.carRental.company || "",
      r.carRental.totalCents ? brl(r.carRental.totalCents) : "",
      r.carRental.oc || "",
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

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Espelho Operacional");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}
