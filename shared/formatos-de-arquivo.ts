/**
 * Formatos DECLARATIVOS dos arquivos que o DP leva para fora do app (28/10,
 * Honorários — Fase 3, arquivos):
 *
 *  - o arquivo de COMPRA da Flash (créditos de alimentação e mobilidade por
 *    colaborador — tela Cartão Flash);
 *  - o arquivo de OC do M4 (prestadores aprovados sem OC + uma linha por lote
 *    de compra da Flash — tela Ordens de compra).
 *
 * Os layouts oficiais (o da Flash e o do importador de OC do M4) ainda não
 * chegaram. Os dois formatos abaixo são PROVISÓRIOS e dizem isso no topo do
 * arquivo e no nome. Um formato é só DADO — colunas (título + campo + tipo, na
 * ordem do arquivo), separador, decimal, data, documento, BOM e quebra de
 * linha —; o motor (`csvDoArquivo`, `matrizDoArquivo`, `nomeDoArquivo`) não
 * muda quando o layout mudar.
 *
 * TODO(layout oficial, 28/10): quando chegarem os layouts da Flash e do
 * importador de OC do M4, troque SÓ `FORMATO_COMPRA_FLASH` e `FORMATO_OC_M4`
 * (e `FORNECEDOR_FLASH`) aqui embaixo — títulos, ordem, separador, decimal,
 * data e documento — e ponha `provisorio: false`. As rotas, as telas e os
 * lotes já gravados não mudam; os testes em formatos-de-arquivo.test.ts dizem
 * o que conferir.
 *
 * Funções puras — servidor e testes.
 */

// ── O motor ─────────────────────────────────────────────────────────────────

/** Como o valor de um campo vira texto (CSV) ou célula (XLSX). */
export type TipoDaColuna =
  /** texto livre */
  | "texto"
  /** inteiro sem milhar (ex.: nº do lote) */
  | "inteiro"
  /** valor em CENTAVOS no dado; sai em reais com o `decimal` do formato */
  | "centavos"
  /** "AAAA-MM-DD" no dado; sai no `formatoDaData` do formato */
  | "data"
  /** CPF só com dígitos no dado; sai em `documentos` do formato */
  | "cpf"
  /** CNPJ só com dígitos no dado; sai em `documentos` do formato */
  | "cnpj";

export interface ColunaDoFormato<L> {
  /** O título no cabeçalho do arquivo. */
  titulo: string;
  /** De onde vem o valor na linha. */
  campo: Extract<keyof L, string>;
  tipo: TipoDaColuna;
}

export interface FormatoDeArquivo<L> {
  /** Identificador gravado no lote (ex.: "flash-provisorio-v1"). */
  id: string;
  /** Nome legível (aparece na marca do topo e na tela). */
  nome: string;
  /** Provisório: marca no topo do arquivo e "-layout-provisorio" no nome. */
  provisorio: boolean;
  /** Texto da marca do topo (só quando provisório). */
  marcaDoTopo: string;
  separador: ";" | "," | "\t" | "|";
  /** Separador decimal dos valores no CSV. */
  decimal: "," | ".";
  formatoDaData: "dd/mm/aaaa" | "aaaa-mm-dd";
  /** CPF/CNPJ só com dígitos ou com a máscara (000.000.000-00 / 00.000.000/0000-00). */
  documentos: "digitos" | "mascara";
  /** Linha de títulos antes dos dados. */
  cabecalho: boolean;
  /** UTF-8 com BOM (o Excel brasileiro abre com acento). */
  bom: boolean;
  quebraDeLinha: "\r\n" | "\n";
  /** Começo do nome do arquivo (sem extensão). */
  prefixoDoArquivo: string;
  /** Nome da aba no XLSX (até 31 caracteres). */
  nomeDaAba: string;
  colunas: readonly ColunaDoFormato<L>[];
}

