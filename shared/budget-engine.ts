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
  fatorDeDeflacaoDoDia,
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
import { calcAlimentacao, dataDeChegadaDaIda, refeicaoCents, refeicaoCentsDia, refeicaoPerfil, isCenotecnicaFunction, vrValido } from "./alimentacao";
import { cenoEmpreitaTotalCents, isCenoFreelaTipo, usaEmpreitaCenotecnica, vagaComEmpreita, type CenoFreelaTipo, type CenoEmpreitaValor } from "./cenotecnica-empreita";
import { listarDiasDeTrabalho } from "./dias-de-trabalho";
import { valorDoHonorarioNaVaga, type HonorarioNaVaga } from "./honorarios-ceno";
import { diasDeTrabalhoDaVaga, meiasDiariasDoPlanejado, normalizarDiasMeiaExtra, type MeiaDiariaDoDia } from "./meia-diaria";
import { mobilidadeCoerente } from "./comparativo";

/**
 * Empreita da TABELA sem mobilidade (28/10 — pedido do DP, caso Lucas: NR São
 * Luís, Freela Viagem): a vaga com modalidade de empreita (`cenoFreelaTipo`)
 * aplicada não tem ida/volta no Planejado — o valor fechado já cobre o
 * deslocamento. Decisão do dono: SÓ a empreita; freela de diária comum e casa
 * seguem como estão. O ajuste manual continua mandando.
 */
export const EMPREITA_SEM_MOBILIDADE_RAZAO = "Empreita (tabela) — sem mobilidade: o valor fechado já cobre o deslocamento";

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
  /** Datas sugeridas de ida/volta (YYYY-MM-DD) — situam os horários na escala (alimentação). */
  flightDepartureDate?: string | null;
  flightReturnDate?: string | null;
  /** Dias com 1,5 diária marcados na Escalação (28/10, shared/meia-diaria.ts). */
  diasMeiaExtra?: (string | null | undefined)[] | null;
}

/** Passagem registrada da vaga — os horários REAIS mandam sobre os sugeridos. */
export interface PassagemParaPlanejado {
  actualDepartureDate?: string | null;
  actualReturnDate?: string | null;
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
  /** Dias com 1,5 diária marcados/desmarcados pelo DP no Planejado (28/10) — substitui os da vaga. */
  diasMeiaExtra?: string[];
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
  /**
   * Honorário da cenotécnica desta vaga (21/10) — `honorariosNasVagas`
   * (shared/honorarios-ceno.ts). Aprovado: a mão de obra passa a ser o valor
   * aprovado (já rateado na empreita); pendente: nada muda (só o selo).
   */
  honorario?: HonorarioNaVaga | null;
  /** VR diário do colaborador (28/10, collaborators.vr_diario_cents) — só a casa usa (almoço de dia útil). */
  vrDiarioCents?: number | null;
}

export interface ResultadoDoPlanejado {
  qtdDiarias: number;
  weekdays: number;
  weekends: number;
  /** Dias que recebem diária (casa: só fds; percurso: um por dia trabalhado — regra 15/10). */
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
  /** Honorário da vaga (aprovado ou pendente), para os textos da tela — null sem pedido. */
  honorario: HonorarioNaVaga | null;
  /** O honorário APROVADO é a mão de obra da vaga (com ou sem ajuste manual por cima). */
  honorarioAprovado: boolean;
  /** Há ajuste manual da diária e ele difere do honorário aprovado. */
  honorarioDifere: boolean;
  /** Mão de obra que a regra de hoje daria (tabela/diária, sem ajuste) — só com honorário aprovado. */
  maoDeObraPelaRegra: number | null;
  /** Dias com 1,5 diária em vigor (os do ajuste do DP, senão os da vaga), dentro dos dias de trabalho (28/10). */
  diasMeiaExtra: string[];
  /** O ½ de cada dia marcado (já somado em `subtotalDiarias`). */
  meiasDiarias: MeiaDiariaDoDia[];
  subtotalMeiasDiarias: number;
  /** O ½ que cada dia de TRABALHO ganharia se marcado (com a diária de agora) — prévia no ajuste. */
  meiaDiariaPossivel: MeiaDiariaDoDia[];
  /** Há dia marcado, mas o valor da vaga é fechado (honorário aprovado / empreita por empresa): o ½ não entra. */
  meiaDiariaSemEfeito: boolean;
  /** Empreita da tabela: mobilidade 0 pela regra (28/10) — `EMPREITA_SEM_MOBILIDADE_RAZAO`. */
  empreitaSemMobilidade: boolean;
  /** VR que entrou no almoço de dia útil (casa com VR cadastrado), senão null. */
  vrDiarioCents: number | null;
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
    ? diasPercurseiro(inclusion)
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
  const sysValorDiariaPelaRegra = percursoVal ?? cenoEmpreitaDiaria ?? atendVal
    ?? freelaVal ?? casaVal ?? (fvDaily > 0 ? fvDaily : null) ?? inclusionDailyValue ?? defaultDailyValueWeekday;

