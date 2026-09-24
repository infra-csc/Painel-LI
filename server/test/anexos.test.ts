/**
 * Testes de rota — anexos (24/09): upload com allowlist por magic number e
 * ACL de visualização (dono/papel, documento de colaborador), com os
 * cabeçalhos de segurança do download.
 *
 * MOCK (só neste arquivo): server/objectStorage.ts fala com o sidecar do
 * Replit (URL assinada em http://127.0.0.1:1106) e com o bucket GCS — nada
 * disso existe no teste. `vi.mock` troca SÓ o que toca o bucket:
 *   - `arquivoDoAnexo` devolve um "File" em memória (getMetadata/setMetadata/
 *     createReadStream sobre um Map);
 *   - `enviarAnexo` grava nesse Map em vez de fazer o PUT assinado.
 * `metadadosDoAnexo` e `downloadObject` continuam sendo os de produção
 * (Content-Type da allowlist, CSP sandbox, nosniff, Content-Disposition) —
 * é o que estes testes verificam. A allowlist de tipos (server/objectAcl.ts)
 * também roda de verdade.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Response } from "supertest";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  ORIGEM_PERMITIDA,
  type Contexto,
  type TestAgent,
} from "./harness";

vi.mock("../objectStorage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../objectStorage")>();
  const { gravarMetadadosDoAnexo } = await import("../objectAcl");
  const { Readable } = await import("node:stream");

  const objetos = new Map<string, { conteudo: Buffer; metadata: Record<string, any> }>();

  class ArquivoEmMemoria {
    constructor(readonly id: string) {}
    async getMetadata() {
      const o = objetos.get(this.id);
      if (!o) { const err: any = new Error("No such object"); err.code = 404; throw err; }
      return [o.metadata];
    }
    async setMetadata(patch: Record<string, any>) {
      const o = objetos.get(this.id);
      if (!o) { const err: any = new Error("No such object"); err.code = 404; throw err; }
      o.metadata = { ...o.metadata, ...patch, metadata: { ...(o.metadata.metadata ?? {}), ...(patch.metadata ?? {}) } };
    }
    createReadStream() {
      return Readable.from([objetos.get(this.id)!.conteudo]);
    }
  }

  class ObjectStorageService extends original.ObjectStorageService {
    arquivoDoAnexo(id: string) {
      if (!original.ATTACHMENT_ID_RE.test(id)) throw new original.ObjectNotFoundError();
      return new ArquivoEmMemoria(id) as any;
    }
    async enviarAnexo(id: string, conteudo: Buffer, contentType: string, meta: { ownerId: string; nomeOriginal: string }) {
      objetos.set(id, { conteudo, metadata: { size: conteudo.length } });
      await gravarMetadadosDoAnexo(this.arquivoDoAnexo(id), { ...meta, contentType });
    }
  }

  return { ...original, ObjectStorageService };
});

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/** Assinatura PNG + alguns bytes: passa pela allowlist por magic number. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("IHDR-fake-bytes-0123456789")]);
const HTML = Buffer.from("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>");

/** Multipart: o CSRF exige Origin; o Content-Type multipart vem do `attach`. */
const upload = (agent: TestAgent, conteudo: Buffer, filename: string, contentType: string) =>
  agent.post("/api/upload").set("Origin", ORIGEM_PERMITIDA).attach("files", conteudo, { filename, contentType });

/** Lê a resposta binária inteira (o superagent só bufferiza texto/JSON). */
const binario = (req: import("supertest").Test) =>
  req.buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on("data", (c: Buffer) => partes.push(c));
    res.on("end", () => cb(null, Buffer.concat(partes)));
  });

