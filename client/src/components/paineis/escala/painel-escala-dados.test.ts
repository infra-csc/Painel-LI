/**
 * Painel da escala (30/10) — as contas puras: atrasos com a régua do Quadro,
 * esperas com quem age, diárias/pessoas da comparação e eventos parecidos.
 */
import { describe, it, expect } from "vitest";
import type { TeamInclusion } from "@shared/schema";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import { vagaFake } from "@/test/fixtures-dominio";
import { analisarPorEvento } from "@/components/scaling/scaling-analytics-data";
import {
  SEM_RESPONSAVEL, atrasadasPorEtapa, atrasosPorEvento, cargaPorResponsavel, compararPorFuncao, diariasDaVaga,
  diferencaGrande, esperasPorEvento, eventosParecidos, gruposParecidos, nomeBase, pessoasDaVaga, resumirEvento,
  tipoDeEsperaDaVaga, type ContextoDaComparacao, type ContextoDoPainel,
} from "./painel-escala-dados";

const HOJE = new Date(2026, 9, 30); // 30/10/2026
const DATAS: Record<string, { startDate: string; endDate: string; diaEventoInicio?: string; diaEventoFim?: string }> = {
  // Viva Esporte Serra: período 01–08/11, evento 05–06/11 (dias informados).
  serra: { startDate: "2026-11-01", endDate: "2026-11-08", diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" },
  // 15/12: D-44 (escala confirmada) = 01/11 → vence em 2 dias.
  perto: { startDate: "2026-12-15", endDate: "2026-12-15", diaEventoInicio: "2026-12-15" },
  // 31/01/2027: tudo no prazo.
  longe: { startDate: "2027-01-31", endDate: "2027-01-31", diaEventoInicio: "2027-01-31" },
  passado: { startDate: "2026-09-01", endDate: "2026-09-02" },
};
const comTroca = new Map<string, string>();
const comPedido = new Map<string, string>();

const ctx: ContextoDoPainel = {
  temNome: (i) => !!i.collaboratorId || !!i.empreitaEmpresa,
  temTroca: (i) => comTroca.has(i.id),
  temPedido: (i) => comPedido.has(i.id),
  getEventName: (id) => ({ serra: "Viva Esporte - Serra", perto: "Night Run - Recife", longe: "Circuito das Estações - Verão", passado: "Antigo" } as Record<string, string>)[id ?? ""] ?? "?",
  getFunctionName: (id) => ({ prod: "Produtor", kit: "Kit", ceno: "Cenotécnica" } as Record<string, string>)[id ?? ""] ?? "?",
  getCollaboratorName: (id) => `Colab ${id}`,
  getEventDates: (id) => (id ? DATAS[id] : undefined),
  temPassagem: () => false,
  temHotel: () => false,
  quemAge: (tipo, functionId) => {
    if (tipo === "validacao") return functionId === "prod" ? ["Gabrielle"] : [];
    if (tipo === "aprovacao" || tipo === "ajuste") return ["Marcos"];
    if (tipo === "troca") return ["Compras"];
    return ["Gestor da cenotécnica"];
  },
  desdeDaTroca: (i) => comTroca.get(i.id) ?? null,
  desdeDoPedido: (i) => comPedido.get(i.id) ?? null,
};

const v = (over: Partial<TeamInclusion>) => vagaFake({
  collaboratorId: null, functionId: "prod", status: "planejado", phase: "inclusao",
  scheduleStartDate: "2026-11-01", scheduleEndDate: "2026-11-08", workDays: null, dailyRates: 0,
  updatedAt: new Date(2026, 9, 29), ...over,
});

function cenario() {
  comTroca.clear();
  comPedido.clear();
  const serraValidar = [
    v({ eventId: "serra", phase: "sugestao", status: "sugestao_pendente", suggestionSentAt: new Date(2026, 9, 24) }),
    v({ eventId: "serra", phase: "sugestao", status: "sugestao_pendente", functionId: "kit", suggestionSentAt: new Date(2026, 9, 29) }),
  ];
  const serraAprovar = v({ eventId: "serra", phase: "sugestao", status: "sugestao_validada", validatedAt: new Date(2026, 9, 29) });
  const serraSemNome = v({ eventId: "serra" });
  const serraTroca = v({ eventId: "serra", collaboratorId: "c1", status: "escalado" });
  comTroca.set(serraTroca.id, "2026-10-20T10:00:00Z");
  const pertoSalva = v({ eventId: "perto", collaboratorId: "c2", scheduleStartDate: "2026-12-13", scheduleEndDate: "2026-12-15" });
  const longeSemNome = v({ eventId: "longe", scheduleStartDate: "2027-01-30", scheduleEndDate: "2027-01-31" });
  const passadoSemNome = v({ eventId: "passado", scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-02" });
  const cancelada = v({ eventId: "serra", status: "cancelado" });
  const todas = [...serraValidar, serraAprovar, serraSemNome, serraTroca, pertoSalva, longeSemNome, passadoSemNome, cancelada];
  return { serraValidar, serraAprovar, serraSemNome, serraTroca, pertoSalva, longeSemNome, todas, eventos: analisarPorEvento(todas, ctx, HOJE) };
}

describe("atrasos por evento — a régua do Quadro de prazos", () => {
  it("Serra (06/11): validação D-51 venceu em 16/09, 44 dias de atraso; sem nome D-47 também", () => {
    const { eventos } = cenario();
    const linhas = atrasosPorEvento(eventos, ctx, HOJE, DIAS_PADRAO);
    const serra = linhas.find((l) => l.evento.eventId === "serra")!;
    expect(serra.celulas.validacao.vagas).toHaveLength(2);
    expect(serra.celulas.validacao.situacao).toBe("atrasado");
    expect(serra.celulas.validacao.atraso).toBe(44);
    expect(serra.celulas.aprovacao.vagas).toHaveLength(1);
    expect(serra.celulas.escalacao.vagas).toHaveLength(1);
    expect(serra.celulas.escalacao.atraso).toBe(40);
    // A vaga com nome e escalada não fica parada em "a confirmar"; a cancelada não conta.
    expect(serra.celulas.escalado.vagas).toHaveLength(0);
    expect(serra.celulas.escalado.situacao).toBe("cumprido");
    expect(serra.vagasAtrasadas).toBe(4);
    expect(serra.piorAtraso).toBe(44);
  });

  it("evento com prazo vencendo em até 3 dias entra; no prazo e terminado ficam fora", () => {
    const { eventos } = cenario();
    const linhas = atrasosPorEvento(eventos, ctx, HOJE, DIAS_PADRAO);
    expect(linhas.map((l) => l.evento.eventId)).toEqual(["serra", "perto"]);
    const perto = linhas[1];
    expect(perto.celulas.escalado.situacao).toBe("vence_logo");
    expect(perto.vagasVencendo).toBe(1);
    expect(perto.proximoVencimento).toBe(2);
    expect(perto.piorAtraso).toBeNull();
  });

  it("prazos editados pelo admin valem (D-30 em vez de D-44: a salva do Recife deixa de vencer)", () => {
    const { eventos } = cenario();
    const linhas = atrasosPorEvento(eventos, ctx, HOJE, { ...DIAS_PADRAO, escalado: 30 });
    expect(linhas.map((l) => l.evento.eventId)).toEqual(["serra"]);
  });

  it("soma por etapa para o gráfico", () => {
    const { eventos } = cenario();
    const soma = atrasadasPorEtapa(atrasosPorEvento(eventos, ctx, HOJE, DIAS_PADRAO));
    expect(soma.validacao).toEqual({ atrasadas: 2, vencendo: 0 });
    expect(soma.escalado).toEqual({ atrasadas: 0, vencendo: 1 });
  });
});

describe("esperando decisão — há quantos dias e quem age", () => {
  it("cada vaga numa espera só", () => {
    const { serraValidar, serraAprovar, serraTroca, serraSemNome } = cenario();
    expect(tipoDeEsperaDaVaga(serraValidar[0], ctx)).toBe("validacao");
    expect(tipoDeEsperaDaVaga(serraAprovar, ctx)).toBe("aprovacao");
    expect(tipoDeEsperaDaVaga(serraTroca, ctx)).toBe("troca");
    expect(tipoDeEsperaDaVaga(serraSemNome, ctx)).toBeNull();
    expect(tipoDeEsperaDaVaga(v({ status: "aguardando_producao", collaboratorId: "c" }), ctx)).toBe("gestor");
  });

  it("validação conta do envio (a mais antiga, 6 dias); sem validador cadastrado aparece o aviso", () => {
    const { eventos } = cenario();
    const serra = esperasPorEvento(eventos, ctx, HOJE, DIAS_PADRAO).find((e) => e.evento.eventId === "serra")!;
    const validacao = serra.grupos.find((g) => g.tipo === "validacao")!;
    expect(validacao.diasMaisAntiga).toBe(6);
    expect(validacao.atrasado).toBe(true);
    expect(validacao.quemAge).toEqual([{ nome: "Gabrielle", vagas: 1 }, { nome: SEM_RESPONSAVEL, vagas: 1 }]);
    expect(validacao.funcoes).toEqual(["Kit", "Produtor"]);
  });

  it("aprovação esperando há 1 dia ainda é atrasada se o prazo D-51 venceu", () => {
    const { eventos } = cenario();
    const serra = esperasPorEvento(eventos, ctx, HOJE, DIAS_PADRAO).find((e) => e.evento.eventId === "serra")!;
    const aprovacao = serra.grupos.find((g) => g.tipo === "aprovacao")!;
    expect(aprovacao.diasMaisAntiga).toBe(1);
    expect(aprovacao.atrasoDoPrazo).toBe(44);
    expect(aprovacao.atrasado).toBe(true);
  });

  it("troca conta da data do pedido, não da última alteração da vaga", () => {
    const { eventos } = cenario();
    const serra = esperasPorEvento(eventos, ctx, HOJE, DIAS_PADRAO).find((e) => e.evento.eventId === "serra")!;
    const troca = serra.grupos.find((g) => g.tipo === "troca")!;
    expect(troca.diasMaisAntiga).toBe(10);
    expect(troca.quemAge[0].nome).toBe("Compras");
    expect(serra.maiorEspera).toBe(10);
  });

  it("evento sem nada esperando não entra; quem age é somado entre os eventos", () => {
    const { eventos } = cenario();
    const esperas = esperasPorEvento(eventos, ctx, HOJE, DIAS_PADRAO);
    expect(esperas.map((e) => e.evento.eventId)).toEqual(["serra"]);
    const carga = cargaPorResponsavel(esperas);
    expect(carga.map((c) => c.nome)).toContain("Marcos");
    expect(carga.find((c) => c.nome === "Gabrielle")).toMatchObject({ vagas: 1, atrasadas: 1, eventos: 1 });
  });
});

describe("diárias e pessoas da comparação", () => {
  it("dias de trabalho marcados; +½ por dia de 1,5 diária dentro deles; fora é ignorado", () => {
    const dias = ["2026-11-03", "2026-11-04", "2026-11-05"];
    expect(diariasDaVaga(v({ workDays: dias }))).toBe(3);
    expect(diariasDaVaga(v({ workDays: dias, diasMeiaExtra: ["2026-11-04"] }))).toBe(3.5);
    expect(diariasDaVaga(v({ workDays: dias, diasMeiaExtra: ["2026-11-20"] }))).toBe(3);
  });

  it("sem dias marcados vale o período; sem datas, a quantidade gravada", () => {
    expect(diariasDaVaga(v({ workDays: null, scheduleStartDate: "2026-11-01", scheduleEndDate: "2026-11-08" }))).toBe(8);
    expect(diariasDaVaga(v({ workDays: null, scheduleStartDate: null, scheduleEndDate: null, dailyRates: 4 }))).toBe(4);
  });

  it("empreita por empresa conta as pessoas dela", () => {
    expect(pessoasDaVaga(v({}))).toBe(1);
    expect(pessoasDaVaga(v({ empreitaEmpresa: "Monta Já", empreitaPessoas: 6 }))).toBe(6);
  });

  it("resumo: casa × freela × sem nome, local × viajante, sugestões e canceladas", () => {
    const tipos: Record<string, "casa" | "freela" | "local"> = { ana: "casa", bia: "freela", caio: "local" };
    const c: ContextoDaComparacao = { temNome: ctx.temNome, getFunctionName: ctx.getFunctionName, tipoDoColaborador: (id) => (id ? tipos[id] : null) };
    const dias2 = ["2026-11-05", "2026-11-06"];
    const linhas = [
      v({ eventId: "e", collaboratorId: "ana", workDays: dias2, needsTicket: true, needsAccommodation: true }),
      v({ eventId: "e", collaboratorId: "bia", workDays: dias2, needsAccommodation: true }),
      v({ eventId: "e", collaboratorId: "caio", workDays: dias2, functionId: "kit" }),
      v({ eventId: "e", workDays: dias2, functionId: "kit", phase: "sugestao", status: "sugestao_pendente" }),
      v({ eventId: "e", functionId: "ceno", empreitaEmpresa: "Monta Já", empreitaPessoas: 3, workDays: dias2 }),
      v({ eventId: "e", collaboratorId: "ana", status: "cancelado", workDays: dias2 }),
      v({ eventId: "outro", collaboratorId: "ana", workDays: dias2 }),
    ];
    const r = resumirEvento("e", linhas, c);
    expect(r.pessoas).toBe(7);
    expect(r.diarias).toBe(14);
    expect(r.diariasPorPessoa).toBe(2);
    expect(r.passagem).toBe(1);
    expect(r.hotel).toBe(2);
    expect(r.viajantes).toBe(2);
    expect(r.locais).toBe(5);
    expect(r.casa).toBe(1);
    expect(r.freela).toBe(5); // bia + caio (local) + 3 da empreita
    expect(r.semNome).toBe(1);
    expect(r.emSugestao).toBe(1);
    expect(r.porFuncao.get("kit")).toEqual({ pessoas: 2, diarias: 4 });
  });

  it("diferença grande: 3+ pessoas e 30%+ do maior", () => {
    expect(diferencaGrande([10, 7])).toBe(true);
    expect(diferencaGrande([20, 17])).toBe(false); // 15%
    expect(diferencaGrande([2, 0])).toBe(false); // só 2 pessoas
    expect(diferencaGrande([5])).toBe(false);
  });

  it("funções: zeros onde o evento não tem a função, maiores diferenças primeiro", () => {
    const c: ContextoDaComparacao = { temNome: ctx.temNome, getFunctionName: ctx.getFunctionName, tipoDoColaborador: () => "freela" };
    const muitos = (eventId: string, functionId: string, n: number) => Array.from({ length: n }, () => v({ eventId, functionId, collaboratorId: "x" }));
    const linhas = [...muitos("a", "prod", 4), ...muitos("b", "prod", 4), ...muitos("a", "kit", 8), ...muitos("b", "kit", 2), ...muitos("b", "ceno", 1)];
    const f = compararPorFuncao([resumirEvento("a", linhas, c), resumirEvento("b", linhas, c)], (id) => ctx.getFunctionName(id));
    expect(f.map((x) => x.nome)).toEqual(["Kit", "Cenotécnica", "Produtor"]);
    expect(f[0]).toMatchObject({ amplitude: 6, diferencaGrande: true });
    expect(f[1].valores.map((x) => x.pessoas)).toEqual([0, 1]);
  });
});

describe("eventos parecidos", () => {
  it("nome-base corta no separador e tira ano, etapa e acento", () => {
    expect(nomeBase("Viva Esporte - Serra")).toBe("viva esporte");
    expect(nomeBase("VIVA ESPORTE – Cariacica 2026")).toBe("viva esporte");
    expect(nomeBase("Circuito das Estações - Primavera - São Paulo")).toBe("circuito das estacoes");
    expect(nomeBase("Night Run 2026 3ª etapa")).toBe("night run");
  });

  it("parecidos do alvo: o alvo primeiro, depois os de data mais perto, até 4", () => {
    const evs = [
      { id: "serra", nome: "Viva Esporte - Serra", data: "2026-11-06" },
      { id: "car", nome: "Viva Esporte - Cariacica", data: "2026-12-12" },
      { id: "fun", nome: "Viva Esporte - Fundão", data: "2026-11-20" },
      { id: "vit", nome: "Viva Esporte - Vitória", data: "2027-02-01" },
      { id: "vv", nome: "Viva Esporte - Vila Velha", data: "2027-03-01" },
      { id: "nr", nome: "Night Run - Recife", data: "2026-11-07" },
    ];
    expect(eventosParecidos("serra", evs)).toEqual(["serra", "fun", "car", "vit"]);
    expect(eventosParecidos("nr", evs)).toEqual(["nr"]);
    const grupos = gruposParecidos(evs);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ rotulo: "Viva Esporte", ids: ["serra", "fun", "car", "vit", "vv"] });
  });
});
