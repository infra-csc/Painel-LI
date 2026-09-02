/**
 * A fila por companhia aérea.
 *
 * A tela já agregava bagagens por CIA, mas o número só aparecia dentro da aba
 * de relatório — quem estava na lista não via, e não tinha como recortar por
 * companhia. Aqui cada bloco conta E filtra, e reclicar o ativo desliga.
 */
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { CIA_COR, CIA_ORDEM, formatCurrency, type CiaGroup } from "./baggage-core";
import type { ResumoDaCia } from "./baggage-logic";

/**
 * Abaixo disto as quatro colunas não cabem e a fila vira 2×2.
 *
 * Nunca 3+1: o bloco que sobra ocupa a faixa inteira sozinho e passa a ler como
 * banner, que não é o que ele é.
 */
const LARGURA_PARA_QUATRO = 760;

export default function BaggageWorkQueue({ contagens, ativa, onEscolher }: {
  contagens: Record<CiaGroup, ResumoDaCia>;
  ativa: CiaGroup | null;
  onEscolher: (c: CiaGroup | null) => void;
}) {
  const { ref, largura } = useLarguraUtil<HTMLElement>();
  // Antes da primeira medição assume o desktop: piscar 2×2 e saltar para 4 é
  // pior que assumir o caso comum e corrigir uma vez.
  const emQuatro = largura === null || largura >= LARGURA_PARA_QUATRO;

  return (
    <section
      ref={ref}
      aria-label="Bagagens por companhia aérea"
      className={`grid rounded-[14px] border border-border bg-card overflow-hidden ${emQuatro ? "grid-cols-4" : "grid-cols-2"}`}
    >
      {CIA_ORDEM.map((cia, i) => {
        const r = contagens[cia];
        const on = ativa === cia;
        // Em 2×2 a borda esquerda cai nos ímpares e a de cima na segunda linha,
        // senão sobra um traço solto na borda do card.
        const divisorias = emQuatro
          ? "border-l border-slate-100 first:border-l-0"
          : `${i % 2 === 1 ? "border-l border-slate-100" : ""} ${i >= 2 ? "border-t border-slate-100" : ""}`;

        const sub = r.bags === 0
          ? "nenhuma bagagem"
          : `${r.bags} ${r.bags === 1 ? "bagagem" : "bagagens"} · ${formatCurrency(r.cents)}`;

        return (
          <button
            key={cia}
            type="button"
            aria-pressed={on}
            // Reclicar o bloco ativo desliga o filtro: uma fila que só liga vira
            // uma armadilha de mão única.
            onClick={() => onEscolher(on ? null : cia)}
            className={`min-w-0 text-left px-4 py-[13px] border-b-2 transition-colors ${divisorias} ${
              on ? "bg-background border-b-primary" : "border-b-transparent hover:bg-background"
            }`}
            data-testid={`fila-cia-${cia.toLowerCase()}`}
          >
            <span className="flex items-center gap-[7px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CIA_COR[cia] }} aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground truncate" title={cia}>
                {cia}
              </span>
            </span>
            <span className="flex items-baseline gap-[7px] mt-1.5">
              <span className={`text-[20px] font-semibold tabular-nums tracking-[-0.02em] ${r.bags === 0 ? "text-slate-400" : "text-slate-900"}`}>
                {r.bags}
              </span>
              <span className="text-[12px] text-muted-foreground truncate" title={sub}>{sub}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
