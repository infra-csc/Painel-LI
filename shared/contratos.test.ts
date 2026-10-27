import { describe, expect, it } from "vitest";
import {
  contratoAtivo, contratoVigenteEm, diasEntre, diasParaVencer, erroDaVigencia, situacaoContratualDoColaborador,
  situacaoDoContrato, travaAOc,
} from "./contratos";

const HOJE = "2026-10-26";
const c = (vigenciaInicio: string | null, vigenciaFim: string | null, encerradoEm: string | null = null) => ({ vigenciaInicio, vigenciaFim, encerradoEm });

describe("situacaoDoContrato — vigência", () => {
  it("dentro da vigência é ativo; as duas bordas contam (inclusive)", () => {
    expect(situacaoDoContrato(c("2026-01-01", "2027-12-31"), HOJE)).toBe("ativo");
    expect(situacaoDoContrato(c("2026-10-26", "2027-12-31"), HOJE)).toBe("ativo"); // começa hoje
    expect(situacaoDoContrato(c("2026-01-01", "2026-10-26"), HOJE)).toBe("vence_em_breve"); // termina hoje: ainda vale
  });

  it("fim no passado é vencido (o dia seguinte ao fim já não vale)", () => {
    expect(situacaoDoContrato(c("2025-01-01", "2026-10-25"), HOJE)).toBe("vencido");
    expect(situacaoDoContrato(c(null, "2020-01-01"), HOJE)).toBe("vencido");
  });

  it("início no futuro: ainda não começou (não conta como ativo)", () => {
    expect(situacaoDoContrato(c("2026-10-27", "2027-10-27"), HOJE)).toBe("futuro");
    expect(situacaoDoContrato(c("2027-01-01", null), HOJE)).toBe("futuro");
  });

  it("sem fim = sem prazo (ativo); sem início vale desde sempre até o fim", () => {
    expect(situacaoDoContrato(c("2020-01-01", null), HOJE)).toBe("ativo");
    expect(situacaoDoContrato(c(null, "2028-01-01"), HOJE)).toBe("ativo");
  });

  it("sem início nem fim: sem vigência — não dá para afirmar que está ativo", () => {
    expect(situacaoDoContrato(c(null, null), HOJE)).toBe("sem_vigencia");
    expect(contratoVigenteEm(c(null, null), HOJE)).toBe(false);
  });

  it("vence em até 30 dias (inclusive) é 'vence em breve'; 31 dias ainda é ativo", () => {
    expect(situacaoDoContrato(c("2026-01-01", "2026-11-25"), HOJE)).toBe("vence_em_breve"); // 30 dias
    expect(situacaoDoContrato(c("2026-01-01", "2026-11-26"), HOJE)).toBe("ativo"); // 31 dias
    expect(contratoVigenteEm(c("2026-01-01", "2026-11-25"), HOJE)).toBe(true);
  });

  it("encerrado à mão vale sobre as datas", () => {
    expect(situacaoDoContrato(c("2026-01-01", "2027-01-01", "2026-10-01T12:00:00Z"), HOJE)).toBe("encerrado");
    expect(contratoVigenteEm(c("2026-01-01", "2027-01-01", "2026-10-01T12:00:00Z"), HOJE)).toBe(false);
  });

  it("data em formato errado é ignorada (como se não houvesse)", () => {
    expect(situacaoDoContrato(c("01/01/2026", "lixo"), HOJE)).toBe("sem_vigencia");
  });

  it("virada de ano e fevereiro bissexto nas contas de dias", () => {
    expect(diasEntre("2027-12-31", "2028-01-01")).toBe(1);
    expect(diasEntre("2028-02-28", "2028-03-01")).toBe(2);
    expect(diasParaVencer(c(null, "2026-10-20"), HOJE)).toBe(-6);
    expect(diasParaVencer(c("2026-01-01", null), HOJE)).toBeNull();
  });
});

describe("contratoAtivo(contratos, cnpj, data)", () => {
  const lista = [
    { cnpj: "11.222.333/0001-81", vigenciaInicio: "2026-01-01", vigenciaFim: "2026-12-31" },
    { cnpj: "45723174000110", vigenciaInicio: "2025-01-01", vigenciaFim: "2025-12-31" },
  ];
  it("acha pelo CNPJ com ou sem máscara e respeita a data", () => {
    expect(contratoAtivo(lista, "11222333000181", HOJE)).toBe(true);
    expect(contratoAtivo(lista, "11.222.333/0001-81", "2027-01-01")).toBe(false);
    expect(contratoAtivo(lista, "45.723.174/0001-10", HOJE)).toBe(false); // vencido
    expect(contratoAtivo(lista, "45.723.174/0001-10", "2025-06-01")).toBe(true);
  });
  it("CNPJ fora da lista, vazio ou incompleto: sem contrato ativo", () => {
    expect(contratoAtivo(lista, "00.000.000/0001-91", HOJE)).toBe(false);
    expect(contratoAtivo(lista, "", HOJE)).toBe(false);
    expect(contratoAtivo(lista, null, HOJE)).toBe(false);
    expect(contratoAtivo(lista, "11.222", HOJE)).toBe(false);
  });
});

describe("situação contratual do colaborador e a pendência da OC", () => {
  it("sem CNPJ, sem contrato ativo e com contrato ativo", () => {
    expect(situacaoContratualDoColaborador([], HOJE)).toBe("sem_cnpj");
    expect(situacaoContratualDoColaborador([c("2020-01-01", "2021-01-01")], HOJE)).toBe("sem_contrato_ativo");
    expect(situacaoContratualDoColaborador([c("2020-01-01", "2021-01-01"), c("2026-01-01", null)], HOJE)).toBe("com_contrato_ativo");
  });
  it("só 'com contrato ativo' libera a OC (Fase 2); hoje é só sinal", () => {
    expect(travaAOc("com_contrato_ativo")).toBe(false);
    expect(travaAOc("sem_contrato_ativo")).toBe(true);
    expect(travaAOc("sem_cnpj")).toBe(true);
  });
});

describe("erroDaVigencia", () => {
  it("fim antes do início e datas mal formadas", () => {
    expect(erroDaVigencia("2026-02-01", "2026-01-31")).toBe("O fim da vigência é antes do início.");
    expect(erroDaVigencia("2026-02-01", "2026-02-01")).toBeNull();
    expect(erroDaVigencia(null, null)).toBeNull();
    expect(erroDaVigencia("2026-2-1", null)).toBe("Data de início inválida.");
  });
});
