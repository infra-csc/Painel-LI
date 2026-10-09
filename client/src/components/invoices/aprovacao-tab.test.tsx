// Aba Aprovação RH (08/10): os totais do pé somam o MESMO conjunto que a lista
// mostra ("Mostrando N de M") e cada valor diz quantas notas soma. Antes
// somavam o evento inteiro, com qualquer filtro ou busca.
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo, criarQueryClient } from "@/test/render";
import { notaFiscalFake, realizadoFake } from "@/test/fixtures-dominio";
import { moeda } from "@/test/orcamento-fixture";
import { AprovacaoTab, type AprovacaoTabProps } from "./aprovacao-tab";
import { somarNotas } from "./aprovacao-totals-footer";
import { aguardaAnaliseDoRh } from "./invoice-status";

const NOMES: Record<string, string> = { c1: "ANA SOUZA", c2: "BRUNO LIMA", c3: "CARLA DIAS", c4: "DIEGO REIS" };

function montar(extras: Partial<AprovacaoTabProps> = {}) {
  const budgetActuals = [
    realizadoFake({ id: "r1", collaboratorId: "c1", totalValue: 100000 }),
    realizadoFake({ id: "r2", collaboratorId: "c2", totalValue: 50000 }),
    realizadoFake({ id: "r3", collaboratorId: "c3", totalValue: 20000 }),
    realizadoFake({ id: "r4", collaboratorId: "c4", totalValue: 7000 }),
  ];
  const invoices = [
    notaFiscalFake({ id: "n1", budgetActualId: "r1", collaboratorId: "c1", status: "enviada", oc: "OC-1" }),
    notaFiscalFake({ id: "n2", budgetActualId: "r2", collaboratorId: "c2", status: "aprovada", oc: "OC-2" }),
    notaFiscalFake({ id: "n3", budgetActualId: "r3", collaboratorId: "c3", status: "enviada", oc: "OC-3" }),
    notaFiscalFake({ id: "n4", budgetActualId: "r4", collaboratorId: "c4", status: "devolvida", oc: "OC-4" }),
  ];
  const props: AprovacaoTabProps = {
    invoices, budgetActuals,
    getName: (id) => NOMES[id ?? ""] ?? "—",
    getFuncName: () => "Produção",
    selectedEventId: "evento-1",
    qc: criarQueryClient(),
    toast: vi.fn() as unknown as AprovacaoTabProps["toast"],
    filterStatus: "all",
    onFilterStatus: vi.fn(),
    highlightActualId: "",
    busca: "",
    onBusca: vi.fn(),
    ...extras,
  };
  return renderComTudo(<AprovacaoTab {...props} />);
}

describe("AprovacaoTab — totais do pé", () => {
  it("sem filtro: o total do evento, com quantas notas cada valor soma (devolvida fora)", () => {
    montar();
    const totais = within(screen.getByTestId("nf-totais-aprovacao"));
    expect(totais.getByText("Total do evento")).toBeInTheDocument();
    expect(totais.getByText("Aprovadas").parentElement).toHaveTextContent(`Aprovadas (1)${moeda(50000)}`);
    expect(totais.getByText("Aguardando").parentElement).toHaveTextContent(`Aguardando (2)${moeda(120000)}`);
    expect(totais.getByText("Aprovadas + aguardando").parentElement).toHaveTextContent(moeda(170000));
  });

  it("com busca: os totais somam só o recorte e o título diz isso", () => {
    montar({ busca: "oc-3" });
    expect(screen.getByText("Mostrando 1 de 4 notas")).toBeInTheDocument();
    const totais = within(screen.getByTestId("nf-totais-aprovacao"));
    expect(totais.getByText("Total do recorte")).toBeInTheDocument();
    expect(totais.queryByText(/^Aprovadas$/)).toBeNull();
    expect(totais.getByText("Aguardando").parentElement).toHaveTextContent(`Aguardando (1)${moeda(20000)}`);
    expect(totais.getByText("Aprovadas + aguardando").parentElement).toHaveTextContent(moeda(20000));
  });

  it("somarNotas: aprovadas e enviadas, cada uma com a contagem; o resto não entra", () => {
    const valores: Record<string, number> = { r1: 100, r2: 50, r3: 20 };
    const t = somarNotas(
      [{ status: "aprovada", budgetActualId: "r1" }, { status: "enviada", budgetActualId: "r2" }, { status: "recusada", budgetActualId: "r3" }],
      id => valores[id ?? ""] ?? 0,
    );
    expect(t).toEqual({ aprovadas: { n: 1, valor: 100 }, aguardando: { n: 1, valor: 50 }, total: 150 });
  });
});

describe("AprovacaoTab — 'Aguardando' com o critério da aba e do resumo (08/10)", () => {
  // n3 é ENVIADA, mas a prestação dela foi devolvida no Realizado: está pausada.
  const pausada = [
    realizadoFake({ id: "r1", collaboratorId: "c1", totalValue: 100000 }),
    realizadoFake({ id: "r2", collaboratorId: "c2", totalValue: 50000 }),
    realizadoFake({ id: "r3", collaboratorId: "c3", totalValue: 20000, sentForReview: false, rhStatus: "devolvido" }),
    realizadoFake({ id: "r4", collaboratorId: "c4", totalValue: 7000 }),
  ];

  it("a pílula e o pé não contam a nota de prestação pausada", () => {
    montar({ budgetActuals: pausada });
    // A pílula pode trazer o alerta de idade ("N aguardando há mais de 3 dias",
    // depende da data do fixture): confere só o rótulo e o contador.
    const pilula = screen.getByTestId("nf-filtro-enviada");
    expect(pilula).toHaveTextContent(/^Aguardando/);
    expect(pilula.querySelector("span.rounded-full.tabular-nums")?.textContent).toBe("1");
    const totais = within(screen.getByTestId("nf-totais-aprovacao"));
    expect(totais.getByText("Aguardando").parentElement).toHaveTextContent(`Aguardando (1)${moeda(100000)}`);
  });

  it("filtrada em 'Aguardando', a lista mostra só a que espera o RH", () => {
    montar({ budgetActuals: pausada, filterStatus: "enviada" });
    expect(screen.getByText("Mostrando 1 de 4 notas")).toBeInTheDocument();
  });

  it("aguardaAnaliseDoRh: o mesmo critério do número da aba (enviada + prestação liberando a NF)", () => {
    expect(aguardaAnaliseDoRh({ status: "enviada" }, { sentForReview: true, rhStatus: "pendente" })).toBe(true);
    expect(aguardaAnaliseDoRh({ status: "enviada" }, { sentForReview: true, rhStatus: "aprovado" })).toBe(true);
    expect(aguardaAnaliseDoRh({ status: "enviada" }, { sentForReview: false, rhStatus: "devolvido" })).toBe(false);
    expect(aguardaAnaliseDoRh({ status: "enviada" }, { sentForReview: false, rhStatus: "rejeitado" })).toBe(false);
    expect(aguardaAnaliseDoRh({ status: "enviada" }, { sentForReview: true, rhStatus: "pendente", splitParentId: "x" })).toBe(false);
    expect(aguardaAnaliseDoRh({ status: "enviada" }, undefined)).toBe(false);
    expect(aguardaAnaliseDoRh({ status: "aprovada" }, { sentForReview: true, rhStatus: "pendente" })).toBe(false);
  });
});
