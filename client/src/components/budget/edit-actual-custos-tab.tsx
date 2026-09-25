/**
 * Aba "Custos" do modal do Realizado — 25/09 (modularização).
 *
 * Quatro blocos extraídos de budget-actual.tsx: Diárias (grade de dias +
 * dia extra), Mobilidade/Translado (somente leitura), Viagem (horários que
 * dirigem a alimentação — não persistidos) e Alimentação (recalculada pela
 * viagem, editável). O estado vem de `useBudgetActualEditor`.
 */
import { AlertTriangle, ArrowLeft, ArrowRight, Car, Calendar, Check, Lock, Moon, Plane, Plus, RefreshCw, Sun, Utensils } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { CurrencyInput } from "@/components/common/currency-input";
import { FUNCAO_LOCAL_RAZAO } from "@shared/calculation-rules";
import type { BudgetActual, BudgetPlanned } from "@shared/schema";
import type { EditorDoRealizado } from "@/hooks/use-budget-actual-editor";
import { isWeekendDate, TRAVEL_SOURCE_LABEL, type AlimField, type EditFormBase, type TravelSource } from "./actual-utils";

const formatCurrency = formatarMoeda;

export interface CustosTabRealizadoProps {
  editor: EditorDoRealizado;
  editingItem: BudgetActual;
  editFormData: EditFormBase;
  isReadOnly: boolean;
  planned: BudgetPlanned | undefined;
  plannedValorUtil: number;
  plannedValorFds: number;
  plannedSubDiarias: number;
  subtotalDiariasRaw: number;
  modalMobility: number;
  totalAlimentacao: number;
  modalVoa: boolean;
  modalFuncaoLocal: boolean;
  semAlimentacao: boolean;
}

