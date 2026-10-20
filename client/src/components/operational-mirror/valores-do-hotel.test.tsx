/**
 * Valores do hotel na aba Quartos (20/10): painel de tarifas / distribuição /
 * calculado × pago, rodapé com a conta de cada quarto, valor e late check-out
 * de cada ocupante — e o que muda para quem só consulta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { MirrorCollaborator, MirrorEvent, MirrorRow, RoomGroup } from "@shared/operational-mirror-types";
import type { ValoresDoHotelSalvos } from "@shared/custo-dos-quartos";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { QuartosView } from "./quartos-view";
import { centavosDoTexto, leituraDaDiferenca } from "./valores-do-hotel";

const evento: MirrorEvent = { id: "ev1", name: "Night Run Rio", location: "Rio de Janeiro - RJ", startDate: "2026-04-24", endDate: "2026-04-26", status: null };

function linha(id: string, nome: string, extra: Partial<MirrorRow> = {}): MirrorRow {
  return {
    teamInclusionId: `v-${id}`,
    collaborator: { id, fullName: nome, gender: "male", city: null, state: null, type: null },
    function: { id: "f", name: "Montagem", costCenter: null, area: "Montagem" },
    schedule: { startDate: "2026-04-22", endDate: "2026-04-27", flightDepartureDate: null, flightReturnDate: null, dailyRates: 3 },
    ticket: null, accommodation: null, observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false, suggestedRoomGroupId: null, roomGroupLabel: null, pendencies: [],
    ...extra,
  } as unknown as MirrorRow;
}

/** O duplo da planilha: Mauricio 22→27, Edney 24→26 (sozinho até o Edney chegar). */
function duplo(id = "q1", membros: { c: string; de: string; ate: string }[] = [
  { c: "mau", de: "2026-04-22", ate: "2026-04-27" },
  { c: "edn", de: "2026-04-24", ate: "2026-04-26" },
]): RoomGroup {
  return {
    id, eventId: evento.id, hotelName: "Hotel Rio", roomType: "double", genderRule: "male",
    checkInDate: "2026-04-22", checkOutDate: "2026-04-27", notes: null, suggested: true, confirmed: false,
    members: membros.map((m, i) => ({ id: `${id}-m${i}`, hotelRoomGroupId: id, collaboratorId: m.c, confirmed: false, checkInDate: m.de, checkOutDate: m.ate })),
  } as unknown as RoomGroup;
}

const TARIFAS: ValoresDoHotelSalvos = {
  tarifas: { single: 18000, double: 13800, triple: 13200 }, faturaCentavos: null, quartos: [], lateCheckouts: [],
};

function montar({ groups = [duplo()], rows = [linha("mau", "Mauricio Alves"), linha("edn", "Edney Souza")], valores = TARIFAS as ValoresDoHotelSalvos | null, semValores = false, canEdit = true } = {}) {
  const collabById = new Map<string, MirrorCollaborator>(rows.map((r) => [r.collaborator.id as string, r.collaborator]));
  return renderComTudo(
    <QuartosView groups={groups} rows={rows} collabById={collabById} canEdit={canEdit} evento={evento} valores={semValores ? undefined : valores}
      onConfirm={() => {}} onPatch={() => {}} onMover={() => {}} pendingId={null} />,
    { user: usuarioFake({ role: canEdit ? "purchasing" : "function_area" }) },
  );
}

const corpo = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}"));
/** O Intl separa "R$" do número com espaço fixo (U+00A0). */
const sp = (s: string | null | undefined) => String(s ?? "").replace(/ /g, " ");
afterEach(() => { vi.unstubAllGlobals(); });

describe("centavosDoTexto e leituraDaDiferenca", () => {
  it("aceita os jeitos de escrever reais; o resto é inválido", () => {
    expect(centavosDoTexto("138")).toBe(13800);
    expect(centavosDoTexto("138,5")).toBe(13850);
    expect(centavosDoTexto("R$ 1.380,00")).toBe(138000);
    expect(centavosDoTexto("138.50")).toBe(13850);
    expect(centavosDoTexto("1.380")).toBe(138000);
    expect(centavosDoTexto("  ")).toBeNull();
    expect(centavosDoTexto("-10")).toBe("invalido");
    expect(centavosDoTexto("12a")).toBe("invalido");
    expect(centavosDoTexto("1,234,5")).toBe("invalido");
  });
  it("diferença: bate, acima e abaixo do calculado", () => {
    expect(leituraDaDiferenca(0, 0)).toEqual({ tom: "ok", texto: "Bate com o calculado" });
    const acima = leituraDaDiferenca(8800, 8800 / 91200);
    expect(acima.tom).toBe("acima");
    expect(sp(acima.texto)).toBe("+R$ 88,00 · 9,6% acima do calculado");
    expect(leituraDaDiferenca(-500, null).tom).toBe("abaixo");
  });
});

