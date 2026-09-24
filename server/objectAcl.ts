/**
 * Controle de acesso e tipos permitidos dos anexos (23/09).
 *
 * Até 23/09 este arquivo era o esqueleto genérico do Replit (ObjectAclPolicy,
 * grupos de acesso vazios) e NADA o usava: qualquer sessão baixava qualquer
 * anexo por id, e o upload aceitava o mimetype que o navegador declarasse.
 * Agora ele responde a três perguntas concretas:
 *   1. de quem é o anexo (metadado `custom:ownerId`, gravado no upload);
 *   2. quem pode vê-lo (dono ou papel de cadastro/RH/admin; documento de
 *      colaborador só cadastro/RH/admin);
 *   3. o que pode ser enviado (PDF, PNG, JPG, XLSX, CSV — conferido pelos
 *      primeiros bytes, não pelo mimetype do cliente).
 */
import type { File } from "@google-cloud/storage";
import { ROLE_GROUPS, type CanonicalRole } from "@shared/roles";

// ── Metadados gravados no objeto ─────────────────────────────────────────────
export const META_DONO = "custom:ownerId";
export const META_NOME_ORIGINAL = "custom:originalFileName";

export interface MetadadosDoAnexo {
  ownerId: string | null;
  nomeOriginal: string | null;
  contentType: string | null;
  tamanho: number | null;
}

export function lerMetadadosDoAnexo(metadata: any): MetadadosDoAnexo {
  const custom = metadata?.metadata ?? {};
  const tamanho = metadata?.size != null ? Number(metadata.size) : null;
  return {
    ownerId: typeof custom[META_DONO] === "string" && custom[META_DONO] ? custom[META_DONO] : null,
    nomeOriginal: typeof custom[META_NOME_ORIGINAL] === "string" && custom[META_NOME_ORIGINAL] ? custom[META_NOME_ORIGINAL] : null,
    contentType: typeof metadata?.contentType === "string" ? metadata.contentType : null,
    tamanho: Number.isFinite(tamanho) ? tamanho : null,
  };
}

export async function gravarMetadadosDoAnexo(
  file: File,
  dados: { ownerId?: string; nomeOriginal?: string; contentType?: string },
): Promise<void> {
  const metadata: Record<string, string> = {};
  if (dados.ownerId) metadata[META_DONO] = dados.ownerId;
  if (dados.nomeOriginal) metadata[META_NOME_ORIGINAL] = dados.nomeOriginal;
  await file.setMetadata({
    ...(dados.contentType ? { contentType: dados.contentType } : {}),
    metadata,
  });
}

// ── Quem pode ver ────────────────────────────────────────────────────────────
/** Cadastro (admin, Compras, Logística) + RH veem qualquer anexo. */
const PAPEIS_QUE_VEEM_TUDO: readonly CanonicalRole[] = [...ROLE_GROUPS.cadastro, "financial"];

export function podeAcessarAnexo(args: {
  role: CanonicalRole | null;
  userId: string;
  ownerId: string | null;
  /** true quando algum colaborador aponta para este anexo (documentAttachmentId). */
  documentoDeColaborador: boolean;
}): boolean {
  const { role, userId, ownerId, documentoDeColaborador } = args;
  if (role && PAPEIS_QUE_VEEM_TUDO.includes(role)) return true;
  // Área de Função (e qualquer outro papel): só o que ela mesma enviou, e
  // nunca o documento (CPF/RG) de um colaborador.
  if (documentoDeColaborador) return false;
  return !!ownerId && ownerId === userId;
}

// ── Tipos permitidos (allowlist + magic number) ──────────────────────────────
export interface TipoDeArquivo {
  contentType: string;
  extensao: string;
  /** Pode abrir no navegador (view inline). SVG/HTML nunca entram aqui. */
  inline: boolean;
}

const TIPOS: readonly TipoDeArquivo[] = [
  { contentType: "application/pdf", extensao: "pdf", inline: true },
  { contentType: "image/png", extensao: "png", inline: true },
  { contentType: "image/jpeg", extensao: "jpg", inline: true },
  { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensao: "xlsx", inline: false },
  { contentType: "text/csv", extensao: "csv", inline: false },
];

const comecaCom = (buf: Buffer, bytes: number[]) =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

/** Texto "de verdade": sem NUL e sem bytes de controle fora de tab/CR/LF. */
function pareceTexto(buf: Buffer): boolean {
  const amostra = buf.subarray(0, 4096);
  if (amostra.length === 0) return false;
  for (let i = 0; i < amostra.length; i++) {
    const b = amostra[i];
    if (b === 0) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false;
  }
  return true;
}

/**
 * Decide o tipo pelo CONTEÚDO. O mimetype/extensão declarados só desempatam
 * entre os tipos cujo conteúdo é compatível (ex.: zip pode ser xlsx; texto
 * pode ser csv). Devolve null quando não é nenhum dos permitidos.
 */
export function tipoPermitidoDoArquivo(buf: Buffer, mimetypeDeclarado: string, nome: string): TipoDeArquivo | null {
  const ext = (nome.split(".").pop() ?? "").toLowerCase();
  if (comecaCom(buf, [0x25, 0x50, 0x44, 0x46])) return TIPOS[0]; // %PDF
  if (comecaCom(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return TIPOS[1];
  if (comecaCom(buf, [0xff, 0xd8, 0xff])) return TIPOS[2];
  if (comecaCom(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // zip: só aceitamos como xlsx quando o cliente também diz que é planilha
    const dizQueEhXlsx = ext === "xlsx" || mimetypeDeclarado === TIPOS[3].contentType || mimetypeDeclarado === "application/vnd.ms-excel";
    return dizQueEhXlsx ? TIPOS[3] : null;
  }
  if (pareceTexto(buf)) {
    // Windows com Excel instalado declara CSV como application/vnd.ms-excel
    const dizQueEhCsv = ext === "csv" || mimetypeDeclarado === "text/csv" || mimetypeDeclarado === "application/vnd.ms-excel" || mimetypeDeclarado === "text/plain";
    return dizQueEhCsv ? TIPOS[4] : null;
  }
  return null;
}

/** Tipo permitido a partir do contentType gravado no objeto (para download). */
export function tipoPeloContentType(contentType: string | null | undefined): TipoDeArquivo | null {
  if (!contentType) return null;
  const base = contentType.split(";")[0].trim().toLowerCase();
  return TIPOS.find((t) => t.contentType === base) ?? null;
}

/**
 * Nome de arquivo seguro para gravar e devolver em Content-Disposition:
 * sem caminho, sem caracteres de controle/aspas, com a extensão coerente com
 * o tipo detectado (o nome "nota.pdf.exe" vira "nota.pdf").
 */
export function sanitizarNomeDeArquivo(nome: string | undefined, tipo: TipoDeArquivo): string {
  const base = (nome ?? "")
    .split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f"'`;<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const semExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "anexo";
  return `${semExt}.${tipo.extensao}`;
}