const ddmm = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** ── Diárias — editável (grade por dia + dia extra + barra de divergência) ── */
function DiariasBlock(p: CustosTabRealizadoProps) {
  const { editor, isReadOnly, planned, plannedValorUtil, plannedValorFds, plannedSubDiarias, subtotalDiariasRaw } = p;
  const { editDayEntries, setEditDayEntries, showAddDay, setShowAddDay, setExtraDayEdge } = editor;
  const activeDayEntries = editDayEntries.filter(d => d.active);
  const sortedActiveDays = [...activeDayEntries].sort((a, b) => a.date.localeCompare(b.date));
  const primeiroDiaAtivo = sortedActiveDays[0]?.date ?? null;
  const ultimoDiaAtivo = sortedActiveDays[sortedActiveDays.length - 1]?.date ?? null;
  const diffDiarias = subtotalDiariasRaw - plannedSubDiarias;
  const pctDiarias = plannedSubDiarias > 0 ? ((subtotalDiariasRaw - plannedSubDiarias) / plannedSubDiarias * 100) : 0;
  return (
    <div className="rounded-xl border border-border overflow-hidden border-l-[3px] border-l-primary bg-brand-soft">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/25 bg-primary-hover/5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary-hover flex items-center justify-center">
            <Calendar className="w-3 h-3 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-semibold text-primary uppercase tracking-wide">Diárias</span>
          <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-brand-soft text-primary">
            {activeDayEntries.length} {activeDayEntries.length === 1 ? "dia ativo" : "dias ativos"}
          </span>
        </div>
        <span className="text-sm font-bold font-mono text-primary tabular-nums">{formatCurrency(subtotalDiariasRaw)}</span>
      </div>
      {/* Col headers */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 bg-surface-muted px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
        <span className="w-5" />
        <span>Data</span>
        <span className="text-right">Planejado</span>
        <span className="text-right pr-1">Realizado</span>
      </div>
      {/* Day rows */}
      <div className="max-h-48 overflow-y-auto divide-y divide-border">
        {editDayEntries.length === 0 && (
          <div className="px-4 py-6 text-center text-2xs text-muted-foreground">
            Nenhuma data no período da escalação
          </div>
        )}
        {editDayEntries.map((entry, idx) => {
          const date = new Date(entry.date + "T00:00:00");
          const dayLabel = date.toLocaleDateString("pt-BR", { weekday: "short" });
          const dateLabel = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          const plannedVal = entry.isWeekend ? plannedValorFds : plannedValorUtil;
          const isChanged = planned && plannedVal > 0 && entry.active && entry.valueCents !== plannedVal;
          return (
            <div
              key={entry.date}
              className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-4 py-2 transition-colors
                ${!entry.active ? "opacity-40 bg-surface-muted/60" : "hover:bg-brand-soft/20"}`}
            >
              {/* Toggle */}
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setEditDayEntries(prev => prev.map((x, i) => i === idx ? { ...x, active: !x.active } : x))}
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors
                  ${entry.active ? "bg-primary-hover text-white" : "bg-border text-muted-foreground"}
                  ${isReadOnly ? "cursor-not-allowed" : "cursor-pointer hover:opacity-80"}`}
              >
                {entry.active && <Check className="w-2.5 h-2.5" aria-hidden="true" />}
              </button>
              {/* Date + label */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-slate-700 tabular-nums">{dateLabel}</span>
                <span className="text-2xs text-muted-foreground capitalize">{dayLabel}</span>
                {entry.isWeekend && (
                  <span className="text-2xs font-semibold text-warning bg-warning-soft border border-warning/25 px-1.5 rounded-full shrink-0">FDS</span>
                )}
              </div>
              {/* Planned reference */}
              <div className="text-right">
                {planned && plannedVal > 0
                  ? <span className="text-2xs text-muted-foreground font-mono tabular-nums">{formatCurrency(plannedVal)}</span>
                  : <span className="text-2xs text-slate-200">—</span>}
              </div>
              {/* Actual value input */}
              <CurrencyInput
                key={entry.date}
                value={entry.valueCents}
                onChange={v => setEditDayEntries(prev => prev.map((x, i) => i === idx ? { ...x, valueCents: v } : x))}
                disabled={!entry.active || isReadOnly}
                className={`text-right w-24 font-mono tabular-nums border rounded-md font-semibold
                  focus:border-primary focus:ring-2 focus:ring-ring/15 focus:bg-card
                  ${!entry.active || isReadOnly
                    ? "bg-surface-muted border-border opacity-40 cursor-not-allowed"
                    : isChanged
                      ? "bg-warning-soft border-warning/25"
                      : "bg-card border-border cursor-text"} text-sm`}
                style={{ height: 38 }}
              />
            </div>
          );
        })}
      </div>
      {/* Add extra day */}
      {!isReadOnly && (
        <div className="px-4 py-2 border-t border-border bg-card">
          {showAddDay ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                autoFocus
                className="h-7 text-xs border border-primary rounded-lg px-2 text-slate-700 bg-brand-soft focus:outline-none focus:ring-2 focus:ring-ring/20"
                onChange={e => {
                  const newDate = e.target.value;
                  if (!newDate) return;
                  if (!editDayEntries.some(d => d.date === newDate)) {
                    const isWknd = isWeekendDate(newDate);
                    const refVal = isWknd
                      ? (editDayEntries.find(de => de.isWeekend)?.valueCents ?? editDayEntries[0]?.valueCents ?? 0)
                      : (editDayEntries.find(de => !de.isWeekend)?.valueCents ?? editDayEntries[0]?.valueCents ?? 0);
                    // O dia extra virou o PRIMEIRO ou o ÚLTIMO da lista?
                    // Nesse caso a refeição daquele dia depende do horário
                    // de chegada (ida) ou de partida (volta) — destaca o campo.
                    if (!primeiroDiaAtivo || newDate < primeiroDiaAtivo) setExtraDayEdge("primeiro");
                    else if (!ultimoDiaAtivo || newDate > ultimoDiaAtivo) setExtraDayEdge("ultimo");
                    else setExtraDayEdge(null);
                    setEditDayEntries(prev =>
                      [...prev, { date: newDate, valueCents: refVal, active: true, isWeekend: isWknd }]
                        .sort((a, b) => a.date.localeCompare(b.date))
                    );
                  }
                  setShowAddDay(false);
                }}
                onBlur={() => setShowAddDay(false)}
                onKeyDown={e => { if (e.key === "Escape") setShowAddDay(false); }}
              />
              <span className="text-2xs text-muted-foreground">Esc para cancelar</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddDay(true)}
              className="flex items-center gap-1.5 text-2xs font-semibold text-primary hover:text-primary-hover transition-colors py-0.5"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              Adicionar Dia Extra
            </button>
          )}
        </div>
      )}
      {/* Divergence bar */}
      {planned && Math.abs(diffDiarias) > 1 && (
        <div className={`px-4 py-1.5 text-center border-t border-border ${diffDiarias < 0 ? "bg-success-soft" : "bg-danger-soft"}`}>
          <span className={`text-2xs font-semibold tabular-nums ${diffDiarias < 0 ? "text-success" : "text-danger-strong"}`}>
            {diffDiarias > 0 ? "+" : "−"}{formatCurrency(Math.abs(diffDiarias))}
            {plannedSubDiarias > 0 && <span className="ml-1 opacity-70">({diffDiarias > 0 ? "+" : ""}{pctDiarias.toFixed(0)}%)</span>}
          </span>
        </div>
      )}
    </div>
  );
}

