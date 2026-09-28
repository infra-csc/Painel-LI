/**
 * Editor do MODAL do Realizado (`useActualEditor`) — 25/09 (modularização).
 *
 * Extraído de budget-actual.tsx: o estado do formulário e dos dias, e o estado
 * DERIVADO de viagem/alimentação (horário da passagem/escalação, alimentação
 * recalculada, aviso "desatualizado"). Só o que o usuário digitou fica em
 * estado; o resto é calculado a cada render — antes eram dois useEffect com
 * dependências desligadas que sincronizavam cópias e divergiam.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BudgetActual, BudgetPlanned, InsertBudgetActual, TeamInclusion, Ticket } from "@shared/schema";
import { isFuncaoLocal, isPercursoFunction, regraDiariaPorTipo } from "@shared/calculation-rules";
import { isTransporteTerrestre } from "@shared/atendimento";
import { calcAlimentacao, refeicaoCentsDia, refeicaoPerfil, toHoraHHMM } from "@shared/alimentacao";
import {
  alimSignature, isWeekendDate, reconstructDailyValues, subtotalDiariasDe,
  type AlimField, type DayCounts, type DayEntry, type EditFormBase, type ModalActualTab, type TravelSource,
} from "@/components/budget/actual-utils";

export interface EntradaDoEditorDoRealizado {
  getItemInclusion: (item: BudgetActual) => TeamInclusion | undefined;
  getItemDayCounts: (item: BudgetActual) => DayCounts;
  getPlannedRef: (item: BudgetActual) => BudgetPlanned | undefined;
  getFunctionName: (id?: string | null) => string;
  functionNameById: Map<string, string>;
  ticketByInclusion: Map<string, Ticket>;
  actualsPorGrupo: Map<string, BudgetActual[]>;
  systemSettings: Record<string, number> | undefined;
}

/** O que o salvar manda para `PATCH /api/budget-actual/:id`. */
export interface PayloadDaPrestacao { id: string; data: Partial<InsertBudgetActual> }

const TRAVEL_VAZIO = { chegadaIda: "", partidaVolta: "", chegadaSrc: "nenhum" as TravelSource, partidaSrc: "nenhum" as TravelSource };

