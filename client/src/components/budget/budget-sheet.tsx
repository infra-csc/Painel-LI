/**
 * PLANILHA de edição do Planejado — 25/09 (modularização).
 *
 * Extraída de budget-planned.tsx: toolbar (lote/restaurar), tabela
 * virtualizada com cabeçalhos de lote, rodapé de totais e a barra de ações
 * (pendentes/editados/enviar). O estado dos lotes (popover, histórico para
 * "Desfazer", diálogo avançado) mora aqui porque só a planilha o usa; os
 * overrides continuam vindo do rascunho da página.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, RotateCcw, Send } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { parseBrNumber } from "@/lib/utils";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { EspacadorLinha, useLinhasVirtuais } from "@/components/common/virtual-rows";
import type { BudgetActual } from "@shared/schema";
import { AdvancedBatchDialog } from "./advanced-batch-dialog";
import { BatchPopover } from "./batch-popover";
import { SheetRow } from "./sheet-row";
import { aplicarEdicaoNaPlanilha, limparOverridesDe, restaurarCampoDaPlanilha } from "./sheet-edits";
import {
  collabFuncKey, formatCurrency, isCasaType,
  type AdvancedBatch, type BatchField, type BudgetOverrides, type CalculatedBudget, type SheetField,
} from "./types";

export interface BudgetSheetProps {
  filteredBudgets: CalculatedBudget[];
  selectableFiltered: CalculatedBudget[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onToggleSelect: (sid: string, v: boolean) => void;
  sentToActual: Set<string>;
  isCardNotAttended: (b: CalculatedBudget) => boolean;
  actualsByCollabFunc: Map<string, BudgetActual>;
  budgetOverrides: BudgetOverrides;
  setBudgetOverrides: React.Dispatch<React.SetStateAction<BudgetOverrides>>;
  /** Edição manual da sessão dispensa o banner "rascunho restaurado". */
  setDraftRestored: (v: boolean) => void;
  totalGeral: number;
  nomeDaVaga: (b: CalculatedBudget) => string;
  getFunctionName: (id?: string | null) => string;
  /** RH/admin: vê a barra "Enviar Planejamento". */
  isAdmin: boolean;
  onSend: (ids: string[]) => void;
}

const COL_SPAN_TOTAL = 7;

