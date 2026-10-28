/**
 * Módulo de Honorários, Fase 2 em modo MANUAL (28/10) — etapas 4 a 7 do slide
 * 7 da reunião de 21/10, sem integração com o M4:
 *
 *  4 · OC (DP): depois da Conferência DP aprovar, o DP registra nº, valor
 *      (padrão = total aprovado) e data — individual ou em LOTE colado/CSV.
 *      CNPJ emissor sem contrato ATIVO: registra assim mesmo, com
 *      justificativa (pendência, não bloqueio — decisão do dono, 26/10).
 *      Desfazer só antes de existir NF.
 *  5 · Envio da NF (colaborador OU produção): só com OC; a nota fica travada
 *      na OC registrada.
 *  6 · Validação (DP): a aprovação da NF que já existe, com a conferência
 *      nº da OC × OC registrada, valor da nota × valor da OC e CNPJ da nota ×
 *      CNPJ emissor.
 *  7 · Pagamento: "Lançar no M4" (já existe) = PROGRAMADO; "Marcar como pago"
 *      só depois de programado.
 *
 * O layout do arquivo de OC do M4 ainda não existe: tudo aqui é digitado ou
 * colado pelo DP e grava nos MESMOS campos que um importador do M4 vai gravar
 * (`oc_origem = 'm4'`), sem mudar as telas.
 *
 * Funções puras — servidor e telas.
 */
import { digitosDoCnpj } from "./cnpj";
import { normalizarBusca } from "./contratos";
import { lerDataDaPlanilha } from "./importacao-contratos";
import { cpfValido, digitosDoCpf } from "./pagamento";
import type { SituacaoDoCnpjInformado } from "./presenca";

/** Resultado de uma verificação: ok, ou o motivo (para a tela) e o código (para o client decidir). */
export type PermissaoDoPagamento = { ok: true } | { ok: false; motivo: string; codigo: string };

const ok: PermissaoDoPagamento = { ok: true };
const nao = (codigo: string, motivo: string): PermissaoDoPagamento => ({ ok: false, codigo, motivo });

const diaMes = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const isoDe = (v: string | Date | null | undefined): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

/** "R$ 1.234,56" (texto de tela e de mensagem). */
export const reaisDoPagamento = (centavos: number): string =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── OC ──────────────────────────────────────────────────────────────────────

export const ORIGENS_DA_OC = ["manual", "lote", "m4"] as const;
export type OrigemDaOc = (typeof ORIGENS_DA_OC)[number];
export const ROTULO_DA_ORIGEM_DA_OC: Record<OrigemDaOc, string> = { manual: "Digitada", lote: "Lote colado", m4: "Arquivo do M4" };

export const OC_NUMERO_MAX = 40;
export const JUSTIFICATIVA_MIN = 5;
export const JUSTIFICATIVA_MAX = 1000;
export const MOTIVO_DO_DESFAZER_MIN = 5;
export const OBS_DO_PAGAMENTO_MAX = 1000;
export const VALOR_MAXIMO_CENTAVOS = 1_000_000_000;
export const LOTE_DE_OC_MAX_LINHAS = 2000;
export const LOTE_DE_PAGO_MAX = 2000;

/** Nº da OC como gravado: sem espaços nas pontas e sem espaço duplo. */
export const normalizarNumeroDaOc = (v: string | null | undefined): string => String(v ?? "").trim().replace(/\s+/g, " ");

/** Chave de comparação: sem espaços, sem diferença de maiúsculas. */
export const chaveDaOc = (v: string | null | undefined): string => normalizarNumeroDaOc(v).replace(/\s+/g, "").toUpperCase();

export const mesmaOc = (a: string | null | undefined, b: string | null | undefined): boolean => !!chaveDaOc(a) && chaveDaOc(a) === chaveDaOc(b);

