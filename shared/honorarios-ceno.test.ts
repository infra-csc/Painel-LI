import { describe, expect, it } from "vitest";
import {
  csvDoRelatorio, diasDoPeriodo, etapaDoHonorario, faltaLiberar, faltaParaEnviar, podeDecidirHonorario,
  podeDevolverHonorario, podeEditarHonorario, podeLiberarHonorario, podeRemoverHonorario, posicaoSugerida,
  rotuloDoMes, setorSugerido, situacaoDaVerba, somar, totalPorEvento, totalPorMes, totalPorPessoa,
  totalPorSetorEPosicao, vagaRecebeHonorario, validarAjuste, validarDadosDoPedido, validarLiberacao,
  validarMotivo, valorPorDiaria, avisoDaVaga, vagaSaiuDosHonorarios, type LinhaDoRelatorio, type VagaAtual,
  avisoDaVagaNaEmpreita, nomeDaVagaSemColaborador, posicaoDoTipo, posicaoPelaFuncao, rotuloDoValor, setorDaVaga,
  STATUS_DE_VAGA_ATIVA, CHAVE_DAS_VAGAS_SEM_NOME,
} from "./honorarios-ceno";

const linha = (o: Partial<LinhaDoRelatorio>): LinhaDoRelatorio => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  eventId: "ev1", eventName: "Night Run Curitiba", eventStartDate: "2026-10-24",
  tipo: "vaga", nome: "Pessoa A", setor: "montagem", posicao: "freela_local",
  status: "aprovado", diarias: 4, valorPedido: 100_000, valorAprovado: 100_000, liberado: 0,
  ...o,
});

describe("estados do pedido", () => {
  it("quem pediu edita só rascunho e devolvido; remove só rascunho nunca enviado", () => {
    expect(podeEditarHonorario("rascunho")).toBe(true);
    expect(podeEditarHonorario("devolvido")).toBe(true);
    for (const s of ["aguardando", "aprovado", "aprovado_ajuste"]) expect(podeEditarHonorario(s), s).toBe(false);
    expect(podeRemoverHonorario("rascunho", null)).toBe(true);
    expect(podeRemoverHonorario("rascunho", new Date())).toBe(false);
    expect(podeRemoverHonorario("devolvido", null)).toBe(false);
  });

  it("o aprovador decide só o que aguarda; devolve aguardando e aprovado SEM verba liberada", () => {
    expect(podeDecidirHonorario("aguardando")).toBe(true);
    expect(podeDecidirHonorario("aprovado")).toBe(false);
    expect(podeDevolverHonorario("aguardando", 0)).toBe(true);
    expect(podeDevolverHonorario("aprovado", 0)).toBe(true);
    expect(podeDevolverHonorario("aprovado_ajuste", 0)).toBe(true);
    expect(podeDevolverHonorario("aprovado", 1)).toBe(false);
    expect(podeDevolverHonorario("rascunho", 0)).toBe(false);
    expect(podeDevolverHonorario("devolvido", 0)).toBe(false);
  });

  it("o Financeiro libera só o aprovado", () => {
    expect(podeLiberarHonorario("aprovado")).toBe(true);
    expect(podeLiberarHonorario("aprovado_ajuste")).toBe(true);
    expect(podeLiberarHonorario("aguardando")).toBe(false);
  });

  it("faltaParaEnviar (20/10): a vaga pede o tipo (tabela ou outro valor) e um valor; a empreita, o valor fechado", () => {
    const base = { status: "rascunho", tipo: "vaga", tipoFreela: "local_a", valorPedido: 50_000 };
    expect(faltaParaEnviar(base)).toBeNull();
    expect(faltaParaEnviar({ ...base, tipoFreela: null })).toMatch(/tipo de freela/);
    expect(faltaParaEnviar({ ...base, tipoFreela: "outro", valorPedido: 0 })).toMatch(/valor negociado/);
    expect(faltaParaEnviar({ ...base, valorPedido: 0 })).toMatch(/tabela não tem valor/);
    expect(faltaParaEnviar({ ...base, status: "aguardando" })).toMatch(/já foi enviado/);
    expect(faltaParaEnviar({ status: "rascunho", tipo: "empreita", valorPedido: 0 })).toMatch(/valor fechado/);
    expect(faltaParaEnviar({ status: "devolvido", tipo: "empreita", valorPedido: 1 })).toBeNull();
  });
});

