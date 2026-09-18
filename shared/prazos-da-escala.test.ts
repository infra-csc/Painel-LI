import { describe, it, expect } from "vitest";
import { DIAS_PADRAO, diasDeAtraso, lerDiasDosPrazos, prazoDaEtapa, situacaoDoPrazo, validarDiasDosPrazos } from "./prazos-da-escala";

const dm = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : null);

describe("prazos das etapas contados da data do evento (planilha 18/09)", () => {
  it("evento em 20/10 dá exatamente as datas da planilha", () => {
    expect(dm(prazoDaEtapa("2026-10-20", "registro"))).toBe("18/09");
    expect(dm(prazoDaEtapa("2026-10-20", "validacao"))).toBe("25/09");
    expect(dm(prazoDaEtapa("2026-10-20", "aprovacao"))).toBe("26/09");
    expect(dm(prazoDaEtapa("2026-10-20", "escalacao"))).toBe("03/10");
    expect(dm(prazoDaEtapa("2026-10-20", "escalado"))).toBe("03/10");
    expect(dm(prazoDaEtapa("2026-10-20", "passagem"))).toBe("10/10");
  });

  it("aceita ISO com horário e Date; sem data não inventa prazo; respeita os dias editados", () => {
    expect(dm(prazoDaEtapa("2026-10-20T03:00:00.000Z", "passagem"))).toBe("10/10");
    expect(dm(prazoDaEtapa(new Date(2026, 9, 20), "validacao"))).toBe("25/09");
    expect(prazoDaEtapa(null, "validacao")).toBeNull();
    expect(dm(prazoDaEtapa("2026-10-20", "passagem", { ...DIAS_PADRAO, passagem: 15 }))).toBe("05/10");
  });

  it("situação: cumprido sem pendência; atrasado, vence logo ou no prazo com pendência", () => {
    const hoje = new Date(2026, 8, 24); // 24/09
    const validacao = prazoDaEtapa("2026-10-20", "validacao"); // 25/09
    expect(situacaoDoPrazo(validacao, hoje, 0)).toBe("cumprido");
    expect(situacaoDoPrazo(validacao, hoje, 2)).toBe("vence_logo");
    expect(situacaoDoPrazo(prazoDaEtapa("2026-10-20", "registro"), hoje, 2)).toBe("atrasado");
    expect(situacaoDoPrazo(prazoDaEtapa("2026-10-20", "passagem"), hoje, 2)).toBe("no_prazo");
    expect(situacaoDoPrazo(null, hoje, 2)).toBe("sem_data");
  });

  it("dias de atraso", () => {
    expect(diasDeAtraso(prazoDaEtapa("2026-10-20", "registro"), new Date(2026, 8, 24))).toBe(6);
    expect(diasDeAtraso(prazoDaEtapa("2026-10-20", "passagem"), new Date(2026, 8, 24))).toBe(-16);
  });

  it("lê o que o administrador gravou e cai no padrão no resto (ou em valor inválido)", () => {
    const dias = lerDiasDosPrazos([{ key: "prazo_dias_passagem", value: "15" }, { key: "prazo_dias_validacao", value: "abc" }]);
    expect(dias.passagem).toBe(15);
    expect(dias.validacao).toBe(25);
    expect(dias.registro).toBe(32);
  });

  it("validação do que o administrador manda", () => {
    expect(validarDiasDosPrazos({ passagem: 12, validacao: "20" })).toEqual({ dias: { passagem: 12, validacao: 20 } });
    expect(validarDiasDosPrazos({ passagem: -1 })).toEqual({ erro: "Passagem emitida: informe um número inteiro de 0 a 365 dias." });
    expect(validarDiasDosPrazos({ passagem: 2.5 })).toHaveProperty("erro");
    expect(validarDiasDosPrazos({})).toEqual({ erro: "Nenhum prazo informado." });
  });
});
