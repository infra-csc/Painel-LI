/**
 * A fila de trabalho da Hospedagem.
 *
 * Substitui os três cards de resumo (Total / Registradas / Pendentes) e o
 * banner amarelo de trocas — quatro faixas antes da primeira linha, contando a
 * mesma pendência que a linha repetia embaixo. O banner ainda por cima só
 * informava; não levava ao trabalho.
 *
 * Cada bloco é um botão que FILTRA a lista, e reclicar o ativo desliga.
 */
import { BedDouble, TriangleAlert, ArrowLeftRight, CheckCircle2, type LucideIcon } from "lucide-react";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import type { BlocoDaFila, ResumoDaFila } from "./accommodations-queue";


interface Def {
  key: BlocoDaFila;
  label: string;
  icone: LucideIcon;
  /** Uma cor por significado — a mesma da pílula de situação correspondente. */
  cor: string;
}

const BLOCOS: Def[] = [
  { key: "reservar",    label: "Reservar",    icone: BedDouble,      cor: "#D97706" },
  { key: "urgente",     label: "Urgente",     icone: TriangleAlert,  cor: "#EF4444" },
  { key: "troca",       label: "Troca",       icone: ArrowLeftRight, cor: "#A855F7" },
  { key: "registradas", label: "Registradas", icone: CheckCircle2,   cor: "#10B981" },
];

/**
 * Abaixo disto as quatro colunas não cabem e a fila vira 2×2.
 *
 * Nunca 3+1: o bloco que sobra ocupa a faixa inteira sozinho e volta a ler como
 * banner, que é exatamente o que esta fila substituiu.
 */
const LARGURA_PARA_QUATRO = 760;

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export default function AccommodationsWorkQueue({ resumo, ativo, onEscolher }: {
  resumo: ResumoDaFila;
  ativo: BlocoDaFila | null;
  onEscolher: (b: BlocoDaFila | null) => void;
}) {
  const { ref, largura } = useLarguraUtil<HTMLElement>();
  // Antes da primeira medição assume o desktop: piscar 2×2 e saltar para 4 é
  // pior que assumir o caso comum e corrigir uma vez.
  const emQuatro = largura === null || largura >= LARGURA_PARA_QUATRO;

  const sub: Record<BlocoDaFila, string> = {
    reservar: "sem hotel registrado",
    urgente: "chegam nesta semana ou atrasadas",
    troca: "aguardando análise",
    registradas: resumo.registradas === 0
      ? "nenhuma reserva ainda"
      : `${plural(resumo.hoteisDistintos, "hotel", "hotéis")} · ${plural(resumo.diarias, "diária", "diárias")}`,
  };

  return (
    <section
      ref={ref}
      aria-label="Fila de trabalho da hospedagem"
      className={`grid rounded-xl border border-border bg-card overflow-hidden ${emQuatro ? "grid-cols-4" : "grid-cols-2"}`}
    >
      {BLOCOS.map(({ key, label, icone: Icone, cor }, i) => {
        const n = resumo[key];
        const on = ativo === key;
        // Em 2×2 a borda esquerda cai nos ímpares e a de cima na segunda linha,
        // senão sobra um traço solto na borda do card.
        const divisorias = emQuatro
          ? "border-l border-slate-100 first:border-l-0"
          : `${i % 2 === 1 ? "border-l border-slate-100" : ""} ${i >= 2 ? "border-t border-slate-100" : ""}`;

        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            // Reclicar o bloco ativo desliga o filtro: uma fila que só liga vira
            // uma armadilha de mão única.
            onClick={() => onEscolher(on ? null : key)}
            className={`min-w-0 text-left px-4 py-[13px] border-b-2 transition-colors ${divisorias} ${
              on ? "bg-background border-b-primary" : "border-b-transparent hover:bg-background"
            }`}
            data-testid={`fila-${key}`}
          >
            <span className="flex items-center gap-[7px]">
              <Icone className="w-[15px] h-[15px] shrink-0" style={{ color: cor }} aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground truncate" title={label}>
                {label}
              </span>
            </span>
            <span className="flex items-baseline gap-[7px] mt-1.5">
              <span className={`text-[20px] font-semibold tabular-nums tracking-[-0.02em] ${n === 0 ? "text-slate-400" : "text-slate-900"}`}>
                {n}
              </span>
              <span className="text-[12px] text-muted-foreground truncate" title={sub[key]}>{sub[key]}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
