/**
 * Faixa global de simulação (08/10): "Sair da simulação" pelo apiRequest —
 * só recarrega no sucesso; no fracasso o botão volta e um toast diz o porquê.
 * A faixa mostra o nome formatado e há quanto tempo a simulação começou.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { queryClient } from "@/lib/queryClient";
import SimulationBanner, { tempoDeSimulacao } from "./simulation-banner";

const simulado = usuarioFake({ id: "u-bruno", role: "function_area", name: "BRUNO CARDOSO" });

function montar(resposta: () => Response, simulatedSince: string | null = null) {
  const posts: string[] = [];
  mockarFetch((url, init) => {
    if ((init?.method ?? "GET") === "POST") { posts.push(url); return resposta(); }
    return respostaJson({});
  });
  const limpar = vi.spyOn(queryClient, "clear").mockImplementation(() => {});
  const utils = renderComTudo(<SimulationBanner />, {
    user: simulado,
    auth: { simulation: { active: true, realUserName: "Helena Martins", simulatedSince } },
  });
  return { ...utils, posts, limpar };
}

describe("Faixa de simulação", () => {
  it("o servidor recusa: não recarrega, o botão volta e o toast diz o porquê", async () => {
    const { user, posts, limpar } = montar(() => respostaJson({ message: "Nenhuma simulação ativa." }, 400));
    await user.click(screen.getByRole("button", { name: /Sair da simulação/ }));
    await waitFor(() => expect(posts).toEqual(["/api/simulation/stop"]));
    await esperarToast("Não foi possível sair da simulação");
    await esperarToast("Nenhuma simulação ativa.");
    expect(limpar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Sair da simulação/ })).toBeEnabled();
  });

  it("sucesso: limpa o cache e recarrega", async () => {
    const { user, limpar } = montar(() => respostaJson({ active: false }));
    await user.click(screen.getByRole("button", { name: /Sair da simulação/ }));
    await waitFor(() => expect(limpar).toHaveBeenCalledTimes(1));
  });

  it("mostra o nome formatado e há quanto tempo começou", () => {
    montar(() => respostaJson({}), new Date(Date.now() - 12 * 60_000).toISOString());
    expect(screen.getByTestId("sim-faixa-nome")).toHaveTextContent("Bruno Cardoso");
    expect(screen.getByTestId("sim-faixa-desde")).toHaveTextContent("começou há 12 min");
  });

  it("tempoDeSimulacao", () => {
    const agora = Date.parse("2026-10-08T15:00:00Z");
    expect(tempoDeSimulacao(null, agora)).toBeNull();
    expect(tempoDeSimulacao("lixo", agora)).toBeNull();
    expect(tempoDeSimulacao("2026-10-08T14:59:40Z", agora)).toBe("há menos de 1 min");
    expect(tempoDeSimulacao("2026-10-08T14:01:00Z", agora)).toBe("há 59 min");
    expect(tempoDeSimulacao("2026-10-08T13:00:00Z", agora)).toBe("há 2 h");
    expect(tempoDeSimulacao("2026-10-08T13:40:00Z", agora)).toBe("há 1 h 20 min");
  });
});
