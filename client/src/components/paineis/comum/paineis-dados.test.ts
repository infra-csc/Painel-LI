/**
 * Painéis (30/10) — as agregações da Visão geral seguem a régua do Quadro de
 * prazos: a vaga conta na etapa em que está parada, o prazo é D-N da data do
 * evento, vermelho quando passou, âmbar até 3 dias antes.
 */
import { describe, expect, it } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import { vagaFake } from "@/test/fixtures-dominio";
import { analisarPorEvento, type AnalyticsContext } from "@/components/scaling/scaling-analytics-data";
import {
  atrasosDosEventos, gravidade, quandoFoi, recortarPorEtapas, resumirPedidos, rotuloDoDia, textoAtualizado,
  textoDaSituacao, totaisDoBloco, vagasAtrasadas,
} from "./paineis-dados";

const HOJE = new Date(2026, 9, 30); // 30/10/2026
const DIA_DO_EVENTO: Record<string, string> = { nr: "2026-11-19", sp: "2026-12-08", ok: "2026-11-25", velho: "2026-09-01" };
const NOMES: Record<string, string> = { nr: "Night Run Porto Alegre", sp: "Meia de São Paulo", ok: "Corrida Pronta", velho: "Evento passado" };

const ctx: AnalyticsContext = {
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  getEventName: (id) => NOMES[id ?? ""] ?? "?",
  getFunctionName: () => "Staff",
  getCollaboratorName: () => "",
  getEventDates: (id) => {
    const d = DIA_DO_EVENTO[id ?? ""];
    return d ? { startDate: d, endDate: d, diaEventoInicio: d, diaEventoFim: d } : undefined;
  },
  temPassagem: () => false,
  temHotel: () => false,
};

const v = (over: Partial<TeamInclusion>) => vagaFake({
  collaboratorId: null, status: "planejado", phase: "inclusao", deletedAt: null, needsTicket: false, needsAccommodation: false,
  scheduleStartDate: "2026-11-17", scheduleEndDate: "2026-11-19", ...over,
} as Partial<TeamInclusion>);

function montar() {
  const confirmadaSemPassagem = v({ eventId: "nr", collaboratorId: "c1", status: "escalado", needsTicket: true });
  const confirmadaSemNada = v({ eventId: "nr", collaboratorId: "c2", status: "escalado", needsTicket: true, needsAccommodation: true });
  const semNome = v({ eventId: "nr", needsTicket: true });
  const aValidar = v({ eventId: "nr", phase: "sugestao", status: "sugestao_pendente" });
  const venceLogo = v({ eventId: "sp", collaboratorId: "c3", status: "escalado", needsTicket: true, scheduleStartDate: "2026-12-06", scheduleEndDate: "2026-12-08" });
  const pronta = v({ eventId: "ok", collaboratorId: "c4", status: "escalado", scheduleStartDate: "2026-11-24", scheduleEndDate: "2026-11-25" });
  const passada = v({ eventId: "velho", scheduleStartDate: "2026-08-30", scheduleEndDate: "2026-09-01", needsTicket: true });
  const eventos = analisarPorEvento([confirmadaSemPassagem, confirmadaSemNada, semNome, aValidar, venceLogo, pronta, passada], ctx, HOJE);
  return { eventos, confirmadaSemPassagem, confirmadaSemNada, semNome, aValidar, venceLogo };
}

describe("atrasosDosEventos — a régua do Quadro de prazos", () => {
  it("só eventos futuros com célula vermelha ou âmbar; o pior primeiro", () => {
    const { eventos } = montar();
    const lista = atrasosDosEventos(eventos, ctx, DIAS_PADRAO, HOJE);
    expect(lista.map((e) => e.eventId)).toEqual(["nr", "sp"]);
    expect(lista[0].data).toBe("19/11");
  });

  it("cada vaga na etapa em que está parada, com os dias de atraso de cada prazo", () => {
    const { eventos } = montar();
    const [nr] = atrasosDosEventos(eventos, ctx, DIAS_PADRAO, HOJE);
    const porEtapa = Object.fromEntries(nr.etapas.map((a) => [a.etapa, a]));
    expect(Object.keys(porEtapa)).toEqual(["validacao", "escalacao", "passagem", "hotel"]);
    // 19/11 − 51 = 29/09 → 31 dias; −47 = 03/10 → 27; −37 = 13/10 → 17; −30 = 20/10 → 10.
    expect(porEtapa.validacao).toMatchObject({ paradas: 1, situacao: "atrasado", dias: 31 });
    expect(porEtapa.escalacao).toMatchObject({ paradas: 1, situacao: "atrasado", dias: 27 });
    // Passagem e hotel: tarefas paralelas — a vaga sem nada aparece nas duas.
    expect(porEtapa.passagem).toMatchObject({ paradas: 2, situacao: "atrasado", dias: 17 });
    expect(porEtapa.hotel).toMatchObject({ paradas: 1, situacao: "atrasado", dias: 10 });
    // A vaga sem nome que precisa de passagem ainda NÃO conta na Passagem (régua do Quadro), mas é avisada.
    expect(porEtapa.passagem.aindaAntes).toBe(1);
  });

  it("vence em até 3 dias fica âmbar com os dias que faltam", () => {
    const { eventos } = montar();
    const sp = atrasosDosEventos(eventos, ctx, DIAS_PADRAO, HOJE)[1];
    // 08/12 − 37 = 01/11 → vence em 2 dias.
    expect(sp.etapas).toEqual([expect.objectContaining({ etapa: "passagem", situacao: "vence_logo", dias: 2, paradas: 1 })]);
    expect(textoDaSituacao(sp.etapas[0])).toBe("vence em 2 dias");
  });

  it("prazos editados pelo admin mudam a conta", () => {
    const { eventos } = montar();
    // Passagem D-10: 19/11 − 10 = 09/11 → no prazo (sem alerta).
    const lista = atrasosDosEventos(eventos, ctx, { ...DIAS_PADRAO, passagem: 10 }, HOJE);
    expect(lista.find((e) => e.eventId === "nr")!.etapas.some((a) => a.etapa === "passagem")).toBe(false);
  });
});