describe("situação da verba", () => {
  it("a liberar → parcial → liberada; sem aprovação antes disso", () => {
    expect(situacaoDaVerba("aguardando", null, 0)).toBe("sem_aprovacao");
    expect(situacaoDaVerba("aprovado", 100_000, 0)).toBe("a_liberar");
    expect(situacaoDaVerba("aprovado", 100_000, 40_000)).toBe("parcial");
    expect(situacaoDaVerba("aprovado_ajuste", 100_000, 100_000)).toBe("liberada");
    expect(faltaLiberar(100_000, 40_000)).toBe(60_000);
    expect(faltaLiberar(100_000, 120_000)).toBe(0);
    expect(faltaLiberar(null, 0)).toBe(0);
  });

  it("etapa única junta status e verba", () => {
    expect(etapaDoHonorario({ status: "rascunho", valorAprovado: null, liberado: 0 })).toBe("rascunho");
    expect(etapaDoHonorario({ status: "devolvido", valorAprovado: null, liberado: 0 })).toBe("devolvido");
    expect(etapaDoHonorario({ status: "aprovado", valorAprovado: 100, liberado: 0 })).toBe("a_liberar");
    expect(etapaDoHonorario({ status: "aprovado", valorAprovado: 100, liberado: 50 })).toBe("parcial");
    expect(etapaDoHonorario({ status: "aprovado_ajuste", valorAprovado: 100, liberado: 100 })).toBe("liberada");
  });
});

describe("cálculos", () => {
  it("valor por diária = valor ÷ diárias (como a coluna da planilha)", () => {
    expect(valorPorDiaria(100_000, 4)).toBe(25_000);
    expect(valorPorDiaria(100_000, 3)).toBe(33_333);
    expect(valorPorDiaria(100_000, 0)).toBeNull();
    expect(valorPorDiaria(null, 2)).toBeNull();
  });

  it("dias do período contam os dois extremos", () => {
    expect(diasDoPeriodo("2026-10-22", "2026-10-25")).toBe(4);
    expect(diasDoPeriodo("2026-10-22", "2026-10-22")).toBe(1);
    expect(diasDoPeriodo("2026-10-25", "2026-10-22")).toBeNull();
    expect(diasDoPeriodo("2026-02-30", "2026-03-01")).toBeNull();
  });
});

