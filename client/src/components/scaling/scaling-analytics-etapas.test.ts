import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import { analisarPorEvento, calcularKpis, funcoesDescobertas, gargalos, type AnalyticsContext } from "./scaling-analytics-data";
import { montarRelatorioDeCobertura, textoDoRelatorio } from "./scaling-coverage-report";

const HOJE = new Date(2026, 8, 18);
const ctx: AnalyticsContext = {
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  getEventName: () => "Night Foz do Iguaçu",
  getFunctionName: (id) => id ?? "?",
  getCollaboratorName: (id) => `Colab ${id}`,
};

let seq = 0;
const vaga = (over: Partial<TeamInclusion> & { phase?: string } = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq, eventId: "foz", functionId: "prod", collaboratorId: null,
  status: "planejado", phase: "inclusao", deletedAt: null,
  scheduleStartDate: "2026-10-15", scheduleEndDate: "2026-10-18",
  ...over,
}) as unknown as TeamInclusion;
const varias = (n: number, over: Parameters<typeof vaga>[0]) => Array.from({ length: n }, () => vaga(over));

// O exemplo do dono: 2 em validação, 2 em aprovação, 3 em escalação, 5 completas.
const linhas = [
  ...varias(2, { phase: "sugestao", status: "sugestao_pendente" }),
  ...varias(2, { phase: "sugestao", status: "sugestao_validada" }),
  ...varias(2, { status: "planejado" }), // sem nome
  vaga({ status: "planejado", collaboratorId: "c1" }), // salvo
  ...varias(5, { status: "escalado", collaboratorId: "c2" }),
  vaga({ phase: "sugestao", status: "sugestao_negada" }), // negada: fora
];

describe("Análises com o caminho inteiro da vaga (18/09)", () => {
  it("por evento: quantas em cada etapa, escritas — não só na barra", () => {
    const [e] = analisarPorEvento(linhas, ctx, HOJE);
    expect(e.etapas).toEqual({ validacao: 2, aprovacao: 2, escalacao: 3, completa: 5 });
    expect(e.naEscalacao).toEqual({ semNome: 2, salvo: 1, gestor: 0 });
    expect(e.total).toBe(12);
    expect(e.abertas).toBe(2); // sugestão não conta como "sem nome" da escalação
    expect(e.completaPct).toBe(42);
    expect(e.segmentos.map((s) => [s.key, s.n])).toEqual([
      ["escalado", 5], ["salvo", 1], ["vaga", 2], ["aprovacao", 2], ["validacao", 2],
    ]);
  });

  it("números do topo separam as etapas", () => {
    const k = calcularKpis(linhas, ctx, HOJE);
    expect([k.emValidacao, k.emAprovacao, k.emEscalacao, k.completas]).toEqual([2, 2, 3, 5]);
    expect(k.faltamEscalar).toBe(2);
    expect(k.totalVivas).toBe(12);
  });

  it("“Onde falta gente” continua falando só da escalação", () => {
    expect(funcoesDescobertas(linhas, ctx)).toEqual([{ functionId: "prod", nome: "prod", abertas: 2, total: 8 }]);
  });

  it("“Esperando alguém decidir”: validação e aprovação agrupadas por evento, com os dias da mais antiga", () => {
    const antigas = [
      vaga({ phase: "sugestao", status: "sugestao_pendente", suggestionSentAt: "2026-09-10T12:00:00Z" } as any),
      vaga({ phase: "sugestao", status: "sugestao_pendente", suggestionSentAt: "2026-09-16T12:00:00Z" } as any),
      vaga({ phase: "sugestao", status: "sugestao_validada", validatedAt: "2026-09-17T12:00:00Z" } as any),
    ];
    const g = gargalos(antigas, ctx, HOJE);
    expect(g.map((x) => [x.tipo, x.quantidade, x.diasParado, x.oque])).toEqual([
      ["validacao", 2, 8, "esperando a área validar"],
      ["aprovacao", 1, 1, "esperando o aprovador"],
    ]);
    expect(g[0].eventId).toBe("foz");
  });

  it("relatório “O que falta” traz validação e aprovação por função, sem confundir com vaga sem nome", () => {
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel.totalValidacao).toBe(2);
    expect(rel.totalAprovacao).toBe(2);
    expect(rel.totalAbertas).toBe(2);
    const txt = textoDoRelatorio(rel, HOJE);
    expect(txt).toContain("2 em validação · 2 em aprovação · 2 vagas abertas · 1 falta confirmar · de 12");
    expect(txt).toContain("EM VALIDAÇÃO (esperando a área validar)");
    expect(txt).toContain("EM APROVAÇÃO (validadas, esperando o aprovador)");
    expect(txt).toContain("   · 2 prod");
  });

  it("passagens e hotéis: quantas precisam e quantas já têm, por evento e no topo (sugestão fica fora)", () => {
    const comPassagem = new Set<string>();
    const comHotel = new Set<string>();
    const ctxLog: AnalyticsContext = { ...ctx, temPassagem: (i) => comPassagem.has(i.id), temHotel: (i) => comHotel.has(i.id) };
    const v1 = vaga({ status: "escalado", collaboratorId: "a", needsTicket: true, needsAccommodation: true });
    const v2 = vaga({ status: "escalado", collaboratorId: "b", needsTicket: true });
    const v3 = vaga({ status: "planejado", needsTicket: true });
    const sug = vaga({ phase: "sugestao", status: "sugestao_pendente", needsTicket: true });
    comPassagem.add(v1.id); comHotel.add(v1.id);
    const [e] = analisarPorEvento([v1, v2, v3, sug], ctxLog, HOJE);
    expect(e.logistica).toEqual({ passagens: { precisam: 3, emitidas: 1 }, hoteis: { precisam: 1, reservados: 1 } });
    expect(calcularKpis([v1, v2, v3, sug], ctxLog, HOJE).logistica.passagens).toEqual({ precisam: 3, emitidas: 1 });
  });

  it("prazo curto com vaga ainda em validação conta como crítico", () => {
    const [e] = analisarPorEvento(
      [vaga({ phase: "sugestao", status: "sugestao_pendente", scheduleStartDate: "2026-09-25", scheduleEndDate: "2026-09-26" })],
      ctx, HOJE,
    );
    expect(e.critico).toBe(true);
  });
});
