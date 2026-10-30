/**
 * Painéis (30/10) — fora do prazo e feitas × não feitas por evento, com a
 * régua do Quadro de prazos (D-37 passagem, D-30 hotel, dia da prova).
 */
import { describe, it, expect } from "vitest";
import type { Accommodation, Event, Function as Funcao, TeamInclusion, Ticket } from "@shared/schema";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import {
  contextoDoPainel, eventoNoPeriodo, foraDoPrazo, linhasDaLogistica, montarPainelDaLogistica, resumirLogistica,
  textoDoAtraso, textoDoPrazo, vagasDoPainel, RECORTE_PADRAO,
} from "./logistica-dos-paineis";

// 30/10/2026 é sexta-feira.
const HOJE = new Date(2026, 9, 30);

const ev = (id: string, name: string, startDate: string, endDate: string, extra: Partial<Event> = {}) =>
  ({ id, name, startDate, endDate, status: "planejado", diaEventoInicio: null, diaEventoFim: null, ...extra }) as unknown as Event;

const EVENTOS = [
  // Domingo 22/11: D-37 = 16/10 (14 dias atrasado); D-30 = 23/10 (7 dias atrasado).
  ev("a", "Meia Maratona de Atrasópolis", "2026-11-20", "2026-11-22"),
  // Domingo 06/12: D-37 = 30/10 (vence hoje); D-30 = 06/11 (folga).
  ev("b", "Corrida do Prazo Curto", "2026-12-04", "2026-12-06"),
  // Já aconteceu (domingo 25/10): fica fora.
  ev("c", "Evento Passado", "2026-10-23", "2026-10-25"),
  // Dias do evento informados (05–06/11, quinta e sexta): o dia da prova é 06/11, não o domingo 08/11.
  ev("d", "Viva Esporte - Serra", "2026-11-01", "2026-11-08", { diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" } as Partial<Event>),
];
const FUNCOES = [{ id: "prod", name: "Produção" }, { id: "ceno", name: "Cenotécnica" }] as unknown as Funcao[];

let seq = 0;
const vaga = (over: Partial<TeamInclusion> & { phase?: string } = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq, eventId: "a", functionId: "prod", collaboratorId: "c1",
  status: "escalado", phase: "inclusao", deletedAt: null, needsTicket: true, needsAccommodation: false,
  scheduleStartDate: "2026-11-19", scheduleEndDate: "2026-11-22",
  ...over,
}) as unknown as TeamInclusion;
const passagem = (teamInclusionId: string, over: Partial<Ticket> = {}) =>
  ({ id: `t-${teamInclusionId}`, teamInclusionId, purchaseDate: "2026-10-10", archivedAt: null, ...over }) as unknown as Ticket;
const hotel = (teamInclusionId: string, over: Partial<Accommodation> = {}) =>
  ({ id: `h-${teamInclusionId}`, teamInclusionId, hotelName: "Hotel Central", hotelStatus: "reservada", ...over }) as unknown as Accommodation;

function cenario() {
  seq = 0;
  const a1 = vaga(); // confirmada, sem passagem → a emitir
  const a2 = vaga(); // emitida
  const a3 = vaga({ collaboratorId: null, status: "planejado" }); // sem nome → esperando a escala
  const a4 = vaga(); // passagem registrada SEM data de compra → ainda a emitir (regra do Quadro)
  const a5 = vaga({ phase: "sugestao", status: "sugestao_pendente" }); // sugestão: fora
  const a6 = vaga({ status: "cancelado" }); // cancelada: fora
  const a7 = vaga({ needsTicket: false, needsAccommodation: true, functionId: "ceno" }); // hotel cancelado → a reservar
  const a8 = vaga({ needsTicket: false, needsAccommodation: true }); // hotel registrado
  const b1 = vaga({ eventId: "b", scheduleStartDate: "2026-12-03", scheduleEndDate: "2026-12-06" });
  const b2 = vaga({ eventId: "b", scheduleStartDate: "2026-12-03", scheduleEndDate: "2026-12-06", functionId: "ceno" });
  const c1 = vaga({ eventId: "c", scheduleStartDate: "2026-10-23", scheduleEndDate: "2026-10-25" });
  const d1 = vaga({ eventId: "d", scheduleStartDate: "2026-11-04", scheduleEndDate: "2026-11-06", collaboratorId: null, status: "planejado" });
  const vagas = [a1, a2, a3, a4, a5, a6, a7, a8, b1, b2, c1, d1];
  const passagens = [passagem(a2.id), passagem(a4.id, { purchaseDate: null })];
  const hospedagens = [hotel(a7.id, { hotelStatus: "cancelada" }), hotel(a8.id)];
  return { vagas, passagens, hospedagens, a1, a7 };
}

const fontes = () => {
  const c = cenario();
  return { vagas: c.vagas, eventos: EVENTOS, funcoes: FUNCOES, passagens: c.passagens, hospedagens: c.hospedagens };
};

describe("contextoDoPainel — as regras das Análises da Escalação", () => {
  it("passagem = atual com data de compra; hotel = com nome e não cancelado", () => {
    const c = cenario();
    const ctx = contextoDoPainel({ ...fontes(), vagas: c.vagas });
    const [a1, a2, , a4, , , a7, a8] = c.vagas;
    expect(ctx.temPassagem?.(a1)).toBe(false);
    expect(ctx.temPassagem?.(a2)).toBe(true);
    expect(ctx.temPassagem?.(a4)).toBe(false);
    expect(ctx.temHotel?.(a7)).toBe(false);
    expect(ctx.temHotel?.(a8)).toBe(true);
    expect(ctx.getEventName("a")).toBe("Meia Maratona de Atrasópolis");
  });

  it("passagem do histórico de troca não conta como a passagem da vaga", () => {
    const c = cenario();
    const ctx = contextoDoPainel({ ...fontes(), passagens: [passagem(c.a1.id, { archivedAt: new Date() as unknown as Ticket["archivedAt"] })] });
    expect(ctx.temPassagem?.(c.a1)).toBe(false);
  });
});

describe("linhasDaLogistica — passagem", () => {
  it("separa emitidas, a emitir (paradas do Quadro) e esperando a escala; sugestão e cancelada ficam fora", () => {
    const f = fontes();
    const ctx = contextoDoPainel(f);
    const linhas = linhasDaLogistica(vagasDoPainel(f.vagas, RECORTE_PADRAO), ctx, "passagem", HOJE);
    const a = linhas.find((l) => l.eventId === "a")!;
    expect(a).toMatchObject({ precisam: 4, feitas: 1, aFazer: 2, esperandoEscala: 1, pctFeitas: 25, situacao: "atrasado", atraso: 14, dataEvento: "2026-11-22", diasAntes: 37 });
    expect(textoDoPrazo(a)).toBe("prazo 16/10 (D-37)");
  });

  it("dia do evento informado no cadastro manda no prazo (Serra: 06/11 − 37 = 30/09)", () => {
    const f = fontes();
    const linhas = linhasDaLogistica(vagasDoPainel(f.vagas, RECORTE_PADRAO), contextoDoPainel(f), "passagem", HOJE);
    const d = linhas.find((l) => l.eventId === "d")!;
    expect(d.dataEvento).toBe("2026-11-06");
    expect(d.rotuloDaData).toBe("05–06/11");
    expect(d.atraso).toBe(30);
    // Só vaga sem nome: nada parado na passagem — o Quadro não pinta, o painel mostra como "esperando".
    expect(d).toMatchObject({ aFazer: 0, esperandoEscala: 1, situacao: "cumprido" });
  });

  it("prazos editados valem (D-40 em vez de D-37)", () => {
    const f = fontes();
    const linhas = linhasDaLogistica(vagasDoPainel(f.vagas, RECORTE_PADRAO), contextoDoPainel(f), "passagem", HOJE, { ...DIAS_PADRAO, passagem: 40 });
    const b = linhas.find((l) => l.eventId === "b")!;
    expect(b.atraso).toBe(3);
    expect(b.situacao).toBe("atrasado");
  });
});

describe("linhasDaLogistica — hotel", () => {
  it("hospedagem cancelada não conta como registrada", () => {
    const f = fontes();
    const linhas = linhasDaLogistica(vagasDoPainel(f.vagas, RECORTE_PADRAO), contextoDoPainel(f), "hotel", HOJE);
    const a = linhas.find((l) => l.eventId === "a")!;
    expect(a).toMatchObject({ precisam: 2, feitas: 1, aFazer: 1, esperandoEscala: 0, situacao: "atrasado", atraso: 7, diasAntes: 30 });
  });
});

describe("foraDoPrazo e resumo", () => {
  it("atrasados (mais atrasado primeiro) e vencendo em até 3 dias; evento passado fora", () => {
    const f = fontes();
    const p = montarPainelDaLogistica(f, "passagem", RECORTE_PADRAO, HOJE);
    expect(p.linhas.map((l) => l.eventId)).toEqual(["d", "a", "b"]); // pela data do evento; "c" já aconteceu
    expect(p.fora.atrasado.map((l) => l.eventId)).toEqual(["d", "a"]);
    expect(p.fora.vence_logo.map((l) => l.eventId)).toEqual(["b"]);
    expect(p.resumo).toMatchObject({
      eventos: 3, precisam: 7, feitas: 1, aFazerAtrasadas: 2, eventosAtrasados: 1, esperandoAtrasadas: 2, vencendo: 2, eventosVencendo: 1,
    });
  });

  it("evento sem nada por fazer não entra; prazo com folga não entra", () => {
    const fora = foraDoPrazo([
      { eventId: "x", atraso: 5, aFazer: 0, esperandoEscala: 0 },
      { eventId: "y", atraso: -10, aFazer: 3, esperandoEscala: 0 },
      { eventId: "z", atraso: -3, aFazer: 1, esperandoEscala: 0 },
    ] as Parameters<typeof foraDoPrazo>[0]);
    expect(fora.atrasado).toHaveLength(0);
    expect(fora.vence_logo.map((l) => l.eventId)).toEqual(["z"]);
  });

  it("resumo vazio não divide por zero", () => {
    expect(resumirLogistica([])).toMatchObject({ eventos: 0, pctFeitas: null, aFazerAtrasadas: 0 });
  });
});

describe("recorte da tela", () => {
  it("período pelo dia do evento; filtro de função e de evento; opções contam sem o próprio filtro", () => {
    const f = fontes();
    const em30 = montarPainelDaLogistica(f, "passagem", { ...RECORTE_PADRAO, periodo: "30" }, HOJE);
    expect(em30.linhas.map((l) => l.eventId)).toEqual(["d", "a"]); // 06/12 fica a 37 dias
    const ceno = montarPainelDaLogistica(f, "passagem", { ...RECORTE_PADRAO, funcoes: ["ceno"] }, HOJE);
    expect(ceno.linhas.map((l) => l.eventId)).toEqual(["b"]);
    expect(ceno.opcoes.funcoes).toEqual([{ id: "ceno", nome: "Cenotécnica", n: 1 }, { id: "prod", nome: "Produção", n: 6 }]);
    expect(ceno.opcoes.eventos.map((o) => o.id)).toEqual(["b"]);
    const soB = montarPainelDaLogistica(f, "passagem", { ...RECORTE_PADRAO, eventId: "b" }, HOJE);
    expect(soB.linhas).toHaveLength(1);
    expect(soB.opcoes.eventos.map((o) => o.id)).toEqual(["d", "a", "b"]);
  });

  it("eventoNoPeriodo: hoje entra; ontem não", () => {
    expect(eventoNoPeriodo("2026-10-30", "todos", HOJE)).toBe(true);
    expect(eventoNoPeriodo("2026-10-29", "todos", HOJE)).toBe(false);
    expect(eventoNoPeriodo("2026-11-29", "30", HOJE)).toBe(true);
    expect(eventoNoPeriodo("2026-11-30", "30", HOJE)).toBe(false);
    expect(eventoNoPeriodo(null, "todos", HOJE)).toBe(false);
  });

  it("textoDoAtraso", () => {
    expect(textoDoAtraso(1)).toBe("1 dia atrasado");
    expect(textoDoAtraso(0)).toBe("vence hoje");
    expect(textoDoAtraso(-2)).toBe("vence em 2 dias");
    expect(textoDoAtraso(-9)).toBe("9 dias de folga");
  });
});
