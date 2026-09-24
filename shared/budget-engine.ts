/**
 * Motor do PLANEJADO — o cálculo de UMA vaga, puro e compartilhado (23/09).
 *
 * Até aqui a sequência completa (diária plana → deflação → mobilidade por
 * trecho → alimentação por refeição) vivia só na tela
 * client/src/pages/budget-planned.tsx (`calculatedBudgets`), e o servidor
 * tinha uma SEGUNDA fórmula em POST /api/budget-planned/apply-defaults —
 * mais antiga, sem atendimento, percurso, empreita, função local nem
 * deflação. "Aplicar padrões" gravava um número que a tela não reproduzia.
 *
 * Este módulo é a sequência da tela, passo a passo, sem React e sem cache: as
 * regras continuam onde estavam (calculation-rules, alimentacao, atendimento,
 * cenotecnica-empreita) — aqui só a ORDEM em que se aplicam. A tela deve
 * passar a chamar `calcularPlanejadoDaVaga` no lugar do bloco local; o
 * servidor já chama.
 */
import {
  calcDeflatedDailies,
  deflationFactorsFromSettings,
  freelaDailyCents,
  casaDailyCents,
  diasComDiaria as calcDiasComDiaria,
  diasEmpreita,
  regraDiariaPorTipo,
  isPercursoFunction,
  percurseiroDiariaCents,
  diasPercurseiro,
  isFuncaoLocal,
  type DeflationSegment,
  type RegraDiaria,
  type PercurseiroTipo,
  type PercurseiroDiaria,
} from "./calculation-rules";
import {
  isAtendimentoFunction,
  atendimentoDailyCents,
  mobilidadeTrechoComLocalCents,
  isTransporteTerrestre,
  type AtendimentoTipo,
} from "./atendimento";
import { calcAlimentacao, refeicaoCents, refeicaoCentsDia, refeicaoPerfil, isCenotecnicaFunction } from "./alimentacao";
import { cenoEmpreitaTotalCents, usaEmpreitaCenotecnica, vagaComEmpreita, type CenoFreelaTipo, type CenoEmpreitaValor } from "./cenotecnica-empreita";
import { listarDiasDeTrabalho } from "./dias-de-trabalho";

/** Só o que o cálculo lê da vaga (estrutural: vale para a linha do banco e para o tipo do client). */
export interface VagaParaPlanejado {
  functionId?: string | null;
  collaboratorId?: string | null;
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
  dailyRates?: number | null;
  dailyValue?: number | null;
  needsTicket?: boolean | null;
  workDays?: (string | null | undefined)[] | null;
  atendimentoTipo?: string | null;
  percurseiroTipo?: string | null;
  cenoFreelaTipo?: string | null;
  empreitaEmpresa?: string | null;
  empreitaPessoas?: number | null;
  empreitaValor?: number | null;
  flightDepartureSuggestedTime?: string | null;
  flightArrivalSuggestedTime?: string | null;
  flightReturnSuggestedTime?: string | null;
}

/** Passagem registrada da vaga — os horários REAIS mandam sobre os sugeridos. */
export interface PassagemParaPlanejado {
  actualDepartureTime?: string | null;
  actualArrivalTime?: string | null;
  actualReturnTime?: string | null;
  returnArrivalTime?: string | null;
  transportType?: string | null;
}

/** Valores por função (function_values) — só os quatro que a diária consulta. */
export interface ValorDaFuncaoParaPlanejado {
  dailyValue?: number | null;
  dailyValueWeekend?: number | null;
  dailyValueFreela?: number | null;
  dailyValueFreelaWeekend?: number | null;
}

/** Ajustes manuais da tela (rascunho do RH). O servidor nunca manda override. */
export interface OverrideDoPlanejado {
  valorDiaria?: number;
  valorDiariaUtil?: number;
  valorDiariaFds?: number;
  mobilidade?: number;
  mobilidadeIda?: number;
  mobilidadeVolta?: number;
  almocoSemana?: number;
  jantarSemana?: number;
  almocoFds?: number;
  jantarFds?: number;
}

export type ConfiguracoesDoPlanejado = Record<string, number | string | undefined> | null | undefined;

export interface EntradaDoPlanejado {
  vaga: VagaParaPlanejado;
  functionName: string | null | undefined;
  /** collaborators.type: 'casa' | 'freela' | 'local' (null = sem colaborador). */
  collaboratorType: string | null | undefined;
  functionValue?: ValorDaFuncaoParaPlanejado | null;
  /** system_settings já convertidos (chave → número). */
  settings: ConfiguracoesDoPlanejado;
  eventLocation?: string | null;
  ticket?: PassagemParaPlanejado | null;
  override?: OverrideDoPlanejado | null;
}

