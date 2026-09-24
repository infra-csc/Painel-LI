/**
 * Infraestrutura HTTP compartilhada (23/09): captura de promessas rejeitadas
 * nas rotas e o tradutor único de erro → resposta `{ message }` em pt-BR.
 *
 * Contexto: routes.ts tem ~180 rotas `async`. No Express 4 uma promise
 * rejeitada fora do `try` do handler (ex.: `requireRoles` antes do `try`, ou
 * um `await` que estoura antes de entrar nele) NÃO chega ao tratador de erro —
 * vira `unhandledRejection` e, dependendo da versão do Node, derruba o
 * processo. Aqui cada handler é embrulhado para que a rejeição vire `next(err)`.
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { log } from "./vite";

type QualquerHandler = (req: Request, res: Response, next: NextFunction) => unknown;

/** Erro com status HTTP e mensagem já pronta para o cliente. */
export class HttpError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Embrulha um handler para que uma promise rejeitada vire `next(err)`.
 * Mantém a aridade 3 (Express usa `fn.length === 4` para reconhecer tratador
 * de erro — não queremos que um handler comum seja confundido com um).
 */
export function asyncHandler(fn: QualquerHandler): RequestHandler {
  return function handlerProtegido(req, res, next) {
    let resultado: unknown;
    try {
      resultado = fn(req, res, next);
    } catch (err) {
      return next(err);
    }
    if (resultado && typeof (resultado as Promise<unknown>).catch === "function") {
      (resultado as Promise<unknown>).catch(next);
    }
  };
}

/**
 * Aplica `asyncHandler` a TODAS as rotas registradas em `app` a partir daqui.
 *
 * Escolha deliberada (23/09): em vez de trocar `app.get(` por `r.get(` em ~180
 * definições (diff enorme, fácil de esquecer uma), substituímos os métodos de
 * rota do próprio `app` por versões que embrulham cada handler. O diff fica em
 * uma linha no topo de `registerRoutes` e cobre também as rotas registradas por
 * `registerScalingValidationRoutes` e `registerSimulationRoutes`, que recebem o
 * mesmo `app`.
 *
 * `app.get('env')` (leitura de configuração, 1 argumento) continua funcionando:
 * só embrulhamos quando há handlers depois do caminho.
 */
export function protegerRotas(app: Express): void {
  const metodos = ["get", "post", "put", "patch", "delete"] as const;
  for (const metodo of metodos) {
    const original = (app[metodo] as (...args: unknown[]) => unknown).bind(app);
    (app as unknown as Record<(typeof metodos)[number], unknown>)[metodo] = (caminho: unknown, ...handlers: unknown[]) => {
      if (handlers.length === 0) return original(caminho);
      const protegidos = handlers.map((h) => (typeof h === "function" ? asyncHandler(h as QualquerHandler) : h));
      return original(caminho, ...protegidos);
    };
  }
}

/** Traduz os erros da validação zod para uma frase curta em pt-BR. */
function mensagemDoZod(err: ZodError): string {
  const primeiro = err.issues[0];
  if (!primeiro) return "Dados inválidos";
  const campo = primeiro.path.length > 0 ? primeiro.path.join(".") : null;
  const detalhe = traduzirIssue(primeiro.code, primeiro.message);
  return campo ? `Dados inválidos: ${campo} — ${detalhe}` : `Dados inválidos: ${detalhe}`;
}

function traduzirIssue(code: string, original: string): string {
  switch (code) {
    case "invalid_type":
      return original.includes("Required") ? "obrigatório" : "tipo inválido";
    case "too_small": return "valor abaixo do mínimo";
    case "too_big": return "valor acima do máximo";
    case "invalid_enum_value": return "opção não permitida";
    case "invalid_string": return "formato inválido";
    case "unrecognized_keys": return "campo não permitido";
    default: return original || "valor inválido";
  }
}

/**
 * Tratador global de erros. Regras:
 *  - nunca devolve `err.message` cru de erro desconhecido (pode vazar SQL,
 *    caminho de arquivo, nome de coluna); o detalhe completo vai para o log;
 *  - erros "conhecidos" (multer, body-parser, zod, Postgres 23503/23505 e
 *    HttpError) viram status e frase em pt-BR.
 */
/** Campos que os erros "conhecidos" (multer, body-parser, http-errors, Postgres) carregam. */
type ErroConhecido = { name?: unknown; code?: unknown; status?: unknown; type?: unknown; expose?: unknown; message?: unknown; tipoDeArquivoRecusado?: unknown };

export function tratadorGlobalDeErros(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId ?? "-";
  const e: ErroConhecido = (err && typeof err === "object" ? err : {}) as ErroConhecido;
  let status = 500;
  let message = "Erro interno";
  let extra: Record<string, unknown> | undefined;

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
    extra = err.extra;
  } else if (err instanceof ZodError) {
    status = 400;
    message = mensagemDoZod(err);
  } else if (e.name === "MulterError") {
    if (e.code === "LIMIT_FILE_SIZE") { status = 413; message = "Arquivo maior que o limite de 10 MB"; }
    else if (e.code === "LIMIT_UNEXPECTED_FILE") { status = 415; message = "Arquivo não esperado neste envio"; }
    else if (e.code === "LIMIT_FILE_COUNT") { status = 413; message = "Quantidade de arquivos acima do permitido"; }
    else { status = 400; message = "Envio de arquivo inválido"; }
  } else if (e.status === 415 || e.tipoDeArquivoRecusado) {
    // fileFilter do multer (routes.ts) marca o erro com status 415
    status = 415; message = "Tipo de arquivo não permitido";
  } else if (e.type === "entity.too.large") {
    status = 413; message = "Envio grande demais";
  } else if (e.type === "entity.parse.failed") {
    status = 400; message = "JSON inválido no corpo da requisição";
  } else if (e.type === "charset.unsupported" || e.type === "encoding.unsupported") {
    status = 415; message = "Codificação não suportada";
  } else if (e.code === "23503") {
    status = 409; message = "Registro em uso por outro cadastro";
  } else if (e.code === "23505") {
    status = 409; message = "Já existe um registro igual";
  } else if (typeof e.status === "number" && e.status >= 400 && e.status < 500 && typeof e.expose === "boolean" && e.expose) {
    // http-errors (body-parser e afins) com `expose: true` são seguros de mostrar
    status = e.status; message = "Requisição inválida";
  }

  const nivel = status >= 500 ? "error" : "warn";
  console[nivel](`[Error ${requestId}] ${req.method} ${req.path} → ${status}`, status >= 500 ? err : (e.message ?? err));
  if (status >= 500) log(`erro ${requestId} em ${req.method} ${req.path}`, "error");

  if (res.headersSent) return;
  res.status(status).json({ message, ...(extra ?? {}) });
}