describe("sugestões a partir da vaga", () => {
  it("posição: empreita > modalidade da escalação > colaborador local > precisa de passagem", () => {
    expect(posicaoSugerida({ empreitaEmpresa: "Cenotech ME", collaboratorType: null })).toBe("empreita");
    expect(posicaoSugerida({ collaboratorType: "casa" })).toBeNull();
    expect(posicaoSugerida({ collaboratorType: "freela", cenoFreelaTipo: "viagem" })).toBe("freela_viagem");
    expect(posicaoSugerida({ collaboratorType: "freela", cenoFreelaTipo: "local_b" })).toBe("freela_local");
    expect(posicaoSugerida({ collaboratorType: "local", needsTicket: true })).toBe("freela_local");
    expect(posicaoSugerida({ collaboratorType: "freela", needsTicket: true })).toBe("freela_viagem");
    expect(posicaoSugerida({ collaboratorType: "freela", needsTicket: false })).toBe("freela_local");
  });

  it("casa (funcionário) não recebe honorário; vaga ABERTA recebe (20/10: \"não precisa escalar\")", () => {
    expect(vagaRecebeHonorario({ collaboratorId: "c1", collaboratorType: "casa" })).toBe(false);
    expect(vagaRecebeHonorario({ collaboratorId: "c1", collaboratorType: "freela" })).toBe(true);
    expect(vagaRecebeHonorario({ collaboratorId: null, collaboratorType: null })).toBe(true);
    expect(vagaRecebeHonorario({ collaboratorId: null, empreitaEmpresa: "Cenotech" })).toBe(true);
  });

  it("vaga aberta: posição pelo nome da função, se ele disser; senão quem pede escolhe", () => {
    expect(posicaoSugerida({ collaboratorId: null, functionName: "cenotecnica local" })).toBe("freela_local");
    expect(posicaoSugerida({ collaboratorId: null, functionName: "Cenotécnica Viagem" })).toBe("freela_viagem");
    expect(posicaoSugerida({ collaboratorId: null, functionName: "Cenotécnica", needsTicket: true })).toBeNull();
    expect(posicaoSugerida({ collaboratorId: null, functionName: "Cenotécnica local", cenoFreelaTipo: "viagem" })).toBe("freela_viagem");
    expect(posicaoPelaFuncao("Localização")).toBeNull();
    expect(nomeDaVagaSemColaborador(5063, "cenotecnica local")).toBe("Vaga #5063 sem nome · cenotecnica local");
  });

  it("setor pelo nome da função (a cenotécnica genérica fica em Montagem no pedido)", () => {
    expect(setorSugerido("Sup Ceno")).toBe("sup_ceno");
    expect(setorSugerido("Cenotécnica Marcenaria")).toBe("marceneiro");
    expect(setorSugerido("Ceno Montagem")).toBe("montagem");
    expect(setorSugerido("Cenotécnica")).toBeNull();
    expect(setorDaVaga("Cenotécnica")).toBe("montagem");
    expect(setorDaVaga("Sup Ceno")).toBe("sup_ceno");
  });

  it("tipo de freela → posição e o rótulo que o aprovador e o Financeiro leem", () => {
    expect(posicaoDoTipo("viagem")).toBe("freela_viagem");
    expect(posicaoDoTipo("sp")).toBe("freela_local");
    expect(posicaoDoTipo("local_b")).toBe("freela_local");
    expect(posicaoDoTipo("outro")).toBeNull();
    expect(rotuloDoValor({ tipo: "vaga", tipoFreela: "local_a" })).toBe("Freela Local (A) · tabela");
    expect(rotuloDoValor({ tipo: "vaga", tipoFreela: "outro", observacao: "Montagem noturna" })).toBe("Outro valor · Montagem noturna");
    expect(rotuloDoValor({ tipo: "vaga", tipoFreela: "outro" })).toBe("Outro valor");
    expect(rotuloDoValor({ tipo: "vaga", tipoFreela: null, setor: "montagem", posicao: "freela_local" })).toBe("Montagem · Freela local");
    expect(rotuloDoValor({ tipo: "empreita", vagasDaEmpreita: [1, 2] })).toBe("Valor fechado da equipe · 2 vagas da escala");
  });

  it("vaga ativa: escaladas e abertas; cancelada e sugestão fora", () => {
    expect(STATUS_DE_VAGA_ATIVA).toEqual(expect.arrayContaining(["escalado", "planejado", "escalacao", "reaberto", "aguardando_producao"]));
    expect(STATUS_DE_VAGA_ATIVA).not.toContain("cancelado");
    expect(STATUS_DE_VAGA_ATIVA).not.toContain("sugestao_pendente");
  });
});

describe("validação", () => {
  it("empreita exige responsável; pessoas, diárias e datas dentro do limite", () => {
    expect(validarDadosDoPedido({ tipo: "empreita", nome: "" })).toMatch(/responsável/);
    expect(validarDadosDoPedido({ tipo: "empreita", nome: "Equipe Horizonte", pessoas: 3, diarias: 4, valorPedido: 400_000 })).toBeNull();
    expect(validarDadosDoPedido({ tipo: "empreita", nome: "Equipe", pessoas: 0 })).toMatch(/pessoas/);
    expect(validarDadosDoPedido({ tipo: "vaga", diarias: 0 })).toMatch(/Diárias/);
    expect(validarDadosDoPedido({ tipo: "vaga", inicio: "2026-10-25", fim: "2026-10-22" })).toMatch(/antes do início/);
    expect(validarDadosDoPedido({ tipo: "vaga", setor: "carpintaria" })).toMatch(/Setor/);
    expect(validarDadosDoPedido({ tipo: "vaga", valorPedido: -1 })).toMatch(/Valor/);
  });

  it("ajuste: valor novo, diferente do pedido, com motivo", () => {
    expect(validarAjuste(100_000, 80_000, "Negociado com a produção")).toBeNull();
    expect(validarAjuste(100_000, 100_000, "x x x")).toMatch(/igual/);
    expect(validarAjuste(100_000, 0, "motivo")).toMatch(/valor aprovado/);
    expect(validarAjuste(100_000, 80_000, " ")).toMatch(/motivo/);
  });

  it("motivo da devolução é obrigatório", () => {
    expect(validarMotivo("  ")).not.toBeNull();
    expect(validarMotivo("Rever o valor da diária")).toBeNull();
  });

  it("liberação: data, OC/DP e valor até o que falta", () => {
    expect(validarLiberacao({ data: "2026-10-30", oc: "45123", valor: 60_000 }, 100_000)).toBeNull();
    expect(validarLiberacao({ data: "2026-10-30", oc: "45123", valor: 120_000 }, 100_000)).toMatch(/passa/);
    expect(validarLiberacao({ data: "", oc: "45123", valor: 1 }, 100)).toMatch(/data/);
    expect(validarLiberacao({ data: "2026-10-30", oc: " ", valor: 1 }, 100)).toMatch(/OC/);
    expect(validarLiberacao({ data: "2026-10-30", oc: "1", valor: 1 }, 0)).toMatch(/todo liberado/);
  });
});

