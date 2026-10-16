import { describe, it, expect } from "vitest";
import {
  CHAVE_DO_PRAZO, DIAS_PADRAO, ETAPAS_COM_PRAZO, ROTULO_DA_ETAPA, diasDeAtraso, lerDiasDosPrazos, prazoDaEtapa,
  situacaoDoPrazo, validarDiasDosPrazos,
} from "./prazos-da-escala";

const dm = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : null);

describe("prazos das etapas contados da data do evento (processo do dono, 16/10)", () => {
  it("os dias do processo: 58 · 51 · 51 · 47 · 44 · 37 · 30 (sem o transfer)", () => {
    expect(DIAS_PADRAO).toEqual({ registro: 58, validacao: 51, aprovacao: 51, escalacao: 47, escalado: 44, passagem: 37, hotel: 30 });
    expect(ETAPAS_COM_PRAZO).toEqual(["registro", "validacao", "aprovacao", "escalacao", "escalado", "passagem", "hotel"]);
    expect(ROTULO_DA_ETAPA.hotel).toBe("Hotel reservado");
    expect(CHAVE_DO_PRAZO.hotel).toBe("prazo_dias_hotel");
  });

  it("evento em 20/12 dá as datas do processo", () => {
    expect(dm(prazoDaEtapa("2026-12-20", "registro"))).toBe("23/10");
    expect(dm(prazoDaEtapa("2026-12-20", "validacao"))).toBe("30/10");
    expect(dm(prazoDaEtapa("2026-12-20", "aprovacao"))).toBe("30/10");
    expect(dm(prazoDaEtapa("2026-12-20", "escalacao"))).toBe("03/11");
    expect(dm(prazoDaEtapa("2026-12-20", "escalado"))).toBe("06/11");
    expect(dm(prazoDaEtapa("2026-12-20", "passagem"))).toBe("13/11");
    expect(dm(prazoDaEtapa("2026-12-20", "hotel"))).toBe("20/11");
  });

  it("aceita ISO com horário e Date; sem data não inventa prazo; respeita os dias editados", () => {
    expect(dm(prazoDaEtapa("2026-12-20T03:00:00.000Z", "passagem"))).toBe("13/11");
    expect(dm(prazoDaEtapa(new Date(2026, 11, 20), "validacao"))).toBe("30/10");
    expect(prazoDaEtapa(null, "validacao")).toBeNull();
    expect(dm(prazoDaEtapa("2026-12-20", "hotel", { ...DIAS_PADRAO, hotel: 15 }))).toBe("05/12");
  });

  it("situação: cumprido sem pendência; atrasado, vence logo ou no prazo com pendência", () => {
    const hoje = new Date(2026, 9, 29); // 29/10
    const validacao = prazoDaEtapa("2026-12-20", "validacao"); // 30/10
    expect(situacaoDoPrazo(validacao, hoje, 0)).toBe("cumprido");
    expect(situacaoDoPrazo(validacao, hoje, 2)).toBe("vence_logo");
    expect(situacaoDoPrazo(prazoDaEtapa("2026-12-20", "registro"), hoje, 2)).toBe("atrasado");
    expect(situacaoDoPrazo(prazoDaEtapa("2026-12-20", "hotel"), hoje, 2)).toBe("no_prazo");
    expect(situacaoDoPrazo(null, hoje, 2)).toBe("sem_data");
  });

  it("dias de atraso", () => {
    expect(diasDeAtraso(prazoDaEtapa("2026-12-20", "registro"), new Date(2026, 9, 29))).toBe(6);
    expect(diasDeAtraso(prazoDaEtapa("2026-12-20", "hotel"), new Date(2026, 9, 29))).toBe(-22);
  });

  it("lê o que o administrador gravou e cai no padrão no resto (ou em valor inválido)", () => {
    const dias = lerDiasDosPrazos([
      { key: "prazo_dias_passagem", value: "15" },
      { key: "prazo_dias_validacao", value: "abc" },
      { key: "prazo_dias_hotel", value: "20" },
    ]);
    expect(dias.passagem).toBe(15);
    expect(dias.hotel).toBe(20);
    expect(dias.validacao).toBe(51);
    expect(dias.registro).toBe(58);
  });

  it("validação do que o administrador manda", () => {
    expect(validarDiasDosPrazos({ passagem: 12, validacao: "20" })).toEqual({ dias: { passagem: 12, validacao: 20 } });
    expect(validarDiasDosPrazos({ hotel: 30 })).toEqual({ dias: { hotel: 30 } });
    expect(validarDiasDosPrazos({ passagem: -1 })).toEqual({ erro: "Passagem emitida: informe um número inteiro de 0 a 365 dias." });
    expect(validarDiasDosPrazos({ hotel: 400 })).toEqual({ erro: "Hotel reservado: informe um número inteiro de 0 a 365 dias." });
    expect(validarDiasDosPrazos({ passagem: 2.5 })).toHaveProperty("erro");
    expect(validarDiasDosPrazos({})).toEqual({ erro: "Nenhum prazo informado." });
  });
});
