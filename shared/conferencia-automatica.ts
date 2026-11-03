/**
 * Conferência automática — Módulo de Honorários (deck do dono, 29/10).
 *
 * "Etapa 4 · Conferência DP: confere divergências; pulada se realizado =
 * planejado" e "Realizado igual ao planejado pula 'Validado' e segue direto
 * para OC". Quando a prestação é enviada ao DP SEM NENHUMA divergência da linha
 * pré-aprovada, ela é aprovada como se o DP tivesse aprovado e já aparece em
 * Ordens de compra. Na dúvida, vai ao DP como sempre: qualquer motivo abaixo
 * derruba a conferência automática.
 *
 * Marca (sem coluna nova): `rh_status` aprovado, `rh_comment` igual ao texto de
 * `CONFERENCIA_AUTOMATICA` e `rh_action_by` nulo — nenhuma pessoa decidiu.
 * O texto sozinho não marca: um comentário do DP tem autor.
 *
 * Funções puras — servidor (decisão) e telas (o selo no lugar do nome).
 */
import { idaEVoltaDaMobilidade } from "./comparativo";
import { mesmosDiasDeDobra } from "./dobra-de-turno";
import { ehEventoLegado } from "./legado-honorarios";
import { camposDeValorQueMudaram, estaPreAprovado, type CampoDeValorDoPlanejado, type ValoresDoPlanejado } from "./pre-aprovacao";
import { diasPendentes, periodoDaPrestacao, type EventoParaDias, type InclusaoParaDias, type MarcacaoDoDia, type OcorrenciaDoDia } from "./presenca";
import { podeDecidirPrestacao } from "./prestacao-rules";

/** O que as telas e o histórico mostram no lugar do nome de quem aprovou. */
export const CONFERENCIA_AUTOMATICA = "Conferência automática (sem divergência)";

/** A aprovação foi da conferência automática (e não de uma pessoa do DP)? */
export function ehConferenciaAutomatica(
  p: { rhStatus?: string | null; rhComment?: string | null; rhActionBy?: string | null } | null | undefined,
): boolean {
  return !!p && p.rhStatus === "aprovado" && !p.rhActionBy && p.rhComment === CONFERENCIA_AUTOMATICA;
}

/** Por que a prestação vai ao DP. */
export const ROTULO_DO_MOTIVO_DA_CONFERENCIA = {
  fora_da_analise: "A prestação não está em análise",
  sem_colaborador: "Sem colaborador",
  sem_planejado: "Sem linha do Planejado",
  sem_pre_aprovacao: "A linha do Planejado não está pré-aprovada",
  nao_participou: "Marcada como não participou",
  outra_vaga: "Colaborador, função, tipo ou evento diferente do Planejado",
  divisao: "Vaga dividida",
  ja_passou_pelo_dp: "Já foi devolvida ou recusada pelo DP",
  ajustada_pelo_dp: "O DP ajustou os valores",
  evento_indisponivel: "Evento cancelado ou não encontrado",
  evento_legado: "Evento legado",
  sem_valor: "Valor zerado",
  valor_diferente: "Valores diferentes do Planejado",
  dias_diferentes: "Dias trabalhados diferentes da escala",
  meia_diaria_diferente: "½ diária diferente do Planejado",
  dobra_de_turno: "Dobra de turno",
  ocorrencia_ativa: "Ocorrência lançada",
  horas_extras: "Horas extras",
  ajuste_do_produtor: "Ajuste do produtor sobre o valor calculado",
  justificativa_para_o_dp: "Justificativa escrita para o DP",
  presenca_incompleta: "Dia sem presença registrada",
  sem_confirmacao: "Sem a confirmação do colaborador",
  contestada: "Contestada pelo colaborador",
  dias_confirmados_diferentes: "Dias confirmados diferentes dos trabalhados",
} as const;

export type MotivoDaConferencia = keyof typeof ROTULO_DO_MOTIVO_DA_CONFERENCIA;

