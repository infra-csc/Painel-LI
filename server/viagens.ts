/**
 * Viagens do colaborador no banco → regra pura de shared/janela-de-viagem.ts
 * (09/10 — trecho direto e viagem sobreposta).
 *
 * Carrega as vagas ATIVAS (com colaborador, fora da Validação, de evento não
 * excluído) com o evento e a passagem ATUAL de cada uma. Uma vaga pode ter
 * mais de uma linha de passagem (ida e volta emitidas por agências
 * diferentes): as pernas são juntadas numa só para a janela — a ida mais cedo
 * e a volta mais tarde.
 */
import { and, eq, inArray, isNull, ne, or, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { events, teamInclusions, tickets, type Ticket } from "@shared/schema";
import { SUGESTAO_PHASE } from "@shared/scaling-validation-rules";
import {
  conflitosDeViagem,
  diaDe,
  motivoDeDataImpossivel,
  seguidaPorPassagem,
  sugestaoDeTrechoDireto,
  viagensQueSeCruzam,
  vizinhasParaTrechoDireto,
  cidadeDoEvento,
  encadeamentoEntre,
  somarDiasISO,
  type PassagemDaJanela,
  type RefDeVaga,
  type SinalDeViagem,
  type SinaisDeViagem,
  type VagaDaJanela,
} from "@shared/janela-de-viagem";

export type VagaDeViagem = VagaDaJanela & {
  inclusionNumber: number;
  eventName: string;
  collaboratorId: string;
  /** Passagens atuais, cruas (a janela usa `passagem`, já juntada). */
  passagens: Ticket[];
};

/** Junta as linhas de passagem atuais de uma vaga numa só (ida mais cedo, volta mais tarde). */
export function juntarPassagens(linhas: readonly PassagemDaJanela[]): PassagemDaJanela | null {
  if (linhas.length === 0) return null;
  if (linhas.length === 1) return linhas[0];
  const comIda = linhas.filter((t) => diaDe(t.actualDepartureDate)).sort((a, b) => String(a.actualDepartureDate).localeCompare(String(b.actualDepartureDate)));
  const comVolta = linhas.filter((t) => diaDe(t.actualReturnDate)).sort((a, b) => String(b.actualReturnDate).localeCompare(String(a.actualReturnDate)));
  const ida = comIda[0], volta = comVolta[0];
  const encadeada = linhas.find((t) => t.idaVemDeInclusionId);
  return {
    id: (ida ?? volta ?? linhas[0]).id,
    actualDepartureDate: ida?.actualDepartureDate ?? null,
    actualDepartureTime: ida?.actualDepartureTime ?? null,
    actualArrivalTime: ida?.actualArrivalTime ?? null,
    departureCityOrigin: ida?.departureCityOrigin ?? null,
    departureCityDestination: ida?.departureCityDestination ?? null,
    actualReturnDate: volta?.actualReturnDate ?? null,
    actualReturnTime: volta?.actualReturnTime ?? null,
    returnArrivalTime: volta?.returnArrivalTime ?? null,
    returnCityOrigin: volta?.returnCityOrigin ?? null,
    returnCityDestination: volta?.returnCityDestination ?? null,
    idaVemDeInclusionId: encadeada?.idaVemDeInclusionId ?? null,
  };
}

/**
 * Vagas ativas com colaborador (todas, ou só as dos colaboradores dados), com
 * evento e passagens atuais.
 */
export async function carregarVagasDeViagem(colaboradores?: readonly string[]): Promise<VagaDeViagem[]> {
  if (colaboradores && colaboradores.length === 0) return [];
  const condicoes = [
    isNull(teamInclusions.deletedAt),
    isNotNull(teamInclusions.collaboratorId),
    ne(teamInclusions.phase, SUGESTAO_PHASE),
    ne(teamInclusions.status, "cancelado"),
    or(isNull(events.status), and(ne(events.status, "excluído"), ne(events.status, "excluido")))!,
  ];
  if (colaboradores) condicoes.push(inArray(teamInclusions.collaboratorId, [...colaboradores]));
  const linhas = await db
    .select({
      id: teamInclusions.id,
      inclusionNumber: teamInclusions.inclusionNumber,
      eventId: teamInclusions.eventId,
      eventName: events.name,
      eventLocation: events.location,
      collaboratorId: teamInclusions.collaboratorId,
      status: teamInclusions.status,
      phase: teamInclusions.phase,
      deletedAt: teamInclusions.deletedAt,
      scheduleStartDate: teamInclusions.scheduleStartDate,
      scheduleEndDate: teamInclusions.scheduleEndDate,
      flightDepartureDate: teamInclusions.flightDepartureDate,
      flightReturnDate: teamInclusions.flightReturnDate,
      trechosSugeridos: teamInclusions.trechosSugeridos,
      idaVemDoEventoId: teamInclusions.idaVemDoEventoId,
      voltaSegueParaEventoId: teamInclusions.voltaSegueParaEventoId,
    })
    .from(teamInclusions)
    .innerJoin(events, eq(events.id, teamInclusions.eventId))
    .where(and(...condicoes));
  if (linhas.length === 0) return [];
  const ids = linhas.map((l) => l.id);
  const passagens: Ticket[] = [];
  // Em fatias: um IN com milhares de parâmetros estoura o limite do driver.
  for (let i = 0; i < ids.length; i += 1000) {
    const fatia = ids.slice(i, i + 1000);
    passagens.push(...await db.select().from(tickets).where(and(inArray(tickets.teamInclusionId, fatia), isNull(tickets.archivedAt))));
  }
  const porVaga = new Map<string, Ticket[]>();
  for (const t of passagens) {
    const l = porVaga.get(t.teamInclusionId) ?? [];
    l.push(t);
    porVaga.set(t.teamInclusionId, l);
  }
  return linhas.map((l) => {
    const daVaga = porVaga.get(l.id) ?? [];
    return { ...l, eventName: l.eventName ?? "", collaboratorId: l.collaboratorId!, passagens: daVaga, passagem: juntarPassagens(daVaga) };
  });
}

const refDe = (v: VagaDeViagem): RefDeVaga => ({
  inclusionId: v.id, numero: v.inclusionNumber, eventId: v.eventId, eventName: v.eventName, cidade: cidadeDoEvento(v.eventLocation),
});

/** Cruzamentos que já terminaram há mais disto não viram pendência (não há o que fazer). */
const DIAS_DE_PASSADO_NAS_PENDENCIAS = 30;

/**
 * Sinais de viagem de todas as vagas dadas (as de um colaborador precisam vir
 * juntas). `hoje` = "AAAA-MM-DD" de São Paulo.
 */
export function sinaisDeViagem(vagas: readonly VagaDeViagem[], hoje: string): SinaisDeViagem {
  const porVaga: Record<string, SinalDeViagem> = {};
  const sinal = (id: string) => (porVaga[id] ??= {});
  const corte = somarDiasISO(hoje, -DIAS_DE_PASSADO_NAS_PENDENCIAS);

  const porColaborador = new Map<string, VagaDeViagem[]>();
  for (const v of vagas) {
    const l = porColaborador.get(v.collaboratorId) ?? [];
    l.push(v);
    porColaborador.set(v.collaboratorId, l);
  }

  // Pares que se cruzam (recentes ou futuros).
  let cruzam = 0;
  for (const { a, b, conflito } of viagensQueSeCruzam(vagas)) {
    if (conflito.fim.dia < corte) continue;
    cruzam += 1;
    (sinal(a.id).cruzaCom ??= []).push({ ...refDe(b), nivel: "bloqueia" });
    (sinal(b.id).cruzaCom ??= []).push({ ...refDe(a), nivel: "bloqueia" });
  }

  let datas = 0;
  for (const v of vagas) {
    const outras = porColaborador.get(v.collaboratorId) ?? [];
    // Data impossível: qualquer linha de passagem atual da vaga.
    for (const t of v.passagens) {
      const motivo = motivoDeDataImpossivel(t, hoje);
      if (motivo) { datas += 1; sinal(v.id).dataImpossivel ??= motivo; }
    }
    // Encadeamentos (confirmados ou indicados).
    for (const o of outras) {
      const e = encadeamentoEntre(v, o);
      if (!e) continue;
      if (e.seguinte.id === v.id) sinal(v.id).vemDiretoDe = { ...refDe(e.anterior as VagaDeViagem), confirmado: e.fonte === "passagem" };
      else sinal(v.id).segueDiretoPara = { ...refDe(e.seguinte as VagaDeViagem), confirmado: e.fonte === "passagem" };
    }
    const seguida = seguidaPorPassagem(v, outras);
    if (seguida) sinal(v.id).segueDiretoPara = { ...refDe(seguida), confirmado: true };
    // Sugestões para Compras.
    const vizinhas = vizinhasParaTrechoDireto(v, outras);
    const anteriores = vizinhas.filter((z) => z.lado === "anterior");
    if (anteriores.length) sinal(v.id).vizinhasAnteriores = anteriores.map((z) => ({ ...refDe(z.vaga), dia: z.dia }));
    const temIdaComprada = !!diaDe(v.passagem?.actualDepartureDate) || !!v.passagem?.idaVemDeInclusionId;
    if (!temIdaComprada) {
      const s = sugestaoDeTrechoDireto(v, outras);
      if (s) {
        sinal(v.id).podeIrDiretoDe = {
          ...refDe(s.vaga), dia: s.dia,
          indicadoPelaLogistica: v.idaVemDoEventoId === s.vaga.eventId || s.vaga.voltaSegueParaEventoId === v.eventId,
        };
      }
    }
    const seguinte = vizinhas.find((z) => z.lado === "seguinte");
    if (seguinte && !sinal(v.id).segueDiretoPara) sinal(v.id).seguePara = { ...refDe(seguinte.vaga), dia: seguinte.dia };
  }
  // Só as vagas com algum sinal.
  for (const [id, s] of Object.entries(porVaga)) if (Object.keys(s).length === 0) delete porVaga[id];
  return { porVaga, totais: { viagensQueSeCruzam: cruzam, passagensComDataImpossivel: datas } };
}

/** Conflitos de viagem de UMA vaga (com a passagem proposta) contra as outras do colaborador. */
export function conflitosDaVagaComPassagem(
  vaga: VagaDeViagem,
  passagemProposta: PassagemDaJanela,
  outras: readonly VagaDeViagem[],
) {
  return conflitosDeViagem({ ...vaga, passagem: passagemProposta }, outras.filter((o) => o.id !== vaga.id));
}