describe("blocos e totais", () => {
  it("recorte por etapas + totais do bloco", () => {
    const { eventos } = montar();
    const passagens = recortarPorEtapas(atrasosDosEventos(eventos, ctx, DIAS_PADRAO, HOJE), ["passagem"]);
    expect(passagens.map((e) => e.eventId)).toEqual(["nr", "sp"]);
    expect(totaisDoBloco(passagens)).toEqual({ vagasAtrasadas: 2, eventosAtrasados: 1, vagasVencendo: 1, eventosVencendo: 1, maiorAtraso: 17 });
    const aprovacao = recortarPorEtapas(atrasosDosEventos(eventos, ctx, DIAS_PADRAO, HOJE), ["validacao", "aprovacao"]);
    expect(aprovacao.map((e) => e.eventId)).toEqual(["nr"]);
  });

  it("vagas atrasadas → etapa (a primeira em que aparece)", () => {
    const { eventos, confirmadaSemPassagem, confirmadaSemNada, semNome, aValidar, venceLogo } = montar();
    const m = vagasAtrasadas(atrasosDosEventos(eventos, ctx, DIAS_PADRAO, HOJE));
    expect(m.get(confirmadaSemPassagem.id)).toBe("passagem");
    expect(m.get(confirmadaSemNada.id)).toBe("passagem");
    expect(m.get(semNome.id)).toBe("escalacao");
    expect(m.get(aValidar.id)).toBe("validacao");
    expect(m.has(venceLogo.id)).toBe(false);
  });

  it("gravidade: qualquer atraso vem antes de qualquer 'vence logo'", () => {
    expect(gravidade({ situacao: "atrasado", dias: 1 })).toBeGreaterThan(gravidade({ situacao: "vence_logo", dias: 0 }));
    expect(gravidade({ situacao: "vence_logo", dias: 0 })).toBeGreaterThan(gravidade({ situacao: "vence_logo", dias: 3 }));
  });
});

describe("pedidos pendentes", () => {
  it("os mais antigos primeiro, por evento, e quantos estão parados há 3+ dias", () => {
    const r = resumirPedidos([
      { id: "p1", eventId: "nr", eventName: "Night Run", requestType: "ajuste", createdAt: "2026-10-29T10:00:00" },
      { id: "p2", eventId: "nr", eventName: "Night Run", requestType: "exclusao", createdAt: "2026-10-20T10:00:00" },
      { id: "p3", eventId: "sp", eventName: "Meia SP", requestType: "inclusao", createdAt: "2026-10-30T08:00:00" },
    ], HOJE);
    expect(r.total).toBe(3);
    expect(r.maisAntigos.map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
    expect(r.maisAntigos.map((p) => p.diasEsperando)).toEqual([10, 1, 0]);
    expect(r.parados).toBe(1);
    expect(r.porEvento[0]).toMatchObject({ eventId: "nr", n: 2 });
  });
});

describe("textos de tempo", () => {
  const agora = new Date(2026, 9, 30, 15, 0);
  it("quandoFoi", () => {
    expect(quandoFoi(new Date(2026, 9, 30, 14, 59, 40).toISOString(), agora)).toBe("agora");
    expect(quandoFoi(new Date(2026, 9, 30, 14, 35).toISOString(), agora)).toBe("há 25 min");
    expect(quandoFoi(new Date(2026, 9, 30, 9, 0).toISOString(), agora)).toBe("há 6 h");
    expect(quandoFoi(new Date(2026, 9, 29, 18, 5).toISOString(), agora)).toBe("ontem às 18:05");
    expect(quandoFoi(new Date(2026, 9, 27, 8, 0).toISOString(), agora)).toBe("27/10 às 08:00");
  });
  it("rotuloDoDia e textoAtualizado", () => {
    expect(rotuloDoDia(new Date(2026, 9, 30, 1).toISOString(), agora)).toBe("Hoje");
    expect(rotuloDoDia(new Date(2026, 9, 29, 23).toISOString(), agora)).toBe("Ontem");
    expect(rotuloDoDia(new Date(2026, 9, 28, 12).toISOString(), agora)).toBe("qua, 28/10");
    expect(textoAtualizado(agora.getTime() - 20_000, agora.getTime())).toBe("atualizado agora");
    expect(textoAtualizado(agora.getTime() - 3 * 60_000, agora.getTime())).toBe("atualizado há 3 min");
  });
});
