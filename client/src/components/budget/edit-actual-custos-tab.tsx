/**
 * Aba "Custos" do modal do Realizado — 25/09 (modularização); redesenho 08/10.
 *
 * Quatro blocos: Diárias (grade de dias + dia extra), Mobilidade/Translado
 * (somente leitura), Viagem (horários que dirigem a alimentação — não
 * persistidos) e Alimentação (recalculada pela viagem, editável). O estado
 * vem de `useBudgetActualEditor`.
 *
 * 08/10: blocos brancos com o cabeçalho da família (o mesmo do modal do
 * Planejado: ícone na cor do bloco e o total à direita) no lugar das faixas
 * coloridas; campos com borda e anel de foco; o dia vira uma linha com caixa
 * de "trabalhou", data, planejado e realizado alinhados em colunas; a
 * diferença das diárias por extenso. Mesmos campos, mesmas regras.
 */
import { AlertTriangle, ArrowLeft, ArrowRight, Calendar, Car, Lock, Moon, Plane, Plus, RefreshCw, Sun, Utensils } from "lucide-react";
import { CurrencyInput } from "@/components/common/currency-input";
import { Checkbox } from "@/components/ui/checkbox";
import { FUNCAO_LOCAL_RAZAO } from "@shared/calculation-rules";
import type { BudgetActual, BudgetPlanned } from "@shared/schema";
import type { EditorDoRealizado } from "@/hooks/use-budget-actual-editor";
import { cn } from "@/lib/utils";
import { isWeekendDate, TRAVEL_SOURCE_LABEL, type AlimField, type EditFormBase, type TravelSource } from "./actual-utils";
import { CabecalhoDoBloco, inputCls } from "./edit-modal-custos-tab";
import { formatCurrency } from "./types";

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

/** Bloco branco da família. */
const BLOCO = "bg-card rounded-xl border border-border overflow-hidden";

