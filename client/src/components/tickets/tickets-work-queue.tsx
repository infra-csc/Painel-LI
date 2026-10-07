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
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";

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
  type Chave = Exclude<FilaDePassagens, null>;
  // `titulo`: o que o cartão antigo dizia e não cabe na sub-linha.
  const blocos: Omit<BlocoDaFilaDeTrabalho<Chave>, "icone" | "cor">[] = [
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

  // Desenho compartilhado com a Hospedagem (07/10) — as mesmas classes de antes.
  return (
    <FilaDeTrabalho<Chave>
      rotulo="Fila de trabalho das passagens"
      blocos={blocos.map((b) => ({ ...b, icone: ICONE[b.key], cor: COR[b.key] }))}
      ativa={ativa}
      onEscolher={onEscolher}
      testid={(k) => `fila-passagens-${k}`}
    />
  );
}
