/**
 * PDF do voucher → texto (28/08). Fica no servidor de propósito: a biblioteca
 * de leitura é pesada e não tem por que ir no pacote que o navegador baixa.
 *
 * A interpretação do texto mora em shared/voucher-parse.ts, que é puro e
 * testável. Aqui só se lida com o arquivo.
 */
import { extractText, getDocumentProxy } from "unpdf";
import { lerVoucher, type VoucherLeitura } from "@shared/voucher-parse";

/** Teto defensivo: voucher é documento de uma ou duas páginas. */
export const TAMANHO_MAXIMO_VOUCHER = 8 * 1024 * 1024;

export async function textoDoPdf(arquivo: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(arquivo));
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === "string" ? text : String(text ?? "");
}

/**
 * Lê um voucher e devolve a SUGESTÃO de preenchimento. Nunca grava nada e
 * nunca lança por causa do conteúdo: arquivo ilegível vira "desconhecido"
 * com aviso, para a tela seguir com o preenchimento manual.
 */
export async function lerVoucherPdf(arquivo: Buffer): Promise<VoucherLeitura> {
  let texto: string;
  try {
    texto = await textoDoPdf(arquivo);
  } catch {
    return {
      tipo: "desconhecido",
      campos: {},
      avisos: ["Não consegui abrir este PDF — se ele for uma imagem escaneada, preencha os campos à mão."],
    };
  }
  if (texto.trim().length < 40) {
    return {
      tipo: "desconhecido",
      campos: {},
      avisos: ["Este PDF não tem texto (provavelmente é uma imagem escaneada) — preencha os campos à mão."],
    };
  }
  return lerVoucher(texto);
}