/** ── Diárias — editável (grade por dia + dia extra + diferença) ── */
function DiariasBlock(p: CustosTabRealizadoProps) {
  const { editor, isReadOnly, planned, plannedValorUtil, plannedValorFds, plannedSubDiarias, subtotalDiariasRaw } = p;
  const { editDayEntries, setEditDayEntries, showAddDay, setShowAddDay, setExtraDayEdge } = editor;
  const activeDayEntries = editDayEntries.filter(d => d.active);
  const sortedActiveDays = [...activeDayEntries].sort((a, b) => a.date.localeCompare(b.date));
  const primeiroDiaAtivo = sortedActiveDays[0]?.date ?? null;
  const ultimoDiaAtivo = sortedActiveDays[sortedActiveDays.length - 1]?.date ?? null;
  const diffDiarias = subtotalDiariasRaw - plannedSubDiarias;
  const pctDiarias = plannedSubDiarias > 0 ? ((subtotalDiariasRaw - plannedSubDiarias) / plannedSubDiarias * 100) : 0;
  const sub = editDayEntries.length > 0
    ? `${activeDayEntries.length} de ${editDayEntries.length} ${editDayEntries.length === 1 ? "dia trabalhado" : "dias trabalhados"}`
    : undefined;
  return (
    <div className={BLOCO}>
      <CabecalhoDoBloco icone={Calendar} cor="text-primary" titulo="Diárias" sub={sub} total={subtotalDiariasRaw} />
      {/* Colunas: trabalhou · dia · planejado · realizado */}
      <div className="rea-dia grid items-center gap-x-3 px-4 py-1.5 bg-surface-muted/70 border-b border-border text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <span><span className="sr-only">Trabalhou</span></span>
        <span>Dia</span>
        <span className="text-right">{planned ? "Planejado" : ""}</span>
        <span className="text-right pr-1">Realizado</span>
      </div>
      <div className="divide-y divide-border">
        {editDayEntries.length === 0 && (
          <p className="m-0 px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma data no período da escalação.</p>
        )}
        {editDayEntries.map((entry, idx) => {
          const date = new Date(entry.date + "T00:00:00");
          const dayLabel = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
          const dateLabel = ddmm(entry.date);
          const plannedVal = entry.isWeekend ? plannedValorFds : plannedValorUtil;
          const isChanged = planned && plannedVal > 0 && entry.active && entry.valueCents !== plannedVal;
          return (
            <div key={entry.date} className={cn("rea-dia grid items-center gap-x-3 px-4 py-1.5 transition-colors", !entry.active && "bg-surface-muted/60")}>
              <Checkbox
                checked={entry.active}
                disabled={isReadOnly}
                onCheckedChange={() => setEditDayEntries(prev => prev.map((x, i) => i === idx ? { ...x, active: !x.active } : x))}
                aria-label={`Dia ${dateLabel} trabalhado`}
                className="pas-alvo"
              />
              <div className={cn("flex items-center gap-1.5 min-w-0", !entry.active && "opacity-55")}>
                <span className={cn("text-sm font-medium tabular-nums text-foreground", !entry.active && "line-through decoration-muted-foreground/60")}>{dateLabel}</span>
                <span className="text-xs text-muted-foreground capitalize">{dayLabel}</span>
                {entry.isWeekend && <span className="inline-flex items-center h-[18px] px-1.5 rounded-md bg-warning-soft text-warning text-2xs font-medium">fds</span>}
                {!entry.active && <span className="text-2xs text-muted-foreground">não trabalhou</span>}
              </div>
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {planned && plannedVal > 0 ? formatCurrency(plannedVal) : <span aria-hidden="true">—</span>}
              </span>
              <CurrencyInput
                semEstilo
                value={entry.valueCents}
                onChange={v => setEditDayEntries(prev => prev.map((x, i) => i === idx ? { ...x, valueCents: v } : x))}
                disabled={!entry.active || isReadOnly}
                aria-label={`Diária realizada em ${dateLabel}`}
                className={cn(inputCls, isChanged && "border-warning/60 bg-warning-soft/40")}
              />
            </div>
          );
        })}
      </div>
      {/* Dia extra */}
      {!isReadOnly && (
        <div className="px-4 py-2 border-t border-border">
          {showAddDay ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-600" htmlFor="rea-dia-extra">Dia extra</label>
              <input
                id="rea-dia-extra"
                type="date"
                autoFocus
                className="h-9 text-sm tabular-nums rounded-lg border border-primary/60 px-2.5 text-foreground bg-card outline-none focus:ring-[3px] focus:ring-primary/12"
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
                onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setShowAddDay(false); } }}
              />
              <span className="text-2xs text-muted-foreground">Esc para cancelar</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddDay(true)}
              className="pas-alvo inline-flex items-center gap-1.5 h-8 px-2 -ml-2 rounded-lg text-xs font-medium text-primary hover:bg-brand-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Adicionar dia extra
            </button>
          )}
        </div>
      )}
      {/* Diferença das diárias para o planejado */}
      {planned && Math.abs(diffDiarias) > 1 && (
        <div className={cn("flex items-center justify-between gap-3 px-4 py-2 border-t border-border text-xs", diffDiarias < 0 ? "bg-success-soft/60" : "bg-danger-soft/60")}>
          <span className="text-slate-600">{diffDiarias > 0 ? "Acima do planejado" : "Abaixo do planejado"} nas diárias</span>
          <span className={cn("font-semibold tabular-nums", diffDiarias < 0 ? "text-success" : "text-danger")}>
            {diffDiarias > 0 ? "+" : "−"}{formatCurrency(Math.abs(diffDiarias))}
            {plannedSubDiarias > 0 && <span className="ml-1 font-normal opacity-80">({diffDiarias > 0 ? "+" : ""}{pctDiarias.toFixed(0)}%)</span>}
          </span>
        </div>
      )}
    </div>
  );
}

/** Rótulo "definido pelo RH" dos blocos que não se editam aqui. */
const DefinidoPeloRh = (
  <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden="true" />definido pelo RH</span>
);

/** ── Mobilidade e Translado — somente leitura (definidos pelo RH) ── */
function MobilidadeBlock({ editingItem, editFormData, modalMobility }: Pick<CustosTabRealizadoProps, "editingItem" | "editFormData" | "modalMobility">) {
  return (
    <>
      <div className={BLOCO} title="Este valor é definido pelo RH e não pode ser alterado nesta etapa">
        <CabecalhoDoBloco icone={Car} cor="text-slate-500" titulo="Mobilidade" sub={DefinidoPeloRh} total={modalMobility} />
        <dl className="m-0 grid grid-cols-2 divide-x divide-border">
          <div className="px-4 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowRight className="w-3 h-3" aria-hidden="true" />Ida</dt>
            <dd className="m-0 mt-0.5 text-sm font-medium tabular-nums text-slate-700">{formatCurrency(editFormData.mobilityIda)}</dd>
          </div>
          <div className="px-4 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowLeft className="w-3 h-3" aria-hidden="true" />Volta</dt>
            <dd className="m-0 mt-0.5 text-sm font-medium tabular-nums text-slate-700">{formatCurrency(editFormData.mobilityVolta)}</dd>
          </div>
        </dl>
      </div>

      {/* ── Translado — somente leitura (entra no total gravado; sem esta
           linha o total do rodapé não fechava aos olhos do responsável) ── */}
      {editingItem.transport > 0 && (
        <div className={BLOCO} title="Este valor é definido pelo RH e não pode ser alterado nesta etapa">
          <div className="[&>div]:border-b-0">
            <CabecalhoDoBloco icone={Car} cor="text-slate-500" titulo="Translado" sub={DefinidoPeloRh} total={editingItem.transport} />
          </div>
        </div>
      )}
    </>
  );
}

