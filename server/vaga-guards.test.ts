import { describe, it, expect } from "vitest";
import {
  podeEditarVaga,
  podeMudarValorDaDiaria,
  statusDeLogistica,
  passagemConta,
  hospedagemConta,
  motivoParaNaoTrocarColaborador,
  validarDiasDeTrabalho,
  motivoParaRecusarFluxoNoPatch,
} from "./vaga-guards";

describe("podeEditarVaga — cadastro ou responsável da função", () => {
  const funcao = { userId: "u-legado" };
  it("admin, produção e compras (inclusive aliases legados) sempre podem", () => {
    expect(podeEditarVaga({ id: "a", role: "admin" }, funcao, false)).toBe(true);
    expect(podeEditarVaga({ id: "b", role: "logistica" }, funcao, false)).toBe(true); // alias de production
    expect(podeEditarVaga({ id: "c", role: "compras" }, funcao, false)).toBe(true);
  });
  it("área de função só se for responsável cadastrado ou o responsável legado", () => {
    expect(podeEditarVaga({ id: "x", role: "function_area" }, funcao, false)).toBe(false);
    expect(podeEditarVaga({ id: "x", role: "function_area" }, funcao, true)).toBe(true);
    expect(podeEditarVaga({ id: "u-legado", role: "function_area" }, funcao, false)).toBe(true);
  });
  it("financeiro não edita vaga", () => {
    expect(podeEditarVaga({ id: "f", role: "financial" }, funcao, false)).toBe(false);
  });
});

describe("podeMudarValorDaDiaria", () => {
  it("só financeiro e admin", () => {
    expect(podeMudarValorDaDiaria({ id: "1", role: "financeiro" })).toBe(true);
    expect(podeMudarValorDaDiaria({ id: "1", role: "admin" })).toBe(true);
    expect(podeMudarValorDaDiaria({ id: "1", role: "production" })).toBe(false);
    expect(podeMudarValorDaDiaria({ id: "1", role: "function_area" })).toBe(false);
  });
});

describe("statusDeLogistica — derivado do que Compras registrou", () => {
  it("escalado + passagem → passagem_comprada; + hospedagem → hospedagem_comprada; ambos → tudo comprado", () => {
    expect(statusDeLogistica({ statusAtual: "escalado", temPassagem: true, temHospedagem: false })).toBe("passagem_comprada");
    expect(statusDeLogistica({ statusAtual: "escalado", temPassagem: false, temHospedagem: true })).toBe("hospedagem_comprada");
    expect(statusDeLogistica({ statusAtual: "escalado", temPassagem: true, temHospedagem: true })).toBe("hospedagem_passagem_comprada");
  });
  it("passagem já comprada + hospedagem registrada completa o par", () => {
    expect(statusDeLogistica({ statusAtual: "passagem_comprada", temPassagem: true, temHospedagem: true })).toBe("hospedagem_passagem_comprada");
    expect(statusDeLogistica({ statusAtual: "hospedagem_comprada", temPassagem: true, temHospedagem: true })).toBe("hospedagem_passagem_comprada");
  });
  it("não regride: sem nada registrado, ou de uma compra para outra, fica como está", () => {
    expect(statusDeLogistica({ statusAtual: "passagem_comprada", temPassagem: false, temHospedagem: false })).toBeNull();
    expect(statusDeLogistica({ statusAtual: "passagem_comprada", temPassagem: false, temHospedagem: true })).toBeNull();
    expect(statusDeLogistica({ statusAtual: "hospedagem_passagem_comprada", temPassagem: true, temHospedagem: false })).toBeNull();
  });
  it("mesmo status → null (nada a gravar)", () => {
    expect(statusDeLogistica({ statusAtual: "passagem_comprada", temPassagem: true, temHospedagem: false })).toBeNull();
  });
  it("não toca em vaga só salva, aguardando gestor, aprovada, concluída, cancelada ou em sugestão", () => {
    for (const s of ["planejado", "reaberto", "escalacao", "aguardando_producao", "aprovado", "concluido", "cancelado", "sugestao_pendente", null]) {
      expect(statusDeLogistica({ statusAtual: s, temPassagem: true, temHospedagem: true })).toBeNull();
    }
  });
  it("legado 'confirmado' (ocupa agenda) também deriva", () => {
    expect(statusDeLogistica({ statusAtual: "aguardando_passagem", temPassagem: true, temHospedagem: false })).toBe("passagem_comprada");
  });
});

