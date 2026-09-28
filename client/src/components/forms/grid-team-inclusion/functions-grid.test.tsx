import { useEffect, useMemo, useState } from "react";
import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Function as Funcao } from "@shared/schema";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { funcaoFake } from "@/test/fixtures-dominio";
import { useToast } from "@/hooks/use-toast";
import { gridFormSchema, type GridFormData } from "./grid-types";
import { useGridRows } from "./use-grid-rows";
import { useGridPaste } from "./use-grid-paste";
import { useGridSubmit } from "./use-grid-submit";
import { ExcelPasteDialog, FunctionSelectDialog } from "./grid-dialogs";
import { GridActions } from "./grid-preview";
import { FunctionsGrid } from "./functions-grid";

const FUNCOES: Funcao[] = [
  funcaoFake({ id: "f-prod", name: "Produção", userId: "user-9" }),
  funcaoFake({ id: "f-kit", name: "Kit", userId: "user-9" }),
];

/**
 * A grade vive dos hooks reais do formulário (linhas, colagem, envio). O
 * harness monta o formulário com evento e período já escolhidos e gera a
 * grade ao abrir — o mesmo que "Gerar grade" faz na tela.
 */
function Harness({ eventId = "evento-1" }: { eventId?: string }) {
  const { toast } = useToast();
  const [showHelp, setShowHelp] = useState(false);
  const form = useForm<GridFormData>({
    resolver: zodResolver(gridFormSchema),
    defaultValues: { eventId, startDate: "2026-04-10", endDate: "2026-04-12" },
  });
  const sortedFunctions = useMemo(() => [...FUNCOES], []);
  const grid = useGridRows({ form, functions: FUNCOES, sortedFunctions, toast });
  const paste = useGridPaste({ form, events: [], functions: FUNCOES, dates: grid.dates, setFunctionRows: grid.setFunctionRows, toast });
  const submit = useGridSubmit({ form, functionRows: grid.functionRows, dates: grid.dates, functions: FUNCOES, userId: "user-1", toast, onCreated: grid.resetGrid });
  const { buildGrid } = grid;
  useEffect(() => { buildGrid(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- gera a grade uma vez, como o botão da tela
  const selectedEventId = form.watch("eventId");
  return (
    <>
      {grid.showGrid && (
        <FunctionsGrid
          grid={grid} gridSummary={submit.gridSummary} rowsMissingFlightDate={submit.rowsMissingFlightDate}
          showHelp={showHelp} onToggleHelp={() => setShowHelp((v) => !v)}
          autoSave={false} setAutoSave={() => {}} onOpenPaste={() => paste.setShowPasteModal(true)}
        />
      )}
      <GridActions
        onSaveDraft={() => {}} onLoadDraft={() => {}} onSubmit={submit.handleSubmit}
        isProcessing={submit.isProcessing} recordsCount={submit.processedRanges.length}
        selectedEventId={selectedEventId} eventoEncerrado={false} motivoBloqueio={null} bannerMessage={null}
      />
      {/* Atalho de teste: dispara o envio mesmo com o botão da tela desabilitado, para ver o erro que ele explica. */}
      <button type="button" onClick={submit.handleSubmit}>Enviar sem checar</button>
      <FunctionSelectDialog grid={grid} functions={FUNCOES} sortedFunctions={sortedFunctions} />
      <ExcelPasteDialog paste={paste} />
    </>
  );
}

function montar(props: { eventId?: string } = {}) {
  return renderComTudo(<Harness {...props} />, { user: usuarioFake() });
}

const celula = (funcao: string, dia: string) => screen.getByRole("textbox", { name: `${funcao}, ${dia}` }) as HTMLInputElement;
const resumo = () => screen.getByText(/funç(ão|ões) ·/);
const linhaDe = (funcao: string) => screen.getByTitle(funcao).closest("tr")!;

describe("FunctionsGrid", () => {
  it("gera a grade com uma linha por função e uma coluna por dia (fim de semana marcado)", () => {
    montar();
    expect(screen.getByRole("columnheader", { name: /10\/04/ })).toHaveTextContent("Sex");
    expect(screen.getByRole("columnheader", { name: /11\/04/ })).toHaveClass("bg-warning-soft/60");
    expect(screen.getByRole("columnheader", { name: /12\/04/ })).toHaveTextContent("Dom");
    expect(linhaDe("Produção")).toBeInTheDocument();
    expect(linhaDe("Kit")).toBeInTheDocument();
    expect(resumo()).toHaveTextContent("2 funções · 0 pessoas-dia · 0 registros");
    expect(screen.getByTestId("button-save-grid")).toBeDisabled();
  });

  it("digitar nas células conta pessoas-dia e registros (uma pessoa = um registro com os dias dela)", async () => {
    const { user } = montar();
    await user.type(celula("Produção", "Sex 10/04"), "2");
    await user.type(celula("Produção", "Sáb 11/04"), "1");
    expect(resumo()).toHaveTextContent("2 funções · 3 pessoas-dia · 2 registros");
    expect(screen.getByTestId("button-save-grid")).toHaveTextContent("Criar 2 Escalação(ões)");
    expect(screen.getByTestId("button-save-grid")).toBeEnabled();
    // setas ajustam; Delete zera
    await user.keyboard("{ArrowUp}");
    expect(celula("Produção", "Sáb 11/04")).toHaveValue("2");
    await user.keyboard("{Delete}");
    expect(celula("Produção", "Sáb 11/04")).toHaveValue("");
  });

  it("colar do Excel preenche as linhas: função reconhecida, passagem marcada e quantidades por dia, na ordem colada", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Colar Excel" }));
    const dialogo = await screen.findByRole("dialog", { name: "Colar dados do Excel" });
    await user.click(within(dialogo).getByPlaceholderText("Cole os dados do Excel aqui (Ctrl+V)..."));
    await user.paste("Kit\t10/abr\t9h\t12/abr\t18h\tsim\tnão\t1\t2\t0\nProdução\t\t\t\t\t\t\t3\t3\t3");
    await user.click(within(dialogo).getByRole("button", { name: "Processar e Adicionar" }));
    await esperarToast("2 linha(s) aplicada(s)");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const linhas = screen.getAllByRole("row").slice(1); // sem o cabeçalho
    expect(linhas[0]).toHaveTextContent("Kit");
    expect(linhas[1]).toHaveTextContent("Produção");
    expect(celula("Kit", "Sex 10/04")).toHaveValue("1");
    expect(celula("Kit", "Sáb 11/04")).toHaveValue("2");
    expect(celula("Kit", "Dom 12/04")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Precisa de passagem — Kit" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Precisa de hospedagem — Kit" })).not.toBeChecked();
    expect(celula("Produção", "Dom 12/04")).toHaveValue("3");
    expect(resumo()).toHaveTextContent("2 funções · 12 pessoas-dia · 5 registros");
  });

  // DEFEITO de acessibilidade (grid-dialogs.tsx:132-138): o <Label> "Cole os
  // dados aqui:" não tem htmlFor e o Textarea não tem id — o rótulo não está
  // associado ao campo (leitor de tela anuncia só o placeholder). Os testes
  // acima usam o placeholder por isso.
  it("o campo de colagem é encontrado pelo rótulo 'Cole os dados aqui:'", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Colar Excel" }));
    const dialogo = await screen.findByRole("dialog", { name: "Colar dados do Excel" });
    expect(within(dialogo).getByLabelText("Cole os dados aqui:")).toBe(within(dialogo).getByRole("textbox"));
  });

  it("colar função que não existe no catálogo avisa e não cria linha", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Colar Excel" }));
    const dialogo = await screen.findByRole("dialog", { name: "Colar dados do Excel" });
    await user.click(within(dialogo).getByPlaceholderText("Cole os dados do Excel aqui (Ctrl+V)..."));
    await user.paste("Motorista\t\t\t\t\t\t\t1");
    await user.click(within(dialogo).getByRole("button", { name: "Processar e Adicionar" }));
    await esperarToast("Nenhuma função reconhecida: Motorista");
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // fica aberto para corrigir
    expect(resumo()).toHaveTextContent("2 funções · 0 pessoas-dia");
  });

  it("enviar sem nenhuma célula preenchida: o botão da tela fica travado e o envio explica o erro", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { user } = montar();
    expect(screen.getByTestId("button-save-grid")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Enviar sem checar" }));
    await esperarToast("Nenhuma escalação na grade");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem evento (campo obrigatório do formulário) o envio é barrado antes da API", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { user } = montar({ eventId: "" });
    await user.type(celula("Produção", "Sex 10/04"), "1");
    expect(screen.getByTestId("button-save-grid")).toBeDisabled();
    expect(screen.getByTestId("button-save-grid")).toHaveTextContent("Selecione o evento para criar");
    await user.click(screen.getByRole("button", { name: "Enviar sem checar" }));
    await esperarToast("Selecione o evento");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passagem marcada sem data de voo: aviso na grade e ícone na linha", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Precisa de passagem — Kit" }));
    // Toasts de testes anteriores (store global do use-toast) também são role=status — procura o aviso da grade.
    const aviso = screen.getAllByRole("status").find((el) => el.textContent?.includes("marcada com passagem"));
    expect(aviso).toHaveTextContent("A função Kit está marcada com passagem mas não tem data de voo (ida e retorno).");
    expect(within(linhaDe("Kit")).getByRole("img", { name: "Passagem marcada sem data de voo" })).toBeInTheDocument();
  });

  it("envio válido: um POST transacional em /api/team-inclusions/bulk com uma vaga por pessoa, sem status/fase, e a grade zera", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ created: 3 }, 200, url));
    const { user } = montar();
    await user.type(celula("Produção", "Sex 10/04"), "2");
    await user.type(celula("Produção", "Sáb 11/04"), "2");
    await user.type(celula("Kit", "Dom 12/04"), "1");
    await user.click(screen.getByTestId("button-save-grid"));
    await esperarToast("3 escalação(ões) criada(s)");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/team-inclusions/bulk");
    expect(init?.method).toBe("POST");
    const { inclusions } = JSON.parse(String(init!.body)) as { inclusions: Record<string, unknown>[] };
    expect(inclusions).toHaveLength(3);
    expect(inclusions.map((i) => i.functionId)).toEqual(["f-prod", "f-prod", "f-kit"]);
    expect(inclusions[0]).toMatchObject({ eventId: "evento-1", scheduleStartDate: "2026-04-10", scheduleEndDate: "2026-04-11", dailyRates: 2, workDays: ["2026-04-10", "2026-04-11"], userId: "user-9", dailyValue: 0 });
    expect(inclusions[2]).toMatchObject({ scheduleStartDate: "2026-04-12", scheduleEndDate: "2026-04-12", dailyRates: 1, needsTicket: false });
    inclusions.forEach((i) => { expect(i).not.toHaveProperty("status"); expect(i).not.toHaveProperty("phase"); });
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull()); // resetGrid
  });

  it("selecionar linhas e 'Excluir (n)' remove as funções da grade; 'Adicionar Função' devolve uma", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Kit" }));
    await user.click(screen.getByRole("button", { name: "Excluir (1)" }));
    await esperarToast("Linhas excluídas");
    expect(screen.queryByTitle("Kit")).toBeNull();
    expect(resumo()).toHaveTextContent("1 função ·");

    await user.click(screen.getByRole("button", { name: "Adicionar Função" }));
    const dialogo = await screen.findByRole("dialog", { name: "Selecionar função" });
    await user.click(within(dialogo).getByRole("button", { name: /^Kit/ }));
    await waitFor(() => expect(screen.getByTitle("Kit")).toBeInTheDocument());
    expect(resumo()).toHaveTextContent("2 funções ·");
  });
});
