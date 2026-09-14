import { describe, it, expect } from "vitest";
import { montarHistoricoDaVaga, separarComentario, type FontesDoHistorico } from "./inclusion-timeline";

const vazio = (over: Partial<FontesDoHistorico> = {}): FontesDoHistorico => ({
  vaga: { id: "v1", createdAt: "2026-09-01T10:00:00.000Z" },
  logs: [], passagens: [], hospedagens: [], trocas: [], pedidos: [],
  ...over,
});
const log = (id: string, action: string, at: string, extra: Partial<FontesDoHistorico["logs"][number]> = {}) =>
  ({ id, action, details: "", previousValue: null, newValue: null, userName: "Ana", createdAt: at, ...extra });

describe("histórico da vaga (14/09)", () => {
  it("vaga sem nenhum log ainda mostra a criação", () => {
    const h = montarHistoricoDaVaga(vazio());
    expect(h.map((e) => e.titulo)).toEqual(["Vaga criada"]);
  });

  it("aprovação do gestor não aparece duplicada com o 'Status alterado' do mesmo segundo", () => {
    const h = montarHistoricoDaVaga(vazio({
      logs: [
        log("a", "status_changed", "2026-09-02T12:00:00.100Z", { previousValue: "aguardando_producao", newValue: "escalado" }),
        log("b", "approve_production", "2026-09-02T12:00:00.300Z", { details: "Escalação aprovada pelo gestor" }),
      ],
    }));
    const titulos = h.map((e) => e.titulo);
    expect(titulos).toContain("Aprovada pelo gestor");
    expect(titulos.some((t) => t.startsWith("Status: "))).toBe(false);
  });

  it("status solto ganha rótulo legível, não a chave crua", () => {
    const h = montarHistoricoDaVaga(vazio({
      logs: [log("a", "status_changed", "2026-09-02T12:00:00.000Z", { previousValue: "planejado", newValue: "aguardando_producao" })],
    }));
    const e = h.find((x) => x.id === "log-a")!;
    expect(e.titulo).toBe("Status: Aguardando aprovação do gestor");
    expect(e.detalhe).toBe("Antes: Aguardando escalação");
  });

  it("passagem comprada e emitida entram; hospedagem registrada entra", () => {
    const h = montarHistoricoDaVaga(vazio({
      passagens: [{ id: "t1", createdAt: "2026-09-03T09:00:00.000Z", purchaseDate: "2026-09-04", emittedAt: "2026-09-05T15:00:00.000Z", emittedByName: "Compras", departureCityOrigin: "São Paulo", departureCityDestination: "Palmas", transportType: "aereo" }],
      hospedagens: [{ id: "h1", createdAt: "2026-09-06T10:00:00.000Z", hotelName: "Hotel X", checkInDate: "2026-09-25", checkOutDate: "2026-09-27" }],
    }));
    const titulos = h.map((e) => e.titulo);
    expect(titulos).toEqual(expect.arrayContaining(["Passagem registrada", "Passagem comprada", "Passagem emitida", "Hospedagem registrada"]));
    const compra = h.find((e) => e.titulo === "Passagem comprada")!;
    expect(compra.diaFixo).toBe("2026-09-04");
    expect(h.find((e) => e.titulo === "Hospedagem registrada")!.detalhe).toBe("Hotel X · 25/09/2026 a 27/09/2026");
    expect(h.find((e) => e.titulo === "Passagem emitida")!.autor).toBe("Compras");
  });

  it("troca aprovada mostra quem assumiu, de onde sai, quem aprovou e o comentário", () => {
    const h = montarHistoricoDaVaga(vazio({
      trocas: [{ id: "s1", createdAt: "2026-09-07T10:00:00.000Z", requestedByName: "Pedro", currentCollaboratorName: "João", newCollaboratorName: "Maria", newCity: "Palmas - TO", reason: "João doente", status: "aprovado", reviewedAt: "2026-09-07T11:00:00.000Z", reviewedByName: "Compras", reviewComment: "ok" }],
    }));
    const pedida = h.find((e) => e.titulo === "Troca de colaborador pedida")!;
    expect(pedida.detalhe).toBe("João → Maria · sai de Palmas - TO");
    expect(pedida.comentario).toBe("João doente");
    const aprovada = h.find((e) => e.titulo === "Troca aprovada")!;
    expect(aprovada.detalhe).toBe("Agora: Maria · sai de Palmas - TO");
    expect(aprovada.autor).toBe("Compras");
    expect(aprovada.comentario).toBe("ok");
  });

  it("validação da área não duplica quando já há o log", () => {
    const h = montarHistoricoDaVaga(vazio({
      vaga: { id: "v1", createdAt: "2026-09-01T10:00:00.000Z", validatedAt: "2026-09-02T10:00:00.000Z", validatedByName: "Área" },
      logs: [log("a", "suggestion_validated", "2026-09-02T10:00:01.000Z")],
    }));
    expect(h.filter((e) => e.titulo === "Validada pela área")).toHaveLength(1);
  });

  it("pedido já contado pelo log da vaga não entra de novo", () => {
    const h = montarHistoricoDaVaga(vazio({
      logs: [log("a", "suggestion_change_requested", "2026-09-02T10:00:00.500Z")],
      pedidos: [{ id: "p1", createdAt: "2026-09-02T10:00:00.000Z", requestType: "ajuste", requestedByName: "Área", reason: "mais um dia", status: "pendente" }],
    }));
    expect(h.filter((e) => e.categoria === "pedido")).toHaveLength(1);
  });

  it("comentário do aprovador sai do texto", () => {
    expect(separarComentario("Vaga devolvida. Comentário: faltou gente")).toEqual({ texto: "Vaga devolvida", comentario: "faltou gente" });
    expect(separarComentario("Sem comentário")).toEqual({ texto: "Sem comentário", comentario: null });
  });

  it("dias de trabalho viram linhas e a ordem é a mais recente primeiro", () => {
    const h = montarHistoricoDaVaga(vazio({
      logs: [log("a", "work_days_changed", "2026-09-05T10:00:00.000Z", { details: "2 dia(s) → 3 dia(s) | Período: a → b | Dias: 01/10 → 01/10, 02/10" })],
    }));
    expect(h[0].titulo).toBe("Dias de trabalho alterados");
    expect(h[0].linhas).toEqual(["2 dia(s) → 3 dia(s)", "Período: a → b", "Dias: 01/10 → 01/10, 02/10"]);
    expect(h[h.length - 1].titulo).toBe("Vaga criada");
  });
});

describe("permuta no histórico (14/09)", () => {
  it("diz que é permuta e para onde foi quem saiu", () => {
    const h = montarHistoricoDaVaga(vazio({
      trocas: [{ id: "p1", createdAt: "2026-09-10T10:00:00.000Z", requestedByName: "Pedro", currentCollaboratorName: "Ana", newCollaboratorName: "Bia", newCity: "Salvador - BA", reason: "mudou a escala", status: "aprovado", reviewedAt: "2026-09-10T11:00:00.000Z", reviewedByName: "Compras", reviewComment: null, permutaCom: "vaga #12 · Circuitinho", saiDeOutro: "São Paulo - SP" }],
    }));
    expect(h.find((e) => e.titulo === "Permuta de colaboradores pedida")!.detalhe).toBe("Ana → Bia · sai de Salvador - BA · Ana vai para vaga #12 · Circuitinho (sai de São Paulo - SP)");
    expect(h.find((e) => e.titulo === "Permuta aprovada")!.detalhe).toBe("Agora: Bia · sai de Salvador - BA · Ana foi para vaga #12 · Circuitinho");
  });
});
