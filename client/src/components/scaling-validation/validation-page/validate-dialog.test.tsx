import { useMemo } from "react";
import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { sugestaoFake } from "@/test/fixtures-dominio";
import type { SuggestionRow } from "@/components/scaling-validation/types";
import { VALIDATION_NOTE_MAX } from "@/components/scaling-validation/validation-note";
import { useValidationSelection } from "./use-validation-selection";
import { useValidationActions } from "./use-validation-actions";
import { ValidateDialog } from "./validate-dialog";

/**
 * O diálogo lê seleção e ações dos dois hooks reais da página; o harness só
 * fornece as linhas e um botão que abre a confirmação para o lote inteiro.
 */
function Harness({ rows, eventId }: { rows: SuggestionRow[]; eventId: string }) {
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const ids = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const data = { rows, rowById, filteredRows: rows, selectableAll: ids, validatableAll: ids, readOnlyMode: false };
  const sel = useValidationSelection(data, eventId);
  const act = useValidationActions(data, sel, eventId);
  const functionNameById = useMemo(() => new Map([["funcao-1", "Produção"], ["funcao-2", "Kit"]]), []);
  return (
    <>
      <div ref={act.topRef} />
      <button type="button" onClick={() => act.openValidateConfirm(rows.map((r) => r.id))}>Validar lote</button>
      <ValidateDialog sel={sel} act={act} eventId={eventId} functionNameById={functionNameById} />
    </>
  );
}

const LINHAS = () => [
  sugestaoFake({ id: "s1", inclusionNumber: 101, functionId: "funcao-1", eventId: "evento-1" }),
  sugestaoFake({ id: "s2", inclusionNumber: 102, functionId: "funcao-2", eventId: "evento-1" }),
];

async function abrir(rows = LINHAS(), eventId = "evento-1") {
  const utils = renderComTudo(<Harness rows={rows} eventId={eventId} />);
  await utils.user.click(screen.getByRole("button", { name: "Validar lote" }));
  const dialogo = await screen.findByRole("alertdialog", { name: `Validar ${rows.length} vagas?` });
  return { ...utils, dialogo };
}

const campo = () => screen.getByLabelText(/Observação para o aprovador/) as HTMLTextAreaElement;
const confirmarLote = (n: number) => screen.getByRole("button", { name: `Validar ${n} vagas · enviar para aprovação` });
const URL_VALIDAR = "/api/scaling-suggestions/validate";

function corpoEnviado(fetchMock: ReturnType<typeof mockarFetch>) {
  const chamada = fetchMock.mock.calls.find(([url]) => String(url) === URL_VALIDAR);
  expect(chamada, "esperava POST em /validate").toBeDefined();
  expect(chamada![1]?.method).toBe("POST");
  return JSON.parse(String(chamada![1]!.body)) as { inclusionIds: string[]; validationNote: string | null };
}

describe("ValidateDialog", () => {
  it("abre 'Validar 2 vagas?' listando número, função e período de CADA vaga do lote", async () => {
    const { dialogo } = await abrir();
    const lista = within(dialogo).getByRole("list", { name: "Vagas deste lote" });
    expect(lista).toHaveTextContent("#101");
    expect(lista).toHaveTextContent("Produção");
    expect(lista).toHaveTextContent("#102");
    expect(lista).toHaveTextContent("Kit");
    // Com um evento só, a lista tem UM grupo (li externo) com as vagas dentro.
    expect(lista.querySelectorAll("li li")).toHaveLength(2);
    expect(dialogo).toHaveTextContent("Elas seguem para o aprovador");
  });

  it("campo 'Observação para o aprovador' é opcional, com maxLength 1000 e contador que acompanha a digitação", async () => {
    const { user } = await abrir();
    const textarea = campo();
    expect(textarea).toHaveAttribute("maxlength", String(VALIDATION_NOTE_MAX));
    expect(screen.getByLabelText(/Observação para o aprovador \(opcional\)/)).toBe(textarea);
    const contador = document.getElementById("validation-note-contador")!;
    expect(contador).toHaveTextContent(`0/${VALIDATION_NOTE_MAX}`);
    expect(textarea.getAttribute("aria-describedby")).toContain("validation-note-contador");
    // Lote de 2+: a dica "vai junto com todas" também descreve o campo.
    expect(textarea.getAttribute("aria-describedby")).toContain("validation-note-lote");
    await user.type(textarea, "abc");
    expect(contador).toHaveTextContent(`3/${VALIDATION_NOTE_MAX}`);
  });

  it("envia inclusionIds e a observação com trim; sucesso fecha o diálogo e avisa", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ ok: ["s1", "s2"], skipped: [] }, 200, url));
    const { user } = await abrir();
    await user.type(campo(), "  chega no dia anterior  ");
    await user.click(confirmarLote(2));
    await esperarToast("2 vagas validadas");
    expect(corpoEnviado(fetchMock)).toEqual({ inclusionIds: ["s1", "s2"], validationNote: "chega no dia anterior" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("observação em branco vai como null (nunca string vazia)", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ ok: ["s1", "s2"], skipped: [] }, 200, url));
    const { user } = await abrir();
    await user.type(campo(), "   ");
    await user.click(confirmarLote(2));
    await esperarToast("2 vagas validadas");
    expect(corpoEnviado(fetchMock).validationNote).toBeNull();
  });

  it("400 do servidor mantém o diálogo aberto com o campo aria-invalid e a mensagem; digitar limpa o erro", async () => {
    mockarFetch((url) => respostaJson({ message: "Observação acima de 1000 caracteres" }, 400, url));
    const { user } = await abrir();
    await user.type(campo(), "texto");
    await user.click(confirmarLote(2));
    const erro = await screen.findByRole("alert");
    expect(erro).toHaveTextContent("Observação acima de 1000 caracteres");
    expect(campo()).toHaveAttribute("aria-invalid", "true");
    expect(campo().getAttribute("aria-describedby")).toContain(erro.id);
    expect(screen.getByRole("alertdialog", { name: "Validar 2 vagas?" })).toBeInTheDocument();
    expect(campo()).toHaveValue("texto"); // o que a pessoa escreveu não se perde

    await user.type(campo(), "!");
    expect(campo()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("erro que não é 400 fecha o diálogo e avisa no toast", async () => {
    mockarFetch((url) => respostaJson({ message: "Erro no servidor" }, 500, url));
    const { user } = await abrir();
    await user.click(confirmarLote(2));
    await esperarToast("Não foi possível validar");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("'Voltar' fecha sem chamar a API; reabrir começa com a observação zerada", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    const { user } = await abrir();
    await user.type(campo(), "não deve vazar para o próximo lote");
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Validar lote" }));
    await screen.findByRole("alertdialog");
    expect(campo()).toHaveValue("");
  });

  it("em 'Todos os eventos' avisa que o lote mistura eventos e agrupa a lista por evento", async () => {
    const rows = [
      sugestaoFake({ id: "s1", inclusionNumber: 101, eventId: "evento-1", eventName: "Circuito Brasília" }),
      sugestaoFake({ id: "s2", inclusionNumber: 102, eventId: "evento-2", eventName: "Maratona Rio", eventStartDate: "2026-05-20", eventEndDate: "2026-05-21" }),
    ];
    const { dialogo } = await abrir(rows, "");
    expect(within(dialogo).getByRole("status")).toHaveTextContent("Este lote tem vagas de 2 eventos.");
    const lista = within(dialogo).getByRole("list", { name: "Vagas deste lote" });
    expect(lista).toHaveTextContent("Circuito Brasília");
    expect(lista).toHaveTextContent("Maratona Rio");
  });
});
