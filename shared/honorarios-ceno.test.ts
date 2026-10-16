import { describe, expect, it } from "vitest";
import {
  csvDoRelatorio, diasDoPeriodo, etapaDoHonorario, faltaLiberar, faltaParaEnviar, podeDecidirHonorario,
  podeDevolverHonorario, podeEditarHonorario, podeLiberarHonorario, podeRemoverHonorario, posicaoSugerida,
  rotuloDoMes, setorSugerido, situacaoDaVerba, somar, totalPorEvento, totalPorMes, totalPorPessoa,
  totalPorSetorEPosicao, vagaRecebeHonorario, validarAjuste, validarDadosDoPedido, validarLiberacao,
  validarMotivo, valorPorDiaria, type LinhaDoRelatorio,
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

  it("faltaParaEnviar diz o que falta, na ordem em que a pessoa preenche", () => {
    const base = { status: "rascunho", valorPedido: 50_000, diarias: 3, setor: "montagem", posicao: "freela_local" };
    expect(faltaParaEnviar(base)).toBeNull();
    expect(faltaParaEnviar({ ...base, valorPedido: 0 })).toMatch(/valor/);
    expect(faltaParaEnviar({ ...base, diarias: null })).toMatch(/diárias/);
    expect(faltaParaEnviar({ ...base, setor: null })).toMatch(/setor/);
    expect(faltaParaEnviar({ ...base, posicao: "casa" })).toMatch(/posição/);
    expect(faltaParaEnviar({ ...base, status: "aguardando" })).toMatch(/já foi enviado/);
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

  it("casa (funcionário) não recebe honorário; vaga sem colaborador só se for empreita", () => {
    expect(vagaRecebeHonorario({ collaboratorId: "c1", collaboratorType: "casa" })).toBe(false);
    expect(vagaRecebeHonorario({ collaboratorId: "c1", collaboratorType: "freela" })).toBe(true);
    expect(vagaRecebeHonorario({ collaboratorId: null, collaboratorType: null })).toBe(false);
    expect(vagaRecebeHonorario({ collaboratorId: null, empreitaEmpresa: "Cenotech" })).toBe(true);
  });

  it("setor pelo nome da função", () => {
    expect(setorSugerido("Sup Ceno")).toBe("sup_ceno");
    expect(setorSugerido("Cenotécnica Marcenaria")).toBe("marceneiro");
    expect(setorSugerido("Ceno Montagem")).toBe("montagem");
    expect(setorSugerido("Cenotécnica")).toBeNull();
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
