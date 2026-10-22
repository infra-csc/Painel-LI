// 22/10 — Blue Run Campinas (#4705, #4706, #4707, #4711, #4724): "eu cliquei
// para ir de van, quando fechou mudou para aéreo". O carimbo criava passagens
// aéreas em branco; o modo Carro/van tinha dois botões azuis na tela.
import { describe, it, expect, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import { tickets, type Ticket } from "@shared/schema";
import { MOTIVO_JA_TERRESTRE, MOTIVO_VAI_DE_TERRESTRE } from "@shared/carimbo-sem-passagem";
import { getMissingRequiredFields, ticketToFormValues } from "@/lib/ticket-form";
import TicketRow, { type TicketRowProps } from "./ticket-row";
import { AvisoSoCarimbo, TEXTO_SO_CARIMBO } from "./aviso-so-carimbo";
import { PuladosDaEmissao } from "./pulados-da-emissao";
import { BarraDeSelecao } from "./barra-de-selecao";
import QuickBatchPanel from "./quick-batch-panel";
import TerrestreLote from "./terrestre-lote";
import type { FormFieldHelpers, TicketFormHandlers } from "./types";

/** A linha exatamente como o carimbo cria: todas as colunas nulas, só o carimbo. */
function passagemSoComCarimbo(): Ticket {
  const agora = new Date("2026-10-22T22:18:00Z");
  const linha = Object.fromEntries(Object.keys(getTableColumns(tickets)).map((c) => [c, null])) as unknown as Ticket;
  return { ...linha, id: "t-4724", teamInclusionId: "vaga-1", emittedAt: agora, emittedBy: "u-compras", createdAt: agora, updatedAt: agora, updatedBy: "u-compras" };
}

const vaga4724 = () => vagaFake({ id: "vaga-1", inclusionNumber: 4724, needsTicket: true, flightReturnSuggestedTime: "14h carro" });

function linha(extras: Partial<TicketRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onOpen: vi.fn(), onToggleEmitida: vi.fn(), onTerrestre: vi.fn() };
  const props: TicketRowProps = {
    inclusion: vaga4724(), ticket: passagemSoComCarimbo(), rowIdx: 0,
    eventName: "Blue Run - Campinas", functionName: "Kit", collaboratorName: "MARINA SOUZA", eventLocation: "Campinas - SP",
    hasPendingSwap: false, hasApprovedSwap: false, selected: false, canEdit: true,
    ...acoes, ...extras,
  };
  renderComTudo(<table><tbody><TicketRow {...props} /></tbody></table>);
  return { ...acoes, tr: screen.getByRole("row") };
}

describe("Linha com a passagem que é só o carimbo", () => {
  it("diz 'Marcada como emitida · sem dados' — nada de 'Comprada' nem 'Aéreo'", () => {
    const { tr } = linha();
    expect(screen.getByTestId("ticket-so-carimbo-vaga-1")).toHaveTextContent("Marcada como emitida · sem dados");
    expect(tr).not.toHaveTextContent("Comprada");
    expect(tr).not.toHaveTextContent("Aéreo");
    expect(screen.getByTestId("ticket-situacao-so-carimbo-vaga-1")).toHaveTextContent("Sem dados");
  });

  it("oferece o 'Vai de carro' da Sugestão e o desfazer do carimbo", async () => {
    const { onTerrestre, onToggleEmitida } = linha();
    await userEvent.click(screen.getByTestId("atalho-terrestre-vaga-1"));
    expect(onTerrestre).toHaveBeenCalledWith(expect.objectContaining({ id: "vaga-1" }), "carro");
    await userEvent.click(screen.getByRole("button", { name: "Desfazer emissão da passagem" }));
    expect(onToggleEmitida).toHaveBeenCalledWith(expect.objectContaining({ id: "vaga-1" }), false);
  });
});