describe("relatórios", () => {
  const linhas: LinhaDoRelatorio[] = [
    linha({ id: "a", status: "aprovado", valorPedido: 100_000, valorAprovado: 100_000, liberado: 40_000 }),
    linha({ id: "b", status: "aprovado_ajuste", valorPedido: 120_000, valorAprovado: 90_000, liberado: 90_000, nome: "Pessoa B", setor: "sup_ceno", posicao: "freela_viagem" }),
    linha({ id: "c", status: "aguardando", valorPedido: 50_000, valorAprovado: null, nome: "Pessoa C" }),
    linha({ id: "d", status: "devolvido", valorPedido: 70_000, valorAprovado: null, nome: "Pessoa D" }),
    linha({ id: "e", status: "rascunho", valorPedido: 999_999, valorAprovado: null }),
    linha({ id: "f", eventId: "ev2", eventName: "Maratona do Rio", eventStartDate: "2026-09-13", tipo: "empreita", nome: "Equipe Horizonte", setor: "montagem", posicao: "empreita", status: "aprovado", valorPedido: 400_000, valorAprovado: 400_000, liberado: 0 }),
    linha({ id: "g", eventId: "ev2", eventName: "Maratona do Rio", eventStartDate: "2026-09-13", nome: "pessoa a", status: "aprovado", valorPedido: 30_000, valorAprovado: 30_000, liberado: 0 }),
  ];

  it("somar: rascunho fora; devolvido só contado; pedido = enviados", () => {
    const t = somar(linhas.filter((l) => l.eventId === "ev1"));
    expect(t.linhas).toBe(3);
    expect(t.pedido).toBe(270_000);
    expect(t.aguardando).toBe(50_000);
    expect(t.aprovado).toBe(190_000);
    expect(t.liberado).toBe(130_000);
    expect(t.aLiberar).toBe(60_000);
    expect(t.emNegociacao).toBe(1);
  });

  it("total por evento: mais recente primeiro", () => {
    const r = totalPorEvento(linhas);
    expect(r.map((g) => g.rotulo)).toEqual(["Night Run Curitiba", "Maratona do Rio"]);
    expect(r[0].detalhe).toBe("24/10/2026");
    expect(r[1]).toMatchObject({ pedido: 430_000, aprovado: 430_000, liberado: 0, aLiberar: 430_000 });
  });

  it("por mês com contagem de eventos", () => {
    const r = totalPorMes(linhas);
    expect(r.map((g) => g.rotulo)).toEqual(["outubro de 2026", "setembro de 2026"]);
    expect(r[1].detalhe).toBe("1 evento");
    expect(rotuloDoMes("2026-03")).toBe("março de 2026");
  });

  it("por pessoa junta o mesmo nome em eventos diferentes e separa empreita", () => {
    const r = totalPorPessoa(linhas);
    const a = r.find((g) => g.chave === "pessoa|pessoa a")!;
    expect(a.aprovado).toBe(130_000);
    expect(a.detalhe).toBe("Pessoa · 2 eventos");
    expect(r[0].rotulo).toBe("Equipe Horizonte");
    expect(r[0].detalhe).toBe("Empreita · 1 evento");
  });

  it("por pessoa: as vagas ainda sem colaborador somam numa linha \"Vagas sem nome\", no fim", () => {
    const comSemNome = [
      ...linhas,
      linha({ nome: "Vaga #5063 sem nome · Cenotécnica", status: "aprovado", valorPedido: 500_000, valorAprovado: 500_000, semColaborador: true }),
      linha({ nome: "Vaga #5064 sem nome · Cenotécnica", eventId: "ev9", status: "aguardando", valorPedido: 10_000, semColaborador: true }),
    ];
    const r = totalPorPessoa(comSemNome);
    const ultima = r[r.length - 1];
    expect(ultima).toMatchObject({ chave: CHAVE_DAS_VAGAS_SEM_NOME, rotulo: "Vagas sem nome", aprovado: 500_000, pedido: 510_000 });
    expect(ultima.detalhe).toBe("Ainda sem colaborador · 2 vagas · 2 eventos");
    expect(r.filter((g) => g.rotulo.startsWith("Vaga #"))).toHaveLength(0);
  });

  it("por setor e posição", () => {
    const r = totalPorSetorEPosicao(linhas);
    const sup = r.find((g) => g.rotulo === "Sup Ceno")!;
    expect(sup.detalhe).toBe("Freela viagem");
    expect(sup.aprovado).toBe(90_000);
  });

  it("CSV com linha de total e valores em reais com vírgula", () => {
    const { cabecalho, linhas: l } = csvDoRelatorio("evento", totalPorEvento(linhas));
    expect(cabecalho[0]).toBe("Evento");
    expect(l[0][3]).toBe("2700,00");
    expect(l[l.length - 1][0]).toBe("Total");
    expect(l[l.length - 1][3]).toBe("7000,00");
  });
});

