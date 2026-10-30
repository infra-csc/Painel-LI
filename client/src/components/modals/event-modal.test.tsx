/**
 * Modal de evento — Dia(s) do evento (30/10).
 *
 * Os dias reais do evento ficam logo abaixo do período (que inclui montagem e
 * desmontagem). Opcionais; a regra é a do servidor (shared/dia-da-prova.ts):
 * dentro do período, até ≥ de, só "de" = um dia.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { eventoFake } from "@/test/fixtures-dominio";
import EventModal from "./event-modal";

function api() {
  const enviados: { metodo: string; url: string; corpo: Record<string, unknown> }[] = [];
  const fetchMock = mockarFetch((url, init) => {
    const metodo = (init?.method ?? "GET").toUpperCase();
    if (metodo !== "GET") {
      const corpo = JSON.parse(String(init?.body ?? "{}"));
      enviados.push({ metodo, url, corpo });
      return respostaJson({ id: "novo", ...corpo });
    }
    return respostaJson([]);
  });
  return { fetchMock, enviados };
}

const mudar = (testId: string, valor: string) => {
  const campo = screen.getByTestId(testId);
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.blur(campo);
};

function preencherSerra() {
  mudar("input-event-name", "Viva Esporte Serra");
  mudar("input-event-location", "Serra - ES");
  mudar("input-event-start-date", "2026-11-01");
  mudar("input-event-end-date", "2026-11-08");
}

describe("Modal de evento — Dia(s) do evento", () => {
  it("mostra os campos com o texto de ajuda e cria o evento com os dias", async () => {
    const { enviados } = api();
    const { user } = renderComTudo(<EventModal open onClose={() => {}} />, { user: usuarioFake({ role: "purchasing" }), queryClient: criarQueryClientComApi() });
    expect(screen.getByTestId("dias-do-evento")).toHaveTextContent("Dia(s) do evento");
    expect(screen.getByTestId("dias-do-evento")).toHaveTextContent("o período acima inclui montagem e desmontagem");

    preencherSerra();
    mudar("input-event-dia-inicio", "2026-11-05");
    mudar("input-event-dia-fim", "2026-11-06");
    expect(await screen.findByTestId("duracao-dias-do-evento")).toHaveTextContent("2 dias de evento");
    expect(screen.getByTestId("duracao-evento")).toHaveTextContent("8 dias no período");

    await user.click(screen.getByTestId("button-save-event"));
    await waitFor(() => expect(enviados.some((e) => e.url === "/api/events" && e.metodo === "POST")).toBe(true));
    const post = enviados.find((e) => e.url === "/api/events")!;
    expect(post.corpo).toMatchObject({ startDate: "2026-11-01", endDate: "2026-11-08", diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" });
  });

  it("dia fora do período: erro no campo e nada é enviado", async () => {
    const { enviados } = api();
    const { user } = renderComTudo(<EventModal open onClose={() => {}} />, { user: usuarioFake({ role: "admin" }), queryClient: criarQueryClientComApi() });
    preencherSerra();
    mudar("input-event-dia-inicio", "2026-11-09");
    await user.click(screen.getByTestId("button-save-event"));
    expect(await screen.findByText("O dia do evento precisa estar dentro do período (início a fim).")).toBeInTheDocument();
    expect(screen.getByTestId("input-event-dia-inicio")).toHaveAttribute("aria-invalid", "true");
    expect(enviados.filter((e) => e.url === "/api/events")).toHaveLength(0);
  });

  it("até antes de de: erro no \"Até\"", async () => {
    api();
    const { user } = renderComTudo(<EventModal open onClose={() => {}} />, { user: usuarioFake({ role: "admin" }), queryClient: criarQueryClientComApi() });
    preencherSerra();
    mudar("input-event-dia-inicio", "2026-11-06");
    mudar("input-event-dia-fim", "2026-11-05");
    await user.click(screen.getByTestId("button-save-event"));
    expect(await screen.findByText("O último dia não pode ser antes do primeiro.")).toBeInTheDocument();
    expect(screen.getByTestId("input-event-dia-fim")).toHaveAttribute("aria-invalid", "true");
  });

  it("na edição, os dias gravados vêm preenchidos e com os limites do período", () => {
    api();
    const evento = eventoFake({ name: "Viva Esporte - Cariacica", startDate: "2026-12-06", endDate: "2026-12-12", diaEventoInicio: "2026-12-10", diaEventoFim: "2026-12-11" });
    renderComTudo(<EventModal open onClose={() => {}} event={evento} />, { user: usuarioFake({ role: "admin" }), queryClient: criarQueryClientComApi() });
    const de = screen.getByTestId("input-event-dia-inicio");
    expect(de).toHaveValue("2026-12-10");
    expect(screen.getByTestId("input-event-dia-fim")).toHaveValue("2026-12-11");
    expect(de).toHaveAttribute("min", "2026-12-06");
    expect(de).toHaveAttribute("max", "2026-12-12");
  });
});
