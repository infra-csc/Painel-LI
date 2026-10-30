/**
 * Quadro de prazos — UMA etapa por vaga até a escala confirmada (dono, 16/10:
 * "não faz sentido a mesma escalação estar em duas colunas, ela tem que travar
 * na coluna"); Passagem e Hotel são tarefas paralelas (30/10, Viva Esporte Serra).
 */
import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import {
  ETAPAS_DO_QUADRO, analisarPorEvento, calcularKpis, diasParadaNaEtapa, etapaAtualDaVaga, quadroDoEvento,
  type AnalyticsContext,
} from "./scaling-analytics-data";

const HOJE = new Date(2026, 9, 16);
const comPassagem = new Set<string>();
const comHotel = new Set<string>();
const ctx: AnalyticsContext = {
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  getEventName: () => "Night Run",
  getFunctionName: (id) => id ?? "?",
  getCollaboratorName: (id) => `Colab ${id}`,
  temPassagem: (i) => comPassagem.has(i.id),
  temHotel: (i) => comHotel.has(i.id),
};

let seq = 0;
const vaga = (over: Partial<TeamInclusion> & { phase?: string } = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq, eventId: "nr", functionId: "prod", collaboratorId: null,
  status: "planejado", phase: "inclusao", deletedAt: null, needsTicket: false, needsAccommodation: false,
  scheduleStartDate: "2026-12-18", scheduleEndDate: "2026-12-20",
  ...over,
}) as unknown as TeamInclusion;

function cenario() {
  comPassagem.clear();
  comHotel.clear();
  const validar = vaga({ phase: "sugestao", status: "sugestao_pendente", needsTicket: true });
  const aprovar = vaga({ phase: "sugestao", status: "sugestao_validada" });
  // O print do dono: a vaga sem nome contava em Escalação E em Escalado.
  const semNome = vaga({ needsTicket: true, needsAccommodation: true });
  const salva = vaga({ collaboratorId: "c1" });
  const gestor = vaga({ collaboratorId: "c2", status: "aguardando_producao" });
  const semPassagem = vaga({ collaboratorId: "c3", status: "escalado", needsTicket: true, needsAccommodation: true });
  const semHotel = vaga({ collaboratorId: "c4", status: "escalado", needsTicket: true, needsAccommodation: true });
  comPassagem.add(semHotel.id);
  // Não precisa de passagem: pula direto para o hotel.
  const soHotel = vaga({ collaboratorId: "c5", status: "escalado", needsAccommodation: true });
  const pronta = vaga({ collaboratorId: "c6", status: "escalado", needsTicket: true, needsAccommodation: true });
  comPassagem.add(pronta.id);
  comHotel.add(pronta.id);
  const local = vaga({ collaboratorId: "c7", status: "escalado" });
  return { validar, aprovar, semNome, salva, gestor, semPassagem, semHotel, soHotel, pronta, local };
}

