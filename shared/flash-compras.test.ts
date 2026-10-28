/**
 * Compra de créditos Flash em lote (28/10, Fase 3 — arquivos): o que entra,
 * a prévia por colaborador com os avisos, a assinatura e as permissões do
 * lote (cancelar, pago).
 */
import { describe, expect, it } from "vitest";
import {
  assinaturaDaCompra, creditoEntraNaCompra, erroDoPeriodo, itemDoLote, loteTemArquivo, montarPreviaDaCompra, podeCancelarLote,
  podeMarcarLotePago, rotuloDoLote, type ColaboradorDaCompra, type CreditoDoFlash, type FiltroDaCompra,
} from "./flash-compras";

const F: FiltroDaCompra = { inicio: "2026-10-01", fim: "2026-10-31" };
let seq = 0;
const credito = (p: Partial<CreditoDoFlash> = {}): CreditoDoFlash => ({
  id: `m${++seq}`, collaboratorId: "c1", eventId: "e1", category: "alimentacao", type: "credito", amountCents: 1000,
  movementDate: "2026-10-10", sourceType: "comparativo", compraId: null, ...p,
});
const colabs = new Map<string, ColaboradorDaCompra>([
  ["c1", { id: "c1", nome: "Bruno Lima", cpf: "12345678909", ativo: true }],
  ["c2", { id: "c2", nome: "Ana Souza", cpf: null, ativo: true }],
  ["c3", { id: "c3", nome: "Carla Dias", cpf: "98765432100", ativo: false }],
]);

describe("o que entra na compra", () => {
  it("só crédito do comparativo, sem lote, no período e no evento", () => {
    expect(creditoEntraNaCompra(credito(), F)).toBe(true);
    expect(creditoEntraNaCompra(credito({ type: "debito" }), F)).toBe(false);
    expect(creditoEntraNaCompra(credito({ compraId: "L1" }), F)).toBe(false);
    expect(creditoEntraNaCompra(credito({ movementDate: "2026-09-30" }), F)).toBe(false);
    expect(creditoEntraNaCompra(credito({ movementDate: "2026-10-31" }), F)).toBe(true);
    expect(creditoEntraNaCompra(credito({ category: "diaria" }), F)).toBe(false);
    expect(creditoEntraNaCompra(credito({ eventId: "e2" }), { ...F, eventId: "e1" })).toBe(false);
    expect(creditoEntraNaCompra(credito({ eventId: "e1" }), { ...F, eventId: "e1" })).toBe(true);
  });

  it("manual só com \"incluir manuais\"; o legado 'oc' nunca", () => {
    expect(creditoEntraNaCompra(credito({ sourceType: "manual" }), F)).toBe(false);
    expect(creditoEntraNaCompra(credito({ sourceType: "manual" }), { ...F, incluirManuais: true })).toBe(true);
    expect(creditoEntraNaCompra(credito({ sourceType: null }), { ...F, incluirManuais: true })).toBe(true);
    expect(creditoEntraNaCompra(credito({ sourceType: "oc" }), { ...F, incluirManuais: true })).toBe(false);
  });

  it("período: datas reais, início ≤ fim, até 366 dias", () => {
    expect(erroDoPeriodo("2026-10-01", "2026-10-31")).toBeNull();
    expect(erroDoPeriodo("2026-02-30", "2026-03-01")).toMatch(/período/);
    expect(erroDoPeriodo("2026-11-01", "2026-10-01")).toMatch(/antes do fim/);
    expect(erroDoPeriodo("2025-01-01", "2026-10-01")).toMatch(/366/);
    expect(erroDoPeriodo(undefined, "2026-10-01")).toMatch(/período/);
  });
});

