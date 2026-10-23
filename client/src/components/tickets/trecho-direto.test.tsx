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
import { aeroportoComumDoTrechoDireto, ondeFicaOEventoAnterior } from "./regiao-do-trecho-direto";

const ARACAJU = { inclusionId: "v4045", numero: 4045, eventId: "ev-aju", eventName: "Night Run Aracaju", cidade: "Aracaju" };

function linha(extras: Partial<TicketRowProps> = {}) {
  return { ...renderLinhaSolta(extras), row: screen.getByRole("row") };
}

function renderLinhaSolta(extras: Partial<TicketRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onOpen: vi.fn(), onTrechoDireto: vi.fn() };
  const inclusion = extras.inclusion ?? vagaFake({ id: "v4238", inclusionNumber: 4238, needsTicket: true, status: "escalado" });
  const { user, unmount } = renderComTudo(
    <table><tbody>
      <TicketRow
        inclusion={inclusion} ticket={undefined} rowIdx={0}
        eventName="Makai João Pessoa" functionName="Produção" collaboratorName="ALONSO FERREIRA" eventLocation="Praia de Tambaú, João Pessoa - PB"
        hasPendingSwap={false} hasApprovedSwap={false} selected={false} canEdit
        {...acoes} {...extras}
      />
    </tbody></table>,
  );
  return { ...acoes, user, unmount, inclusion };
}

