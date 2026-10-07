/**
 * Bloco "Alterações aprovadas para você remarcar" (07/10).
 *
 * Cobre: 1 aviso (prova, vaga, o de → para, quem pediu/aprovou, comentário,
 * ações); vários avisos agrupados por prova (a mais próxima primeiro) e o
 * recolher; "Já atuei" com sucesso (POST com o que foi feito) e com 409
 * (mostra a mensagem do servidor); quem não é da logística não vê nada e
 * nem consulta; o aviso no topo do modal; o filtro por tipo (hospedagem).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import { BlocoDeAvisos, agruparPorProva } from "./bloco-de-avisos";
import { AvisoDaVaga } from "./aviso-da-vaga";
import type { AvisoDeAlteracao } from "./use-avisos-de-alteracao";

const compras = usuarioFake({ id: "compras-1", role: "purchasing", name: "Camila Duarte" });

// "Recolhido" é lembrado no navegador — cada teste começa com o bloco aberto.
beforeEach(() => { localStorage.clear(); });

let seq = 0;
function avisoFake(parcial: Partial<AvisoDeAlteracao> = {}): AvisoDeAlteracao {
  seq += 1;
  return {
    id: `aviso-${seq}`,
    teamInclusionId: `vaga-${seq}`,
    eventId: "ev-1",
    changeRequestId: `cr-${seq}`,
    mudancas: [
      { campo: "flightDepartureDate", rotulo: "Ida · data", de: "10/10/2099", para: "09/10/2099" },
      { campo: "flightDepartureSuggestedTime", rotulo: "Ida · saída sugerida", de: "07:30", para: "06:00" },
    ],
    afetaPassagem: true,
    afetaHospedagem: false,
    motivo: "Voo antecipado pela produção",
    pedidoPorNome: "Bruno Cardoso",
    comentarioDoAprovador: "Ok, pode remarcar",
    aprovadoPorNome: "Pedro Almeida",
    aprovadoEm: "2026-10-07T12:00:00.000Z",
    resolvidoEm: null,
    resolvidoPorNome: null,
    resolucao: null,
    inclusionNumber: 100 + seq,
    eventName: "Night Run Curitiba",
    eventStartDate: "2099-10-10",
    functionName: "Fotografia",
    collaboratorName: "BRUNA TEIXEIRA LOPES",
    ...parcial,
  };
}

/** GET pendentes/resolvidos e o POST de resolver, por URL. */
function roteador(pendentes: AvisoDeAlteracao[], extra: Partial<Record<string, RoteadorDeFetch>> = {}): RoteadorDeFetch {
  return (url, init) => {
    const caminho = url.split("?")[0];
    for (const [prefixo, fn] of Object.entries(extra)) if (fn && caminho.startsWith(prefixo)) return fn(url, init);
    if (caminho === "/api/avisos-de-alteracao") {
      return respostaJson(url.includes("situacao=resolvido") ? [] : pendentes);
    }
    return respostaJson([]);
  };
}

