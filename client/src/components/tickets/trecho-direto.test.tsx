/**
 * Trecho direto e sinais de viagem na tela de Passagens (09/10 — caso Alonso:
 * Night Run Aracaju → Makai João Pessoa).
 */
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { passagemFake, vagaFake } from "@/test/fixtures-dominio";
import TicketRow, { type TicketRowProps } from "./ticket-row";
import { BloqueioDeViagemAviso, SegueDiretoAviso, TrechoDiretoCampo } from "./trecho-direto-campo";
import { passaNoRecorteDeConflito, recorteDaUrl, type SinalDeViagem } from "./use-sinais-de-viagem";

const ARACAJU = { inclusionId: "v4045", numero: 4045, eventId: "ev-aju", eventName: "Night Run Aracaju", cidade: "Aracaju" };

function linha(extras: Partial<TicketRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onOpen: vi.fn(), onTrechoDireto: vi.fn() };
  const inclusion = vagaFake({ id: "v4238", inclusionNumber: 4238, needsTicket: true, status: "escalado" });
  const { user } = renderComTudo(
    <table><tbody>
      <TicketRow
        inclusion={inclusion} ticket={undefined} rowIdx={0}
        eventName="Makai João Pessoa" functionName="Produção" collaboratorName="ALONSO FERREIRA" eventLocation="Praia de Tambaú, João Pessoa - PB"
        hasPendingSwap={false} hasApprovedSwap={false} selected={false} canEdit
        {...acoes} {...extras}
      />
    </tbody></table>,
  );
  return { ...acoes, user, inclusion, row: screen.getByRole("row") };
}

describe("linha de Passagens — sinais de viagem", () => {
  it("vaga sem passagem: sugere ir direto da vaga anterior e o botão abre o modal já encadeado", async () => {
    const sinal: SinalDeViagem = { podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: false } };
    const { onTrechoDireto, onOpen, inclusion, user } = linha({ sinal });
    const caixa = screen.getByTestId("sugestao-trecho-direto-v4238");
    expect(caixa).toHaveTextContent("Pode ir direto de Aracaju");
    expect(caixa).toHaveTextContent("(Night Run Aracaju termina 25/10)");
    await user.click(screen.getByTestId("registrar-trecho-direto-v4238"));
    expect(onTrechoDireto).toHaveBeenCalledWith(inclusion, "v4045");
    // O botão não abre a linha por baixo (o modal já sai encadeado).
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("sem permissão de registrar, a sugestão aparece sem o botão", () => {
    linha({ sinal: { podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: true } }, canEdit: false });
    expect(screen.getByTestId("sugestao-trecho-direto-v4238")).toHaveTextContent("indicado pela logística");
    expect(screen.queryByTestId("registrar-trecho-direto-v4238")).toBeNull();
  });

  it("viagem que cruza outra e data impossível viram sinais vermelhos na linha", () => {
    const { row } = linha({
      ticket: passagemFake({ teamInclusionId: "v4238" }),
      sinal: { cruzaCom: [{ ...ARACAJU, nivel: "bloqueia" }], dataImpossivel: "Data da volta antes da ida" },
    });
    expect(within(row).getByTestId("ticket-cruza-v4238")).toHaveTextContent("Viagem cruza com #4045");
    expect(within(row).getByTestId("ticket-data-impossivel-v4238")).toHaveTextContent("Data da volta antes da ida");
  });

  it("trecho direto confirmado: a ida diz de onde vem", () => {
    linha({ ticket: passagemFake({ teamInclusionId: "v4238" }), sinal: { vemDiretoDe: { ...ARACAJU, confirmado: true } } });
    expect(screen.getByTestId("ticket-trecho-direto-v4238")).toHaveTextContent("Ida direto de #4045 · Aracaju");
  });

  it("a indicação da logística aparece na coluna de sugestão", () => {
    const inclusion = vagaFake({ id: "v4238", inclusionNumber: 4238, idaVemDoEventoId: "ev-aju" });
    linha({ inclusion, nomeDoEvento: (id) => (id === "ev-aju" ? "Night Run Aracaju" : null) });
    expect(screen.getByTestId("indicacao-logistica-v4238")).toHaveTextContent("Logística indicou: vem direto de Night Run Aracaju");
  });
});

