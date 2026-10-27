import { describe, expect, it } from "vitest";
import { completarCnpj, digitosDoCnpj } from "./cnpj";
import { completarCpf } from "./pagamento";
import {
  erroDoMapeamento, lerCsv, lerDataDaPlanilha, lerTipoDaPlanilha, preverImportacao, sugerirMapeamento, zerosDaPlanilha,
  type ColaboradorParaImportacao, type ContratoExistente, type Mapeamento,
} from "./importacao-contratos";

const CNPJ_A = completarCnpj("100000000001");
const CNPJ_B = completarCnpj("100000000002");
const CNPJ_C = completarCnpj("100000000003");
const CPF_ANA = completarCpf("100000001");
const CPF_BIA = completarCpf("100000002");

const colaboradores: ColaboradorParaImportacao[] = [
  { id: "c-ana", fullName: "Ana Teste", cpfs: [CPF_ANA] },
  { id: "c-bia", fullName: "Bia Exemplo", cpfs: [CPF_BIA] },
  { id: "c-joao1", fullName: "João Repetido", cpfs: [] },
  { id: "c-joao2", fullName: "JOAO REPETIDO", cpfs: [] },
];

const existente: ContratoExistente = {
  id: "k-b", cnpj: digitosDoCnpj(CNPJ_B), razaoSocial: "Empresa B Ltda", nomeFantasia: null, tipo: "empresa",
  vigenciaInicio: "2026-01-01", vigenciaFim: "2026-12-31", observacao: null, encerrado: false, colaboradorIds: ["c-ana"],
};

// Colunas: CNPJ | Razão | Início | Fim | CPF | Nome | Tipo
const MAP: Mapeamento = { cnpj: 0, razaoSocial: 1, vigenciaInicio: 2, vigenciaFim: 3, colaboradorCpf: 4, colaboradorNome: 5, tipo: 6 };

describe("leitura das células", () => {
  it("datas em vários formatos, inclusive série do Excel", () => {
    expect(lerDataDaPlanilha("2026-03-01")).toEqual({ data: "2026-03-01" });
    expect(lerDataDaPlanilha("01/03/2026")).toEqual({ data: "2026-03-01" });
    expect(lerDataDaPlanilha("1.3.26")).toEqual({ data: "2026-03-01" });
    expect(lerDataDaPlanilha("46082")).toEqual({ data: "2026-03-01" });
    expect(lerDataDaPlanilha("")).toEqual({ data: null });
    expect(lerDataDaPlanilha("31/02/2026")).toHaveProperty("erro");
    expect(lerDataDaPlanilha("amanhã")).toHaveProperty("erro");
  });
  it("tipo", () => {
    expect(lerTipoDaPlanilha("MEI")).toEqual({ tipo: "mei" });
    expect(lerTipoDaPlanilha("Empreiteira")).toEqual({ tipo: "empreiteira" });
    expect(lerTipoDaPlanilha("ltda")).toEqual({ tipo: "empresa" });
    expect(lerTipoDaPlanilha("")).toEqual({ tipo: null });
    expect(lerTipoDaPlanilha("cooperativa")).toHaveProperty("erro");
  });
});

describe("mapeamento", () => {
  it("palpite pelos títulos e validação", () => {
    const m = sugerirMapeamento(["CNPJ", "Razão Social", "Início da vigência", "Fim da vigência", "CPF do colaborador", "Nome", "Tipo"]);
    expect(m).toEqual(MAP);
    expect(erroDoMapeamento({}, 3)).toMatch(/CNPJ/);
    expect(erroDoMapeamento({ cnpj: 0, razaoSocial: 0 }, 3)).toMatch(/mesma coluna/);
    expect(erroDoMapeamento({ cnpj: 9 }, 3)).toMatch(/inválida/);
    expect(erroDoMapeamento(MAP, 7)).toBeNull();
  });
});

