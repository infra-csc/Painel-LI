/**
 * Fila de trabalho das listas da Logística — Passagens e Hospedagem (07/10).
 *
 * Extraída de `tickets/tickets-work-queue.tsx` sem mudar uma classe: cada bloco
 * conta E filtra, reclicar o ativo desliga, o filete da ativa cresce do centro
 * (a mesma microinteração da Escalação) e o fundo de marca diz qual está aceso.
 * No celular fica 2 × 2; com três blocos, o último ocupa a fileira toda.
 *
 * Só apresentação: quantos são e o que cada bloco recorta é da tela.
 */
import type { LucideIcon } from "lucide-react";

export interface BlocoDaFilaDeTrabalho<K extends string> {
  key: K;
  rotulo: string;
  n: number;
  sub: string;
  /** Tooltip — o que o bloco conta, por extenso. */
  titulo?: string;
  icone: LucideIcon;
  /** Classe de cor do ícone (a mesma da pílula de situação correspondente). */
  cor: string;
}

export function FilaDeTrabalho<K extends string>({ blocos, ativa, onEscolher, rotulo, testid }: {
  blocos: BlocoDaFilaDeTrabalho<K>[];
  ativa: K | null;
  onEscolher: (k: K | null) => void;
  /** Nome da região para o leitor de tela. */
  rotulo: string;
  /** `data-testid` de cada bloco. */
  testid: (k: K) => string;
}) {
  return (
    <section
      aria-label={rotulo}
      className="grid grid-cols-2 sm:flex rounded-xl border border-border bg-card overflow-hidden"
    >
      {blocos.map(({ key, rotulo: nome, n, sub, titulo, icone: Icone, cor }, idx) => {
        const on = ativa === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            title={titulo ?? `${n} ${sub}`}
            // Reclicar o bloco ativo desliga o filtro: uma fila que só liga
            // vira armadilha de mão única.
            onClick={() => onEscolher(on ? null : key)}
            className={[
              "group relative flex flex-col justify-start flex-1 min-w-0 text-left px-3.5 pt-2.5 pb-3 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              // Divisórias: na grade 2 × 2 do celular, só entre colunas e entre fileiras.
              idx % 2 === 1 ? "border-l border-border" : "",
              idx >= 2 ? "border-t border-border sm:border-t-0" : "",
              idx > 0 ? "sm:border-l sm:border-border" : "",
              // Com três blocos, o último ocupa a fileira toda.
              blocos.length % 2 === 1 && idx === blocos.length - 1 ? "col-span-2 border-l-0" : "",
              on ? "bg-brand-soft" : "hover:bg-surface-muted",
            ].join(" ")}
            data-testid={testid(key)}
          >
            {/* Filete da ativa: cresce do centro (a mesma microinteração da Escalação). */}
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none ${on ? "scale-x-100" : "scale-x-0"}`}
            />
            <span className="flex items-center gap-1.5">
              <Icone className={`w-3.5 h-3.5 shrink-0 ${cor}`} aria-hidden="true" />
              <span className={`text-xs font-medium truncate ${on ? "text-primary" : "text-slate-600"}`}>{nome}</span>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-1.5 mt-1">
              <span className={`text-xl leading-6 font-semibold tabular-nums tracking-[-0.02em] ${n === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                {n}
              </span>
              <span className="min-w-0 text-2xs sm:text-xs text-muted-foreground truncate">{sub}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