export type ValorDaCelula = string | number | null | undefined;

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function dataNoFormato(iso: string, formato: FormatoDeArquivo<unknown>["formatoDaData"]): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return formato === "dd/mm/aaaa" ? `${m[3]}/${m[2]}/${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

function documentoNoFormato(v: unknown, tipo: "cpf" | "cnpj", estilo: "digitos" | "mascara"): string {
  const d = so(v);
  if (!d) return "";
  if (estilo === "digitos") return d;
  if (tipo === "cpf" && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (tipo === "cnpj" && d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/** Centavos → reais com 2 casas, sem milhar, no decimal do formato. */
export function reaisNoFormato(centavos: number | null | undefined, decimal: "," | "."): string {
  if (centavos == null || !Number.isFinite(centavos)) return "";
  const t = (Math.round(centavos) / 100).toFixed(2);
  return decimal === "," ? t.replace(".", ",") : t;
}

/** O texto de uma célula, já no formato (sem o escape do CSV). */
export function textoDaCelula<L>(formato: FormatoDeArquivo<L>, coluna: ColunaDoFormato<L>, linha: L): string {
  const v = (linha as Record<string, unknown>)[coluna.campo];
  if (v == null || v === "") return "";
  switch (coluna.tipo) {
    case "centavos": return reaisNoFormato(Number(v), formato.decimal);
    case "inteiro": return String(Math.trunc(Number(v)));
    case "data": return dataNoFormato(String(v), formato.formatoDaData);
    case "cpf":
    case "cnpj": return documentoNoFormato(v, coluna.tipo, formato.documentos);
    default: return String(v);
  }
}

/**
 * Escape de uma célula de CSV para o separador dado: aspas quando precisa e um
 * apóstrofo antes de =, +, -, @ (o Excel não executa a célula como fórmula).
 * Documento e valor nunca começam com esses sinais.
 */
export function escaparCelula(texto: string, separador: string): string {
  let t = texto;
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  const precisa = t.includes(separador) || /["\r\n]/.test(t) || /^\s|\s$/.test(t);
  return precisa ? `"${t.replace(/"/g, "\"\"")}"` : t;
}

/** A marca "layout provisório" do topo (vazia no layout oficial). */
export function marcaDoTopo(formato: FormatoDeArquivo<unknown>, geradoEm: string): string | null {
  if (!formato.provisorio) return null;
  return `${formato.marcaDoTopo} · gerado em ${dataNoFormato(geradoEm, "dd/mm/aaaa")}`;
}

/** O CSV inteiro: marca (provisório), cabeçalho e linhas, no separador/BOM/quebra do formato. */
export function csvDoArquivo<L>(formato: FormatoDeArquivo<L>, linhas: readonly L[], geradoEm: string): string {
  const sep = formato.separador;
  const saida: string[] = [];
  const marca = marcaDoTopo(formato as FormatoDeArquivo<unknown>, geradoEm);
  if (marca) saida.push(escaparCelula(marca, sep));
  if (formato.cabecalho) saida.push(formato.colunas.map((c) => escaparCelula(c.titulo, sep)).join(sep));
  for (const l of linhas) saida.push(formato.colunas.map((c) => escaparCelula(textoDaCelula(formato, c, l), sep)).join(sep));
  return `${formato.bom ? "﻿" : ""}${saida.join(formato.quebraDeLinha)}${formato.quebraDeLinha}`;
}

/**
 * As células do XLSX: igual ao CSV, mas valor em reais como NÚMERO (o Excel
 * soma) e inteiro como número. Documento e data continuam texto.
 */
export function matrizDoArquivo<L>(formato: FormatoDeArquivo<L>, linhas: readonly L[], geradoEm: string): ValorDaCelula[][] {
  const m: ValorDaCelula[][] = [];
  const marca = marcaDoTopo(formato as FormatoDeArquivo<unknown>, geradoEm);
  if (marca) m.push([marca]);
  if (formato.cabecalho) m.push(formato.colunas.map((c) => c.titulo));
  for (const l of linhas) {
    m.push(formato.colunas.map((c) => {
      const v = (l as Record<string, unknown>)[c.campo];
      if (v == null || v === "") return "";
      if (c.tipo === "centavos") return Math.round(Number(v)) / 100;
      if (c.tipo === "inteiro") return Math.trunc(Number(v));
      return textoDaCelula(formato, c, l);
    }));
  }
  return m;
}

