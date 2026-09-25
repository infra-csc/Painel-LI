import { describe, expect, it } from "vitest";
import {
  linhaContaNoProgresso,
  linhaPassaNoFiltro,
  montarControleRh,
  type EntradaDoControleRh,
  type NotaParaControle,
  type PlanejadoParaControle,
  type RealizadoParaControle,
  type VagaParaControle,
} from "./controle-rh";

const EV = { id: "ev1", eventNumber: 1, name: "Evento", location: "SP", startDate: "2026-10-10", endDate: "2026-10-12", status: "planejado" };

function vaga(o: Partial<VagaParaControle> & { id: string; collaboratorId: string | null; functionId: string }): VagaParaControle {
  return { inclusionNumber: 1, eventId: EV.id, emitsNf: true, status: "escalado", phase: "escalacao", createdAt: "2026-09-01T10:00:00Z", deletedAt: null, ...o };
}
function planejado(o: Partial<PlanejadoParaControle> & { id: string; collaboratorId: string | null; functionId: string }): PlanejadoParaControle {
  return {
    eventId: EV.id, collaboratorType: "freela", dailyQuantity: 3, dailyValue: 10_000, costAssistance: 0, weekdayLunch: 0, weekdayDinner: 0,
    weekendLunch: 0, weekendDinner: 0, mobility: 0, transport: 0, totalValue: 30_000, status: "pendente", observations: null, didNotAttend: false,
    createdBy: "u-resp", createdAt: "2026-09-02T10:00:00Z", updatedAt: "2026-09-03T10:00:00Z", ...o,
  };
}
function realizado(o: Partial<RealizadoParaControle> & { id: string; plannedId: string | null }): RealizadoParaControle {
  return {
    eventId: EV.id, collaboratorId: "c1", functionId: "f1", splitParentId: null, dailyQuantity: 3, dailyValue: 10_000,
    weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 0, transport: 0, totalValue: 30_000,
    changeReason: null, paymentStatus: "pendente", sentForReview: false, rhStatus: "pendente", rhComment: null, rhActionBy: null, rhActionAt: null,
    resubmitted: false, didNotAttend: false, didNotAttendReason: null, rhAdjusted: false, rhAdjustNote: null, updatedBy: "u-prod",
    updatedAt: "2026-09-05T10:00:00Z", ...o,
  };
}
function nota(o: Partial<NotaParaControle> & { id: string; budgetActualId: string }): NotaParaControle {
  return { oc: null, attachmentUrl: null, attachmentName: null, status: "enviada", returnComment: null, paymentDate: null, approvedAt: null, checkinAt: null, checkinBy: null, createdAt: null, updatedAt: null, ...o };
}

function entrada(p: Partial<EntradaDoControleRh>): EntradaDoControleRh {
  return {
    eventos: [EV], vagas: [], planejados: [], realizados: [], notas: [],
    nomesDeColaboradores: new Map([["c1", "Ana Lima"], ["c2", "Bia Souza"], ["c3", "Caio Reis"]]),
    nomesDeFuncoes: new Map([["f1", "Montagem"], ["f2", "Cenotécnica"]]),
    nomesDeUsuarios: new Map([["u-resp", "Bruno Cardoso"], ["u-rh", "Patrícia Lemos"], ["u-prod", "Rafael Nogueira"]]),
    ...p,
  };
}