export function useBudgetActualEditor(e: EntradaDoEditorDoRealizado) {
  const { getItemInclusion, getItemDayCounts, getPlannedRef, getFunctionName, functionNameById, ticketByInclusion, actualsPorGrupo, systemSettings } = e;

  const [editingItem, setEditingItem] = useState<BudgetActual | null>(null);
  // `editFormBase` guarda o que foi digitado; `editFormData` (derivado, mais
  // abaixo) é o que a tela mostra e o saveEdit grava — com a alimentação
  // recalculada quando os dias/horários mudam e não houve ajuste manual.
  const [editFormBase, setEditFormData] = useState<EditFormBase | null>(null);
  const [editDayEntries, setEditDayEntries] = useState<DayEntry[]>([]);
  const [showAddDay, setShowAddDay] = useState(false);
  // ── Viagem (só estado do modal) ────────────────────────────────────────────
  // PERSISTÊNCIA: não existe coluna em `budget_actual` para os horários de
  // viagem e NÃO criamos uma. Eles são derivados da passagem registrada
  // (tickets.actualArrivalTime / actualReturnTime) ou, na falta dela, dos
  // horários sugeridos na escalação (team_inclusions.flight*SuggestedTime), e
  // podem ser ajustados aqui porque a realidade pode ter mudado. O que se
  // grava é apenas o RESULTADO do cálculo: os 4 campos de alimentação
  // (weekdayLunch / weekdayDinner / weekendLunch / weekendDinner) em
  // `editFormData`, salvos pelo saveEdit como sempre.
  // Horários informados à mão no modal (campo ausente = usa o derivado).
  const [travelManual, setTravelManual] = useState<{ chegadaIda?: string; partidaVolta?: string }>({});
  // Alimentação ajustada à mão: nunca é sobrescrita automaticamente
  const [alimManual, setAlimManual] = useState(false);
  // Assinatura (dias ativos + horários) sob a qual os 4 campos de alimentação
  // gravados em `editFormBase` valem. Assinatura atual diferente ⇒ recalcula
  // (automático) ou avisa "desatualizado" (manual).
  const [alimSigBase, setAlimSigBase] = useState<string>("");
  // Dia extra virou o primeiro/último da lista: destaca o campo de hora correspondente
  const [extraDayEdge, setExtraDayEdge] = useState<null | "primeiro" | "ultimo">(null);
  const chegadaInputRef = useRef<HTMLInputElement>(null);
  const partidaInputRef = useRef<HTMLInputElement>(null);
  const [modalActualTab, setModalActualTab] = useState<ModalActualTab>("custos");

  // Horários de viagem já conhecidos para este item: a PASSAGEM registrada
  // manda; sem passagem, cai nos horários SUGERIDOS na escalação (texto livre,
  // normalizado para HH:MM por toHoraHHMM).
  const deriveTravel = useCallback((item: BudgetActual): {
    chegadaIda: string; partidaVolta: string; chegadaSrc: TravelSource; partidaSrc: TravelSource;
  } => {
    const inclusion = getItemInclusion(item);
    const ticket = inclusion ? ticketByInclusion.get(inclusion.id) : undefined;
    const chegadaPassagem = toHoraHHMM(ticket?.actualArrivalTime);
    const partidaPassagem = toHoraHHMM(ticket?.actualReturnTime);
    const chegadaSugerida = toHoraHHMM(inclusion?.flightArrivalSuggestedTime);
    const partidaSugerida = toHoraHHMM(inclusion?.flightReturnSuggestedTime);
    return {
      chegadaIda: chegadaPassagem || chegadaSugerida || "",
      partidaVolta: partidaPassagem || partidaSugerida || "",
      chegadaSrc: chegadaPassagem ? "passagem" : chegadaSugerida ? "sugerido" : "nenhum",
      partidaSrc: partidaPassagem ? "passagem" : partidaSugerida ? "sugerido" : "nenhum",
    };
  }, [getItemInclusion, ticketByInclusion]);

  /**
   * Primeiro e último dia da VIAGEM INTEIRA (o "grupo": prestação-pai + filhos
   * da divisão). A chegada da ida e a partida da volta só acontecem UMA vez por
   * viagem — são as bordas do grupo, não as bordas de cada pedaço.
   * Só devolve bordas quando o item PERTENCE a um grupo dividido; fora disso
   * devolve nulls e o chamador segue tratando o item como a viagem inteira.
   * Dentro do grupo, a prioridade é: `workedDays` de todo o grupo → `workDays`
   * da escalação → intervalo scheduleStartDate/scheduleEndDate.
   */
  const getGroupDayBounds = useCallback((item: BudgetActual): { first: string | null; last: string | null } => {
    const parentId = item.splitParentId || item.id;
    const groupItems = actualsPorGrupo.get(parentId) || [];
    // SEM divisão o item já É a viagem inteira: nada a restringir (e o usuário
    // continua podendo desativar o primeiro dia sem perder o horário de chegada).
    if (groupItems.length <= 1) return { first: null, last: null };
    const groupDays = Array.from(new Set(groupItems.flatMap(a => a.workedDays || []).map(d => String(d).slice(0, 10)))).sort();
    if (groupDays.length > 0) return { first: groupDays[0], last: groupDays[groupDays.length - 1] };
    const inclusion = getItemInclusion(item);
    const incDays = ((inclusion?.workDays || []) as (string | null)[])
      .filter((d): d is string => !!d).map(d => String(d).slice(0, 10)).sort();
    if (incDays.length > 0) return { first: incDays[0], last: incDays[incDays.length - 1] };
    if (inclusion?.scheduleStartDate && inclusion?.scheduleEndDate) {
      return { first: String(inclusion.scheduleStartDate).slice(0, 10), last: String(inclusion.scheduleEndDate).slice(0, 10) };
    }
    return { first: null, last: null };
  }, [actualsPorGrupo, getItemInclusion]);

  // Recalcula a alimentação com as MESMAS regras do Planejado
  // (shared/alimentacao): dias ATIVOS do modal + horário de CHEGADA da ida
  // (vale no primeiro dia) e de PARTIDA da volta (vale no último dia). Devolve
  // já distribuído nos 4 campos persistidos (útil/fds × almoço/jantar), com o
  // valor da refeição dependendo do dia (casa/CLT em dia útil tem almoço
  // reduzido — refeicaoCentsDia).
  //
  // DIVISÃO DE ESCALAÇÃO: os horários são da VIAGEM INTEIRA. `calcAlimentacao`
  // aplica a chegada no primeiro dia da lista e a partida no último — num FILHO
  // da divisão esses dias são só o começo/fim do PEDAÇO, e a pessoa já estava no
  // evento (ou ainda ficaria). Por isso a chegada só vale se o primeiro dia
  // ativo do item for também o primeiro dia do GRUPO, e a partida só se o
  // último for o último do grupo; nos demais casos o horário é omitido e o dia
  // conta CHEIO (almoço + jantar), como um dia de "meio".
  const calcAlimentacaoRealizado = useCallback((
    item: BudgetActual,
    activeDates: string[],
    chegadaIda: string,
    partidaVolta: string,
  ): { weekdayLunch: number; weekdayDinner: number; weekendLunch: number; weekendDinner: number } => {
    const out = { weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0 };
    const fnName = item.functionId ? functionNameById.get(item.functionId) || "-" : "-";
    // Percurso (pacote fechado) e função local não têm alimentação — igual ao Planejado
    if (isPercursoFunction(fnName) || isFuncaoLocal(fnName)) return out;
    if (activeDates.length === 0) return out;

    const inclusion = getItemInclusion(item);
    const ticket = inclusion ? ticketByInclusion.get(inclusion.id) : undefined;
    const voa = !!inclusion?.needsTicket;
    // Van/ônibus no retorno já paga jantar a partir das 20h (regra 17/08)
    const terrestre =
      ticket?.transportType === "rodoviario" || ticket?.transportType === "van" ||
      (!ticket && (
        isTransporteTerrestre(inclusion?.flightDepartureSuggestedTime) ||
        isTransporteTerrestre(inclusion?.flightArrivalSuggestedTime) ||
        isTransporteTerrestre(inclusion?.flightReturnSuggestedTime)
      ));

    const perfil = refeicaoPerfil(fnName, inclusion?.atendimentoTipo);
    const ss = systemSettings as Record<string, number> | undefined;
    const refUtil = refeicaoCentsDia(perfil, ss, { tipoColaborador: item.collaboratorType, isWeekend: false });
    const refFds  = refeicaoCentsDia(perfil, ss, { tipoColaborador: item.collaboratorType, isWeekend: true });

    // Bordas reais da viagem (grupo pai + filhos) — ver comentário do método
    // (comparação por string funciona: as datas são YYYY-MM-DD. `<=` / `>=` e
    // não `===` para o caso de o RH ADICIONAR um dia fora do período gravado —
    // aí esse dia realmente vira a ponta da viagem.)
    const bounds = getGroupDayBounds(item);
    const ordenados = [...activeDates].sort();
    const ehPrimeiroDoGrupo = !bounds.first || ordenados[0] <= bounds.first;
    const ehUltimoDoGrupo = !bounds.last || ordenados[ordenados.length - 1] >= bounds.last;

    const alim = calcAlimentacao({
      workDays: activeDates,
      voa,
      chegadaIda: ehPrimeiroDoGrupo ? (chegadaIda || null) : null,
      partidaVolta: ehUltimoDoGrupo ? (partidaVolta || null) : null,
      // totalCents não é usado aqui — a distribuição por dia usa refUtil/refFds
      almocoCents: refUtil.almocoCents,
      jantarCents: refUtil.jantarCents,
      terrestre,
    });

    for (const d of alim.dias) {
      const fds = isWeekendDate(d.date);
      if (d.almoco) { if (fds) out.weekendLunch  += refFds.almocoCents; else out.weekdayLunch  += refUtil.almocoCents; }
      if (d.jantar) { if (fds) out.weekendDinner += refFds.jantarCents; else out.weekdayDinner += refUtil.jantarCents; }
    }
    return out;
  }, [functionNameById, getItemInclusion, ticketByInclusion, systemSettings, getGroupDayBounds]);

  // ── Viagem e alimentação do modal: DERIVADAS (23/09) ───────────────────────
  // Horário: o que foi digitado à mão vence; senão, passagem > sugerido na
  // escalação. Passagem/escalação que chegam depois de o modal abrir entram
  // sozinhas (sem efeito de sincronização).
  const travelDerivado = useMemo(
    () => editingItem ? deriveTravel(editingItem) : TRAVEL_VAZIO,
    [editingItem, deriveTravel],
  );
  const editTravel = useMemo(() => ({
    chegadaIda: travelManual.chegadaIda ?? travelDerivado.chegadaIda,
    partidaVolta: travelManual.partidaVolta ?? travelDerivado.partidaVolta,
  }), [travelManual, travelDerivado]);
  const travelSource = useMemo(() => ({
    chegada: (travelManual.chegadaIda !== undefined ? "manual" : travelDerivado.chegadaSrc) as TravelSource,
    partida: (travelManual.partidaVolta !== undefined ? "manual" : travelDerivado.partidaSrc) as TravelSource,
  }), [travelManual, travelDerivado]);

  const activeDates = useMemo(() => editDayEntries.filter(d => d.active).map(d => d.date), [editDayEntries]);
  const alimSigAtual = alimSignature(activeDates, editTravel.chegadaIda, editTravel.partidaVolta);
  // Dias/horários mudaram DEPOIS de um ajuste manual — aviso discreto + botão
  const alimStale = alimManual && alimSigAtual !== alimSigBase;
  // Alimentação recalculada pelos dias ativos + horários — só quando a
  // assinatura mudou desde a base e não houve ajuste manual (e o item ainda
  // pode ser editado).
  const alimAuto = useMemo(() => {
    if (!editingItem || editingItem.sentForReview || alimManual) return null;
    if (alimSigAtual === alimSigBase) return null;
    return calcAlimentacaoRealizado(editingItem, activeDates, editTravel.chegadaIda, editTravel.partidaVolta);
  }, [editingItem, alimManual, alimSigAtual, alimSigBase, calcAlimentacaoRealizado, activeDates, editTravel]);
  // O que a tela mostra e o saveEdit grava.
  const editFormData = useMemo(
    () => editFormBase ? (alimAuto ? { ...editFormBase, ...alimAuto } : editFormBase) : null,
    [editFormBase, alimAuto],
  );

  const openEditModal = (item: BudgetActual, initialTab: ModalActualTab = "custos") => {
    setModalActualTab(initialTab);
    setEditingItem(item);
    const days = getItemDayCounts(item);
    const storedSubtotalDiarias = subtotalDiariasDe(item);
    const totalDays = days.weekdays + days.weekends;
    // Regra 17/08: casa (CLT) só recebe diária nos fins de semana — o subtotal
    // é reconstruído SÓ sobre os fds (dias úteis ficam com diária 0), como no Planejado.
    // (regraDiariaPorTipo === "fds" e há fds → úteis não entram na reconstrução)
    const recRegra = regraDiariaPorTipo(item.collaboratorType, getFunctionName(item.functionId));
    const recWeekdays = (recRegra === "fds" && days.weekends > 0) || recRegra === "nenhuma" ? 0 : days.weekdays;

    let valorUtil = 0;
    let valorFds = 0;
    // Subtotal de diárias que o grid de dias TEM de reproduzir centavo a
    // centavo (ver o ajuste de resto logo abaixo do grid).
    let subtotalOrigem = 0;

    const isUnfilled = totalDays === 0 || storedSubtotalDiarias <= 0;

    if (!isUnfilled) {
      // Restore from saved actual values
      subtotalOrigem = storedSubtotalDiarias;
      ({ valorUtil, valorFds } = reconstructDailyValues(storedSubtotalDiarias, recWeekdays, days.weekends));
    } else {
      // Actual not yet filled — pre-fill DIÁRIAS from planned values so user has a starting point
      const plannedRef = getPlannedRef(item);
      if (plannedRef && plannedRef.dailyValue > 0) {
        const plannedSub = subtotalDiariasDe(plannedRef);
        subtotalOrigem = plannedSub;
        ({ valorUtil, valorFds } = reconstructDailyValues(plannedSub, recWeekdays, days.weekends));
      }
    }

    // Alimentação e mobilidade: SEMPRE inicializa com os valores do próprio item.
    // Usar o planejado aqui fazia reabrir+salvar reverter ajustes feitos pelo RH.
    let initIda = 0;
    let initVolta = 0;
    if (item.mobility > 0) {
      initIda = typeof item.mobilityIda === "number" ? item.mobilityIda : Math.ceil(item.mobility / 2);
      initVolta = typeof item.mobilityVolta === "number" ? item.mobilityVolta : Math.floor(item.mobility / 2);
    }

    setEditFormData({
      valorDiariaUtil: valorUtil,
      valorDiariaFds: valorFds,
      weekdayLunch:   item.weekdayLunch,
      weekdayDinner:  item.weekdayDinner,
      weekendLunch:   item.weekendLunch,
      weekendDinner:  item.weekendDinner,
      mobilityIda:    initIda,
      mobilityVolta:  initVolta,
    });

    // Build per-day entries from date range
    const workedDaysList = item.workedDays;
    const dayEntries: DayEntry[] = [];
    if (days.startDate && days.endDate) {
      const cur = new Date(days.startDate + "T00:00:00");
      const endD = new Date(days.endDate + "T00:00:00");
      while (cur <= endD) {
        // Formatação local (não UTC): toISOString deslocava o dia em fusos negativos como o do Brasil
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        const isWknd = isWeekendDate(dateStr);
        const active = !workedDaysList || workedDaysList.length === 0 || workedDaysList.includes(dateStr);
        dayEntries.push({ date: dateStr, valueCents: isWknd ? valorFds : valorUtil, active, isWeekend: isWknd });
        cur.setDate(cur.getDate() + 1);
      }
    }

    // ── Resto de centavos: o grid tem de FECHAR no subtotal de origem ───────
    // `valorUtil`/`valorFds` são MÉDIAS arredondadas (reconstructDailyValues),
    // então "dias × diária" nem sempre reproduz o subtotal gravado/planejado —
    // e o subtotal é o número certo. É o caso da EMPREITA cenotécnica, cujo
    // valor é FECHADO por tabela e quase nunca é múltiplo exato dos dias
    // (Freela SP, 5 dias: R$ 1.750,88 ÷ 5 = 350,176 → 350,18 × 5 = 1.750,90,
    // os "2 centavos fantasmas" que o Comparativo acusava como diferença).
    // Correção mínima: joga a sobra (ou a falta) no ÚLTIMO dia ativo que já tem
    // diária — nenhum dia sem diária (casa/CLT em dia útil) ganha valor por isso.
    const activeWithValue = dayEntries.filter(d => d.active && d.valueCents > 0);
    if (subtotalOrigem > 0 && activeWithValue.length > 0) {
      const somaGrid = dayEntries.reduce((s, d) => s + (d.active ? d.valueCents : 0), 0);
      const resto = subtotalOrigem - somaGrid;
      if (resto !== 0) {
        const ultimo = activeWithValue[activeWithValue.length - 1];
        // Nunca deixa um dia negativo: se a sobra não couber, o grid segue como está
        if (ultimo.valueCents + resto >= 0) ultimo.valueCents += resto;
      }
    }

    setEditDayEntries(dayEntries);

    // ── Viagem: pré-preenche com o que já existe (passagem > sugerido) ──────
    const travel = deriveTravel(item);
    setTravelManual({});
    setAlimManual(false);
    setExtraDayEdge(null);
    // Baseline: ao ABRIR, a alimentação gravada é mantida como está (não
    // sobrescreve o que o RH já ajustou). O recálculo automático só vale
    // quando os dias ativos ou os horários mudarem daqui em diante.
    setAlimSigBase(alimSignature(
      dayEntries.filter(d => d.active).map(d => d.date),
      travel.chegadaIda,
      travel.partidaVolta,
    ));
  };

  // Recalcula a alimentação pelos dias ativos + horários da viagem e reseta o
  // "ajustado manualmente" (usado pelo botão "Recalcular pela viagem").
  const recalcAlimentacao = () => {
    if (!editingItem) return;
    const next = calcAlimentacaoRealizado(editingItem, activeDates, editTravel.chegadaIda, editTravel.partidaVolta);
    setEditFormData(prev => prev ? { ...prev, ...next } : prev);
    setAlimManual(false);
    setAlimSigBase(alimSigAtual);
  };

  // Marca a alimentação como ajustada à mão — a partir daqui nada sobrescreve.
  // Persiste na base os valores EFETIVOS atuais (os recalculados, se for o
  // caso) mais o campo editado, e fixa a assinatura atual como base.
  const setAlimField = (key: AlimField, cents: number) => {
    // Só marca "ajustado manualmente" se o valor REALMENTE mudou — o
    // CurrencyInput dispara onChange também no blur, sem edição nenhuma.
    if (!editFormData || editFormData[key] === cents) return;
    const efetivo = editFormData;
    setEditFormData(prev => prev ? { ...prev, ...efetivo, [key]: cents } : prev);
    setAlimManual(true);
    setAlimSigBase(alimSigAtual);
  };

  // Dia extra virou o primeiro/último: rola até o campo de hora e foca
  useEffect(() => {
    if (!extraDayEdge) return;
    const el = extraDayEdge === "primeiro" ? chegadaInputRef.current : partidaInputRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => el.focus(), 320);
    return () => clearTimeout(t);
  }, [extraDayEdge]);

  // Monta o PATCH da prestação; quem grava é a página (updateMutation.mutate).
  const montarPayloadParaSalvar = (): PayloadDaPrestacao | null => {
    if (!editingItem || !editFormData) return null;
    const activeDays = editDayEntries.filter(d => d.active);
    const subtotalDiarias = activeDays.reduce((sum, d) => sum + d.valueCents, 0);
    // Só dias COM diária contam na quantidade — casa (CLT) tem dias úteis a
    // R$ 0 e o Planejado envia dailyQuantity = dias com diária; contar todos
    // os dias aqui fazia o Comparativo acusar diferença falsa em "Qtd. Diárias".
    const diasComValor = activeDays.filter(d => d.valueCents > 0).length;
    const qtdDiarias = diasComValor > 0 ? diasComValor : (subtotalDiarias === 0 ? 0 : activeDays.length);
    const dailyValue = qtdDiarias > 0 ? Math.round(subtotalDiarias / qtdDiarias) : editFormData.valorDiariaUtil;
    const totalMobility = editFormData.mobilityIda + editFormData.mobilityVolta;
    // Translado (transport) faz parte do total gravado — sem ele o totalValue encolhia a cada salvamento
    const totalValue = subtotalDiarias + editFormData.weekdayLunch + editFormData.weekdayDinner +
      editFormData.weekendLunch + editFormData.weekendDinner + totalMobility + editingItem.transport;
    return {
      id: editingItem.id,
      data: {
        dailyQuantity: qtdDiarias,
        dailyValue,
        // Persiste os dias ativos — sem isso, dias desativados/extras entravam no total mas sumiam ao reabrir
        workedDays: activeDays.map(d => d.date),
        // Alimentação: só o RESULTADO é persistido. Os horários de chegada/
        // partida usados no cálculo NÃO têm coluna aqui (e não criamos uma):
        // ficam como estado do modal, derivados da passagem/escalação.
        weekdayLunch: editFormData.weekdayLunch,
        weekdayDinner: editFormData.weekdayDinner,
        weekendLunch: editFormData.weekendLunch,
        weekendDinner: editFormData.weekendDinner,
        mobility: totalMobility,
        mobilityIda: editFormData.mobilityIda,
        mobilityVolta: editFormData.mobilityVolta,
        totalValue,
      },
    };
  };

  /** Fecha o modal e zera o estado transitório (Esc/clique fora/Cancelar). */
  const fechar = useCallback(() => {
    setEditingItem(null); setEditFormData(null); setShowAddDay(false); setExtraDayEdge(null); setAlimManual(false);
  }, []);
  /** Fecha sem mexer em alimManual/extraDayEdge (botões Cancelar/Fechar do rodapé). */
  const fecharBotao = useCallback(() => {
    setEditingItem(null); setEditFormData(null); setShowAddDay(false);
  }, []);
  /** O `onSuccess` do salvar só zera item e formulário. */
  const aoSalvar = useCallback(() => { setEditingItem(null); setEditFormData(null); }, []);

  return {
    editingItem, editFormData, editDayEntries, setEditDayEntries, showAddDay, setShowAddDay,
    travelManual, setTravelManual, alimManual, alimStale, extraDayEdge, setExtraDayEdge,
    chegadaInputRef, partidaInputRef, modalActualTab, setModalActualTab,
    editTravel, travelSource, activeDates,
    openEditModal, recalcAlimentacao, setAlimField, montarPayloadParaSalvar, fechar, fecharBotao, aoSalvar,
  };
}

export type EditorDoRealizado = ReturnType<typeof useBudgetActualEditor>;

export default useBudgetActualEditor;
