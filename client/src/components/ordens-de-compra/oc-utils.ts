/**
 * Ordens de compra — regras de TELA (28/10, Fase 2 MANUAL). Só leitura do que
 * o servidor já decidiu (estado, ações possíveis, conferência): aqui ficam a
 * fila (o que cada bloco conta e recorta), a busca, as datas por extenso e a
 * leitura do arquivo do lote no navegador.
 */
import { ROTULO_DA_ORIGEM_DA_OC, type EstadoDoPagamento, type OrigemDaOc } from "@shared/honorarios-pagamento";
import { normalizarBusca } from "@shared/contratos";
import { RETORNO_MAX_COLUNAS, enxugarMatrizDoRetorno, matrizDoCsv, type CelulaDoRetorno } from "@shared/retorno-m4";
import type { LinhaDaOc } from "./tipos";

// ── Datas e valores ─────────────────────────────────────────────────────────

/** "05/11" de "2026-11-05". */
export const ddmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
/** "05/11/2026". */
export const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** "R$ 1.234,56" de centavos. */
export const reais = (centavos: number | null | undefined) => BRL.format((Number(centavos) || 0) / 100);

/** "Digitada", "Lote colado", "Arquivo do M4". */
export const rotuloDaOrigem = (o: string | null | undefined) => (o ? ROTULO_DA_ORIGEM_DA_OC[o as OrigemDaOc] ?? o : "");

// ── Fila ────────────────────────────────────────────────────────────────────

/** Os blocos da fila. "Devolvida" junta a recusada (as duas pedem conversa com o colaborador). */
export const FILTROS_DA_OC = ["sem_oc", "com_oc", "nf_enviada", "nf_devolvida", "nf_aprovada", "programado", "pago"] as const;
export type FiltroDaOc = (typeof FILTROS_DA_OC)[number];

export function filtroDoEstado(e: EstadoDoPagamento): FiltroDaOc {
  return e === "nf_recusada" ? "nf_devolvida" : e;
}

export interface ContagemDaOc {
  porFiltro: Record<FiltroDaOc, number>;
  /** Valor aprovado somado em cada bloco (centavos). */
  valorPorFiltro: Record<FiltroDaOc, number>;
  /** Isentos de NF na escalação: ficam na lista, fora da fila. */
  naoEmiteNf: number;
  /** Sem OC e com CNPJ sem contrato ativo — a OC sai só com justificativa. */
  semOcExigemJustificativa: number;
  /** Notas com divergência na conferência (OC, valor ou CNPJ). */
  divergentes: number;
  recusadas: number;
  total: number;
}

export function contarOcs(linhas: readonly LinhaDaOc[]): ContagemDaOc {
  const porFiltro = Object.fromEntries(FILTROS_DA_OC.map((f) => [f, 0])) as Record<FiltroDaOc, number>;
  const valorPorFiltro = Object.fromEntries(FILTROS_DA_OC.map((f) => [f, 0])) as Record<FiltroDaOc, number>;
  let naoEmiteNf = 0;
  let semOcExigemJustificativa = 0;
  let divergentes = 0;
  let recusadas = 0;
  for (const l of linhas) {
    if (!l.emiteNf) { naoEmiteNf += 1; continue; }
    const f = filtroDoEstado(l.estado);
    porFiltro[f] += 1;
    valorPorFiltro[f] += l.oc?.valor ?? l.valorAprovado;
    if (l.acoes.registrarOc && l.acoes.exigeJustificativa) semOcExigemJustificativa += 1;
    if (temDivergencia(l)) divergentes += 1;
    if (l.estado === "nf_recusada") recusadas += 1;
  }
  return { porFiltro, valorPorFiltro, naoEmiteNf, semOcExigemJustificativa, divergentes, recusadas, total: linhas.length };
}

