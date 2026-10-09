/**
 * PLANILHA de edição do Planejado — 25/09 (modularização); redesenho 08/10.
 *
 * Antes: uma caixa de altura fixa rolando por dentro da página (que também
 * rolava), cabeçalho cortado em 1366 ("SUBTOTA"), ✏ como emoji nos
 * cabeçalhos, valores em monoespaçada com ponto ("540.00"), dois botões que
 * faziam a mesma coisa ("Restaurar Padrão em Todos" e "Descartar
 * Alterações") e o "Enviar planejamento" lá embaixo, depois da tabela.
 *
 * Agora:
 *  - um painel só: no topo o que a planilha tem (pendentes, com ajuste) e as
 *    ferramentas (lote, restaurar padrão, enviar pendentes); a confirmação de
 *    "restaurar" e o "Desfazer" do lote aparecem numa faixa logo abaixo;
 *  - a TABELA rola com a página (virtualização pela janela), cabeçalho grudado
 *    sob a barra da tela e a linha de TOTAIS grudada no rodapé — o total do
 *    recorte nunca sai de vista;
 *  - em largura útil estreita (tablet/celular) cada linha vira um cartão com
 *    rótulos, os mesmos campos e a mesma ordem de tabulação;
 *  - números em pt-BR ("540,00"), tabulares, alinhados à direita.
 *
 * Nada mudou no que se grava: edição, lote, restaurar e envio chamam as
 * mesmas funções (sheet-edits) e os mesmos callbacks de antes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Layers, Lock, PencilLine, RotateCcw, Send, Undo2 } from "lucide-react";
import { cn, parseBrNumber } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { EspacadorLinha, useLinhasVirtuaisNaJanela } from "@/components/common/virtual-rows";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { BudgetActual } from "@shared/schema";
import type { DraftStatus } from "@/hooks/use-budget-draft";
import { AdvancedBatchDialog } from "./advanced-batch-dialog";
import { BatchPopover } from "./batch-popover";
import { SeloDoRascunho } from "./selo-do-rascunho";
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
  /** RH/admin: vê o "Enviar pendentes". */
  isAdmin: boolean;
  onSend: (ids: string[]) => void;
  /** Há busca/filtro ligado: o vazio oferece "Limpar filtros". */
  algumFiltro?: boolean;
  onLimparFiltros?: () => void;
  /** Rascunho no servidor (08/10): alimenta o selo "Rascunho salvo HH:MM". */
  draftStatus?: DraftStatus;
  draftSavedAt?: string | null;
}

