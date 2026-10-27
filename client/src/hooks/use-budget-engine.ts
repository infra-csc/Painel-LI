/**
 * Motor do Planejado na tela — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx: filtra as escalações confirmadas, calcula
 * cada vaga com o motor compartilhado (@shared/budget-engine) com cache por
 * vaga, e deriva os índices que cards e planilha consomem (enviados ao
 * Realizado, "não participou", totais e estatísticas). Sem JSX.
 */
import { useCallback, useMemo, useRef } from "react";
import type { BudgetActual, BudgetPlanned as BudgetPlannedRow, Collaborator, FunctionValue, TeamInclusion, Ticket } from "@shared/schema";
import { calcularPlanejadoDaVaga, type VagaParaPlanejado } from "@shared/budget-engine";
import { honorariosNasVagas, type HonorarioNaVaga, type HonorarioParaPlanejado } from "@shared/honorarios-ceno";
import { indexarPorId } from "@/lib/indices";
import { collabFuncKey, isCasaType, type BudgetOverrides, type CalculatedBudget } from "@/components/budget/types";
import { pedePreAprovacao, situacaoDaPreAprovacao, type SituacaoDaPreAprovacao } from "@shared/pre-aprovacao";
import { valoresParaGravar } from "@/components/budget/pre-aprovacao";
import { casarVagasComPlanejado } from "@shared/casamento-do-planejado";

export interface EntradaDoMotor {
  teamInclusions: TeamInclusion[] | undefined;
  functionValues: FunctionValue[] | undefined;
  collaborators: Collaborator[] | undefined;
  functionNamesById: Map<string, string>;
  systemSettings: Record<string, number> | undefined;
  ticketByInclusion: Map<string, Ticket>;
  eventLocation: string | null;
  budgetOverrides: BudgetOverrides;
  allBudgetPlanned: BudgetPlannedRow[] | undefined;
  existingActuals: BudgetActual[] | undefined;
  /** Honorários da cenotécnica do evento (21/10): o aprovado é a mão de obra da vaga. */
  honorarios?: HonorarioParaPlanejado[] | undefined;
  /** O evento é legado (27/10, termina antes da data de corte): vai ao Realizado sem a pré-aprovação. */
  eventoLegado?: boolean;
}

export interface EstatisticasDoPlanejado {
  total: number;
  totalCasa: number;
  totalFreela: number;
  valorCasa: number;
  valorFreela: number;
  media: number;
  mediaPorDia: number;
  enviados: number;
  progressoEnvio: number;
  /** Pré-aprovados pelo DP com o valor de agora — prontos para ir ao Realizado (26/10). */
  preAprovados: number;
  /** Ainda pedem a pré-aprovação (nunca pré-aprovados ou com o valor mudado). */
  aPreAprovar: number;
  /** Evento legado (27/10): vagas que vão ao Realizado sem a pré-aprovação (fluxo antigo). */
  legado: number;
  /** Pré-aprovação feita (ou já enviados, ou legado): base da barra "Pré-aprovação do DP". */
  progressoPreAprovacao: number;
}

export interface SaidaDoMotor {
  confirmedInclusions: TeamInclusion[];
  calculatedBudgets: CalculatedBudget[];
  /** Ids de vaga já enviados ao Realizado (derivado de `existingActuals`). */
  sentToActual: Set<string>;
  /** Ids de vaga marcados como "não participou" (27/10: pela linha da vaga, não mais pela chave colaborador|função). */
  notAttendedIds: Set<string>;
  isCardNotAttended: (b: CalculatedBudget) => boolean;
  /**
   * Pré-aprovação do DP de cada vaga (26/10, shared/pre-aprovacao): pendente,
   * pré-aprovada, desatualizada (o valor mudou), enviada, não participou ou
   * legado (27/10: evento antes da data de corte, sem pré-aprovação).
   */
  situacaoDaVaga: (b: CalculatedBudget) => SituacaoDaPreAprovacao;
  /**
   * Linha do Planejado de cada vaga (id da vaga → linha). 27/10: vaga com
   * colaborador casa pela chave colaborador|função; sem colaborador, pela vaga
   * gravada na linha (shared/casamento-do-planejado.ts).
   */
  plannedByVaga: Map<string, BudgetPlannedRow>;
  actualsByCollabFunc: Map<string, BudgetActual>;
  totalGeral: number;
  stats: EstatisticasDoPlanejado;
}

// "concluido" entrou em 08/10: é estado válido da vaga (shared/vaga-status) e
// a vaga concluída sumia do Planejado — evento encerrado aparecia vazio.
const STATUS_CONFIRMADOS = new Set([
  "confirmado", "escalacao", "escalado", "aprovacao", "passagem", "passagem_comprada",
  "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada", "aprovado", "concluido",
]);

