/**
 * Contratos (CNPJ) — regra pura da vigência (26/10, Fase 0 do Módulo de
 * Honorários).
 *
 * Ata de 22/10: "o produtor informa o CNPJ do titular do contrato"; "o DP
 * verifica se o CNPJ informado tem contrato ativo"; "Todo CNPJ informado no
 * check-out final precisa ter contrato ativo". Decisão do dono (26/10): CNPJ
 * sem contrato ativo vira PENDÊNCIA que trava a OC (Fase 2), mas não trava a
 * confirmação — nesta fase o app só mostra o sinal.
 *
 * Situações (a mesma régua no servidor, na lista e nos selos):
 *  - encerrado      → o DP encerrou o contrato à mão (vale sobre as datas);
 *  - sem_vigencia   → nem início nem fim informados: não dá para afirmar que
 *                     está ativo, então NÃO conta como ativo (o DP completa);
 *  - futuro         → começa depois da data consultada;
 *  - vencido        → terminou antes da data consultada;
 *  - vence_em_breve → ativo, mas termina em até 30 dias (inclusive);
 *  - ativo          → dentro da vigência (início e fim INCLUSIVE; sem fim =
 *                     sem prazo; sem início = vale desde sempre até o fim).
 *
 * Datas sempre "AAAA-MM-DD" (dia de negócio em São Paulo — shared/hoje-sp.ts).
 */
import { digitosDoCnpj } from "./cnpj";

export const SITUACOES_DO_CONTRATO = ["ativo", "vence_em_breve", "vencido", "futuro", "sem_vigencia", "encerrado"] as const;
export type SituacaoDoContrato = (typeof SITUACOES_DO_CONTRATO)[number];

export const SITUACAO_DO_CONTRATO_LABEL: Record<SituacaoDoContrato, string> = {
  ativo: "Ativo",
  vence_em_breve: "Vence em breve",
  vencido: "Vencido",
  futuro: "Ainda não começou",
  sem_vigencia: "Sem vigência",
  encerrado: "Encerrado",
};

/** Dias de antecedência do aviso "vence em breve". */
export const DIAS_PARA_AVISO_DE_VENCIMENTO = 30;

export const TIPOS_DE_CONTRATO = ["mei", "empresa", "empreiteira"] as const;
export type TipoDeContrato = (typeof TIPOS_DE_CONTRATO)[number];
export const TIPO_DE_CONTRATO_LABEL: Record<TipoDeContrato, string> = {
  mei: "MEI",
  empresa: "Empresa",
  empreiteira: "Empreiteira",
};
export const ehTipoDeContrato = (v: unknown): v is TipoDeContrato =>
  typeof v === "string" && (TIPOS_DE_CONTRATO as readonly string[]).includes(v);