const COL_SPAN_TOTAL = 7;
/** Abaixo disto (largura útil) a linha vira cartão: as 7 colunas não cabem. */
const LARGURA_MINIMA_DA_TABELA = 900;
const ROTULO_LOTE: Record<BatchField, string> = { vdia: "Diária", alim: "Alimentação", mob: "Mobilidade" };

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
  // A11y: botão do lote que abriu o popover — recebe o foco de volta ao fechar
  const batchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [subtotalOpenId, setSubtotalOpenId] = useState<string | null>(null);
  const [advancedBatch, setAdvancedBatch] = useState<AdvancedBatch | null>(null);
  // Só pergunta "Descartar?" se já há um valor digitado no lote.
  const descarteLote = useConfirmarDescarte(!!advancedBatch?.value);

  // Tabela × cartão pela largura ÚTIL (o menu lateral muda o espaço sem mudar a janela).
  // Medida no painel, que existe em todos os estados (o observador liga na montagem).
  const { ref: refLargura, largura } = useLarguraUtil<HTMLElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;
  const largo = largura !== null && largura >= 1400;

  // ── Virtualização pela JANELA (08/10): a tabela tem altura natural e a
  // página rola como sempre; só as linhas à vista vão para o DOM (≥ 60).
  const refTabela = useRef<HTMLDivElement | null>(null);
  const linhasPlanilha = useLinhasVirtuaisNaJanela(filteredBudgets, { tabelaRef: refTabela, alturaEstimada: modoCartao ? 200 : 64 });

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
    if (targets.length === 0) {
      // Antes saía em silêncio — o botão parecia não funcionar.
      toast({ title: "Nenhum colaborador nesse alvo", description: "Não há pendentes visíveis para esse grupo. Ajuste o alvo ou os filtros." });
      return;
    }
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

  // A11y: quando o popover de lote fecha, o foco volta ao botão que o abriu.
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
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={e => { batchTriggerRef.current = e.currentTarget; setBatchPopover(batchPopover?.field === field ? null : { field, value: "" }); }}
            className={cn(
              "pla-lote relative inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              batchPopover?.field === field ? "bg-primary text-primary-foreground"
                : batchApplied.has(field) ? "text-primary bg-brand-soft hover:bg-primary/15"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-label={ariaLabel}
            aria-expanded={batchPopover?.field === field}
          >
            <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Editar em lote</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const editadosVisiveis = pendingSheet.filter(b => b.hasOverride).length;
  const temAjusteVisivel = filteredBudgets.some(b => b.hasOverride);
  const hasPending = pendingSheet.length > 0;
  const totalDiariasCols = filteredBudgets.reduce((s, b) => s + b.subtotalDiarias, 0);
  const totalAlimCols = filteredBudgets.reduce((s, b) => s + b.almocoSemana + b.jantarSemana + b.almocoFds + b.jantarFds, 0);
  const totalMobCols = filteredBudgets.reduce((s, b) => s + b.mobilidade, 0);
  const totalDias = filteredBudgets.reduce((s, b) => s + b.weekdays + b.weekends, 0);
  const temSelecao = selectedIds.size > 0;
  // Selo do rascunho: só com ajuste e depois de carregar (antes não há o que dizer).
  const temSelo = !!p.draftStatus && p.draftStatus !== "carregando" && Object.keys(budgetOverrides).length > 0;
  // Total do RECORTE (sem os que não participaram). Com filtro, o do evento
  // aparece embaixo — antes a linha mostrava o do evento ao lado das colunas
  // do recorte, e "1 colaborador" parecia custar o evento inteiro.
  const totalVisivel = filteredBudgets.reduce((s, b) => (isCardNotAttended(b) ? s : s + b.totalFinal), 0);

  const TH = "px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground align-bottom";
  const SUB = "block mt-0.5 text-2xs font-normal normal-case tracking-normal whitespace-nowrap text-muted-foreground/90";

  return (
    <>
      {/* Edição em lote — Radix Dialog (Esc, foco preso, aria); pergunta antes de descartar um valor digitado */}
      <AdvancedBatchDialog
        advancedBatch={advancedBatch}
        setAdvancedBatch={setAdvancedBatch}
        selectedCount={selectedIds.size}
        pedirParaFechar={descarteLote.pedirParaFechar}
        onApply={applyAdvancedBatch}
      />
      {descarteLote.Dialogo}

      <section ref={refLargura} aria-label="Planilha de edição" className="pla-planilha rounded-xl border border-border bg-card" data-testid="budget-sheet">
        {/* ── Topo: o que a planilha tem e as ferramentas ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5 border-b border-border">
          {/* Base de 15rem (tablet em diante): sem espaço, as ferramentas descem
              — o resumo nunca vira uma coluna estreita ao lado do selo. */}
          <p className="m-0 min-w-0 flex-1 sm:flex-[1_1_15rem] text-xs text-muted-foreground tabular-nums" aria-live="polite">
            <span className="font-medium text-foreground">{filteredBudgets.length} {filteredBudgets.length === 1 ? "colaborador" : "colaboradores"}</span>
            {" · "}{pendingSheet.length} {pendingSheet.length === 1 ? "pendente" : "pendentes"}
            {editadosVisiveis > 0 && <> · <span className="text-warning font-medium">{editadosVisiveis} com ajuste</span></>}
            {/* Com o selo à vista (que diz o mesmo no tooltip), a frase só cabe na tela larga. */}
            <span className={cn("hidden", temSelo ? "2xl:inline" : "xl:inline")}> · o rascunho fica salvo e aparece em qualquer computador</span>
          </p>
          {temSelo && p.draftStatus && (
            <SeloDoRascunho status={p.draftStatus} savedAt={p.draftSavedAt ?? null} temAjuste={temSelo} />
          )}
          {filteredBudgets.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAdvancedBatch({ target: "all", field: "vdia", value: "" })}
              className="pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="planilha-edicao-em-lote"
            >
              <Layers className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              Edição em lote
            </button>
            {/* "Restaurar Padrão em Todos" e "Descartar Alterações" faziam a
                MESMA coisa (limpar os ajustes dos visíveis); ficou um só, com a
                confirmação do primeiro. */}
            <MotivoDesabilitado
              motivo={temAjusteVisivel
                ? "Limpa os ajustes manuais de todos os visíveis (filtro atual) e volta ao cálculo automático da regra atual: diária plana por tipo (Atendimento/Casa/Freela), deflação por período e alimentação/mobilidade pelos horários de voo"
                : "Nenhum ajuste manual nos colaboradores visíveis"}
              desabilitado={!temAjusteVisivel}
            >
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={!temAjusteVisivel || confirmReset}
                className="pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="planilha-restaurar-padrao"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                Restaurar padrão
              </button>
            </MotivoDesabilitado>
            {isAdmin && (
              <MotivoDesabilitado motivo="Nenhum colaborador pendente neste recorte" desabilitado={!hasPending}>
                <button
                  type="button"
                  disabled={!hasPending}
                  onClick={() => {
                    if (!hasPending) return;
                    const ids = pendingSheet.map(b => b.inclusion.id);
                    setSelectedIds(new Set(ids));
                    onSend(ids);
                  }}
                  className={cn(
                    "pas-alvo inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    // Com algo marcado, a ação forte é a da barra de seleção.
                    temSelecao ? "border border-border bg-card text-slate-700 hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary-hover",
                  )}
                  data-testid="planilha-enviar-pendentes"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  Enviar pendentes{hasPending ? ` (${pendingSheet.length})` : ""}
                </button>
              </MotivoDesabilitado>
            )}
          </div>}
        </div>

        {/* Confirmação do "Restaurar padrão" — na própria planilha, sem modal. */}
        {confirmReset && (
          <div role="alertdialog" aria-label="Restaurar padrão" className="pas-entra flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5 border-b border-warning/25 bg-warning-soft">
            <p className="m-0 min-w-0 flex-1 text-xs text-warning">
              <span className="font-semibold">Restaurar o padrão?</span> Isso limpa os ajustes manuais de todos os visíveis (filtro atual) e volta ao cálculo automático.
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmReset(false)}
                className="pas-alvo h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setBudgetOverrides(prev => limparOverridesDe(prev, filteredBudgets.map(b => b.inclusion.id)));
                  setConfirmReset(false);
                }}
                className="pas-alvo h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Sim, restaurar
              </button>
            </div>
          </div>
        )}

        {/* Lote aplicado: o que mudou e o "Desfazer". */}
        {batchApplied.size > 0 && (
          <div role="status" className="pas-entra flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b border-primary/15 bg-brand-soft text-xs text-primary">
            <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {Array.from(batchApplied).map(f => ROTULO_LOTE[f]).join(" e ")} {batchApplied.size > 1 ? "editadas" : "editada"} em lote
            </span>
            {batchHistory && (
              <button
                type="button"
                onClick={undoBatch}
                className="pas-alvo inline-flex items-center gap-1 h-7 px-2 rounded-md font-semibold hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />Desfazer
              </button>
            )}
          </div>
        )}

        {filteredBudgets.length === 0 ? (
          <div className="pas-entra px-6 py-12 text-center" data-testid="planilha-vazia">
            <p className="m-0 text-sm font-semibold text-foreground">Nenhum colaborador encontrado</p>
            <p className="m-0 mt-1 text-sm text-muted-foreground">Nenhuma linha bate com a busca e os filtros de agora.</p>
            {p.algumFiltro && p.onLimparFiltros && (
              <button
                type="button"
                onClick={p.onLimparFiltros}
                className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div ref={refTabela} className={modoCartao ? "pla-cartao" : "pla-tabela"} data-testid="budget-sheet-scroll">
            <div ref={batchPopoverRef}>
              <table className={cn("w-full border-collapse text-left", !modoCartao && "table-fixed")}>
                <caption className="sr-only">Planilha do planejado: colaborador, dias, diária, alimentação, mobilidade e subtotal</caption>
                {!modoCartao && (
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col />
                    <col style={{ width: 84 }} />
                    <col style={{ width: largo ? 176 : 144 }} />
                    <col style={{ width: largo ? 196 : 164 }} />
                    <col style={{ width: largo ? 168 : 136 }} />
                    <col style={{ width: largo ? 168 : 140 }} />
                  </colgroup>
                )}
                <thead className="pas-cabecalho">
                  <tr>
                    <th scope="col" className="pl-4 pr-1 py-2 align-middle">
                      <Checkbox
                        checked={selectableFiltered.length > 0 && selectableFiltered.every(b => selectedIds.has(b.inclusion.id))}
                        disabled={selectableFiltered.length === 0}
                        onCheckedChange={v => {
                          // Só os SELECIONÁVEIS entram: enviados e "não participou" ficam de fora
                          setSelectedIds(v
                            ? new Set(selectableFiltered.map(b => b.inclusion.id))
                            : new Set()
                          );
                        }}
                        aria-label="Selecionar todos os colaboradores pendentes visíveis"
                      />
                    </th>
                    <th scope="col" className={TH}>Colaborador<span className={SUB}>Função · período · situação</span></th>
                    <th scope="col" className={cn(TH, "text-center")}>
                      <span className="inline-flex items-center gap-1" title="Vem do período da escalação — não se edita aqui">
                        <Lock className="w-3 h-3" aria-hidden="true" />Dias
                      </span>
                      <span className={SUB}>com diária</span>
                    </th>
                    <th scope="col" className={cn(TH, "text-right relative")}>
                      <div className="flex items-end justify-end gap-1.5">
                        <span>Diária<span className={SUB}>R$ por dia</span></span>
                        {batchHeaderButton("vdia", "Editar diária em lote")}
                      </div>
                      {batchHeaderPopover("vdia", "Aplicar R$/dia para todos")}
                    </th>
                    <th scope="col" className={cn(TH, "text-right relative")}>
                      <div className="flex items-end justify-end gap-1.5">
                        <span>
                          Alimentação
                          <span className={SUB}>
                            R$/dia ·{" "}
                            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />útil</span>{" "}
                            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />FDS</span>
                          </span>
                        </span>
                        {batchHeaderButton("alim", "Editar alimentação em lote")}
                      </div>
                      {batchHeaderPopover("alim", "Alim. R$/dia — aplicar para todos")}
                    </th>
                    <th scope="col" className={cn(TH, "text-right relative")}>
                      <div className="flex items-end justify-end gap-1.5">
                        <span>Mobilidade<span className={SUB}>R$ ida + volta</span></span>
                        {batchHeaderButton("mob", "Editar mobilidade em lote")}
                      </div>
                      {batchHeaderPopover("mob", "Mob. R$ total (Ida+Volta) — aplicar para todos")}
                    </th>
                    <th scope="col" className={cn(TH, "text-right pr-4")}>
                      Subtotal
                      <span className={cn(SUB, "inline-flex items-center gap-1")}><Info className="w-3 h-3" aria-hidden="true" />abre a memória</span>
                    </th>
                  </tr>
                </thead>
                <tbody aria-rowcount={filteredBudgets.length + 1}>
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
                        isNewCollab={isNewCollab || modoCartao}
                        showTopBorder={isNewCollab && rowIdx > 0}
                        selected={selectedIds.has(sid)}
                        ovr={budgetOverrides[sid]}
                        matchingActual={actualsByCollabFunc.get(collabFuncKey(budget.inclusion))}
                        subtotalOpen={subtotalOpenId === sid}
                        memoriaParaCima={!modoCartao && filteredBudgets.length > 4 && rowIdx >= filteredBudgets.length - 3}
                        onToggleSelect={onToggleSelect}
                        onSheetEdit={handleSheetEdit}
                        onRestoreField={restoreSheetField}
                        onToggleSubtotal={toggleSubtotalPopover}
                      />
                    );
                  })}
                  <EspacadorLinha altura={linhasPlanilha.espacoDepois} colunas={COL_SPAN_TOTAL} />
                </tbody>
                {/* Totais do recorte: grudados no rodapé da janela enquanto a tabela rola. */}
                <tfoot className={cn("pla-totais", temSelecao && "pla-totais-alto")}>
                  <tr>
                    <td className="pl-4 pr-1 py-2.5" data-col="sel" />
                    <td className="px-3 py-2.5" data-col="colab">
                      <span className="text-xs font-semibold text-foreground">Total</span>
                      <span className="text-xs text-muted-foreground tabular-nums"> · {filteredBudgets.length} {filteredBudgets.length === 1 ? "colaborador" : "colaboradores"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs font-medium tabular-nums text-slate-600" data-col="dias" data-rotulo="Dias">
                      {totalDias} dias
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-slate-600" data-col="diaria" data-rotulo="Diárias">
                      {formatCurrency(totalDiariasCols)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-slate-600" data-col="alim" data-rotulo="Alimentação">
                      {formatCurrency(totalAlimCols)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-slate-600" data-col="mob" data-rotulo="Mobilidade">
                      {formatCurrency(totalMobCols)}
                    </td>
                    <td className="pl-3 pr-4 py-2.5 text-right" data-col="subtotal">
                      <span className="block text-base font-semibold tabular-nums text-primary" title="Total planejado dos colaboradores visíveis (sem os que não participaram)">{formatCurrency(totalVisivel)}</span>
                      {totalVisivel !== totalGeral && (
                        <span className="block text-2xs font-normal tabular-nums text-muted-foreground" title="Total planejado do evento (sem os que não participaram)">de {formatCurrency(totalGeral)} do evento</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

export default BudgetSheet;
