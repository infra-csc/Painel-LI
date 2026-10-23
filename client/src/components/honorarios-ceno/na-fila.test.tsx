/**
 * Honorários na Fila da Escalação (23/10): o selo da linha e o grupo
 * "Honorário" do painel de filtros — só para quem lança, e com o número igual
 * ao que a lista mostra.
 */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { TeamInclusion } from "@shared/schema";
import type { HonorarioNaFila, SituacaoNaFila } from "@shared/honorarios-ceno";
import { renderComTudo } from "@/test/render";
import { vagaFake } from "@/test/fixtures-dominio";
import { ScalingTableRow } from "@/components/scaling/scaling-table-row";
import type { ScalingTableProps } from "@/components/scaling/scaling-table";
import ScalingFilterBar from "@/components/scaling/scaling-filter-bar";
import { DEFAULT_PERIOD } from "@/components/scaling/scaling-period";
import { fazTesteDeFlags, type QueueContext } from "@/components/scaling/scaling-queue";
import { textoDoSelo } from "./na-fila";

function naFila(vagaId: string, situacao: SituacaoNaFila, p: Partial<HonorarioNaFila> = {}): HonorarioNaFila {
  return {
    vagaId, eventId: "evento-1", situacao, honorarioId: situacao === "falta_lancar" ? null : `h-${vagaId}`, status: null,
    valorCents: situacao === "falta_lancar" ? null : 99_200, valorPedidoCents: null, empreita: null, meu: false, aviso: null,
    criadoPor: "u-pede", criadoPorNome: "Quem Pede", createdAt: "2099-10-01T10:00:00Z", enviadoPor: null, enviadoPorNome: null, enviadoEm: null,
    decididoPorNome: null, decididoEm: null, ...p,
  };
}

type Props = Omit<ScalingTableProps, "rows">;
function props(extras: Partial<Props> = {}): Props {
  return {
    sortConfig: null, onSort: vi.fn(), onRowClick: vi.fn(), onViewComments: vi.fn(), onEscalar: vi.fn(),
    getFunctionName: () => "Cenotécnica", getEventName: () => "Night Run", getCollaboratorName: (id) => (id ? "Ana Souza" : ""),
    getCollaboratorCity: () => null, getTicket: () => undefined, getAccommodation: () => undefined,
    pendingSwapByInclusion: new Map(), pendingChangeByInclusion: new Map(), approvedSwapInclusionIds: new Set(), seenSwapIds: new Set(),
    currentUserId: "u-pede", isAdminOrPurchasing: false, canManageFunction: () => true, canApproveProduction: false,
    selectedIds: new Set(), getSelectBlockReason: () => null, onToggleSelect: vi.fn(), onToggleAllVisible: vi.fn(),
    ...extras,
  };
}

const linha = (vaga: TeamInclusion, p: Props) => renderComTudo(<table><tbody><ScalingTableRow inclusion={vaga} p={p} /></tbody></table>);