export interface PrestacaoParaConferencia extends ValoresDoPlanejado {
  sentForReview?: boolean | null;
  rhStatus?: string | null;
  plannedId?: string | null;
  eventId?: string | null;
  collaboratorId?: string | null;
  functionId?: string | null;
  collaboratorType?: string | null;
  splitParentId?: string | null;
  didNotAttend?: boolean | null;
  resubmitted?: boolean | null;
  rhActionAt?: Date | string | null;
  rhAdjusted?: boolean | null;
  workedDays?: readonly (string | null)[] | null;
  diasMeiaExtra?: readonly (string | null)[] | null;
  diasDobra?: readonly (string | null)[] | null;
  horasExtras?: string | number | null;
  valorHorasExtras?: number | null;
  ajusteProdutorPct?: string | number | null;
  changeReason?: string | null;
  checkoutFinalEm?: Date | string | null;
}

export interface PlanejadoParaConferencia extends ValoresDoPlanejado {
  status?: string | null;
  didNotAttend?: boolean | null;
  eventId?: string | null;
  collaboratorId?: string | null;
  functionId?: string | null;
  collaboratorType?: string | null;
  diasMeiaExtra?: readonly (string | null)[] | null;
}

export interface EntradaDaConferencia {
  /** A prestação JÁ enviada (em análise), com os valores que ficaram gravados. */
  prestacao: PrestacaoParaConferencia;
  planejado: PlanejadoParaConferencia | null | undefined;
  evento: (EventoParaDias & { status?: string | null }) | null | undefined;
  /** A vaga: o período da escala é a referência dos dias (o Planejado só guarda a quantidade). */
  inclusao?: InclusaoParaDias | null;
  dataDeCorte: string;
  /** A prestação tem filhos de divisão? */
  temDivisoes: boolean;
  /** Pode trazer as removidas — só as ativas contam. */
  ocorrencias: readonly OcorrenciaDoDia[];
  presencas: readonly (MarcacaoDoDia & { dia: string })[];
  confirmacao: { contestacao?: string | null; diasConfirmados?: readonly (string | null)[] | null } | null | undefined;
}

export interface ResultadoDaConferencia {
  automatica: boolean;
  /** Vazio quando `automatica`; senão, TODOS os motivos de ir ao DP. */
  motivos: MotivoDaConferencia[];
  /** Os campos de valor que divergem (motivo `valor_diferente`). */
  camposDiferentes: CampoDeValorDoPlanejado[];
}

/**
 * Valores para comparar: ida e volta como o Comparativo as mostra (sem divisão
 * gravada, a mobilidade total divide ao meio) — ida/volta nulas em linha antiga
 * não são divergência; ida/volta que não fecham com o total são.
 */
function valoresComparaveis(v: ValoresDoPlanejado): ValoresDoPlanejado {
  const { ida, volta } = idaEVoltaDaMobilidade(v.mobility, v.mobilityIda, v.mobilityVolta);
  return {
    dailyQuantity: v.dailyQuantity ?? 0, dailyValue: v.dailyValue ?? 0, costAssistance: v.costAssistance ?? 0,
    weekdayLunch: v.weekdayLunch ?? 0, weekdayDinner: v.weekdayDinner ?? 0,
    weekendLunch: v.weekendLunch ?? 0, weekendDinner: v.weekendDinner ?? 0,
    mobility: v.mobility ?? 0, mobilityIda: ida, mobilityVolta: volta,
    transport: v.transport ?? 0, totalValue: v.totalValue ?? 0,
  };
}

const diaDe = (d: string | null | undefined) => String(d ?? "").slice(0, 10);
const diasGravados = (l: readonly (string | null)[] | null | undefined) => (l ?? []).filter((d): d is string => !!d).map(diaDe);

/**
 * A prestação pode pular a Conferência DP? Regra conservadora: linha do
 * Planejado pré-aprovada, mesma pessoa e função, todos os valores iguais,
 * os mesmos dias da escala, sem ocorrência, sem divisão, sem ½ ou dobra a
 * mais, nunca devolvida, do fluxo novo — e com a presença completa e a
 * confirmação do colaborador sem contestação, porque é o que prova que os dias
 * iguais aconteceram (sem isso, enviar antes do evento já aprovaria).
 */