describe("montarControleRh — status de cada linha", () => {
  it("vaga sem Planejado → planejamento_pendente, responsável RH, data = criação da vaga", () => {
    const r = montarControleRh(entrada({ vagas: [vaga({ id: "v1", collaboratorId: "c1", functionId: "f1" })] }));
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ id: "ti-v1", status: "planejamento_pendente", responsavelAtual: "RH", collaboratorName: "Ana Lima", functionName: "Montagem", planned: null, actual: null, emiteNf: true, nfElegivel: false, rhPrecisaAgir: true });
    expect(r.itens[0].lastActivityDate).toBe("2026-09-01T10:00:00.000Z");
    expect(r.contadores.status.planejamento_pendente).toBe(1);
  });

  it("Planejado sem Realizado → aguardando_prestacao com o nome de quem criou o Planejado", () => {
    const r = montarControleRh(entrada({
      vagas: [vaga({ id: "v1", collaboratorId: "c1", functionId: "f1" })],
      planejados: [planejado({ id: "p1", collaboratorId: "c1", functionId: "f1" })],
    }));
    expect(r.itens[0]).toMatchObject({ id: "pl-p1", status: "aguardando_prestacao", responsavelAtual: "Bruno Cardoso", teamInclusion: { id: "v1" } });
  });

  it("Realizado decide: enviado → recebida (RH); aprovado/rejeitado → Concluído; devolvido → quem editou", () => {
    const casos: Array<[Partial<RealizadoParaControle>, string, string]> = [
      [{ sentForReview: true, rhStatus: "pendente" }, "prestacao_recebida", "RH"],
      [{ sentForReview: true, rhStatus: "aprovado", rhActionBy: "u-rh", rhActionAt: "2026-09-09T10:00:00Z" }, "aprovada_faturamento", "Concluído"],
      [{ sentForReview: true, rhStatus: "rejeitado", rhActionBy: "u-rh" }, "recusada", "Concluído"],
      [{ sentForReview: true, rhStatus: "devolvido", updatedBy: "u-prod" }, "devolvida_para_ajuste", "Rafael Nogueira"],
      [{ sentForReview: false, rhStatus: "pendente", updatedBy: "u-prod" }, "aguardando_prestacao", "Rafael Nogueira"],
    ];
    for (const [extra, status, responsavel] of casos) {
      const r = montarControleRh(entrada({
        vagas: [vaga({ id: "v1", collaboratorId: "c1", functionId: "f1" })],
        planejados: [planejado({ id: "p1", collaboratorId: "c1", functionId: "f1" })],
        realizados: [realizado({ id: "a1", plannedId: "p1", ...extra })],
      }));
      expect(r.itens[0].status, JSON.stringify(extra)).toBe(status);
      expect(r.itens[0].responsavelAtual, JSON.stringify(extra)).toBe(responsavel);
    }
    const aprovado = montarControleRh(entrada({
      vagas: [vaga({ id: "v1", collaboratorId: "c1", functionId: "f1" })],
      planejados: [planejado({ id: "p1", collaboratorId: "c1", functionId: "f1" })],
      realizados: [realizado({ id: "a1", plannedId: "p1", sentForReview: true, rhStatus: "aprovado", rhActionBy: "u-rh", rhActionAt: "2026-09-09T10:00:00Z" })],
    })).itens[0];
    expect(aprovado.rhActionByName).toBe("Patrícia Lemos");
    expect(aprovado.lastActivityDate).toBe("2026-09-09T10:00:00.000Z");
  });

  it("Planejado órfão (sem vaga) entra; Realizado casa por plannedId ou pela chave; divisões (splitParentId) são ignoradas", () => {
    const r = montarControleRh(entrada({
      planejados: [planejado({ id: "p1", collaboratorId: "c2", functionId: "f1" })],
      realizados: [
        realizado({ id: "split", plannedId: "p1", splitParentId: "a1", sentForReview: true, rhStatus: "aprovado" }),
        realizado({ id: "a1", plannedId: null, collaboratorId: "c2", functionId: "f1", sentForReview: true, rhStatus: "pendente" }),
      ],
    }));
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ id: "pl-p1", teamInclusion: null, status: "prestacao_recebida", actual: { id: "a1" } });
  });

  it("vaga excluída ou sem colaborador não vira linha", () => {
    const r = montarControleRh(entrada({
      vagas: [
        vaga({ id: "v1", collaboratorId: "c1", functionId: "f1", deletedAt: "2026-09-10T00:00:00Z" }),
        vaga({ id: "v2", collaboratorId: null, functionId: "f1" }),
      ],
    }));
    expect(r.itens).toHaveLength(0);
  });
});