describe("passagemConta / hospedagemConta", () => {
  it("passagem viva conta; cancelada não", () => {
    expect(passagemConta({ ticketStatus: null })).toBe(true);
    expect(passagemConta({ ticketStatus: "comprada" })).toBe(true);
    expect(passagemConta({ ticketStatus: "cancelada" })).toBe(false);
    expect(passagemConta(null)).toBe(false);
  });
  it("hospedagem precisa de hotel e não pode estar cancelada", () => {
    expect(hospedagemConta({ hotelName: "Ibis", hotelStatus: null })).toBe(true);
    expect(hospedagemConta({ hotelName: "  ", hotelStatus: null })).toBe(false);
    expect(hospedagemConta({ hotelName: "Ibis", hotelStatus: "cancelada" })).toBe(false);
  });
});

describe("motivoParaNaoTrocarColaborador", () => {
  it("vaga só salva sem logística: pode trocar direto", () => {
    expect(motivoParaNaoTrocarColaborador({ status: "planejado" }, false)).toBeNull();
    expect(motivoParaNaoTrocarColaborador({ status: "reaberto" }, false)).toBeNull();
  });
  it("confirmada, com compra ou com passagem/hospedagem viva: só pela Solicitação de Troca", () => {
    expect(motivoParaNaoTrocarColaborador({ status: "escalado" }, false)).toMatch(/Solicitação de Troca/);
    expect(motivoParaNaoTrocarColaborador({ status: "hospedagem_passagem_comprada" }, false)).toMatch(/Solicitação de Troca/);
    expect(motivoParaNaoTrocarColaborador({ status: "planejado" }, true)).toMatch(/Solicitação de Troca/);
  });
});

describe("validarDiasDeTrabalho", () => {
  it("aceita dias dentro do período, deduplicados e ordenados", () => {
    const r = validarDiasDeTrabalho(["2026-09-03", "2026-09-01", "2026-09-03"], "2026-09-01", "2026-09-05");
    expect(r).toEqual({ ok: true, dias: ["2026-09-01", "2026-09-03"] });
  });
  it("recusa dia fora do período, com a data em pt-BR", () => {
    const r = validarDiasDeTrabalho(["2026-09-07"], "2026-09-01", "2026-09-05");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("07/09/2026");
  });
  it("recusa formato inválido e não-lista", () => {
    expect(validarDiasDeTrabalho(["01/09/2026"], null, null).ok).toBe(false);
    expect(validarDiasDeTrabalho("2026-09-01", null, null).ok).toBe(false);
  });
  it("sem período, valida só o formato", () => {
    expect(validarDiasDeTrabalho(["2026-09-01"], null, null)).toEqual({ ok: true, dias: ["2026-09-01"] });
  });
});

describe("motivoParaRecusarFluxoNoPatch — client antigo mandando status pelo PATCH", () => {
  const vaga = { status: "passagem_comprada", phase: "passagem" };
  it("sem status/fase no corpo, nada a recusar", () => {
    expect(motivoParaRecusarFluxoNoPatch({ observations: "x" }, vaga)).toBeNull();
  });
  it("status/fase iguais ao que a vaga já tem = no-op (a rota de logística já derivou)", () => {
    expect(motivoParaRecusarFluxoNoPatch({ status: "passagem_comprada", phase: "passagem" }, vaga)).toBeNull();
  });
  it("cancelar e reativar apontam a rota dedicada; o resto explica a regra", () => {
    expect(motivoParaRecusarFluxoNoPatch({ status: "cancelado", phase: "cancelado" }, vaga)).toContain("/cancel");
    expect(motivoParaRecusarFluxoNoPatch({ status: "reaberto" }, vaga)).toContain("/reactivate");
    expect(motivoParaRecusarFluxoNoPatch({ status: "hospedagem_comprada" }, vaga)).toMatch(/rotas dedicadas/);
    expect(motivoParaRecusarFluxoNoPatch({ previousStatus: "escalado" }, vaga)).toMatch(/rotas dedicadas/);
  });
});