describe("Valores do hotel na aba Quartos", () => {
  it("servidor antigo (sem valores): nada de valores na tela", () => {
    montar({ semValores: true });
    expect(screen.queryByTestId("valores-do-hotel")).toBeNull();
    expect(screen.queryByTestId("quarto-valores-q1")).toBeNull();
  });

  it("sem tarifa: o painel convida a começar, sem coluna Valor nem rodapé nos quartos", () => {
    montar({ valores: { ...TARIFAS, tarifas: { single: null, double: null, triple: null } } });
    expect(screen.getByTestId("valores-vazio")).toHaveTextContent("Comece pelas tarifas");
    expect(screen.queryByTestId("quarto-valores-q1")).toBeNull();
    expect(screen.queryAllByTestId("valor-da-pessoa")).toHaveLength(0);
  });

  it("duplo com chegada escalonada: conta por noite, valor de cada pessoa, total do quarto e distribuição", () => {
    montar();
    const conta = screen.getByTestId("quarto-conta-q1");
    expect(within(conta).getAllByRole("listitem").map((li) => sp(li.textContent))).toEqual([
      "2 noitesIndividual1 × R$ 180,00 = R$ 360,00",
      "2 noitesDuplo2 × R$ 138,00 = R$ 552,00",
      "1 noiteIndividual1 × R$ 180,00 = R$ 180,00",
    ]);
    expect(screen.getByTestId("quarto-total-q1")).toHaveTextContent("R$ 1.092,00");
    const [mau, edn] = screen.getAllByTestId("valor-da-pessoa");
    expect(mau).toHaveTextContent("R$ 816,00");
    expect(mau).toHaveTextContent("5 noites");
    expect(edn).toHaveTextContent("R$ 276,00");
    expect(screen.getByTestId("distribuicao-single")).toHaveTextContent("IndividualR$ 540,003 diárias");
    expect(screen.getByTestId("distribuicao-double")).toHaveTextContent("DuploR$ 552,004 diárias");
    expect(screen.queryByTestId("distribuicao-triple")).toBeNull();
    expect(screen.getByTestId("valores-calculado")).toHaveTextContent("R$ 1.092,00");
    // O preço da noite também no título do selo de ocupação.
    expect(sp(within(screen.getByTestId("room-trechos-q1")).getAllByRole("listitem")[1].getAttribute("title"))).toContain("R$ 138,00 por pessoa");
  });

  it("tarifa digitada salva em centavos ao sair do campo; inválida mostra o erro no campo e não grava", async () => {
    const fetchMock = mockarFetch((url, init) => {
      if (url.endsWith("/operational-mirror/hotel-valores") && init?.method === "PUT") return respostaJson({});
      return respostaJson({});
    });
    const { user } = montar();
    const campo = screen.getByTestId("tarifa-double-campo");
    await user.clear(campo);
    await user.type(campo, "140{Enter}");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/hotel-valores") && corpo(i).duploCentavos === 14000)).toBe(true));

    const triplo = screen.getByTestId("tarifa-triple-campo");
    await user.clear(triplo);
    await user.type(triplo, "12a{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Valor inválido (ex.: 138,00)");
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/hotel-valores"))).toHaveLength(1);
  });

  it("fatura do evento: mostra a diferença do calculado", () => {
    montar({ valores: { ...TARIFAS, faturaCentavos: 120000 } });
    expect(screen.getByTestId("valores-diferenca")).toHaveTextContent("+R$ 108,00");
    expect(screen.getByTestId("valores-fechamento")).toHaveTextContent("o hotel cobrou a mais");
  });

  it("diária própria do quarto: definir salva no quarto; com ela, \"voltar ao padrão\" apaga", async () => {
    const fetchMock = mockarFetch(() => respostaJson({}));
    const { user, unmount } = montar();
    await user.click(screen.getByTestId("quarto-diaria-definir-q1"));
    const campo = screen.getByTestId("quarto-diaria-campo-q1");
    await user.type(campo, "150{Enter}");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/api/hotel-room-groups/q1/valores") && corpo(i).diariaPropriaCentavos === 15000)).toBe(true));
    unmount();

    const outro = mockarFetch(() => respostaJson({}));
    montar({ valores: { ...TARIFAS, quartos: [{ quartoId: "q1", diariaPropriaCentavos: 15000, valorPagoCentavos: 100000 }] } });
    expect(screen.getByTestId("quarto-total-q1")).toHaveTextContent("R$ 1.050,00"); // 7 diárias × 150
    expect(screen.getByTestId("quarto-diferenca-q1")).toHaveTextContent("−R$ 50,00");
    await user.click(screen.getByTestId("quarto-diaria-padrao-q1"));
    await waitFor(() => expect(outro.mock.calls.some(([u, i]) => String(u).endsWith("/q1/valores") && corpo(i).diariaPropriaCentavos === null)).toBe(true));
  });

  it("late check-out: marcar pela linha da pessoa grava com o valor igual à diária", async () => {
    const fetchMock = mockarFetch(() => respostaJson({}));
    const { user } = montar();
    const [mau] = screen.getAllByTestId("valor-da-pessoa");
    await user.click(within(mau).getByTestId("late-checkout-marcar"));
    const pop = await screen.findByTestId("late-checkout-popover");
    await user.click(within(pop).getByTestId("late-checkout-switch"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/operational-mirror/late-checkout")
      && corpo(i).collaboratorId === "mau" && corpo(i).ativo === true && corpo(i).valorCentavos === null)).toBe(true));
  });

  it("late check-out marcado: selo na linha e soma no valor e no quarto", () => {
    montar({ valores: { ...TARIFAS, lateCheckouts: [{ collaboratorId: "mau", ativo: true, valorCentavos: null }] } });
    const [mau] = screen.getAllByTestId("valor-da-pessoa");
    expect(within(mau).getByTestId("late-checkout-selo")).toHaveTextContent("late +R$ 180,00");
    expect(mau).toHaveTextContent("R$ 996,00");
    expect(screen.getByTestId("quarto-total-q1")).toHaveTextContent("R$ 1.272,00");
    expect(screen.getByTestId("distribuicao-late")).toHaveTextContent("Late check-outR$ 180,001 pessoa");
  });

  it("total lançado à mão na grade: o calculado fica riscado e o lançado aparece", () => {
    const rows = [linha("mau", "Mauricio Alves", { accommodation: { totalCents: 50000 } as MirrorRow["accommodation"] }), linha("edn", "Edney Souza")];
    montar({ rows });
    expect(screen.getByTestId("valor-lancado-na-grade")).toHaveTextContent("na grade: R$ 500,00");
  });

  it("quarto com 4 pessoas na mesma noite: aviso no painel e na conta", () => {
    const quatro = duplo("q9", ["a", "b", "c", "d"].map((c) => ({ c, de: "2026-04-24", ate: "2026-04-25" })));
    montar({ groups: [quatro], rows: ["a", "b", "c", "d"].map((c) => linha(c, `Pessoa ${c.toUpperCase()}`)) });
    expect(screen.getByTestId("valores-aviso-4-pessoas")).toHaveTextContent("Quarto 1 tem 4 pessoas na mesma noite — usei a tarifa do Triplo");
    expect(screen.getByTestId("quarto-conta-q9")).toHaveTextContent("4 pessoas");
  });

  it("quem só consulta vê os valores, sem campos nem late check-out para marcar", () => {
    montar({ canEdit: false, valores: { ...TARIFAS, faturaCentavos: 109200 } });
    expect(screen.queryByTestId("tarifa-double-campo")).toBeNull();
    expect(screen.getByTestId("tarifa-double")).toHaveTextContent("R$ 138,00");
    expect(screen.getByTestId("valores-fechamento")).toHaveTextContent("Bate com o calculado");
    expect(screen.queryByTestId("quarto-diaria-definir-q1")).toBeNull();
    expect(screen.queryByTestId("late-checkout-marcar")).toBeNull();
    expect(screen.getByTestId("quarto-total-q1")).toHaveTextContent("R$ 1.092,00");
  });

  it("tabelas ainda não criadas (valores null): painel avisa e os campos ficam desligados", () => {
    montar({ valores: null });
    expect(screen.getByTestId("valores-indisponivel")).toBeInTheDocument();
    expect(screen.getByTestId("tarifa-double-campo")).toBeDisabled();
  });
});
