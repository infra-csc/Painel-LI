// Prazos no Painel de honorários (28/10, Fase 3): filtro "Atrasados / Vence
// hoje / Contestações" pelo pior prazo da linha, a ordem "mais atrasado
// primeiro", de quem é a vez e os selos da linha e do evento.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { linhaRhFake } from "@/test/fixtures-dominio";
import { prazoDaPrestacao, PRAZOS_PADRAO, type PrazoDaPrestacao } from "@shared/prazos-honorarios";
import { passaNoFiltroDePrazo, useRhFilaFiltrada } from "./use-rh-fila-filtrada";
import { comQuemPeloPrazo } from "./cartao-prestacao-linha";
import { FaixaDePrazos } from "./rh-prazos";
import { RhEventGroup, type RhEventGroupProps } from "./rh-event-group";
import type { PrestacaoItem } from "./prestacao-types";

const HOJE = "2026-11-10";
const base = { hoje: HOJE, prazos: PRAZOS_PADRAO, emiteNf: true };
/** Terminou em `ultimo`, sem confirmar. */
const semConfirmar = (ultimo: string): PrazoDaPrestacao => prazoDaPrestacao({ ...base, ultimoDia: ultimo, realizado: { sentForReview: false, rhStatus: "pendente" } });
/** Com o DP desde `dia` (12h UTC = 9h em Brasília). */
const comODp = (dia: string): PrazoDaPrestacao => prazoDaPrestacao({ ...base, ultimoDia: "2026-11-01", realizado: { sentForReview: true, rhStatus: "pendente", checkoutFinalEm: `${dia}T12:00:00Z` } });

const linha = (nome: string, prazo: PrazoDaPrestacao | null, extra: Partial<PrestacaoItem> = {}) =>
  linhaRhFake({ collaboratorName: nome, status: "aguardando_prestacao", rhPrecisaAgir: false, prazo, ...extra });

const filtrosBase = {
  filterStatus: "all" as const, filterFunction: "all", filterCollaborator: "all", filterInvoiceStatus: "all", buscaAplicada: "", showConcluded: false, filterCheckinOnly: false,
};

describe("filtro e ordem por prazo", () => {
  const atrasado2 = linha("Atrasada dois", semConfirmar("2026-11-06")); // confirmar venceu 08/11
  const atrasado5 = linha("Atrasado cinco", comODp("2026-11-02")); // conferência venceu 05/11
  const hoje = linha("Vence hoje", comODp("2026-11-07"));
  const semPrazo = linha("Sem prazo", null);
  const contestou = linha("Contestou", null, { contestacao: { texto: "Algo não bate", em: null, respondida: false, resposta: null, respondidaEm: null, respondidaPorNome: null } });
  const todas = [semPrazo, atrasado2, hoje, atrasado5, contestou];

  it("cada recorte pega as linhas certas pelo PIOR prazo", () => {
    expect(todas.filter((l) => passaNoFiltroDePrazo(l, "atrasados")).map((l) => l.collaboratorName)).toEqual(["Atrasada dois", "Atrasado cinco"]);
    expect(todas.filter((l) => passaNoFiltroDePrazo(l, "vence_hoje")).map((l) => l.collaboratorName)).toEqual(["Vence hoje"]);
    expect(todas.filter((l) => passaNoFiltroDePrazo(l, "contestacoes")).map((l) => l.collaboratorName)).toEqual(["Contestou"]);
  });

  it("'Atrasados' ordena do mais atrasado ao menos; o tamanho é o número do botão", () => {
    const { result } = renderHook(() => useRhFilaFiltrada({ prestacaoItems: todas }, { ...filtrosBase, filtroPrazo: "atrasados" }));
    expect(result.current.filteredItems.map((l) => l.collaboratorName)).toEqual(["Atrasado cinco", "Atrasada dois"]);
  });

  it("'Mais atrasado primeiro' sem filtro: atrasados, vence hoje, depois o resto na ordem do servidor", () => {
    const { result } = renderHook(() => useRhFilaFiltrada({ prestacaoItems: todas }, { ...filtrosBase, ordem: "atraso" }));
    expect(result.current.filteredItems.map((l) => l.collaboratorName)).toEqual(["Atrasado cinco", "Atrasada dois", "Vence hoje", "Sem prazo", "Contestou"]);
  });
});

