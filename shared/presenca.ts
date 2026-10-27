/**
 * Presença no evento — regras puras (27/10, Fase 1 do Módulo de Honorários).
 *
 * Ata de 22/10: "check-in e check-out diários no evento, com selfie que
 * registra horário e localização"; "o produtor responsável faz o check-out
 * final, marca as divergências (horas adicionais, ausências), o sistema
 * recalcula o valor final, que o produtor pode editar". Decisão do dono
 * (26/10): o colaborador (ou representante) confirma; o produtor ajusta até
 * 10%; o DP não tem limite.
 *
 * Aqui mora tudo o que não toca banco e vale igual no servidor e nas telas:
 *  - os DIAS da prestação (a mesma fonte do Realizado — `periodoDaPrestacao`,
 *    usada também por client/src/hooks/use-budget-actual-data.ts);
 *  - a janela do check-in/check-out (só no próprio dia, horário de Brasília);
 *  - o estado de cada dia;
 *  - o recálculo do valor (falta, diária extra, horas extras, substituição)
 *    com a memória de cálculo em frases;
 *  - o limite do ajuste do produtor;
 *  - as configurações (system_settings) com o padrão provisório.
 */
import { FUSO_DA_OPERACAO, hojeISO } from "./hoje-sp";
import { listarDiasDeTrabalho } from "./dias-de-trabalho";
import { regraDiariaPorTipo } from "./calculation-rules";
import { cnpjValido, digitosDoCnpj } from "./cnpj";
import { contratoVigenteEm, type ContratoParaVigencia } from "./contratos";

// ── Tipos e rótulos ─────────────────────────────────────────────────────────

export const ESTADOS_DO_DIA = ["futuro", "hoje_sem_checkin", "em_andamento", "concluido", "sem_checkout", "ausente", "falta"] as const;
export type EstadoDoDia = (typeof ESTADOS_DO_DIA)[number];

export const ESTADO_DO_DIA_LABEL: Record<EstadoDoDia, string> = {
  futuro: "Ainda não chegou",
  hoje_sem_checkin: "Hoje — sem check-in",
  em_andamento: "Na arena",
  concluido: "Concluído",
  sem_checkout: "Sem check-out",
  ausente: "Sem registro",
  falta: "Falta",
};

export const TIPOS_DE_OCORRENCIA = ["falta", "diaria_extra", "horas_extras", "substituicao"] as const;
export type TipoDeOcorrencia = (typeof TIPOS_DE_OCORRENCIA)[number];
export const ehTipoDeOcorrencia = (v: unknown): v is TipoDeOcorrencia =>
  typeof v === "string" && (TIPOS_DE_OCORRENCIA as readonly string[]).includes(v);

export const OCORRENCIA_LABEL: Record<TipoDeOcorrencia, string> = {
  falta: "Falta",
  diaria_extra: "Diária extra",
  horas_extras: "Horas extras",
  substituicao: "Substituição",
};

/** Quem registrou a entrada/saída. */
export const QUEM_REGISTRA = ["colaborador", "representante", "produtor_correcao"] as const;
export type QuemRegistra = (typeof QUEM_REGISTRA)[number];

/** Quem confirmou a prestação (a confirmação final, depois do último dia). */
export type QuemConfirma = "colaborador" | "representante";

export type Permissao = { ok: true } | { ok: false; motivo: string };
const ok: Permissao = { ok: true };
const nao = (motivo: string): Permissao => ({ ok: false, motivo });

