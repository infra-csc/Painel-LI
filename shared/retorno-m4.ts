/**
 * Importação do RETORNO DO M4 por planilha (28/10, Honorários — "Plano B":
 * sem API, tudo por arquivo). O DP exporta o arquivo de OC (prestadores +
 * lotes Flash), o M4 gera as OCs, programa e liquida, e devolve uma planilha
 * com, por linha: a Referência (a mesma do arquivo exportado), o nº da OC, a
 * situação, a data programada, a data de liquidação e o valor. Aqui:
 *
 *  1. `matrizDoCsv` — o CSV (";", "," ou tabulação; com ou sem BOM) vira
 *     células em TEXTO (o XLSX é lido no navegador e chega como células);
 *  2. `lerRetornoM4` — acha o cabeçalho pelos títulos de `FORMATO_RETORNO_M4`
 *     (layout PROVISÓRIO; o TODO de troca está em shared/formatos-de-arquivo.ts)
 *     e lê cada linha (situação com variações de texto/acento/caixa, datas
 *     dd/mm/aaaa, ISO ou série do Excel, valor com vírgula ou ponto);
 *  3. `proporRetornoM4` — contra o estado do app, a AÇÃO de cada linha:
 *     registrar a OC (etapa 4), programar (= "Lançar no M4" da NF aprovada) e
 *     marcar como pago (etapa 7) — com as MESMAS regras das ações manuais
 *     (shared/honorarios-pagamento.ts, shared/prestacao-rules.ts,
 *     shared/flash-compras.ts) — ou o problema legível.
 *
 * Decisões:
 *  - a chave é a "Referência" do arquivo de OC (id da prestação ou "Lote N");
 *    sem chave substituta — ver o comentário de `FORMATO_RETORNO_M4`;
 *  - VALOR DIVERGENTE NÃO APLICA: o valor do M4 é conferido com a OC
 *    registrada (ou, sem OC, com o total aprovado; no lote Flash, com o total
 *    do lote) e, se diferir, a linha inteira fica de fora como problema;
 *  - a linha é tudo ou nada: qualquer problema tira a linha inteira (a OC não
 *    entra sozinha se a programação da mesma linha não pode);
 *  - idempotente: o que já está no app igual ao M4 é "sem mudança — já estava
 *    assim"; data de pagamento diferente da já gravada é problema (o pago não
 *    é trocado por arquivo); data programada diferente é só aviso;
 *  - OC registrada pelo retorno: origem "m4", data = o dia da importação, e a
 *    MESMA justificativa exigida das outras OCs quando o CNPJ emissor não tem
 *    contrato ativo (uma para o arquivo, como no lote);
 *  - lote Flash: o app só guarda a liquidação (marca o lote como pago à
 *    Flash); programado/emitida não muda nada no lote.
 *
 * Funções puras — servidor, tela e testes.
 */
import { normalizarBusca } from "./contratos";
import { lerDataDaPlanilha } from "./importacao-contratos";
import {
  MSG_NAO_EMITE_NF, ROTULO_DO_ESTADO_DO_PAGAMENTO, erroDaDataPassada, erroDoNumeroDaOc, estadoDoPagamento, lerValorEmReais, mesmaOc,
  normalizarNumeroDaOc, notaProgramada, ocExigeJustificativa, podeRegistrarOc, reaisDoPagamento, type PrestacaoDoPagamento,
} from "./honorarios-pagamento";
import { podeFazerCheckin } from "./prestacao-rules";
import { podeMarcarLotePago } from "./flash-compras";
import {
  FORMATO_RETORNO_M4, type ColunaDeLeitura, type FormatoDeLeitura, type LinhaDoRetornoM4, type SituacaoDoRetornoM4,
} from "./formatos-de-arquivo";
import type { SituacaoDoCnpjInformado } from "./presenca";

/** Uma célula como chega: texto (CSV) ou o valor cru da planilha (XLSX). */
export type CelulaDoRetorno = string | number | null;

/** Colunas por linha aceitas (acima disso o arquivo não é um retorno). */
export const RETORNO_MAX_COLUNAS = 80;

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const isoDe = (v: string | Date | null | undefined): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10) || null;

// ── 1. CSV → células ────────────────────────────────────────────────────────

/**
 * O CSV do retorno em células de TEXTO. Tira o BOM; o separador é o de
 * `formato.separadores` que mais aparece numa das 10 primeiras linhas (a
 * marca "layout provisório" do topo não tem separador e não decide nada).
 * Aspas: "a;b" fica numa célula e "" vira ".
 */
