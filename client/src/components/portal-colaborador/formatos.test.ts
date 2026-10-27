import { describe, expect, it } from "vitest";
import {
  acaoDeHoje, codigoDeSeisDigitos, dataEHora, diasSugeridos, linhaDaMemoria, mascararCpf, periodo, regrasDaSenha, situacaoDaPrestacao,
} from "./formatos";
import { medidasReduzidas } from "./captura";
import type { DiaDoPortal, PrestacaoDoPortal } from "./tipos";

const dia = (d: string, extra: Partial<DiaDoPortal> = {}): DiaDoPortal => ({
  dia: d, estado: "futuro", entrada: null, saida: null, podeEntrar: false, podeSair: false, ...extra,
});
const marcacao = (hora: string) => ({ em: `2026-10-27T${hora}:00Z`, hora, comSelfie: true, fotoId: null, porRepresentante: false, comLocalizacao: true });

function prestacao(id: string, dias: DiaDoPortal[], extra: Partial<PrestacaoDoPortal> = {}): PrestacaoDoPortal {
  return {
    id, evento: { id: `ev-${id}`, nome: `Evento ${id}`, cidade: "Florianópolis", inicio: dias[0]?.dia ?? "2026-10-25", fim: dias[dias.length - 1]?.dia ?? "2026-10-28" },
    funcao: "Produtor", dias, ocorrencias: [], diasExtras: [], confirmacao: null, podeConfirmar: false, motivoNaoPodeConfirmar: "A confirmação abre depois do último dia de trabalho.",
    checkoutFinalFeito: false, valoresOcultos: true, valores: null, ...extra,
  };
}

describe("máscaras", () => {
  it("CPF progressivo e só com 11 números", () => {
    expect(mascararCpf("123")).toBe("123");
    expect(mascararCpf("1234")).toBe("123.4");
    expect(mascararCpf("1234567")).toBe("123.456.7");
    expect(mascararCpf("12345678901999")).toBe("123.456.789-01");
    expect(mascararCpf("123.456.789-01")).toBe("123.456.789-01");
  });

  it("código: colar o texto inteiro fica com os 6 números", () => {
    expect(codigoDeSeisDigitos("Seu código: 123 456")).toBe("123456");
    expect(codigoDeSeisDigitos("123-456-789")).toBe("123456");
  });

  it("regra da senha: 8 caracteres e letras com números", () => {
    expect(regrasDaSenha("abc").map((r) => r.ok)).toEqual([false, false]);
    expect(regrasDaSenha("abcdefgh").map((r) => r.ok)).toEqual([true, false]);
    expect(regrasDaSenha("abcdefg1").map((r) => r.ok)).toEqual([true, true]);
  });
});

describe("datas", () => {
  it("período no mesmo mês, em meses diferentes e num dia só", () => {
    expect(periodo("2026-10-25", "2026-10-29")).toBe("25 a 29 de out");
    expect(periodo("2026-10-30", "2026-11-02")).toBe("30 de out a 2 de nov");
    expect(periodo("2026-10-27", "2026-10-27")).toBe("27 de out");
  });

  it("data e hora em horário de Brasília", () => {
    expect(dataEHora("2026-10-26T20:20:00.000Z")).toBe("26/10 às 17:20");
  });
});

describe("acaoDeHoje", () => {
  const hoje = "2026-10-27";

  it("check-in de hoje vem antes de check-out e de confirmação", () => {
    const confirmar = prestacao("a", [dia("2026-10-20", { estado: "concluido" })], { podeConfirmar: true });
    const sair = prestacao("b", [dia(hoje, { estado: "em_andamento", entrada: marcacao("07:50"), podeSair: true })]);
    const entrar = prestacao("c", [dia(hoje, { estado: "hoje_sem_checkin", podeEntrar: true })]);
    expect(acaoDeHoje([confirmar, sair, entrar], hoje)).toMatchObject({ tipo: "entrada", prestacao: { id: "c" } });
    expect(acaoDeHoje([confirmar, sair], hoje)).toMatchObject({ tipo: "saida", prestacao: { id: "b" } });
    expect(acaoDeHoje([confirmar], hoje)).toMatchObject({ tipo: "confirmar", prestacao: { id: "a" } });
  });

  it("confirmação já feita não volta para o destaque", () => {
    const feita = prestacao("a", [dia("2026-10-20", { estado: "concluido" })], {
      podeConfirmar: true, confirmacao: { dias: ["2026-10-20"], cnpj: null, razaoSocial: null, contestacao: null, confirmadoEm: "2026-10-21T10:00:00Z", valorVisto: null },
    });
    expect(acaoDeHoje([feita], hoje)).toBeNull();
  });

  it("situação do cartão", () => {
    expect(situacaoDaPrestacao(prestacao("x", [dia("2026-11-10")]), hoje).texto).toBe("Começa em 10/11");
    expect(situacaoDaPrestacao(prestacao("x", [dia(hoje, { podeEntrar: true })]), hoje)).toMatchObject({ texto: "Hoje · falta o check-in", tom: "acao" });
    expect(situacaoDaPrestacao(prestacao("x", [dia("2026-10-20")], { checkoutFinalFeito: true }), hoje).texto).toBe("Fechado pelo produtor");
    expect(situacaoDaPrestacao(prestacao("x", [dia("2026-10-25", { entrada: marcacao("08:00") }), dia("2026-10-26"), dia(hoje)]), hoje).texto).toBe("1 de 3 dias registrados");
  });
});

describe("confirmação", () => {
  it("sugere os dias com presença e as diárias extras; falta e sem registro ficam de fora", () => {
    const p = prestacao("a", [
      dia("2026-10-24", { estado: "concluido" }), dia("2026-10-25", { estado: "falta" }),
      dia("2026-10-26", { estado: "sem_checkout" }), dia("2026-10-27", { estado: "ausente" }),
    ], { diasExtras: ["2026-10-28"] });
    expect(diasSugeridos(p)).toEqual(["2026-10-24", "2026-10-26", "2026-10-28"]);
  });

  it("refazer: parte do que ele confirmou antes", () => {
    const p = prestacao("a", [dia("2026-10-24", { estado: "concluido" })], {
      confirmacao: { dias: ["2026-10-24", "2026-10-23"], cnpj: null, razaoSocial: null, contestacao: null, confirmadoEm: "2026-10-25T10:00:00Z", valorVisto: null },
    });
    expect(diasSugeridos(p)).toEqual(["2026-10-23", "2026-10-24"]);
  });

  it("memória de cálculo sem o jargão interno", () => {
    expect(linhaDaMemoria("Realizado: 4 diárias de R$ 240,00 = R$ 1.300,00.")).toBe("Previsto: 4 diárias de R$ 240,00 = R$ 1.300,00.");
    expect(linhaDaMemoria("Sem ocorrências: o valor é o do Realizado.")).toBe("Sem ocorrências: o valor é o previsto.");
  });
});

describe("redução da foto", () => {
  it("lado maior vira 1280 mantendo a proporção; foto pequena não cresce", () => {
    expect(medidasReduzidas(3024, 4032)).toEqual({ largura: 960, altura: 1280 });
    expect(medidasReduzidas(4000, 3000)).toEqual({ largura: 1280, altura: 960 });
    expect(medidasReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});
