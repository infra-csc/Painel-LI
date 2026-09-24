import { describe, it, expect, vi, afterEach } from "vitest";
import { apiErrorMessage, FORBIDDEN_MESSAGE, SESSION_EXPIRED_MESSAGE } from "./api-error";
import { ApiError, NETWORK_ERROR_MESSAGE, OUTDATED_SERVER_MESSAGE, TROCAR_SENHA_EVENT, deveTentarDeNovo, isApiError, throwIfResNotOk } from "./queryClient";

/** Response mínimo para `throwIfResNotOk` (o vitest roda em node, sem fetch real). */
function resposta(status: number, texto: string, contentType = "application/json", url = "/api/teste"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    url,
    headers: new Headers({ "content-type": contentType }),
    text: async () => texto,
  } as unknown as Response;
}

describe("ApiError", () => {
  it("usa a mensagem do servidor quando existe", () => {
    const e = new ApiError(400, { message: "Data de início depois da data de fim" });
    expect(e.message).toBe("Data de início depois da data de fim");
    expect(e.status).toBe(400);
    expect(e.serverMessage).toBe("Data de início depois da data de fim");
  });

  it("texto pt-BR por status quando o corpo não traz mensagem", () => {
    expect(new ApiError(400).message).toBe("Dados inválidos");
    expect(new ApiError(401).message).toBe("Sessão expirada");
    expect(new ApiError(403).message).toBe("Sem permissão");
    expect(new ApiError(404).message).toBe("Não encontrado");
    expect(new ApiError(409).message).toBe("Conflito: o registro mudou");
    expect(new ApiError(410).message).toBe("Este recurso foi descontinuado; atualize a página");
    expect(new ApiError(413).message).toBe("Arquivo grande demais");
    expect(new ApiError(415).message).toBe("Tipo de arquivo ou conteúdo não aceito");
    expect(new ApiError(429).message).toBe("Muitas tentativas");
    expect(new ApiError(500).message).toBe("Erro no servidor");
    expect(new ApiError(502).message).toBe("Erro no servidor");
    expect(new ApiError(0).message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it("mantém status/body/response para quem já lia", async () => {
    const e = new ApiError(409, { message: "mudou", code: "STALE" });
    expect(e.body).toEqual({ message: "mudou", code: "STALE" });
    expect(e.response.status).toBe(409);
    await expect(e.response.json()).resolves.toEqual({ message: "mudou", code: "STALE" });
    expect(isApiError(e)).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
    expect(e instanceof Error).toBe(true);
  });
});

describe("throwIfResNotOk", () => {
  it("resposta JSON de erro vira ApiError com body e mensagem do servidor", async () => {
    await expect(throwIfResNotOk(resposta(403, JSON.stringify({ message: "Evento encerrado" })))).rejects.toMatchObject({
      name: "ApiError", status: 403, message: "Evento encerrado", body: { message: "Evento encerrado" },
    });
  });

  it("HTML de erro (proxy/servidor caído) não vira mensagem", async () => {
    const html = "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>";
    await expect(throwIfResNotOk(resposta(502, html, "text/html"))).rejects.toMatchObject({
      status: 502, body: null, message: "Erro no servidor",
    });
  });

  it("HTML com 200 numa rota /api = servidor desatualizado (503 acionável)", async () => {
    await expect(throwIfResNotOk(resposta(200, "<!doctype html>", "text/html"))).rejects.toMatchObject({
      status: 503, message: OUTDATED_SERVER_MESSAGE,
    });
  });

  it("resposta ok não lança", async () => {
    await expect(throwIfResNotOk(resposta(200, "[]"))).resolves.toBeUndefined();
  });

  it("410 (rota descontinuada) e 415 (tipo recusado) sem corpo usam o texto por status", async () => {
    await expect(throwIfResNotOk(resposta(410, ""))).rejects.toMatchObject({
      status: 410, message: "Este recurso foi descontinuado; atualize a página",
    });
    await expect(throwIfResNotOk(resposta(415, ""))).rejects.toMatchObject({
      status: 415, message: "Tipo de arquivo ou conteúdo não aceito",
    });
    // Com mensagem do servidor, ela prevalece (nome do arquivo recusado etc.)
    await expect(throwIfResNotOk(resposta(415, JSON.stringify({ message: '"x.exe" não é um PDF' })))).rejects.toMatchObject({
      status: 415, message: '"x.exe" não é um PDF',
    });
  });
});

describe("throwIfResNotOk — troca de senha obrigatória", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** O vitest roda em node: simulamos só o que o queryClient usa (dispatchEvent). */
  function simularWindow() {
    const alvo = new EventTarget();
    const ouvinte = vi.fn();
    alvo.addEventListener(TROCAR_SENHA_EVENT, ouvinte);
    vi.stubGlobal("window", alvo);
    return ouvinte;
  }

  it("403 com mustChangePassword dispara o evento global e ainda lança o ApiError", async () => {
    const ouvinte = simularWindow();
    await expect(throwIfResNotOk(resposta(403, JSON.stringify({ message: "Troque sua senha antes de continuar", mustChangePassword: true }))))
      .rejects.toMatchObject({ status: 403, message: "Troque sua senha antes de continuar", body: { mustChangePassword: true } });
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it("403 comum (sem a flag) e mustChangePassword em outro status não disparam", async () => {
    const ouvinte = simularWindow();
    await expect(throwIfResNotOk(resposta(403, JSON.stringify({ message: "Evento encerrado" })))).rejects.toBeInstanceOf(ApiError);
    await expect(throwIfResNotOk(resposta(403, JSON.stringify({ message: "x", mustChangePassword: false })))).rejects.toBeInstanceOf(ApiError);
    await expect(throwIfResNotOk(resposta(400, JSON.stringify({ message: "x", mustChangePassword: true })))).rejects.toBeInstanceOf(ApiError);
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it("sem window (SSR/testes) não estoura", async () => {
    vi.stubGlobal("window", undefined);
    await expect(throwIfResNotOk(resposta(403, JSON.stringify({ mustChangePassword: true })))).rejects.toBeInstanceOf(ApiError);
  });
});

describe("apiErrorMessage", () => {
  const fallback = "Erro ao salvar";

  it("403 COM mensagem do servidor mostra a mensagem (evento encerrado, janela, troca)", () => {
    expect(apiErrorMessage(new ApiError(403, { message: "Evento encerrado: só o administrador altera." }), fallback))
      .toBe("Evento encerrado: só o administrador altera.");
  });

  it("403 SEM mensagem cai no texto de permissão", () => {
    expect(apiErrorMessage(new ApiError(403), fallback)).toBe(FORBIDDEN_MESSAGE);
    expect(apiErrorMessage({ status: 403, body: { message: "   " } }, fallback)).toBe(FORBIDDEN_MESSAGE);
  });

  it("401 sempre é sessão expirada, mesmo com mensagem do servidor", () => {
    expect(apiErrorMessage(new ApiError(401, { message: "Não autenticado" }), fallback)).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it("TypeError de rede (fetch direto) e ApiError status 0 viram 'sem conexão'", () => {
    expect(apiErrorMessage(new TypeError("Failed to fetch"), fallback)).toBe(NETWORK_ERROR_MESSAGE);
    expect(apiErrorMessage(new ApiError(0), fallback)).toBe(NETWORK_ERROR_MESSAGE);
  });

  it("410 e 415 sem corpo mostram o texto acionável por status; com corpo, a mensagem do servidor", () => {
    expect(apiErrorMessage(new ApiError(410), fallback)).toBe("Este recurso foi descontinuado; atualize a página");
    expect(apiErrorMessage(new ApiError(415), fallback)).toBe("Tipo de arquivo ou conteúdo não aceito");
    expect(apiErrorMessage(new ApiError(415, { message: '"a.exe" não é um PDF' }), fallback)).toBe('"a.exe" não é um PDF');
  });

  it("500 sem corpo usa o fallback da tela", () => {
    expect(apiErrorMessage(new ApiError(500), fallback)).toBe(fallback);
    expect(apiErrorMessage(new ApiError(500, null), fallback)).toBe(fallback);
  });

  it("HTML de servidor desatualizado mostra a mensagem acionável", async () => {
    let capturado: unknown = null;
    try { await throwIfResNotOk(resposta(200, "<!doctype html><html></html>", "text/html")); } catch (e) { capturado = e; }
    expect(apiErrorMessage(capturado, fallback)).toBe(OUTDATED_SERVER_MESSAGE);
  });

  it("nunca devolve o '400: {...}' cru nem texto técnico em inglês", () => {
    expect(apiErrorMessage(new Error('400: {"message":"x"}'), fallback)).toBe(fallback);
    expect(apiErrorMessage(new SyntaxError("Unexpected token < in JSON at position 0"), fallback)).toBe(fallback);
    expect(apiErrorMessage(new ApiError(400, { message: "Dados inválidos" }), fallback)).toBe("Dados inválidos");
  });

  it("Error do próprio client em pt-BR passa; vazio/nulo usa o fallback", () => {
    expect(apiErrorMessage(new Error("Erro ao confirmar upload"), fallback)).toBe("Erro ao confirmar upload");
    expect(apiErrorMessage(null, fallback)).toBe(fallback);
    expect(apiErrorMessage(undefined, fallback)).toBe(fallback);
    expect(apiErrorMessage(new Error(""), fallback)).toBe(fallback);
  });

  it("objeto no formato antigo ({status, body}) continua funcionando", () => {
    expect(apiErrorMessage({ status: 400, body: { message: "Campo obrigatório" } }, fallback)).toBe("Campo obrigatório");
    expect(apiErrorMessage({ status: 404, body: null }, fallback)).toBe(fallback);
  });
});

describe("deveTentarDeNovo (retry das queries)", () => {
  it("até 2 tentativas só para rede/502/503/504", () => {
    for (const s of [0, 502, 503, 504]) {
      expect(deveTentarDeNovo(0, new ApiError(s))).toBe(true);
      expect(deveTentarDeNovo(1, new ApiError(s))).toBe(true);
      expect(deveTentarDeNovo(2, new ApiError(s))).toBe(false);
    }
  });

  it("4xx, 500 e erros comuns não repetem", () => {
    for (const s of [400, 401, 403, 404, 409, 429, 500]) expect(deveTentarDeNovo(0, new ApiError(s))).toBe(false);
    expect(deveTentarDeNovo(0, new Error("x"))).toBe(false);
  });
});