export interface ResultadoDoPlanejado {
  qtdDiarias: number;
  weekdays: number;
  weekends: number;
  /** Dias que recebem diária (casa: só fds; percurso: 2 ou 1). */
  diasComDiaria: number;
  regraDiaria: RegraDiaria;
  valorDiaria: number;
  valorDiariaUtil: number;
  valorDiariaFds: number;
  subtotalDiarias: number;
  subtotalDiariasUtil: number;
  subtotalDiariasFds: number;
  mobilidade: number;
  mobilidadeIda: number;
  mobilidadeVolta: number;
  almocoSemana: number;
  jantarSemana: number;
  almocoFds: number;
  jantarFds: number;
  unitAlmocoSemana: number;
  unitJantarSemana: number;
  unitAlmocoFds: number;
  unitJantarFds: number;
  ajudaCusto: number;
  totalFinal: number;
  hasOverride: boolean;
  isPercurso: boolean;
  funcaoLocal: boolean;
  percurseiroTipo: PercurseiroTipo | null;
  percurseiro: PercurseiroDiaria | null;
  cenoEmpreitaVaga: boolean;
  cenoFreelaTipo: CenoFreelaTipo | null;
  cenoEmpreita: CenoEmpreitaValor | null;
  vooPartidaIda: string | null;
  vooChegadaIda: string | null;
  vooPartidaVolta: string | null;
  fonteVoo: "passagem" | "sugerido" | "nenhum";
  alimEstimada: boolean;
  deflationSegments: DeflationSegment[];
  /** Valores "de sistema" (sem override) — "Restaurar padrão" e tooltips. */
  sysValorDiaria: number;
  sysMobilidade: number;
  sysMobilidadeIda: number;
  sysMobilidadeVolta: number;
  sysAlmocoSemana: number;
  sysJantarSemana: number;
  sysAlmocoFds: number;
  sysJantarFds: number;
}

/** Dia da semana de "YYYY-MM-DD" em UTC (0 = domingo) — não depende do fuso do processo. */
function diaDaSemana(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const ehFds = (iso: string) => { const d = diaDaSemana(iso); return d === 0 || d === 6; };

/**
 * Contagem útil/fds do período. Com início e fim: o intervalo completo
 * (inclusive), como o "Período de Trabalho" da Escalação. Sem uma das datas:
 * `dailyRates` dias corridos a partir do início (grade antiga) — sem início,
 * zero (mesma regra de `countWeekdaysAndWeekends` da tela).
 */
export function contarDiasDoPeriodo(
  scheduleStartDate: string | null | undefined,
  scheduleEndDate: string | null | undefined,
  dailyRates: number | null | undefined,
): { weekdays: number; weekends: number; qtdDiarias: number; diasPeriodo: string[] } {
  if (scheduleStartDate && scheduleEndDate) {
    const diasPeriodo = listarDiasDeTrabalho(scheduleStartDate, scheduleEndDate);
    let weekdays = 0, weekends = 0;
    for (const d of diasPeriodo) { if (ehFds(d)) weekends++; else weekdays++; }
    return { weekdays, weekends, qtdDiarias: weekdays + weekends, diasPeriodo };
  }
  const qtd = Math.max(0, Math.floor(dailyRates ?? 0));
  if (!scheduleStartDate || qtd <= 0) return { weekdays: 0, weekends: 0, qtdDiarias: qtd, diasPeriodo: [] };
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduleStartDate);
  if (!m) return { weekdays: 0, weekends: 0, qtdDiarias: qtd, diasPeriodo: [] };
  let cursor = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let weekdays = 0, weekends = 0;
  for (let i = 0; i < qtd; i++) {
    const dow = new Date(cursor).getUTCDay();
    if (dow === 0 || dow === 6) weekends++; else weekdays++;
    cursor += 86_400_000;
  }
  return { weekdays, weekends, qtdDiarias: qtd, diasPeriodo: [] };
}