/** A nota diverge da OC registrada (OC, valor ou CNPJ) — o destaque da linha. */
export const temDivergencia = (l: Pick<LinhaDaOc, "conferencia" | "nota">): boolean =>
  !!l.nota && !!l.conferencia && l.conferencia.divergencias.length > 0;

/** O texto em que a busca procura: pessoa, nº, função, centro de custo, OC, NF e CNPJ. */
export function textoDeBuscaDaLinha(l: LinhaDaOc): string {
  return normalizarBusca([
    l.colaborador?.nome, l.colaborador?.numero != null ? `#${l.colaborador.numero} ${l.colaborador.numero}` : null,
    l.funcao.nome, l.funcao.centroDeCusto, l.oc?.numero, l.nota?.numero, l.nota?.oc,
    l.cnpjEmissor.cnpj, l.cnpjEmissor.cnpj?.replace(/\D/g, ""), l.cnpjEmissor.razaoSocial,
  ].filter(Boolean).join(" "));
}

/** Recorta pela fila e pela busca, na ordem de nome; quem não emite NF vai para o fim. */
export function filtrarOcs(linhas: readonly LinhaDaOc[], texto: string, filtro: FiltroDaOc | null): LinhaDaOc[] {
  const q = normalizarBusca(texto.trim());
  const termos = q ? q.split(/\s+/) : [];
  return linhas
    .filter((l) => !filtro || (l.emiteNf && filtroDoEstado(l.estado) === filtro))
    .filter((l) => {
      if (termos.length === 0) return true;
      const alvo = textoDeBuscaDaLinha(l);
      return termos.every((t) => alvo.includes(t));
    })
    .sort((a, b) => Number(!a.emiteNf) - Number(!b.emiteNf)
      || (a.colaborador?.nome ?? "").localeCompare(b.colaborador?.nome ?? "", "pt-BR"));
}

/** Programados que dá para marcar como pagos agora (a seleção do lote). */
export const marcaveisComoPago = (linhas: readonly LinhaDaOc[]) => linhas.filter((l) => l.acoes.marcarPago);

// ── A frase do que falta, por estado ────────────────────────────────────────

export function proximoPasso(l: LinhaDaOc): string {
  if (!l.emiteNf) return "Não emite NF (marcado na escalação) — sem OC nem nota por aqui.";
  switch (l.estado) {
    case "sem_oc": return l.acoes.exigeJustificativa ? "Registrar a OC — o CNPJ não tem contrato ativo, vai com justificativa." : "Registrar a OC do M4.";
    case "com_oc": return "Aguardando a nota fiscal (portal do colaborador ou a produção).";
    case "nf_enviada": return "Nota enviada — conferir e aprovar em Notas fiscais.";
    case "nf_devolvida": return "Nota devolvida — aguardando o colaborador reenviar.";
    case "nf_recusada": return "Nota recusada em definitivo — falar com o colaborador.";
    case "nf_aprovada": return "Nota aprovada — falta lançar no M4 (Notas fiscais).";
    case "programado": return l.programadoPara ? `Pagamento programado para ${dataBr(l.programadoPara)} — marcar como pago quando liquidar.` : "Programado — marcar como pago quando liquidar.";
    case "pago": return l.pagamento ? `Pago em ${dataBr(l.pagamento.pagoEm)}.` : "Pago.";
  }
}

// ── Lote: o arquivo vira texto NO NAVEGADOR ─────────────────────────────────

export const TAMANHO_MAXIMO_DO_LOTE = 5 * 1024 * 1024;
export class ErroDoArquivoDoLote extends Error {}

function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * O CSV exportado (ou uma planilha/colagem salva) → o texto do lote. CSV/TXT
 * em UTF-8 ou Windows-1252 (o Excel brasileiro); XLSX: a primeira aba vira
 * CSV com ";" (SheetJS, carregado só aqui). Nada vai para o servidor antes da
 * prévia — e a prévia não grava.
 */