describe("preverImportacao", () => {
  it("classifica novo, atualiza, sem mudança e erros (CNPJ inválido, data ruim, CPF não achado)", () => {
    const p = preverImportacao([
      [CNPJ_A, "Empresa A", "01/01/2026", "31/12/2026", CPF_ANA, "", "MEI"], // novo
      [CNPJ_B, "Empresa B Ltda", "01/01/2026", "30/06/2027", "", "", ""], // atualiza (fim)
      ["11.111.111/1111-11", "X", "", "", "", "", ""], // CNPJ inválido
      [CNPJ_C, "Empresa C", "32/01/2026", "", "", "", ""], // data ruim
      [CNPJ_C, "Empresa C", "", "", completarCpf("123456780"), "", ""], // CPF não achado
    ], MAP, [existente], colaboradores);

    expect(p.linhas.map((l) => [l.linha, l.acao])).toEqual([[2, "novo"], [3, "atualiza"], [4, "erro"], [5, "erro"], [6, "erro"]]);
    expect(p.linhas[2].erros[0]).toMatch(/CNPJ inválido/);
    expect(p.linhas[3].erros.join(" ")).toMatch(/Data inválida/);
    expect(p.linhas[4].erros[0]).toMatch(/não achado/);
    expect(p.linhas[1].mudancas).toEqual(["Vigência: 01/01/2026 a 31/12/2026 → 01/01/2026 a 30/06/2027"]);
    expect(p.contagem).toMatchObject({ total: 5, novos: 1, atualizados: 1, erros: 3 });
    expect(p.operacoes).toHaveLength(2);
    expect(p.operacoes[0]).toMatchObject({ contratoId: null, dados: { razaoSocial: "Empresa A", tipo: "mei" }, novosColaboradores: ["c-ana"] });
  });

  it("célula vazia não apaga; nada mudou → sem mudança (e não vira operação)", () => {
    const p = preverImportacao([[CNPJ_B, "", "", "", CPF_ANA, "", ""]], MAP, [existente], colaboradores);
    expect(p.linhas[0].acao).toBe("sem_mudanca");
    expect(p.operacoes).toHaveLength(0);
  });

  it("várias linhas do mesmo CNPJ = um contrato com vários colaboradores; linha idêntica é 'repetida'", () => {
    const p = preverImportacao([
      [CNPJ_A, "Empreiteira A", "", "", CPF_ANA, "", "Empreiteira"],
      [CNPJ_A, "Empreiteira A", "", "", CPF_BIA, "", ""],
      [CNPJ_A, "Empreiteira A", "", "", CPF_BIA, "", ""],
    ], MAP, [], colaboradores);
    expect(p.linhas.map((l) => l.acao)).toEqual(["novo", "novo", "repetida"]);
    expect(p.operacoes).toHaveLength(1);
    expect(p.operacoes[0].novosColaboradores).toEqual(["c-ana", "c-bia"]);
    expect(p.contratos).toEqual({ novos: 1, atualizados: 0 });
  });

  it("mesmo CNPJ com dados diferentes → erro na linha que diverge (duplicado)", () => {
    const p = preverImportacao([
      [CNPJ_A, "Empresa A", "01/01/2026", "", "", "", ""],
      [CNPJ_A, "Outra Razão", "01/01/2026", "", "", "", ""],
    ], MAP, [], colaboradores);
    expect(p.linhas[1].acao).toBe("erro");
    expect(p.linhas[1].erros[0]).toMatch(/linha 2.*razão social/);
  });

  it("colaborador pelo nome: exato (sem acento/caixa); ambíguo e não achado são erro", () => {
    const p = preverImportacao([
      [CNPJ_A, "Empresa A", "", "", "", "ana teste", ""],
      [CNPJ_B, "", "", "", "", "Joao Repetido", ""],
      [CNPJ_C, "Empresa C", "", "", "", "Ninguém", ""],
    ], MAP, [existente], colaboradores);
    expect(p.linhas[0].colaborador).toEqual({ id: "c-ana", nome: "Ana Teste" });
    expect(p.linhas[1].erros[0]).toMatch(/Há 2 colaboradores/);
    expect(p.linhas[2].erros[0]).toMatch(/não achado/);
  });

  it("contrato novo sem razão social é erro; fim antes do início é erro", () => {
    const p = preverImportacao([
      [CNPJ_A, "", "", "", "", "", ""],
      [CNPJ_C, "Empresa C", "01/05/2026", "01/04/2026", "", "", ""],
    ], MAP, [], colaboradores);
    expect(p.linhas[0].erros).toContain("Razão social obrigatória para contrato novo.");
    expect(p.linhas[1].erros).toContain("O fim da vigência é antes do início.");
  });

  it("a assinatura muda quando o cadastro muda entre a prévia e a confirmação", () => {
    const linhas = [[CNPJ_B, "", "", "", CPF_BIA, "", ""]];
    const antes = preverImportacao(linhas, MAP, [existente], colaboradores);
    const depois = preverImportacao(linhas, MAP, [{ ...existente, colaboradorIds: ["c-ana", "c-bia"] }], colaboradores);
    expect(antes.operacoes).toHaveLength(1);
    expect(depois.operacoes).toHaveLength(0);
    expect(antes.assinatura).not.toBe(depois.assinatura);
    expect(preverImportacao(linhas, MAP, [existente], colaboradores).assinatura).toBe(antes.assinatura);
  });

  it("linhas totalmente vazias são ignoradas", () => {
    const p = preverImportacao([["", "", "", "", "", "", ""], [CNPJ_A, "Empresa A", "", "", "", "", ""]], MAP, [], colaboradores);
    expect(p.linhas).toHaveLength(1);
    expect(p.linhas[0].linha).toBe(3);
  });
});

describe("leitura do CSV e zeros que o Excel come", () => {
  it("detecta ';' do Excel brasileiro, aspas, CRLF e BOM — tudo como texto", () => {
    const csv = "\uFEFFCNPJ;Razão social;Obs\r\n01.234.567/0001-89;\"Empresa; com ponto e vírgula\";\"diz \"\"oi\"\"\"\r\n";
    expect(lerCsv(csv)).toEqual([["CNPJ", "Razão social", "Obs"], ["01.234.567/0001-89", "Empresa; com ponto e vírgula", "diz \"oi\""]]);
    expect(lerCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(lerCsv("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("CNPJ/CPF sem os zeros da frente voltam ao tamanho certo na prévia", () => {
    expect(zerosDaPlanilha("1234567000189", 14)).toBe("01234567000189");
    expect(zerosDaPlanilha("123", 14)).toBe("123");
    const cnpjComZero = completarCnpj("012345670001");
    const p = preverImportacao([[digitosDoCnpj(cnpjComZero).slice(1), "Empresa Zero", "", "", "", "", ""]], MAP, [], colaboradores);
    expect(p.linhas[0].acao).toBe("novo");
    expect(p.linhas[0].cnpj).toBe(cnpjComZero);
  });
});
