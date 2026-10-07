// Bloco "Datas sugeridas" — usado no Resumo, na visualização e no formulário
// do modal (antes eram três cópias). Opcionalmente oferece "Usar sugestão".
//
// 07/10: sem emoji e sem cartão dentro de cartão — uma moldura só, ida e
// volta lado a lado com o mesmo desenho das pernas da passagem comprada. A cor
// é a âmbar das sugestões na lista ("sugerido, ainda não confirmado").
import { PlaneTakeoff, PlaneLanding, Wand2, Lightbulb } from "lucide-react";
import {
  formatSuggestionDate,
  hasAnySuggestion,
  hasSuggestionValue,
  suggestionTimeToHHMM,
  type TravelSuggestion,
} from "@/lib/ticket-form";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

interface SuggestedDatesProps {
  suggestion: TravelSuggestion;
  /** Esconde o bloco inteiro quando não há sugestão nenhuma (view/form). O Resumo mostra sempre. */
  hideWhenEmpty?: boolean;
  /** Texto à direita do título ("Referência para preenchimento"). */
  hint?: string;
  /** Quando informado, mostra o botão "Usar sugestão". */
  onUseSuggestion?: () => void;
  useDisabled?: boolean;
  compact?: boolean;
}

export default function SuggestedDates({ suggestion, hideWhenEmpty, hint, onUseSuggestion, useDisabled, compact }: SuggestedDatesProps) {
  if (hideWhenEmpty && !hasAnySuggestion(suggestion)) return null;
  const val = (v: string) => (hasSuggestionValue(v) ? v : "—");
  const timeHint = (v: string) => {
    if (!hasSuggestionValue(v)) return null;
    const norm = suggestionTimeToHHMM(v);
    return norm && norm !== v ? <span className="text-2xs text-muted-foreground font-normal ml-1">({norm})</span> : null;
  };
  const perna = (ida: boolean) => {
    const Icone = ida ? PlaneTakeoff : PlaneLanding;
    const data = ida ? suggestion.ida : suggestion.retorno;
    const hora = ida ? suggestion.chegada : suggestion.horario;
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-warning">
          <Icone className="w-3.5 h-3.5 text-warning-strong" aria-hidden="true" />{ida ? "Ida" : "Volta"}
        </div>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Data</dt>
          <dd className="m-0 font-semibold text-foreground tabular-nums">{hasSuggestionValue(data) ? formatSuggestionDate(data) : "—"}</dd>
          <dt className="text-muted-foreground">Horário</dt>
          <dd className="m-0 font-semibold text-foreground">{val(hora)}{timeHint(hora)}</dd>
        </dl>
      </div>
    );
  };
  return (
    <div className="rounded-xl border border-warning/30 bg-card overflow-hidden" data-testid="suggested-dates">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 bg-warning-soft/40 border-b border-warning/25">
        <Lightbulb className="w-3.5 h-3.5 text-warning-strong" aria-hidden="true" />
        <span className="text-xs font-semibold text-foreground">Datas sugeridas</span>
        {hint && <span className="text-2xs text-muted-foreground">· {hint}</span>}
        {onUseSuggestion && (
          <MotivoDesabilitado motivo="Preenche data e horários de ida/volta a partir da sugestão da escalação (não sobrescreve o que já foi digitado)" desabilitado={useDisabled || !hasAnySuggestion(suggestion)} className="ml-auto inline-flex">
            <button
              type="button"
              onClick={onUseSuggestion}
              disabled={useDisabled || !hasAnySuggestion(suggestion)}
              className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-card text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-brand-soft disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="button-use-suggestion"
            >
              <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />Usar sugestão
            </button>
          </MotivoDesabilitado>
        )}
      </div>
      <div className={`${compact ? "px-4 py-3" : "p-4"} grid grid-cols-2 gap-4`}>
        {perna(true)}
        {perna(false)}
      </div>
    </div>
  );
}
