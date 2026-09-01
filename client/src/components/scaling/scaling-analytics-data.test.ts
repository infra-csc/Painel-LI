import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import {
  analisarPorEvento, bucketDaLinha, calcularKpis, funcoesDescobertas, gargalos,
  textoDeFimDeSemana, textoDePrazo, vagasVivas, type AnalyticsContext,
} from "./scaling-analytics-data";

/** Sábado, 25/07/2026 — a mesma referência do protótipo do handoff. */
const HOJE = new Date(2026, 6, 25);

let seq = 0;
const vaga = (over: Partial<TeamInclusion> = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq,
  eventId: "e1", functionId: "f1", collaboratorId: null,
  status: "pendente", deletedAt: null, updatedAt: null,
  scheduleStartDate: "2026-08-10", scheduleEndDate: "2026-08-12",
  ...over,
}) as TeamInclusion;

const ctx = (over: Partial<AnalyticsContext> = {}): AnalyticsContext => ({
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  getEventName: (id) => `Evento ${id}`,
  getFunctionName: (id) => `Função ${id}`,
  getCollaboratorName: (id) => `Colab ${id}`,
  ...over,
});

describe("o que entra na conta", () => {
  it("cancelada e excluída ficam fora de todos os totais", () => {
    const linhas = [vaga(), vaga({ status: "cancelado" }), vaga({ deletedAt: new Date() as any })];
    expect(vagasVivas(linhas)).toHaveLength(1);
    expect(calcularKpis(linhas, ctx(), HOJE).totalVivas).toBe(1);
  });
});

describe("KPIs", () => {
  it("preenchimento é sobre NOME, não sobre status", () => {
    // Uma vaga com o gestor JÁ TEM gente. Contá-la como não preenchida faria o
    // "60%" contradizer o "faltam 2" ao lado, na mesma faixa.
    const linhas = [
      vaga({ collaboratorId: "c1", status: "aguardando_producao" }),
      vaga({ collaboratorId: "c2", status: "escalado" }),
      vaga(),
      vaga(),
    ];
    const k = calcularKpis(linhas, ctx(), HOJE);
    expect(k.preenchimentoPct).toBe(50);
    expect(k.faltamEscalar).toBe(2);
  });

  it("sem vaga nenhuma, o preenchimento é 100 — não NaN", () => {
    expect(calcularKpis([], ctx(), HOJE).preenchimentoPct).toBe(100);
  });

  it("prazo mais curto é a próxima escala a COMEÇAR, ignorando o passado", () => {
    // Com anos de histórico na base, o menor número é sempre de algo que já
    // aconteceu, e o KPI diria "já começou" para sempre — verdade inútil.
    const linhas = [
      vaga({ scheduleStartDate: "2025-03-01" }), // ano passado
      vaga({ scheduleStartDate: "2026-09-01" }),
      vaga({ scheduleStartDate: "2026-08-01" }),
    ];
    expect(calcularKpis(linhas, ctx(), HOJE).prazoMaisCurtoDias).toBe(7);
    expect(calcularKpis([vaga({ scheduleStartDate: null })], ctx(), HOJE).prazoMaisCurtoDias).toBeNull();
    // Só passado: não há próximo prazo a informar.
    expect(calcularKpis([vaga({ scheduleStartDate: "2025-03-01" })], ctx(), HOJE).prazoMaisCurtoDias).toBeNull();
  });

  it("travadas junta gestor, troca e ajuste sem contar a mesma linha duas vezes", () => {
    const comTroca = vaga({ collaboratorId: "c1", status: "aguardando_producao" });
    const k = calcularKpis([comTroca, vaga({ collaboratorId: "c2" })], ctx({ temTroca: () => true }), HOJE);
    expect(k.travadas).toBe(2); // a segunda entra pela troca; a primeira, uma vez só
    expect(calcularKpis([comTroca], ctx({ temTroca: () => true }), HOJE).travadas).toBe(1);
  });
});

describe("buckets da barra", () => {
  it("classifica cada linha em um bucket só", () => {
    const c = ctx();
    expect(bucketDaLinha(vaga(), c)).toBe("vaga");
    expect(bucketDaLinha(vaga({ collaboratorId: "c1", status: "aguardando_producao" }), c)).toBe("gestor");
    expect(bucketDaLinha(vaga({ collaboratorId: "c1", status: "escalado" }), c)).toBe("escalado");
    expect(bucketDaLinha(vaga({ collaboratorId: "c1", status: "aprovacao" }), c)).toBe("escalado");
    expect(bucketDaLinha(vaga({ collaboratorId: "c1", status: "aprovado" }), c)).toBe("aprovado");
  });

  it("sem nome é vaga aberta, qualquer que seja o status gravado", () => {
    expect(bucketDaLinha(vaga({ status: "escalado", collaboratorId: null }), ctx())).toBe("vaga");
  });
});