  // Honorário APROVADO da cenotécnica (21/10): a mão de obra é o valor
  // aprovado (a parte da vaga, na empreita) pelos dias trabalhados — a diária
  // mostrada é o valor ÷ dias. Vence a tabela, a diária e a empreita por
  // empresa; o ajuste manual continua vencendo (abaixo).
  const honorario = e.honorario ?? null;
  const honorarioAprovado = honorario?.situacao === "aprovado" ? honorario : null;
  const diasHonorario = honorarioAprovado ? Math.max(1, diasEmpreita(inclusion) || diasComDiaria) : 0;
  const diariaDoHonorario = honorarioAprovado ? Math.round(honorarioAprovado.valorCents / diasHonorario) : null;
  const sysValorDiaria = diariaDoHonorario ?? sysValorDiariaPelaRegra;
  const overrideDiaria = override?.valorDiaria ?? override?.valorDiariaUtil ?? override?.valorDiariaFds;
  const valorDiaria = overrideDiaria ?? sysValorDiaria;

  // Deflação por período (percurso e empreita: sem deflação)
  const empreitaEditada = !!cenoEmpreita && overrideDiaria !== undefined;
  // Mão de obra pela regra de hoje, sem ajuste — só calculada com honorário
  // aprovado, para a tela dizer o que o aprovado substituiu.
  const maoDeObraPelaRegra = !honorarioAprovado ? null
    : isPercurso ? sysValorDiariaPelaRegra * diasComDiaria
    : cenoEmpreita ? cenoEmpreita.totalCents
    : calcDeflatedDailies(sysValorDiariaPelaRegra, diasComDiaria, deflationFactorsFromSettings(ss as Record<string, number | string | undefined> | undefined)).totalCents;
  const maoDeObra = honorarioAprovado
    ? valorDoHonorarioNaVaga({
        honorario: honorarioAprovado,
        regraCents: maoDeObraPelaRegra ?? 0,
        // Ajuste igual à diária do honorário (valor ÷ dias) não é diferença:
        // vale o aprovado exato, sem o resto do arredondamento.
        ajusteCents: overrideDiaria === undefined ? null
          : overrideDiaria === diariaDoHonorario ? honorarioAprovado.valorCents
          : overrideDiaria * diasHonorario,
      })
    : null;
  const deflated = maoDeObra
    ? { totalCents: maoDeObra.subtotalCents, segments: [{ days: diasHonorario, factor: 1, dailyCents: valorDiaria, totalCents: maoDeObra.subtotalCents, label: maoDeObra.fonte === "ajuste" ? "ajuste manual" : "honorário aprovado" }] as DeflationSegment[] }
    : isPercurso
    ? { totalCents: valorDiaria * diasComDiaria, segments: [{ days: diasComDiaria, factor: 1, dailyCents: valorDiaria, totalCents: valorDiaria * diasComDiaria, label: "pacote fechado" }] as DeflationSegment[] }
    : cenoEmpreita
    ? (() => {
        const total = empreitaEditada ? valorDiaria * cenoEmpreita.dias : cenoEmpreita.totalCents;
        return { totalCents: total, segments: [{ days: cenoEmpreita.dias, factor: 1, dailyCents: valorDiaria, totalCents: total, label: "valor fechado" }] as DeflationSegment[] };
      })()
    : calcDeflatedDailies(valorDiaria, diasComDiaria, deflationFactorsFromSettings(ss as Record<string, number | string | undefined> | undefined));

