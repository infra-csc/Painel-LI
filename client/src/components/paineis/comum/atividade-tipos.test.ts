/**
 * Painéis (30/10) — para onde cada item do feed leva, e os filtros do client.
 */
import { describe, expect, it } from "vitest";
import { usuarioFake } from "@/test/fixtures";
import { destinoDoItem, ehNovo, etapaAtrasadaDoItem, urlDaAtividade, type ItemDaAtividade, type VagaDaAtividade } from "./atividade-tipos";

const vaga = (extra: Partial<VagaDaAtividade> = {}): VagaDaAtividade => ({
  id: "v1", numero: 4821, funcao: "Staff", colaborador: "ANA", fase: "escalacao", status: "escalado", excluida: false,
  precisaPassagem: true, precisaHotel: false, pedidoPendenteId: null, trocaPendente: false, ...extra,
});
const item = (extra: Partial<ItemDaAtividade> = {}): ItemDaAtividade => ({
  id: "i1", at: "2026-10-30T12:00:00.000Z", tipo: "mudanca", titulo: "Período alterado", detalhe: null, linhas: [], comentario: null,
  autor: "Pedro", destaque: false, eventId: "ev 1", eventName: "Night Run", vagas: [vaga()], quantidade: 1, funcoes: ["Staff"],
  precisaPassagem: true, precisaHotel: false, pedidoId: null, eventStartDate: null, ...extra,
});

describe("destinoDoItem", () => {
  const admin = usuarioFake({ role: "admin" });

  it("mudança na vaga → Escalação no evento, com a busca na vaga", () => {
    expect(destinoDoItem(item(), admin)).toEqual({ href: "/scaling?eventId=ev%201&q=4821", tela: "Escalação" });
  });
  it("pedido → Aprovação já no pedido", () => {
    expect(destinoDoItem(item({ tipo: "pedido", titulo: "Pedido de ajuste aberto", pedidoId: "p9" }), admin).href)
      .toBe("/scaling-approval?eventId=ev%201&request=p9");
  });
  it("troca → bloco Em análise da Escalação", () => {
    expect(destinoDoItem(item({ tipo: "pedido", titulo: "Troca de colaborador pedida" }), admin).href).toBe("/scaling?eventId=ev%201&fila=troca");
  });
  it("passagem → Passagens no evento; hotel → Hospedagem no evento", () => {
    expect(destinoDoItem(item({ tipo: "passagem", titulo: "Passagem registrada" }), admin).href).toBe("/tickets?event=ev%201&q=4821");
    expect(destinoDoItem(item({ tipo: "hotel", titulo: "Hospedagem registrada" }), admin).href).toBe("/accommodations?event=ev%201");
  });
  it("vaga em validação/aprovação → a tela da etapa", () => {
    expect(destinoDoItem(item({ vagas: [vaga({ fase: "sugestao", status: "sugestao_pendente" })] }), admin).href).toBe("/scaling-validation?eventId=ev%201");
    expect(destinoDoItem(item({ vagas: [vaga({ fase: "sugestao", status: "sugestao_validada" })] }), admin).href).toBe("/scaling-approval?eventId=ev%201");
  });
  it("lote (várias vagas) → Escalação do evento, sem busca", () => {
    expect(destinoDoItem(item({ vagas: [vaga(), vaga({ id: "v2" })], quantidade: 2 }), admin).href).toBe("/scaling?eventId=ev%201");
  });
});

describe("filtros do client", () => {
  it("novo desde a última visita (sem visita anterior, tudo é novo)", () => {
    expect(ehNovo({ at: "2026-10-30T12:00:00.000Z" }, null)).toBe(true);
    expect(ehNovo({ at: "2026-10-30T12:00:00.000Z" }, "2026-10-30T11:00:00.000Z")).toBe(true);
    expect(ehNovo({ at: "2026-10-30T10:00:00.000Z" }, "2026-10-30T11:00:00.000Z")).toBe(false);
  });
  it("atrasado = alguma vaga do item parada em etapa vencida", () => {
    const m = new Map([["v2", "hotel" as const]]);
    expect(etapaAtrasadaDoItem(item(), m)).toBeNull();
    expect(etapaAtrasadaDoItem(item({ vagas: [vaga(), vaga({ id: "v2" })] }), m)).toBe("hotel");
  });
  it("URL da rota com os filtros do servidor", () => {
    expect(urlDaAtividade({ periodo: "7d", eventId: "e1", tipo: "hotel", comPassagem: true, comHotel: false }, "c|1", 20))
      .toBe("/api/paineis/atividade?periodo=7d&limite=20&eventId=e1&tipo=hotel&passagem=1&cursor=c%7C1");
  });
});
