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
 * 07/10 (redesenho): mesma anatomia da fila da Escalação redesenhada — rótulo
 * em caixa normal, filete da ativa que cresce do centro, fundo de marca na
 * ativa. No celular continua 2 × 2 (são só quatro blocos e o "Compradas"
 * carrega o valor em R$, que numa pílula sumiria), mais baixa.
 */
import { ShoppingCart, Clock, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { formatBrl, type TicketsData } from "./use-tickets-data";

/** Qual bloco está ativo — deriva dos filtros, não é estado novo. */
export type FilaDePassagens = "comprar" | "sem-chegada" | "troca" | "compradas" | null;

/** Uma cor por significado — a mesma da pílula de status correspondente. */
const COR: Record<Exclude<FilaDePassagens, null>, string> = {
  comprar: "text-warning-strong",
  "sem-chegada": "text-danger-strong",
  troca: "text-info-strong",
  compradas: "text-success-strong",
};

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
      // 01/10: passagem de quem saiu numa troca continua comprada (histórico) —
      // entra na contagem e no valor, com a parte de troca dita na sub-linha.
      key: "compradas",
      rotulo: "Compradas",
      n: kpis.compradas + (kpis.historico?.count ?? 0),
      sub: (kpis.historico?.count ?? 0) > 0
        ? `${formatBrl(kpis.valor.totalCents + kpis.historico.totalCents)} · ${kpis.historico.count} de troca`
        : formatBrl(kpis.valor.totalCents),
      titulo: [
        kpis.valor.count > 0
          ? `Atuais: ${kpis.compradas} · ${formatBrl(kpis.valor.totalCents)} · média ${formatBrl(kpis.valor.avgCents)} · ${kpis.valor.count} com valor informado`
          : "Nenhum valor informado nas passagens atuais",
        (kpis.historico?.count ?? 0) > 0
          ? `Histórico de trocas: ${kpis.historico.count} · ${formatBrl(kpis.historico.totalCents)} (passagens de quem saiu — o custo continua no evento)`
          : null,
      ].filter(Boolean).join("\n"),
    },
  ];

  return (
    <section
      aria-label="Fila de trabalho das passagens"
      className="grid grid-cols-2 sm:flex rounded-xl border border-border bg-card overflow-hidden"
    >
      {blocos.map(({ key, rotulo, n, sub, titulo }, idx) => {
        const Icone = ICONE[key];
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
              // Sem o bloco de trocas sobram três: o último ocupa a fileira toda.
              blocos.length % 2 === 1 && idx === blocos.length - 1 ? "col-span-2 border-l-0" : "",
              on ? "bg-brand-soft" : "hover:bg-surface-muted",
            ].join(" ")}
            data-testid={`fila-passagens-${key}`}
          >
            {/* Filete da ativa: cresce do centro (a mesma microinteração da Escalação). */}
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none ${on ? "scale-x-100" : "scale-x-0"}`}
            />
            <span className="flex items-center gap-1.5">
              <Icone className={`w-3.5 h-3.5 shrink-0 ${COR[key]}`} aria-hidden="true" />
              <span className={`text-xs font-medium truncate ${on ? "text-primary" : "text-slate-600"}`}>{rotulo}</span>
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
