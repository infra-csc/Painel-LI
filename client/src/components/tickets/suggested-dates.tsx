// Bloco "Datas Sugeridas" — usado no Resumo, na visualização e no formulário
// do modal (antes eram três cópias). Opcionalmente oferece "Usar sugestão".
import { Plane, Wand2 } from "lucide-react";
import {
  formatSuggestionDate,
  hasAnySuggestion,
  hasSuggestionValue,
  suggestionTimeToHHMM,
  type TravelSuggestion,
} from "@/lib/ticket-form";

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
  return (
    <div className="border border-primary/25 rounded-xl overflow-hidden" data-testid="suggested-dates">
      <div className="bg-brand-soft border-b border-primary/25 px-4 py-2.5 flex items-center gap-2">
        <Plane className="w-3.5 h-3.5 text-primary" />
        <span className="text-2xs font-black text-primary uppercase tracking-[0.12em]">Datas Sugeridas</span>
        {hint && <span className="ml-auto text-2xs text-primary/70 font-medium">{hint}</span>}
        {onUseSuggestion && (
          <button
            type="button"
            onClick={onUseSuggestion}
            disabled={useDisabled || !hasAnySuggestion(suggestion)}
            className={`${hint ? "ml-2" : "ml-auto"} inline-flex items-center gap-1 text-2xs font-semibold text-primary bg-card border border-primary/25 hover:bg-brand-soft rounded-lg px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Preenche data e horários de ida/volta a partir da sugestão da escalação (não sobrescreve o que já foi digitado)"
            data-testid="button-use-suggestion"
          >
            <Wand2 className="w-3 h-3" />Usar sugestão
          </button>
        )}
      </div>
      <div className={`${compact ? "p-3" : "p-4"} grid grid-cols-2 gap-2`}>
        <div className="bg-card border border-primary/25 rounded-xl p-2.5">
          <div className="text-2xs font-black uppercase tracking-[0.12em] text-primary/70 mb-1.5">🛫 IDA</div>
          <div className="text-2xs text-muted-foreground">Data</div>
          <div className="text-xs font-semibold text-slate-700">{hasSuggestionValue(suggestion.ida) ? formatSuggestionDate(suggestion.ida) : "—"}</div>
          <div className="text-2xs text-muted-foreground mt-1">Horário</div>
          <div className="text-xs font-semibold text-slate-700">{val(suggestion.chegada)}{timeHint(suggestion.chegada)}</div>
        </div>
        <div className="bg-card border border-primary/25 rounded-xl p-2.5">
          <div className="text-2xs font-black uppercase tracking-[0.12em] text-primary/70 mb-1.5">🛬 VOLTA</div>
          <div className="text-2xs text-muted-foreground">Data</div>
          <div className="text-xs font-semibold text-slate-700">{hasSuggestionValue(suggestion.retorno) ? formatSuggestionDate(suggestion.retorno) : "—"}</div>
          <div className="text-2xs text-muted-foreground mt-1">Horário</div>
          <div className="text-xs font-semibold text-slate-700">{val(suggestion.horario)}{timeHint(suggestion.horario)}</div>
        </div>
      </div>
    </div>
  );
}
