/**
 * Criptografia em repouso dos dados bancários do colaborador (26/10).
 *
 * AES-256-GCM com a chave do Secret `PAGAMENTO_CHAVE` (32 bytes, em base64 ou
 * hex). Gerar uma chave: no Shell do Replit,
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * e colar o resultado em Secrets → PAGAMENTO_CHAVE (o MESMO valor no app
 * publicado e no de desenvolvimento, se os dois precisarem ler os mesmos dados).
 * Perder a chave = perder banco/agência/conta/PIX já gravados (o DP digita de
 * novo); trocar a chave idem — por isso cada valor leva a "impressão" da chave
 * (8 hex do SHA-256) e o app diz claramente "cifrado com outra chave".
 *
 * Formato gravado: `v1.<impressão>.<iv>.<tag>.<texto cifrado>` (base64url).
 * O AAD amarra o valor ao colaborador e ao campo: copiar a conta cifrada de
 * uma pessoa para outra (ou da agência para a conta) não decifra.
 *
 * Sem a chave (ou com chave inválida) o app NÃO quebra: `chaveConfigurada()`
 * devolve false, a tela desabilita os campos cifrados com o aviso e o PUT
 * recusa gravar banco/agência/conta/PIX (503) — o resto do cadastro segue.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSAO = "v1";

interface Chave { bytes: Buffer; impressao: string }

let cache: { valor: string | undefined; chave: Chave | null } | null = null;

/** Lê e valida `PAGAMENTO_CHAVE` (memoizado pelo valor da variável — os testes trocam). */
function chaveAtual(): Chave | null {
  const valor = process.env.PAGAMENTO_CHAVE?.trim() || undefined;
  if (cache && cache.valor === valor) return cache.chave;
  let chave: Chave | null = null;
  if (valor) {
    let bytes: Buffer | null = null;
    if (/^[0-9a-fA-F]{64}$/.test(valor)) bytes = Buffer.from(valor, "hex");
    else {
      try {
        const b = Buffer.from(valor, "base64");
        if (b.length === 32) bytes = b;
      } catch { /* inválida */ }
    }
    if (bytes && bytes.length === 32) {
      chave = { bytes, impressao: createHash("sha256").update(bytes).digest("hex").slice(0, 8) };
    } else {
      console.error("[pagamento] PAGAMENTO_CHAVE inválida — precisa ter 32 bytes em base64 (44 caracteres) ou hex (64). Dados bancários desabilitados.");
    }
  }
  cache = { valor, chave };
  return chave;
}

/** A chave existe e é válida? */
export const chaveConfigurada = (): boolean => chaveAtual() !== null;

export class ChaveDePagamentoAusente extends Error {
  constructor() {
    super("A chave de criptografia dos dados bancários (PAGAMENTO_CHAVE) não está configurada.");
    this.name = "ChaveDePagamentoAusente";
  }
}

const aad = (contexto: string) => Buffer.from(`painel-li:pagamento:${contexto}`, "utf8");

/** Cifra `texto` amarrado ao `contexto` (ex.: "<colaboradorId>:conta"). Null/vazio continua null. */
export function cifrar(texto: string | null | undefined, contexto: string): string | null {
  if (texto == null || texto === "") return null;
  const chave = chaveAtual();
  if (!chave) throw new ChaveDePagamentoAusente();
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave.bytes, iv);
  cifra.setAAD(aad(contexto));
  const ct = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [VERSAO, chave.impressao, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export type ResultadoDaDecifragem =
  | { ok: true; valor: string | null }
  | { ok: false; motivo: "sem_chave" | "outra_chave" | "corrompido" };

/** Decifra; nunca lança — o motivo da falha vira aviso na tela. */
export function decifrar(gravado: string | null | undefined, contexto: string): ResultadoDaDecifragem {
  if (gravado == null || gravado === "") return { ok: true, valor: null };
  const chave = chaveAtual();
  if (!chave) return { ok: false, motivo: "sem_chave" };
  const partes = gravado.split(".");
  if (partes.length !== 5 || partes[0] !== VERSAO) return { ok: false, motivo: "corrompido" };
  const [, impressao, iv, tag, ct] = partes;
  if (impressao !== chave.impressao) return { ok: false, motivo: "outra_chave" };
  try {
    const tagBytes = Buffer.from(tag, "base64url");
    // Tag curta enfraquece a autenticação do GCM: só a de 16 bytes vale.
    if (tagBytes.length !== 16) return { ok: false, motivo: "corrompido" };
    const decifra = createDecipheriv("aes-256-gcm", chave.bytes, Buffer.from(iv, "base64url"), { authTagLength: 16 });
    decifra.setAAD(aad(contexto));
    decifra.setAuthTag(tagBytes);
    const texto = Buffer.concat([decifra.update(Buffer.from(ct, "base64url")), decifra.final()]).toString("utf8");
    return { ok: true, valor: texto };
  } catch {
    return { ok: false, motivo: "corrompido" };
  }
}

/** Parece um valor cifrado por este módulo? (teste: o banco nunca guarda o texto puro). */
export const pareceCifrado = (v: string | null | undefined): boolean => !!v && /^v1\.[0-9a-f]{8}\.[\w-]+\.[\w-]+\.[\w-]+$/.test(v);