// ── Datas ───────────────────────────────────────────────────────────────────

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" que existe no calendário. */
export function diaValido(v: unknown): v is string {
  if (typeof v !== "string" || !RE_DIA.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Sábado ou domingo (data de calendário, sem fuso). */
export function ehFimDeSemana(dia: string): boolean {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

/** O dia de negócio (Brasília) do instante — o servidor roda em UTC. */
export function diaEmBrasilia(agora: Date = new Date()): string {
  return hojeISO(FUSO_DA_OPERACAO, agora);
}

const formatadorDeHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_DA_OPERACAO, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "HH:MM" do instante no horário de Brasília. */
export function horaEmBrasilia(instante: Date | string): string {
  const d = instante instanceof Date ? instante : new Date(instante);
  return formatadorDeHora.format(d);
}

/** Minutos de diferença entre o relógio de Brasília e o UTC no instante (ex.: −180). */
function deslocamentoDeBrasilia(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_DA_OPERACAO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instante);
  const p = (t: string) => Number(partes.find((x) => x.type === t)?.value ?? 0);
  const comoUtc = Date.UTC(p("year"), p("month") - 1, p("day"), p("hour"), p("minute"));
  return Math.round((comoUtc - Math.floor(instante.getTime() / 60_000) * 60_000) / 60_000);
}

export const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Instante (UTC) de "dia às HH:MM" no horário de Brasília. Usado na correção
 * do produtor (check-out esquecido): ele digita a hora do relógio local.
 */
export function instanteEmBrasilia(dia: string, hhmm: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const relogio = Date.UTC(a, m - 1, d, h, mi);
  // Primeira aproximação com o deslocamento do meio-dia; confere no instante achado.
  let palpite = new Date(relogio - deslocamentoDeBrasilia(new Date(relogio)) * 60_000);
  palpite = new Date(relogio - deslocamentoDeBrasilia(palpite) * 60_000);
  return palpite;
}

/** Dia seguinte de "AAAA-MM-DD". */
export function diaSeguinte(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

// ── Dias da prestação (a MESMA fonte do Realizado) ─────────────────────────

export interface PrestacaoParaDias {
  workedDays?: readonly (string | null)[] | null;
}
export interface InclusaoParaDias {
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
}
export interface EventoParaDias {
  startDate?: string | null;
  endDate?: string | null;
}

/** De onde vieram os dias: os dias trabalhados gravados, o período da escala ou as datas do evento. */
export type FonteDosDias = "dias_trabalhados" | "escala" | "evento" | "nenhuma";

export interface PeriodoDaPrestacao {
  fonte: FonteDosDias;
  inicio: string | null;
  fim: string | null;
  /** Cada dia de diária, ordenado. */
  dias: string[];
}

/**
 * Período e dias de uma prestação — a regra que o Realizado sempre usou para
 * montar o modal e os cartões (antes só em client/src/hooks/use-budget-actual-data.ts,
 * `getItemDayCounts`; 27/10 movida para cá sem mudar o comportamento):
 *  1. `workedDays` gravado (divisão de escalação, dias desmarcados/extras no modal);
 *  2. senão, o período da ESCALA (scheduleStartDate → scheduleEndDate, todos os dias);
 *  3. senão, as datas do EVENTO.
 */
export function periodoDaPrestacao(
  actual: PrestacaoParaDias,
  inclusao: InclusaoParaDias | null | undefined,
  evento?: EventoParaDias | null,
): PeriodoDaPrestacao {
  const wd = (actual.workedDays ?? []).filter((d): d is string => !!d).map((d) => String(d).slice(0, 10));
  if (wd.length > 0) {
    const dias = Array.from(new Set(wd)).sort();
    return { fonte: "dias_trabalhados", inicio: dias[0], fim: dias[dias.length - 1], dias };
  }
  if (inclusao?.scheduleStartDate && inclusao?.scheduleEndDate) {
    const inicio = String(inclusao.scheduleStartDate).slice(0, 10);
    const fim = String(inclusao.scheduleEndDate).slice(0, 10);
    return { fonte: "escala", inicio, fim, dias: listarDiasDeTrabalho(inicio, fim) };
  }
  if (evento?.startDate && evento?.endDate) {
    const inicio = String(evento.startDate).slice(0, 10);
    const fim = String(evento.endDate).slice(0, 10);
    return { fonte: "evento", inicio, fim, dias: listarDiasDeTrabalho(inicio, fim) };
  }
  return { fonte: "nenhuma", inicio: null, fim: null, dias: [] };
}

/** Os dias de diária da prestação (ver `periodoDaPrestacao`). */
export function diasDaPrestacao(
  actual: PrestacaoParaDias,
  inclusao: InclusaoParaDias | null | undefined,
  evento?: EventoParaDias | null,
): string[] {
  return periodoDaPrestacao(actual, inclusao, evento).dias;
}

export interface InclusaoDaPrestacao extends InclusaoParaDias {
  collaboratorId?: string | null;
  eventId?: string | null;
  functionId?: string | null;
  deletedAt?: Date | string | null;
}

/**
 * A vaga (escalação) de uma prestação: mesmo colaborador e evento, não
 * excluída; com mais de uma, a da MESMA função (o Realizado pega a primeira
 * do colaborador no evento — aqui a função desempata quem tem duas vagas).
 */
export function inclusaoDaPrestacao<T extends InclusaoDaPrestacao>(
  actual: { collaboratorId?: string | null; eventId?: string | null; functionId?: string | null },
  inclusoes: readonly T[],
): T | undefined {
  if (!actual.collaboratorId) return undefined;
  const doColaborador = inclusoes.filter((i) => !i.deletedAt && i.collaboratorId === actual.collaboratorId && i.eventId === actual.eventId);
  return doColaborador.find((i) => i.functionId === actual.functionId) ?? doColaborador[0];
}

// ── Janela do check-in / check-out ──────────────────────────────────────────

export interface MarcacaoDoDia {
  checkinEm?: Date | string | null;
  checkoutEm?: Date | string | null;
}

/**
 * Check-in: só no PRÓPRIO dia de diária, de 00:00 a 23:59 de Brasília
 * (padrão provisório — `presenca_janela_checkin`), uma vez por dia.
 */
export function podeRegistrarEntrada(a: { dia: string; hoje: string; dias: readonly string[]; presenca?: MarcacaoDoDia | null }): Permissao {
  if (!a.dias.includes(a.dia)) return nao("Este dia não é um dia de diária desta prestação.");
  if (a.dia > a.hoje) return nao("O check-in só abre no próprio dia (horário de Brasília).");
  if (a.dia < a.hoje) return nao("O check-in só vale no próprio dia. Para um dia que já passou, fale com o produtor responsável.");
  if (a.presenca?.checkinEm) return nao("O check-in deste dia já foi feito.");
  return ok;
}

/** Check-out: no mesmo dia, depois do check-in desse dia, uma vez. */
export function podeRegistrarSaida(a: { dia: string; hoje: string; dias: readonly string[]; presenca?: MarcacaoDoDia | null }): Permissao {
  if (!a.dias.includes(a.dia)) return nao("Este dia não é um dia de diária desta prestação.");
  if (a.dia !== a.hoje) return nao("O check-out só vale no próprio dia. Check-out esquecido: o produtor responsável corrige.");
  if (!a.presenca?.checkinEm) return nao("Faça o check-in antes do check-out.");
  if (a.presenca.checkoutEm) return nao("O check-out deste dia já foi feito.");
  return ok;
}

// ── Estado do dia ───────────────────────────────────────────────────────────

export interface OcorrenciaDoDia {
  tipo: string;
  dia?: string | null;
  removidoEm?: Date | string | null;
}

const ocorrenciaAtiva = (o: OcorrenciaDoDia) => !o.removidoEm;
/** Falta e substituição tiram o dia do titular. */
export const ocorrenciaTiraODia = (tipo: string) => tipo === "falta" || tipo === "substituicao";

export function estadoDoDia(a: { dia: string; hoje: string; presenca?: MarcacaoDoDia | null; ocorrencias?: readonly OcorrenciaDoDia[] }): EstadoDoDia {
  if ((a.ocorrencias ?? []).some((o) => ocorrenciaAtiva(o) && o.dia === a.dia && ocorrenciaTiraODia(o.tipo))) return "falta";
  const entrou = !!a.presenca?.checkinEm;
  const saiu = !!a.presenca?.checkoutEm;
  if (entrou && saiu) return "concluido";
  if (a.dia > a.hoje) return "futuro";
  if (a.dia === a.hoje) return entrou ? "em_andamento" : "hoje_sem_checkin";
  return entrou ? "sem_checkout" : "ausente";
}

/**
 * Dias que impedem o check-out final: sem check-in e sem ocorrência que tire
 * o dia (falta/substituição). Check-in sem saída conta como presença (o
 * produtor corrige o horário, mas não é obrigado).
 */
export function diasPendentes(a: { dias: readonly string[]; presencas: readonly (MarcacaoDoDia & { dia: string })[]; ocorrencias: readonly OcorrenciaDoDia[] }): string[] {
  const comEntrada = new Set(a.presencas.filter((p) => p.checkinEm).map((p) => p.dia));
  const tirados = new Set(a.ocorrencias.filter((o) => ocorrenciaAtiva(o) && o.dia && ocorrenciaTiraODia(o.tipo)).map((o) => o.dia as string));
  return a.dias.filter((d) => !comEntrada.has(d) && !tirados.has(d));
}

/** A confirmação do colaborador abre depois do último dia — ou no último dia, já com o check-out feito. */
export function podeConfirmarPrestacao(a: { dias: readonly string[]; hoje: string; presencaDoUltimoDia?: MarcacaoDoDia | null; checkoutFinalFeito: boolean }): Permissao {
  if (a.checkoutFinalFeito) return nao("O produtor já fez o check-out final desta prestação.");
  if (a.dias.length === 0) return nao("Esta prestação não tem dias de diária.");
  const ultimo = a.dias[a.dias.length - 1];
  if (a.hoje > ultimo) return ok;
  if (a.hoje === ultimo && a.presencaDoUltimoDia?.checkoutEm) return ok;
  return nao("A confirmação abre depois do último dia de trabalho.");
}

// ── Recálculo do valor ──────────────────────────────────────────────────────

/** Campos do Realizado que o recálculo usa (centavos). */
export interface RealizadoParaCalculo {
  dailyQuantity: number;
  dailyValue: number;
  totalValue: number;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobility: number;
  transport: number;
  collaboratorType?: string | null;
}

export interface OcorrenciaParaCalculo extends OcorrenciaDoDia {
  horas?: number | string | null;
}

export interface Refeicoes {
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
}

export interface CalculoDaPresenca {
  /** O total do Realizado, antes das ocorrências. */
  valorBase: number;
  /** O valor recalculado (centavos, nunca negativo). */
  valorCalculado: number;
  /** Dias pagos: os da prestação − faltas/substituições + diárias extras. */
  diasPagos: string[];
  diasComFalta: string[];
  diasExtras: string[];
  /** Diárias (com valor) depois das ocorrências. */
  dailyQuantity: number;
  diariasRemovidas: number;
  diariasAcrescentadas: number;
  /** Alimentação depois das ocorrências (o dia que sai leva a média do dia; o extra traz). */
  refeicoes: Refeicoes;
  horasExtras: number;
  valorDaHora: number;
  valorHorasExtras: number;
  /** Memória de cálculo em frases (pt-BR). */
  linhas: string[];
}

/** Centavos → "R$ 1.234,56". */
export const reaisDaPresenca = (centavos: number): string =>
  `${centavos < 0 ? "−" : ""}R$ ${(Math.abs(centavos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
const numero = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Recalcula o valor da prestação a partir do REALIZADO (o total que o
 * Realizado já calculou: diárias × valor da diária + alimentação + mobilidade
 * + translado) e das ocorrências (27/10):
 *  - falta (e substituição — a falta do titular naquele dia; o substituto é
 *    pago pela "Dividir escalação" do Realizado) tira o DIA: a diária, se o
 *    dia tinha diária pela regra do tipo (casa/CLT só no fim de semana), e a
 *    alimentação média daquele tipo de dia (útil ou fim de semana);
 *  - diária extra põe um dia (diária pela mesma regra + alimentação média);
 *  - horas extras = horas × (diária ÷ `divisorHoraExtra`).
 * Mobilidade e translado não mudam (a viagem aconteceu). Ocorrência repetida
 * no mesmo dia conta uma vez; dia fora da prestação é ignorado (falta) ou é
 * o próprio extra (diária extra).
 */
export function recalcularValor(a: {
  realizado: RealizadoParaCalculo;
  dias: readonly string[];
  ocorrencias: readonly OcorrenciaParaCalculo[];
  divisorHoraExtra: number;
  nomeDaFuncao?: string | null;
}): CalculoDaPresenca {
  const r = a.realizado;
  const dias = Array.from(new Set(a.dias)).sort();
  const ativas = a.ocorrencias.filter(ocorrenciaAtiva);
  const regra = regraDiariaPorTipo(r.collaboratorType, a.nomeDaFuncao);
  const temDiaria = (d: string) => regra === "todos" || (regra === "fds" && ehFimDeSemana(d));
  const valorDiaria = Math.max(0, Math.round(r.dailyValue || 0));

  const uteis = dias.filter((d) => !ehFimDeSemana(d)).length;
  const fds = dias.length - uteis;
  const media = (total: number, n: number) => (n > 0 ? total / n : 0);
  const mediaDoDia = (d: string) => ehFimDeSemana(d)
    ? { lunch: media(r.weekendLunch, fds), dinner: media(r.weekendDinner, fds), fds: true }
    : { lunch: media(r.weekdayLunch, uteis), dinner: media(r.weekdayDinner, uteis), fds: false };

  const diasComFalta = Array.from(new Set(ativas.filter((o) => ocorrenciaTiraODia(o.tipo) && o.dia && dias.includes(o.dia)).map((o) => o.dia as string))).sort();
  const diasExtras = Array.from(new Set(ativas.filter((o) => o.tipo === "diaria_extra" && o.dia && !dias.includes(o.dia)).map((o) => o.dia as string))).sort();
  const horasExtras = Math.round(ativas.filter((o) => o.tipo === "horas_extras").reduce((s, o) => s + Math.max(0, numero(o.horas)), 0) * 100) / 100;

  const linhas: string[] = [];
  const comDiaria = Math.max(0, r.dailyQuantity || 0);
  linhas.push(`Realizado: ${plural(comDiaria, "diária", "diárias")} de ${reaisDaPresenca(valorDiaria)} + alimentação ${reaisDaPresenca(r.weekdayLunch + r.weekdayDinner + r.weekendLunch + r.weekendDinner)} + mobilidade ${reaisDaPresenca(r.mobility)}${r.transport ? ` + translado ${reaisDaPresenca(r.transport)}` : ""} = ${reaisDaPresenca(r.totalValue)}.`);

  // Arredonda a alimentação de cada campo UMA vez (soma das médias), para o total fechar.
  const delta = { weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0 };
  let diariasRemovidas = 0;
  let diariasAcrescentadas = 0;
  let total = r.totalValue;

  for (const d of diasComFalta) {
    const m = mediaDoDia(d);
    const tiraDiaria = temDiaria(d) && diariasRemovidas < comDiaria;
    if (tiraDiaria) diariasRemovidas++;
    if (m.fds) { delta.weekendLunch -= m.lunch; delta.weekendDinner -= m.dinner; } else { delta.weekdayLunch -= m.lunch; delta.weekdayDinner -= m.dinner; }
    const alim = Math.round(m.lunch + m.dinner);
    const tipo = ativas.some((o) => o.tipo === "substituicao" && o.dia === d) ? "Substituição" : "Falta";
    linhas.push(`${tipo} em ${diaCurto(d)}: −${tiraDiaria ? ` diária ${reaisDaPresenca(valorDiaria)}` : " sem diária no dia"}${alim ? ` e alimentação ${reaisDaPresenca(alim)}` : ""}.`);
  }
  for (const d of diasExtras) {
    const m = mediaDoDia(d);
    const poeDiaria = temDiaria(d) && valorDiaria > 0;
    if (poeDiaria) diariasAcrescentadas++;
    if (m.fds) { delta.weekendLunch += m.lunch; delta.weekendDinner += m.dinner; } else { delta.weekdayLunch += m.lunch; delta.weekdayDinner += m.dinner; }
    const alim = Math.round(m.lunch + m.dinner);
    linhas.push(`Diária extra em ${diaCurto(d)}: +${poeDiaria ? ` diária ${reaisDaPresenca(valorDiaria)}` : " sem diária no dia"}${alim ? ` e alimentação ${reaisDaPresenca(alim)}` : ""}.`);
  }

  const refeicoes: Refeicoes = {
    weekdayLunch: Math.max(0, Math.round(r.weekdayLunch + delta.weekdayLunch)),
    weekdayDinner: Math.max(0, Math.round(r.weekdayDinner + delta.weekdayDinner)),
    weekendLunch: Math.max(0, Math.round(r.weekendLunch + delta.weekendLunch)),
    weekendDinner: Math.max(0, Math.round(r.weekendDinner + delta.weekendDinner)),
  };
  const alimAntes = r.weekdayLunch + r.weekdayDinner + r.weekendLunch + r.weekendDinner;
  const alimDepois = refeicoes.weekdayLunch + refeicoes.weekdayDinner + refeicoes.weekendLunch + refeicoes.weekendDinner;
  total += (diariasAcrescentadas - diariasRemovidas) * valorDiaria + (alimDepois - alimAntes);

  const divisor = a.divisorHoraExtra > 0 ? a.divisorHoraExtra : CONFIGURACAO_PADRAO.horaExtraDivisor;
  const valorDaHora = Math.round(valorDiaria / divisor);
  const valorHorasExtras = Math.round((horasExtras * valorDiaria) / divisor);
  if (horasExtras > 0) {
    linhas.push(`Horas extras: ${horasExtras.toLocaleString("pt-BR")} h × ${reaisDaPresenca(valorDaHora)} (diária ÷ ${divisor.toLocaleString("pt-BR")}) = ${reaisDaPresenca(valorHorasExtras)}.`);
  }
  total += valorHorasExtras;
  const valorCalculado = Math.max(0, Math.round(total));

  const semFalta = dias.filter((d) => !diasComFalta.includes(d));
  const diasPagos = [...semFalta, ...diasExtras].sort();
  if (diasComFalta.length === 0 && diasExtras.length === 0 && horasExtras === 0) linhas.push("Sem ocorrências: o valor é o do Realizado.");
  linhas.push(`Valor calculado: ${reaisDaPresenca(valorCalculado)}.`);

  return {
    valorBase: r.totalValue,
    valorCalculado,
    diasPagos,
    diasComFalta,
    diasExtras,
    dailyQuantity: Math.max(0, comDiaria - diariasRemovidas + diariasAcrescentadas),
    diariasRemovidas,
    diariasAcrescentadas,
    refeicoes,
    horasExtras,
    valorDaHora,
    valorHorasExtras,
    linhas,
  };
}

/**
 * Os campos que o check-out final grava no Realizado — a MESMA aritmética do
 * salvar do modal do Realizado (use-budget-actual-editor `montarPayloadParaSalvar`):
 * total = subtotal das diárias + alimentação + mobilidade + translado, e
 * dailyValue = subtotal ÷ diárias. As horas extras e o ajuste do produtor
 * entram no subtotal das diárias (o Realizado não tem outra coluna que some
 * no total); o valor das horas fica registrado à parte em `valor_horas_extras`.
 */
export function camposDoRealizadoNoCheckoutFinal(
  realizado: RealizadoParaCalculo,
  calculo: CalculoDaPresenca,
  valorFinal: number,
): { workedDays: string[]; dailyQuantity: number; dailyValue: number; totalValue: number } & Refeicoes {
  const ref = calculo.refeicoes;
  const subtotal = valorFinal - ref.weekdayLunch - ref.weekdayDinner - ref.weekendLunch - ref.weekendDinner - realizado.mobility - realizado.transport;
  const qtd = calculo.dailyQuantity;
  return {
    workedDays: calculo.diasPagos,
    dailyQuantity: qtd,
    dailyValue: qtd > 0 && subtotal > 0 ? Math.round(subtotal / qtd) : realizado.dailyValue,
    totalValue: valorFinal,
    ...ref,
  };
}

// ── Limite do ajuste do produtor ────────────────────────────────────────────

/** Faixa permitida ao produtor: calculado ± pct (centavos, arredondado para dentro). */
export function faixaDoAjuste(valorCalculado: number, pct: number): { minimo: number; maximo: number } {
  const margem = Math.floor((Math.max(0, valorCalculado) * Math.max(0, pct)) / 100);
  return { minimo: Math.max(0, valorCalculado - margem), maximo: valorCalculado + margem };
}

/** O valor final está dentro de ±pct do calculado? (DP/admin não passam por aqui.) */
export function dentroDoLimite(valorCalculado: number, valorFinal: number, pct: number): boolean {
  const { minimo, maximo } = faixaDoAjuste(valorCalculado, pct);
  return valorFinal >= minimo && valorFinal <= maximo;
}

/** Ajuste em % sobre o calculado (2 casas); null quando o calculado é zero. */
export function ajusteEmPct(valorCalculado: number, valorFinal: number): number | null {
  if (!valorCalculado) return null;
  return Math.round(((valorFinal - valorCalculado) / valorCalculado) * 10_000) / 100;
}

// ── CNPJ informado × contratos ──────────────────────────────────────────────

/**
 * Situação do CNPJ informado (pelo colaborador ou no check-out final) diante
 * dos contratos LIGADOS ao colaborador — pendência para o DP, nunca bloqueio
 * (decisão do dono, 26/10):
 *  - sem_cnpj        → nada informado;
 *  - contrato_ativo  → o CNPJ é de um contrato do colaborador que vale na data;
 *  - contrato_inativo→ é de um contrato do colaborador, mas vencido/encerrado/sem vigência;
 *  - sem_contrato    → nenhum contrato do colaborador tem este CNPJ ("CNPJ sem contrato").
 */
export type SituacaoDoCnpjInformado = "sem_cnpj" | "contrato_ativo" | "contrato_inativo" | "sem_contrato";
export const SITUACAO_DO_CNPJ_LABEL: Record<SituacaoDoCnpjInformado, string> = {
  sem_cnpj: "CNPJ não informado",
  contrato_ativo: "Contrato ativo",
  contrato_inativo: "Contrato sem vigência ativa",
  sem_contrato: "CNPJ sem contrato",
};

export function situacaoDoCnpjInformado(
  cnpj: string | null | undefined,
  contratosDoColaborador: readonly (ContratoParaVigencia & { id?: string })[],
  data: string,
): { situacao: SituacaoDoCnpjInformado; contratoId: string | null } {
  const alvo = digitosDoCnpj(cnpj);
  if (!alvo) return { situacao: "sem_cnpj", contratoId: null };
  const doCnpj = contratosDoColaborador.filter((c) => digitosDoCnpj(c.cnpj) === alvo);
  if (doCnpj.length === 0) return { situacao: "sem_contrato", contratoId: null };
  const vigente = doCnpj.find((c) => contratoVigenteEm(c, data));
  return vigente
    ? { situacao: "contrato_ativo", contratoId: vigente.id ?? null }
    : { situacao: "contrato_inativo", contratoId: doCnpj[0].id ?? null };
}

/** CNPJ do corpo: vazio vale "não informado"; preenchido tem que ser válido. */
export function erroDoCnpjInformado(cnpj: unknown): string | null {
  if (cnpj === undefined || cnpj === null || cnpj === "") return null;
  if (typeof cnpj !== "string") return "CNPJ inválido.";
  return cnpjValido(cnpj) ? null : "CNPJ inválido — confira os 14 dígitos.";
}

// ── Configurações (system_settings) — padrão provisório ─────────────────────

export const CHAVES_DA_PRESENCA = {
  selfieObrigatoria: "presenca_selfie_obrigatoria",
  localizacao: "presenca_localizacao",
  horaExtraDivisor: "hora_extra_divisor",
  produtorAjusteMaxPct: "produtor_ajuste_max_pct",
  termoTexto: "presenca_termo_texto",
  termoVersao: "presenca_termo_versao",
  retencaoDias: "presenca_retencao_dias",
} as const;

export type CampoDaConfiguracao = keyof typeof CHAVES_DA_PRESENCA;

/** "registrar": pede o GPS; se negado, deixa fazer e marca "sem localização". "nao_registrar": não pede. */
export const MODOS_DE_LOCALIZACAO = ["registrar", "nao_registrar"] as const;
export type ModoDeLocalizacao = (typeof MODOS_DE_LOCALIZACAO)[number];

export interface ConfiguracaoDaPresenca {
  selfieObrigatoria: boolean;
  localizacao: ModoDeLocalizacao;
  horaExtraDivisor: number;
  produtorAjusteMaxPct: number;
  termoTexto: string;
  termoVersao: string;
  retencaoDias: number;
}

/** Termo de consentimento — RASCUNHO nosso, a revisar com o jurídico (27/10). */
export const TERMO_PADRAO = [
  "RASCUNHO — revisar com o jurídico.",
  "",
  "Para registrar a sua presença no evento, este aplicativo guarda, a cada check-in e check-out: a data e a hora, uma foto (selfie) e, se você permitir, a localização do celular no momento do registro.",
  "Para que serve: comprovar os dias e horários trabalhados, conferir o uso de uniforme e EPIs e calcular os seus honorários.",
  "Quem vê: você, o Departamento Pessoal (DP) e a produção responsável pelo evento. Os dados não são compartilhados com terceiros.",
  "Por quanto tempo: as fotos e a localização ficam guardadas por até 365 dias depois do pagamento e então são apagadas.",
  "Você pode pedir ao DP, a qualquer momento, acesso aos seus dados ou a correção deles.",
  "Ao tocar em \"Concordo\", você autoriza o uso desses dados para essas finalidades.",
].join("\n");

export const CONFIGURACAO_PADRAO: ConfiguracaoDaPresenca = {
  selfieObrigatoria: true,
  localizacao: "registrar",
  horaExtraDivisor: 8,
  produtorAjusteMaxPct: 10,
  termoTexto: TERMO_PADRAO,
  termoVersao: "2026-10-27-rascunho",
  retencaoDias: 365,
};

export const LIMITES_DA_CONFIGURACAO = {
  horaExtraDivisor: { min: 1, max: 24 },
  produtorAjusteMaxPct: { min: 0, max: 100 },
  retencaoDias: { min: 30, max: 3650 },
  termoTexto: { min: 20, max: 20_000 },
  termoVersao: { min: 1, max: 40 },
} as const;

function numeroEntre(v: string | undefined, min: number, max: number): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** As configurações gravadas, com o padrão onde falta ou o valor é inválido. */
export function lerConfiguracaoDaPresenca(settings: readonly { key: string; value: string }[]): ConfiguracaoDaPresenca {
  const v = (campo: CampoDaConfiguracao) => settings.find((s) => s.key === CHAVES_DA_PRESENCA[campo])?.value;
  const L = LIMITES_DA_CONFIGURACAO;
  const selfie = v("selfieObrigatoria");
  const loc = v("localizacao");
  const texto = v("termoTexto")?.trim();
  const versao = v("termoVersao")?.trim();
  return {
    selfieObrigatoria: selfie === "true" ? true : selfie === "false" ? false : CONFIGURACAO_PADRAO.selfieObrigatoria,
    localizacao: (MODOS_DE_LOCALIZACAO as readonly string[]).includes(loc ?? "") ? (loc as ModoDeLocalizacao) : CONFIGURACAO_PADRAO.localizacao,
    horaExtraDivisor: numeroEntre(v("horaExtraDivisor"), L.horaExtraDivisor.min, L.horaExtraDivisor.max) ?? CONFIGURACAO_PADRAO.horaExtraDivisor,
    produtorAjusteMaxPct: numeroEntre(v("produtorAjusteMaxPct"), L.produtorAjusteMaxPct.min, L.produtorAjusteMaxPct.max) ?? CONFIGURACAO_PADRAO.produtorAjusteMaxPct,
    termoTexto: texto && texto.length >= L.termoTexto.min ? texto : CONFIGURACAO_PADRAO.termoTexto,
    termoVersao: versao ? versao : CONFIGURACAO_PADRAO.termoVersao,
    retencaoDias: numeroEntre(v("retencaoDias"), L.retencaoDias.min, L.retencaoDias.max) ?? CONFIGURACAO_PADRAO.retencaoDias,
  };
}

/**
 * Valida a edição (só os campos enviados). Devolve as chaves → texto a gravar
 * em system_settings, ou o erro. Texto do termo mudado exige versão nova
 * (quem já aceitou a versão antiga aceita de novo).
 */
export function validarConfiguracaoDaPresenca(
  corpo: Partial<Record<CampoDaConfiguracao, unknown>>,
  atual: ConfiguracaoDaPresenca,
): { gravar: Record<string, string>; nova: ConfiguracaoDaPresenca } | { erro: string } {
  const L = LIMITES_DA_CONFIGURACAO;
  const nova: ConfiguracaoDaPresenca = { ...atual };
  const gravar: Record<string, string> = {};
  const inteiroOuNumero = (campo: "horaExtraDivisor" | "produtorAjusteMaxPct" | "retencaoDias", inteiro: boolean, rotulo: string): string | null => {
    const bruto = corpo[campo];
    if (bruto === undefined) return null;
    const n = typeof bruto === "number" ? bruto : Number(String(bruto).replace(",", "."));
    const { min, max } = L[campo];
    if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) return `${rotulo}: use ${inteiro ? "um número inteiro" : "um número"} de ${min} a ${max}.`;
    nova[campo] = n;
    gravar[CHAVES_DA_PRESENCA[campo]] = String(n);
    return null;
  };
  if (corpo.selfieObrigatoria !== undefined) {
    if (typeof corpo.selfieObrigatoria !== "boolean") return { erro: "Selfie obrigatória: informe sim ou não." };
    nova.selfieObrigatoria = corpo.selfieObrigatoria;
    gravar[CHAVES_DA_PRESENCA.selfieObrigatoria] = String(corpo.selfieObrigatoria);
  }
  if (corpo.localizacao !== undefined) {
    if (!(MODOS_DE_LOCALIZACAO as readonly unknown[]).includes(corpo.localizacao)) return { erro: "Localização: use \"registrar\" ou \"nao_registrar\"." };
    nova.localizacao = corpo.localizacao as ModoDeLocalizacao;
    gravar[CHAVES_DA_PRESENCA.localizacao] = nova.localizacao;
  }
  const erroNumero = inteiroOuNumero("horaExtraDivisor", false, "Divisor da hora extra")
    ?? inteiroOuNumero("produtorAjusteMaxPct", false, "Ajuste máximo do produtor (%)")
    ?? inteiroOuNumero("retencaoDias", true, "Guarda das selfies (dias)");
  if (erroNumero) return { erro: erroNumero };
  if (corpo.termoVersao !== undefined) {
    const versao = typeof corpo.termoVersao === "string" ? corpo.termoVersao.trim() : "";
    if (versao.length < L.termoVersao.min || versao.length > L.termoVersao.max) return { erro: `Versão do termo: de ${L.termoVersao.min} a ${L.termoVersao.max} caracteres.` };
    nova.termoVersao = versao;
    gravar[CHAVES_DA_PRESENCA.termoVersao] = versao;
  }
  if (corpo.termoTexto !== undefined) {
    const texto = typeof corpo.termoTexto === "string" ? corpo.termoTexto.trim() : "";
    if (texto.length < L.termoTexto.min || texto.length > L.termoTexto.max) return { erro: `Texto do termo: de ${L.termoTexto.min} a ${L.termoTexto.max.toLocaleString("pt-BR")} caracteres.` };
    if (texto !== atual.termoTexto && nova.termoVersao === atual.termoVersao) return { erro: "Mudou o texto do termo: informe uma versão nova (quem já aceitou precisa aceitar de novo)." };
    nova.termoTexto = texto;
    gravar[CHAVES_DA_PRESENCA.termoTexto] = texto;
  }
  return { gravar, nova };
}

// ── Acesso do colaborador ───────────────────────────────────────────────────

export const SENHA_MINIMA = 8;
export const SENHA_MAXIMA = 72; // limite do bcrypt
export const TENTATIVAS_ANTES_DO_BLOQUEIO = 5;
export const BLOQUEIO_MINUTOS = 15;
export const VALIDADE_DO_CODIGO_HORAS = 72;

/** Senha do colaborador: de 8 a 72 caracteres, com letra e número. */
export function erroDaSenha(senha: unknown): string | null {
  if (typeof senha !== "string" || senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha.length > SENHA_MAXIMA) return `A senha pode ter no máximo ${SENHA_MAXIMA} caracteres.`;
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "A senha precisa ter letras e números.";
  return null;
}

/** CPF mascarado para tela e auditoria: •••.456.789-•• (nunca o número inteiro). */
export function cpfMascarado(cpf: string | null | undefined): string {
  const d = String(cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : "•••";
}

/** O CPF do cadastro (documento principal OU secundário marcado como CPF), só dígitos. */
export function cpfDoCadastro(c: { officialDocument?: string | null; documentType?: string | null; secondaryDocument?: string | null; secondaryDocumentType?: string | null }): string | null {
  const so = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");
  if ((c.documentType ?? "").toLowerCase() === "cpf" && so(c.officialDocument).length === 11) return so(c.officialDocument);
  if ((c.secondaryDocumentType ?? "").toLowerCase() === "cpf" && so(c.secondaryDocument).length === 11) return so(c.secondaryDocument);
  return null;
}