describe("Fila da Escalação — selo do honorário na linha", () => {
  it("quem não lança: nenhum selo", () => {
    const v = vagaFake({ id: "v1" });
    linha(v, props());
    expect(screen.queryByTestId("selo-honorario-v1")).not.toBeInTheDocument();
  });

  it.each([
    ["falta_lancar", {}, "Falta lançar"],
    ["rascunho", {}, "Rascunho · R$ 992"],
    ["aguardando", {}, "Enviado · R$ 992"],
    ["aprovado", { valorCents: 100_000 }, "Aprovado · R$ 1.000"],
    ["devolvido", {}, "Devolvido"],
    ["rascunho", { empreita: { id: "e1", nome: "Equipe Sul", vagas: 3 } }, "Na empreita Equipe Sul"],
  ] as const)("%s (%o) → selo certo", (situacao, extra, texto) => {
    const v = vagaFake({ id: "v1" });
    linha(v, props({ honorarioDaVaga: () => naFila("v1", situacao, extra) }));
    expect(screen.getByTestId("selo-honorario-v1")).toHaveTextContent(texto);
    expect(textoDoSelo(naFila("v1", situacao, extra)).replace(/\s/g, " ")).toBe(texto);
  });

  it("vaga da casa não tem selo; clicar no selo abre a aba Honorário, não a linha", async () => {
    const casa = vagaFake({ id: "v2" });
    linha(casa, props({ honorarioDaVaga: () => naFila("v2", "casa") }));
    expect(screen.queryByTestId("selo-honorario-v2")).not.toBeInTheDocument();

    const v = vagaFake({ id: "v1" });
    const onAbrirHonorario = vi.fn();
    const onRowClick = vi.fn();
    const { user } = linha(v, props({ honorarioDaVaga: () => naFila("v1", "rascunho", { criadoPor: "u-pede" }), onAbrirHonorario, onRowClick }));
    const selo = screen.getByTestId("selo-honorario-v1");
    expect(selo).toHaveAccessibleName(/lançado por você/);
    await user.click(selo);
    expect(onAbrirHonorario).toHaveBeenCalledWith(v);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("Fila da Escalação — grupo “Honorário” no painel de filtros", () => {
  const vagas = [vagaFake({ id: "a" }), vagaFake({ id: "b" }), vagaFake({ id: "c" }), vagaFake({ id: "d" })];
  const etapa: Record<string, HonorarioNaFila> = {
    a: naFila("a", "falta_lancar"), b: naFila("b", "falta_lancar"), c: naFila("c", "rascunho", { meu: true }), d: naFila("d", "aprovado"),
  };
  const ctx = (comHonorario: boolean): QueueContext => ({
    temNome: (i) => !!i.collaboratorId, temTroca: () => false, temPedido: () => false, bloqueioParaConfirmar: () => null,
    temPassagemComprada: () => false, temHospedagemReservada: () => false, ehCenoEmpreita: () => false,
    honorarioDaVaga: comHonorario ? (i) => etapa[i.id] : undefined,
  });

  function barra(mostrar: boolean, flags: Record<string, boolean> = {}) {
    return renderComTudo(
      <ScalingFilterBar
        busca="" onBusca={vi.fn()} eventos={{}} onEventos={vi.fn()} opcoesDeEvento={[]} funcoes={{}} onFuncoes={vi.fn()} opcoesDeFuncao={[]}
        periodo={DEFAULT_PERIOD} onPeriodo={vi.fn()} linhasSemPeriodo={vagas} hoje={new Date("2099-10-01T12:00:00")}
        flags={flags} onFlags={vi.fn()} linhasSemFlags={vagas} queueContext={ctx(mostrar)}
        verExcluidos={false} onVerExcluidos={vi.fn()} recorteEventos="futuros" onRecorteEventos={vi.fn()} contagemPorRecorte={{ futuros: 4, todos: 4, realizados: 0 }}
        contagem="4 vagas" mostrarHonorario={mostrar}
      />,
    );
  }

  it("quem não lança não vê o grupo", async () => {
    const { user } = barra(false);
    await user.click(screen.getByTestId("button-filtros"));
    expect(await screen.findByTestId("flag-grupo-sit")).toBeInTheDocument();
    expect(screen.queryByTestId("flag-grupo-hon")).not.toBeInTheDocument();
  });

  it("quem lança vê as etapas com o número que a lista mostra", async () => {
    const { user } = barra(true);
    await user.click(screen.getByTestId("button-filtros"));
    const grupo = await screen.findByTestId("flag-grupo-hon");
    expect(within(grupo).getByText("Honorário")).toBeInTheDocument();
    expect(within(grupo).getByTestId("flag-n-hon:falta")).toHaveTextContent("2");
    expect(within(grupo).getByTestId("flag-n-hon:rascunho")).toHaveTextContent("1");
    expect(within(grupo).getByTestId("flag-n-hon:aguardando")).toHaveTextContent("0");
    expect(within(grupo).getByTestId("flag-n-hon:aprovado")).toHaveTextContent("1");
    expect(within(grupo).getByTestId("flag-n-hon:meus")).toHaveTextContent("1");
    // O número é o mesmo da lista filtrada.
    expect(vagas.filter(fazTesteDeFlags({ "hon:falta": true }, ctx(true))).length).toBe(2);
  });
});