export function BudgetSheet(p: BudgetSheetProps) {
  const {
    filteredBudgets, selectableFiltered, selectedIds, setSelectedIds, onToggleSelect, sentToActual, isCardNotAttended,
    actualsByCollabFunc, budgetOverrides, setBudgetOverrides, setDraftRestored, totalGeral, nomeDaVaga, getFunctionName, isAdmin, onSend,
  } = p;
  const { toast } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [batchPopover, setBatchPopover] = useState<{ field: BatchField; value: string } | null>(null);
  const [batchApplied, setBatchApplied] = useState<Set<BatchField>>(new Set());
  const [batchHistory, setBatchHistory] = useState<{ fields: BatchField[]; prev: BudgetOverrides } | null>(null);
  const batchPopoverRef = useRef<HTMLDivElement>(null);
  // A11y: botão ✏ que abriu o popover de lote — recebe o foco de volta ao fechar
  const batchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [subtotalOpenId, setSubtotalOpenId] = useState<string | null>(null);
  const [advancedBatch, setAdvancedBatch] = useState<AdvancedBatch | null>(null);
  // Só pergunta "Descartar?" se já há um valor digitado no lote.
  const descarteLote = useConfirmarDescarte(!!advancedBatch?.value);

  // ── Virtualização (23/09): linhas da Planilha ─────────────────────────────
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const linhasPlanilha = useLinhasVirtuais(filteredBudgets, { scrollRef: sheetScrollRef, alturaEstimada: 52 });

  const handleSheetEdit = useCallback((budget: CalculatedBudget, field: SheetField, rawValue: string) => {
    // Edição manual da sessão: o banner "rascunho restaurado" deixa de valer
    setDraftRestored(false);
    setBudgetOverrides(prev => aplicarEdicaoNaPlanilha(prev, budget, field, rawValue));
  }, [setBudgetOverrides, setDraftRestored]);

  const restoreSheetField = useCallback((sid: string, field: SheetField) => {
    setDraftRestored(false);
    setBudgetOverrides(prev => restaurarCampoDaPlanilha(prev, sid, field));
  }, [setBudgetOverrides, setDraftRestored]);

  const toggleSubtotalPopover = useCallback((sid: string) => {
    setSubtotalOpenId(prev => prev === sid ? null : sid);
  }, []);

  const applyBatchEdit = (field: BatchField, rawValue: string) => {
    // Precisa do mesmo parser do handleSheetEdit: com parseFloat, um "0,50"
    // virava 0 e a edição em lote saía daqui sem aplicar nada, em silêncio.
    const val = parseBrNumber(rawValue);
    // Zerar é decisão legítima (ver comentário no handleSheetEdit) — rejeita
    // apenas negativo ou não numérico.
    if (!Number.isFinite(val) || val < 0) {
      toast({ title: "Valor inválido", description: "Informe um valor igual ou maior que zero.", variant: "destructive" });
      return;
    }
    const domainField: SheetField = field === "vdia" ? "valorDia" : field === "alim" ? "alimentacao" : "mobilidade";
    const prevOverrides = { ...budgetOverrides };
    // Linha enviada ou ausente NUNCA recebe override em lote
    const targets = filteredBudgets.filter(b =>
      !isCardNotAttended(b) && !sentToActual.has(b.inclusion.id)
    );
    targets.forEach(b => handleSheetEdit(b, domainField, rawValue));
    setBatchApplied(prev => { const next = new Set(prev); next.add(field); return next; });
    setBatchHistory({ fields: [field], prev: prevOverrides });
  };

  const undoBatch = () => {
    if (!batchHistory) return;
    setBudgetOverrides(batchHistory.prev);
    setBatchApplied(prev => {
      const next = new Set(prev);
      batchHistory.fields.forEach(f => next.delete(f));
      return next;
    });
    setBatchHistory(null);
  };

  const applyAdvancedBatch = () => {
    if (!advancedBatch) return;
    const { target, field, value } = advancedBatch;
    // Mesmo motivo do applyBatchEdit: guarda precisa entender vírgula e
    // aceitar zero — rejeita apenas negativo ou não numérico.
    const val = parseBrNumber(value);
    if (!Number.isFinite(val) || val < 0) {
      toast({ title: "Valor inválido", description: "Informe um valor igual ou maior que zero.", variant: "destructive" });
      return;
    }
    const domainField: SheetField =
      field === "vdia" ? "valorDia" :
      field === "alimUtil" ? "alimentacaoUtil" :
      field === "alimFds" ? "alimentacaoFds" : "mobilidade";
    const targets = filteredBudgets.filter(b => {
      if (isCardNotAttended(b)) return false;
      if (sentToActual.has(b.inclusion.id)) return false;
      const isCasa = isCasaType(b.collaborator?.type);
      if (target === "casa" && !isCasa) return false;
      if (target === "freela" && isCasa) return false;
      if (target === "selected" && !selectedIds.has(b.inclusion.id)) return false;
      return true;
    });
    if (targets.length === 0) return;
    const prevOverrides = { ...budgetOverrides };
    targets.forEach(b => handleSheetEdit(b, domainField, value));
    // Marca o flag do campo realmente editado — antes era sempre 'vdia',
    // mesmo em edições de alimentação/mobilidade.
    const batchFlag: BatchField =
      field === "vdia" ? "vdia" :
      field === "mob" ? "mob" : "alim";
    setBatchApplied(prev => { const next = new Set(prev); next.add(batchFlag); return next; });
    setBatchHistory({ fields: [batchFlag], prev: prevOverrides });
    setAdvancedBatch(null);
    toast({ title: `Lote aplicado`, description: `${targets.length} colaborador${targets.length !== 1 ? "es" : ""} atualizados` });
  };

  // Close batch popover on outside click or Esc
  useEffect(() => {
    if (!batchPopover) return;
    const handler = (e: MouseEvent) => {
      if (batchPopoverRef.current && !batchPopoverRef.current.contains(e.target as Node)) {
        setBatchPopover(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setBatchPopover(null); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", keyHandler); };
  }, [batchPopover]);

  useEffect(() => {
    if (!subtotalOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const popover = document.getElementById(`subtotal-popover-${subtotalOpenId}`);
      // O botão dono fica de fora do "clique fora": sem isso, o mousedown
      // fechava e o click seguinte reabria — o botão nunca conseguia FECHAR.
      const ownerBtn = document.getElementById(`subtotal-btn-${subtotalOpenId}`);
      if (ownerBtn && ownerBtn.contains(target)) return;
      if (popover && !popover.contains(target)) {
        setSubtotalOpenId(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setSubtotalOpenId(null); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", keyHandler); };
  }, [subtotalOpenId]);

  // A11y: quando o popover de lote fecha, o foco volta ao ✏ que o abriu.
  // Depende só do CAMPO aberto (não do objeto inteiro) para não roubar o foco
  // do input a cada tecla digitada.
  const batchPopoverField = batchPopover?.field ?? null;
  useEffect(() => {
    if (!batchPopoverField) return;
    return () => { batchTriggerRef.current?.focus(); };
  }, [batchPopoverField]);

  // Modal de edição em lote fecha com Esc
  useEffect(() => {
    if (!advancedBatch) return;
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setAdvancedBatch(null); };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  }, [advancedBatch]);

  const batchHeaderButton = (field: BatchField, ariaLabel: string) => (
    <button
      onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === field ? null : { field, value: "" }); }}
      className={`text-2xs p-1.5 -m-1 rounded transition-colors cursor-pointer ${batchApplied.has(field) ? "text-primary" : "text-muted-foreground hover:text-muted-foreground"}`}
      style={{ minWidth: 24, minHeight: 24 }}
      title="Editar em lote"
      aria-label={ariaLabel}
      aria-expanded={batchPopover?.field === field}
    >✏</button>
  );
  const batchHeaderPopover = (field: BatchField, title: string) => batchPopover?.field === field && (
    <BatchPopover
      title={title}
      value={batchPopover.value}
      onChangeValue={v => setBatchPopover(p => p ? { ...p, value: v } : p)}
      onCancel={() => setBatchPopover(null)}
      onApply={() => { applyBatchEdit(field, batchPopover.value); setBatchPopover(null); }}
    />
  );

  const pendingSheet = filteredBudgets.filter(b => !sentToActual.has(b.inclusion.id) && !isCardNotAttended(b));
  const hasEdits = pendingSheet.some(b => b.hasOverride);
  const hasPending = pendingSheet.length > 0;
  const totalDiariasCols = filteredBudgets.reduce((s, b) => s + b.subtotalDiarias, 0);
  const totalAlimCols = filteredBudgets.reduce((s, b) => s + b.almocoSemana + b.jantarSemana + b.almocoFds + b.jantarFds, 0);
  const totalMobCols = filteredBudgets.reduce((s, b) => s + b.mobilidade, 0);

  return (
    <>
      {/* ── Planilha de Edição ── */}
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-2xs text-muted-foreground font-medium" aria-live="polite">{filteredBudgets.length} colaborador{filteredBudgets.length !== 1 ? "es" : ""}</span>
        {confirmReset ? (
          <div className="flex items-center gap-2 text-2xs">
            <span className="text-muted-foreground">Isso limpa os ajustes manuais de todos os visíveis (filtro atual). Confirmar?</span>
            <button
              onClick={() => {
                setBudgetOverrides(prev => limparOverridesDe(prev, filteredBudgets.map(b => b.inclusion.id)));
                setConfirmReset(false);
              }}
              className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold text-2xs hover:bg-primary-hover transition-colors"
            >
              Sim, aplicar
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="px-2.5 py-1 rounded-md border border-border text-muted-foreground font-medium text-2xs hover:bg-surface-muted transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdvancedBatch({ target: "all", field: "vdia", value: "" })}
              className="text-2xs px-3 py-1.5 rounded-lg text-success bg-success-soft hover:bg-success-soft border border-success/25 transition-colors flex items-center gap-1.5 font-medium"
            >
              ✏ Edição em Lote
            </button>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="text-2xs px-3 py-1.5 rounded-lg text-primary bg-brand-soft hover:bg-brand-soft border border-primary/25 transition-colors flex items-center gap-1.5 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    Restaurar Padrão em Todos
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs max-w-[240px] text-center">
                  Limpa os ajustes manuais de todos os visíveis (filtro atual) e volta ao cálculo automático da regra atual: diária plana por tipo (Atendimento/Casa/Freela), deflação por período e alimentação/mobilidade pelos horários de voo
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Edição em lote — Radix Dialog (Esc, foco preso, aria); pergunta antes de descartar um valor digitado */}
      <AdvancedBatchDialog
        advancedBatch={advancedBatch}
        setAdvancedBatch={setAdvancedBatch}
        selectedCount={selectedIds.size}
        pedirParaFechar={descarteLote.pedirParaFechar}
        onApply={applyAdvancedBatch}
      />
      {descarteLote.Dialogo}

      {/* Tabela */}
      <div ref={batchPopoverRef} className="bg-card rounded-xl border border-border overflow-hidden">
        <div ref={sheetScrollRef} className="overflow-auto max-h-[calc(100vh-var(--sticky-top,3.5rem)-16rem)]" data-testid="budget-sheet-scroll">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface-muted">
              <tr className="border-b border-border">
                {/* Checkbox select-all */}
                <th scope="col" className="w-10 px-3 py-2.5 bg-surface-muted/80">
                  <Checkbox
                    checked={selectableFiltered.length > 0 && selectableFiltered.every(b => selectedIds.has(b.inclusion.id))}
                    onCheckedChange={v => {
                      // Só os SELECIONÁVEIS entram: enviados e "não participou" ficam de fora
                      setSelectedIds(v
                        ? new Set(selectableFiltered.map(b => b.inclusion.id))
                        : new Set()
                      );
                    }}
                    className="w-3.5 h-3.5"
                    aria-label="Selecionar todos os colaboradores pendentes visíveis"
                  />
                </th>
                {/* Colaborador / Função / Período */}
                <th scope="col" className="text-left px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] min-w-[260px] bg-surface-muted/80 text-muted-foreground">Colaborador · Função · Período</th>

                {/* Diárias (qty) — read-only */}
                <th scope="col" className="text-center px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-20 bg-muted text-muted-foreground">
                  <div className="flex items-center justify-center gap-1">
                    <Lock className="text-muted-foreground shrink-0" style={{ width: 10, height: 10 }} aria-hidden="true" />
                    <span>Dias</span>
                  </div>
                </th>

                {/* Diária R$/dia — batch edit */}
                <th scope="col" className="text-right px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-36 relative bg-surface-muted text-slate-700">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-2xs font-semibold text-slate-600">Diária R$/dia</span>
                    {batchHeaderButton("vdia", "Editar diária em lote")}
                  </div>
                  {batchHeaderPopover("vdia", "Aplicar R$/dia para todos")}
                </th>

                {/* Alim. R$/dia — batch edit */}
                <th scope="col" className="text-right px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-36 relative bg-surface-muted text-slate-700">
                  <div className="flex items-center justify-end gap-1">
                    <div className="flex flex-col items-end leading-tight gap-0.5">
                      <span className="text-2xs font-semibold text-slate-600">Alim. R$/dia</span>
                      <div className="flex items-center gap-2 text-2xs font-medium text-muted-foreground">
                        <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 bg-primary align-middle" />Útil</span>
                        <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 bg-warning-strong align-middle" />FDS</span>
                      </div>
                    </div>
                    {batchHeaderButton("alim", "Editar alimentação em lote")}
                  </div>
                  {batchHeaderPopover("alim", "Alim. R$/dia — aplicar para todos")}
                </th>

                {/* Mobilidade — batch edit */}
                <th scope="col" className="text-right px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-28 relative bg-surface-muted text-slate-700">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-slate-600">Mob. R$ total</span>
                      {batchHeaderButton("mob", "Editar mobilidade em lote")}
                    </div>
                    {batchHeaderPopover("mob", "Mob. R$ total (Ida+Volta) — aplicar para todos")}
                  </th>
                <th scope="col" className="text-right px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.07em] w-28 bg-brand-soft/60 text-primary">Subtotal</th>
              </tr>

              {/* Banner de edição em lote */}
              {batchApplied.size > 0 && (
                <tr>
                  <td colSpan={COL_SPAN_TOTAL} className="bg-brand-soft py-1 px-4">
                    <div className="flex items-center gap-2 text-2xs text-primary">
                      <span>✏ {Array.from(batchApplied).map(f => f === "vdia" ? "R$/dia" : f === "alim" ? "Alimentação" : "Mobilidade").join(" e ")} editado{batchApplied.size > 1 ? "s" : ""} em lote</span>
                      {batchHistory && (
                        <>
                          <span className="text-primary/70">·</span>
                          <button onClick={undoBatch} className="cursor-pointer font-semibold px-2 py-0.5 rounded text-2xs transition-colors hover:opacity-80 bg-primary text-primary-foreground">Desfazer</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-border" aria-rowcount={filteredBudgets.length + 1}>
              {filteredBudgets.length === 0 ? (
                <tr>
                  <td colSpan={COL_SPAN_TOTAL} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado</td>
                </tr>
              ) : (<>
                <EspacadorLinha altura={linhasPlanilha.espacoAntes} colunas={COL_SPAN_TOTAL} />
                {linhasPlanilha.linhas.map(({ item: budget, index: rowIdx, medir }) => {
                const sid = budget.inclusion.id;
                const prevBudgetCollab = rowIdx > 0 ? filteredBudgets[rowIdx - 1].inclusion.collaboratorId : null;
                const isNewCollab = prevBudgetCollab !== budget.inclusion.collaboratorId;
                return (
                  <SheetRow
                    key={sid}
                    ref={medir}
                    index={rowIdx}
                    budget={budget}
                    name={nomeDaVaga(budget)}
                    funcName={getFunctionName(budget.inclusion.functionId)}
                    isSent={sentToActual.has(sid)}
                    isNotAttended={isCardNotAttended(budget)}
                    isNewCollab={isNewCollab}
                    showTopBorder={isNewCollab && rowIdx > 0}
                    selected={selectedIds.has(sid)}
                    ovr={budgetOverrides[sid]}
                    matchingActual={actualsByCollabFunc.get(collabFuncKey(budget.inclusion))}
                    subtotalOpen={subtotalOpenId === sid}
                    onToggleSelect={onToggleSelect}
                    onSheetEdit={handleSheetEdit}
                    onRestoreField={restoreSheetField}
                    onToggleSubtotal={toggleSubtotalPopover}
                  />
                );
                })}
                <EspacadorLinha altura={linhasPlanilha.espacoDepois} colunas={COL_SPAN_TOTAL} />
              </>)}
            </tbody>
            {filteredBudgets.length > 0 && (
              <tfoot>
                <tr className="bg-brand-soft border-t-2 border-t-primary">
                  <td style={{ width: 40 }} />
                  <td className="px-4 py-2.5">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      TOTAL ({filteredBudgets.length})
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                      {filteredBudgets.reduce((s, b) => s + b.weekdays + b.weekends, 0)} dias
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                      {formatCurrency(totalDiariasCols)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                      {formatCurrency(totalAlimCols)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                      {formatCurrency(totalMobCols)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-base font-extrabold font-mono tabular-nums text-primary">{formatCurrency(totalGeral)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Rodapé de Ações da Planilha ── */}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          {hasPending && (
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 rounded-full border bg-warning-soft text-warning border-warning/25">
              ⏱ {pendingSheet.length} {pendingSheet.length === 1 ? "pendente" : "pendentes"}
            </span>
          )}
          {hasEdits && (
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-warning bg-warning-soft border border-warning/25 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-warning-strong rounded-full" />
              Valores editados
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            {hasEdits && (
              <button
                onClick={() => setBudgetOverrides(prev => limparOverridesDe(prev, filteredBudgets.map(b => b.inclusion.id)))}
                title="Descarta os ajustes manuais de todos os visíveis (filtro atual) — o cálculo automático reassume"
                className="text-xs font-medium text-muted-foreground hover:text-slate-700 hover:bg-muted px-3 py-2 rounded-lg transition-colors"
              >
                Descartar Alterações
              </button>
            )}
            <button
              disabled={!hasPending}
              onClick={() => {
                if (!hasPending) return;
                const ids = pendingSheet.map(b => b.inclusion.id);
                setSelectedIds(new Set(ids));
                onSend(ids);
              }}
              className={`h-10 flex items-center gap-2 text-sm font-semibold text-white px-5 rounded-lg shadow-2 transition-all
                ${hasPending
                  ? `bg-success hover:bg-success/90 ${hasEdits ? "ring-2 ring-success-strong ring-offset-1" : ""}`
                  : "bg-slate-300 cursor-not-allowed opacity-50 shadow-none"}
              `}
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              Enviar Planejamento
              {hasPending && (
                <span className="ml-1 w-5 h-5 rounded-full bg-card/25 flex items-center justify-center text-2xs font-bold leading-none">
                  {pendingSheet.length}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default BudgetSheet;