describe("modal — \"De onde sai a ida\"", () => {
  const sinal: SinalDeViagem = {
    vizinhasAnteriores: [{ ...ARACAJU, dia: "2026-10-25" }],
    podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: true },
  };

  it("escolher \"Vem direto de outro evento\" encadeia a vaga anterior e diz de onde sai a ida", async () => {
    const onEscolher = vi.fn();
    const { rerender, user } = renderComTudo(<TrechoDiretoCampo sid="v4238" sinal={sinal} valor="" indicacao="vem direto de Night Run Aracaju" onEscolher={onEscolher} />);
    expect(screen.getByTestId("trecho-direto-indicacao-v4238")).toHaveTextContent("Logística indicou: vem direto de Night Run Aracaju");
    await user.click(screen.getByTestId("trecho-direto-opcao-direto-v4238"));
    expect(onEscolher).toHaveBeenCalledWith({ inclusionId: "v4045", cidade: "Aracaju" });
    rerender(<TrechoDiretoCampo sid="v4238" sinal={sinal} valor="v4045" onEscolher={onEscolher} />);
    expect(screen.getByTestId("trecho-direto-v4238")).toHaveTextContent("A ida sai de Aracaju. A vaga #4045 fica sem volta própria");
    await user.click(screen.getByTestId("trecho-direto-opcao-casa-v4238"));
    expect(onEscolher).toHaveBeenLastCalledWith(null);
  });

  it("sem vaga vizinha e sem indicação, o bloco não aparece", () => {
    renderComTudo(<TrechoDiretoCampo sid="x" sinal={{}} valor="" onEscolher={vi.fn()} />);
    expect(screen.queryByTestId("trecho-direto-x")).toBeNull();
  });

  it("bloqueio do servidor (409): a frase de Compras e a saída \"Registrar como trecho direto\"", async () => {
    const onEncadear = vi.fn();
    const { user } = renderComTudo(
      <BloqueioDeViagemAviso sid="v4238" onEncadear={onEncadear} bloqueio={{
        message: "Alonso já está em Aracaju até 26/10 03:50 (#4045 · Night Run Aracaju). Esta ida 25/10 21:25 cruza com essa viagem. Se Alonso vai direto de Aracaju, registre como trecho direto.",
        conflito: { inclusionId: "v4045", podeEncadear: true },
      }} />,
    );
    const aviso = screen.getByTestId("bloqueio-viagem-v4238");
    expect(aviso).toHaveAttribute("role", "alert");
    expect(aviso).toHaveTextContent("Alonso já está em Aracaju até 26/10 03:50");
    await user.click(screen.getByTestId("bloqueio-encadear-v4238"));
    expect(onEncadear).toHaveBeenCalled();
  });

  it("vaga anterior de um trecho direto confirmado: \"Volta: segue direto para\"", () => {
    renderComTudo(<SegueDiretoAviso sid="v4045" sinal={{ segueDiretoPara: { inclusionId: "v4238", numero: 4238, eventId: "ev-jpa", eventName: "Makai João Pessoa", cidade: "João Pessoa", confirmado: true } }} />);
    expect(screen.getByTestId("segue-direto-v4045")).toHaveTextContent("Volta: segue direto para #4238 · Makai João Pessoa.");
  });
});

describe("recorte ?conflito= da Pendências", () => {
  it("lê a URL e filtra pelo sinal certo", () => {
    expect(recorteDaUrl("?conflito=viagem&t=1")).toBe("viagem");
    expect(recorteDaUrl("?conflito=data")).toBe("data");
    expect(recorteDaUrl("?conflito=outra")).toBeNull();
    expect(passaNoRecorteDeConflito({ cruzaCom: [{ ...ARACAJU, nivel: "bloqueia" }] }, "viagem")).toBe(true);
    expect(passaNoRecorteDeConflito({ dataImpossivel: "x" }, "viagem")).toBe(false);
    expect(passaNoRecorteDeConflito({ dataImpossivel: "x" }, "data")).toBe(true);
    expect(passaNoRecorteDeConflito(undefined, null)).toBe(true);
  });
});