describe("de quem é a vez", () => {
  it("confirmação e check-out correm juntos: o colaborador primeiro", () => {
    expect(comQuemPeloPrazo(semConfirmar("2026-11-06"))).toMatchObject({ texto: "Com o colaborador", sub: "confirmar a presença · depois a produção", tom: "text-danger" });
  });
  it("devolvida: com a produção; com o DP: nada (o DP tem o botão de ação)", () => {
    const devolvida = prazoDaPrestacao({ ...base, ultimoDia: "2026-11-01", realizado: { rhStatus: "devolvido", rhActionAt: "2026-11-09T12:00:00Z" } });
    expect(comQuemPeloPrazo(devolvida)).toMatchObject({ texto: "Com a produção", sub: "corrigir e reenviar ao DP", tom: "text-slate-600" });
    expect(comQuemPeloPrazo(comODp("2026-11-02"))).toBeNull();
    expect(comQuemPeloPrazo(null)).toBeNull();
  });
});

describe("FaixaDePrazos", () => {
  it("mostra as contagens, alterna o filtro e desliga o botão sem nada", () => {
    const onFiltro = vi.fn();
    const { rerender } = renderComTudo(
      <FaixaDePrazos contagem={{ atrasados: 3, venceHoje: 0, contestacoes: 1, porQuem: { dp: 1, producao: 1, colaborador: 1 } }} filtro="all" onFiltro={onFiltro} ordem="padrao" onOrdem={vi.fn()} />,
    );
    expect(screen.getByTestId("rh-prazo-atrasados")).toHaveTextContent("Atrasados3");
    expect(screen.getByTestId("rh-prazo-hoje")).toBeDisabled();
    fireEvent.click(screen.getByTestId("rh-prazo-atrasados"));
    expect(onFiltro).toHaveBeenCalledWith("atrasados");
    rerender(<FaixaDePrazos contagem={{ atrasados: 3, venceHoje: 0, contestacoes: 1, porQuem: { dp: 1, producao: 1, colaborador: 1 } }} filtro="atrasados" onFiltro={onFiltro} ordem="padrao" onOrdem={vi.fn()} />);
    expect(screen.getByTestId("rh-prazo-atrasados")).toHaveAttribute("aria-pressed", "true");
    // Com "Atrasados" a ordem é sempre a do atraso.
    expect(screen.getByTestId("rh-ordem")).toBeDisabled();
    fireEvent.click(screen.getByTestId("rh-prazo-atrasados"));
    expect(onFiltro).toHaveBeenLastCalledWith("all");
  });
});

describe("faixa do evento", () => {
  it("conta os atrasados (com o maior atraso) e o que vence hoje", () => {
    const g = [linha("A", semConfirmar("2026-11-06")), linha("B", comODp("2026-11-02")), linha("C", comODp("2026-11-07")), linha("D", null)];
    const props: RhEventGroupProps = {
      group: { event: g[0].event, items: g, actionNeeded: 4, rhNeeded: 0 }, isOpen: false, onToggle: vi.fn(), expandedCards: new Set(), expandedDetails: new Set(),
      approvingInvoiceId: null, nfApproving: false, canRh: true, toggleExpand: vi.fn(), toggleDetails: vi.fn(), navigate: vi.fn(),
      setApprovingInvoiceId: vi.fn(), setNfApproving: vi.fn(), toast: vi.fn() as unknown as RhEventGroupProps["toast"],
    };
    renderComTudo(<RhEventGroup {...props} />);
    expect(screen.getByTestId("crh-grupo-atrasados")).toHaveTextContent("2 atrasados (até 5 dias)");
    expect(screen.getByTestId("crh-grupo-vence-hoje")).toHaveTextContent("1 vence hoje");
  });
});