/** O que a vigência precisa saber de um contrato. */
export interface ContratoParaVigencia {
  cnpj: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  /** Encerrado à mão pelo DP (ISO de quando). Nulo = não encerrado. */
  encerradoEm?: string | Date | null;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataOk = (d: string | null | undefined): d is string => !!d && RE_DATA.test(d);

/** Diferença em dias corridos entre duas datas "AAAA-MM-DD" (b − a). */
export function diasEntre(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** Situação do contrato na data (padrão: hoje, passado por quem chama). */
export function situacaoDoContrato(c: Omit<ContratoParaVigencia, "cnpj">, data: string): SituacaoDoContrato {
  if (c.encerradoEm) return "encerrado";
  const inicio = dataOk(c.vigenciaInicio) ? c.vigenciaInicio : null;
  const fim = dataOk(c.vigenciaFim) ? c.vigenciaFim : null;
  if (!inicio && !fim) return "sem_vigencia";
  if (inicio && data < inicio) return "futuro";
  if (fim && data > fim) return "vencido";
  if (fim && diasEntre(data, fim) <= DIAS_PARA_AVISO_DE_VENCIMENTO) return "vence_em_breve";
  return "ativo";
}

/** "Contrato ativo" = vale na data (ativo ou vencendo em breve). */
export const situacaoContaComoAtiva = (s: SituacaoDoContrato): boolean => s === "ativo" || s === "vence_em_breve";

/** O contrato vale na data? */
export const contratoVigenteEm = (c: Omit<ContratoParaVigencia, "cnpj">, data: string): boolean =>
  situacaoContaComoAtiva(situacaoDoContrato(c, data));

/**
 * `contratoAtivo(contratos, cnpj, data)`: algum contrato deste CNPJ (com ou
 * sem máscara) vale na data. O CNPJ é único no cadastro, mas a função não
 * depende disso.
 */
export function contratoAtivo(contratos: readonly ContratoParaVigencia[], cnpj: string | null | undefined, data: string): boolean {
  const alvo = digitosDoCnpj(cnpj);
  if (alvo.length !== 14) return false;
  return contratos.some((c) => digitosDoCnpj(c.cnpj) === alvo && contratoVigenteEm(c, data));
}

/** Dias até o fim da vigência (negativo = já venceu; null = sem fim). */
export function diasParaVencer(c: Omit<ContratoParaVigencia, "cnpj">, data: string): number | null {
  return dataOk(c.vigenciaFim) ? diasEntre(data, c.vigenciaFim) : null;
}

// ── Sinal na pessoa (cadastro do colaborador, Planejado/Realizado) ─────────

/**
 * Situação do COLABORADOR quanto a contrato numa data:
 *  - com_contrato_ativo → algum CNPJ ligado a ele vale na data;
 *  - sem_contrato_ativo → tem CNPJ ligado, mas nenhum vale (vencido, futuro,
 *                         sem vigência, encerrado);
 *  - sem_cnpj           → nenhum CNPJ ligado no cadastro.
 */
export type SituacaoContratualDoColaborador = "com_contrato_ativo" | "sem_contrato_ativo" | "sem_cnpj";

export const SITUACAO_CONTRATUAL_LABEL: Record<SituacaoContratualDoColaborador, string> = {
  com_contrato_ativo: "Contrato ativo",
  sem_contrato_ativo: "Sem contrato ativo",
  sem_cnpj: "Sem CNPJ cadastrado",
};

export function situacaoContratualDoColaborador(contratosDele: readonly Omit<ContratoParaVigencia, "cnpj">[], data: string): SituacaoContratualDoColaborador {
  if (contratosDele.length === 0) return "sem_cnpj";
  return contratosDele.some((c) => contratoVigenteEm(c, data)) ? "com_contrato_ativo" : "sem_contrato_ativo";
}

/**
 * Pendência que TRAVA A OC (Fase 2; decisão do dono 26/10). Hoje só sinaliza:
 * nada no app bloqueia a confirmação por causa disto.
 */
export const travaAOc = (s: SituacaoContratualDoColaborador): boolean => s !== "com_contrato_ativo";

// ── Validação do formulário (cliente e servidor) ───────────────────────────

export const CONTRATO_TEXTO_MAX = 200;
export const CONTRATO_OBSERVACAO_MAX = 2000;

/** Erro de vigência (fim antes do início) ou null. */
export function erroDaVigencia(inicio: string | null | undefined, fim: string | null | undefined): string | null {
  if (inicio && !RE_DATA.test(inicio)) return "Data de início inválida.";
  if (fim && !RE_DATA.test(fim)) return "Data de fim inválida.";
  if (inicio && fim && fim < inicio) return "O fim da vigência é antes do início.";
  return null;
}

/** Busca sem acento e sem caixa, para nome, razão social e CNPJ. */
export function normalizarBusca(t: string | null | undefined): string {
  return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Vigência em texto para histórico e prévia: "01/01/2026 a 31/12/2026", "desde 01/01/2026, sem fim", "até …", "sem vigência". */
export function vigenciaEmTexto(inicio: string | null | undefined, fim: string | null | undefined): string {
  if (inicio && fim) return `${dataCurta(inicio)} a ${dataCurta(fim)}`;
  if (inicio) return `desde ${dataCurta(inicio)}, sem fim`;
  if (fim) return `até ${dataCurta(fim)}`;
  return "sem vigência";
}