export function matrizDoCsv(texto: string, formato: Pick<FormatoDeLeitura<unknown, string>, "separadores"> = FORMATO_RETORNO_M4): string[][] {
  const t = String(texto ?? "").replace(/^﻿/, "");
  const topo = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const conta = (sep: string) => Math.max(0, ...topo.map((l) => l.split(sep).length - 1));
  const sep = [...formato.separadores].sort((a, b) => conta(b) - conta(a))[0] ?? ";";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let cel = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === "\"" && t[i + 1] === "\"") { cel += "\""; i++; }
      else if (ch === "\"") aspas = false;
      else cel += ch;
    } else if (ch === "\"" && cel.trim() === "") { cel = ""; aspas = true; }
    else if (ch === sep) { linha.push(cel); cel = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(cel); linhas.push(linha); linha = []; cel = "";
    } else cel += ch;
  }
  if (cel !== "" || linha.length > 0) { linha.push(cel); linhas.push(linha); }
  return linhas.map((l) => l.map((x) => x.trim()));
}

// ── 2. Leitura das linhas ───────────────────────────────────────────────────

/** Título/texto para comparar: sem acento, sem caixa, sem pontuação ("Nº da OC" → "n da oc"). */
export const normalizarTitulo = (t: unknown): string =>
  normalizarBusca(String(t ?? "")).replace(/[º°ª#]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const textoDaCelula = (v: CelulaDoRetorno | undefined): string => {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : String(v)) : "";
  return String(v).trim();
};

/** A situação escrita → a do formato. Vazia → null; desconhecida → erro. */
export function lerSituacaoDoRetorno(
  v: CelulaDoRetorno | undefined, formato: Pick<FormatoDeLeitura<unknown, SituacaoDoRetornoM4>, "situacoes"> = FORMATO_RETORNO_M4,
): { situacao: SituacaoDoRetornoM4 | null } | { erro: string } {
  const t = normalizarTitulo(textoDaCelula(v));
  if (!t) return { situacao: null };
  for (const [s, textos] of Object.entries(formato.situacoes) as [SituacaoDoRetornoM4, readonly string[]][]) {
    if (textos.some((x) => normalizarTitulo(x) === t)) return { situacao: s };
  }
  return { erro: `Situação "${textoDaCelula(v)}" não reconhecida — use programado ou liquidado.` };
}

/**
 * Valor em reais → centavos. Número da planilha (XLSX) vale como está
 * (1234.5 → 123450); texto: "1.234,56", "1234,56", "1234.56", "R$ 1.234,56".
 */
export function lerValorDoRetorno(v: CelulaDoRetorno | undefined): { centavos: number | null } | { erro: string } {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return { erro: `Valor inválido: "${v}"` };
    return { centavos: Math.round(v * 100) };
  }
  return lerValorEmReais(textoDaCelula(v));
}

/** Data: "dd/mm/aaaa", "aaaa-mm-dd" (com hora também) ou série do Excel. */
export function lerDataDoRetorno(v: CelulaDoRetorno | undefined): { data: string | null } | { erro: string } {
  return lerDataDaPlanilha(textoDaCelula(v));
}

