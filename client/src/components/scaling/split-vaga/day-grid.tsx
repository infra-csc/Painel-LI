/**
 * Passo 1 · Dias do novo colaborador (25/09 — extraído de split-vaga-modal.tsx):
 * legenda, grade de até 7 colunas, barra de resumo e aviso de dias já atribuídos.
 */
import { Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { isWeekend, formatDay } from "./split-shared";
import type { SplitState } from "./use-split-state";

export function DayGrid({ s, takenDays }: { s: SplitState; takenDays: string[] }) {
  const { availableDays, selectedDays, setSelectedDays, takenSet, parentWorkedDays, toggleDay, selWeekdays, selWeekends } = s;
  if (availableDays.length === 0) return null;
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider m-0">
          Selecione os dias do novo colaborador
        </p>
        {selectedDays.size > 0 && (
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-primary bg-brand-soft border border-primary/25 px-2 py-0.5 rounded-full">
            <Check className="w-3 h-3" aria-hidden="true" />
            {selectedDays.size} {selectedDays.size === 1 ? 'dia' : 'dias'} selecionado{selectedDays.size !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-primary bg-brand-soft" />
          <span className="text-2xs text-muted-foreground">Selecionado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border border-warning/25 bg-warning-soft" />
          <span className="text-2xs text-muted-foreground">Fim de semana</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border border-border bg-muted opacity-60" />
          <span className="text-2xs text-muted-foreground">Já atribuído</span>
        </div>
      </div>

      {/* Calendar grid — 7 cols (Mon–Sun) or auto if ≤7 days */}
      <div
        className="grid gap-2"
        style={{gridTemplateColumns: `repeat(${Math.min(availableDays.length, 7)}, minmax(0, 1fr))`}}
      >
        {availableDays.map(day => {
          const isSel = selectedDays.has(day);
          const isTaken = takenSet.has(day);
          const notParent = !parentWorkedDays.includes(day);
          const wknd = isWeekend(day);
          const dt = new Date(day + 'T12:00:00');
          const dayNum = dt.getDate();
          const wdShort = dt.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.','').toUpperCase().slice(0,3);
          const moShort = dt.toLocaleDateString('pt-BR', {month: 'short'}).replace('.','').toUpperCase().slice(0,3);

          let cardBg = 'var(--surface-muted)', cardBorder = 'var(--border)';
          let dayColor = 'var(--foreground)', wdColor = 'var(--muted-foreground)';
          if (isTaken) {
            cardBg = 'var(--muted)'; cardBorder = 'var(--border)';
            dayColor = 'var(--muted-foreground)'; wdColor = 'var(--muted-foreground)';
          } else if (isSel && wknd) {
            cardBg = 'var(--warning-soft)'; cardBorder = 'var(--warning-strong)';
            dayColor = 'var(--warning)'; wdColor = 'var(--warning-strong)';
          } else if (isSel) {
            cardBg = 'var(--brand-soft)'; cardBorder = 'var(--primary-hover)';
            dayColor = 'var(--primary)'; wdColor = 'var(--primary)';
          } else if (wknd) {
            cardBg = 'var(--warning-soft)'; cardBorder = 'var(--warning-strong)';
            dayColor = 'var(--warning)'; wdColor = 'var(--warning)';
          }

          return (
            // `key` no elemento de fora da lista (antes estava no botão interno, o que gerava aviso do React sem mudar nada na tela)
            <MotivoDesabilitado key={day} motivo={isTaken ? "Dia já atribuído a outro colaborador desta divisão" : notParent ? "Este dia está fora do período original" : undefined} desabilitado={isTaken}>
              <button
              onClick={() => toggleDay(day)}
              disabled={isTaken}
              aria-pressed={isSel}
              aria-label={`${formatDay(day)}${isTaken ? ' — já atribuído' : isSel ? ' — selecionado' : ''}`}
              className={cn("flex flex-col items-center rounded-xl py-2.5 px-1 transition-all relative", (isTaken ? "cursor-not-allowed" : "cursor-pointer"), (isTaken ? "opacity-50" : "opacity-100"), (isSel && !isTaken ? "shadow-1" : "shadow-none"))}
              style={{
                border: `1.5px solid ${cardBorder}`,
                background: cardBg,
              }}
            >
              {/* Weekday */}
              <span className="text-2xs font-semibold uppercase tracking-[0.06em]" style={{ color: wdColor, lineHeight: '13px' }}>
                {wdShort}
              </span>
              {/* Day number */}
              <span className={cn("text-lg font-semibold leading-6", (isTaken ? "line-through" : "no-underline"))} style={{ color: dayColor }}>
                {dayNum}
              </span>
              {/* Month */}
              <span className={cn("text-2xs", (isTaken ? "text-muted-foreground" : "text-muted-foreground"))} style={{ lineHeight: '13px' }}>
                {moShort}
              </span>
              {/* Check badge */}
              {isSel && !isTaken && (
                <div className={cn("absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center", (wknd ? "bg-warning-strong" : "bg-primary-hover"))}>
                  <Check className="text-white" style={{ width: 8, height: 8 }} aria-hidden="true" />
                </div>
              )}
              {/* Out-of-parent warning */}
              {notParent && !isSel && !isTaken && (
                <div className="absolute top-0.5 right-0.5 text-warning-strong text-2xs">⚠</div>
              )}
            </button>
            </MotivoDesabilitado>
          );
        })}
      </div>

      {/* Summary bar */}
      {selectedDays.size > 0 && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary-hover" />
          <p className="text-xs text-slate-600 m-0 flex-1">
            <strong className="text-slate-700">{selectedDays.size}</strong> {selectedDays.size === 1 ? 'dia selecionado' : 'dias selecionados'}
            {selWeekdays > 0 && <span className="text-primary"> · {selWeekdays} {selWeekdays === 1 ? 'útil' : 'úteis'}</span>}
            {selWeekends > 0 && <span className="text-warning"> · {selWeekends} fim{selWeekends > 1 ? 's' : ''} de sem.</span>}
          </p>
          <button
            className="text-2xs text-muted-foreground hover:text-danger-strong transition-colors border-0 bg-transparent cursor-pointer px-0"
            onClick={() => setSelectedDays(new Set())}
          >
            Limpar
          </button>
        </div>
      )}
      {takenDays.length > 0 && (
        <div className="flex gap-2 items-start mt-2 px-3 py-2 rounded-lg bg-surface-muted border border-border">
          <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-2xs text-muted-foreground m-0">Dias acinzentados já estão atribuídos a outro colaborador desta divisão.</p>
        </div>
      )}
    </div>
  );
}