export function useBudgetEngine(e: EntradaDoMotor): SaidaDoMotor {
  const {
    teamInclusions, functionValues, collaborators, functionNamesById, systemSettings,
    ticketByInclusion, eventLocation, budgetOverrides, allBudgetPlanned, existingActuals, honorarios, eventoLegado = false,
  } = e;

  // Honorário de cada vaga (aprovado, parte da empreita ou pendente) — a mesma
  // função que o servidor usa em "Atualizar padrões".
  const honorarioPorVaga = useMemo(() => honorariosNasVagas(honorarios ?? []), [honorarios]);

  // Índices O(1) (23/09): `collaborators?.find` e `functionValues?.find` rodavam
  // dentro do `.map` do cálculo — O(n·m) a cada render.
  const collaboratorById = useMemo(() => indexarPorId(collaborators), [collaborators]);
  const functionValueByFunctionId = useMemo(() => {
    const m = new Map<string, FunctionValue>();
    functionValues?.forEach(fv => { if (!m.has(fv.functionId)) m.set(fv.functionId, fv); });
    return m;
  }, [functionValues]);

  // Filtrar apenas escalações CONFIRMADAS
  const confirmedInclusions = useMemo(() => {
    if (!teamInclusions) return [];
    return teamInclusions.filter(inc => STATUS_CONFIRMADOS.has(inc.status));
  }, [teamInclusions]);

  // "Já enviado ao Realizado" é DERIVADO de `existingActuals` (23/09): fonte
  // única. Antes era um `useState` alimentado por um useEffect O(n·m) e ainda
  // alterado à mão nos onSuccess — duas fontes de verdade que divergiam.
  // Após enviar, os onSuccess gravam o registro criado no cache da query
  // (`setQueryData`) e invalidam; a UI responde na hora sem estado paralelo.
  // Linha do Planejado de cada vaga (27/10) — antes `plannedByCollabFunc`, que
  // juntava as vagas sem colaborador da mesma função na mesma linha.
  const plannedByVaga = useMemo(
    () => casarVagasComPlanejado(confirmedInclusions, allBudgetPlanned ?? []),
    [confirmedInclusions, allBudgetPlanned],
  );

  const sentToActual = useMemo(() => {
    const enviados = new Set<string>();
    if (!existingActuals || existingActuals.length === 0) return enviados;
    const chaves = new Set<string>();
    // Sem colaborador (27/10): enviada é a vaga cuja linha tem Realizado (plannedId);
    // só o lançamento direto no Realizado (sem plannedId) vale pela chave, como antes.
    const chavesDiretas = new Set<string>();
    const planejadosEnviados = new Set<string>();
    for (const a of existingActuals) {
      chaves.add(collabFuncKey(a));
      if (a.plannedId) planejadosEnviados.add(a.plannedId);
      else chavesDiretas.add(collabFuncKey(a));
    }
    for (const inc of confirmedInclusions) {
      if (inc.collaboratorId) {
        if (chaves.has(collabFuncKey(inc))) enviados.add(inc.id);
        continue;
      }
      const linha = plannedByVaga.get(inc.id);
      if ((linha && planejadosEnviados.has(linha.id)) || chavesDiretas.has(collabFuncKey(inc))) enviados.add(inc.id);
    }
    return enviados;
  }, [existingActuals, confirmedInclusions, plannedByVaga]);

  // ── Cálculo por vaga: MOTOR COMPARTILHADO (23/09) ────────────────────────
  // `calcularPlanejadoDaVaga` (@shared/budget-engine) é a mesma sequência que
  // o servidor usa em apply-defaults — a fórmula duplicada saiu desta tela.
  // Cache por vaga: só recalcula a linha cuja ENTRADA mudou (escalação,
  // função, tipo, valores, configurações, passagem ou override). Digitar um
  // valor recalcula UMA vaga; as demais devolvem o MESMO objeto e o
  // `SheetRow` (React.memo) e os cards não repintam.
  const cacheOrcamentosRef = useRef(new Map<string, { chave: unknown[]; result: CalculatedBudget }>());
  const calculatedBudgets = useMemo((): CalculatedBudget[] => {
    if (!confirmedInclusions || !functionValues) return [];
    const anterior = cacheOrcamentosRef.current;
    const proximo = new Map<string, { chave: unknown[]; result: CalculatedBudget }>();
    const out = confirmedInclusions.map((inclusion): CalculatedBudget => {
      const id = inclusion.id;
      const fv = functionValueByFunctionId.get(inclusion.functionId) ?? null;
      const collab = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
      const fnName = functionNamesById.get(inclusion.functionId) ?? null;
      const ticket = ticketByInclusion.get(inclusion.id) ?? null;
      const override = budgetOverrides[id];
      const honorario: HonorarioNaVaga | null = honorarioPorVaga.get(id) ?? null;
      const chave: unknown[] = [inclusion, fnName, collab?.type ?? null, fv, systemSettings, eventLocation, ticket, override, honorario];
      const hit = anterior.get(id);
      const reaproveita = !!hit && hit.chave.length === chave.length && hit.chave.every((v, i) => v === chave[i]);
      const result: CalculatedBudget = reaproveita
        ? hit.result
        : {
            ...calcularPlanejadoDaVaga({
              vaga: inclusion as VagaParaPlanejado,
              functionName: fnName,
              collaboratorType: collab?.type,
              functionValue: fv,
              settings: systemSettings,
              eventLocation,
              ticket,
              override,
              honorario,
            }),
            inclusion,
            collaborator: collab,
            functionValue: fv,
          };
      proximo.set(id, { chave, result });
      return result;
    });
    cacheOrcamentosRef.current = proximo;
    return out;
  }, [confirmedInclusions, functionValues, collaboratorById, functionValueByFunctionId, functionNamesById, systemSettings, ticketByInclusion, eventLocation, budgetOverrides, honorarioPorVaga]);

  // Vagas marcadas como "não participou" — pela linha DA vaga (27/10).
  const notAttendedIds = useMemo(() => {
    const ids = new Set<string>();
    plannedByVaga.forEach((p, vagaId) => { if (p.didNotAttend) ids.add(vagaId); });
    return ids;
  }, [plannedByVaga]);

  const isCardNotAttended = useCallback(
    (b: CalculatedBudget) => notAttendedIds.has(b.inclusion.id),
    [notAttendedIds],
  );

  const actualsByCollabFunc = useMemo(() => {
    const m = new Map<string, BudgetActual>();
    (existingActuals || []).forEach(a => {
      if (a.splitParentId) return;
      const key = collabFuncKey(a);
      if (!m.has(key)) m.set(key, a);
    });
    return m;
  }, [existingActuals]);

  // Pré-aprovação (26/10): compara o gravado com o valor de AGORA — o mesmo
  // que o envio grava (valoresParaGravar). Mudou (recálculo, ajuste manual,
  // honorário aprovado) → "desatualizado": volta a pedir a pré-aprovação.
  // Evento legado (27/10): sem pré-aprovação válida a vaga fica "legado" e vai ao
  // Realizado pelo fluxo antigo (o servidor também não exige).
  const situacaoDaVaga = useCallback((b: CalculatedBudget): SituacaoDaPreAprovacao => situacaoDaPreAprovacao({
    enviado: sentToActual.has(b.inclusion.id),
    naoParticipou: notAttendedIds.has(b.inclusion.id),
    planejado: plannedByVaga.get(b.inclusion.id),
    valoresDeAgora: valoresParaGravar(b),
    eventoLegado,
  }), [sentToActual, notAttendedIds, plannedByVaga, eventoLegado]);

  const totalGeral = useMemo(() => {
    return calculatedBudgets
      .filter(b => !notAttendedIds.has(b.inclusion.id))
      .reduce((sum, b) => sum + b.totalFinal, 0);
  }, [calculatedBudgets, notAttendedIds]);

  // Estatísticas de resumo
  const stats = useMemo((): EstatisticasDoPlanejado => {
    const activeBudgets = calculatedBudgets.filter(b => !notAttendedIds.has(b.inclusion.id));
    const total = activeBudgets.length;
    const isFreela = (type?: string) => type === "freela" || !type;
    const totalCasa = activeBudgets.filter(b => isCasaType(b.collaborator?.type)).length;
    const totalFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).length;
    const valorCasa = activeBudgets.filter(b => isCasaType(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const valorFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const media = total > 0 ? totalGeral / total : 0;
    const totalDias = activeBudgets.reduce((sum, b) => sum + b.weekdays + b.weekends, 0);
    const mediaPorDia = totalDias > 0 ? totalGeral / totalDias : 0;
    // Mesmo denominador de `total` (só ativos) — incluir "não participou" aqui
    // impedia o progresso de chegar a 100%.
    const enviados = activeBudgets.filter(b => sentToActual.has(b.inclusion.id)).length;
    const progressoEnvio = total > 0 ? (enviados / total) * 100 : 0;
    let preAprovados = 0;
    let aPreAprovar = 0;
    let legado = 0;
    for (const b of activeBudgets) {
      const s = situacaoDaVaga(b);
      if (s === "pre_aprovado") preAprovados++;
      else if (pedePreAprovacao(s)) aPreAprovar++;
      else if (s === "legado") legado++;
    }
    // Legado (27/10) não pede a pré-aprovação: conta como resolvido na barra.
    const progressoPreAprovacao = total > 0 ? ((preAprovados + enviados + legado) / total) * 100 : 0;

    return { total, totalCasa, totalFreela, valorCasa, valorFreela, media, mediaPorDia, enviados, progressoEnvio, preAprovados, aPreAprovar, legado, progressoPreAprovacao };
  }, [calculatedBudgets, totalGeral, sentToActual, notAttendedIds, situacaoDaVaga]);

  return {
    confirmedInclusions, calculatedBudgets, sentToActual, notAttendedIds, isCardNotAttended, situacaoDaVaga,
    plannedByVaga, actualsByCollabFunc, totalGeral, stats,
  };
}

export default useBudgetEngine;
