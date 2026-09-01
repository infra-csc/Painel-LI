import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import type { AnalyticsContext } from "./scaling-analytics-data";
import { montarRelatorioDeCobertura, nomeDoArquivo, textoDoRelatorio } from "./scaling-coverage-report";

const HOJE = new Date(2026, 8, 1); // 01/09/2026

const NOMES_EVENTO: Record<string, string> = {
  dog: "Dog Race São Paulo 2026",
  girl: "Girl Power 2 – Rio de Janeiro/RJ",
  net: "Netshoes – Recife 2026",
  cheio: "Evento Completo",
};
const NOMES_FUNCAO: Record<string, string> = {
  ceno: "Cenotecnica", sup: "Sup Ceno", perc: "Percurso", kit: "Kit",
};

const ctx: AnalyticsContext = {
  temNome: (i) => !!i.collaboratorId,
  temTroca: () => false,
  temPedido: () => false,
  getEventName: (id) => NOMES_EVENTO[id ?? ""] ?? "?",
  getFunctionName: (id) => NOMES_FUNCAO[id ?? ""] ?? "?",
  getCollaboratorName: (id) => `Colab ${id}`,
};

let seq = 0;
const vaga = (over: Partial<TeamInclusion> = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq, eventId: "dog", functionId: "ceno",
  collaboratorId: null, status: "pendente", deletedAt: null,
  scheduleStartDate: "2026-10-18", scheduleEndDate: "2026-10-18",
  ...over,
}) as TeamInclusion;

/** n vagas iguais. */
const varias = (n: number, over: Partial<TeamInclusion> = {}) =>
  Array.from({ length: n }, () => vaga(over));

describe("cruzamento evento × função", () => {
  it("conta quantas faltam de cada função, da que mais falta para a que menos", () => {
    const linhas = [
      ...varias(7, { eventId: "dog", functionId: "ceno" }),
      ...varias(1, { eventId: "dog", functionId: "sup" }),
      // uma preenchida não conta como falta, mas conta no total do evento
      vaga({ eventId: "dog", functionId: "ceno", collaboratorId: "c1" }),
    ];
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel.comVagaAberta).toHaveLength(1);
    expect(rel.comVagaAberta[0].funcoes).toEqual([
      { nome: "Cenotecnica", abertas: 7 },
      { nome: "Sup Ceno", abertas: 1 },
    ]);
    expect(rel.comVagaAberta[0]).toMatchObject({ total: 9, abertas: 8, intocado: false });
  });

  it("evento sem nenhuma vaga preenchida vai para “disponível”", () => {
    // Detalhar função por função aqui seria repetir o evento inteiro; o que
    // importa é que ele ainda não foi tocado.
    const linhas = [...varias(3, { eventId: "net", functionId: "perc" })];
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel.comVagaAberta).toHaveLength(0);
    expect(rel.disponiveis).toHaveLength(1);
    expect(rel.disponiveis[0]).toMatchObject({ nome: "Netshoes – Recife 2026", total: 3, intocado: true });
  });

  it("evento completo não entra em relatório de falta", () => {
    const linhas = varias(3, { eventId: "cheio", collaboratorId: "c1" });
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel.comVagaAberta).toHaveLength(0);
    expect(rel.disponiveis).toHaveLength(0);
    expect(rel.totalAbertas).toBe(0);
  });

  it("cancelada e excluída ficam de fora", () => {
    const linhas = [
      vaga({ eventId: "dog" }),
      vaga({ eventId: "dog", status: "cancelado" }),
      vaga({ eventId: "dog", deletedAt: new Date() as any }),
      vaga({ eventId: "dog", collaboratorId: "c1" }),
    ];
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel.comVagaAberta[0]).toMatchObject({ total: 2, abertas: 1 });
    expect(rel.totalVagas).toBe(2);
  });

  it("ordena os eventos pelo que começa antes; sem data vai para o fim", () => {
    const linhas = [
      vaga({ eventId: "girl", functionId: "kit", scheduleStartDate: "2026-11-11" }),
      vaga({ eventId: "dog", functionId: "ceno", scheduleStartDate: "2026-10-18" }),
      vaga({ eventId: "cheio", functionId: "perc", scheduleStartDate: null }),
    ];
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel.disponiveis.map((e) => e.eventId)).toEqual(["dog", "girl", "cheio"]);
  });
});

describe("evento que já aconteceu", () => {
  it("fica de fora da lista — ninguém escala gente para o passado", () => {
    const linhas = [
      ...varias(3, { eventId: "dog", scheduleStartDate: "2025-11-12", scheduleEndDate: "2025-11-16" }),
      ...varias(2, { eventId: "girl", functionId: "kit", scheduleStartDate: "2026-11-11", scheduleEndDate: "2026-11-12" }),
    ];
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel.disponiveis.map((e) => e.eventId)).toEqual(["girl"]);
    expect(rel.comVagaAberta).toHaveLength(0);
    // O total do relatório só conta o que ficou nele.
    expect(rel.totalAbertas).toBe(2);
  });

  it("mas é CONTADO no rodapé, para a conta bater com a da tela", () => {
    const linhas = [
      ...varias(3, { eventId: "dog", scheduleStartDate: "2025-11-12", scheduleEndDate: "2025-11-16" }),
      ...varias(2, { eventId: "girl", functionId: "kit", scheduleStartDate: "2026-11-11", scheduleEndDate: "2026-11-12" }),
    ];
    const rel = montarRelatorioDeCobertura(linhas, ctx, HOJE);
    expect(rel).toMatchObject({ jaPassaram: 1, vagasQueJaPassaram: 3 });
    const txt = textoDoRelatorio(rel, HOJE);
    expect(txt).toContain("1 evento que já aconteceu ficou de fora (3 vagas).");
    expect(txt).not.toContain("Dog Race");
  });

  it("evento em ANDAMENTO continua na lista — começou, mas não acabou", () => {
    const emCurso = varias(2, { eventId: "dog", scheduleStartDate: "2026-08-25", scheduleEndDate: "2026-09-05" });
    const rel = montarRelatorioDeCobertura(emCurso, ctx, HOJE);
    expect(rel.disponiveis).toHaveLength(1);
    expect(rel.jaPassaram).toBe(0);
  });
});

