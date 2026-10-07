/**
 * Hospedagem × aviso de alteração para Compras (07/10).
 *
 * A tela inteira (página), com a API simulada: o bloco "Alterações aprovadas
 * para rever a hospedagem" só com os avisos que afetam a hospedagem, o sinal
 * na linha da vaga, "Abrir hospedagem" abrindo o registro com o aviso no topo
 * e o "Já atuei" ali mesmo; aviso de prova fora do recorte troca o filtro de
 * evento e abre a vaga quando ela chega; quem não é da logística não vê nada.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { colaboradorFake, eventoFake, funcaoFake, hospedagemFake, vagaFake } from "@/test/fixtures-dominio";
import type { AvisoDeAlteracao } from "@/components/avisos-de-alteracao/use-avisos-de-alteracao";
import type { TeamInclusion } from "@shared/schema";
import Accommodations from "@/pages/accommodations";

const compras = usuarioFake({ id: "compras-1", role: "purchasing", name: "Camila Duarte" });

// "Recolhido" do bloco é lembrado no navegador — cada teste começa aberto.
beforeEach(() => { localStorage.clear(); });

const eventoA = eventoFake({ id: "ev-a", name: "Circuito das Estações", startDate: "2099-10-09", endDate: "2099-10-11", status: "ativo" });
const eventoB = eventoFake({ id: "ev-b", name: "Night Run Porto Alegre", startDate: "2099-11-07", endDate: "2099-11-08", status: "ativo" });
const funcao = funcaoFake({ id: "funcao-1", name: "Cenotécnica" });
const colab1 = colaboradorFake({ id: "colab-1", fullName: "FABIO NUNES MOREIRA" });
const colab2 = colaboradorFake({ id: "colab-2", fullName: "Luana Cardoso" });

/** Vaga escalada, com hospedagem registrada (a que recebeu o ajuste). */
const vagaRegistrada = vagaFake({
  id: "vaga-reg", inclusionNumber: 50, eventId: "ev-a", functionId: "funcao-1", collaboratorId: "colab-1",
  needsAccommodation: true, status: "hospedagem_comprada", phase: "hospedagem",
});
/** Vaga pendente (sem hotel) da mesma prova. */
const vagaPendente = vagaFake({
  id: "vaga-pend", inclusionNumber: 51, eventId: "ev-a", functionId: "funcao-1", collaboratorId: "colab-2",
  needsAccommodation: true, status: "escalado", phase: "escalacao",
});
/** Vaga de outra prova — só chega quando o filtro aponta para ela. */
const vagaDeOutraProva = vagaFake({
  id: "vaga-b", inclusionNumber: 77, eventId: "ev-b", functionId: "funcao-1", collaboratorId: "colab-2",
  needsAccommodation: true, status: "hospedagem_comprada", phase: "hospedagem",
});

let seq = 0;
function avisoFake(parcial: Partial<AvisoDeAlteracao> = {}): AvisoDeAlteracao {
  seq += 1;
  return {
    id: `aviso-h-${seq}`,
    teamInclusionId: "vaga-reg",
    eventId: "ev-a",
    changeRequestId: `cr-${seq}`,
    mudancas: [{ campo: "flightReturnDate", rotulo: "Volta · data", de: "12/10/2099", para: "13/10/2099" }],
    afetaPassagem: false,
    afetaHospedagem: true,
    motivo: "Desmontagem estendida",
    pedidoPorNome: "Helena Martins",
    comentarioDoAprovador: "Avise o hotel da noite extra",
    aprovadoPorNome: "Pedro Almeida",
    aprovadoEm: "2026-10-07T12:00:00.000Z",
    resolvidoEm: null,
    resolvidoPorNome: null,
    resolucao: null,
    inclusionNumber: 50,
    eventName: "Circuito das Estações",
    eventStartDate: "2099-10-09",
    functionName: "Cenotécnica",
    collaboratorName: "FABIO NUNES MOREIRA",
    ...parcial,
  };
}

/** A API da tela: lista de vagas (com recorte por evento), hospedagens e avisos. */
function api(avisos: AvisoDeAlteracao[], vagasSemRecorte: TeamInclusion[] = [vagaRegistrada, vagaPendente]): RoteadorDeFetch {
  return (url) => {
    const [caminho, qs = ""] = url.split("?");
    const busca = new URLSearchParams(qs);
    switch (caminho) {
      case "/api/team-inclusions": {
        const ev = busca.get("eventId");
        const todas = [vagaRegistrada, vagaPendente, vagaDeOutraProva];
        return respostaJson(ev ? todas.filter((v) => v.eventId === ev) : vagasSemRecorte);
      }
      case "/api/events": return respostaJson([eventoA, eventoB]);
      case "/api/functions": return respostaJson([funcao]);
      case "/api/collaborators": return respostaJson([colab1, colab2]);
      case "/api/accommodations":
        return respostaJson([
          hospedagemFake({ teamInclusionId: "vaga-reg", hotelName: "Mercure Executive", hotelLocation: "Belo Horizonte - MG" }),
          hospedagemFake({ teamInclusionId: "vaga-b", hotelName: "Laghetto Moinhos", hotelLocation: "Porto Alegre - RS" }),
        ]);
      case "/api/avisos-de-alteracao":
        return respostaJson(busca.get("situacao") === "resolvido" ? [] : avisos);
      default: return respostaJson([]);
    }
  };
}