/** "Lote 12", "lote nº 12", "LOTE-12" → 12; outra coisa → null. */
export function numeroDoLoteFlash(referencia: string | null | undefined): number | null {
  const m = /^lote\s*(?:n\s*[º°o.]?\s*)?[-#:]?\s*(\d{1,9})$/i.exec(String(referencia ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** Uma linha de dados do retorno, lida (ainda sem olhar o app). */
export interface LinhaLidaDoRetorno {
  /** Nº da linha na planilha (1 = primeira linha do arquivo — a que o DP vê no Excel). */
  linha: number;
  referencia: string;
  numeroOc: string | null;
  situacao: SituacaoDoRetornoM4 | null;
  dataProgramada: string | null;
  dataLiquidacao: string | null;
  valorCents: number | null;
  /** Erros de LEITURA (data, valor ou situação que não se lê). */
  erros: string[];
  /** Sem nº da OC e sem situação: o M4 ainda não devolveu esta linha. */
  semRetorno: boolean;
}

export interface LeituraDoRetorno {
  /** Erro do arquivo inteiro (sem cabeçalho, linhas demais); null = lido. */
  erro: string | null;
  linhas: LinhaLidaDoRetorno[];
  /** Colunas do formato achadas no cabeçalho (título como estava no arquivo). */
  colunas: Partial<Record<keyof LinhaDoRetornoM4, string>>;
}

/** Onde está cada coluna do formato nesta linha (se ela for o cabeçalho). */
function colunasDaLinha<L>(celulas: readonly CelulaDoRetorno[], colunas: readonly ColunaDeLeitura<L>[]): Map<string, number> {
  const titulos = celulas.map((c) => normalizarTitulo(textoDaCelula(c)));
  const achadas = new Map<string, number>();
  const usadas = new Set<number>();
  for (const col of colunas) {
    const aceitos = col.titulos.map(normalizarTitulo);
    const i = titulos.findIndex((t, idx) => !usadas.has(idx) && !!t && aceitos.includes(t));
    if (i >= 0) { achadas.set(col.campo, i); usadas.add(i); }
  }
  return achadas;
}

const vazia = (l: readonly CelulaDoRetorno[] | undefined) => !l || l.every((c) => textoDaCelula(c) === "");

/**
 * A linha do cabeçalho (-1 = não achou) e onde está cada coluna do formato;
 * `melhor` é a linha que mais se pareceu com o cabeçalho (para dizer o que falta).
 */
function acharCabecalho<L, S extends string>(matriz: readonly (readonly CelulaDoRetorno[])[], formato: FormatoDeLeitura<L, S>) {
  const obrigatorias = formato.colunas.filter((c) => c.obrigatoria);
  let vistas = 0;
  let melhor = new Map<string, number>();
  for (let i = 0; i < matriz.length && vistas <= formato.linhasAntesDoCabecalho; i++) {
    if (vazia(matriz[i])) continue;
    vistas += 1;
    const achadas = colunasDaLinha(matriz[i], formato.colunas);
    if (obrigatorias.every((c) => achadas.has(c.campo))) return { cabecalho: i, posicoes: achadas, melhor: achadas };
    if (achadas.size > melhor.size) melhor = achadas;
  }
  return { cabecalho: -1, posicoes: new Map<string, number>(), melhor };
}

/**
 * Só as colunas do formato, na ordem do formato (o navegador manda isto, não
 * a planilha inteira: o arquivo de OC devolvido tem a descrição e o resto —
 * peso à toa). O nº de cada linha não muda. Sem cabeçalho reconhecível, volta
 * como está (o servidor diz o que falta).
 */
export function enxugarMatrizDoRetorno(
  matriz: readonly (readonly CelulaDoRetorno[])[],
  formato: FormatoDeLeitura<LinhaDoRetornoM4, SituacaoDoRetornoM4> = FORMATO_RETORNO_M4,
): CelulaDoRetorno[][] {
  const { cabecalho, posicoes } = acharCabecalho(matriz, formato);
  if (cabecalho < 0) return matriz.map((l) => [...l]);
  const indices = formato.colunas.map((c) => posicoes.get(c.campo)).filter((i): i is number => i != null);
  return matriz.map((l) => (vazia(l) ? [] : indices.map((i) => l[i] ?? "")));
}

/**
 * Lê as linhas do retorno. O cabeçalho é a primeira linha (entre as
 * `linhasAntesDoCabecalho + 1` primeiras não vazias) com todas as colunas
 * obrigatórias; colunas a mais (o resto do arquivo de OC) são ignoradas.
 * Linha vazia é pulada.
 */
export function lerRetornoM4(
  matriz: readonly (readonly CelulaDoRetorno[])[],
  formato: FormatoDeLeitura<LinhaDoRetornoM4, SituacaoDoRetornoM4> = FORMATO_RETORNO_M4,
): LeituraDoRetorno {
  const obrigatorias = formato.colunas.filter((c) => c.obrigatoria);
  const { cabecalho, posicoes, melhor } = acharCabecalho(matriz, formato);
  if (cabecalho < 0) {
    const faltam = obrigatorias.filter((c) => !melhor.has(c.campo)).map((c) => `“${c.titulos[0]}”`);
    return {
      erro: matriz.every((l) => vazia(l))
        ? "O arquivo está vazio."
        : `Não achei o cabeçalho do retorno do M4: ${faltam.length === 1 ? "falta a coluna" : "faltam as colunas"} ${faltam.join(", ")} (layout provisório — veja as colunas esperadas).`,
      linhas: [],
      colunas: {},
    };
  }
  const colunas: LeituraDoRetorno["colunas"] = {};
  for (const [campo, i] of Array.from(posicoes.entries())) colunas[campo as keyof LinhaDoRetornoM4] = textoDaCelula(matriz[cabecalho][i]);

  const dados = matriz.map((l, i) => ({ l, n: i + 1 })).slice(cabecalho + 1).filter((x) => !vazia(x.l));
  if (dados.length > formato.maxLinhas) {
    return { erro: `O arquivo tem ${dados.length} linhas — o máximo é ${formato.maxLinhas.toLocaleString("pt-BR")}. Divida o retorno.`, linhas: [], colunas };
  }
  const celula = (l: readonly CelulaDoRetorno[], campo: keyof LinhaDoRetornoM4) => {
    const i = posicoes.get(campo);
    return i == null ? undefined : l[i];
  };
  const linhas = dados.map(({ l, n }): LinhaLidaDoRetorno => {
    const erros: string[] = [];
    const referencia = textoDaCelula(celula(l, "referencia"));
    const numeroOc = normalizarNumeroDaOc(textoDaCelula(celula(l, "numeroOc"))) || null;
    const sit = lerSituacaoDoRetorno(celula(l, "situacao"), formato);
    const prog = lerDataDoRetorno(celula(l, "dataProgramada"));
    const liq = lerDataDoRetorno(celula(l, "dataLiquidacao"));
    const valor = lerValorDoRetorno(celula(l, "valorCents"));
    if ("erro" in sit) erros.push(sit.erro);
    if ("erro" in prog) erros.push(`Data programada: ${prog.erro.toLowerCase()}`);
    if ("erro" in liq) erros.push(`Data de liquidação: ${liq.erro.toLowerCase()}`);
    if ("erro" in valor) erros.push(valor.erro);
    const situacao = "situacao" in sit ? sit.situacao : null;
    return {
      linha: n, referencia, numeroOc, situacao,
      dataProgramada: "data" in prog ? prog.data : null,
      dataLiquidacao: "data" in liq ? liq.data : null,
      valorCents: "centavos" in valor ? valor.centavos : null,
      erros,
      semRetorno: !numeroOc && !textoDaCelula(celula(l, "situacao")),
    };
  });
  return { erro: null, linhas, colunas };
}

// ── 3. A ação de cada linha, contra o estado do app ─────────────────────────

/** O que a proposta precisa saber de uma prestação (o servidor monta). */
export interface PrestacaoNoRetorno extends PrestacaoDoPagamento {
  id: string;
  colaboradorNome: string | null;
  eventoNome: string | null;
  /** Evento do fluxo antigo (antes da data de corte). */
  legado: boolean;
  emiteNf: boolean;
  totalValue: number;
  ocValor: number | null;
  situacaoDoCnpj: SituacaoDoCnpjInformado;
  nota: { id: string; status: string; checkinAt: string | Date | null; paymentDate: string | null } | null;
}

export interface LoteFlashNoRetorno {
  id: string;
  numero: number;
  status: string;
  totalCents: number;
  pagoEm: string | null;
}

export interface EstadoDoRetorno {
  /** Por id da prestação, em minúsculas. */
  prestacoes: ReadonlyMap<string, PrestacaoNoRetorno>;
  /** Por nº do lote. */
  lotes: ReadonlyMap<number, LoteFlashNoRetorno>;
}

export const ACOES_DO_RETORNO = ["registrar_oc", "programar", "marcar_pago"] as const;
export type AcaoDoRetorno = (typeof ACOES_DO_RETORNO)[number];
export type ResultadoDaLinhaDoRetorno = "aplicar" | "sem_mudanca" | "problema";

export interface LinhaPropostaDoRetorno {
  linha: number;
  referencia: string;
  tipo: "prestador" | "flash" | null;
  /** Id da prestação ou do lote Flash (null = não achado). */
  alvoId: string | null;
  /** Quem/o quê: o colaborador ou "Lote Flash 12". */
  quem: string | null;
  evento: string | null;
  numeroOc: string | null;
  situacao: SituacaoDoRetornoM4 | null;
  dataProgramada: string | null;
  dataLiquidacao: string | null;
  valorCents: number | null;
  acoes: AcaoDoRetorno[];
  resultado: ResultadoDaLinhaDoRetorno;
  /** Os porquês do problema (a linha fica de fora). */
  problemas: string[];
  avisos: string[];
  /** A frase da linha: o que vai mudar, "já estava assim" ou o 1º problema. */
  frase: string;
  /** CNPJ emissor sem contrato ativo: a OC entra só com a justificativa. */
  exigeJustificativa: boolean;
  /** O que gravar (só em "aplicar"). */
  gravar: {
    oc: { numero: string; valor: number; data: string } | null;
    /** Data programada para o "Lançar no M4" da nota. */
    programarPara: string | null;
    notaId: string | null;
    pagoEm: string | null;
  };
}

export interface ResumoDoRetorno {
  total: number;
  registrarOc: number;
  programar: number;
  marcarPago: number;
  semMudanca: number;
  problema: number;
  /** Linhas que vão gravar alguma coisa. */
  aplicar: number;
  /** Das que aplicam, as que precisam da justificativa (CNPJ sem contrato ativo). */
  exigemJustificativa: number;
}

export interface PreviaDoRetorno {
  erro: string | null;
  linhas: LinhaPropostaDoRetorno[];
  resumo: ResumoDoRetorno;
  formato: { id: string; nome: string; provisorio: boolean };
}

const ROTULO_DA_SITUACAO: Record<SituacaoDoRetornoM4, string> = { emitida: "OC emitida", programado: "programado", liquidado: "liquidado" };

/** "registra a OC 4500 · programa para 05/11/2026 · marca pago em 07/11/2026". */
function fraseDasAcoes(l: Pick<LinhaPropostaDoRetorno, "acoes" | "gravar" | "tipo">): string {
  const partes: string[] = [];
  if (l.acoes.includes("registrar_oc") && l.gravar.oc) partes.push(`Registra a OC ${l.gravar.oc.numero}`);
  if (l.acoes.includes("programar") && l.gravar.programarPara) partes.push(`programa para ${dataBr(l.gravar.programarPara)}`);
  if (l.acoes.includes("marcar_pago") && l.gravar.pagoEm) partes.push(`${l.tipo === "flash" ? "marca o lote pago à Flash" : "marca pago"} em ${dataBr(l.gravar.pagoEm)}`);
  const t = partes.join(" · ");
  return t ? `${t[0].toUpperCase()}${t.slice(1)}.` : "";
}

function linhaBase(l: LinhaLidaDoRetorno): LinhaPropostaDoRetorno {
  return {
    linha: l.linha, referencia: l.referencia, tipo: null, alvoId: null, quem: null, evento: null,
    numeroOc: l.numeroOc, situacao: l.situacao, dataProgramada: l.dataProgramada, dataLiquidacao: l.dataLiquidacao, valorCents: l.valorCents,
    acoes: [], resultado: "problema", problemas: [...l.erros], avisos: [], frase: "", exigeJustificativa: false,
    gravar: { oc: null, programarPara: null, notaId: null, pagoEm: null },
  };
}

/** Valor do M4 × o esperado: a frase do problema, ou null quando bate. */
function divergenciaDoValor(valorM4: number | null, esperado: number, deQue: string): string | null {
  if (valorM4 == null) return "Sem valor para conferir (coluna Valor vazia) — a linha não entra sem a conferência.";
  if (valorM4 === esperado) return null;
  return `Valor do M4 ${reaisDoPagamento(valorM4)} difere ${deQue} ${reaisDoPagamento(esperado)} — a linha fica de fora; confira no M4.`;
}

function proporPrestador(p: LinhaPropostaDoRetorno, a: PrestacaoNoRetorno, hoje: string): void {
  p.tipo = "prestador";
  p.alvoId = a.id;
  p.quem = a.colaboradorNome;
  p.evento = a.eventoNome;
  const problema = (t: string) => p.problemas.push(t);
  if (a.legado) { problema("Prestação de evento do fluxo antigo — a OC e o pagamento seguem como antes, fora do retorno."); return; }
  if (!a.emiteNf) { problema(MSG_NAO_EMITE_NF); return; }

  // Etapa 4 — a OC.
  if (!p.numeroOc) problema("Falta o nº da OC.");
  else {
    const erroOc = erroDoNumeroDaOc(p.numeroOc);
    if (erroOc) problema(erroOc);
  }
  if (a.ocNumero) {
    if (p.numeroOc && !mesmaOc(a.ocNumero, p.numeroOc)) problema(`O M4 devolveu a OC ${p.numeroOc}, mas a registrada no app é ${a.ocNumero}.`);
    const d = divergenciaDoValor(p.valorCents, a.ocValor ?? a.totalValue, "da OC registrada");
    if (d) problema(d);
  } else {
    const pode = podeRegistrarOc(a);
    if (!pode.ok) problema(pode.motivo);
    const d = divergenciaDoValor(p.valorCents, a.totalValue, "do aprovado");
    if (d) problema(d);
    if (pode.ok && p.numeroOc && !erroDoNumeroDaOc(p.numeroOc)) {
      p.acoes.push("registrar_oc");
      p.gravar.oc = { numero: p.numeroOc, valor: a.totalValue, data: hoje };
      if (ocExigeJustificativa(a.situacaoDoCnpj)) {
        p.exigeJustificativa = true;
        p.avisos.push(a.situacaoDoCnpj === "sem_cnpj"
          ? "Sem CNPJ emissor informado — a OC entra só com a justificativa."
          : "CNPJ emissor sem contrato ativo — a OC entra só com a justificativa.");
      }
    }
  }

  // Etapa 7 — programado e liquidado.
  const sit = p.situacao;
  if (sit !== "programado" && sit !== "liquidado") return;
  const estado = ROTULO_DO_ESTADO_DO_PAGAMENTO[estadoDoPagamento({ ocNumero: a.ocNumero, pagoEm: a.pagoEm, nota: a.nota })];
  if (sit === "programado" && !p.dataProgramada) problema("Programado sem a data programada.");
  if (sit === "liquidado") {
    if (!p.dataLiquidacao) problema("Liquidado sem a data de liquidação.");
    else {
      const erro = erroDaDataPassada(p.dataLiquidacao, hoje, "a data de liquidação");
      if (erro) problema(erro);
    }
  }
  const pagoEm = isoDe(a.pagoEm);
  if (pagoEm) {
    if (sit === "liquidado" && p.dataLiquidacao && p.dataLiquidacao !== pagoEm) {
      problema(`Já paga no app em ${dataBr(pagoEm)}; o M4 diz ${dataBr(p.dataLiquidacao)} — confira (o pago não é trocado por arquivo).`);
    } else if (sit === "programado") {
      p.avisos.push(`Já paga no app em ${dataBr(pagoEm)}.`);
    }
    return;
  }
  // Programado no app?
  const programadaPara = notaProgramada(a.nota) ? isoDe(a.nota!.paymentDate) : null;
  const querProgramarPara = p.dataProgramada ?? (sit === "liquidado" ? p.dataLiquidacao : null);
  if (notaProgramada(a.nota)) {
    if (p.dataProgramada && programadaPara && p.dataProgramada !== programadaPara) {
      p.avisos.push(`Já programado no app para ${dataBr(programadaPara)}; o M4 diz ${dataBr(p.dataProgramada)} (a data no app não muda).`);
    }
  } else if (querProgramarPara) {
    if (p.acoes.includes("registrar_oc") || !a.nota) {
      problema(`O M4 diz ${ROTULO_DA_SITUACAO[sit]}, mas a nota fiscal ainda não chegou ao app (${estado}).`);
    } else {
      const pode = podeFazerCheckin(a.nota, querProgramarPara);
      if (!pode.ok) problema(`O M4 diz ${ROTULO_DA_SITUACAO[sit]}, mas a NF ainda não foi aprovada no app (${estado}).`);
      else {
        p.acoes.push("programar");
        p.gravar.programarPara = querProgramarPara;
        p.gravar.notaId = a.nota.id;
      }
    }
  }
  if (sit === "liquidado" && p.dataLiquidacao && (notaProgramada(a.nota) || p.acoes.includes("programar"))) {
    p.acoes.push("marcar_pago");
    p.gravar.pagoEm = p.dataLiquidacao;
  }
}

function proporLote(p: LinhaPropostaDoRetorno, numero: number, lote: LoteFlashNoRetorno | undefined, hoje: string): void {
  p.tipo = "flash";
  p.quem = `Lote Flash ${numero}`;
  if (!lote) { p.problemas.push(`Lote Flash ${numero} não encontrado no app.`); return; }
  p.alvoId = lote.id;
  if (lote.status === "cancelado") { p.problemas.push(`O lote Flash ${numero} foi cancelado no app — não é pago.`); return; }
  const d = divergenciaDoValor(p.valorCents, lote.totalCents, "do total do lote");
  if (d) p.problemas.push(d);
  if (p.situacao !== "liquidado") {
    if (p.situacao === "programado") p.avisos.push("Lote Flash: o app só registra a liquidação — nada muda no programado.");
    return;
  }
  if (!p.dataLiquidacao) { p.problemas.push("Liquidado sem a data de liquidação."); return; }
  if (lote.status === "pago") {
    if (lote.pagoEm && lote.pagoEm !== p.dataLiquidacao) {
      p.problemas.push(`O lote já está pago à Flash em ${dataBr(lote.pagoEm)}; o M4 diz ${dataBr(p.dataLiquidacao)} — confira.`);
    }
    return;
  }
  const pode = podeMarcarLotePago(lote, p.dataLiquidacao, hoje);
  if (!pode.ok) { p.problemas.push(pode.motivo); return; }
  p.acoes.push("marcar_pago");
  p.gravar.pagoEm = p.dataLiquidacao;
}

/**
 * A prévia: por linha, a ação (registrar OC, programar, marcar pago) ou o
 * problema. Nada é gravado; o servidor roda de novo, contra o banco de agora,
 * na hora de aplicar.
 */
export function proporRetornoM4(leitura: LeituraDoRetorno, estado: EstadoDoRetorno, hoje: string): PreviaDoRetorno {
  const formato = { id: FORMATO_RETORNO_M4.id, nome: FORMATO_RETORNO_M4.nome, provisorio: FORMATO_RETORNO_M4.provisorio };
  const linhas: LinhaPropostaDoRetorno[] = [];
  const vistas = new Map<string, number>();
  for (const l of leitura.erro ? [] : leitura.linhas) {
    const p = linhaBase(l);
    linhas.push(p);
    const lote = numeroDoLoteFlash(l.referencia);
    if (!l.referencia) p.problemas.unshift("OC sem identificador (coluna Referência vazia) — não dá para saber de quem é.");
    else if (l.semRetorno && l.erros.length === 0) {
      p.tipo = lote != null ? "flash" : "prestador";
      p.quem = lote != null ? `Lote Flash ${lote}` : estado.prestacoes.get(l.referencia.toLowerCase())?.colaboradorNome ?? null;
      p.resultado = "sem_mudanca";
      p.frase = "Sem nº da OC nem situação — o M4 ainda não devolveu esta linha.";
      continue;
    } else {
      const chave = lote != null ? `lote:${lote}` : l.referencia.toLowerCase();
      const repetida = vistas.get(chave);
      if (repetida) p.problemas.push(`Referência repetida no arquivo (já na linha ${repetida}).`);
      else vistas.set(chave, l.linha);
      if (lote != null) proporLote(p, lote, estado.lotes.get(lote), hoje);
      else {
        const a = estado.prestacoes.get(l.referencia.toLowerCase());
        if (!a) p.problemas.push("Prestação não encontrada — a referência não é de nenhuma prestação do app (use o arquivo de OC exportado).");
        else proporPrestador(p, a, hoje);
      }
    }
    if (p.problemas.length > 0) {
      p.resultado = "problema";
      p.acoes = [];
      p.exigeJustificativa = false;
      p.gravar = { oc: null, programarPara: null, notaId: null, pagoEm: null };
      p.frase = p.problemas[0];
    } else if (p.acoes.length > 0) {
      p.resultado = "aplicar";
      p.frase = fraseDasAcoes(p);
    } else {
      p.resultado = "sem_mudanca";
      p.frase = "Sem mudança — já estava assim no app.";
    }
  }
  const resumo: ResumoDoRetorno = { total: linhas.length, registrarOc: 0, programar: 0, marcarPago: 0, semMudanca: 0, problema: 0, aplicar: 0, exigemJustificativa: 0 };
  for (const p of linhas) {
    if (p.resultado === "problema") resumo.problema += 1;
    else if (p.resultado === "sem_mudanca") resumo.semMudanca += 1;
    else {
      resumo.aplicar += 1;
      if (p.exigeJustificativa) resumo.exigemJustificativa += 1;
      if (p.acoes.includes("registrar_oc")) resumo.registrarOc += 1;
      if (p.acoes.includes("programar")) resumo.programar += 1;
      if (p.acoes.includes("marcar_pago")) resumo.marcarPago += 1;
    }
  }
  return { erro: leitura.erro, linhas, resumo, formato };
}