describe("BlocoDeAvisos (passagem)", () => {
  it("1 aviso: prova + data, vaga, colaborador, função, o de → para, quem pediu e aprovou, comentário e as ações", async () => {
    const aviso = avisoFake();
    mockarFetch(roteador([aviso]));
    const onAbrir = vi.fn();
    const { user } = renderComTudo(<BlocoDeAvisos tipo="passagem" onAbrir={onAbrir} />, { user: compras });

    const bloco = await screen.findByRole("region", { name: /Alterações aprovadas para você remarcar/ });
    expect(within(bloco).getByTestId("avisos-contagem")).toHaveTextContent("1");
    expect(within(bloco).getByRole("region", { name: /Night Run Curitiba, 10\/10\/2099/ })).toBeInTheDocument();

    const item = within(bloco).getByRole("article", { name: `Vaga #${aviso.inclusionNumber} · Bruna Teixeira Lopes` });
    expect(item).toHaveTextContent("Fotografia");
    expect(item).toHaveTextContent("Ida · data");
    expect(item).toHaveTextContent("10/10/2099");
    expect(item).toHaveTextContent("09/10/2099");
    expect(within(item).getByText("07:30")).toHaveClass("line-through");
    expect(within(item).getByText("06:00")).toHaveClass("font-semibold");
    expect(item).toHaveTextContent("Pedido por Bruno Cardoso: “Voo antecipado pela produção”");
    expect(item).toHaveTextContent("Aprovado por Pedro Almeida");
    expect(item).toHaveTextContent("“Ok, pode remarcar”");

    await user.click(within(item).getByRole("button", { name: "Abrir passagem" }));
    expect(onAbrir).toHaveBeenCalledWith(aviso);
    expect(within(item).getByRole("button", { name: "Já atuei" })).toBeInTheDocument();
  });

  it("vários avisos: agrupa por prova (a mais próxima primeiro), mostra o total e recolhe sem perder a contagem", async () => {
    const longe = Array.from({ length: 9 }, () => avisoFake({ eventId: "ev-2", eventName: "Maratona de Floripa", eventStartDate: "2099-12-01" }));
    const perto = Array.from({ length: 6 }, () => avisoFake({ eventId: "ev-1", eventName: "Night Run Curitiba", eventStartDate: "2099-10-10" }));
    mockarFetch(roteador([...longe, ...perto]));
    const { user } = renderComTudo(<BlocoDeAvisos tipo="passagem" onAbrir={vi.fn()} />, { user: compras });

    const bloco = await screen.findByRole("region", { name: /Alterações aprovadas/ });
    expect(within(bloco).getByTestId("avisos-contagem")).toHaveTextContent("15");
    const provas = within(bloco).getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    expect(provas[0]).toMatch(/^Night Run Curitiba/);
    expect(provas[0]).toMatch(/6 vagas$/);
    expect(provas[1]).toMatch(/^Maratona de Floripa/);
    expect(within(bloco).getAllByRole("article")).toHaveLength(15);

    // Recolhido: o detalhe some, a pendência não.
    await user.click(within(bloco).getByRole("button", { name: "Recolher as alterações" }));
    expect(within(bloco).queryAllByRole("article")).toHaveLength(0);
    expect(bloco).toHaveTextContent("15 vagas em 2 provas");
    expect(within(bloco).getByRole("button", { name: "Mostrar as alterações" })).toHaveAttribute("aria-expanded", "false");
  });

  it("'Já atuei' com sucesso: envia o que foi feito, avisa e refaz a lista (o aviso sai)", async () => {
    const aviso = avisoFake();
    let pendentes = [aviso];
    const fetchMock = mockarFetch((url, init) => {
      if (url.includes("/resolver") && init?.method === "POST") {
        pendentes = [];
        return respostaJson({ ...aviso, resolvidoEm: "2026-10-07T13:00:00Z", resolvidoPorNome: "Camila Duarte" });
      }
      return roteador(pendentes)(url, init);
    });
    const { user } = renderComTudo(<BlocoDeAvisos tipo="passagem" />, { user: compras });

    await user.click(await screen.findByRole("button", { name: "Já atuei" }));
    const popover = await screen.findByRole("dialog", { name: "Marcar como resolvida?" });
    await user.type(within(popover).getByLabelText(/O que foi feito/), "Remarcado com a LATAM");
    await user.click(within(popover).getByRole("button", { name: "Confirmar" }));

    await esperarToast("Alteração marcada como resolvida");
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).includes("/resolver") && i?.method === "POST");
    expect(String(post?.[0])).toBe(`/api/avisos-de-alteracao/${aviso.id}/resolver`);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ resolucao: "Remarcado com a LATAM" });
    await waitFor(() => expect(screen.queryByRole("region", { name: /Alterações aprovadas/ })).not.toBeInTheDocument());
  });

  it("'Já atuei' com 409: mostra a mensagem do servidor (quem resolveu antes) e refaz a lista", async () => {
    const aviso = avisoFake();
    let pendentes = [aviso];
    const fetchMock = mockarFetch((url, init) => {
      if (url.includes("/resolver") && init?.method === "POST") {
        pendentes = [];
        return respostaJson({ message: "Ana Lima já marcou este aviso como resolvido." }, 409, url);
      }
      return roteador(pendentes)(url, init);
    });
    const { user } = renderComTudo(<BlocoDeAvisos tipo="passagem" />, { user: compras });

    await user.click(await screen.findByRole("button", { name: "Já atuei" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Marcar como resolvida?" })).getByRole("button", { name: "Confirmar" }));

    await esperarToast("Este aviso já foi resolvido");
    await esperarToast("Ana Lima já marcou este aviso como resolvido.");
    await waitFor(() => expect(screen.queryByRole("region", { name: /Alterações aprovadas/ })).not.toBeInTheDocument());
    // Sem corpo extra quando nada foi escrito.
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).includes("/resolver") && i?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body ?? "{}"))).toEqual({});
  });

  it("erro que não é 409 fica dentro do popover, com o texto preservado para tentar de novo", async () => {
    const aviso = avisoFake();
    mockarFetch((url, init) => {
      if (url.includes("/resolver") && init?.method === "POST") return respostaJson({ message: "Erro ao gravar" }, 500, url);
      return roteador([aviso])(url, init);
    });
    const { user } = renderComTudo(<BlocoDeAvisos tipo="passagem" />, { user: compras });
    await user.click(await screen.findByRole("button", { name: "Já atuei" }));
    const popover = await screen.findByRole("dialog", { name: "Marcar como resolvida?" });
    await user.type(within(popover).getByLabelText(/O que foi feito/), "Tentei remarcar");
    await user.click(within(popover).getByRole("button", { name: "Confirmar" }));
    expect(await within(popover).findByRole("alert")).toHaveTextContent("Erro ao gravar");
    expect(within(popover).getByLabelText(/O que foi feito/)).toHaveValue("Tentei remarcar");
  });

  it("sem permissão (fora da logística): nada aparece e a consulta nem sai", async () => {
    const fetchMock = mockarFetch(roteador([avisoFake()]));
    renderComTudo(<BlocoDeAvisos tipo="passagem" />, { user: usuarioFake({ role: "function_area" }) });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("region", { name: /Alterações aprovadas/ })).not.toBeInTheDocument();
    expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/avisos-de-alteracao"))).toBe(false);
  });

  it("403 inesperado some em silêncio (sem bloco e sem erro)", async () => {
    mockarFetch((url) => (url.startsWith("/api/avisos-de-alteracao") ? respostaJson({ message: "Sem permissão" }, 403, url) : respostaJson([])));
    renderComTudo(<BlocoDeAvisos tipo="passagem" />, { user: compras });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("region", { name: /Alterações aprovadas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("filtro por tipo: a Hospedagem só vê os que afetam a hospedagem", async () => {
    mockarFetch(roteador([
      avisoFake({ afetaPassagem: true, afetaHospedagem: false }),
      avisoFake({ afetaPassagem: false, afetaHospedagem: true, collaboratorName: "Caio Nunes" }),
    ]));
    renderComTudo(<BlocoDeAvisos tipo="hospedagem" />, { user: compras });
    const bloco = await screen.findByRole("region", { name: /Alterações aprovadas para rever a hospedagem/ });
    expect(within(bloco).getAllByRole("article")).toHaveLength(1);
    expect(bloco).toHaveTextContent("Caio Nunes");
  });
});

describe("AvisoDaVaga (topo do modal)", () => {
  it("mostra o de → para da vaga e o 'Já atuei'; outra vaga não mostra nada", async () => {
    const aviso = avisoFake({ teamInclusionId: "vaga-x" });
    mockarFetch(roteador([aviso]));
    const { unmount } = renderComTudo(<AvisoDaVaga tipo="passagem" teamInclusionId="vaga-x" />, { user: compras });
    const regiao = await screen.findByRole("region", { name: "Alteração aprovada para remarcar" });
    expect(regiao).toHaveTextContent("Alteração aprovada depois do registro — confira a passagem");
    expect(regiao).toHaveTextContent("Ida · saída sugerida");
    expect(within(regiao).getByRole("button", { name: "Já atuei" })).toBeInTheDocument();
    unmount();

    mockarFetch(roteador([aviso]));
    renderComTudo(<AvisoDaVaga tipo="passagem" teamInclusionId="outra-vaga" />, { user: compras });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("region", { name: "Alteração aprovada para remarcar" })).not.toBeInTheDocument();
  });
});

describe("agruparPorProva", () => {
  it("prova sem data vai para o fim", () => {
    const g = agruparPorProva([
      avisoFake({ eventId: "a", eventName: "Sem data", eventStartDate: null }),
      avisoFake({ eventId: "b", eventName: "Com data", eventStartDate: "2099-01-01" }),
    ]);
    expect(g.map((x) => x.nome)).toEqual(["Com data", "Sem data"]);
  });
});
