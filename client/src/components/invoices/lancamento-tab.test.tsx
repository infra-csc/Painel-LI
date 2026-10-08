// Redesenho 08/10 da aba Lançamento: ordem de nome, quem não emite NF num grupo
// no fim, busca por nome/função/OC contando nas pílulas e "Limpar filtros".
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { BudgetActual } from "@shared/schema";
import { renderComTudo, criarQueryClient } from "@/test/render";
import { eventoFake, notaFiscalFake, realizadoFake } from "@/test/fixtures-dominio";
import { LancamentoTab, type LancamentoTabProps } from "./lancamento-tab";

const NOMES: Record<string, string> = { c1: "ZÉLIA PRADO", c2: "ANA SOUZA", c3: "BRUNO LIMA" };
const FUNCOES: Record<string, string> = { f1: "Produção", f2: "Montagem" };

function montar(extras: Partial<LancamentoTabProps> = {}) {
  const actuals: BudgetActual[] = [
    realizadoFake({ id: "r1", collaboratorId: "c1", functionId: "f1", totalValue: 100000 }),
    realizadoFake({ id: "r2", collaboratorId: "c2", functionId: "f2", totalValue: 50000 }),
    realizadoFake({ id: "r3", collaboratorId: "c3", functionId: "f1", totalValue: 20000 }),
  ];
  const notas = { r1: notaFiscalFake({ budgetActualId: "r1", status: "enviada", oc: "OC-9001" }) } as Record<string, ReturnType<typeof notaFiscalFake>>;
  const props: LancamentoTabProps = {
    approvedActuals: actuals,
    emitsNfFor: (a) => a.collaboratorId !== "c3",
    getInvoice: (id) => notas[id],
    getName: (id) => NOMES[id ?? ""] ?? "—",
    getFuncName: (id) => FUNCOES[id ?? ""] ?? "—",
    selectedEvent: eventoFake({ id: "evento-1" }),
    selectedEventId: "evento-1",
    qc: criarQueryClient(),
    toast: vi.fn() as unknown as LancamentoTabProps["toast"],
    filterStatus: "all",
    onFilterStatus: vi.fn(),
    highlightActualId: "",
    busca: "",
    onBusca: vi.fn(),
    ...extras,
  };
  return { ...renderComTudo(<LancamentoTab {...props} />), props };
}

describe("LancamentoTab", () => {
  it("lista em ordem de nome e põe quem não emite NF num grupo próprio, no fim", () => {
    montar();
    const notas = screen.getByRole("list", { name: "Notas fiscais por colaborador" });
    const nomes = within(notas).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(nomes).toEqual(["Ana Souza", "Zélia Prado"]);
    const semNf = screen.getByRole("list", { name: "Itens que não emitem nota fiscal" });
    expect(within(semNf).getByText("Bruno Lima")).toBeInTheDocument();
    expect(within(semNf).getByText("Não emite NF")).toBeInTheDocument();
    expect(screen.getByText("Não emitem nota fiscal")).toBeInTheDocument();
    expect(screen.getByTestId("nf-rodape-lancamento")).toHaveTextContent("3 itens do Realizado · 1 sem nota");
  });

  it("a busca acha por OC e as pílulas contam sobre o resultado", () => {
    montar({ busca: "oc-9001" });
    expect(screen.getByText("Zélia Prado")).toBeInTheDocument();
    expect(screen.queryByText("Ana Souza")).toBeNull();
    expect(screen.getByRole("button", { name: /^Todos/ })).toHaveTextContent("Todos1");
    expect(screen.getByTestId("nf-rodape-lancamento")).toHaveTextContent("Mostrando 1 de 3");
  });

  it("sem resultado: 'Limpar filtros' zera a situação e a busca", async () => {
    const onFilterStatus = vi.fn();
    const onBusca = vi.fn();
    const { user } = montar({ busca: "ninguém", onFilterStatus, onBusca });
    expect(screen.getByText("Nenhum item neste recorte")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(onFilterStatus).toHaveBeenCalledWith("all");
    expect(onBusca).toHaveBeenCalledWith("");
  });

  it("sem itens no Realizado: o vazio explica e leva ao Realizado", () => {
    montar({ approvedActuals: [] });
    expect(screen.getByText("Nada para lançar neste evento ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir o Realizado/ })).toHaveAttribute("href", "/budget-actual");
  });
});