const lerNumero = (settings: ConfiguracoesDoPlanejado, chave: string): number | undefined => {
  const raw = settings?.[chave];
  const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

/** A mesma sequência de `calculatedBudgets` (budget-planned.tsx), sem a tela. */
export function calcularPlanejadoDaVaga(e: EntradaDoPlanejado): ResultadoDoPlanejado {
  const { vaga: inclusion, settings: ss, override } = e;
  const fnName = e.functionName ?? null;
  const fv = e.functionValue ?? null;
  const collabType = e.collaboratorType ?? null;
  const ticket = e.ticket ?? null;

  const periodo = contarDiasDoPeriodo(inclusion.scheduleStartDate, inclusion.scheduleEndDate, inclusion.dailyRates);
  const { weekdays, weekends, qtdDiarias, diasPeriodo } = periodo;

  const collabIsCasa = collabType === "casa" || collabType === "local";

  // Diária por função (casa útil/fds; freela útil/fds)
  const fvDailyWd = collabIsCasa ? (fv?.dailyValue ?? 0) : (fv?.dailyValueFreela ?? 0);
  const fvDailyWe = collabIsCasa
    ? (fv?.dailyValueWeekend ?? fv?.dailyValue ?? 0)
    : (fv?.dailyValueFreelaWeekend ?? fv?.dailyValueFreela ?? 0);

  const defaultDailyValueWeekday = collabIsCasa
    ? (lerNumero(ss, "default_daily_value_weekday") ?? lerNumero(ss, "default_daily_value") ?? 5000)
    : (lerNumero(ss, "default_daily_value_weekday_freela") ?? lerNumero(ss, "default_daily_value_weekday") ?? lerNumero(ss, "default_daily_value") ?? 5000);

  const inclusionDailyValue = inclusion.dailyValue ?? defaultDailyValueWeekday;

  // Atendimento: diária plana pelo tipo (prioridade sobre função/inclusão/default)
  const isAtend = isAtendimentoFunction(fnName);
  const atendVal = isAtend ? atendimentoDailyCents(inclusion.atendimentoTipo as AtendimentoTipo | null | undefined, ss) : null;
  // Percurso: pacote fechado (Tipo 1 / Tipo 2)
  const isPercurso = isPercursoFunction(fnName);
  // Função local: só diária
  const funcaoLocal = isFuncaoLocal(fnName);
  // Empreita por empresa: custo fechado da vaga
  const empreita = vagaComEmpreita(inclusion);
  const percurseiroTipo = (inclusion.percurseiroTipo ?? null) as PercurseiroTipo | null;
  const percurseiroTipoEfetivo: PercurseiroTipo | null = isPercurso ? (percurseiroTipo ?? "tipo_1") : null;
  const percurseiro = isPercurso ? percurseiroDiariaCents(percurseiroTipoEfetivo, ss) : null;
  const percursoVal = percurseiro ? percurseiro.total : null;

  // Quantos dias recebem diária
  const regraDiaria: RegraDiaria = isPercurso ? "todos" : regraDiariaPorTipo(collabType, fnName);
  const diasComDiaria = isPercurso
    ? diasPercurseiro(inclusion.needsTicket)
    : calcDiasComDiaria(collabType, weekdays, weekends, fnName);

  // Empreita cenotécnica: valor fechado por nº de dias trabalhados
  const cenoEmpreitaVaga = usaEmpreitaCenotecnica(isCenotecnicaFunction(fnName), collabType) || empreita;
  const cenoFreelaTipo = (inclusion.cenoFreelaTipo ?? null) as CenoFreelaTipo | null;
  const diasEmpreitaVaga = cenoEmpreitaVaga ? diasEmpreita(inclusion) : 0;
  const cenoEmpreita: CenoEmpreitaValor | null = empreita
    ? { tipo: (cenoFreelaTipo ?? "viagem") as CenoFreelaTipo, dias: Math.max(1, diasEmpreitaVaga), totalCents: Number(inclusion.empreitaValor ?? 0), extrapolado: false, incrementoCents: 0 }
    : cenoEmpreitaVaga ? cenoEmpreitaTotalCents(cenoFreelaTipo, diasEmpreitaVaga, ss) : null;
  const cenoEmpreitaDiaria = cenoEmpreita && diasEmpreitaVaga > 0
    ? Math.round(cenoEmpreita.totalCents / diasEmpreitaVaga)
    : null;

  // Diária plana: override > atendimento > freela/casa (regra do slide) > função > inclusão > default
  const fvDaily = fvDailyWd > 0 ? fvDailyWd : (fvDailyWe > 0 ? fvDailyWe : 0);
  const freelaVal = !collabIsCasa ? freelaDailyCents(fnName, !!inclusion.needsTicket, ss) : null;
  const casaVal = collabIsCasa ? casaDailyCents(fnName, ss) : null;
  const sysValorDiaria = percursoVal ?? cenoEmpreitaDiaria ?? atendVal
    ?? freelaVal ?? casaVal ?? (fvDaily > 0 ? fvDaily : null) ?? inclusionDailyValue ?? defaultDailyValueWeekday;
  const valorDiaria = override?.valorDiaria ?? override?.valorDiariaUtil ?? override?.valorDiariaFds ?? sysValorDiaria;

  // Deflação por período (percurso e empreita: sem deflação)
  const empreitaEditada = !!cenoEmpreita &&
    (override?.valorDiaria ?? override?.valorDiariaUtil ?? override?.valorDiariaFds) !== undefined;
  const deflated = isPercurso
    ? { totalCents: valorDiaria * diasComDiaria, segments: [{ days: diasComDiaria, factor: 1, dailyCents: valorDiaria, totalCents: valorDiaria * diasComDiaria, label: "pacote fechado" }] as DeflationSegment[] }
    : cenoEmpreita
    ? (() => {
        const total = empreitaEditada ? valorDiaria * cenoEmpreita.dias : cenoEmpreita.totalCents;
        return { totalCents: total, segments: [{ days: cenoEmpreita.dias, factor: 1, dailyCents: valorDiaria, totalCents: total, label: "valor fechado" }] as DeflationSegment[] };
      })()
    : calcDeflatedDailies(valorDiaria, diasComDiaria, deflationFactorsFromSettings(ss as Record<string, number | string | undefined> | undefined));
  const subtotalDiarias = deflated.totalCents;
  const subtotalDiariasUtil = (regraDiaria === "fds" || regraDiaria === "nenhuma")
    ? 0
    : (diasComDiaria > 0 && !isPercurso ? Math.round(subtotalDiarias * weekdays / diasComDiaria) : (isPercurso ? subtotalDiarias : 0));
  const subtotalDiariasFds = subtotalDiarias - subtotalDiariasUtil;

  // Horários de voo: a passagem manda; os sugeridos são fallback
  const voa = !!inclusion.needsTicket;
  const vooPartidaIda = ticket?.actualDepartureTime || inclusion.flightDepartureSuggestedTime || null;
  const vooChegadaIda = ticket?.actualArrivalTime || inclusion.flightArrivalSuggestedTime || null;
  const vooPartidaVolta = ticket?.actualReturnTime || inclusion.flightReturnSuggestedTime || null;
  const vooChegadaVolta = ticket?.returnArrivalTime || null;
  const fonteVoo: "passagem" | "sugerido" | "nenhum" =
    (ticket?.actualArrivalTime || ticket?.actualReturnTime || ticket?.actualDepartureTime) ? "passagem"
    : (vooPartidaIda || vooChegadaIda || vooPartidaVolta) ? "sugerido" : "nenhum";

  // Mobilidade por trecho (evento em SP = 0; terrestre = R$29; madrugada = R$58)
  const terrestre =
    ticket?.transportType === "rodoviario" || ticket?.transportType === "van" ||
    (!ticket && (isTransporteTerrestre(vooPartidaIda) || isTransporteTerrestre(vooChegadaIda) || isTransporteTerrestre(vooPartidaVolta)));
  const semMobilidade = isPercurso || funcaoLocal || empreita;
  const sysMobIda = semMobilidade ? 0 : mobilidadeTrechoComLocalCents(e.eventLocation, { voa, partida: vooPartidaIda, chegada: vooChegadaIda, trecho: "ida", terrestre });
  const sysMobVolta = semMobilidade ? 0 : mobilidadeTrechoComLocalCents(e.eventLocation, { voa, partida: vooPartidaVolta, chegada: vooChegadaVolta, trecho: "volta", terrestre });
  const sysMob = sysMobIda + sysMobVolta;
  const mobilidade = override?.mobilidade ?? sysMob;
  const mobilidadeIda = override?.mobilidadeIda ?? sysMobIda;
  const mobilidadeVolta = override?.mobilidadeVolta ?? sysMobVolta;

  // Alimentação por refeição, dirigida pelos horários
  const perfil = refeicaoPerfil(fnName, inclusion.atendimentoTipo);
  const { almocoCents, jantarCents } = refeicaoCents(perfil, ss);
  const refUtil = refeicaoCentsDia(perfil, ss, { tipoColaborador: collabType, isWeekend: false });
  const refFds = refeicaoCentsDia(perfil, ss, { tipoColaborador: collabType, isWeekend: true });
  const alim = calcAlimentacao({
    workDays: semMobilidade ? [] : diasPeriodo, voa,
    chegadaIda: vooChegadaIda, partidaVolta: vooPartidaVolta,
    almocoCents, jantarCents,
    terrestre,
  });
  let calcAlmSem = 0, calcJanSem = 0, calcAlmFds = 0, calcJanFds = 0;
  for (const d of alim.dias) {
    const fds = ehFds(d.date);
    if (d.almoco) { if (fds) calcAlmFds += refFds.almocoCents; else calcAlmSem += refUtil.almocoCents; }
    if (d.jantar) { if (fds) calcJanFds += refFds.jantarCents; else calcJanSem += refUtil.jantarCents; }
  }
  if (!semMobilidade && diasPeriodo.length === 0 && (weekdays + weekends) > 0) {
    calcAlmSem = weekdays * refUtil.almocoCents; calcJanSem = weekdays * refUtil.jantarCents;
    calcAlmFds = weekends * refFds.almocoCents; calcJanFds = weekends * refFds.jantarCents;
  }
  if (funcaoLocal || empreita) { calcAlmSem = 0; calcJanSem = 0; calcAlmFds = 0; calcJanFds = 0; }
  const alimEstimada = voa && !semMobilidade && (fonteVoo !== "passagem" || alim.estimado);
  const almocoSemana = weekdays === 0 ? 0 : (override?.almocoSemana ?? calcAlmSem);
  const jantarSemana = weekdays === 0 ? 0 : (override?.jantarSemana ?? calcJanSem);
  const almocoFds = weekends === 0 ? 0 : (override?.almocoFds ?? calcAlmFds);
  const jantarFds = weekends === 0 ? 0 : (override?.jantarFds ?? calcJanFds);

  const ajudaCusto = mobilidade + almocoSemana + jantarSemana + almocoFds + jantarFds;
  const totalFinal = subtotalDiarias + ajudaCusto;

  return {
    qtdDiarias, weekdays, weekends, diasComDiaria, regraDiaria,
    valorDiaria, valorDiariaUtil: valorDiaria, valorDiariaFds: valorDiaria,
    subtotalDiarias, subtotalDiariasUtil, subtotalDiariasFds,
    mobilidade, mobilidadeIda, mobilidadeVolta,
    almocoSemana, jantarSemana, almocoFds, jantarFds,
    unitAlmocoSemana: refUtil.almocoCents, unitJantarSemana: refUtil.jantarCents,
    unitAlmocoFds: refFds.almocoCents, unitJantarFds: refFds.jantarCents,
    ajudaCusto, totalFinal,
    hasOverride: !!override,
    isPercurso, funcaoLocal, percurseiroTipo, percurseiro,
    cenoEmpreitaVaga, cenoFreelaTipo, cenoEmpreita,
    vooPartidaIda, vooChegadaIda, vooPartidaVolta, fonteVoo, alimEstimada,
    deflationSegments: deflated.segments,
    sysValorDiaria, sysMobilidade: sysMob, sysMobilidadeIda: sysMobIda, sysMobilidadeVolta: sysMobVolta,
    sysAlmocoSemana: calcAlmSem, sysJantarSemana: calcJanSem, sysAlmocoFds: calcAlmFds, sysJantarFds: calcJanFds,
  };
}

/** Os campos monetários de budget_planned que o resultado grava. */
export interface LinhaDoPlanejado {
  dailyQuantity: number;
  dailyValue: number;
  costAssistance: number;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobility: number;
  mobilityIda: number;
  mobilityVolta: number;
  transport: number;
  totalValue: number;
}

/**
 * O que a tela persiste ao "Enviar para o Planejado" (savePlannedAndSendToActual):
 * dias = os que recebem diária; diária = média ponderada (total deflacionado ÷
 * dias), para Realizado/Comparativo lerem dailyQuantity × dailyValue.
 */
export function linhaDoPlanejado(r: ResultadoDoPlanejado): LinhaDoPlanejado {
  const totalDias = r.diasComDiaria;
  const dailyValue = totalDias > 0 ? Math.round(r.subtotalDiarias / totalDias) : r.valorDiaria;
  return {
    dailyQuantity: totalDias,
    dailyValue,
    costAssistance: 0,
    weekdayLunch: r.almocoSemana,
    weekdayDinner: r.jantarSemana,
    weekendLunch: r.almocoFds,
    weekendDinner: r.jantarFds,
    mobility: r.mobilidade,
    mobilityIda: r.mobilidadeIda,
    mobilityVolta: r.mobilidadeVolta,
    transport: 0,
    totalValue: r.totalFinal,
  };
}