export function erroDoNumeroDaOc(v: unknown): string | null {
  if (typeof v !== "string" || !normalizarNumeroDaOc(v)) return "Informe o número da OC.";
  const n = normalizarNumeroDaOc(v);
  if (n.length > OC_NUMERO_MAX) return `O número da OC tem no máximo ${OC_NUMERO_MAX} caracteres.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/.test(n)) return "O número da OC só tem letras, números, ponto, barra, hífen e sublinhado.";
  return null;
}

export function erroDoValorEmCentavos(v: unknown, rotulo = "O valor"): string | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return `${rotulo} vai em centavos (número inteiro).`;
  if (v <= 0) return `${rotulo} tem que ser maior que zero.`;
  if (v > VALOR_MAXIMO_CENTAVOS) return `${rotulo} passa do limite.`;
  return null;
}

/** "AAAA-MM-DD" real e não no futuro (a OC e o pagamento já aconteceram). */
export function erroDaDataPassada(v: unknown, hoje: string, rotulo: string): string | null {
  if (typeof v !== "string") return `Informe ${rotulo} (AAAA-MM-DD).`;
  const r = lerDataDaPlanilha(v);
  if ("erro" in r || !r.data || r.data !== v) return `${rotulo[0].toUpperCase()}${rotulo.slice(1)} inválida — use AAAA-MM-DD.`;
  if (v > hoje) return `${rotulo[0].toUpperCase()}${rotulo.slice(1)} não pode ser no futuro.`;
  if (v < "2000-01-01") return `${rotulo[0].toUpperCase()}${rotulo.slice(1)} inválida.`;
  return null;
}

/** O que estas regras precisam saber de uma prestação (budget_actual). */
export interface PrestacaoDoPagamento {
  rhStatus?: string | null;
  splitParentId?: string | null;
  /** 28/10 (R7): a divisão só entra no fluxo com colaborador próprio. */
  collaboratorId?: string | null;
  didNotAttend?: boolean | null;
  ocNumero?: string | null;
  pagoEm?: string | Date | null;
}

/** O que estas regras precisam saber da nota fiscal da prestação. */
export interface NotaDoPagamento {
  status?: string | null;
  checkinAt?: Date | string | null;
  paymentDate?: string | null;
  oc?: string | null;
}

/**
 * Etapa 4: a OC só depois da Conferência DP aprovar, uma por prestação.
 * 28/10 (R7): a divisão ("Dividir escalação", o substituto) com colaborador
 * próprio é uma prestação própria — tem OC, NF e pago como as outras.
 */
export function podeRegistrarOc(p: PrestacaoDoPagamento | null | undefined): PermissaoDoPagamento {
  if (!p) return nao("nao_encontrada", "Prestação não encontrada.");
  if (p.splitParentId && p.collaboratorId === null) return nao("divisao_sem_colaborador", "Divisão de vaga sem colaborador — informe quem trabalhou no Realizado.");
  if (p.didNotAttend) return nao("nao_participou", "Marcada como \"não participou\" — não tem OC.");
  if (p.rhStatus !== "aprovado") return nao("nao_aprovada", "A OC só depois de a Conferência DP aprovar a prestação.");
  if (p.ocNumero) return nao("oc_ja_registrada", `Esta prestação já tem a OC ${p.ocNumero} — desfaça antes de registrar outra.`);
  return ok;
}

/** Desfazer a OC: só antes de existir nota fiscal (qualquer status). */
export function podeDesfazerOc(p: PrestacaoDoPagamento | null | undefined, nota: NotaDoPagamento | null | undefined): PermissaoDoPagamento {
  if (!p) return nao("nao_encontrada", "Prestação não encontrada.");
  if (!p.ocNumero) return nao("sem_oc", "Esta prestação não tem OC registrada.");
  if (nota) return nao("com_nf", "Já existe nota fiscal para esta OC — a OC não pode mais ser desfeita.");
  return ok;
}

/** Isento de NF na escalação (28/10): sem nota não há OC nem pagamento por aqui. */
export const MSG_NAO_EMITE_NF = "Não emite NF (marcado na escalação) — não tem OC.";

/** CNPJ emissor sem contrato ATIVO: a OC sai só com justificativa (pendência, não bloqueio). */
export const ocExigeJustificativa = (situacao: SituacaoDoCnpjInformado): boolean => situacao !== "contrato_ativo";

// ── Nota × OC ───────────────────────────────────────────────────────────────

/**
 * Etapa 5 (portal e representante): a nota só com OC; reenvio só da nota
 * devolvida. Enviada (em análise), aprovada e recusada não voltam por aqui.
 */
export function podeEnviarNotaDaOc(p: PrestacaoDoPagamento | null | undefined, nota: NotaDoPagamento | null | undefined): PermissaoDoPagamento {
  if (!p) return nao("nao_encontrada", "Prestação não encontrada.");
  if (!p.ocNumero) return nao("aguardando_oc", "A nota fiscal é enviada depois da OC — aguarde o DP.");
  if (p.pagoEm) return nao("pago", "Esta prestação já foi paga.");
  if (!nota || nota.status === "pendente" || nota.status === "devolvida") return ok;
  if (nota.status === "enviada") return nao("nf_em_analise", "A nota já foi enviada e está em conferência no DP.");
  if (nota.status === "aprovada") return nao("nf_aprovada", "A nota já foi aprovada pelo DP.");
  if (nota.status === "recusada") return nao("nf_recusada", "A nota foi recusada — fale com o DP.");
  return nao("nf_status", "A nota está num estado que não aceita envio.");
}

/**
 * A OC da nota fica TRAVADA na OC registrada (o lançamento interno vem
 * preenchido): vazia → a registrada; outra → erro. Sem OC registrada, vale a
 * digitada (o caminho de antes).
 */
export function ocDaNota(ocRegistrada: string | null | undefined, ocDoCorpo: string | null | undefined): { oc: string | null } | { erro: string } {
  const registrada = normalizarNumeroDaOc(ocRegistrada);
  const digitada = normalizarNumeroDaOc(ocDoCorpo);
  if (!registrada) return { oc: digitada || null };
  if (!digitada || mesmaOc(registrada, digitada)) return { oc: registrada };
  return { erro: `A OC desta prestação é ${registrada} — a nota tem que ser lançada com ela.` };
}

export interface ConferenciaDoItem<T> {
  esperado: T | null;
  informado: T | null;
  /** null: falta um dos lados (não dá para conferir). */
  confere: boolean | null;
}

export interface ConferenciaDaNota {
  oc: ConferenciaDoItem<string>;
  valor: ConferenciaDoItem<number> & { diferenca: number | null };
  cnpj: ConferenciaDoItem<string>;
  /** Frases das divergências (o destaque da tela). */
  divergencias: string[];
  /** Tudo conferível e tudo bate. */
  confere: boolean;
}

/** Etapa 6: o que a nota diz × a OC registrada e o CNPJ emissor. */
export function conferirNotaComOc(
  registrada: { ocNumero?: string | null; ocValor?: number | null; cnpjEmissor?: string | null },
  nota: { oc?: string | null; nfValor?: number | null; nfCnpj?: string | null },
): ConferenciaDaNota {
  const ocEsp = normalizarNumeroDaOc(registrada.ocNumero) || null;
  const ocInf = normalizarNumeroDaOc(nota.oc) || null;
  const vEsp = registrada.ocValor ?? null;
  const vInf = nota.nfValor ?? null;
  const cEsp = digitosDoCnpj(registrada.cnpjEmissor) || null;
  const cInf = digitosDoCnpj(nota.nfCnpj) || null;
  const oc = { esperado: ocEsp, informado: ocInf, confere: ocEsp && ocInf ? mesmaOc(ocEsp, ocInf) : null };
  const diferenca = vEsp != null && vInf != null ? vInf - vEsp : null;
  const valor = { esperado: vEsp, informado: vInf, confere: diferenca == null ? null : diferenca === 0, diferenca };
  const cnpj = { esperado: cEsp, informado: cInf, confere: cEsp && cInf ? cEsp === cInf : null };
  const divergencias: string[] = [];
  if (oc.confere === false) divergencias.push(`A nota cita a OC ${ocInf}, mas a OC registrada é ${ocEsp}.`);
  if (valor.confere === false && diferenca != null) {
    divergencias.push(`O valor da nota (${reaisDoPagamento(vInf!)}) está ${diferenca > 0 ? "acima" : "abaixo"} do valor da OC (${reaisDoPagamento(vEsp!)}) em ${reaisDoPagamento(Math.abs(diferenca))}.`);
  }
  if (cnpj.confere === false) divergencias.push("O CNPJ da nota não é o CNPJ emissor da prestação.");
  if (!ocEsp) divergencias.push("A prestação não tem OC registrada.");
  return { oc, valor, cnpj, divergencias, confere: oc.confere === true && valor.confere === true && cnpj.confere === true };
}

// ── Pagamento ───────────────────────────────────────────────────────────────

/** Programado = NF aprovada e lançada no M4 (check-in com a data prevista). */
export const notaProgramada = (nota: NotaDoPagamento | null | undefined): boolean =>
  !!nota && nota.status === "aprovada" && !!nota.checkinAt;

/** Etapa 7: "Marcar como pago" só depois de programado, uma vez. */
export function podeMarcarPago(p: PrestacaoDoPagamento | null | undefined, nota: NotaDoPagamento | null | undefined): PermissaoDoPagamento {
  if (!p) return nao("nao_encontrada", "Prestação não encontrada.");
  if (p.pagoEm) return nao("ja_pago", `Já marcada como paga em ${dataBr(isoDe(p.pagoEm))}.`);
  if (!notaProgramada(nota)) return nao("nao_programado", "Só depois de programado: a NF aprovada e lançada no M4.");
  return ok;
}

export function podeDesfazerPago(p: PrestacaoDoPagamento | null | undefined): PermissaoDoPagamento {
  if (!p) return nao("nao_encontrada", "Prestação não encontrada.");
  if (!p.pagoEm) return nao("nao_pago", "Esta prestação não está marcada como paga.");
  return ok;
}

// ── Estado (telas e portal) ─────────────────────────────────────────────────

export const ESTADOS_DO_PAGAMENTO = [
  "sem_oc", "com_oc", "nf_enviada", "nf_devolvida", "nf_recusada", "nf_aprovada", "programado", "pago",
] as const;
export type EstadoDoPagamento = (typeof ESTADOS_DO_PAGAMENTO)[number];

export const ROTULO_DO_ESTADO_DO_PAGAMENTO: Record<EstadoDoPagamento, string> = {
  sem_oc: "Sem OC",
  com_oc: "OC emitida",
  nf_enviada: "NF enviada",
  nf_devolvida: "NF devolvida",
  nf_recusada: "NF recusada",
  nf_aprovada: "NF aprovada",
  programado: "Programado",
  pago: "Pago",
};

export function estadoDoPagamento(e: { ocNumero?: string | null; pagoEm?: string | Date | null; nota?: NotaDoPagamento | null }): EstadoDoPagamento {
  const n = e.nota ?? null;
  if (e.pagoEm) return "pago";
  if (notaProgramada(n)) return "programado";
  if (n?.status === "aprovada") return "nf_aprovada";
  if (n?.status === "recusada") return "nf_recusada";
  if (n?.status === "devolvida") return "nf_devolvida";
  if (n?.status === "enviada") return "nf_enviada";
  return e.ocNumero ? "com_oc" : "sem_oc";
}

/** A frase do portal ("Pagamento programado para 05/11", "Pago em 07/11"…). */
export function fraseDoPagamentoAoColaborador(estado: EstadoDoPagamento, d: { programadoPara?: string | null; pagoEm?: string | Date | null }): string {
  switch (estado) {
    case "sem_oc": return "Aguardando a ordem de compra (OC) do DP.";
    case "com_oc": return "OC emitida — envie a nota fiscal.";
    case "nf_enviada": return "Nota fiscal enviada — em conferência no DP.";
    case "nf_devolvida": return "Nota fiscal devolvida pelo DP — corrija e envie de novo.";
    case "nf_recusada": return "Nota fiscal recusada — fale com o DP.";
    case "nf_aprovada": return "Nota fiscal aprovada — aguardando a programação do pagamento.";
    case "programado": return d.programadoPara ? `Pagamento programado para ${diaMes(d.programadoPara)}.` : "Pagamento programado.";
    case "pago": return `Pago em ${diaMes(isoDe(d.pagoEm))}.`;
  }
}

/** "Não exibir valores" vale ATÉ a OC (decisão do dono, 26/10): com OC, o colaborador vê. */
export const valoresVisiveisAoColaborador = (ocultarValores: boolean | null | undefined, ocNumero: string | null | undefined): boolean =>
  ocultarValores === false || !!ocNumero;

/** A descrição que o DP sugere para a nota (o colaborador copia). */
export function descricaoSugeridaDaNota(d: { funcao?: string | null; evento: string; inicio?: string | null; fim?: string | null; ocNumero: string }): string {
  const periodo = d.inicio && d.fim
    ? d.inicio === d.fim ? ` em ${dataBr(d.inicio)}` : ` de ${diaMes(d.inicio)} a ${dataBr(d.fim)}`
    : "";
  return `Prestação de serviços${d.funcao ? ` de ${d.funcao}` : ""} no evento ${d.evento}${periodo} — OC nº ${d.ocNumero}.`;
}

// ── Valores em reais (lote e CSV) ───────────────────────────────────────────

/**
 * Valor escrito em reais ("1.234,56", "1234,56", "1234.56", "R$ 1.234,56",
 * "1234") → centavos. Vazio → null.
 */
export function lerValorEmReais(texto: string | null | undefined): { centavos: number | null } | { erro: string } {
  const t = String(texto ?? "").replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!t) return { centavos: null };
  let normal: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) || /^\d+,\d{1,2}$/.test(t)) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) normal = t.replace(/,/g, "");
  else if (/^\d+(\.\d{1,2})?$/.test(t)) normal = t;
  else return { erro: `Valor inválido: "${String(texto).trim()}"` };
  const centavos = Math.round(Number(normal) * 100);
  if (!Number.isFinite(centavos) || centavos <= 0) return { erro: `Valor inválido: "${String(texto).trim()}"` };
  if (centavos > VALOR_MAXIMO_CENTAVOS) return { erro: "Valor acima do limite." };
  return { centavos };
}

/** Centavos → "1234,56" (CSV: vírgula decimal, sem milhar). */
export const reaisParaCsv = (centavos: number | null | undefined): string =>
  centavos == null ? "" : (centavos / 100).toFixed(2).replace(".", ",");

// ── Lote de OC (colado ou CSV) ──────────────────────────────────────────────

/** A prestação como o lote precisa conhecer (as do evento escolhido). */
export interface PrestacaoDoLote extends PrestacaoDoPagamento {
  id: string;
  colaboradorNumero: number | null;
  colaboradorNome: string | null;
  /** Só dígitos; o lote acha pelo CPF, mas nunca o devolve. */
  cpf: string | null;
  totalValue: number;
  situacaoDoCnpj: SituacaoDoCnpjInformado;
  /** Isento de NF na escalação: as etapas 4–7 não se aplicam (sem OC). */
  emiteNf?: boolean;
}

export type SituacaoDaLinhaDoLote = "ok" | "erro" | "ignorada";

export interface LinhaDoLoteDeOc {
  /** Nº da linha no texto (1 = primeira). */
  linha: number;
  referencia: string;
  actualId: string | null;
  colaborador: string | null;
  numero: string | null;
  valor: number | null;
  data: string | null;
  situacao: SituacaoDaLinhaDoLote;
  erros: string[];
  avisos: string[];
  /** CNPJ sem contrato ativo: entra só com a justificativa do lote. */
  exigeJustificativa: boolean;
}

export interface LeituraDoLoteDeOc {
  linhas: LinhaDoLoteDeOc[];
  /** Usou a linha de títulos (o CSV exportado, preenchido). */
  comCabecalho: boolean;
  resumo: { ok: number; erro: number; ignorada: number; exigemJustificativa: number };
}

/** Divide uma linha de CSV/colagem respeitando aspas ("a;b" fica numa célula). */
export function dividirLinha(linha: string, sep: string): string[] {
  const celulas: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === "\"" && linha[i + 1] === "\"") { atual += "\""; i++; }
      else if (c === "\"") aspas = false;
      else atual += c;
    } else if (c === "\"" && !atual.trim()) aspas = true;
    else if (c === sep) { celulas.push(atual.trim()); atual = ""; }
    else atual += c;
  }
  celulas.push(atual.trim());
  return celulas;
}

const separadorDe = (linha: string) => (linha.includes(";") ? ";" : linha.includes("\t") ? "\t" : ",");
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const titulo = (t: string) => normalizarBusca(t).replace(/[º°ª#]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

interface Colunas { ref: number; oc: number; valor: number | null; data: number | null }

/** Títulos do arquivo exportado (ou parecidos): onde está cada coisa. */
function colunasDoCabecalho(celulas: string[]): Colunas | null {
  const t = celulas.map(titulo);
  const achar = (re: RegExp) => t.findIndex((x) => re.test(x));
  const oc = achar(/^(n da oc|n oc|numero da oc|oc|ordem de compra|n da ordem de compra)$/);
  if (oc < 0) return null;
  let ref = achar(/^(prestacao|id da prestacao|n da prestacao)$/);
  if (ref < 0) ref = achar(/^cpf/);
  if (ref < 0) ref = achar(/^(n do colaborador|n colaborador|numero do colaborador|colaborador)$/);
  if (ref < 0) return null;
  let valor = achar(/^valor da oc/);
  if (valor < 0) valor = achar(/^valor$/);
  const data = achar(/^data da oc|^data$/);
  return { ref, oc, valor: valor >= 0 ? valor : null, data: data >= 0 ? data : null };
}

/**
 * Lê o lote: uma linha por prestação, "referência ; nº da OC ; valor? ; data?"
 * (colado do Excel com tabulação também vale), ou o CSV EXPORTADO pelo app
 * com a coluna "Nº da OC" preenchida (acha as colunas pelos títulos; linha
 * sem OC é ignorada). Referência: o id da prestação (coluna do arquivo
 * exportado), o CPF, o nº do colaborador (#123) ou o nome exato. Valor vazio
 * = o total aprovado; data vazia = hoje. Cada linha volta com os erros e os
 * avisos; nada é gravado aqui (o servidor relê o texto na confirmação).
 */
export function lerLoteDeOc(texto: string, prestacoes: readonly PrestacaoDoLote[], hoje: string): LeituraDoLoteDeOc {
  const brutas = String(texto ?? "").replace(/^﻿/, "").split(/\r?\n/).map((l, i) => ({ n: i + 1, l })).filter((x) => x.l.trim());
  const linhas: LinhaDoLoteDeOc[] = [];
  let colunas: Colunas = { ref: 0, oc: 1, valor: 2, data: 3 };
  let comCabecalho = false;
  if (brutas.length > 0) {
    const doCabecalho = colunasDoCabecalho(dividirLinha(brutas[0].l, separadorDe(brutas[0].l)));
    if (doCabecalho) { colunas = doCabecalho; comCabecalho = true; brutas.shift(); }
  }
  const porId = new Map(prestacoes.map((p) => [p.id.toLowerCase(), p]));
  const vistas = new Map<string, number>();

  for (const { n, l } of brutas.slice(0, LOTE_DE_OC_MAX_LINHAS)) {
    const c = dividirLinha(l, separadorDe(l));
    const referencia = (c[colunas.ref] ?? "").trim();
    const numeroBruto = (c[colunas.oc] ?? "").trim();
    const valorBruto = colunas.valor != null ? (c[colunas.valor] ?? "") : "";
    const dataBruta = colunas.data != null ? (c[colunas.data] ?? "") : "";
    const erros: string[] = [];
    const avisos: string[] = [];
    const linha: LinhaDoLoteDeOc = {
      linha: n, referencia, actualId: null, colaborador: null, numero: null, valor: null, data: null,
      situacao: "erro", erros, avisos, exigeJustificativa: false,
    };
    linhas.push(linha);
    // O arquivo exportado traz todas as prestações sem OC: linha sem OC preenchida fica de fora.
    if (comCabecalho && !numeroBruto) { linha.situacao = "ignorada"; avisos.push("Sem nº da OC — fica para depois."); continue; }

    // Referência → prestação do evento
    let alvo: PrestacaoDoLote | null = null;
    if (!referencia) erros.push("Falta a referência (prestação, CPF, nº ou nome do colaborador).");
    else if (RE_UUID.test(referencia)) {
      alvo = porId.get(referencia.toLowerCase()) ?? null;
      if (!alvo) erros.push("Prestação não encontrada neste evento.");
    } else {
      const digitos = referencia.replace(/^#/, "").replace(/[.\-\s/]/g, "");
      let candidatas: PrestacaoDoLote[];
      if (/^\d{11}$/.test(digitos) && cpfValido(digitos)) candidatas = prestacoes.filter((p) => p.cpf && digitosDoCpf(p.cpf) === digitos);
      else if (/^\d{1,9}$/.test(digitos)) candidatas = prestacoes.filter((p) => p.colaboradorNumero === Number(digitos));
      else {
        const nome = normalizarBusca(referencia);
        candidatas = prestacoes.filter((p) => p.colaboradorNome && normalizarBusca(p.colaboradorNome) === nome);
      }
      if (candidatas.length === 0) erros.push("Colaborador não encontrado entre as prestações deste evento.");
      else if (candidatas.length > 1) erros.push("O colaborador tem mais de uma prestação neste evento — use o nº da prestação (coluna do arquivo exportado).");
      else alvo = candidatas[0];
    }
    if (alvo) {
      linha.actualId = alvo.id;
      linha.colaborador = alvo.colaboradorNome;
      const repetida = vistas.get(alvo.id);
      if (repetida) erros.push(`Prestação repetida no lote (linha ${repetida}).`);
      else vistas.set(alvo.id, n);
      const pode = podeRegistrarOc(alvo);
      if (!pode.ok) erros.push(pode.motivo);
      else if (alvo.emiteNf === false) erros.push(MSG_NAO_EMITE_NF);
    }

    const erroOc = erroDoNumeroDaOc(numeroBruto);
    if (erroOc) erros.push(erroOc);
    else linha.numero = normalizarNumeroDaOc(numeroBruto);

    const valor = lerValorEmReais(valorBruto);
    if ("erro" in valor) erros.push(valor.erro);
    else if (alvo) {
      linha.valor = valor.centavos ?? alvo.totalValue;
      if (linha.valor <= 0) erros.push("O total aprovado é zero — informe o valor da OC.");
      else if (valor.centavos != null && valor.centavos !== alvo.totalValue) {
        avisos.push(`Valor diferente do aprovado (${reaisDoPagamento(alvo.totalValue)}).`);
      }
    }

    const data = lerDataDaPlanilha(dataBruta);
    if ("erro" in data) erros.push(data.erro);
    else if (data.data && data.data > hoje) erros.push("A data da OC não pode ser no futuro.");
    else linha.data = data.data ?? hoje;

    if (alvo && ocExigeJustificativa(alvo.situacaoDoCnpj)) {
      linha.exigeJustificativa = true;
      avisos.push(alvo.situacaoDoCnpj === "sem_cnpj"
        ? "Sem CNPJ emissor informado — entra só com a justificativa."
        : "CNPJ emissor sem contrato ativo — entra só com a justificativa.");
    }
    linha.situacao = erros.length > 0 ? "erro" : "ok";
  }
  if (brutas.length > LOTE_DE_OC_MAX_LINHAS) {
    linhas.push({
      linha: brutas[LOTE_DE_OC_MAX_LINHAS].n, referencia: "", actualId: null, colaborador: null, numero: null, valor: null, data: null,
      situacao: "erro", erros: [`O lote tem mais de ${LOTE_DE_OC_MAX_LINHAS} linhas — divida em partes.`], avisos: [], exigeJustificativa: false,
    });
  }
  const resumo = { ok: 0, erro: 0, ignorada: 0, exigemJustificativa: 0 };
  for (const l of linhas) {
    resumo[l.situacao] += 1;
    if (l.situacao === "ok" && l.exigeJustificativa) resumo.exigemJustificativa += 1;
  }
  return { linhas, comCabecalho, resumo };
}

// ── Exportação ("Plano B" do slide 12) ──────────────────────────────────────

/** Colunas do arquivo de prestações aprovadas SEM OC (a ordem é o contrato do CSV). */
export const COLUNAS_DA_EXPORTACAO = [
  "Prestação", "Colaborador", "CPF", "CNPJ emissor", "Razão social", "Situação do contrato", "Evento", "Função",
  "Valor aprovado (R$)", "Centro de custo", "Nº da OC", "Valor da OC (R$)", "Data da OC",
] as const;

/**
 * Uma célula de CSV: aspas quando precisa, e um apóstrofo antes de =, +, -, @
 * (o Excel não executa a célula como fórmula).
 */
export function celulaCsv(v: string | number | null | undefined): string {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[";\r\n]/.test(t) || /^\s|\s$/.test(t) ? `"${t.replace(/"/g, "\"\"")}"` : t;
}

