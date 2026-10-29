/**
 * Passo 2 do "Dividir escalação" (25/09 — extraído de split-vaga-modal.tsx):
 * cabeçalho do novo colaborador, período, cartões de valores, aviso de titular
 * zerado e rodapé com o comparativo Base × Realizado × Diferença.
 *
 * 29/10: o cartão de Alimentação ficava escondido atrás do rodapé no notebook
 * (1366×900) sem indício de rolagem. Agora: período e tipo no cabeçalho, duas
 * colunas em telas largas (Diárias + Mobilidade | Alimentação) e a composição
 * do Realizado (Diárias + Mobilidade + Alimentação) sempre visível no rodapé.
 */
import { AlertTriangle, Calendar, TrendingUp, TrendingDown, ArrowLeft, CheckCheck } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { fmtR$, formatDate, initials, capitalizeName } from "./split-shared";
import { DiariasCard, MobilidadeCard, AlimentacaoCard } from "./valores-cards";
import type { SplitState } from "./use-split-state";

function DiasBadges({ s }: { s: SplitState }) {
  const { selWeekdays, selWeekends, selectedDays } = s;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {selWeekdays > 0 && (
        <span className="text-2xs bg-card/15 text-white px-2 py-0.5 rounded-full font-medium">
          {selWeekdays} {selWeekdays === 1 ? 'dia útil' : 'dias úteis'}
        </span>
      )}
      {selWeekends > 0 && (
        <span className="text-2xs bg-warning-strong/30 text-warning-soft px-2 py-0.5 rounded-full font-medium">
          {selWeekends} fim{selWeekends > 1 ? 's' : ''} de semana
        </span>
      )}
      <span className="text-2xs bg-card/10 text-white/80 px-2 py-0.5 rounded-full font-medium">
        {selectedDays.size} {selectedDays.size === 1 ? 'dia' : 'dias'} total
      </span>
    </div>
  );
}

/** Leva o cartão para a vista (e foca o 1º campo) — usado pela composição do rodapé. */
function irParaCartao(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  el.querySelector<HTMLInputElement>("input:not([disabled])")?.focus({ preventScroll: true });
}

/**
 * Composição do Realizado sempre à vista no rodapé (29/10): no notebook o
 * cartão de Alimentação ficava escondido atrás do rodapé sem nenhum indício.
 * Cada parte leva ao cartão dela.
 */
