/**
 * "Sai de" na Logística sugerida (09/10 — dono: "ter a opção de colocar só ida
 * e de onde sai o colaborador"): o campo da Escalação, opcional, no painel da
 * Sugestão e no pedido de ajuste da Validação.
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { eventoFake, sugestaoFake } from "@/test/fixtures-dominio";
import { SAI_DE_SP } from "@shared/swap-sai-de";
import { LogisticsPanel } from "./logistics-panel";
import { AdjustRequestDialog } from "./adjust-request-dialog";
import { emptyGridRow, type SuggestionGridRow } from "./grid-utils/grid-rows";

function Painel({ inicial, onChange }: { inicial: SuggestionGridRow; onChange: (r: SuggestionGridRow) => void }) {
  const [row, setRow] = useState(inicial);
  return (
    <LogisticsPanel row={row} eventos={[{ id: "ev-bh", name: "Carreta BH" }]}
      onChangeRow={(_, p) => setRow((r) => { const n = { ...r, ...p }; onChange(n); return n; })} />
  );
}

function montarPainel(extras: Partial<SuggestionGridRow> = {}) {
  const onChange = vi.fn();
  const utils = renderComTudo(<Painel inicial={{ ...emptyGridRow("f1", "Kit", ["2026-10-24"], "r1"), ...extras }} onChange={onChange} />);
  const ultima = () => onChange.mock.calls.at(-1)?.[0] as SuggestionGridRow | undefined;
  return { ...utils, ultima };
}

describe("Logística sugerida — Sai de", () => {
  it("começa em 'A definir'; 'Outra cidade' abre a caixa e grava o que se digita", async () => {
    const { user, ultima } = montarPainel();
    expect(screen.getByTestId("sug-sai-de-definir")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("sug-sai-de-cidade")).toBeNull();
    await user.click(screen.getByTestId("sug-sai-de-outra"));
    await user.type(screen.getByRole("textbox", { name: /Cidade de onde a equipe sai — Kit/ }), "Rio de Janeiro - RJ");
    expect(ultima()?.city).toBe("Rio de Janeiro - RJ");
    expect(screen.getByText(/a Escalação pode trocar por pessoa/)).toBeInTheDocument();
  });

  it("São Paulo grava o mesmo texto da Escalação; 'A definir' apaga", async () => {
    const { user, ultima } = montarPainel();
    await user.click(screen.getByTestId("sug-sai-de-sp"));
    expect(ultima()?.city).toBe(SAI_DE_SP);
    await user.click(screen.getByTestId("sug-sai-de-definir"));
    expect(ultima()?.city).toBe("");
  });

  it("cidade de 1 letra: o erro aparece ao sair do campo", async () => {
    const { user } = montarPainel();
    await user.click(screen.getByTestId("sug-sai-de-outra"));
    const caixa = screen.getByTestId("sug-sai-de-cidade");
    await user.type(caixa, "R");
    expect(caixa).not.toHaveAttribute("aria-invalid");
    await user.tab();
    expect(caixa).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/muito curta/)).toBeInTheDocument();
  });

  it("linha que já vem com cidade abre em 'Outra cidade', preenchida", () => {
    montarPainel({ city: "Belo Horizonte - MG" });
    expect(screen.getByTestId("sug-sai-de-outra")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("sug-sai-de-cidade")).toHaveValue("Belo Horizonte - MG");
  });

  it("ida que vem direto de outro evento: o campo some", () => {
    montarPainel({ city: "Belo Horizonte - MG", idaVemDoEventoId: "ev-bh" });
    expect(screen.queryByTestId("sug-sai-de")).toBeNull();
  });
});

describe("Pedido de ajuste — Sai de no de/para", () => {
  it("trocar a cidade entra no pedido como 'city'", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ id: "p1" }, 201, url));
    const { user } = renderComTudo(
      <AdjustRequestDialog open onOpenChange={vi.fn()} functionName="kit local"
        inclusion={sugestaoFake({ id: "vaga-1", inclusionNumber: 4643, workDays: ["2026-04-10"], city: "São Paulo - SP" })}
        event={eventoFake({ startDate: "2026-04-09", endDate: "2026-04-13" })} />,
    );
    expect(screen.getByTestId("adj-sai-de-sp")).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByTestId("adj-sai-de-outra"));
    await user.type(screen.getByTestId("adj-sai-de-cidade"), "Salvador - BA");
    await user.click(screen.getByLabelText(/Motivo/)); await user.paste("A equipe é de Salvador");
    await user.click(screen.getByTestId("button-enviar-ajuste"));
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post).toBeTruthy();
    const corpo = JSON.parse(String((post![1] as RequestInit).body));
    const proposto = typeof corpo.proposedChanges === "string" ? JSON.parse(corpo.proposedChanges) : corpo.proposedChanges;
    expect(proposto).toMatchObject({ v: 1, city: "Salvador - BA" });
  });
});
