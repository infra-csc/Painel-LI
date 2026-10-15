import { describe, expect, it } from "vitest";
import type { ConsultaDoHistorico, PassagemDaBusca } from "./analise-da-busca";
import { orcamentoPorEvento, preverEscalacoes, type VagaParaPrevisao } from "./previsao-da-busca";

const HOJE = "2026-10-09";
let seq = 0;
const consulta = (x: Partial<ConsultaDoHistorico> & { preco: number }): ConsultaDoHistorico => {
  const { preco, ...resto } = x;
  const dia = resto.dia ?? "2026-09-01";
  return {
    id: `c${++seq}`, consultadoEm: `${dia}T12:00:00Z`, dia, usuarioId: "u1", perna: "ida_e_volta", origem: "GRU", destino: "JPA",
    dataIda: "2026-09-20", dataVolta: "2026-09-24", deslocada: false, antecedenciaDias: 20, menorPrecoCentavos: preco,
    menorPorCia: null, eventoIds: [], vagaIds: [], ...resto,
  };
};

/** GRU⇄JPA com histórico: <7 dias = 1,40 · 7–14 = 1,15 · 15–30 = 1,00 · 31–60 = 0,85 (×R$ 1.000). */
function historico(): ConsultaDoHistorico[] {
  const out: ConsultaDoHistorico[] = [];
  for (const [ant, f] of [[3, 1.4], [10, 1.15], [20, 1], [45, 0.85]] as const) {
    for (let i = 0; i < 3; i++) out.push(consulta({ antecedenciaDias: ant, preco: Math.round(100000 * f), dataIda: `2026-08-${String(10 + i).padStart(2, "0")}` }));
  }
  return out;
}

const vaga = (id: string, dataIda: string, extra: Partial<VagaParaPrevisao> = {}): VagaParaPrevisao => ({
  vagaId: id, numero: Number(id.replace(/\D/g, "")) || 1, colaborador: "Ana Souza", funcao: "Montagem", eventId: "e1", eventName: "Makai", eventStart: dataIda,
  rotas: [{ perna: "ida_e_volta", origem: "GRU", destino: "JPA", dataIda, dataVolta: "2026-12-30", chave: `ida_e_volta|GRU>JPA|${dataIda}|2026-12-30|p1|-|-` }],
  falta: null, ...extra,
});

describe("previsão por escalação — estimativa, nunca certeza", () => {
  it("faltam 9 dias e a rota sobe abaixo de 7 → \"Compre agora — tende a subir\", com o porquê", () => {
    const { linhas } = preverEscalacoes([vaga("v1", "2026-10-18")], { consultas: historico(), hoje: HOJE });
    const l = linhas[0];
    expect(l.tendencia).toBe("subir");
    expect(l.titulo).toBe("Compre agora — tende a subir");
    expect(l.diasParaVoo).toBe(9);
    expect(l.sinais[0].texto).toBe("faltam 9 dias; nesta rota o preço sobe ~22% com menos de 7 dias");
    expect(l.amostraTexto).toBe("12 consultas desta rota");
  });

  it("preço atual bem acima do típico, voo longe → \"Pode esperar — tende a baixar\"", () => {
    const h = [...historico(), consulta({ dia: "2026-10-08", antecedenciaDias: 40, preco: 120000, dataIda: "2026-11-17", dataVolta: "2026-12-30" })];
    const { linhas } = preverEscalacoes([vaga("v2", "2026-11-17")], { consultas: h, hoje: HOJE });
    expect(linhas[0]).toMatchObject({ tendencia: "baixar", acao: "pode_esperar", precoAtual: { preco: 120000, dia: "2026-10-08" } });
    expect(linhas[0].sinais.some((s) => /acima do típico — costuma cair/.test(s.texto))).toBe(true);
  });

  it("evolução da mesma rota/data entra como sinal", () => {
    const h = [
      ...historico(),
      consulta({ dia: "2026-10-01", antecedenciaDias: 25, preco: 90000, dataIda: "2026-10-26", dataVolta: "2026-12-30" }),
      consulta({ dia: "2026-10-07", antecedenciaDias: 19, preco: 99000, dataIda: "2026-10-26", dataVolta: "2026-12-30" }),
    ];
    const { linhas } = preverEscalacoes([vaga("v3", "2026-10-26")], { consultas: h, hoje: HOJE });
    expect(linhas[0].sinais.map((s) => s.texto)).toContain("subiu 10% desde 01/10");
  });

  it("rota sem histórico e sem curva geral → \"Sem dado suficiente\"; ordem: urgentes primeiro", () => {
    const longe = vaga("v9", "2026-12-01", { rotas: [{ perna: "ida", origem: "CWB", destino: "MAO", dataIda: "2026-12-01", dataVolta: null, chave: "x" }] });
    const semRota = vaga("v8", "2026-12-01", { rotas: [], falta: "Aeroporto do evento não confirmado" });
    const { linhas, resumo } = preverEscalacoes([longe, semRota, vaga("v1", "2026-10-18")], { consultas: historico(), hoje: HOJE });
    expect(linhas.map((l) => l.vagaId)).toEqual(["v1", "v9", "v8"]);
    expect(linhas[1]).toMatchObject({ tendencia: "sem_dado", titulo: "Sem dado suficiente", confianca: null });
    expect(linhas[2].amostraTexto).toBe("Aeroporto do evento não confirmado");
    expect(resumo).toMatchObject({ total: 3, subir: 1, semDado: 2, subirEmBreve: 1 });
  });
});