/** CSV para o Excel brasileiro: UTF-8 com BOM, ";" e CRLF. */
export function montarCsv(linhas: readonly (readonly (string | number | null | undefined)[])[]): string {
  return `﻿${linhas.map((l) => l.map(celulaCsv).join(";")).join("\r\n")}\r\n`;
}

// ── Expurgo das selfies (LGPD) ──────────────────────────────────────────────

/** Último dia de pagamento que JÁ passou do prazo: pago antes de (hoje − dias). */
export function dataLimiteDoExpurgo(hoje: string, retencaoDias: number): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Math.max(0, Math.floor(retencaoDias)));
  return d.toISOString().slice(0, 10);
}

/** 00:00 do dia em Brasília (UTC−3, sem horário de verão desde 2019) como instante. */
export const inicioDoDiaEmBrasilia = (dia: string): Date => new Date(`${dia}T03:00:00Z`);

/**
 * A prestação foi paga há MAIS que o prazo? (paga exatamente no limite ainda fica.)
 * 28/10 (S6): o prazo conta do MAIS RECENTE entre a data do pagamento e o
 * registro dele (`pago_registrado_em`) — pagamento lançado hoje com data
 * retroativa não apaga as fotos na hora. Sem o registro (dado antigo), vale a data.
 */
export const pagamentoPassouDaGuarda = (
  pagoEm: string | Date | null | undefined, hoje: string, retencaoDias: number, registradoEm?: string | Date | null,
): boolean => {
  const p = isoDe(pagoEm);
  const limite = dataLimiteDoExpurgo(hoje, retencaoDias);
  if (!p || p >= limite) return false;
  return !registradoEm || new Date(registradoEm).getTime() < inicioDoDiaEmBrasilia(limite).getTime();
};

/** Liga/desliga da rotina diária (system_settings). Padrão: ligada. */
export const CHAVE_DO_EXPURGO_AUTOMATICO = "presenca_expurgo_automatico";
/** Lock da rotina diária: o último dia em que uma instância rodou. */
export const CHAVE_DO_ULTIMO_EXPURGO = "presenca_expurgo_ultimo_dia";
export const expurgoAutomaticoLigado = (valor: string | null | undefined): boolean => valor !== "false";