const sourcePill = (src: TravelSource) => (
  <span
    className={cn("inline-flex items-center h-5 px-1.5 rounded-md text-2xs font-medium whitespace-nowrap",
      src === "passagem" ? "bg-success-soft text-success"
      : src === "sugerido" ? "bg-warning-soft text-warning"
      : src === "manual" ? "bg-brand-soft text-primary"
      : "bg-muted text-muted-foreground")}
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
  const horaCls = (edge: "primeiro" | "ultimo") => cn(
    "h-9 w-[112px] px-2.5 text-sm tabular-nums rounded-lg border bg-card text-foreground outline-none transition-[border-color,box-shadow]",
    "focus:border-primary focus:ring-[3px] focus:ring-primary/12 disabled:bg-muted disabled:text-muted-foreground",
    extraDayEdge === edge && !isReadOnly ? "border-warning-strong ring-[3px] ring-warning/30" : "border-border",
  );
  const linha = (
    icone: React.ReactNode, rotulo: string, dia: string | null, src: TravelSource, edge: "primeiro" | "ultimo",
    ref: React.RefObject<HTMLInputElement>, valor: string, aria: string, onChange: (v: string) => void, aviso: string,
  ) => (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {icone}
        <span className="text-xs font-medium text-slate-700">
          {rotulo}
          {dia && <span className="font-normal text-muted-foreground tabular-nums"> · {ddmm(dia)}</span>}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {sourcePill(src)}
          <input ref={ref} type="time" step={60} aria-label={aria} disabled={isReadOnly} value={valor} onChange={e => onChange(e.target.value)} className={horaCls(edge)} />
        </span>
      </div>
      {extraDayEdge === edge && (
        <p className="pas-entra m-0 mt-1.5 text-xs font-medium text-warning">{aviso}</p>
      )}
    </div>
  );
  return (
    <div className={BLOCO}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
        <h3 className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs font-semibold uppercase tracking-[0.06em] text-slate-600">
          <Plane className="w-3.5 h-3.5 text-info" aria-hidden="true" />
          Viagem
          <span className="normal-case tracking-normal font-normal text-muted-foreground">define as refeições do 1º e do último dia</span>
        </h3>
      </div>

      {modalVoa ? (
        <div className="divide-y divide-border">
          {/* Chegada (ida) — vale no PRIMEIRO dia ativo */}
          {linha(<ArrowRight className="w-3.5 h-3.5 text-info shrink-0" aria-hidden="true" />, "Chegada (ida)", primeiroDiaAtivo, travelSource.chegada, "primeiro",
            chegadaInputRef, editTravel.chegadaIda, "Horário de chegada da ida",
            v => { setTravelManual(prev => ({ ...prev, chegadaIda: v })); setExtraDayEdge(prev => prev === "primeiro" ? null : prev); },
            "Este passou a ser o primeiro dia — confirme o horário de chegada.")}
          {/* Partida (volta) — vale no ÚLTIMO dia ativo */}
          {linha(<ArrowLeft className="w-3.5 h-3.5 text-info shrink-0" aria-hidden="true" />, "Partida (volta)", ultimoDiaAtivo, travelSource.partida, "ultimo",
            partidaInputRef, editTravel.partidaVolta, "Horário de partida da volta",
            v => { setTravelManual(prev => ({ ...prev, partidaVolta: v })); setExtraDayEdge(prev => prev === "ultimo" ? null : prev); },
            "Este passou a ser o último dia — confirme o horário de partida.")}
          <p className="m-0 px-4 py-2 bg-surface-muted/70 text-2xs leading-4 text-muted-foreground">
            Chegada até 11h paga almoço e até 19h paga jantar no primeiro dia; na volta,
            partida a partir das 13h paga almoço e a partir das 21h paga jantar.
          </p>
        </div>
      ) : (
        <p className="m-0 px-4 py-2.5 text-xs text-muted-foreground">
          Jornada externa (não voa) — almoço e jantar em todos os dias trabalhados,
          sem depender de horário de viagem.
        </p>
      )}
    </div>
  );
}

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
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <span className="flex items-center gap-1.5 min-w-0 text-xs text-slate-700">
        {icon}
        {label} <span className="text-muted-foreground tabular-nums">{sub}</span>
      </span>
      <CurrencyInput
        semEstilo
        value={editFormData[key]}
        onChange={v => setAlimField(key, v)}
        disabled={isReadOnly}
        aria-label={`${label} — ${sub} (R$)`}
        className={inputCls}
      />
    </div>
  );

  return (
    <div className={BLOCO}>
      <CabecalhoDoBloco
        icone={Utensils}
        cor="text-warning"
        titulo="Alimentação"
        sub={alimManual ? <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-brand-soft text-primary text-2xs font-medium">ajustada à mão</span> : undefined}
        total={totalAlimentacao}
        extra={!isReadOnly && !semAlimentacao ? (
          <button
            type="button"
            onClick={recalcAlimentacao}
            className="pas-alvo inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Recalcula almoço e jantar pelos dias trabalhados e pelos horários de chegada/partida"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="max-sm:hidden">Recalcular pela viagem</span><span className="sm:hidden">Recalcular</span>
          </button>
        ) : undefined}
      />

      {/* Avisos */}
      {alimStale && !isReadOnly && (
        <div className="pas-entra flex flex-wrap items-center gap-2 px-4 py-2 bg-warning-soft border-b border-warning/25">
          <AlertTriangle className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />
          <span className="text-xs text-warning flex-1 min-w-0">
            Os dias ou horários mudaram depois do seu ajuste — os valores não foram recalculados.
          </span>
          <button
            type="button"
            onClick={recalcAlimentacao}
            className="text-xs font-semibold text-warning underline underline-offset-2 hover:no-underline"
          >
            Recalcular pela viagem
          </button>
        </div>
      )}
      {semAlimentacao && (
        <p className="m-0 px-4 py-2 bg-surface-muted/70 border-b border-border text-xs text-muted-foreground">
          {modalFuncaoLocal ? FUNCAO_LOCAL_RAZAO : "Percurso — alimentação já incluída no pacote fechado."}
        </p>
      )}
      {!semAlimentacao && alimEstimada && !alimManual && (
        <p className="m-0 px-4 py-2 bg-warning-soft/60 border-b border-warning/25 text-xs text-warning">
          Sem horário de {!editTravel.chegadaIda && !editTravel.partidaVolta ? "chegada e partida" : !editTravel.chegadaIda ? "chegada" : "partida"} —
          o dia foi assumido cheio. Informe o horário acima para o cálculo exato.
        </p>
      )}

      <div className="divide-y divide-border">
        {!showAlimUtil && !showAlimFds && (
          <p className="m-0 px-4 py-4 text-center text-xs text-muted-foreground">Nenhuma refeição prevista para os dias trabalhados.</p>
        )}
        {showAlimUtil && (
          <>
            {linha(<Sun className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />, "Almoço", `dias úteis · ${activeWeekdays}`, "weekdayLunch")}
            {linha(<Moon className="w-3.5 h-3.5 text-primary/70 shrink-0" aria-hidden="true" />, "Jantar", `dias úteis · ${activeWeekdays}`, "weekdayDinner")}
          </>
        )}
        {showAlimFds && (
          <>
            {linha(<Sun className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />, "Almoço", `fins de semana · ${activeWeekends}`, "weekendLunch")}
            {linha(<Moon className="w-3.5 h-3.5 text-primary/70 shrink-0" aria-hidden="true" />, "Jantar", `fins de semana · ${activeWeekends}`, "weekendDinner")}
          </>
        )}
      </div>
    </div>
  );
}

export function EditActualCustosTab(p: CustosTabRealizadoProps) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
      <div className={cn("px-4 sm:px-6 py-4 space-y-3", p.isReadOnly && "select-none")}>
        <DiariasBlock {...p} />
        <MobilidadeBlock editingItem={p.editingItem} editFormData={p.editFormData} modalMobility={p.modalMobility} />
        {!p.semAlimentacao && <ViagemBlock editor={p.editor} isReadOnly={p.isReadOnly} modalVoa={p.modalVoa} />}
        <AlimentacaoBlock {...p} />
      </div>
    </div>
  );
}

export default EditActualCustosTab;