describe("prévia por colaborador", () => {
  it("soma por categoria; sem CPF fica fora (e no total à parte); inativo só avisa; ordem por nome", () => {
    const m = [
      credito({ collaboratorId: "c1", amountCents: 3000 }),
      credito({ collaboratorId: "c1", category: "mobilidade", amountCents: 1500 }),
      credito({ collaboratorId: "c1", amountCents: 500, movementDate: "2026-11-01" }), // fora do período
      credito({ collaboratorId: "c2", amountCents: 2000 }),
      credito({ collaboratorId: "c3", category: "mobilidade", amountCents: 700 }),
    ];
    const p = montarPreviaDaCompra(m, colabs, F);
    expect(p.linhas.map((l) => l.nome)).toEqual(["Ana Souza", "Bruno Lima", "Carla Dias"]);
    const [ana, bruno, carla] = p.linhas;
    expect(bruno).toMatchObject({ alimentacaoCents: 3000, mobilidadeCents: 1500, totalCents: 4500, entra: true, avisos: [] });
    expect(bruno.lancamentos).toHaveLength(2);
    expect(ana.entra).toBe(false);
    expect(ana.avisos.map((a) => a.codigo)).toEqual(["sem_cpf"]);
    expect(carla.entra).toBe(true);
    expect(carla.avisos.map((a) => a.codigo)).toEqual(["inativo"]);
    expect(p.totais).toEqual({ colaboradores: 2, lancamentos: 3, alimentacaoCents: 3000, mobilidadeCents: 2200, totalCents: 5200 });
    expect(p.foraDoLote).toEqual({ colaboradores: 1, lancamentos: 1, alimentacaoCents: 2000, mobilidadeCents: 0, totalCents: 2000 });
  });

  it("valor zero bloqueia; colaborador sumido do cadastro também (sem CPF)", () => {
    const p = montarPreviaDaCompra([credito({ collaboratorId: "c1", amountCents: 0 }), credito({ collaboratorId: "cx" })], colabs, F);
    const bruno = p.linhas.find((l) => l.collaboratorId === "c1")!;
    expect(bruno.avisos.map((a) => a.codigo)).toEqual(["valor_zero"]);
    expect(bruno.entra).toBe(false);
    const sumido = p.linhas.find((l) => l.collaboratorId === "cx")!;
    expect(sumido.entra).toBe(false);
    expect(p.totais.colaboradores).toBe(0);
  });

  it("assinatura: só do que ENTRA; muda com valor, com lançamento novo e não com a ordem", () => {
    const a = credito({ collaboratorId: "c1", amountCents: 1000 });
    const b = credito({ collaboratorId: "c1", category: "mobilidade", amountCents: 200 });
    const semCpf = credito({ collaboratorId: "c2", amountCents: 999 });
    const base = montarPreviaDaCompra([a, b], colabs, F).assinatura;
    expect(montarPreviaDaCompra([b, a], colabs, F).assinatura).toBe(base);
    expect(montarPreviaDaCompra([a, b, semCpf], colabs, F).assinatura).toBe(base);
    expect(montarPreviaDaCompra([a, { ...b, amountCents: 201 }], colabs, F).assinatura).not.toBe(base);
    expect(montarPreviaDaCompra([a, b, credito({ collaboratorId: "c3" })], colabs, F).assinatura).not.toBe(base);
    expect(assinaturaDaCompra([])).toBe(assinaturaDaCompra([]));
  });

  it("idempotência: depois de amarrados ao lote, os mesmos créditos não entram de novo", () => {
    const m = [credito({ collaboratorId: "c1" }), credito({ collaboratorId: "c1", category: "mobilidade" })];
    const primeira = montarPreviaDaCompra(m, colabs, F);
    expect(primeira.totais.lancamentos).toBe(2);
    const comprados = m.map((x) => ({ ...x, compraId: "lote-1" }));
    const segunda = montarPreviaDaCompra(comprados, colabs, F);
    expect(segunda.linhas).toHaveLength(0);
    expect(segunda.assinatura).not.toBe(primeira.assinatura);
    // Cancelado o lote, o vínculo some e os créditos voltam iguais.
    expect(montarPreviaDaCompra(comprados.map((x) => ({ ...x, compraId: null })), colabs, F).assinatura).toBe(primeira.assinatura);
  });

  it("o item gravado no lote não leva CPF", () => {
    const p = montarPreviaDaCompra([credito({ collaboratorId: "c3" })], colabs, F);
    const item = itemDoLote(p.linhas[0]);
    expect(item).not.toHaveProperty("cpf");
    expect(item.inativo).toBe(true);
  });
});