describe("POST /api/upload", () => {
  it("arquivo .html com mimetype de imagem (magic number errado) → 415", async () => {
    const { agent } = await agenteLogado("purchasing");
    const res = await upload(agent, HTML, "pagina.html", "image/png");
    expect(res.status).toBe(415);
    expect(res.body.message).toContain("pagina.html");
    expect(res.body.message).toContain("não é um PDF");
  });

  it("arquivo .html com mimetype text/html → 415 já no filtro do multer", async () => {
    const { agent } = await agenteLogado("purchasing");
    const res = await upload(agent, HTML, "pagina.html", "text/html");
    expect(res.status).toBe(415);
    expect(res.body.message).toBe("Tipo de arquivo não permitido");
  });

  it("PNG válido → 200 com id ATT-..., nome saneado e URL de visualização", async () => {
    const { agent } = await agenteLogado("function_area");
    // sanitizarNomeDeArquivo tira TODAS as extensões e anexa a do tipo
    // detectado ("foto.png.exe" → "foto.png"), desde 24/09.
    const res = await upload(agent, PNG, "../foto \"final\".exe", "image/png");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const anexo = res.body[0];
    expect(anexo.id).toMatch(/^ATT-[A-Z0-9-]+$/);
    expect(anexo.type).toBe("image/png");
    expect(anexo.size).toBe(PNG.length);
    expect(anexo.url).toBe(`/api/attachments/${anexo.id}/view`);
    // Sem caminho, sem aspas e com a extensão do tipo DETECTADO (não ".exe")
    expect(anexo.name).toBe("foto final.png");
  });

  it("sem sessão → 401; production sem Origin → 403 (CSRF)", async () => {
    const semSessao = await (await import("supertest")).default(ctx.app).post("/api/upload").set("Origin", ORIGEM_PERMITIDA).attach("files", PNG, { filename: "a.png", contentType: "image/png" });
    expect(semSessao.status).toBe(401);
    const { agent } = await agenteLogado("production");
    const semOrigin = await agent.post("/api/upload").attach("files", PNG, { filename: "a.png", contentType: "image/png" });
    expect(semOrigin.status).toBe(403);
  });
});

describe("GET /api/attachments/:id/view", () => {
  async function anexoDe(agent: TestAgent) {
    const res = await upload(agent, PNG, "documento.png", "image/png");
    expect(res.status).toBe(200);
    return res.body[0] as { id: string; url: string };
  }

  it("outro usuário sem papel de leitura (function_area, não dono) → 403", async () => {
    const dono = await agenteLogado("function_area");
    const anexo = await anexoDe(dono.agent);
    const { agent: outro } = await agenteLogado("function_area");
    const res = await outro.get(anexo.url);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Sem permissão");
    // Metadados seguem a mesma ACL
    expect((await outro.get(`/api/attachments/${anexo.id}`)).status).toBe(403);
  });

  it("o próprio dono (function_area) → 200", async () => {
    const dono = await agenteLogado("function_area");
    const anexo = await anexoDe(dono.agent);
    const res: Response = await binario(dono.agent.get(anexo.url));
    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body) && (res.body as Buffer).equals(PNG)).toBe(true);
  });

  it("por RH → 200 com Content-Type da allowlist, CSP sandbox, nosniff e sem cache", async () => {
    const dono = await agenteLogado("function_area");
    const anexo = await anexoDe(dono.agent);
    const { agent: rh } = await agenteLogado("financial");
    const res: Response = await binario(rh.get(anexo.url));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-security-policy"]).toContain("sandbox");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["content-disposition"]).toContain('inline; filename="documento.png"');
    expect(res.headers["content-length"]).toBe(String(PNG.length));
    expect((res.body as Buffer).equals(PNG)).toBe(true);
  });

  it("documento de colaborador (CPF/RG): nem o dono function_area vê; RH vê", async () => {
    const dono = await agenteLogado("function_area");
    const anexo = await anexoDe(dono.agent);
    const colab = await criarColaborador();
    await ctx.db.update(ctx.schema.collaborators).set({ documentAttachmentId: anexo.id }).where(eq(ctx.schema.collaborators.id, colab.id));

    expect((await dono.agent.get(anexo.url)).status).toBe(403);
    const { agent: rh } = await agenteLogado("financial");
    expect((await binario(rh.get(anexo.url))).status).toBe(200);
  });

  it("id fora do padrão → 400; id válido inexistente → 404", async () => {
    const { agent } = await agenteLogado("admin");
    expect((await agent.get("/api/attachments/..%2F..%2Fetc/view")).status).toBe(400);
    expect((await agent.get("/api/attachments/ATT-NAO-EXISTE-123/view")).status).toBe(404);
  });
});