export async function lerArquivoDoLote(arquivo: File): Promise<string> {
  if (arquivo.size > TAMANHO_MAXIMO_DO_LOTE) throw new ErroDoArquivoDoLote("Arquivo grande demais (máx. 5 MB). Divida o lote.");
  const ext = (arquivo.name.split(".").pop() ?? "").toLowerCase();
  const bytes = await arquivo.arrayBuffer();
  if (ext === "csv" || ext === "txt" || ext === "tsv") return decodificar(bytes);
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    let livro;
    try {
      livro = XLSX.read(bytes, { type: "array" });
    } catch {
      throw new ErroDoArquivoDoLote("Não consegui abrir esta planilha. Salve como .csv ou .xlsx e tente de novo.");
    }
    const aba = livro.Sheets[livro.SheetNames[0]];
    if (!aba) throw new ErroDoArquivoDoLote("A planilha está vazia.");
    return XLSX.utils.sheet_to_csv(aba, { FS: ";", blankrows: false });
  }
  throw new ErroDoArquivoDoLote("Use o CSV exportado (ou uma planilha .xlsx/.csv).");
}

/** Linhas não vazias do texto colado (o que o lote vai ler). */
export const linhasDoTexto = (texto: string) => texto.split(/\r?\n/).filter((l) => l.trim()).length;

// ── Retorno do M4: a planilha vira células NO NAVEGADOR (28/10) ─────────────

/**
 * O retorno do M4 (CSV ou XLSX) → as células que a prévia lê
 * (shared/retorno-m4.ts). CSV/TXT em UTF-8 ou Windows-1252, lido como TEXTO
 * (";", "," ou tabulação; BOM tirado); XLSX: a primeira aba com os valores
 * CRUS (data como série do Excel, valor como número — sem depender do formato
 * de exibição). O arquivo não sobe: só as células, e a prévia não grava.
 */
export async function lerArquivoDoRetorno(arquivo: File): Promise<CelulaDoRetorno[][]> {
  if (arquivo.size > TAMANHO_MAXIMO_DO_LOTE) throw new ErroDoArquivoDoLote("Arquivo grande demais (máx. 5 MB). Divida o retorno.");
  const ext = (arquivo.name.split(".").pop() ?? "").toLowerCase();
  const bytes = await arquivo.arrayBuffer();
  let matriz: CelulaDoRetorno[][];
  if (ext === "csv" || ext === "txt" || ext === "tsv") matriz = matrizDoCsv(decodificar(bytes));
  else if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    let livro;
    try {
      livro = XLSX.read(bytes, { type: "array" });
    } catch {
      throw new ErroDoArquivoDoLote("Não consegui abrir esta planilha. Salve como .csv ou .xlsx e tente de novo.");
    }
    const aba = livro.Sheets[livro.SheetNames[0]];
    if (!aba) throw new ErroDoArquivoDoLote("A planilha está vazia.");
    // Linhas em branco ficam: o nº da linha na prévia é o do Excel.
    const cru = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: "", blankrows: true });
    matriz = cru.map((l) => (Array.isArray(l) ? l.slice(0, RETORNO_MAX_COLUNAS).map((v): CelulaDoRetorno => (
      v == null ? "" : typeof v === "number" ? v : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim()
    )) : []));
  } else throw new ErroDoArquivoDoLote("Use a planilha do retorno do M4 (.xlsx ou .csv).");
  matriz = matriz.map((l) => l.slice(0, RETORNO_MAX_COLUNAS));
  // Só as linhas vazias do FIM saem (as do meio contam no nº da linha).
  while (matriz.length > 0 && matriz[matriz.length - 1].every((c) => c === "" || c == null)) matriz.pop();
  if (matriz.length === 0) throw new ErroDoArquivoDoLote("A planilha está vazia.");
  // Só as colunas do retorno vão para o servidor (a descrição e o resto do arquivo de OC ficam aqui).
  return enxugarMatrizDoRetorno(matriz);
}