describe("lote: cancelar, pago, arquivo", () => {
  it("cancelar só o gerado", () => {
    expect(podeCancelarLote({ status: "gerado" }).ok).toBe(true);
    expect(podeCancelarLote({ status: "pago" })).toMatchObject({ ok: false, codigo: "lote_pago" });
    expect(podeCancelarLote({ status: "cancelado" })).toMatchObject({ ok: false, codigo: "lote_cancelado" });
    expect(podeCancelarLote(null)).toMatchObject({ ok: false, codigo: "nao_encontrado" });
  });

  it("pago: só gerado, data real e não no futuro", () => {
    expect(podeMarcarLotePago({ status: "gerado" }, "2026-10-28", "2026-10-28").ok).toBe(true);
    expect(podeMarcarLotePago({ status: "gerado" }, "2026-10-29", "2026-10-28")).toMatchObject({ codigo: "data_futura" });
    expect(podeMarcarLotePago({ status: "gerado" }, "28/10/2026", "2026-10-28")).toMatchObject({ codigo: "data_invalida" });
    expect(podeMarcarLotePago({ status: "pago" }, "2026-10-28", "2026-10-28")).toMatchObject({ codigo: "lote_pago" });
    expect(podeMarcarLotePago({ status: "cancelado" }, "2026-10-28", "2026-10-28")).toMatchObject({ codigo: "lote_cancelado" });
  });

  it("cancelado não tem arquivo; rótulo do lote", () => {
    expect(loteTemArquivo({ status: "cancelado" })).toBe(false);
    expect(loteTemArquivo({ status: "pago" })).toBe(true);
    expect(rotuloDoLote({ numero: 4, periodoInicio: "2026-10-01", periodoFim: "2026-10-31" })).toBe("Lote 4 · 01/10 a 31/10/2026");
    expect(rotuloDoLote({ numero: 5, periodoInicio: "2026-10-10", periodoFim: "2026-10-10" })).toBe("Lote 5 · 10/10/2026");
  });
});

describe("revisão 28/10 (R1) — complemento e estorno do comparativo entram no próximo lote", () => {
  it("complemento (crédito) e estorno (débito) de ajuste do comparativo entram; débito manual continua fora", () => {
    expect(creditoEntraNaCompra(credito({ sourceType: "comparativo_ajuste" }), F)).toBe(true);
    expect(creditoEntraNaCompra(credito({ sourceType: "comparativo_ajuste", type: "debito" }), F)).toBe(true);
    expect(creditoEntraNaCompra(credito({ sourceType: "manual", type: "debito" }), { ...F, incluirManuais: true })).toBe(false);
  });

  it("o estorno DESCONTA na linha do colaborador; estorno maior que os créditos fica fora do lote (com aviso)", () => {
    const p = montarPreviaDaCompra([
      credito({ id: "a", amountCents: 1000 }),
      credito({ id: "b", sourceType: "comparativo_ajuste", type: "debito", amountCents: 400 }),
      credito({ id: "c", collaboratorId: "c3", sourceType: "comparativo_ajuste", type: "debito", amountCents: 300 }),
    ], colabs, F);
    const bruno = p.linhas.find((l) => l.collaboratorId === "c1")!;
    expect(bruno).toMatchObject({ alimentacaoCents: 600, totalCents: 600, entra: true });
    const carla = p.linhas.find((l) => l.collaboratorId === "c3")!;
    expect(carla.entra).toBe(false);
    expect(carla.avisos.map((a) => a.codigo)).toContain("estorno_maior");
    expect(p.totais.totalCents).toBe(600);
  });
});
