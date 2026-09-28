import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { esperarToast, renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import AttachmentUpload, { motivoDeRecusa } from "./attachment-upload";

const inputDeArquivo = () => screen.getByTestId("input-attachment-file") as HTMLInputElement;

describe("motivoDeRecusa", () => {
  it("aceita PDF, PNG, JPG, XLSX e CSV; recusa o resto pela extensão", () => {
    expect(motivoDeRecusa({ name: "nota.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(motivoDeRecusa({ name: "FOTO.PNG", size: 10, type: "" })).toBeNull();
    expect(motivoDeRecusa({ name: "dados.csv", size: 10, type: "application/vnd.ms-excel" })).toBeNull();
    expect(motivoDeRecusa({ name: "pagina.html", size: 10, type: "text/html" })).toBe('"pagina.html" não é PDF, PNG, JPG, XLSX ou CSV.');
    expect(motivoDeRecusa({ name: "script.exe", size: 10, type: "" })).toContain("não é PDF, PNG, JPG, XLSX ou CSV");
  });

  it("recusa extensão certa com MIME errado, arquivo vazio e acima de 10 MB", () => {
    expect(motivoDeRecusa({ name: "falso.png", size: 10, type: "text/html" })).toContain("não é PDF");
    expect(motivoDeRecusa({ name: "vazio.pdf", size: 0, type: "application/pdf" })).toBe('"vazio.pdf" está vazio.');
    expect(motivoDeRecusa({ name: "grande.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).toBe('"grande.pdf" tem 11.0 MB; o máximo é 10 MB.');
  });
});

describe("AttachmentUpload", () => {
  it("recusa .html com mensagem em pt-BR ANTES de chamar a API", async () => {
    const fetchMock = mockarFetch(() => respostaJson([]));
    const onAttachmentsChange = vi.fn();
    // `applyAccept: false`: o user-event filtraria o .html pelo `accept` antes do
    // componente ver; no navegador o usuário consegue arrastar/forçar o arquivo.
    const { user } = renderComTudo(<AttachmentUpload onAttachmentsChange={onAttachmentsChange} />, { userEvent: { applyAccept: false } });

    await user.upload(inputDeArquivo(), new File(["<html></html>"], "pagina.html", { type: "text/html" }));

    await esperarToast("Arquivo não aceito");
    await esperarToast('"pagina.html" não é PDF, PNG, JPG, XLSX ou CSV.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    expect(inputDeArquivo().value).toBe("");
  });

  it("aceita PNG: POST multipart em /api/upload, lista o anexo e avisa quem chamou", async () => {
    const fetchMock = mockarFetch(() => respostaJson([{ id: "anexo-1", name: "foto.png", type: "image/png", size: 3, url: "/api/attachments/anexo-1/view" }]));
    const onAttachmentsChange = vi.fn();
    const onFileSelected = vi.fn();
    const { user } = renderComTudo(<AttachmentUpload onAttachmentsChange={onAttachmentsChange} onFileSelected={onFileSelected} />);

    const png = new File(["abc"], "foto.png", { type: "image/png" });
    await user.upload(inputDeArquivo(), png);

    await waitFor(() => expect(onAttachmentsChange).toHaveBeenCalledWith(["anexo-1"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/upload");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("files")).toBeInstanceOf(File);
    expect(onFileSelected).toHaveBeenCalledWith(png);
    await esperarToast("Anexo carregado");
  });

  it("mostra o anexo enviado na lista quando o pai devolve o id", async () => {
    mockarFetch(() => respostaJson([{ id: "anexo-1", name: "foto.png", type: "image/png", size: 2048, url: "/x" }]));
    const onAttachmentsChange = vi.fn();
    const { user, rerender } = renderComTudo(<AttachmentUpload attachmentIds={[]} onAttachmentsChange={onAttachmentsChange} />);
    await user.upload(inputDeArquivo(), new File(["ab"], "foto.png", { type: "image/png" }));
    await waitFor(() => expect(onAttachmentsChange).toHaveBeenCalledWith(["anexo-1"]));

    rerender(<AttachmentUpload attachmentIds={["anexo-1"]} onAttachmentsChange={onAttachmentsChange} />);
    expect(screen.getByText("foto.png")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover anexo foto.png" }));
    expect(onAttachmentsChange).toHaveBeenLastCalledWith([]);
  });

  it("id sem metadados (anexo antigo) aparece como 'Anexo N' com botão de remover acessível", () => {
    renderComTudo(<AttachmentUpload attachmentIds={["antigo-9"]} onAttachmentsChange={vi.fn()} />);
    expect(screen.getByText("Anexo 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover anexo 1" })).toBeInTheDocument();
  });

  it("erro 415 do servidor vira toast em pt-BR e não altera os anexos", async () => {
    mockarFetch(() => respostaJson({}, 415));
    const onAttachmentsChange = vi.fn();
    const { user } = renderComTudo(<AttachmentUpload onAttachmentsChange={onAttachmentsChange} />);
    await user.upload(inputDeArquivo(), new File(["%PDF"], "nota.pdf", { type: "application/pdf" }));
    await esperarToast("Erro no upload");
    await esperarToast("Tipo de arquivo ou conteúdo não aceito");
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Adicionar arquivo" })).toBeEnabled();
  });

  it("resposta sem id é tratada como erro", async () => {
    mockarFetch(() => respostaJson([{ name: "x.pdf" }]));
    const onAttachmentsChange = vi.fn();
    const { user } = renderComTudo(<AttachmentUpload onAttachmentsChange={onAttachmentsChange} />);
    await user.upload(inputDeArquivo(), new File(["%PDF"], "nota.pdf", { type: "application/pdf" }));
    await esperarToast("O servidor não devolveu o identificador do anexo.");
    expect(onAttachmentsChange).not.toHaveBeenCalled();
  });

  it("botão 'Adicionar arquivo' abre o seletor; disabled esconde o envio e o remover", async () => {
    const { user, rerender } = renderComTudo(<AttachmentUpload attachmentIds={["a"]} onAttachmentsChange={vi.fn()} />);
    const abrir = vi.spyOn(inputDeArquivo(), "click");
    await user.click(screen.getByRole("button", { name: "Adicionar arquivo" }));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(screen.getByText("PDF, PNG, JPG, XLSX ou CSV · máx. 10 MB")).toBeInTheDocument();

    rerender(<AttachmentUpload attachmentIds={["a"]} onAttachmentsChange={vi.fn()} disabled />);
    expect(screen.queryByRole("button", { name: "Adicionar arquivo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remover anexo/ })).not.toBeInTheDocument();
    expect(screen.getByText("Anexo 1")).toBeInTheDocument();
  });
});