  // 1,5 diária num dia (28/10, pedido do DP — shared/meia-diaria.ts): o ½ da
  // diária DAQUELE dia, com o fator de deflação do dia; dia sem diária pela
  // regra (casa em dia útil) fica sem. Valor fechado da vaga inteira
  // (honorário aprovado, empreita por empresa): o ½ não se soma.
  const diasMeiaExtra = normalizarDiasMeiaExtra(override?.diasMeiaExtra ?? inclusion.diasMeiaExtra, diasDeTrabalhoDaVaga(inclusion));
  const meiaDiariaSemEfeito = diasMeiaExtra.length > 0 && (!!maoDeObra || empreita);
  const valorFlatPorDia = isPercurso || !!cenoEmpreita;
  const diasQueRecebemDiaria = regraDiaria === "nenhuma" ? []
    : valorFlatPorDia ? diasDeTrabalhoDaVaga(inclusion)
    : diasPeriodo.filter((d) => regraDiaria === "todos" || ehFds(d));
  const fatores = deflationFactorsFromSettings(ss as Record<string, number | string | undefined> | undefined);
  const diariaDoDia = (p: number) => valorFlatPorDia ? valorDiaria : Math.round(valorDiaria * fatorDeDeflacaoDoDia(p + 1, fatores));
  // O ½ que CADA dia de trabalho ganharia se marcado — a tela de ajuste mostra
  // o efeito antes de salvar (valor fechado: zero em todos).
  const meiaDiariaPossivel = !!maoDeObra || empreita
    ? diasDeTrabalhoDaVaga(inclusion).map((dia) => ({ dia, valorCents: 0 }))
    : meiasDiariasDoPlanejado(diasDeTrabalhoDaVaga(inclusion), diasQueRecebemDiaria, diariaDoDia).dias;
  const meias = meiaDiariaSemEfeito || diasMeiaExtra.length === 0
    ? { dias: diasMeiaExtra.map((dia) => ({ dia, valorCents: 0 })), totalCents: 0 }
    : meiasDiariasDoPlanejado(diasMeiaExtra, diasQueRecebemDiaria, diariaDoDia);
  const meiasUtil = meias.dias.filter((m) => !ehFds(m.dia)).reduce((s, m) => s + m.valorCents, 0);

  const subtotalDiariasBase = deflated.totalCents;
  const subtotalDiarias = subtotalDiariasBase + meias.totalCents;
  const subtotalDiariasUtilBase = (regraDiaria === "fds" || regraDiaria === "nenhuma")
    ? 0
    : (diasComDiaria > 0 && !isPercurso ? Math.round(subtotalDiariasBase * weekdays / diasComDiaria) : (isPercurso ? subtotalDiariasBase : 0));
  const subtotalDiariasUtil = subtotalDiariasUtilBase + (isPercurso ? meias.totalCents : meiasUtil);
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
  // Empreita da tabela (28/10): só a MOBILIDADE zera — a alimentação segue a
  // regra de sempre (o freela já não recebe; casa não usa a tabela).
  const empreitaSemMobilidade = !semMobilidade && usaEmpreitaCenotecnica(isCenotecnicaFunction(fnName), collabType) && isCenoFreelaTipo(cenoFreelaTipo);
  const sysMobIda = semMobilidade || empreitaSemMobilidade ? 0 : mobilidadeTrechoComLocalCents(e.eventLocation, { voa, partida: vooPartidaIda, chegada: vooChegadaIda, trecho: "ida", terrestre });
  const sysMobVolta = semMobilidade || empreitaSemMobilidade ? 0 : mobilidadeTrechoComLocalCents(e.eventLocation, { voa, partida: vooPartidaVolta, chegada: vooChegadaVolta, trecho: "volta", terrestre });
  const sysMob = sysMobIda + sysMobVolta;
  // Ajuste manual coerente (28/10 — caso Lucas): total = ida + volta, sempre;
  // zerar o total zera as duas (shared/comparativo.ts → mobilidadeCoerente).
  const mob = mobilidadeCoerente(
    { total: override?.mobilidade, ida: override?.mobilidadeIda, volta: override?.mobilidadeVolta },
    { total: sysMob, ida: sysMobIda, volta: sysMobVolta },
  );
  const mobilidade = mob.total;
  const mobilidadeIda = mob.ida;
  const mobilidadeVolta = mob.volta;