describe("Aviso do modal: passagem só com o carimbo", () => {
  it("texto claro e as duas saídas", async () => {
    const onTerrestre = vi.fn();
    const onDesfazer = vi.fn();
    renderComTudo(<AvisoSoCarimbo sid="vaga-1" onTerrestre={onTerrestre} onDesfazer={onDesfazer} />);
    expect(screen.getByTestId("aviso-so-carimbo-vaga-1")).toHaveTextContent(TEXTO_SO_CARIMBO);
    expect(TEXTO_SO_CARIMBO).toBe("Esta passagem foi só marcada como emitida — nenhum dado foi preenchido");
    await userEvent.click(screen.getByRole("button", { name: "Vai de carro/van em vez de avião?" }));
    expect(onTerrestre).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Desfazer emissão" }));
    expect(onDesfazer).toHaveBeenCalled();
  });

  it("sem permissão: só o aviso, sem botões", () => {
    renderComTudo(<AvisoSoCarimbo sid="vaga-1" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("editar a linha só do carimbo: a Modalidade abre por escolher (não 'Aérea') e o valor vazio (não 0)", () => {
    const form = ticketToFormValues(passagemSoComCarimbo());
    expect(form.transportType).toBe("");
    expect(form.value).toBe("");
    expect(form.isOneWay).toBe(false);
    // Registrar sem escolher pede a modalidade — nada vira "Aérea" calado.
    expect(getMissingRequiredFields(form).map((f) => f.label)[0]).toBe("Modalidade");
    // Passagem antiga de verdade sem tipo continua abrindo como Aérea.
    expect(ticketToFormValues({ ...passagemSoComCarimbo(), purchaseOrderNumber: "AX782Q" }).transportType).toBe("aereo");
  });
});

describe("Aviso das vagas puladas pelo carimbo", () => {
  const pulados = [
    { id: "a", motivo: MOTIVO_VAI_DE_TERRESTRE, tipo: "terrestre" as const, pernas: ["volta" as const] },
    { id: "b", motivo: MOTIVO_VAI_DE_TERRESTRE, tipo: "terrestre" as const, pernas: ["ida" as const, "volta" as const] },
    { id: "c", motivo: MOTIVO_JA_TERRESTRE, tipo: "ja_terrestre" as const, pernas: [] },
  ];

  it("lista cada vaga com o motivo e o atalho leva só as que faltam registrar", async () => {
    const onRegistrar = vi.fn();
    renderComTudo(<PuladosDaEmissao pulados={pulados} nomeDaVaga={(id) => `#${id.toUpperCase()}`} onRegistrar={onRegistrar} onFechar={vi.fn()} />);
    expect(screen.getByTestId("pulados-da-emissao")).toHaveTextContent("3 vagas não foram marcadas como emitidas");
    expect(screen.getByTestId("pulado-a")).toHaveTextContent("#A · vai de carro/van — registre em 'Vai de carro/van'");
    expect(screen.getByTestId("pulado-c")).toHaveTextContent("já registrada como carro/van");
    await userEvent.click(screen.getByTestId("pulados-registrar-terrestre"));
    expect(screen.getByTestId("pulados-registrar-terrestre")).toHaveTextContent("Vai de carro/van (2)");
    expect(onRegistrar).toHaveBeenCalledWith([pulados[0], pulados[1]]);
  });

  it("só 'já registrada': sem atalho", () => {
    renderComTudo(<PuladosDaEmissao pulados={[pulados[2]]} nomeDaVaga={() => null} onRegistrar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.queryByTestId("pulados-registrar-terrestre")).not.toBeInTheDocument();
  });
});

describe("Barra de seleção com o painel de carro/van aberto", () => {
  const base = {
    nSel: 5, onLimpar: vi.fn(), podeEmitir: true, onMarcarEmitidas: vi.fn(), emitindo: false, canEdit: true,
    onTerrestre: vi.fn(), onRegistrarTerrestre: vi.fn(),
  };

  it("fechado: 'Marcar como emitida (5)' é o botão principal, como sempre", () => {
    renderComTudo(<BarraDeSelecao {...base} loteTerrestreAberto={false} />);
    expect(screen.getByTestId("marcar-emitidas-lote")).toHaveTextContent("Marcar como emitida (5)");
    expect(screen.getByTestId("terrestre-selecao")).toBeInTheDocument();
  });

  it("aberto no Carro/van: o carimbo some e o botão principal registra o carro/van", async () => {
    const onRegistrarTerrestre = vi.fn();
    renderComTudo(<BarraDeSelecao {...base} onRegistrarTerrestre={onRegistrarTerrestre} loteTerrestreAberto />);
    expect(screen.queryByTestId("marcar-emitidas-lote")).not.toBeInTheDocument();
    expect(screen.queryByText(/Marcar como emitida/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("terrestre-selecao")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Registrar carro/van em 5 vagas" }));
    expect(onRegistrarTerrestre).toHaveBeenCalled();
  });
});

function painel(extras: { onToggle?: () => void; onFieldChange?: TicketFormHandlers["onFieldChange"] } = {}) {
  const onToggle = extras.onToggle ?? vi.fn();
  const handlers = { onFieldChange: extras.onFieldChange ?? vi.fn(), onPatch: vi.fn() } as unknown as TicketFormHandlers;
  renderComTudo(
    <QuickBatchPanel
      expanded onToggle={onToggle} quick={{ transportType: "terrestre" }}
      helpers={{} as FormFieldHelpers} handlers={handlers} filteredEvent={undefined}
      selectedCount={5} canEdit isPending={false} onClear={vi.fn()} onApply={vi.fn()}
      vagasSelecionadas={Array.from({ length: 5 }, (_, i) => vagaFake({ id: `v${i}`, inclusionNumber: 4705 + i }))}
    />,
  );
  return { onToggle, handlers };
}

describe("Painel no modo Carro/van: não perde o que foi digitado", () => {
  it("fechar com van preenchida pergunta 'Descartar o carro/van preenchido?'; voltar mantém tudo", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    const { onToggle } = painel();
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-van"));
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "1.200,00");
    await userEvent.click(screen.getByRole("button", { name: "Fechar o painel de lote" }));
    expect(await screen.findByText("Descartar o carro/van preenchido?")).toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Voltar ao carro/van" }));
    await waitFor(() => expect(screen.queryByText("Descartar o carro/van preenchido?")).not.toBeInTheDocument());
    expect(screen.getByTestId("lote-terrestre-valor")).toHaveValue("1.200,00");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("descartar fecha o painel", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    const { onToggle } = painel();
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-carro"));
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "300");
    await userEvent.click(screen.getByRole("button", { name: "Fechar o painel de lote" }));
    await userEvent.click(await screen.findByTestId("lote-terrestre-descartar"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("trocar para 'Aérea' com dados também pergunta; não volta sozinho", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    const { handlers } = painel();
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-van"));
    await userEvent.click(screen.getByRole("radio", { name: "Aérea" }));
    expect(await screen.findByText("Descartar o carro/van preenchido?")).toBeInTheDocument();
    expect(handlers.onFieldChange).not.toHaveBeenCalled();
  });

  it("sem nada digitado: fecha direto", async () => {
    const { onToggle } = painel();
    await userEvent.click(screen.getByRole("button", { name: "Fechar o painel de lote" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Descartar o carro/van preenchido?")).not.toBeInTheDocument();
  });
});

describe("Depois de registrar o carro/van em lote", () => {
  it("avisa a página que gravou todas (ela fecha o painel e tira as vagas da seleção)", async () => {
    mockarFetch((url) => respostaJson({ gravados: 4, vagas: 2, falhas: [], statusPorVaga: {} }, 200, url));
    const onConcluido = vi.fn();
    renderComTudo(<TerrestreLote vagas={[vagaFake({ id: "a", inclusionNumber: 1 }), vagaFake({ id: "b", inclusionNumber: 2 })]} nomeDaVaga={(v) => `#${v.inclusionNumber}`} canEdit onConcluido={onConcluido} />);
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-van"));
    await userEvent.type(screen.getByLabelText(/Empresa/i), "Transluz");
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "600");
    await userEvent.click(screen.getByTestId("lote-terrestre-aplicar"));
    await userEvent.click(await screen.findByTestId("lote-terrestre-confirmar"));
    await waitFor(() => expect(onConcluido).toHaveBeenCalledWith(["a", "b"], { todas: true }));
  });

  it("com falha numa vaga: avisa que não foram todas (o painel fica com a que sobrou)", async () => {
    mockarFetch((url) => respostaJson({ gravados: 2, vagas: 1, falhas: [{ teamInclusionId: "b", numero: 2, mensagem: "a escalação está cancelada" }], statusPorVaga: {} }, 200, url));
    const onConcluido = vi.fn();
    renderComTudo(<TerrestreLote vagas={[vagaFake({ id: "a", inclusionNumber: 1 }), vagaFake({ id: "b", inclusionNumber: 2 })]} nomeDaVaga={(v) => `#${v.inclusionNumber}`} canEdit onConcluido={onConcluido} />);
    await userEvent.click(screen.getByTestId("lote-terrestre-modo-carro"));
    await userEvent.type(screen.getByTestId("lote-terrestre-valor"), "300");
    await userEvent.click(screen.getByTestId("lote-terrestre-aplicar"));
    await userEvent.click(await screen.findByTestId("lote-terrestre-confirmar"));
    await waitFor(() => expect(onConcluido).toHaveBeenCalledWith(["a"], { todas: false }));
  });
});