describe("montarControleRh — NF, isenção e contadores", () => {
  const base = () => entrada({
    vagas: [
      vaga({ id: "v1", collaboratorId: "c1", functionId: "f1" }),
      vaga({ id: "v2", collaboratorId: "c2", functionId: "f1", emitsNf: false }),
      vaga({ id: "v3", collaboratorId: "c3", functionId: "f1" }),
    ],
    planejados: [
      planejado({ id: "p1", collaboratorId: "c1", functionId: "f1" }),
      planejado({ id: "p2", collaboratorId: "c2", functionId: "f1" }),
      planejado({ id: "p3", collaboratorId: "c3", functionId: "f1" }),
    ],
    realizados: [
      realizado({ id: "a1", plannedId: "p1", collaboratorId: "c1", sentForReview: true, rhStatus: "aprovado" }),
      realizado({ id: "a2", plannedId: "p2", collaboratorId: "c2", sentForReview: true, rhStatus: "aprovado" }),
      realizado({ id: "a3", plannedId: "p3", collaboratorId: "c3", sentForReview: true, rhStatus: "aprovado" }),
    ],
    notas: [nota({ id: "n1", budgetActualId: "a1", status: "aprovada", checkinAt: "2026-09-20T10:00:00Z" })],
  });

  it("isenção definida na escalação (emitsNf=false) zera emiteNf e não conta NF pendente", () => {
    const r = montarControleRh(base());
    const porId = new Map(r.itens.map((i) => [i.id, i]));
    expect(porId.get("pl-p1")!.emiteNf).toBe(true);
    expect(porId.get("pl-p2")!.emiteNf).toBe(false);
    expect(porId.get("pl-p1")!.invoice?.status).toBe("aprovada");
    // pendente: só c3 (c1 já tem nota, c2 é isento)
    expect(r.contadores.nf).toEqual({ pending: 1, enviada: 0, devolvida: 0, aprovada: 1, checkinPending: 0, checkinDone: 1 });
    expect(r.contadores.status.aprovada_faturamento).toBe(3);
    expect(r.contadores.rhAction).toBe(0);
    // denominador do progresso: c2 é isento de NF → fica de fora (2 de 3)
    expect(r.contadores.totalParaProgresso).toBe(2);
    expect(r.funcoes).toEqual([{ id: "f1", name: "Montagem" }]);
  });

  it("totalParaProgresso ignora o filtro de status e exclui não participou, recusada e NF recusada", () => {
    const e = base();
    const r = montarControleRh({
      ...e,
      planejados: [...e.planejados, planejado({ id: "p4", collaboratorId: "c3", functionId: "f2", didNotAttend: true })],
      realizados: [
        realizado({ id: "a1", plannedId: "p1", collaboratorId: "c1", sentForReview: true, rhStatus: "aprovado" }),
        realizado({ id: "a2", plannedId: "p2", collaboratorId: "c2", sentForReview: true, rhStatus: "aprovado" }),
        realizado({ id: "a3", plannedId: "p3", collaboratorId: "c3", sentForReview: true, rhStatus: "rejeitado" }),
      ],
      notas: [nota({ id: "n1", budgetActualId: "a1", status: "recusada" })],
    }, "concluidos");
    // 4 linhas: p1 (NF recusada), p2 (isento), p3 (recusada), p4 (não participou) → nenhuma conta
    expect(r.contadores.status).toMatchObject({ aprovada_faturamento: 2, recusada: 1, aguardando_prestacao: 1 });
    expect(r.contadores.totalParaProgresso).toBe(0);
    expect(r.itens).toHaveLength(0); // o filtro só mexe em `itens`
    expect(montarControleRh(base(), "recusada").contadores.totalParaProgresso).toBe(2);
    expect(linhaContaNoProgresso({ status: "aguardando_prestacao", emiteNf: true, invoice: null, planned: null, actual: null })).toBe(true);
  });

  it("filtros dos cards: concluidos, nf_andamento, col_action, rh_action", () => {
    const r = montarControleRh(base());
    const porId = new Map(r.itens.map((i) => [i.id, i]));
    expect(linhaPassaNoFiltro(porId.get("pl-p1")!, "concluidos")).toBe(true);
    expect(linhaPassaNoFiltro(porId.get("pl-p3")!, "concluidos")).toBe(false);
    expect(linhaPassaNoFiltro(porId.get("pl-p3")!, "nf_andamento")).toBe(true);   // elegível, sem nota, emite
    expect(linhaPassaNoFiltro(porId.get("pl-p2")!, "nf_andamento")).toBe(false);  // isento
    expect(linhaPassaNoFiltro(porId.get("pl-p3")!, "col_action")).toBe(true);
    expect(linhaPassaNoFiltro(porId.get("pl-p1")!, "rh_action")).toBe(false);

    const filtrado = montarControleRh(base(), "concluidos");
    expect(filtrado.itens.map((i) => i.id)).toEqual(["pl-p1"]);
    expect(filtrado.contadores).toEqual(r.contadores); // contadores não dependem do filtro
  });

  it("NF enviada em Realizado aprovado → RH precisa agir (aprovar a nota); aprovada sem check-in também", () => {
    const e = base();
    const r = montarControleRh({ ...e, notas: [nota({ id: "n1", budgetActualId: "a1", status: "enviada" }), nota({ id: "n3", budgetActualId: "a3", status: "aprovada" })] });
    const porId = new Map(r.itens.map((i) => [i.id, i]));
    expect(porId.get("pl-p1")!.rhPrecisaAgir).toBe(true);
    expect(porId.get("pl-p3")!.rhPrecisaAgir).toBe(true);
    expect(porId.get("pl-p2")!.rhPrecisaAgir).toBe(false);
    expect(r.contadores.rhAction).toBe(2);
    expect(r.contadores.nf.checkinPending).toBe(1);
  });

  it("ordena por prioridade de status e, dentro dela, pela atividade mais recente", () => {
    const r = montarControleRh(entrada({
      vagas: [vaga({ id: "v1", collaboratorId: "c1", functionId: "f1", createdAt: "2026-09-01T00:00:00Z" }), vaga({ id: "v2", collaboratorId: "c2", functionId: "f1", createdAt: "2026-09-08T00:00:00Z" })],
      planejados: [planejado({ id: "p3", collaboratorId: "c3", functionId: "f2" })],
      realizados: [realizado({ id: "a3", plannedId: "p3", collaboratorId: "c3", functionId: "f2", sentForReview: true, rhStatus: "pendente" })],
    }));
    expect(r.itens.map((i) => i.id)).toEqual(["pl-p3", "ti-v2", "ti-v1"]);
    expect(r.funcoes.map((f) => f.name)).toEqual(["Cenotécnica", "Montagem"]);
  });
});