/** ── Mobilidade e Translado — somente leitura (definidos pelo RH) ── */
function MobilidadeBlock({ editingItem, editFormData, modalMobility }: Pick<CustosTabRealizadoProps, "editingItem" | "editFormData" | "modalMobility">) {
  return (
    <>
      <div
        className="rounded-xl border border-border overflow-hidden border-l-[3px] border-l-border bg-surface-muted"
        title="Este valor é definido pelo RH e não pode ser alterado nesta etapa"
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-slate-400 flex items-center justify-center">
              <Car className="w-3 h-3 text-white" aria-hidden="true" />
            </div>
            <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Mobilidade</span>
            <span className="text-2xs font-medium text-muted-foreground flex items-center gap-0.5">
              <Lock className="w-2.5 h-2.5" aria-hidden="true" />
              Definido pelo RH
            </span>
          </div>
          <span className="text-sm font-bold text-muted-foreground tabular-nums font-mono">{formatCurrency(modalMobility)}</span>
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Ida</span>
            </div>
            <span className="text-sm font-mono tabular-nums text-muted-foreground">{formatCurrency(editFormData.mobilityIda)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface-muted">
            <div className="flex items-center gap-2">
              <ArrowLeft className="w-3 h-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Volta</span>
            </div>
            <span className="text-sm font-mono tabular-nums text-muted-foreground">{formatCurrency(editFormData.mobilityVolta)}</span>
          </div>
        </div>
      </div>

      {/* ── Translado — somente leitura (entra no total gravado; sem esta
           linha o total do rodapé não fechava aos olhos do responsável) ── */}
      {editingItem.transport > 0 && (
        <div
          className="rounded-xl border border-border overflow-hidden border-l-[3px] border-l-border bg-surface-muted"
          title="Este valor é definido pelo RH e não pode ser alterado nesta etapa"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-slate-400 flex items-center justify-center">
                <Car className="w-3 h-3 text-white" aria-hidden="true" />
              </div>
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Translado</span>
              <span className="text-2xs font-medium text-muted-foreground flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                Definido pelo RH
              </span>
            </div>
            <span className="text-sm font-bold text-muted-foreground tabular-nums font-mono">{formatCurrency(editingItem.transport)}</span>
          </div>
        </div>
      )}
    </>
  );
}

const sourcePill = (src: TravelSource) => (
  <span
    className={`text-2xs px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
      src === "passagem" ? "bg-success-soft text-success"
      : src === "sugerido" ? "bg-warning-soft text-warning"
      : src === "manual" ? "bg-brand-soft text-primary"
      : "bg-muted text-muted-foreground"}`}
  >
    {TRAVEL_SOURCE_LABEL[src]}
  </span>
);

/** ── Viagem — horários que dirigem a alimentação ──
 *  Não são gravados no banco (não há coluna): vêm da passagem registrada ou do
 *  horário sugerido na escalação e podem ser corrigidos aqui porque, no
 *  Realizado, a viagem pode ter mudado. O que se persiste é o RESULTADO (os 4
 *  valores de alimentação). */
function ViagemBlock({ editor, isReadOnly, modalVoa }: Pick<CustosTabRealizadoProps, "editor" | "isReadOnly" | "modalVoa">) {
  const { editDayEntries, editTravel, travelSource, setTravelManual, extraDayEdge, setExtraDayEdge, chegadaInputRef, partidaInputRef } = editor;
  const sortedActiveDays = editDayEntries.filter(d => d.active).sort((a, b) => a.date.localeCompare(b.date));
  const primeiroDiaAtivo = sortedActiveDays[0]?.date ?? null;
  const ultimoDiaAtivo = sortedActiveDays[sortedActiveDays.length - 1]?.date ?? null;
  const horaCls = (edge: "primeiro" | "ultimo") => `h-8 w-[104px] text-xs font-mono tabular-nums rounded-md border px-2 text-slate-700 transition-colors
    focus:outline-none focus:border-info-strong focus:ring-2 focus:ring-info-strong/15
    ${isReadOnly ? "bg-surface-muted border-border opacity-50 cursor-not-allowed"
      : extraDayEdge === edge ? "bg-warning-soft border-warning-strong ring-2 ring-warning/40"
      : "bg-card border-border"}`;
  return (
    <div className="rounded-xl border border-border overflow-hidden border-l-[3px] border-l-info-strong bg-brand-soft">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-info/25 bg-info-strong/6">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-info-strong flex items-center justify-center">
            <Plane className="w-3 h-3 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-semibold text-info uppercase tracking-wide">Viagem</span>
        </div>
        <span className="text-2xs text-muted-foreground text-right">Define as refeições do 1º e do último dia</span>
      </div>

      {modalVoa ? (
        <div className="divide-y divide-border">
          {/* Chegada (ida) — vale no PRIMEIRO dia ativo */}
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ArrowRight className="w-3 h-3 text-info-strong flex-shrink-0" aria-hidden="true" />
              <span className="text-xs text-slate-600">
                Chegada (ida)
                {primeiroDiaAtivo && <span className="text-muted-foreground"> · {ddmm(primeiroDiaAtivo)}</span>}
              </span>
              <div className="flex-1" />
              {sourcePill(travelSource.chegada)}
              <input
                ref={chegadaInputRef}
                type="time"
                step={60}
                aria-label="Horário de chegada da ida"
                disabled={isReadOnly}
                value={editTravel.chegadaIda}
                onChange={e => {
                  const v = e.target.value;
                  setTravelManual(prev => ({ ...prev, chegadaIda: v }));
                  setExtraDayEdge(prev => prev === "primeiro" ? null : prev);
                }}
                className={horaCls("primeiro")}
              />
            </div>
            {extraDayEdge === "primeiro" && (
              <p className="mt-1.5 text-2xs font-semibold text-warning bg-warning-soft border border-warning/25 rounded-lg px-2 py-1">
                Este passou a ser o primeiro dia — confirme o horário de chegada.
              </p>
            )}
          </div>

          {/* Partida (volta) — vale no ÚLTIMO dia ativo */}
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ArrowLeft className="w-3 h-3 text-info-strong flex-shrink-0" aria-hidden="true" />
              <span className="text-xs text-slate-600">
                Partida (volta)
                {ultimoDiaAtivo && <span className="text-muted-foreground"> · {ddmm(ultimoDiaAtivo)}</span>}
              </span>
              <div className="flex-1" />
              {sourcePill(travelSource.partida)}
              <input
                ref={partidaInputRef}
                type="time"
                step={60}
                aria-label="Horário de partida da volta"
                disabled={isReadOnly}
                value={editTravel.partidaVolta}
                onChange={e => {
                  const v = e.target.value;
                  setTravelManual(prev => ({ ...prev, partidaVolta: v }));
                  setExtraDayEdge(prev => prev === "ultimo" ? null : prev);
                }}
                className={horaCls("ultimo")}
              />
            </div>
            {extraDayEdge === "ultimo" && (
              <p className="mt-1.5 text-2xs font-semibold text-warning bg-warning-soft border border-warning/25 rounded-lg px-2 py-1">
                Este passou a ser o último dia — confirme o horário de partida.
              </p>
            )}
          </div>

          <div className="px-4 py-1.5 bg-surface-muted/60">
            <p className="text-2xs text-muted-foreground leading-snug">
              Chegada até 11h paga almoço e até 19h paga jantar no primeiro dia; na volta,
              partida a partir das 13h paga almoço e a partir das 21h paga jantar.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 py-2.5">
          <p className="text-2xs text-muted-foreground">
            Jornada externa (não voa) — almoço e jantar em todos os dias trabalhados,
            sem depender de horário de viagem.
          </p>
        </div>
      )}
    </div>
  );
}

const ALIM_INPUT_CLS = (isReadOnly: boolean) => `text-right w-28 font-mono tabular-nums border rounded-md font-semibold
  focus:border-warning-strong focus:ring-2 focus:ring-warning-strong/15 focus:bg-card
  ${isReadOnly ? "bg-surface-muted border-border opacity-50 cursor-not-allowed" : "bg-card border-border cursor-text"} text-sm`;

/** ── Alimentação — calculada pela viagem, editável ── */
function AlimentacaoBlock(p: CustosTabRealizadoProps) {
  const { editor, editFormData, isReadOnly, totalAlimentacao, modalVoa, modalFuncaoLocal, semAlimentacao } = p;
  const { editDayEntries, editTravel, alimManual, alimStale, recalcAlimentacao, setAlimField } = editor;
  const activeDayEntries = editDayEntries.filter(d => d.active);
  const activeWeekdays = activeDayEntries.filter(d => !d.isWeekend).length;
  const activeWeekends = activeDayEntries.filter(d =>  d.isWeekend).length;
  const showAlimUtil = activeWeekdays > 0 || editFormData.weekdayLunch > 0 || editFormData.weekdayDinner > 0;
  const showAlimFds  = activeWeekends > 0 || editFormData.weekendLunch > 0 || editFormData.weekendDinner > 0;
  // Sem horário informado, calcAlimentacao assume dia cheio (não subpaga)
  const alimEstimada = modalVoa && !semAlimentacao && (!editTravel.chegadaIda || !editTravel.partidaVolta);

  const linha = (icon: React.ReactNode, label: string, sub: string, key: AlimField) => (
    <div className="flex items-center justify-between gap-2 px-4 py-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon}
        <span className="text-xs text-slate-600">{label} <span className="text-muted-foreground">({sub})</span></span>
      </div>
      <CurrencyInput
        value={editFormData[key]}
        onChange={v => setAlimField(key, v)}
        disabled={isReadOnly}
        className={ALIM_INPUT_CLS(isReadOnly)}
        style={{ height: 34 }}
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-border overflow-hidden border-l-[3px] border-l-warning-strong bg-warning-soft">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-warning/25 bg-warning-strong/6">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-warning-strong flex items-center justify-center">
            <Utensils className="w-3 h-3 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-semibold text-warning uppercase tracking-wide">Alimentação</span>
          {alimManual && (
            <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-brand-soft text-primary whitespace-nowrap">
              ajustado manualmente
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isReadOnly && !semAlimentacao && (
            <button
              type="button"
              onClick={recalcAlimentacao}
              className="flex items-center gap-1 text-2xs font-semibold text-warning hover:text-warning bg-card border border-warning/25 rounded-lg px-2 py-1 transition-colors hover:bg-warning-soft"
              title="Recalcula almoço e jantar pelos dias ativos e pelos horários de chegada/partida"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              Recalcular pela viagem
            </button>
          )}
          <span className="text-sm font-bold text-warning tabular-nums font-mono">{formatCurrency(totalAlimentacao)}</span>
        </div>
      </div>

      {/* Avisos */}
      {alimStale && !isReadOnly && (
        <div className="px-4 py-2 bg-warning-soft border-b border-warning/25 flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-warning-strong flex-shrink-0" aria-hidden="true" />
          <span className="text-2xs text-warning flex-1 min-w-0">
            Os dias ou horários mudaram depois do seu ajuste — os valores não foram recalculados.
          </span>
          <button
            type="button"
            onClick={recalcAlimentacao}
            className="text-2xs font-semibold text-warning underline underline-offset-2 hover:text-warning"
          >
            Recalcular pela viagem
          </button>
        </div>
      )}
      {semAlimentacao && (
        <div className="px-4 py-2 bg-surface-muted border-b border-border">
          <p className="text-2xs text-muted-foreground">
            {modalFuncaoLocal ? FUNCAO_LOCAL_RAZAO : "Percurso — alimentação já incluída no pacote fechado."}
          </p>
        </div>
      )}
      {!semAlimentacao && alimEstimada && !alimManual && (
        <div className="px-4 py-2 bg-warning-soft/60 border-b border-warning/25">
          <p className="text-2xs text-warning">
            Sem horário de {!editTravel.chegadaIda && !editTravel.partidaVolta ? "chegada e partida" : !editTravel.chegadaIda ? "chegada" : "partida"} —
            o dia foi assumido cheio. Informe o horário acima para o cálculo exato.
          </p>
        </div>
      )}

      <div className="divide-y divide-border">
        {!showAlimUtil && !showAlimFds && (
          <div className="px-4 py-4 text-center text-2xs text-muted-foreground">
            Nenhuma refeição prevista para os dias ativos.
          </div>
        )}
        {showAlimUtil && (
          <>
            {linha(<Sun className="w-3 h-3 text-warning-strong flex-shrink-0" aria-hidden="true" />, "Almoço", `dias úteis · ${activeWeekdays}`, "weekdayLunch")}
            {linha(<Moon className="w-3 h-3 text-primary/70 flex-shrink-0" aria-hidden="true" />, "Jantar", `dias úteis · ${activeWeekdays}`, "weekdayDinner")}
          </>
        )}
        {showAlimFds && (
          <>
            {linha(<Sun className="w-3 h-3 text-warning-soft flex-shrink-0" aria-hidden="true" />, "Almoço", `fins de semana · ${activeWeekends}`, "weekendLunch")}
            {linha(<Moon className="w-3 h-3 text-primary/70 flex-shrink-0" aria-hidden="true" />, "Jantar", `fins de semana · ${activeWeekends}`, "weekendDinner")}
          </>
        )}
      </div>
    </div>
  );
}

export function EditActualCustosTab(p: CustosTabRealizadoProps) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-4 bg-surface-muted" style={{ maxHeight: "52vh" }}>
      <DiariasBlock {...p} />
      <MobilidadeBlock editingItem={p.editingItem} editFormData={p.editFormData} modalMobility={p.modalMobility} />
      {!p.semAlimentacao && <ViagemBlock editor={p.editor} isReadOnly={p.isReadOnly} modalVoa={p.modalVoa} />}
      <AlimentacaoBlock {...p} />
    </div>
  );
}

export default EditActualCustosTab;
