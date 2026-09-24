/**
 * Object Storage do Replit (bucket privado) — acesso aos anexos.
 *
 * Reescrito em 23/09: saiu o esqueleto genérico (ACL "public/private",
 * caminhos /objects/..., busca em diretórios públicos) que nenhuma rota usava;
 * ficou o que o app precisa — localizar o objeto de um anexo, subir o arquivo
 * com os metadados (dono, nome original, tipo) e devolvê-lo ao navegador com
 * cabeçalhos seguros. A política de quem pode ver e de quais tipos são aceitos
 * mora em server/objectAcl.ts.
 */
import { Storage, File } from "@google-cloud/storage";
import type { Response } from "express";
import {
  gravarMetadadosDoAnexo,
  lerMetadadosDoAnexo,
  tipoPeloContentType,
  type MetadadosDoAnexo,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/** Formato dos ids gerados em /api/upload: ATT-<timestamp>-<aleatório>. */
export const ATTACHMENT_ID_RE = /^ATT-[A-Z0-9-]{4,60}$/;

export function novoIdDeAnexo(): string {
  return `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`.toUpperCase();
}

export class ObjectStorageService {
  constructor() {}

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  /** Objeto do anexo `id` em <PRIVATE_OBJECT_DIR>/uploads/<id>. */
  arquivoDoAnexo(id: string): File {
    if (!ATTACHMENT_ID_RE.test(id)) throw new ObjectNotFoundError();
    const { bucketName, objectName } = parseObjectPath(`${this.getPrivateObjectDir()}/uploads/${id}`);
    return objectStorageClient.bucket(bucketName).file(objectName);
  }

  /** Metadados do anexo; ObjectNotFoundError quando o objeto não existe. */
  async metadadosDoAnexo(file: File): Promise<MetadadosDoAnexo> {
    try {
      const [metadata] = await file.getMetadata();
      return lerMetadadosDoAnexo(metadata);
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (code === 404 || code === "404") throw new ObjectNotFoundError();
      throw err;
    }
  }

  /**
   * Sobe o conteúdo e grava dono/nome/tipo nos metadados. O envio continua
   * pela URL assinada do sidecar (mecanismo já em produção); o que mudou é
   * que só o servidor a obtém — o cliente nunca mais recebe uma URL de PUT.
   */
  async enviarAnexo(
    id: string,
    conteudo: Buffer,
    contentType: string,
    meta: { ownerId: string; nomeOriginal: string },
  ): Promise<void> {
    const uploadURL = await this.getObjectEntityUploadURL(id);
    const response = await fetch(uploadURL, {
      method: "PUT",
      body: conteudo,
      headers: { "Content-Type": contentType },
    });
    if (!response.ok) {
      throw new Error(`Falha ao gravar o anexo ${id} no storage (HTTP ${response.status})`);
    }
    await gravarMetadadosDoAnexo(this.arquivoDoAnexo(id), { ...meta, contentType });
  }

  /**
   * Envia o arquivo ao navegador. Regras (23/09):
   *  - Content-Type SEMPRE da allowlist; fora dela vira octet-stream + download
   *    forçado (nunca `inline`), o que cobre SVG/HTML gravados antes da allowlist;
   *  - `CSP: sandbox; default-src 'none'` + nosniff: mesmo que um PDF/imagem
   *    carregue script, ele roda sem origem e sem rede;
   *  - sem cache compartilhado (é documento pessoal).
   */
  async downloadObject(
    file: File,
    res: Response,
    opts: { inline: boolean; nomeArquivo: string },
  ): Promise<void> {
    try {
      const meta = await this.metadadosDoAnexo(file);
      const tipo = tipoPeloContentType(meta.contentType);
      const contentType = tipo ? tipo.contentType : "application/octet-stream";
      const inline = opts.inline && !!tipo && tipo.inline;
      const nome = opts.nomeArquivo.replace(/["\\\r\n]/g, "_");

      res.set({
        "Content-Type": contentType,
        ...(meta.tamanho != null ? { "Content-Length": String(meta.tamanho) } : {}),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      });

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Erro ao ler o anexo" });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        if (!res.headersSent) res.status(404).json({ message: "Arquivo não encontrado" });
        return;
      }
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Erro ao baixar o anexo" });
      }
    }
  }

  // URL assinada de PUT para o objeto do anexo — uso INTERNO (enviarAnexo).
  async getObjectEntityUploadURL(attachmentId: string): Promise<string> {
    const { bucketName, objectName } = parseObjectPath(`${this.getPrivateObjectDir()}/uploads/${attachmentId}`);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