describe("a vaga mudou depois do pedido", () => {
  const ESCALADOS = ["escalado", "passagem_comprada"];
  const h = { tipo: "vaga", functionId: "f1", collaboratorId: "c1" };
  const v = (o: Partial<VagaAtual> = {}): VagaAtual => ({
    deletedAt: null, status: "escalado", phase: "escalacao", functionId: "f1", collaboratorId: "c1", collaboratorType: "freela", empreitaEmpresa: null, ...o,
  });
  it("cada mudança da escala vira um aviso; empreita nunca tem", () => {
    expect(avisoDaVaga(h, v(), ESCALADOS)).toBeNull();
    expect(avisoDaVaga(h, null, ESCALADOS)).toBe("excluida");
    expect(avisoDaVaga(h, v({ deletedAt: new Date() }), ESCALADOS)).toBe("excluida");
    expect(avisoDaVaga(h, v({ status: "cancelado" }), ESCALADOS)).toBe("fora_da_escala");
    expect(avisoDaVaga(h, v({ phase: "sugestao" }), ESCALADOS)).toBe("fora_da_escala");
    expect(avisoDaVaga(h, v({ functionId: "f2" }), ESCALADOS)).toBe("outra_funcao");
    expect(avisoDaVaga(h, v({ collaboratorId: "c2", collaboratorType: "casa" }), ESCALADOS)).toBe("casa");
    expect(avisoDaVaga(h, v({ collaboratorId: "c2" }), ESCALADOS)).toBe("colaborador_trocado");
    expect(avisoDaVaga({ ...h, tipo: "empreita" }, null, ESCALADOS)).toBeNull();
  });
  it("pedido da vaga ABERTA: ganhar um freela não é troca; ganhar um da casa para; X → ninguém é troca", () => {
    const aberta = { ...h, collaboratorId: null };
    expect(avisoDaVaga(aberta, v({ collaboratorId: null, collaboratorType: null }), ESCALADOS)).toBeNull();
    expect(avisoDaVaga(aberta, v({ collaboratorId: "c9" }), ESCALADOS)).toBeNull();
    expect(avisoDaVaga(aberta, v({ collaboratorId: "c9", collaboratorType: "casa" }), ESCALADOS)).toBe("casa");
    expect(avisoDaVaga(h, v({ collaboratorId: null, collaboratorType: null }), ESCALADOS)).toBe("colaborador_trocado");
  });
  it("vaga dentro da empreita: só importa estar ativa, na cenotécnica e não ser da casa", () => {
    expect(avisoDaVagaNaEmpreita(v({ collaboratorId: "c7" }), ESCALADOS, true)).toBeNull();
    expect(avisoDaVagaNaEmpreita(v({ status: "cancelado" }), ESCALADOS, true)).toBe("fora_da_escala");
    expect(avisoDaVagaNaEmpreita(v(), ESCALADOS, false)).toBe("outra_funcao");
    expect(avisoDaVagaNaEmpreita(v({ collaboratorType: "casa" }), ESCALADOS, true)).toBe("casa");
    expect(avisoDaVagaNaEmpreita(null, ESCALADOS, true)).toBe("excluida");
  });
  it("só a troca de colaborador deixa o pedido seguir (depois de confirmar)", () => {
    expect(vagaSaiuDosHonorarios("colaborador_trocado")).toBe(false);
    expect(vagaSaiuDosHonorarios("fora_da_escala")).toBe(true);
    expect(vagaSaiuDosHonorarios(null)).toBe(false);
  });
  it("valor por diária: 0 diárias não divide; centavos arredondam", () => {
    expect(valorPorDiaria(100_000, 0)).toBeNull();
    expect(valorPorDiaria(100_000, 3)).toBe(33_333);
    expect(valorPorDiaria(100_001, 2)).toBe(50_001);
  });
});