const montar = (avisos: AvisoDeAlteracao[], user = compras, vagasSemRecorte?: TeamInclusion[]) => {
  const fetchMock = mockarFetch(api(avisos, vagasSemRecorte));
  const utils = renderComTudo(<Accommodations />, { user, queryClient: criarQueryClientComApi(), rota: "/accommodations" });
  return { ...utils, fetchMock };
};

describe("Hospedagem — avisos de alteração para Compras", () => {
  it("bloco acima da lista só com os avisos que afetam a hospedagem, e o sinal na linha da vaga", async () => {
    montar([
      avisoFake(),
      // Só passagem: é de Passagens, não aparece aqui.
      avisoFake({ teamInclusionId: "vaga-pend", inclusionNumber: 51, afetaPassagem: true, afetaHospedagem: false, collaboratorName: "Luana Cardoso" }),
    ]);

    const bloco = await screen.findByRole("region", { name: /Alterações aprovadas para rever a hospedagem/ });
    expect(within(bloco).getByTestId("avisos-contagem")).toHaveTextContent("1");
    const item = within(bloco).getByRole("article", { name: "Vaga #50 · Fabio Nunes Moreira" });
    expect(item).toHaveTextContent("Volta · data");
    expect(item).toHaveTextContent("13/10/2099");
    expect(within(item).getByRole("button", { name: "Abrir hospedagem" })).toBeInTheDocument();
    expect(within(item).getByRole("button", { name: "Já atuei" })).toBeInTheDocument();
    expect(bloco).not.toHaveTextContent("Luana Cardoso");

    // O sinal na linha: só na vaga do aviso de hospedagem.
    expect(await screen.findByTestId("accommodation-alteracao-vaga-reg")).toBeInTheDocument();
    expect(screen.queryByTestId("accommodation-alteracao-vaga-pend")).not.toBeInTheDocument();
  });

  it("'Abrir hospedagem' abre o registro da vaga com o aviso no topo e o 'Já atuei' ali mesmo", async () => {
    const { user } = montar([avisoFake()]);
    const bloco = await screen.findByRole("region", { name: /Alterações aprovadas para rever a hospedagem/ });
    await user.click(within(bloco).getByRole("button", { name: "Abrir hospedagem" }));

    const modal = await screen.findByRole("dialog", { name: "Registro de hospedagem" });
    expect(modal).toHaveTextContent("#50");
    const aviso = await within(modal).findByRole("region", { name: "Alteração aprovada para remarcar" });
    expect(aviso).toHaveTextContent("Alteração aprovada depois do registro — confira a hospedagem");
    expect(aviso).toHaveTextContent("Volta · data");
    expect(within(aviso).getByRole("button", { name: "Já atuei" })).toBeInTheDocument();
    // Registrada abre no Resumo, com o hotel.
    expect(within(modal).getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
    expect(within(modal).getByTestId("resumo-hotel")).toHaveTextContent("Mercure Executive");
  });

  it("aviso de prova fora do recorte: o filtro passa para a prova do aviso e o modal abre quando a vaga chega", async () => {
    // Sem recorte, a lista não traz a vaga da outra prova (como num evento filtrado).
    const { user, fetchMock } = montar([
      avisoFake({ id: "aviso-b", teamInclusionId: "vaga-b", eventId: "ev-b", inclusionNumber: 77, eventName: "Night Run Porto Alegre", collaboratorName: "Luana Cardoso" }),
    ]);
    const bloco = await screen.findByRole("region", { name: /Alterações aprovadas para rever a hospedagem/ });
    await user.click(within(bloco).getByRole("button", { name: "Abrir hospedagem" }));

    await esperarToast("Mostrando Night Run Porto Alegre");
    const modal = await screen.findByRole("dialog", { name: "Registro de hospedagem" });
    expect(modal).toHaveTextContent("#77");
    expect(urlsChamadas(fetchMock).some((u) => u === "/api/team-inclusions?eventId=ev-b")).toBe(true);
  });

  it("sem aviso pendente não há bloco nem sinal; o histórico de resolvidas fica na barra da tela", async () => {
    montar([]);
    expect(await screen.findByTestId("accommodation-row-50")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Alterações aprovadas/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("accommodation-alteracao-vaga-reg")).not.toBeInTheDocument();
    expect(screen.getByTestId("avisos-resolvidas-barra")).toBeInTheDocument();
  });

  it("fora da logística (RH): a tela abre, mas nem bloco nem consulta de avisos", async () => {
    const { fetchMock } = montar([avisoFake()], usuarioFake({ id: "rh-1", role: "financial", name: "Rita RH" }));
    expect(await screen.findByTestId("accommodation-row-50")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: /Alterações aprovadas/ })).not.toBeInTheDocument());
    expect(screen.queryByTestId("accommodation-alteracao-vaga-reg")).not.toBeInTheDocument();
    expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/avisos-de-alteracao"))).toBe(false);
  });
});