describe("orçamento — quanto falta gastar por evento", () => {
  it("última consulta, senão típico, senão média paga; sem base fica sem estimativa", () => {
    const h = [
      consulta({ dia: "2026-10-05", preco: 88000, dataIda: "2026-11-10", dataVolta: "2026-11-14" }),
      consulta({ preco: 100000 }), consulta({ preco: 110000 }),
      consulta({ perna: "ida", origem: "GRU", destino: "POA", dataVolta: null, preco: 40000 }),
    ];
    const passagens: PassagemDaBusca[] = [1, 2, 3].map((i) => ({
      ticketId: `t${i}`, eventId: "e1", eventName: "Makai", eventStart: "2026-11-11", valor: 50000 * i, bagagem: i === 1 ? 10000 : null,
      dataCompra: "2026-10-01", dataIda: "2026-11-10", dataVolta: "2026-11-14", horaDaVolta: null, companhia: "GOL", origem: "GRU", destino: "JPA",
      idaEVolta: true, trechoDireto: false, registradoPorId: null, registradoPorNome: null,
    }));
    const pend = (id: string, rotas: VagaParaPrevisao["rotas"]): VagaParaPrevisao => ({ ...vaga(id, "2026-11-10"), eventStart: "2026-11-11", rotas });
    const r = orcamentoPorEvento({
      pendentes: [
        pend("a", [{ perna: "ida_e_volta", origem: "GRU", destino: "JPA", dataIda: "2026-11-10", dataVolta: "2026-11-14", chave: "" }]),
        pend("b", [{ perna: "ida_e_volta", origem: "GRU", destino: "JPA", dataIda: "2026-11-11", dataVolta: "2026-11-14", chave: "" }]),
        pend("c", [{ perna: "ida_e_volta", origem: "CNF", destino: "JPA", dataIda: "2026-11-10", dataVolta: "2026-11-14", chave: "" }]),
        pend("d", [{ perna: "ida", origem: "CNF", destino: "JPA", dataIda: "2026-11-10", dataVolta: null, chave: "" }]),
        pend("e", []),
      ],
      passagens, consultas: h, hoje: HOJE,
    });
    const e = r.eventos[0];
    expect(e).toMatchObject({ pendentes: 5, comEstimativa: 3, semEstimativa: 2, gasto: 310000, passagens: 3 });
    // 88.000 (última) + 100.000 (típico: mediana de 88/100/110) + 100.000 (média paga ida e volta).
    expect(e.estimado).toBe(288000);
    expect(e.fontes).toEqual({ ultima_consulta: 1, tipico_da_rota: 1, media_paga: 1 });
    expect(r.totais).toMatchObject({ gasto: 310000, estimado: 288000, pendentes: 5, semEstimativa: 2 });
  });
});
