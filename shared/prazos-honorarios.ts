/**
 * Prazos e cobranças do fluxo NOVO dos honorários (28/10, Fase 3).
 *
 * Slide 13 da reunião de 21/10 deixou pendente "Prazo para confirmar e para
 * enviar NF: definir dias; contestação volta ao DP". Até o dono decidir,
 * valem os dias PROVISÓRIOS abaixo (system_settings `honorarios_prazo_*`,
 * só o administrador muda na Tabela de valores; o DP vê):
 *
 *   etapa                    quem         conta a partir de            padrão
 *   confirmar a presença     colaborador  o último dia de trabalho        2
 *   check-out final          produção     o último dia de trabalho        3
 *   conferência DP           DP           o envio ao DP (check-out final) 3
 *   registrar a OC           DP           a aprovação na Conferência DP   3
 *   enviar a nota fiscal     colaborador  o registro da OC                5
 *   conferir a nota fiscal   DP           o envio da nota                 2
 *
 * Desvios (decisão nossa, mesma régua): prestação DEVOLVIDA pelo DP volta à
 * produção com o prazo do check-out final contado da devolução; nota
 * DEVOLVIDA volta ao colaborador com o prazo da nota contado da devolução.
 *
 * Dias CORRIDOS, contados em dias de calendário de Brasília: o instante
 * gravado (timestamptz) vira o dia de Brasília ANTES de somar — `new
 * Date("AAAA-MM-DD")` é meia-noite UTC (21h da véspera em Brasília) e nunca
 * é usado aqui. Vence no fim do dia `venceEm`: no próprio dia é "vence hoje";
 * no dia seguinte, "atrasado 1 dia".
 *
 * Evento legado (termina antes da data de corte) não tem prazo. Funções
 * puras — servidor (Painel, portal, presença, sino) e telas.
 */
import { FUSO_DA_OPERACAO, hojeISO } from "./hoje-sp";

// ── Configuração (system_settings) ──────────────────────────────────────────

export const CAMPOS_DO_PRAZO = ["confirmarPresenca", "checkoutFinal", "conferenciaDp", "registrarOc", "enviarNf", "conferirNf"] as const;
export type CampoDoPrazo = (typeof CAMPOS_DO_PRAZO)[number];
export type PrazosDosHonorarios = Record<CampoDoPrazo, number>;

export const CHAVES_DOS_PRAZOS: Record<CampoDoPrazo, string> = {
  confirmarPresenca: "honorarios_prazo_confirmar_presenca",
  checkoutFinal: "honorarios_prazo_checkout_final",
  conferenciaDp: "honorarios_prazo_conferencia_dp",
  registrarOc: "honorarios_prazo_registrar_oc",
  enviarNf: "honorarios_prazo_enviar_nf",
  conferirNf: "honorarios_prazo_conferir_nf",
};

/** Padrão PROVISÓRIO (28/10) — o dono pode mudar. */
export const PRAZOS_PADRAO: PrazosDosHonorarios = {
  confirmarPresenca: 2,
  checkoutFinal: 3,
  conferenciaDp: 3,
  registrarOc: 3,
  enviarNf: 5,
  conferirNf: 2,
};

export const LIMITES_DO_PRAZO = { min: 1, max: 60 } as const;

/** Como cada prazo aparece na Tabela de valores. */
export const DESCRICAO_DO_PRAZO: Record<CampoDoPrazo, { rotulo: string; quem: string; aPartirDe: string }> = {
  confirmarPresenca: { rotulo: "Confirmar a presença", quem: "Colaborador", aPartirDe: "após o último dia" },
  checkoutFinal: { rotulo: "Check-out final", quem: "Produção", aPartirDe: "após o último dia" },
  conferenciaDp: { rotulo: "Conferência DP", quem: "DP", aPartirDe: "após o envio ao DP" },
  registrarOc: { rotulo: "Registrar a OC", quem: "DP", aPartirDe: "após a aprovação" },
  enviarNf: { rotulo: "Enviar a nota fiscal", quem: "Colaborador", aPartirDe: "após a OC" },
  conferirNf: { rotulo: "Conferir a nota fiscal", quem: "DP", aPartirDe: "após o envio da nota" },
};

const inteiroNoLimite = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= LIMITES_DO_PRAZO.min && n <= LIMITES_DO_PRAZO.max ? n : null;
};

/** Os prazos gravados, com o padrão onde falta ou o valor é inválido. */
export function lerPrazosDosHonorarios(settings: readonly { key: string; value: string }[]): PrazosDosHonorarios {
  const out = { ...PRAZOS_PADRAO };
  for (const campo of CAMPOS_DO_PRAZO) {
    const n = inteiroNoLimite(settings.find((s) => s.key === CHAVES_DOS_PRAZOS[campo])?.value);
    if (n !== null) out[campo] = n;
  }
  return out;
}

