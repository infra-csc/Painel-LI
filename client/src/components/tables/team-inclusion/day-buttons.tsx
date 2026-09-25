/**
 * Botões de dia (dia da semana · número · mês) usados na edição de uma vaga e
 * na grade de diárias em lote (25/09 — extraídos da tabela; o markup é o mesmo
 * nos dois lugares). Fim de semana selecionado fica âmbar.
 */
import { WEEKDAYS } from "./inclusion-shared";

export function DayButtons({ allDays, isSelected, onToggle, ariaPressed }: {
  allDays: string[];
  isSelected: (day: string) => boolean;
  onToggle: (day: string) => void;
  /** A edição de uma vaga anuncia aria-pressed; a grade em lote não anunciava. */
  ariaPressed?: boolean;
}) {
  return (
    <>
      {allDays.map(day => {
        const d = new Date(day + 'T12:00:00');
        const selected = isSelected(day);
        const wd = WEEKDAYS[d.getDay()];
        const dayNum = d.getDate();
        const mon = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <button
            key={day}
            type="button"
            aria-pressed={ariaPressed ? selected : undefined}
            onClick={() => onToggle(day)}
            className={`flex flex-col items-center px-2 py-1 rounded-lg border text-2xs font-semibold transition-all min-w-[38px] ${
              selected
                ? isWeekend ? 'bg-warning-strong text-primary-foreground border-warning-strong' : 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border line-through'
            }`}
          >
            <span className="text-2xs font-normal">{wd}</span>
            <span>{dayNum}</span>
            <span className="text-2xs font-normal">{mon}</span>
          </button>
        );
      })}
    </>
  );
}