export function conferirSemDivergencia(e: EntradaDaConferencia): ResultadoDaConferencia {
  const { prestacao: p, planejado, evento } = e;
  const motivos: MotivoDaConferencia[] = [];
  let camposDiferentes: CampoDeValorDoPlanejado[] = [];

  if (!podeDecidirPrestacao(p).ok) motivos.push("fora_da_analise");
  if (!p.collaboratorId) motivos.push("sem_colaborador");
  if (p.didNotAttend || planejado?.didNotAttend) motivos.push("nao_participou");
  if (p.splitParentId || e.temDivisoes) motivos.push("divisao");
  if (p.resubmitted || p.rhActionAt) motivos.push("ja_passou_pelo_dp");
  if (p.rhAdjusted) motivos.push("ajustada_pelo_dp");

  if (!evento || evento.status === "cancelado") motivos.push("evento_indisponivel");
  else if (ehEventoLegado(evento.endDate, e.dataDeCorte)) motivos.push("evento_legado");

  if (!p.plannedId || !planejado) {
    motivos.push("sem_planejado");
  } else {
    if (!estaPreAprovado(planejado.status)) motivos.push("sem_pre_aprovacao");
    const outraVaga = (p.collaboratorId ?? null) !== (planejado.collaboratorId ?? null)
      || (p.functionId ?? null) !== (planejado.functionId ?? null)
      || (p.collaboratorType ?? null) !== (planejado.collaboratorType ?? null)
      || p.eventId !== planejado.eventId;
    if (outraVaga) motivos.push("outra_vaga");
    camposDiferentes = camposDeValorQueMudaram(valoresComparaveis(planejado), valoresComparaveis(p));
    if (camposDiferentes.length > 0) motivos.push("valor_diferente");
    if (!mesmosDiasDeDobra(planejado.diasMeiaExtra, p.diasMeiaExtra)) motivos.push("meia_diaria_diferente");
  }
  // Valor zero não tem o que pagar: quem decide é o DP.
  if (!p.totalValue) motivos.push("sem_valor");

  // O Planejado não guarda dias, só a quantidade: a referência é a escala (ou o evento).
  const diasDaEscala = periodoDaPrestacao({ workedDays: null }, e.inclusao, evento).dias;
  const trabalhados = diasGravados(p.workedDays);
  if (diasDaEscala.length === 0 || (trabalhados.length > 0 && !mesmosDiasDeDobra(trabalhados, diasDaEscala))) motivos.push("dias_diferentes");
  // O Planejado não tem dobra de turno: qualquer dobra é a mais.
  if (diasGravados(p.diasDobra).length > 0) motivos.push("dobra_de_turno");

  if (e.ocorrencias.some((o) => !o.removidoEm)) motivos.push("ocorrencia_ativa");
  if (Number(p.horasExtras ?? 0) !== 0 || (p.valorHorasExtras ?? 0) !== 0) motivos.push("horas_extras");
  if (Number(p.ajusteProdutorPct ?? 0) !== 0) motivos.push("ajuste_do_produtor");
  // No check-out final o motivo é gerado pelo app; fora dele, alguém escreveu para o DP ler.
  if (!p.checkoutFinalEm && p.changeReason?.trim()) motivos.push("justificativa_para_o_dp");

  const dias = periodoDaPrestacao(p, e.inclusao, evento).dias;
  if (diasPendentes({ dias, presencas: e.presencas.map((m) => ({ ...m, dia: diaDe(m.dia) })), ocorrencias: e.ocorrencias }).length > 0) motivos.push("presenca_incompleta");
  if (!e.confirmacao) {
    motivos.push("sem_confirmacao");
  } else {
    if (e.confirmacao.contestacao?.trim()) motivos.push("contestada");
    if (!mesmosDiasDeDobra(e.confirmacao.diasConfirmados, dias)) motivos.push("dias_confirmados_diferentes");
  }

  return { automatica: motivos.length === 0, motivos, camposDiferentes };
}
