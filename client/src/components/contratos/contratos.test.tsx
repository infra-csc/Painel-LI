/**
 * Contratos (CNPJ) e pagamento — testes de tela (26/10).
 *  - lista: contagens, filtro por situação, busca, vazio, sem acesso;
 *  - importação em 3 passos: arquivo → colunas (palpite) → prévia (com erros)
 *    → confirmação → relatório; o que a tela manda ao servidor;
 *  - seção de pagamento: só o DP vê; sem chave → aviso e campos desabilitados;
 *    dados mascarados até "Mostrar".
 * O fetch é mockado por URL.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { mockarFetch, respostaJson, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import ContratosPage from "@/pages/contratos";
import { ImportacaoDialog } from "./importacao-dialog";
import { SecaoPagamento } from "./secao-pagamento";
import { AprovacaoPeloHistoricoDialog } from "./aprovacao-pelo-historico-dialog";
import type { Contrato, PreviaApi, RespostaDaAprovacao, RespostaDoPagamento } from "./api";

const rh = usuarioFake({ id: "u-rh", role: "financial", name: "Pessoa do DP" });
const producao = usuarioFake({ id: "u-prod", role: "production" });

function contrato(p: Partial<Contrato> = {}): Contrato {
  return {
    id: "k1", cnpj: "12345678000195", cnpjFormatado: "12.345.678/0001-95", razaoSocial: "Montagens Exemplo Ltda", nomeFantasia: null, tipo: "empresa",
    vigenciaInicio: "2026-01-01", vigenciaFim: "2027-12-31", observacao: null, anexoId: null, anexoNome: null, encerradoEm: null, encerradoPorNome: null,
    motivoEncerramento: null, origem: "cadastro", origemDetalhe: null, versao: 1, criadoPorNome: "Pessoa do DP", atualizadoPorNome: "Pessoa do DP", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
    situacao: "ativo", diasParaVencer: 400, colaboradores: [{ id: "c1", fullName: "ANA TESTE", collaboratorNumber: 7, type: "freela", active: true }],
    ...p,
  };
}

type Chamada = { url: string; metodo: string; corpo: unknown };
function roteador(rotas: Record<string, (c: Chamada) => Response>, chamadas: Chamada[] = []): RoteadorDeFetch {
  return (url, init) => {
    const corpo = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
    const c: Chamada = { url, metodo: init?.method ?? "GET", corpo };
    chamadas.push(c);
    const r = rotas[`${c.metodo} ${url.split("?")[0]}`];
    return r ? r(c) : respostaJson([]);
  };
}

describe("Contratos — lista", () => {
  const lista = [
    contrato(),
    contrato({ id: "k2", cnpj: "22345678000100", cnpjFormatado: "22.345.678/0001-00", razaoSocial: "Vence Logo ME", situacao: "vence_em_breve", diasParaVencer: 12, colaboradores: [] }),
    contrato({ id: "k3", cnpj: "32345678000100", cnpjFormatado: "32.345.678/0001-00", razaoSocial: "Já Venceu MEI", tipo: "mei", situacao: "vencido", diasParaVencer: -3, colaboradores: [] }),
  ];

  it("mostra contagens, filtra por situação e busca por colaborador", async () => {
    mockarFetch(roteador({
      "GET /api/contratos": () => respostaJson({ hoje: "2026-10-26", contratos: lista }),
      "GET /api/pagamento/alteracoes": () => respostaJson([]),
    }));
    const { user } = renderComTudo(<ContratosPage />, { user: rh, queryClient: criarQueryClientComApi(), rota: "/contratos" });
    expect(await screen.findByText("Montagens Exemplo Ltda")).toBeInTheDocument();
    const totais = screen.getByTestId("ctr-totais");
    expect(within(totais).getByText("Contratos ativos").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Vence em 12 dias")).toBeInTheDocument();

    await user.click(screen.getByTestId("ctr-filtro-vencido"));
    expect(screen.getByText("Já Venceu MEI")).toBeInTheDocument();
    expect(screen.queryByText("Montagens Exemplo Ltda")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("ctr-filtro-todas"));
    await user.type(screen.getByTestId("ctr-busca"), "ana teste");
    expect(screen.getByText("Montagens Exemplo Ltda")).toBeInTheDocument();
    expect(screen.queryByText("Vence Logo ME")).not.toBeInTheDocument();
  });

  it("sem contratos: vazio com as duas ações", async () => {
    mockarFetch(roteador({ "GET /api/contratos": () => respostaJson({ hoje: "2026-10-26", contratos: [] }) }));
    renderComTudo(<ContratosPage />, { user: rh, queryClient: criarQueryClientComApi(), rota: "/contratos" });
    const vazio = await screen.findByTestId("ctr-vazio");
    expect(within(vazio).getByRole("button", { name: /Importar planilha/ })).toBeInTheDocument();
    expect(within(vazio).getByRole("button", { name: /Novo contrato/ })).toBeInTheDocument();
  });

  it("quem não é DP vê o aviso e a tela nem consulta a API", async () => {
    const f = mockarFetch(roteador({}));
    renderComTudo(<ContratosPage />, { user: producao, queryClient: criarQueryClientComApi(), rota: "/contratos" });
    expect(await screen.findByTestId("ctr-sem-acesso")).toBeInTheDocument();
    expect(f.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/api/contratos") || u.includes("/api/pagamento"))).toEqual([]);
  });
});

describe("Fornecedor aprovado automaticamente (28/10)", () => {
  it("selo na lista e filtro por origem", async () => {
    const auto = contrato({ id: "k9", cnpj: "42345678000100", cnpjFormatado: "42.345.678/0001-00", razaoSocial: "Lucas Eventos ME", origem: "automatico",
      origemDetalhe: "Aprovado automaticamente: CNPJ já pago em NR São Luís em 12/10/2026 (OC registrada).", vigenciaFim: null, colaboradores: [] });
    mockarFetch(roteador({
      "GET /api/contratos": () => respostaJson({ hoje: "2026-10-28", contratos: [contrato(), auto] }),
      "GET /api/pagamento/alteracoes": () => respostaJson([]),
    }));
    const { user } = renderComTudo(<ContratosPage />, { user: rh, queryClient: criarQueryClientComApi(), rota: "/contratos" });
    expect(await screen.findByText("Lucas Eventos ME")).toBeInTheDocument();
    expect(screen.getAllByTestId("selo-aprovado-automaticamente")).toHaveLength(1);
    await user.selectOptions(screen.getByTestId("ctr-filtro-origem"), "automatico");
    expect(screen.getByText("Lucas Eventos ME")).toBeInTheDocument();
    expect(screen.queryByText("Montagens Exemplo Ltda")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("ctr-filtro-origem"), "cadastro");
    expect(screen.queryByText("Lucas Eventos ME")).not.toBeInTheDocument();
  });

  it("varredura: abre com a prévia (simular=1), aprova e mostra o resultado", async () => {
    const item = { cnpj: "42.345.678/0001-00", razaoSocial: "Lucas Eventos ME", contratoId: null, decisao: "criar" as const, descricao: "Cria o contrato (vigência aberta) e vincula Lucas.",
      frase: "Aprovado automaticamente: CNPJ já pago em NR São Luís em 12/10/2026 (OC registrada).", evento: "NR São Luís", data: "2026-10-12", gatilho: "OC registrada", colaboradores: [{ id: "c1", nome: "LUCAS" }] };
    const ignorado = { ...item, cnpj: "52.345.678/0001-00", razaoSocial: "Encerrada ME", contratoId: "k5", decisao: "ignorado" as const, descricao: "Contrato encerrado pelo DP — não é reaprovado automaticamente." };
    const previa: RespostaDaAprovacao = { simulado: true, resumo: { criar: 1, atualizar: 0, jaAprovados: 4, ignorados: 1, total: 6 }, itens: [item, ignorado], aprovados: 0 };
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "POST /api/contratos/aprovacao-automatica": (c) => respostaJson(c.url.includes("simular=1") ? previa : { ...previa, simulado: false, aprovados: 1 }),
    }, chamadas));
    const { user } = renderComTudo(<AprovacaoPeloHistoricoDialog aberto onClose={() => {}} />, { user: rh, queryClient: criarQueryClientComApi() });
    expect(await screen.findByText("Lucas Eventos ME")).toBeInTheDocument();
    expect(screen.getByText(/nada foi gravado ainda/)).toBeInTheDocument();
    expect(screen.getByText("Encerrada ME")).toBeInTheDocument();
    expect(chamadas.filter((c) => c.metodo === "POST").map((c) => c.url)).toEqual(["/api/contratos/aprovacao-automatica?simular=1"]);
    await user.click(screen.getByTestId("ctr-aprovacao-confirmar"));
    expect(await screen.findByTestId("ctr-aprovacao-feito")).toHaveTextContent("1 fornecedor aprovado");
    expect(chamadas.filter((c) => c.metodo === "POST").map((c) => c.url)).toEqual(["/api/contratos/aprovacao-automatica?simular=1", "/api/contratos/aprovacao-automatica"]);
  });
});

describe("Importação da planilha em 3 passos", () => {
  const previa: PreviaApi = {
    linhas: [
      { linha: 2, cnpj: "12.345.678/0001-95", razaoSocial: "Empresa Nova", colaborador: { id: "c1", nome: "Ana Teste" }, acao: "novo", erros: [], avisos: [], mudancas: [] },
      { linha: 3, cnpj: "11.222.333/0001-82", razaoSocial: "CNPJ Ruim", colaborador: null, acao: "erro", erros: ['CNPJ inválido: "11.222.333/0001-82".'], avisos: [], mudancas: [] },
    ],
    contagem: { total: 2, novos: 1, atualizados: 0, semMudanca: 0, erros: 1, repetidas: 0 },
    contratos: { novos: 1, atualizados: 0 },
    assinatura: "abc12345",
  };

  it("arquivo → colunas (palpite pelos títulos) → prévia com erro → confirma → relatório", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "POST /api/contratos/importacao/previa": () => respostaJson(previa),
      "POST /api/contratos/importacao/confirmar": () => respostaJson({ criados: 1, atualizados: 0, vinculos: 1, linhasComErro: 1, repetidas: 0, semMudanca: 0, erros: [{ linha: 3, cnpj: "11.222.333/0001-82", erros: ["CNPJ inválido."] }] }),
    }, chamadas));
    const { user } = renderComTudo(<ImportacaoDialog aberto onClose={() => {}} />, { user: rh, queryClient: criarQueryClientComApi() });

    // Passo 1: CSV do Excel brasileiro (";"), com o zero da frente preservado.
    const csv = "CNPJ;Razão social;Início da vigência;Fim da vigência;CPF do colaborador\n12.345.678/0001-95;Empresa Nova;01/01/2026;31/12/2026;000.000.001-91\n11.222.333/0001-82;CNPJ Ruim;;;\n";
    await user.upload(screen.getByTestId("ctr-importar-arquivo"), new File([csv], "contratos.csv", { type: "text/csv" }));

    // Passo 2: o palpite já ligou as colunas pelos títulos.
    expect(await screen.findByTestId("ctr-map-cnpj")).toHaveValue("0");
    expect(screen.getByTestId("ctr-map-razaoSocial")).toHaveValue("1");
    expect(screen.getByTestId("ctr-map-colaboradorCpf")).toHaveValue("4");
    expect(screen.getByTestId("ctr-map-nomeFantasia")).toHaveValue("");
    await user.click(screen.getByTestId("ctr-gerar-previa"));

    // Passo 3: abre no filtro de erros.
    expect(await screen.findByTestId("ctr-previa-linha-3")).toHaveTextContent("CNPJ inválido");
    expect(screen.queryByTestId("ctr-previa-linha-2")).not.toBeInTheDocument();
    const pedido = chamadas.find((c) => c.url.endsWith("/importacao/previa"))!.corpo as { linhas: string[][]; mapeamento: Record<string, number>; colunas: number };
    expect(pedido.colunas).toBe(5);
    expect(pedido.mapeamento).toMatchObject({ cnpj: 0, razaoSocial: 1, vigenciaInicio: 2, vigenciaFim: 3, colaboradorCpf: 4 });
    expect(pedido.linhas[0]).toEqual(["12.345.678/0001-95", "Empresa Nova", "01/01/2026", "31/12/2026", "000.000.001-91"]);
    // Nada gravado ainda.
    expect(chamadas.some((c) => c.url.endsWith("/importacao/confirmar"))).toBe(false);

    await user.click(screen.getByTestId("ctr-previa-filtro-todas"));
    expect(screen.getByTestId("ctr-previa-linha-2")).toHaveTextContent("Entra");
    await user.click(screen.getByTestId("ctr-confirmar-importacao"));

    const resultado = await screen.findByTestId("ctr-importacao-resultado");
    expect(resultado).toHaveTextContent("Contratos novos");
    expect(resultado).toHaveTextContent("Linha 3");
    expect((chamadas.find((c) => c.url.endsWith("/importacao/confirmar"))!.corpo as { assinatura: string }).assinatura).toBe("abc12345");
  });

  it("prévia desatualizada (409): avisa e oferece gerar de novo; nada importado", async () => {
    mockarFetch(roteador({
      "POST /api/contratos/importacao/previa": () => respostaJson({ ...previa, contagem: { ...previa.contagem, erros: 0 }, linhas: [previa.linhas[0]] }),
      "POST /api/contratos/importacao/confirmar": () => respostaJson({ message: "O cadastro mudou.", codigo: "previa_desatualizada" }, 409),
    }));
    const { user } = renderComTudo(<ImportacaoDialog aberto onClose={() => {}} />, { user: rh, queryClient: criarQueryClientComApi() });
    await user.upload(screen.getByTestId("ctr-importar-arquivo"), new File(["CNPJ;Razão social\n12.345.678/0001-95;Empresa Nova\n"], "c.csv", { type: "text/csv" }));
    await user.click(await screen.findByTestId("ctr-gerar-previa"));
    await user.click(await screen.findByTestId("ctr-confirmar-importacao"));
    expect(await screen.findByText(/mudou desde esta prévia/)).toBeInTheDocument();
    expect(screen.getByTestId("ctr-confirmar-importacao")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Gerar de novo/ })).toBeInTheDocument();
  });

  it("arquivo que não é planilha: erro no passo 1", async () => {
    mockarFetch(roteador({}));
    const { user } = renderComTudo(<ImportacaoDialog aberto onClose={() => {}} />, { user: rh, queryClient: criarQueryClientComApi(), userEvent: { applyAccept: false } });
    await user.upload(screen.getByTestId("ctr-importar-arquivo"), new File(["oi"], "foto.png", { type: "image/png" }));
    expect(await screen.findByText(/Use uma planilha .xlsx ou .csv/)).toBeInTheDocument();
  });
});

describe("Seção de pagamento no cadastro do colaborador", () => {
  const base: RespostaDoPagamento = {
    chaveConfigurada: true,
    pagamento: { banco: "341", agencia: "1234", conta: "7766554-3", tipoConta: "corrente", pixTipo: "email", pixChave: "pessoa@exemplo.com", titular: "Outra Pessoa", email: null, versao: 2, atualizadoPorNome: "Pessoa do DP", updatedAt: "2026-10-20T10:00:00Z" },
    ilegiveis: [],
    contratos: [{ id: "k1", cnpj: "12.345.678/0001-95", razaoSocial: "Montagens Exemplo Ltda", tipo: "empresa", vigenciaInicio: "2026-01-01", vigenciaFim: null, situacao: "ativo" }],
    situacaoContratual: "com_contrato_ativo",
    avisos: ["O titular da conta (Outra Pessoa) não bate com a razão social do CNPJ (Montagens Exemplo Ltda). Confira antes de pagar."],
    alteracoes: [],
  };

  it("outro papel: a seção não existe e nada é pedido ao servidor", () => {
    const f = mockarFetch(roteador({}));
    renderComTudo(<SecaoPagamento collaboratorId="c1" nome="Ana" />, { user: producao, queryClient: criarQueryClientComApi() });
    expect(screen.queryByTestId("secao-pagamento")).not.toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("DP: CNPJ com selo, dados mascarados até Mostrar, aviso do titular", async () => {
    mockarFetch(roteador({ "GET /api/colaboradores/c1/pagamento": () => respostaJson(base) }));
    const { user } = renderComTudo(<SecaoPagamento collaboratorId="c1" nome="Ana" />, { user: rh, queryClient: criarQueryClientComApi() });
    const secao = await screen.findByTestId("secao-pagamento");
    expect(await within(secao).findByText("Montagens Exemplo Ltda")).toBeInTheDocument();
    expect(within(secao).getByTestId("selo-contrato-com_contrato_ativo")).toBeInTheDocument();
    expect(secao).not.toHaveTextContent("7766554-3");
    expect(secao).toHaveTextContent("••••••4-3");
    expect(within(secao).getByTestId("pag-aviso")).toHaveTextContent("não bate com a razão social");
    await user.click(within(secao).getByTestId("pag-mostrar"));
    expect(secao).toHaveTextContent("7766554-3");
    expect(secao).toHaveTextContent("341 · Itaú Unibanco");
  });

  it("sem a chave no servidor: aviso claro e banco/conta/PIX desabilitados; e-mail continua", async () => {
    mockarFetch(roteador({
      "GET /api/colaboradores/c1/pagamento": () => respostaJson({ ...base, chaveConfigurada: false, pagamento: null, avisos: [], contratos: [], situacaoContratual: "sem_cnpj" }),
    }));
    const { user } = renderComTudo(<SecaoPagamento collaboratorId="c1" nome="Ana" />, { user: rh, queryClient: criarQueryClientComApi() });
    expect(await screen.findByTestId("pag-sem-chave")).toHaveTextContent("PAGAMENTO_CHAVE");
    expect(screen.getByTestId("selo-contrato-sem_cnpj")).toBeInTheDocument();
    await user.click(screen.getByTestId("pag-editar"));
    expect(screen.getByLabelText("Banco")).toBeDisabled();
    expect(screen.getByLabelText("Conta com dígito")).toBeDisabled();
    expect(screen.getByLabelText("Chave")).toBeDisabled();
    expect(screen.getByLabelText("E-mail")).toBeEnabled();
  });

  it("valida a chave PIX conforme o tipo antes de mandar", async () => {
    const chamadas: Chamada[] = [];
    mockarFetch(roteador({
      "GET /api/colaboradores/c1/pagamento": () => respostaJson({ ...base, pagamento: null, avisos: [] }),
      "PUT /api/colaboradores/c1/pagamento": () => respostaJson({ ok: true, versao: 1, mudouConta: true }),
    }, chamadas));
    const { user } = renderComTudo(<SecaoPagamento collaboratorId="c1" nome="Ana" />, { user: rh, queryClient: criarQueryClientComApi() });
    await user.click(await screen.findByTestId("pag-editar"));
    await user.selectOptions(screen.getByLabelText("Tipo da chave"), "cpf");
    await user.type(screen.getByLabelText("Chave"), "123.456.789-00");
    await user.click(screen.getByTestId("pag-salvar"));
    expect(await screen.findByText("CPF inválido para chave PIX.")).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === "PUT")).toBe(false);

    await user.selectOptions(screen.getByLabelText("Tipo da chave"), "email");
    await user.clear(screen.getByLabelText("Chave"));
    await user.type(screen.getByLabelText("Chave"), "pessoa@exemplo.com");
    await user.click(screen.getByTestId("pag-salvar"));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "PUT")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "PUT")!.corpo).toMatchObject({ versao: 0, pixTipo: "email", pixChave: "pessoa@exemplo.com" });
  });
});
