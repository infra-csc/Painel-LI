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
    return norm && norm !== v ? <span className="text-[10px] text-slate-400 font-normal ml-1">({norm})</span> : null;
  };
  return (
    <div className="border border-blue-200 rounded-2xl overflow-hidden" data-testid="suggested-dates">
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-2">
        <Plane className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.12em]">Datas Sugeridas</span>
        {hint && <span className="ml-auto text-[10px] text-blue-400 font-medium">{hint}</span>}
        {onUseSuggestion && (
          <button
            type="button"
            onClick={onUseSuggestion}
            disabled={useDisabled || !hasAnySuggestion(suggestion)}
            className={`${hint ? "ml-2" : "ml-auto"} inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-100 rounded-lg px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Preenche data e horários de ida/volta a partir da sugestão da escalação (não sobrescreve o que já foi digitado)"
            data-testid="button-use-suggestion"
          >
            <Wand2 className="w-3 h-3" />Usar sugestão
          </button>
        )}
      </div>
      <div className={`${compact ? "p-3" : "p-4"} grid grid-cols-2 gap-2`}>
        <div className="bg-white border border-blue-100 rounded-xl p-2.5">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛫 IDA</div>
          <div className="text-[11px] text-slate-500">Data</div>
          <div className="text-[12px] font-semibold text-slate-700">{hasSuggestionValue(suggestion.ida) ? formatSuggestionDate(suggestion.ida) : "—"}</div>
          <div className="text-[11px] text-slate-500 mt-1">Horário</div>
          <div className="text-[12px] font-semibold text-slate-700">{val(suggestion.chegada)}{timeHint(suggestion.chegada)}</div>
        </div>
        <div className="bg-white border border-blue-100 rounded-xl p-2.5">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛬 VOLTA</div>
          <div className="text-[11px] text-slate-500">Data</div>
          <div className="text-[12px] font-semibold text-slate-700">{hasSuggestionValue(suggestion.retorno) ? formatSuggestionDate(suggestion.retorno) : "—"}</div>
          <div className="text-[11px] text-slate-500 mt-1">Horário</div>
          <div className="text-[12px] font-semibold text-slate-700">{val(suggestion.horario)}{timeHint(suggestion.horario)}</div>
        </div>
      </div>
    </div>
  );
}