/** Valida a edição (só os campos enviados): chaves → texto a gravar, ou o erro. */
export function validarPrazosDosHonorarios(
  corpo: Partial<Record<CampoDoPrazo, unknown>> | null | undefined,
  atual: PrazosDosHonorarios,
): { gravar: Record<string, string>; novos: PrazosDosHonorarios } | { erro: string; campo: CampoDoPrazo } {
  const novos = { ...atual };
  const gravar: Record<string, string> = {};
  for (const campo of CAMPOS_DO_PRAZO) {
    const bruto = corpo?.[campo];
    if (bruto === undefined) continue;
    const n = inteiroNoLimite(bruto);
    if (n === null) {
      return { erro: `${DESCRICAO_DO_PRAZO[campo].rotulo}: use um número inteiro de ${LIMITES_DO_PRAZO.min} a ${LIMITES_DO_PRAZO.max} dias.`, campo };
    }
    novos[campo] = n;
    gravar[CHAVES_DOS_PRAZOS[campo]] = String(n);
  }
  return { gravar, novos };
}

// ── Datas (dias de calendário de Brasília) ──────────────────────────────────

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const utc = (dia: string) => {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

/** "AAAA-MM-DD" + n dias corridos (sem fuso: aritmética de calendário). */
export function somarDias(dia: string, n: number): string {
  return new Date(utc(dia) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Quantos dias de `de` até `ate` (negativo quando `ate` é antes). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

/**
 * O dia de Brasília de um valor do banco: coluna `date` ("AAAA-MM-DD") fica
 * como está; instante (timestamptz, Date ou ISO com hora) vira o dia em
 * Brasília — 23h30 de 30/10 em Brasília (02h30 UTC de 31/10) é 30/10.
 */
export function diaDeBrasilia(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && RE_DIA.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : hojeISO(FUSO_DA_OPERACAO, d);
}

const instante = (v: Date | string | null | undefined): number => {
  if (!v) return NaN;
  const d = v instanceof Date ? v : new Date(v);
  return d.getTime();
};

// ── Etapas e situação ───────────────────────────────────────────────────────

export type EtapaDoPrazo =
  | "confirmar_presenca" | "checkout_final" | "corrigir_prestacao" | "conferencia_dp"
  | "registrar_oc" | "enviar_nf" | "reenviar_nf" | "conferir_nf";

export type QuemAge = "colaborador" | "producao" | "dp";
export type SituacaoDoPrazo = "no_prazo" | "vence_hoje" | "atrasado";

export const ROTULO_DE_QUEM: Record<QuemAge, string> = { colaborador: "Colaborador", producao: "Produção", dp: "DP" };

export const DEFINICAO_DA_ETAPA: Record<EtapaDoPrazo, { rotulo: string; quem: QuemAge; campo: CampoDoPrazo }> = {
  confirmar_presenca: { rotulo: "Confirmar a presença", quem: "colaborador", campo: "confirmarPresenca" },
  checkout_final: { rotulo: "Check-out final", quem: "producao", campo: "checkoutFinal" },
  corrigir_prestacao: { rotulo: "Corrigir e reenviar ao DP", quem: "producao", campo: "checkoutFinal" },
  conferencia_dp: { rotulo: "Conferência DP", quem: "dp", campo: "conferenciaDp" },
  registrar_oc: { rotulo: "Registrar a OC", quem: "dp", campo: "registrarOc" },
  enviar_nf: { rotulo: "Enviar a nota fiscal", quem: "colaborador", campo: "enviarNf" },
  reenviar_nf: { rotulo: "Reenviar a nota fiscal", quem: "colaborador", campo: "enviarNf" },
  conferir_nf: { rotulo: "Conferir a nota fiscal", quem: "dp", campo: "conferirNf" },
};

export interface PrazoDaEtapa {
  etapa: EtapaDoPrazo;
  rotulo: string;
  quem: QuemAge;
  rotuloDeQuem: string;
  /** Dia (Brasília) de onde o prazo conta. */
  desde: string;
  /** Último dia do prazo (vence no fim dele). */
  venceEm: string;
  situacao: SituacaoDoPrazo;
  /** Atrasado: dias de atraso; no prazo: dias que faltam; vence hoje: 0. */
  dias: number;
}

export interface PrazoDaPrestacao {
  /** A etapa em que a prestação está (null: sem prazo — em evento, sem NF, aprovada, paga, encerrada ou legado). */
  atual: PrazoDaEtapa | null;
  /**
   * O check-out final da produção, que corre JUNTO com a confirmação do
   * colaborador (a produção pode fechar sem ela, com justificativa).
   */
  paralelo: PrazoDaEtapa | null;
  /** A mais urgente das duas — é ela que filtra ("Atrasados", "Vence hoje") e ordena. */
  pior: PrazoDaEtapa | null;
}

export const SEM_PRAZO: PrazoDaPrestacao = { atual: null, paralelo: null, pior: null };

/** Situação de um vencimento em relação a hoje (os dois em "AAAA-MM-DD" de Brasília). */
export function situacaoDoVencimento(venceEm: string, hoje: string): { situacao: SituacaoDoPrazo; dias: number } {
  const faltam = diasEntre(hoje, venceEm);
  if (faltam > 0) return { situacao: "no_prazo", dias: faltam };
  if (faltam === 0) return { situacao: "vence_hoje", dias: 0 };
  return { situacao: "atrasado", dias: -faltam };
}

function montarPrazo(etapa: EtapaDoPrazo, desde: string, prazos: PrazosDosHonorarios, hoje: string): PrazoDaEtapa {
  const def = DEFINICAO_DA_ETAPA[etapa];
  const venceEm = somarDias(desde, prazos[def.campo]);
  return { etapa, rotulo: def.rotulo, quem: def.quem, rotuloDeQuem: ROTULO_DE_QUEM[def.quem], desde, venceEm, ...situacaoDoVencimento(venceEm, hoje) };
}

/** Quanto mais alto, mais urgente: atrasado (pelos dias) > vence hoje > no prazo (o que vence antes). */
export function urgenciaDoPrazo(p: Pick<PrazoDaEtapa, "situacao" | "dias"> | null | undefined): number {
  if (!p) return -Infinity;
  if (p.situacao === "atrasado") return 1_000_000 + p.dias;
  if (p.situacao === "vence_hoje") return 500_000;
  return 100_000 - p.dias;
}

export interface NotaParaPrazo {
  status?: string | null;
  history?: readonly { type?: string | null; at?: string | null }[] | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

/** O último instante do histórico da nota com um dos tipos (ou o fallback). */
function ultimoDoHistorico(nota: NotaParaPrazo, tipos: readonly string[], fallback: Date | string | null | undefined): string | null {
  let melhor = NaN;
  let valor: string | null = null;
  for (const h of nota.history ?? []) {
    if (!h?.type || !tipos.includes(h.type) || !h.at) continue;
    const t = instante(h.at);
    if (!Number.isNaN(t) && (Number.isNaN(melhor) || t > melhor)) { melhor = t; valor = h.at; }
  }
  return diaDeBrasilia(valor ?? fallback ?? null);
}

export interface EntradaDoPrazo {
  hoje: string;
  prazos: PrazosDosHonorarios;
  /** Último dia de trabalho da prestação (os dias da presença), ou null. */
  ultimoDia: string | null;
  legado?: boolean;
  /** Falso: o colaborador não emite NF (as etapas da OC/nota não se aplicam). */
  emiteNf?: boolean;
  /** O colaborador já confirmou a presença (presenca_confirmacoes). */
  confirmado?: boolean;
  realizado: {
    sentForReview?: boolean | null;
    rhStatus?: string | null;
    rhActionAt?: Date | string | null;
    checkoutFinalEm?: Date | string | null;
    updatedAt?: Date | string | null;
    didNotAttend?: boolean | null;
    ocNumero?: string | null;
    ocRegistradaEm?: Date | string | null;
    ocData?: Date | string | null;
    pagoEm?: Date | string | null;
  } | null;
  nota?: NotaParaPrazo | null;
}

/**
 * Para UMA prestação do fluxo novo: a etapa atual, quem deve agir, quando
 * vence e a situação. Sem prazo (SEM_PRAZO) quando nada é esperado de
 * ninguém com data: legado, sem Realizado, não participou, recusada, ainda
 * no evento, não emite NF depois da aprovação, nota aprovada (lançamento no
 * M4 e pagamento ficam fora destes prazos) ou paga.
 */
export function prazoDaPrestacao(e: EntradaDoPrazo): PrazoDaPrestacao {
  const r = e.realizado;
  if (e.legado || !r || r.didNotAttend) return SEM_PRAZO;
  const { hoje, prazos } = e;
  const rh = r.rhStatus || "pendente";
  const so = (atual: PrazoDaEtapa | null): PrazoDaPrestacao => ({ atual, paralelo: null, pior: atual });
  const aPartirDe = (etapa: EtapaDoPrazo, desde: string | null) => (desde ? so(montarPrazo(etapa, desde, prazos, hoje)) : SEM_PRAZO);

  if (rh === "rejeitado") return SEM_PRAZO;

  if (rh === "aprovado") {
    if (e.emiteNf === false || r.pagoEm) return SEM_PRAZO;
    const nota = e.nota ?? null;
    const st = nota?.status || "pendente";
    if (st === "aprovada" || st === "recusada") return SEM_PRAZO;
    if (st === "enviada") return aPartirDe("conferir_nf", ultimoDoHistorico(nota!, ["enviado", "reenviado"], nota!.updatedAt ?? nota!.createdAt));
    if (st === "devolvida") return aPartirDe("reenviar_nf", ultimoDoHistorico(nota!, ["devolvido"], nota!.updatedAt));
    if (r.ocNumero) return aPartirDe("enviar_nf", diaDeBrasilia(r.ocRegistradaEm) ?? diaDeBrasilia(r.ocData));
    return aPartirDe("registrar_oc", diaDeBrasilia(r.rhActionAt));
  }

  if (rh === "devolvido") return aPartirDe("corrigir_prestacao", diaDeBrasilia(r.rhActionAt) ?? diaDeBrasilia(r.updatedAt));

  if (r.sentForReview) {
    // O envio ao DP: o check-out final (fluxo novo); se ele é anterior a uma
    // devolução (reenviado pelo Realizado), a última atualização.
    const ck = instante(r.checkoutFinalEm);
    const acao = instante(r.rhActionAt);
    const envio = !Number.isNaN(ck) && (Number.isNaN(acao) || ck >= acao) ? r.checkoutFinalEm : r.updatedAt ?? r.checkoutFinalEm;
    return aPartirDe("conferencia_dp", diaDeBrasilia(envio));
  }

  // Ainda com a produção: os prazos contam do último dia de trabalho, depois que ele passa.
  if (!e.ultimoDia || hoje <= e.ultimoDia) return SEM_PRAZO;
  const checkout = montarPrazo("checkout_final", e.ultimoDia, prazos, hoje);
  if (e.confirmado) return so(checkout);
  const confirmar = montarPrazo("confirmar_presenca", e.ultimoDia, prazos, hoje);
  const pior = urgenciaDoPrazo(checkout) > urgenciaDoPrazo(confirmar) ? checkout : confirmar;
  return { atual: confirmar, paralelo: checkout, pior };
}

/** O prazo do check-out final (ou da correção depois da devolução) — o que a produção cobra. */
export function prazoDaProducao(p: PrazoDaPrestacao): PrazoDaEtapa | null {
  for (const x of [p.atual, p.paralelo]) if (x && x.quem === "producao") return x;
  return null;
}

/** O prazo que o COLABORADOR tem de cumprir agora (confirmar, enviar ou reenviar a nota). */
export function prazoDoColaborador(p: PrazoDaPrestacao): PrazoDaEtapa | null {
  return p.atual && p.atual.quem === "colaborador" ? p.atual : null;
}

// ── Textos ──────────────────────────────────────────────────────────────────

/** "31/10" */
export const diaEMesCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** "Atrasado 2 dias" · "Vence hoje" · "Vence amanhã" · "Vence 31/10". */
export function textoDoPrazo(p: Pick<PrazoDaEtapa, "situacao" | "dias" | "venceEm">): string {
  if (p.situacao === "atrasado") return `Atrasado ${dias(p.dias)}`;
  if (p.situacao === "vence_hoje") return "Vence hoje";
  if (p.dias === 1) return "Vence amanhã";
  return `Vence ${diaEMesCurto(p.venceEm)}`;
}

// ── Contagens (Painel e sino) ───────────────────────────────────────────────

export interface ContagemDosPrazos {
  atrasados: number;
  venceHoje: number;
  /** Atrasados por quem deve agir. */
  atrasadosPorQuem: Record<QuemAge, number>;
  /** O maior atraso, em dias (0 sem atrasos). */
  maiorAtraso: number;
}

export function contarPrazos(lista: readonly (PrazoDaPrestacao | null | undefined)[]): ContagemDosPrazos {
  const c: ContagemDosPrazos = { atrasados: 0, venceHoje: 0, atrasadosPorQuem: { colaborador: 0, producao: 0, dp: 0 }, maiorAtraso: 0 };
  for (const p of lista) {
    const pior = p?.pior;
    if (!pior) continue;
    if (pior.situacao === "atrasado") {
      c.atrasados += 1;
      c.atrasadosPorQuem[pior.quem] += 1;
      c.maiorAtraso = Math.max(c.maiorAtraso, pior.dias);
    } else if (pior.situacao === "vence_hoje") c.venceHoje += 1;
  }
  return c;
}
