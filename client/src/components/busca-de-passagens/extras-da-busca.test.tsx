import { describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import type { ItinerarioDeVoo, RespostaDaBusca, RotaNaTela } from "@shared/busca-de-passagens";
import { PainelDeResultados, type AcoesDaRota } from "./painel-de-resultados";
import { AlertasDeGrupo, PrecosAcompanhados } from "./extras-da-busca";
import type { ListaDeAcompanhamentos } from "./use-busca-de-passagens";
import { JustificativaDoPrecoHost, pedirJustificativaDoPreco } from "@/components/tickets/justificativa-do-preco";
import { ItemDoAviso } from "@/components/avisos-de-alteracao/item-do-aviso";
import type { AvisoDeAlteracao } from "@/components/avisos-de-alteracao/use-avisos-de-alteracao";

const admin = usuarioFake({ id: "admin-1", role: "admin" });
const voo = (id: string, partidaVolta: string, despachada = 0): ItinerarioDeVoo => ({
  id, precoCentavos: 90000, moeda: "BRL", bagagem: { mao: 1, despachada },
  pernas: [{ companhia: "LA", duracaoMin: 200, segmentos: [{ companhia: "LA", numero: "3001", origem: "JPA", destino: "GRU", partida: `2026-11-16T${partidaVolta}`, chegada: "2026-11-16T21:00" }] }],
});
const rota = (extra: Partial<RotaNaTela> = {}): RotaNaTela => ({
  chave: "volta|JPA>GRU", perna: "volta", origem: "JPA", destino: "GRU", dataIda: "2026-11-16", dataVolta: null, maxParadas: 1,
  horarioIda: { partidaDe: 18 }, horarioVolta: null, vagas: [{ vagaId: "v1", perna: "volta" }], eventoIds: ["e1"], faixaIda: null,
  faixaVolta: { desde: 18 * 60, ate: null }, trechoDireto: false, alternativasDeCasa: ["CGH"], alternativasDoEvento: [], semHorario: false,
  vagasComMala: 0, diariaCentavos: null, variantes: null, consultasDoFlex: 2, erro: null, consultasDasAlternativas: 1, alternativas: null, malaCentavos: null,
  resultado: { itinerarios: [], observadoEm: null, consultadoEm: new Date().toISOString(), doCache: false },
  ...extra,
});
const resposta = (rotas: RotaNaTela[]): RespostaDaBusca => ({ rotas, faltando: [], gastou: 0, consumo: { usadas: 1, teto: 1000, fornecedor: { nome: "simulado", simulado: true }, cacheHoras: 3 } });
const acoes = (): AcoesDaRota => ({
  atualizar: vi.fn(), datasFlexiveis: vi.fn(), duasConexoes: vi.fn(), trocarSaida: vi.fn(), consultar: vi.fn(), usar: vi.fn(),
  semHorario: vi.fn(), testarAlternativas: vi.fn(), usarAlternativa: vi.fn(),
});
const vagas = new Map([["v1", { id: "v1", numero: 4045, nome: "Ana Souza", comprada: false, valorPagoCentavos: null }]]);

describe("\"Ver sem o horário sugerido\" (JPA→GRU sem voo depois das 18h)", () => {
  it("rota com janela que voltou vazia oferece a consulta sem o horário (1 consulta) e as 2 conexões", async () => {
    const a = acoes();
    const { user } = renderComTudo(<PainelDeResultados aberto onFechar={vi.fn()} resposta={resposta([rota()])} erro={null} buscando={false} chavesEmAndamento={new Set()} vagaPorId={vagas} acoes={a} onBuscarTudo={vi.fn()} previstas={0} />);
    const botao = await screen.findByTestId("sem-horario-volta|JPA>GRU");
    expect(botao).toHaveTextContent("Ver sem o horário sugerido");
    expect(botao).toHaveTextContent("1 consulta");
    await user.click(botao);
    expect(a.semHorario).toHaveBeenCalled();
    expect(screen.getByTestId("duas-conexoes-volta|JPA>GRU")).toBeInTheDocument();
  });

  it("consulta sem o horário: a opção fora da janela aparece MARCADA, com quanto está fora", async () => {
    const r = rota({ semHorario: true, horarioIda: null, resultado: { itinerarios: [voo("it-1", "17:45")], observadoEm: null, consultadoEm: new Date().toISOString(), doCache: false } });
    renderComTudo(<PainelDeResultados aberto onFechar={vi.fn()} resposta={resposta([r])} erro={null} buscando={false} chavesEmAndamento={new Set()} vagaPorId={vagas} acoes={acoes()} onBuscarTudo={vi.fn()} previstas={0} />);
    const opcao = await screen.findByTestId("opcao-it-1");
    expect(opcao).toHaveTextContent("Sai 17:45 — antes do sugerido 18h");
    expect(screen.getByTestId("aviso-sem-horario-volta|JPA>GRU")).toHaveTextContent("as opções fora dela estão marcadas");
    expect(screen.queryByTestId("sem-horario-volta|JPA>GRU")).not.toBeInTheDocument();
  });
});

describe("aeroportos alternativos e mala", () => {
  it("\"Testar CGH\" gasta 1; depois de testado, a troca não gasta e mostra a diferença", async () => {
    const a = acoes();
    const comResultado = rota({ resultado: { itinerarios: [voo("it-1", "19:00")], observadoEm: null, consultadoEm: new Date().toISOString(), doCache: false } });
    const { user, rerender } = renderComTudo(<PainelDeResultados aberto onFechar={vi.fn()} resposta={resposta([comResultado])} erro={null} buscando={false} chavesEmAndamento={new Set()} vagaPorId={vagas} acoes={a} onBuscarTudo={vi.fn()} previstas={0} />);
    const testar = await screen.findByTestId("alternativas-volta|JPA>GRU");
    expect(testar).toHaveTextContent("Testar CGH");
    expect(testar).toHaveTextContent("1 consulta");
    await user.click(testar);
    expect(a.testarAlternativas).toHaveBeenCalled();
    const barato = { ...voo("it-2", "19:00"), precoCentavos: 72000 };
    const testada = { ...comResultado, alternativas: [{ chave: "volta|JPA>CGH", lado: "casa" as const, iata: "CGH", rotulo: "Chegar em CGH", erro: null, resultado: { itinerarios: [barato], observadoEm: null, consultadoEm: new Date().toISOString(), doCache: false } }] };
    rerender(<PainelDeResultados aberto onFechar={vi.fn()} resposta={resposta([testada])} erro={null} buscando={false} chavesEmAndamento={new Set()} vagaPorId={vagas} acoes={a} onBuscarTudo={vi.fn()} previstas={0} />);
    const cgh = await screen.findByTestId("usar-alternativa-CGH");
    expect(cgh).toHaveTextContent("−20%");
    await user.click(cgh);
    expect(a.usarAlternativa).toHaveBeenCalledWith(expect.objectContaining({ chave: "volta|JPA>GRU" }), expect.objectContaining({ iata: "CGH" }));
  });

  it("quem despacha: chip da mala e \"+R$ 150 de mala\" no total quando a tarifa não inclui", async () => {
    const r = rota({ malaCentavos: 15000, vagasComMala: 1, faixaVolta: null, horarioIda: null, resultado: { itinerarios: [voo("it-1", "15:00"), voo("it-2", "16:00", 1)], observadoEm: null, consultadoEm: new Date().toISOString(), doCache: false } });
    renderComTudo(<PainelDeResultados aberto onFechar={vi.fn()} resposta={resposta([r])} erro={null} buscando={false} chavesEmAndamento={new Set()} vagaPorId={vagas} acoes={acoes()} onBuscarTudo={vi.fn()} previstas={0} />);
    expect(await screen.findByTestId("mala-volta|JPA>GRU")).toHaveTextContent("despacha mala · R$ 150 por perna");
    expect(screen.getByTestId("opcao-it-2")).toHaveTextContent("Inclui mala");
    expect(screen.getByTestId("opcao-it-1")).toHaveTextContent("+R$ 150 de mala");
  });
});

describe("alerta de grupo", () => {
  it("10+ pessoas no mesmo trecho e dia: pedir tarifa de grupo, com a lista e \"Selecionar\"", async () => {
    const onSelecionar = vi.fn();
    const pessoas = Array.from({ length: 11 }, (_, i) => ({ vagaId: `v${i}`, numero: 100 + i, nome: `PESSOA ${i}`, origem: "GRU", destino: "POA", data: "2026-11-14" }));
    const { user } = renderComTudo(<AlertasDeGrupo alertas={[{ chave: "GRU>POA|2026-11-14", origem: "GRU", destino: "POA", data: "2026-11-14", vagas: pessoas }]} onSelecionar={onSelecionar} />);
    const alerta = screen.getByTestId("alerta-grupo-GRU-POA-2026-11-14");
    expect(alerta).toHaveTextContent("11 pessoas voam GRU → POA em sáb 14/11");
    expect(alerta).toHaveTextContent("peça tarifa de grupo");
    await user.click(within(alerta).getByRole("button", { name: /Ver a lista/ }));
    expect(alerta).toHaveTextContent("#100Pessoa 0");
    await user.click(within(alerta).getByRole("button", { name: "Selecionar" }));
    expect(onSelecionar).toHaveBeenCalledWith(pessoas.map((p) => p.vagaId));
  });
});

describe("preços acompanhados", () => {
  const dados: ListaDeAcompanhamentos = {
    limite: 20, ativos: 1, hora: 7, quedaPct: 10,
    itens: [{
      id: "a1", teamInclusionId: "v1", inclusionNumber: 4045, eventId: "e1", eventName: "Makai", colaborador: "ANA SOUZA", funcao: "Kit",
      criadoPorNome: "Camila", criadoEm: "2026-10-01T10:00:00Z", ativo: true, rotas: ["GRU ⇄ JPA"], precoInicial: 112000, ultimoPreco: 98000,
      menorPreco: 98000, ultimaChecagemEm: new Date().toISOString(), tendencia: "baixar", aviso: "caiu", avisoTexto: "Caiu 13% (R$ 1.120 → R$ 980)",
      avisoEm: new Date().toISOString(), avisoNovo: true, paradoEm: null, motivoParada: null,
    }],
  };
  it("mostra quantos mudaram; aberto, o aviso e a variação; \"Marcar como visto\" e \"Parar\" chamam a API", async () => {
    const fetchMock = mockarFetch(() => respostaJson({ ok: true }));
    const { user } = renderComTudo(<PrecosAcompanhados dados={dados} aberto onAbrir={vi.fn()} admin onSelecionar={vi.fn()} />, { user: admin });
    const bloco = screen.getByTestId("precos-acompanhados");
    expect(bloco).toHaveTextContent("1 de 20 · checagem diária às 7h");
    expect(bloco).toHaveTextContent("1 mudou");
    expect(screen.getByTestId("acompanhamento-v1")).toHaveTextContent("Caiu 13% (R$ 1.120 → R$ 980)");
    expect(screen.getByTestId("acompanhamento-v1")).toHaveTextContent("−13%");
    await user.click(screen.getByTestId("avisos-vistos"));
    await user.click(screen.getByTestId("parar-acompanhamento-v1"));
    const urls = urlsChamadas(fetchMock);
    expect(urls).toContain("/api/busca-de-passagens/acompanhamentos/vistos");
    expect(urls).toContain("/api/busca-de-passagens/acompanhamentos/a1");
  });
});

describe("teto por trecho — a justificativa", () => {
  it("o diálogo mostra os números e só registra com o motivo escrito", async () => {
    const { user } = renderComTudo(<JustificativaDoPrecoHost />);
    let resposta: Promise<string | null> = Promise.resolve(null);
    act(() => { resposta = pedirJustificativaDoPreco({ rota: "CWB ⇄ FLN", valor: 150000, tipico: 100000, limite: 130000, pctAcimaDoTipico: 50, pctPermitido: 30, amostra: 3 }, ""); });
    const dialogo = await screen.findByTestId("dialogo-justificativa-preco");
    expect(dialogo).toHaveTextContent("50% acima");
    expect(dialogo).toHaveTextContent("Típico de CWB ⇄ FLN");
    expect(screen.getByTestId("confirmar-justificativa-preco")).toBeDisabled();
    await user.type(screen.getByTestId("campo-justificativa-preco"), "Único voo antes da montagem");
    await user.click(screen.getByTestId("confirmar-justificativa-preco"));
    await expect(resposta).resolves.toBe("Único voo antes da montagem");
  });

  it("sem o diálogo montado (lote), responde null na hora", async () => {
    await expect(pedirJustificativaDoPreco({ rota: "x", valor: 1, tipico: 1, limite: 1, pctAcimaDoTipico: 0, pctPermitido: 30, amostra: 3 }, "")).resolves.toBeNull();
  });
});

describe("remarcar pelo aviso", () => {
  it("\"Buscar nova data\" leva à Busca com a vaga e as datas novas", () => {
    const aviso = {
      id: "av1", teamInclusionId: "v1", eventId: "e1", changeRequestId: null, mudancas: [], afetaPassagem: true, afetaHospedagem: false,
      motivo: null, pedidoPorNome: null, comentarioDoAprovador: null, aprovadoPorNome: "Marcos", aprovadoEm: "2026-10-01T10:00:00Z",
      resolvidoEm: null, resolvidoPorNome: null, resolucao: null, inclusionNumber: 4045, eventName: "Makai", eventStartDate: "2026-11-14",
      functionName: "Kit", collaboratorName: "Ana",
    } as AvisoDeAlteracao;
    mockarFetch(() => respostaJson([]));
    renderComTudo(<ItemDoAviso aviso={aviso} linkDaBusca="/busca-de-passagens?vagas=v1&remarcar=1" />, { user: admin });
    expect(screen.getByTestId("aviso-buscar-av1")).toHaveAttribute("href", "/busca-de-passagens?vagas=v1&remarcar=1");
  });
});