  // Alimentação por refeição, dirigida pelos horários
  const perfil = refeicaoPerfil(fnName, inclusion.atendimentoTipo);
  const { almocoCents, jantarCents } = refeicaoCents(perfil, ss);
  // VR do colaborador (28/10): a casa com VR cadastrado paga no almoço de dia
  // útil só o que falta para o valor da regra (shared/alimentacao.ts).
  const vrDiarioCents = collabType === "casa" ? vrValido(e.vrDiarioCents) : null;
  const refUtil = refeicaoCentsDia(perfil, ss, { tipoColaborador: collabType, isWeekend: false, vrDiarioCents });
  const refFds = refeicaoCentsDia(perfil, ss, { tipoColaborador: collabType, isWeekend: true });
  // Datas da viagem (15/10): mesma precedência dos horários — passagem, senão
  // a sugerida na escalação. Volta no dia SEGUINTE ao último dia da escala
  // (ex.: madrugada de segunda) não corta as refeições do último dia.
  const dataPartidaIda = ticket?.actualDepartureDate || inclusion.flightDepartureDate || null;
  const dataPartidaVolta = ticket?.actualReturnDate || inclusion.flightReturnDate || null;
  const alim = calcAlimentacao({
    workDays: semMobilidade ? [] : diasPeriodo, voa,
    chegadaIda: vooChegadaIda, partidaVolta: vooPartidaVolta, chegadaVolta: vooChegadaVolta,
    dataChegadaIda: dataDeChegadaDaIda(dataPartidaIda, vooPartidaIda, vooChegadaIda),
    dataPartidaVolta,
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
    // Com honorário aprovado a tabela não vale mais para a vaga: o valor dela
    // fica em `maoDeObraPelaRegra` (o que o aprovado substituiu).
    cenoEmpreitaVaga, cenoFreelaTipo, cenoEmpreita: maoDeObra ? null : cenoEmpreita,
    vooPartidaIda, vooChegadaIda, vooPartidaVolta, fonteVoo, alimEstimada,
    deflationSegments: deflated.segments,
    sysValorDiaria, sysMobilidade: sysMob, sysMobilidadeIda: sysMobIda, sysMobilidadeVolta: sysMobVolta,
    sysAlmocoSemana: calcAlmSem, sysJantarSemana: calcJanSem, sysAlmocoFds: calcAlmFds, sysJantarFds: calcJanFds,
    honorario,
    honorarioAprovado: !!maoDeObra,
    honorarioDifere: !!maoDeObra?.difereDoAprovado,
    maoDeObraPelaRegra,
    diasMeiaExtra,
    meiasDiarias: meias.dias,
    subtotalMeiasDiarias: meias.totalCents,
    meiaDiariaPossivel,
    meiaDiariaSemEfeito,
    empreitaSemMobilidade,
    vrDiarioCents,
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
  /** Dias com 1,5 diária (28/10) — o ½ já está na média `dailyValue`. */
  diasMeiaExtra: string[];
}

/**
 * O que a tela persiste ao "Enviar para o Planejado" (savePlannedAndSendToActual):
 * dias = os que recebem diária; diária = média ponderada (total deflacionado ÷
 * dias), para Realizado/Comparativo lerem dailyQuantity × dailyValue.
 * 28/10: com 1,5 diária num dia o ½ entra na média do mesmo jeito.
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
    diasMeiaExtra: r.diasMeiaExtra,
  };
}
