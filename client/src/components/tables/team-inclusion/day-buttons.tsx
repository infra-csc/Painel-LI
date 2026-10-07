/**
 * Botões de dia (dia da semana · número · mês) usados na edição de uma vaga e
 * na grade de diárias em lote (25/09 — extraídos da tabela; o markup é o mesmo
 * nos dois lugares). Fim de semana selecionado fica âmbar.
 *
 * 07/10 (redesenho): o dia desmarcado era riscado (parecia "apagado", não
 * "folga") e o botão não tinha foco visível. Agora: marcado = cheio na cor da
 * marca (âmbar no fim de semana); folga = contorno tracejado e texto apagado;
 * foco com anel; o mês só aparece no primeiro dia e na virada do mês (a fileira
 * repetia "out" em todos). `aria-pressed` e o nome por extenso em todos os usos.
 */
import { WEEKDAYS } from "./inclusion-shared";

export function DayButtons({ allDays, isSelected, onToggle }: {
  allDays: string[];
  isSelected: (day: string) => boolean;
  onToggle: (day: string) => void;
  /** Mantido por compatibilidade: desde 07/10 todo uso anuncia `aria-pressed`. */
  ariaPressed?: boolean;
}) {
  return (
    <>
      {allDays.map((day, i) => {
        const d = new Date(day + 'T12:00:00');
        const selected = isSelected(day);
        const wd = WEEKDAYS[d.getDay()];
        const dayNum = d.getDate();
        const mon = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        const mostraMes = i === 0 || dayNum === 1;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <span key={day} className="contents">
          {/* O mês como rótulo antes do primeiro dia e na virada (não por cima do botão). */}
          {mostraMes && (
            <span aria-hidden="true" className="self-center px-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{mon}</span>
          )}
          <button
            type="button"
            aria-pressed={selected}
            aria-label={`${wd} ${dayNum} de ${mon}${selected ? ", trabalha" : ", folga"}`}
            title={selected ? "Trabalha neste dia — clique para tirar" : "Folga — clique para incluir"}
            onClick={() => onToggle(day)}
            className={`inc-dia flex flex-col items-center justify-center w-[42px] h-[46px] rounded-lg border text-2xs leading-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
              selected
                ? isWeekend ? 'bg-warning-strong text-primary-foreground border-warning-strong' : 'bg-primary text-primary-foreground border-primary'
                : `bg-card text-muted-foreground border-dashed ${isWeekend ? 'border-warning-strong/50' : 'border-slate-300'} hover:border-primary/50 hover:text-foreground`
            }`}
          >
            <span className={`font-medium ${selected ? 'opacity-85' : ''}`}>{wd}</span>
            <span className="mt-1 text-sm font-semibold tabular-nums">{dayNum}</span>
          </button>
          </span>
        );
      })}
    </>
  );
}