function ComposicaoDoRealizado({ s }: { s: SplitState }) {
  const { s2SubDiarias, s2TotalAlim, step2Form } = s;
  const partes = [
    { id: "split-card-diarias", rotulo: "Diárias", valor: s2SubDiarias },
    { id: "split-card-mobilidade", rotulo: "Mobilidade", valor: step2Form.mobility },
    { id: "split-card-alimentacao", rotulo: "Alimentação", valor: s2TotalAlim },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-3 py-2 border-t border-border bg-surface-muted/60 text-2xs text-muted-foreground" data-testid="split-composicao">
      {partes.map((p, i) => (
        <span key={p.id} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">+</span>}
          <button
            type="button"
            onClick={() => irParaCartao(p.id)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-transparent border-0 cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${p.rotulo}: ${fmtR$(p.valor)} — ir para o cartão`}
          >
            <span>{p.rotulo}</span>
            <span className="font-semibold text-foreground tabular-nums">{fmtR$(p.valor)}</span>
          </button>
        </span>
      ))}
    </div>
  );
}

function ResumoValores({ s }: { s: SplitState }) {
  const { proportionalPlanned, proportionalPlannedBreakdown, s2Realizado, s2Difference } = s;
  return (
    <div className="rounded-xl border border-border shadow-1 overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-border">
        {/* Base honesta: os valores vêm do BudgetActual do titular (realizado),
            não do planejado do RH — o rótulo antigo "Planejado prop." mentia */}
        <div
          className="px-3 py-3 text-center"
          title={`Proporcional calculado sobre o realizado do titular, não sobre o planejado do DP${proportionalPlannedBreakdown ? ` — ${proportionalPlannedBreakdown}` : ''}`}
        >
          <div className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest mb-1">Base do titular<span className="hidden sm:inline"> (realizado)</span></div>
          <div className="text-sm font-bold text-slate-600 tabular-nums">{fmtR$(proportionalPlanned)}</div>
        </div>
        <div className="px-4 py-3 text-center bg-brand-soft/60">
          <div className="text-2xs uppercase text-primary font-semibold tracking-widest mb-1">Realizado</div>
          <div className="text-sm font-bold text-primary tabular-nums">{fmtR$(s2Realizado)}</div>
        </div>
        <div className={`px-4 py-3 text-center ${Math.abs(s2Difference) <= 1 ? 'bg-surface-muted/60' : s2Difference < 0 ? 'bg-success-soft/60' : 'bg-danger-soft/60'}`}>
          <div className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest mb-1">Diferença</div>
          {Math.abs(s2Difference) <= 1 ? (
            <div className="text-sm font-bold text-muted-foreground tabular-nums">—</div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              {s2Difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" /> : <TrendingUp className="w-3.5 h-3.5 text-danger-strong" aria-hidden="true" />}
              <span className={`text-sm font-bold tabular-nums ${s2Difference < 0 ? 'text-success' : 'text-danger'}`}>
                {s2Difference > 0 ? '+' : '−'}{fmtR$(Math.abs(s2Difference))}
              </span>
            </div>
          )}
        </div>
      </div>
      <ComposicaoDoRealizado s={s} />
    </div>
  );
}

const NOME_DO_TIPO: Record<string, string> = { casa: "Casa", freela: "Freela", local: "Local" };

export function StepValues({ s, selectedCollab, isPending }: { s: SplitState; selectedCollab: Collaborator; isPending?: boolean }) {
  const { selDaysSorted, remainingForParent, setStep, attemptConfirm } = s;
  const collabName = selectedCollab.fullName || "";
  const tipo = NOME_DO_TIPO[selectedCollab.type] ?? null;
  const firstDay = selDaysSorted[0];
  const lastDay = selDaysSorted[selDaysSorted.length - 1];
  return (
    <>
      {/* Collaborator header */}
      {/* 29/10: o período (antes num cartão próprio) e o tipo do colaborador
          vêm aqui — o corpo ganha altura para os três cartões. */}
      <div className="px-5 py-3 flex-shrink-0 bg-primary-hover">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-card/20 border border-white/30 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">{initials(collabName)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-bold text-white truncate leading-tight m-0">{capitalizeName(collabName)}</h2>
              {tipo && (
                <span className="text-2xs font-semibold bg-card/15 text-white border border-white/30 px-2 py-0.5 rounded-full flex-shrink-0" data-testid="split-tipo-do-novo">
                  {tipo}
                </span>
              )}
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">
              {firstDay && (
                <span className="inline-flex items-center gap-1 text-2xs text-primary-foreground/90 tabular-nums">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  {firstDay === lastDay ? formatDate(firstDay) : `${formatDate(firstDay)} → ${formatDate(lastDay)}`}
                </span>
              )}
              <DiasBadges s={s} />
            </div>
          </div>
        </div>
      </div>

      {/* Body — a partir de 768px, duas colunas: Diárias + Mobilidade | Alimentação */}
      <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 bg-surface-muted" data-testid="split-passo2-corpo">
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <div className="space-y-4 min-w-0">
            <DiariasCard s={s} />
            <MobilidadeCard s={s} />
          </div>
          <div className="min-w-0">
            <AlimentacaoCard s={s} />
          </div>
        </div>

        {remainingForParent.length === 0 && (
          <div className="mt-4 flex gap-2 px-3.5 py-3 rounded-xl bg-danger-soft border border-danger/25 items-start">
            <AlertTriangle className="w-3.5 h-3.5 text-danger-strong flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-danger m-0">
              O colaborador original ficará <strong>sem dias atribuídos</strong>. Ao confirmar, o registro original ficará zerado.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-card border-t border-border flex-shrink-0 px-4 sm:px-6 py-3 space-y-3">
        <ResumoValores s={s} />
        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="h-9 px-4 text-sm text-muted-foreground hover:text-slate-700 rounded-xl flex items-center gap-2" onClick={() => setStep(1)} disabled={isPending}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar
          </Button>
          <Button
            onClick={attemptConfirm}
            disabled={isPending}
            className="h-9 px-5 text-sm rounded-xl text-white font-medium shadow-2 flex items-center gap-2 bg-primary-hover"
          >
            <CheckCheck className="w-4 h-4" aria-hidden="true" />
            {isPending ? 'Confirmando…' : 'Confirmar divisão'}
          </Button>
        </div>
      </div>
    </>
  );
}