describe("texto para colar", () => {
  const linhas = [
    ...varias(7, { eventId: "dog", functionId: "ceno" }),
    vaga({ eventId: "dog", functionId: "sup" }),
    vaga({ eventId: "dog", functionId: "ceno", collaboratorId: "c1" }),
    ...varias(2, { eventId: "net", functionId: "perc", scheduleStartDate: "2026-10-24", scheduleEndDate: "2026-10-24" }),
  ];

  it("sai no formato que a equipe usa para pedir gente", () => {
    const txt = textoDoRelatorio(montarRelatorioDeCobertura(linhas, ctx, HOJE), HOJE);
    expect(txt).toContain("EVENTOS");
    expect(txt).toContain("• Dog Race São Paulo 2026 — 18/10");
    expect(txt).toContain("   · 7 Cenotecnica");
    expect(txt).toContain("   · 1 Sup Ceno");
    expect(txt).toContain("DISPONÍVEL PARA ESCALAÇÃO (nenhuma vaga preenchida)");
    expect(txt).toContain("• Netshoes – Recife 2026 — 24/10 · 2 vagas");
  });

  it("o cabeçalho traz o total e a data — quem recebe precisa saber de quando é", () => {
    const txt = textoDoRelatorio(montarRelatorioDeCobertura(linhas, ctx, HOJE), HOJE);
    expect(txt).toContain("10 vagas abertas de 11");
    expect(txt).toContain("01/09/2026");
  });

  it("o recorte aplicado aparece, quando existe", () => {
    const txt = textoDoRelatorio(montarRelatorioDeCobertura(linhas, ctx, HOJE), HOJE, "Recorte: próximos 30 dias");
    expect(txt).toContain("Recorte: próximos 30 dias");
  });

  it("nada faltando tem texto próprio, não uma lista vazia", () => {
    const txt = textoDoRelatorio(montarRelatorioDeCobertura(varias(2, { collaboratorId: "c1" }), ctx, HOJE), HOJE);
    expect(txt).toContain("Nenhuma vaga aberta em evento que ainda vai acontecer.");
    expect(txt).not.toContain("EVENTOS");
  });

  it("singular quando é uma vaga só", () => {
    const txt = textoDoRelatorio(montarRelatorioDeCobertura([vaga()], ctx, HOJE), HOJE);
    expect(txt).toContain("1 vaga aberta de 1");
    expect(txt).toContain("· 1 vaga");
  });
});

describe("período do evento", () => {
  // O sistema NÃO guarda o dia da prova: o evento é uma janela ("08/09 a
  // 14/09") e o dia em que se corre é conhecimento de quem organiza. Escolher
  // o primeiro dia como "a data do evento" inventaria precisão que o dado não
  // tem — então sai a janela inteira.
  const comDatas: AnalyticsContext = {
    ...ctx,
    getEventDates: (id) => (id === "dog" ? { startDate: "2026-09-08", endDate: "2026-09-14" } : undefined),
  };

  it("usa o período do EVENTO, não o da escala", () => {
    // A escala começa em 05/09 (montagem); o evento é de 08 a 14.
    const linhas = varias(2, { eventId: "dog", scheduleStartDate: "2026-09-05", scheduleEndDate: "2026-09-14" });
    const txt = textoDoRelatorio(montarRelatorioDeCobertura(linhas, comDatas, HOJE), HOJE);
    expect(txt).toContain("— 08/09 a 14/09");
    expect(txt).not.toContain("05/09");
  });

  it("evento de um dia só mostra uma data", () => {
    const umDia: AnalyticsContext = {
      ...ctx,
      getEventDates: () => ({ startDate: "2026-09-20", endDate: "2026-09-20" }),
    };
    const txt = textoDoRelatorio(montarRelatorioDeCobertura(varias(1), umDia, HOJE), HOJE);
    expect(txt).toContain("— 20/09");
    expect(txt).not.toContain("20/09 a");
  });

  it("sem datas do evento, cai no período das vagas", () => {
    const linhas = varias(2, { scheduleStartDate: "2026-10-18", scheduleEndDate: "2026-10-20" });
    const txt = textoDoRelatorio(montarRelatorioDeCobertura(linhas, ctx, HOJE), HOJE);
    expect(txt).toContain("— 18/10 a 20/10");
  });

  it("o fim do EVENTO decide se já passou, não o da escala", () => {
    const passado: AnalyticsContext = {
      ...ctx,
      getEventDates: () => ({ startDate: "2025-11-12", endDate: "2025-11-16" }),
    };
    const rel = montarRelatorioDeCobertura(varias(2, { scheduleStartDate: "2025-11-10", scheduleEndDate: "2025-11-16" }), passado, HOJE);
    expect(rel.jaPassaram).toBe(1);
    expect(rel.disponiveis).toHaveLength(0);
  });
});

describe("nome do arquivo", () => {
  it("leva a data, para não sobrescrever o de ontem", () => {
    expect(nomeDoArquivo(HOJE)).toBe("escalacao-o-que-falta-2026-09-01.txt");
  });
});