/** "compra-flash-lote-12-layout-provisorio.csv". */
export function nomeDoArquivo(formato: FormatoDeArquivo<unknown>, complemento: string, extensao: "csv" | "xlsx"): string {
  const partes = [formato.prefixoDoArquivo, complemento].filter(Boolean).join("-");
  const limpo = partes.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${limpo}${formato.provisorio ? "-layout-provisorio" : ""}.${extensao}`;
}

// ── Arquivo de COMPRA da Flash ──────────────────────────────────────────────

/** Uma linha do arquivo de compra: um colaborador do lote. */
export interface LinhaDoArquivoFlash {
  /** Só dígitos (o arquivo leva o CPF completo — download auditado). */
  cpf: string;
  nome: string;
  alimentacaoCents: number;
  mobilidadeCents: number;
  totalCents: number;
  lote: number;
}

export const FORMATO_COMPRA_FLASH: FormatoDeArquivo<LinhaDoArquivoFlash> = {
  id: "flash-provisorio-v1",
  nome: "Compra de créditos Flash",
  provisorio: true,
  marcaDoTopo: "LAYOUT PROVISÓRIO — aguardando o layout oficial da Flash · confira antes de subir",
  separador: ";",
  decimal: ",",
  formatoDaData: "dd/mm/aaaa",
  documentos: "digitos",
  cabecalho: true,
  bom: true,
  quebraDeLinha: "\r\n",
  prefixoDoArquivo: "compra-flash",
  nomeDaAba: "Compra Flash",
  colunas: [
    { titulo: "CPF", campo: "cpf", tipo: "cpf" },
    { titulo: "Nome", campo: "nome", tipo: "texto" },
    { titulo: "Alimentação (R$)", campo: "alimentacaoCents", tipo: "centavos" },
    { titulo: "Mobilidade (R$)", campo: "mobilidadeCents", tipo: "centavos" },
    { titulo: "Total (R$)", campo: "totalCents", tipo: "centavos" },
    { titulo: "Lote", campo: "lote", tipo: "inteiro" },
  ],
};

// ── Arquivo de OC do M4 (prestadores + Flash) ───────────────────────────────

export type TipoDaLinhaDeOc = "prestador" | "flash";

/** Uma linha do arquivo de OC: uma prestação aprovada sem OC OU um lote da Flash. */
export interface LinhaDoArquivoDeOc {
  tipo: string;
  /** CNPJ do fornecedor (emissor da NF, ou a Flash), só dígitos. */
  cnpj: string;
  razaoSocial: string;
  valorCents: number;
  centroDeCusto: string;
  evento: string;
  /** Fim do evento (prestador) ou o dia em que o lote foi gerado (Flash). */
  data: string;
  funcao: string;
  descricao: string;
  /** Id da prestação (prestador) ou "Lote N" (Flash) — para achar de volta. */
  referencia: string;
}

/** O fornecedor das linhas da Flash no arquivo de OC (troque com o layout oficial). */
export const FORNECEDOR_FLASH = { razaoSocial: "FLASH BENEFÍCIOS", cnpj: "" } as const;

export const ROTULO_DO_TIPO_DE_OC: Record<TipoDaLinhaDeOc, string> = { prestador: "Prestador", flash: "Flash" };

export const FORMATO_OC_M4: FormatoDeArquivo<LinhaDoArquivoDeOc> = {
  id: "oc-m4-provisorio-v1",
  nome: "OC de prestadores + Flash (M4)",
  provisorio: true,
  marcaDoTopo: "LAYOUT PROVISÓRIO — aguardando o layout do importador de OC do M4 · confira antes de importar",
  separador: ";",
  decimal: ",",
  formatoDaData: "dd/mm/aaaa",
  documentos: "mascara",
  cabecalho: true,
  bom: true,
  quebraDeLinha: "\r\n",
  prefixoDoArquivo: "oc-m4",
  nomeDaAba: "OC M4",
  colunas: [
    { titulo: "Tipo", campo: "tipo", tipo: "texto" },
    { titulo: "CNPJ do fornecedor", campo: "cnpj", tipo: "cnpj" },
    { titulo: "Razão social", campo: "razaoSocial", tipo: "texto" },
    { titulo: "Valor (R$)", campo: "valorCents", tipo: "centavos" },
    { titulo: "Centro de custo", campo: "centroDeCusto", tipo: "texto" },
    { titulo: "Evento", campo: "evento", tipo: "texto" },
    { titulo: "Data", campo: "data", tipo: "data" },
    { titulo: "Função", campo: "funcao", tipo: "texto" },
    { titulo: "Descrição sugerida", campo: "descricao", tipo: "texto" },
    { titulo: "Referência", campo: "referencia", tipo: "texto" },
  ],
};

const diaMes = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** "Prestação de serviços de Produtor no evento X de 30/10 a 01/11/2026." */
export function descricaoDaOcDoPrestador(d: { funcao?: string | null; evento: string; inicio?: string | null; fim?: string | null }): string {
  const periodo = d.inicio && d.fim
    ? d.inicio === d.fim ? ` em ${dataBr(d.inicio)}` : ` de ${diaMes(d.inicio)} a ${dataBr(d.fim)}`
    : "";
  return `Prestação de serviços${d.funcao ? ` de ${d.funcao}` : ""} no evento ${d.evento}${periodo}.`;
}

/** "Crédito Flash alimentação/mobilidade — lote 12 (01/10 a 31/10/2026)". */
export function descricaoDaOcDoLoteFlash(d: { numero: number; inicio?: string | null; fim?: string | null; evento?: string | null }): string {
  const periodo = d.inicio && d.fim ? ` (${d.inicio === d.fim ? dataBr(d.inicio) : `${diaMes(d.inicio)} a ${dataBr(d.fim)}`})` : "";
  return `Crédito Flash alimentação/mobilidade — lote ${d.numero}${d.evento ? ` · ${d.evento}` : ""}${periodo}`;
}