describe("por evento", () => {
  it("agrega o período do menor início ao maior fim", () => {
    const linhas = [
      vaga({ scheduleStartDate: "2026-08-10", scheduleEndDate: "2026-08-12" }),
      vaga({ scheduleStartDate: "2026-08-05", scheduleEndDate: "2026-08-20" }),
    ];
    const [e] = analisarPorEvento(linhas, ctx(), HOJE);
    expect(e.ini).toEqual(new Date(2026, 7, 5));
    expect(e.fim).toEqual(new Date(2026, 7, 20));
    expect(e.prazoDias).toBe(11);
  });

  it("segmento zerado não é renderizado", () => {
    // Um span de 0% ainda desenharia 1px de cor falsa na barra.
    const [e] = analisarPorEvento([vaga(), vaga()], ctx(), HOJE);
    expect(e.segmentos).toHaveLength(1);
    expect(e.segmentos[0].key).toBe("vaga");
    expect(e.segmentos[0].pct).toBe(100);
  });

  it("crítico exige prazo curto E vaga aberta — nenhum dos dois sozinho", () => {
    const perto = { scheduleStartDate: "2026-08-01", scheduleEndDate: "2026-08-02" };
    const longe = { scheduleStartDate: "2026-12-01", scheduleEndDate: "2026-12-02" };
    expect(analisarPorEvento([vaga(perto)], ctx(), HOJE)[0].critico).toBe(true);
    expect(analisarPorEvento([vaga({ ...perto, collaboratorId: "c1" })], ctx(), HOJE)[0].critico).toBe(false);
    expect(analisarPorEvento([vaga(longe)], ctx(), HOJE)[0].critico).toBe(false);
  });

  it("os críticos e os de prazo mais curto vêm primeiro", () => {
    const linhas = [
      vaga({ eventId: "longe", scheduleStartDate: "2026-12-01" }),
      vaga({ eventId: "perto", scheduleStartDate: "2026-08-01" }),
    ];
    expect(analisarPorEvento(linhas, ctx(), HOJE).map((e) => e.eventId)).toEqual(["perto", "longe"]);
  });

  it("evento que já terminou não é crítico, e vai para o fim da lista", () => {
    // Sem isto, todo evento antigo com vaga aberta satisfaz "prazo <= 21 dias"
    // e ocupa o topo para sempre — vaga aberta em evento que já aconteceu é
    // histórico, não trabalho de hoje.
    const linhas = [
      vaga({ eventId: "velho", scheduleStartDate: "2025-11-12", scheduleEndDate: "2025-11-16" }),
      vaga({ eventId: "futuro", scheduleStartDate: "2026-12-01", scheduleEndDate: "2026-12-03" }),
      vaga({ eventId: "urgente", scheduleStartDate: "2026-08-01", scheduleEndDate: "2026-08-03" }),
    ];
    const out = analisarPorEvento(linhas, ctx(), HOJE);
    expect(out.map((e) => e.eventId)).toEqual(["urgente", "futuro", "velho"]);
    expect(out.find((e) => e.eventId === "velho")).toMatchObject({ jaTerminou: true, critico: false });
    expect(out.find((e) => e.eventId === "urgente")).toMatchObject({ jaTerminou: false, critico: true });
  });

  it("evento em ANDAMENTO ainda é crítico — começou, mas não acabou", () => {
    const emCurso = [vaga({ scheduleStartDate: "2026-07-20", scheduleEndDate: "2026-08-10" })];
    expect(analisarPorEvento(emCurso, ctx(), HOJE)[0]).toMatchObject({ jaTerminou: false, critico: true });
  });

  it("conta quantas vagas cruzam um fim de semana", () => {
    const linhas = [
      vaga({ scheduleStartDate: "2026-07-27", scheduleEndDate: "2026-07-31" }), // seg → sex
      vaga({ scheduleStartDate: "2026-07-30", scheduleEndDate: "2026-08-02" }), // qui → dom
    ];
    expect(analisarPorEvento(linhas, ctx(), HOJE)[0].noFimDeSemana).toBe(1);
  });
});

describe("onde falta gente", () => {
  it("lista só funções com vaga aberta, da mais descoberta para a menos", () => {
    const linhas = [
      vaga({ functionId: "a" }), vaga({ functionId: "a" }),
      vaga({ functionId: "b" }),
      vaga({ functionId: "c", collaboratorId: "c1" }),
    ];
    const out = funcoesDescobertas(linhas, ctx());
    expect(out.map((f) => f.functionId)).toEqual(["a", "b"]);
    expect(out[0]).toMatchObject({ abertas: 2, total: 2 });
  });
});

describe("esperando alguém decidir", () => {
  it("cada linha entra por um motivo só, com os atrasados na frente", () => {
    const antiga = vaga({ collaboratorId: "c1", status: "aguardando_producao", updatedAt: new Date(2026, 6, 20) as any });
    const nova = vaga({ collaboratorId: "c2", status: "aguardando_producao", updatedAt: new Date(2026, 6, 24) as any });
    const out = gargalos([nova, antiga], ctx(), HOJE);
    expect(out.map((g) => g.diasParado)).toEqual([5, 1]);
    expect(out[0].oque).toBe("com o gestor");
    expect(out[0].tipo).toBe("gestor");
  });

  it("vaga sem nome travada com o gestor não vira “Colab null”", () => {
    const g = gargalos([vaga({ status: "aguardando_producao" })], ctx(), HOJE);
    expect(g[0].nome).toBe("Vaga sem nome");
  });

  it("linha sem trava nenhuma não entra", () => {
    expect(gargalos([vaga({ collaboratorId: "c1", status: "escalado" })], ctx(), HOJE)).toHaveLength(0);
  });
});

describe("textos", () => {
  it("prazo", () => {
    expect(textoDePrazo(12)).toBe("em 12 dias");
    expect(textoDePrazo(1)).toBe("em 1 dia");
    expect(textoDePrazo(0)).toBe("começa hoje");
    expect(textoDePrazo(-3)).toBe("já começou");
    expect(textoDePrazo(null)).toBe("sem data");
  });

  it("fim de semana", () => {
    expect(textoDeFimDeSemana(0, 5)).toBe("nenhuma no fim de semana");
    expect(textoDeFimDeSemana(5, 5)).toBe("todas pegam fim de semana");
    expect(textoDeFimDeSemana(2, 5)).toBe("2 pegam fim de semana");
  });
});
