/**
 * Fila de trabalho da tela de Passagens (02/09).
 *
 * Substitui os cinco cartões de KPI e o banner amarelo de trocas. O banner
 * contava a MESMA pendência que a linha repetia embaixo, e só informava — não
 * levava ao trabalho. Cada bloco agora conta E filtra, e reclicar desliga.
 *
 * **Nenhum número se perdeu e nenhuma regra mudou.** Os quatro blocos apenas
 * acionam filtros que a tela já tinha (`ticketStatus` e o recorte de trocas):
 * "Comprar" é o `pending`, "Sem chegada" é o `no_arrival`, "Compradas" é o
 * `processed`. O "Total geral" virou o resumo da barra de contexto e o "Valor
 * comprado" virou a sub-linha de "Compradas" — com a média no título, que era
 * o outro dado do cartão antigo.
 *
 * Mesma anatomia de `scaling/scaling-work-queue.tsx`: as duas telas são filas
 * de trabalho irmãs e devem se ler igual.
 */
import { ShoppingCart, Clock, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { formatBrl, type TicketsData } from "./use-tickets-data";

/** Qual bloco está ativo — deriva dos filtros, não é estado novo. */
export type FilaDePassagens = "comprar" | "sem-chegada" | "troca" | "compradas" | null;

const COR = {
  comprar: "#D97706",
  "sem-chegada": "#EF4444",
  troca: "#A855F7",
  compradas: "#10B981",
} as const;

const ICONE = {
  comprar: ShoppingCart,
  "sem-chegada": Clock,
  troca: ArrowLeftRight,
  compradas: CheckCircle2,
} as const;

export default function TicketsWorkQueue({ kpis, trocasPendentes, mostrarTrocas, ativa, onEscolher }: {
  kpis: TicketsData["kpis"];
  trocasPendentes: number;
  /** O bloco de trocas só existe para quem analisa troca (Compras e admin). */
  mostrarTrocas: boolean;
  ativa: FilaDePassagens;
  onEscolher: (k: FilaDePassagens) => void;
}) {
  const blocos: {
    key: Exclude<FilaDePassagens, null>;
    rotulo: string;
    n: number;
    sub: string;
    /** O que o cartão antigo dizia e não cabe na sub-linha. */
    titulo?: string;
  }[] = [
    { key: "comprar", rotulo: "Comprar", n: kpis.aguardando, sub: "sem passagem registrada" },
    { key: "sem-chegada", rotulo: "Sem chegada", n: kpis.semChegada, sub: "horário não informado" },
    ...(mostrarTrocas
      ? [{ key: "troca" as const, rotulo: "Troca", n: trocasPendentes, sub: "aguardando análise" }]
      : []),
    {
      key: "compradas",
      rotulo: "Compradas",
      n: kpis.compradas,
      sub: formatBrl(kpis.valor.totalCents),
      titulo: kpis.valor.count > 0
        ? `${formatBrl(kpis.valor.totalCents)} no total · média ${formatBrl(kpis.valor.avgCents)} · ${kpis.valor.count} com valor informado`
        : "Nenhum valor informado nas passagens compradas",
    },
  ];

  return (
    <section aria-label="Fila de trabalho das passagens" className="flex rounded-xl border border-border bg-card overflow-hidden">
      {blocos.map(({ key, rotulo, n, sub, titulo }) => {
        const Icone = ICONE[key];
        const on = ativa === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            title={titulo}
            // Reclicar o bloco ativo desliga o filtro: uma fila que só liga
            // vira armadilha de mão única.
            onClick={() => onEscolher(on ? null : key)}
            className={`flex-1 min-w-0 text-left px-3.5 py-[13px] border-l border-slate-100 first:border-l-0 border-b-2 transition-colors ${
              on ? "bg-background border-b-primary" : "border-b-transparent hover:bg-background"
            }`}
            data-testid={`fila-passagens-${key}`}
          >
            <span className="flex items-center gap-[7px]">
              <Icone className="w-[15px] h-[15px] shrink-0" style={{ color: COR[key] }} aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground truncate">
                {rotulo}
              </span>
            </span>
            <span className="flex items-baseline gap-[7px] mt-1.5">
              <span className={`text-[20px] font-semibold tabular-nums tracking-[-0.02em] ${n === 0 ? "text-slate-400" : "text-slate-900"}`}>
                {n}
              </span>
              <span className="text-[12px] text-muted-foreground truncate">{sub}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