describe("linha de Passagens — sinais de viagem", () => {
  it("vaga sem passagem: sugere ir direto da vaga anterior e o botão abre o modal já encadeado", async () => {
    const sinal: SinalDeViagem = { podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: false } };
    const { onTrechoDireto, onOpen, inclusion, user } = linha({ sinal });
    const caixa = screen.getByTestId("sugestao-trecho-direto-v4238");
    expect(caixa).toHaveTextContent("Vem direto de Aracaju");
    expect(caixa).toHaveTextContent("Evento anterior termina 25/10");
    // O nome inteiro do evento fica no title e para o leitor de tela.
    expect(caixa).toHaveAttribute("title", expect.stringContaining("Night Run Aracaju"));
    await user.click(screen.getByTestId("trecho-direto-registrar-v4238"));
    expect(onTrechoDireto).toHaveBeenCalledWith(inclusion, "v4045");
    // O botão não abre a linha por baixo (o modal já sai encadeado).
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("sem permissão de registrar, a sugestão aparece sem o botão", () => {
    linha({ sinal: { podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: true } }, canEdit: false });
    expect(screen.getByTestId("sugestao-trecho-direto-v4238")).toHaveTextContent("indicado pela logística");
    expect(screen.queryByTestId("trecho-direto-registrar-v4238")).toBeNull();
    // Sem nenhuma ação, nada de grupo de botões vazio no cartão.
    expect(screen.queryByTestId("acoes-trecho-direto-v4238")).toBeNull();
  });

  it("viagem que cruza outra e data impossível viram sinais vermelhos na linha", () => {
    const { row } = linha({
      ticket: passagemFake({ teamInclusionId: "v4238" }),
      sinal: { cruzaCom: [{ ...ARACAJU, nivel: "bloqueia" }], dataImpossivel: "Data da volta antes da ida" },
    });
    expect(within(row).getByTestId("ticket-cruza-v4238")).toHaveTextContent("Viagem cruza com #4045");
    expect(within(row).getByTestId("ticket-data-impossivel-v4238")).toHaveTextContent("Data da volta antes da ida");
  });

  it("data suspeita (16/10, caso #2446): aviso âmbar no lugar do cruzamento falso, com o atalho para corrigir", async () => {
    const onCorrigirPassagem = vi.fn();
    const sinal: SinalDeViagem = {
      datasSuspeitas: [{
        trecho: "volta", dia: "2027-07-27", provavel: "2026-07-27",
        texto: "Data da volta suspeita: 27/07/2027, o evento terminou em 26/07/2026",
        detalhe: "A volta está a mais de 7 dias do período do evento: provavelmente erro de digitação no ano — o certo deve ser 27/07/2026.",
      }],
    };
    const { row, inclusion, onOpen, user } = linha({ ticket: passagemFake({ teamInclusionId: "v4238" }), sinal, onCorrigirPassagem });
    const selo = within(row).getByTestId("ticket-data-suspeita-volta-v4238");
    expect(selo).toHaveTextContent("Data da volta suspeita: 27/07/2027, o evento terminou em 26/07/2026");
    expect(selo).toHaveAttribute("title", expect.stringMatching(/erro de digitação/));
    expect(within(row).queryByTestId("ticket-cruza-v4238")).toBeNull();
    await user.click(within(row).getByTestId("corrigir-data-suspeita-v4238"));
    expect(onCorrigirPassagem).toHaveBeenCalledWith(inclusion);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("data suspeita sem permissão de editar: o aviso fica, o atalho não", () => {
    const sinal: SinalDeViagem = { datasSuspeitas: [{ trecho: "ida", dia: "2025-07-22", provavel: "2026-07-22", texto: "Data da ida suspeita: 22/07/2025, o evento começou em 25/07/2026", detalhe: "x" }] };
    linha({ ticket: passagemFake({ teamInclusionId: "v4238" }), sinal, canEdit: false, onCorrigirPassagem: vi.fn() });
    expect(screen.getByTestId("ticket-data-suspeita-ida-v4238")).toBeInTheDocument();
    expect(screen.queryByTestId("corrigir-data-suspeita-v4238")).toBeNull();
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

// 23/10 (print do dono, Viva Esporte Serra #5183–#5193): a vaga anterior é de
// Vila Velha, na mesma região (VIX) — o trecho direto é por terra.
const VILA_VELHA = { inclusionId: "v5100", numero: 5100, eventId: "ev-vv", eventName: "Viva Esporte - 2026 - Vila Velha", cidade: "Fundão" };

describe("cartão do trecho direto — ação certa para o caso (23/10)", () => {
  const serra = { eventName: "Viva Esporte - 2026 - Serra", eventLocation: "Praça do Papa, Serra - ES" };

  it("mesma região: \"Vai de carro/van\" na ida é a principal, sem \"Buscar preços\" e sem o atalho duplicado", async () => {
    const onTerrestre = vi.fn();
    const onBuscarTrechoDireto = vi.fn();
    const sinal: SinalDeViagem = { podeIrDiretoDe: { ...VILA_VELHA, dia: "2026-11-01", indicadoPelaLogistica: true } };
    const { inclusion, user, onTrechoDireto, onOpen } = linha({ ...serra, sinal, onTerrestre, onBuscarTrechoDireto });
    const caixa = screen.getByTestId("sugestao-trecho-direto-v4238");
    expect(caixa).toHaveTextContent("Vem direto de Vila Velha");
    expect(caixa).toHaveTextContent("Evento anterior termina 01/11 · indicado pela logística");
    expect(screen.getByTestId("trecho-direto-mesma-regiao-v4238")).toHaveTextContent("Mesma região — sem voo");
    // Nome inteiro do evento só no title/leitor de tela — não repetido no texto visível.
    expect(caixa).toHaveAttribute("title", expect.stringContaining("Viva Esporte - 2026 - Vila Velha · Fundão"));
    // Um lugar só para o carro/van: o atalho de cima some.
    expect(screen.queryByTestId("atalho-terrestre-v4238")).toBeNull();

    await user.click(screen.getByTestId("trecho-direto-terrestre-v4238"));
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, undefined, ["ida"]);
    expect(onOpen).not.toHaveBeenCalled();

    // No "…": registrar o trecho direto (passagem), nunca buscar voo.
    await user.click(screen.getByTestId("trecho-direto-mais-v4238"));
    const itens = await screen.findAllByRole("menuitem");
    expect(itens.map((i) => i.textContent)).toEqual(["Registrar trecho direto"]);
    expect(screen.queryByText(/Buscar preços/)).toBeNull();
    await user.click(itens[0]);
    expect(onTrechoDireto).toHaveBeenCalledWith(inclusion, "v5100");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onBuscarTrechoDireto).not.toHaveBeenCalled();
  });

  it("regiões diferentes: \"Registrar trecho direto\" principal; \"Buscar preços\" e carro/van no \"…\"", async () => {
    const onTerrestre = vi.fn();
    const onBuscarTrechoDireto = vi.fn();
    const sinal: SinalDeViagem = { podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: false } };
    const { inclusion, user, onOpen } = linha({ sinal, onTerrestre, onBuscarTrechoDireto });
    expect(screen.queryByTestId("trecho-direto-mesma-regiao-v4238")).toBeNull();
    expect(screen.getByTestId("trecho-direto-registrar-v4238")).toHaveTextContent("Registrar trecho direto");
    expect(screen.queryByTestId("atalho-terrestre-v4238")).toBeNull();

    await user.click(screen.getByTestId("trecho-direto-mais-v4238"));
    const itens = await screen.findAllByRole("menuitem");
    expect(itens.map((i) => i.textContent)).toEqual(["Buscar preços do trecho direto", "Vai de carro/van"]);
    await user.click(screen.getByTestId("trecho-direto-buscar-v4238"));
    expect(onBuscarTrechoDireto).toHaveBeenCalledWith(inclusion, "v4045");
    expect(onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("trecho-direto-mais-v4238"));
    await user.click(await screen.findByTestId("trecho-direto-terrestre-v4238"));
    // A viagem da vaga, como o atalho de sempre (sem perna fixa).
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, undefined);
  });

  it("layout: no máximo uma ação principal e o \"…\", juntos no grupo — nenhum botão solto no cartão", () => {
    for (const caso of [
      { sinal: { podeIrDiretoDe: { ...VILA_VELHA, dia: "2026-11-01", indicadoPelaLogistica: true } }, ...serra },
      { sinal: { podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: false } } },
    ]) {
      const { unmount } = renderLinhaSolta({ ...caso, onTerrestre: vi.fn(), onBuscarTrechoDireto: vi.fn() });
      const caixa = screen.getByTestId("sugestao-trecho-direto-v4238");
      const grupo = within(caixa).getByTestId("acoes-trecho-direto-v4238");
      const botoes = within(caixa).getAllByRole("button");
      expect(botoes).toHaveLength(2);
      for (const b of botoes) expect(grupo).toContainElement(b);
      expect(within(grupo).getByTestId("trecho-direto-mais-v4238")).toHaveAccessibleName(/Mais ações do trecho direto/);
      unmount();
    }
  });

  it("só uma ação possível: o botão principal sozinho, sem \"…\" vazio", () => {
    // Sem carro/van (sem onTerrestre) e sem busca: sobra o registrar.
    linha({ sinal: { podeIrDiretoDe: { ...ARACAJU, dia: "2026-10-25", indicadoPelaLogistica: false } } });
    expect(screen.getByTestId("trecho-direto-registrar-v4238")).toBeInTheDocument();
    expect(screen.queryByTestId("trecho-direto-mais-v4238")).toBeNull();
  });

  it("sem a sugestão de trecho direto, o atalho \"Vai de carro/van\" continua no lugar de sempre", () => {
    linha({ onTerrestre: vi.fn() });
    expect(screen.getByTestId("atalho-terrestre-v4238")).toBeInTheDocument();
  });
});

describe("regra de região do trecho direto", () => {
  it("mesmo aeroporto principal = por terra; cidade desconhecida ou aeroportos diferentes = null", () => {
    expect(aeroportoComumDoTrechoDireto(VILA_VELHA, { location: "Praça do Papa, Serra - ES", name: "Viva Esporte - 2026 - Serra" })).toBe("VIX");
    expect(aeroportoComumDoTrechoDireto(ARACAJU, { location: "Praia de Tambaú, João Pessoa - PB", name: "Makai João Pessoa" })).toBeNull();
    expect(aeroportoComumDoTrechoDireto({ cidade: "Lugar Nenhum", eventName: "Evento X" }, { location: "Serra - ES" })).toBeNull();
  });

  it("onde fica o evento anterior: a cidade conhecida, senão a cidade do nome do evento", () => {
    expect(ondeFicaOEventoAnterior(ARACAJU)).toBe("Aracaju");
    expect(ondeFicaOEventoAnterior(VILA_VELHA)).toBe("Vila Velha");
    expect(ondeFicaOEventoAnterior({ cidade: "", eventName: "Evento sem cidade" })).toBe("Evento sem cidade");
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
