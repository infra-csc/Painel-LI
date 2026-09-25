/**
 * Estado e ações do MODAL de edição do Planejado — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx: abrir/fechar, valores originais × padrão do
 * motor, buffers de digitação, tipos (atendimento/percurseiro) escolhidos e
 * ainda não gravados, e o `saveEdit` que transforma a edição em override
 * ESPARSO. O componente `BudgetEditModal` só desenha o que este hook devolve.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { atendimentoDailyCents, isAtendimentoFunction, type AtendimentoTipo } from "@shared/atendimento";
import { percurseiroDiariaCents, type PercurseiroTipo } from "@shared/calculation-rules";
import type { BudgetPlanned as BudgetPlannedRow, TeamInclusion } from "@shared/schema";
import {
  isCasaType, nomeDaVaga,
  type BudgetEdit, type BudgetOverride, type BudgetOverrides, type CalculatedBudget, type EditingBudgetInfo,
} from "@/components/budget/types";

export type ModalTab = "custos" | "observacoes" | "historico";

export interface EntradaDoModalDeEdicao {
  selectedEventId: string;
  systemSettings: Record<string, number> | undefined;
  allBudgetPlanned: BudgetPlannedRow[] | undefined;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  setBudgetOverrides: React.Dispatch<React.SetStateAction<BudgetOverrides>>;
  setDraftRestored: (v: boolean) => void;
}

export function useBudgetEditModal(e: EntradaDoModalDeEdicao) {
  const { selectedEventId, systemSettings, allBudgetPlanned, getCollaboratorName, getFunctionName, setBudgetOverrides, setDraftRestored } = e;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editingBudget, setEditingBudget] = useState<BudgetEdit | null>(null);
  const [editingBudgetInfo, setEditingBudgetInfo] = useState<EditingBudgetInfo | null>(null);
  const [editingBudgetPlannedId, setEditingBudgetPlannedId] = useState<string | null>(null);
  // Tipo escolhido no modal e AINDA NÃO persistido na escalação (null = igual
  // ao gravado). Persistido no Salvar, descartado no Cancelar — comportamento
  // normal de formulário, sem PATCH imediato ao clicar.
  const [pendingAtendimentoTipo, setPendingAtendimentoTipo] = useState<AtendimentoTipo | null>(null);
  const [pendingPercurseiroTipo, setPendingPercurseiroTipo] = useState<PercurseiroTipo | null>(null);
  const [savingTipo, setSavingTipo] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>("custos");
  const [modalViewMode, setModalViewMode] = useState(false);
  // Buffer de digitação dos inputs do modal — permite "540,50" sem o controlled
  // input engolir a vírgula (mesmo padrão do SheetRow)
  const [modalBufs, setModalBufs] = useState<Record<string, string>>({});
  const [originalModalTotal, setOriginalModalTotal] = useState<number>(0);
  // Valores originais campo a campo — comparar só o total esconderia edições
  // que se compensam (ex.: +50 no almoço e -50 no jantar).
  const [originalModalValues, setOriginalModalValues] = useState<BudgetEdit | null>(null);
  const [defaultBudgetValues, setDefaultBudgetValues] = useState<BudgetEdit | null>(null);
  // Alimentação no modal: os 4 campos legados ficam recolhidos ("exceções");
  // abrem automaticamente quando o valor atual difere do motor (override).
  const [alimExpanded, setAlimExpanded] = useState(false);

  // Aplica a nova diária no modal (sem tocar em originalModalValues/Total: a
  // troca de tipo é uma mudança REAL, aparece no "▲ vs original"). Preserva a
  // edição manual da diária em curso: só sobrescreve se o valor atual ainda
  // era o padrão anterior. Retorna se a edição manual foi mantida.
  const applyTipoDiariaNoModal = (novoValor: number | null | undefined): boolean => {
    if (novoValor == null) return false;
    const prevDefault = defaultBudgetValues?.valorDiaria;
    const manualPreserved = !!editingBudget && prevDefault !== undefined && editingBudget.valorDiaria !== prevDefault;
    if (!manualPreserved) {
      setEditingBudget(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
      setModalBufs(p => { const n = { ...p }; delete n.vdia; return n; });
    }
    // O "padrão" do modal acompanha a nova tarifa — assim salvar sem outras
    // edições não cria override desnecessário.
    setDefaultBudgetValues(prev => prev ? { ...prev, valorDiaria: novoValor, valorDiariaUtil: novoValor, valorDiariaFds: novoValor } : prev);
    return manualPreserved;
  };

  // Percurso (motoqueiro): Tipo 1 / Tipo 2 definido aqui pelo RH quando a
  // escalação veio sem tipo. Só estado local; persiste no Salvar.
  const chooseLocalPercurseiroTipo = (tipo: PercurseiroTipo) => {
    if (!editingBudgetInfo) return;
    const pacote = percurseiroDiariaCents(tipo, systemSettings);
    setPendingPercurseiroTipo(tipo === (editingBudgetInfo.savedPercurseiroTipo ?? null) ? null : tipo);
    setEditingBudgetInfo(prev => prev ? { ...prev, percurseiroTipo: tipo, percurseiro: pacote } : prev);
    applyTipoDiariaNoModal(pacote?.total);
  };

  // Muitas escalações de atendimento viraram Planejado ANTES do flag existir
  // (backfill marcou todas como Executivo de Contas). O RH corrige por aqui,
  // sem voltar à escalação. Só estado local; persiste no Salvar.
  const chooseLocalAtendimentoTipo = (tipo: AtendimentoTipo) => {
    if (!editingBudgetInfo) return;
    setPendingAtendimentoTipo(tipo === (editingBudgetInfo.savedAtendimentoTipo ?? null) ? null : tipo);
    setEditingBudgetInfo(prev => prev ? { ...prev, atendimentoTipo: tipo } : prev);
    applyTipoDiariaNoModal(atendimentoDailyCents(tipo, systemSettings));
  };

  // Persistência dos tipos NA ESCALAÇÃO (rotas dedicadas aceitam o papel
  // financeiro). Chamado pelo Salvar do modal, antes de gravar o orçamento.
  const persistPendingTipos = async (inclusionId: string): Promise<boolean> => {
    if (pendingAtendimentoTipo == null && pendingPercurseiroTipo == null) return true;
    setSavingTipo(true);
    try {
      if (pendingAtendimentoTipo != null) {
        await apiRequest("PATCH", `/api/team-inclusions/${inclusionId}/atendimento-tipo`, { atendimentoTipo: pendingAtendimentoTipo });
      }
      if (pendingPercurseiroTipo != null) {
        await apiRequest("PATCH", `/api/team-inclusions/${inclusionId}/percurseiro-tipo`, { percurseiroTipo: pendingPercurseiroTipo });
      }
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setPendingAtendimentoTipo(null);
      setPendingPercurseiroTipo(null);
      return true;
    } catch (err) {
      toast({ title: "Não foi possível salvar o tipo na escalação", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
      return false;
    } finally {
      setSavingTipo(false);
    }
  };

  // "Descartar alterações?" no modal de edição (23/09): Esc e clique fora
  // fechavam e jogavam fora o que foi digitado. Mesmo critério do `hasChanges`
  // que acende o botão Salvar no rodapé do modal.
  const modalSujo = !!editingBudget && (
    pendingAtendimentoTipo != null || pendingPercurseiroTipo != null ||
    (!!originalModalValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[]).some(k => editingBudget[k] !== originalModalValues[k]))
  );
  const fecharModalEdicao = useCallback(() => {
    setEditingBudget(null); setEditingBudgetInfo(null); setEditingBudgetPlannedId(null);
    setModalViewMode(false); setModalBufs({}); setPendingAtendimentoTipo(null); setPendingPercurseiroTipo(null);
  }, []);
  const { pedirParaFechar: pedirFecharEdicao, Dialogo: DialogoDescarteEdicao } = useConfirmarDescarte(modalSujo, { salvando: savingTipo });

  const openEditModal = (budget: CalculatedBudget, viewMode = false) => {
    const startDate = budget.inclusion.scheduleStartDate;
    const endDate = budget.inclusion.scheduleEndDate;
    const formatDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "-";
    const period = startDate && endDate ? `${formatDate(startDate)} a ${formatDate(endDate)}` : "-";

    setEditingBudgetInfo({
      name: nomeDaVaga(budget.inclusion as TeamInclusion, getCollaboratorName),
      functionName: getFunctionName(budget.inclusion.functionId),
      type: isCasaType(budget.collaborator?.type) ? "Casa" : "Freela",
      weekdays: budget.weekdays,
      weekends: budget.weekends,
      diasComDiaria: budget.diasComDiaria,
      regraDiaria: budget.regraDiaria,
      period,
      vooChegadaIda: budget.vooChegadaIda,
      vooPartidaVolta: budget.vooPartidaVolta,
      fonteVoo: budget.fonteVoo,
      alimEstimada: budget.alimEstimada,
      voa: !!budget.inclusion.needsTicket,
      isAtend: isAtendimentoFunction(getFunctionName(budget.inclusion.functionId)),
      atendimentoTipo: (budget.inclusion.atendimentoTipo ?? null) as AtendimentoTipo | null,
      savedAtendimentoTipo: (budget.inclusion.atendimentoTipo ?? null) as AtendimentoTipo | null,
      isPercurso: budget.isPercurso,
      funcaoLocal: budget.funcaoLocal,
      percurseiroTipo: budget.percurseiroTipo,
      savedPercurseiroTipo: budget.percurseiroTipo,
      percurseiro: budget.percurseiro,
      cenoEmpreitaVaga: budget.cenoEmpreitaVaga,
      cenoFreelaTipo: budget.cenoFreelaTipo,
      cenoEmpreita: budget.cenoEmpreita,
      inclusionId: budget.inclusion.id,
    });
    setPendingAtendimentoTipo(null);
    setPendingPercurseiroTipo(null);

    // "Restaurar padrão" re-deriva do MOTOR ATUAL (atendimento/freela/casa +
    // deflação + voo), não do legado fv/dailyValue.
    const defaultVals: BudgetEdit = {
      inclusionId: budget.inclusion.id,
      qtdDiarias: budget.weekdays + budget.weekends,
      valorDiaria: budget.sysValorDiaria,
      valorDiariaUtil: budget.sysValorDiaria,
      valorDiariaFds: budget.sysValorDiaria,
      mobilidade: budget.sysMobilidade,
      mobilidadeIda: budget.sysMobilidadeIda,
      mobilidadeVolta: budget.sysMobilidadeVolta,
      almocoSemana: budget.sysAlmocoSemana,
      jantarSemana: budget.sysJantarSemana,
      almocoFds: budget.sysAlmocoFds,
      jantarFds: budget.sysJantarFds,
    };
    setDefaultBudgetValues(defaultVals);

    const editVals: BudgetEdit = {
      inclusionId: budget.inclusion.id,
      qtdDiarias: budget.qtdDiarias,
      valorDiaria: budget.valorDiaria,
      valorDiariaUtil: budget.valorDiariaUtil,
      valorDiariaFds: budget.valorDiariaFds,
      mobilidade: budget.mobilidade,
      mobilidadeIda: budget.mobilidadeIda,
      mobilidadeVolta: budget.mobilidadeVolta,
      almocoSemana: budget.almocoSemana,
      jantarSemana: budget.jantarSemana,
      almocoFds: budget.almocoFds,
      jantarFds: budget.jantarFds,
    };
    setEditingBudget(editVals);
    setOriginalModalValues(editVals);
    setOriginalModalTotal(budget.totalFinal);
    setAlimExpanded(
      editVals.almocoSemana !== defaultVals.almocoSemana ||
      editVals.jantarSemana !== defaultVals.jantarSemana ||
      editVals.almocoFds !== defaultVals.almocoFds ||
      editVals.jantarFds !== defaultVals.jantarFds
    );
    const planRec = allBudgetPlanned?.find(
      p => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );
    setEditingBudgetPlannedId(planRec?.id ?? null);
    setModalViewMode(viewMode);
    setModalTab("custos");
    setModalBufs({});
  };

  const saveEdit = async () => {
    if (!editingBudget || !originalModalValues || !defaultBudgetValues) return;
    const id = editingBudget.inclusionId;
    const cur = editingBudget;
    const orig = originalModalValues;
    const sys = defaultBudgetValues;
    // 1) Tipo (atendimento/percurseiro) escolhido no modal → grava na ESCALAÇÃO
    //    antes do orçamento; erro aborta o salvar (modal fica aberto).
    const hadPendingTipo = pendingAtendimentoTipo != null || pendingPercurseiroTipo != null;
    const tipoOk = await persistPendingTipos(id);
    if (!tipoOk) return;
    // 2) Orçamento (override esparso local)
    setBudgetOverrides(prev => {
      const existing = prev[id];
      // Override ESPARSO: persiste SOMENTE o que o usuário alterou em relação
      // ao valor calculado. Campo igual ao motor sai do override, para que o
      // recálculo (ex.: chegada da passagem) volte a valer.
      const next: BudgetOverride = { ...(existing || { inclusionId: id }) };

      // Grupo diária (plana): um único valor espelhado em util/fds
      if (cur.valorDiaria === sys.valorDiaria) {
        delete next.valorDiaria; delete next.valorDiariaUtil; delete next.valorDiariaFds;
      } else if (cur.valorDiaria !== orig.valorDiaria || next.valorDiaria !== undefined || next.valorDiariaUtil !== undefined || next.valorDiariaFds !== undefined) {
        next.valorDiaria = cur.valorDiaria; next.valorDiariaUtil = cur.valorDiaria; next.valorDiariaFds = cur.valorDiaria;
      }

      // Grupo mobilidade: total sempre coerente com ida + volta
      const mobEqualsSys = cur.mobilidade === sys.mobilidade && cur.mobilidadeIda === sys.mobilidadeIda && cur.mobilidadeVolta === sys.mobilidadeVolta;
      const mobChanged = cur.mobilidade !== orig.mobilidade || cur.mobilidadeIda !== orig.mobilidadeIda || cur.mobilidadeVolta !== orig.mobilidadeVolta;
      if (mobEqualsSys) {
        delete next.mobilidade; delete next.mobilidadeIda; delete next.mobilidadeVolta;
      } else if (mobChanged || next.mobilidade !== undefined || next.mobilidadeIda !== undefined || next.mobilidadeVolta !== undefined) {
        next.mobilidade = cur.mobilidade; next.mobilidadeIda = cur.mobilidadeIda; next.mobilidadeVolta = cur.mobilidadeVolta;
      }

      // Campos individuais (alimentação) — qtdDiarias saiu do modelo de override
      (["almocoSemana", "jantarSemana", "almocoFds", "jantarFds"] as const).forEach(f => {
        if (cur[f] === sys[f]) delete next[f];
        else if (cur[f] !== orig[f] || next[f] !== undefined) next[f] = cur[f];
      });

      const hasAny = Object.keys(next).some(k => k !== "inclusionId");
      const n = { ...prev };
      if (!hasAny) delete n[id];
      else n[id] = next;
      return n;
    });
    // O banner "rascunho restaurado" é só para a restauração do load — a
    // primeira edição manual da sessão o dispensa.
    setDraftRestored(false);
    setEditingBudget(null);
    setEditingBudgetPlannedId(null);
    toast({
      title: "Valores ajustados",
      description: hadPendingTipo
        ? "Tipo gravado na escalação. As alterações serão aplicadas no envio para o Realizado."
        : "As alterações serão aplicadas no envio para o Realizado.",
    });
  };

  return {
    editingBudget, setEditingBudget,
    editingBudgetInfo,
    editingBudgetPlannedId,
    pendingAtendimentoTipo, pendingPercurseiroTipo, savingTipo,
    modalTab, setModalTab,
    modalViewMode,
    modalBufs, setModalBufs,
    originalModalTotal, originalModalValues, defaultBudgetValues,
    alimExpanded, setAlimExpanded,
    chooseLocalPercurseiroTipo, chooseLocalAtendimentoTipo,
    fecharModalEdicao, pedirFecharEdicao, DialogoDescarteEdicao,
    openEditModal, saveEdit,
    systemSettings, selectedEventId,
  };
}

export type ControladorDoModalDeEdicao = ReturnType<typeof useBudgetEditModal>;

export default useBudgetEditModal;