describe("uma etapa por vaga: a primeira que ela ainda não cumpriu", () => {
  it("Validação → Aprovação → Escalação → Escalado → Passagem → Hotel → Concluída", () => {
    const v = cenario();
    expect(etapaAtualDaVaga(v.validar, ctx)).toBe("validacao");
    expect(etapaAtualDaVaga(v.aprovar, ctx)).toBe("aprovacao");
    expect(etapaAtualDaVaga(v.semNome, ctx)).toBe("escalacao");
    expect(etapaAtualDaVaga(v.salva, ctx)).toBe("escalado");
    expect(etapaAtualDaVaga(v.gestor, ctx)).toBe("escalado");
    expect(etapaAtualDaVaga(v.semPassagem, ctx)).toBe("passagem");
    expect(etapaAtualDaVaga(v.semHotel, ctx)).toBe("hotel");
    expect(etapaAtualDaVaga(v.soHotel, ctx)).toBe("hotel");
    expect(etapaAtualDaVaga(v.pronta, ctx)).toBe("concluida");
    expect(etapaAtualDaVaga(v.local, ctx)).toBe("concluida");
  });

  it("até a escala confirmada, uma coluna por vaga; Passagem e Hotel contam cada tarefa por si", () => {
    const v = cenario();
    const vagas = Object.values(v);
    const q = quadroDoEvento(vagas, ctx);
    const contagem = Object.fromEntries(ETAPAS_DO_QUADRO.map((e) => [e, q.colunas[e].paradas.length]));
    // Hotel: semPassagem (sem os dois) também conta — a reserva não espera a passagem.
    expect(contagem).toEqual({ validacao: 1, aprovacao: 1, escalacao: 1, escalado: 2, passagem: 1, hotel: 3 });
    expect(q.concluidas.length).toBe(2);
    const ateEscalado = ETAPAS_DO_QUADRO.filter((e) => e !== "passagem" && e !== "hotel");
    const ids = ateEscalado.flatMap((e) => q.colunas[e].paradas).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(q.colunas.hotel.paradas.map((i) => i.id)).toContain(v.semPassagem.id);
    // A vaga sem nome do print: só em Escalação.
    expect(q.colunas.escalado.paradas.map((i) => i.id)).not.toContain(v.semNome.id);
  });

  it("antes e já passaram de cada coluna; Passagem/Hotel contam só quem precisa", () => {
    const v = cenario();
    const q = quadroDoEvento(Object.values(v), ctx);
    expect(q.colunas.escalacao.antes.map((i) => i.id).sort()).toEqual([v.validar.id, v.aprovar.id].sort());
    // Antes da escala confirmada, só quem PRECISA de passagem: validar e semNome.
    expect(q.colunas.passagem.antes.map((i) => i.id).sort()).toEqual([v.validar.id, v.semNome.id].sort());
    // Já cumpriram Passagem: quem precisava e tem (semHotel, pronta) — soHotel e local não precisavam.
    expect(q.colunas.passagem.passaram.map((i) => i.id).sort()).toEqual([v.semHotel.id, v.pronta.id].sort());
    expect(q.colunas.hotel.passaram.map((i) => i.id)).toEqual([v.pronta.id]);
    expect(q.colunas.passagem.ninguemPrecisa).toBe(false);
  });

  it("hotel reservado com a passagem pendente: a coluna Hotel já conta a vaga como cumprida (30/10)", () => {
    comPassagem.clear();
    comHotel.clear();
    const a = vaga({ collaboratorId: "s1", status: "escalado", needsTicket: true, needsAccommodation: true });
    const b = vaga({ collaboratorId: "s2", status: "escalado", needsTicket: true, needsAccommodation: true });
    comHotel.add(a.id);
    comHotel.add(b.id);
    const q = quadroDoEvento([a, b], ctx);
    expect(q.colunas.passagem.paradas.length).toBe(2);
    expect(q.colunas.hotel.paradas).toEqual([]);
    expect(q.colunas.hotel.antes).toEqual([]);
    expect(q.colunas.hotel.passaram.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("vaga sem nome que não pede hotel não conta como 'antes' na coluna Hotel", () => {
    comPassagem.clear();
    comHotel.clear();
    const a = vaga({ collaboratorId: "s1", status: "escalado", needsTicket: false, needsAccommodation: true });
    const semNome = vaga({ needsTicket: true, needsAccommodation: false });
    comHotel.add(a.id);
    const q = quadroDoEvento([a, semNome], ctx);
    expect(q.colunas.hotel.antes).toEqual([]);
    expect(q.colunas.hotel.paradas).toEqual([]);
    expect(q.colunas.passagem.antes.map((i) => i.id)).toEqual([semNome.id]);
  });

  it("ninguém precisa: o evento sem nenhuma vaga com passagem ou hotel", () => {
    const q = quadroDoEvento([vaga({ collaboratorId: "c1", status: "escalado" }), vaga()], ctx);
    expect(q.colunas.passagem.ninguemPrecisa).toBe(true);
    expect(q.colunas.hotel.ninguemPrecisa).toBe(true);
    expect(q.colunas.passagem.paradas).toEqual([]);
  });

  it("os KPIs do topo continuam totais do recorte (não travam por etapa)", () => {
    const v = cenario();
    const k = calcularKpis(Object.values(v), ctx, HOJE);
    // Precisam de passagem na escalação (sugestões fora): semNome, semPassagem, semHotel, pronta.
    expect(k.logistica.passagens).toEqual({ precisam: 4, emitidas: 2 });
    expect(k.logistica.hoteis).toEqual({ precisam: 5, reservados: 1 });
  });

  it("o evento analisado leva as vagas para o quadro", () => {
    const v = cenario();
    const [e] = analisarPorEvento(Object.values(v), ctx, HOJE);
    expect(e.vagas.length).toBe(10);
  });

  it("dias parada: validação conta do envio, aprovação da validação, o resto da última alteração", () => {
    const i = vaga({
      suggestionSentAt: new Date(2026, 9, 6), validatedAt: new Date(2026, 9, 13), updatedAt: new Date(2026, 9, 15),
    } as Partial<TeamInclusion>);
    expect(diasParadaNaEtapa(i, "validacao", HOJE)).toBe(10);
    expect(diasParadaNaEtapa(i, "aprovacao", HOJE)).toBe(3);
    expect(diasParadaNaEtapa(i, "escalacao", HOJE)).toBe(1);
    expect(diasParadaNaEtapa(vaga({ updatedAt: null } as unknown as Partial<TeamInclusion>), "hotel", HOJE)).toBeNull();
  });
});
