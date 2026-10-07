/**
 * A fila de trabalho da Hospedagem.
 *
 * Substitui os três cards de resumo (Total / Registradas / Pendentes) e o
 * banner amarelo de trocas — quatro faixas antes da primeira linha, contando a
 * mesma pendência que a linha repetia embaixo. O banner ainda por cima só
 * informava; não levava ao trabalho.
 *
 * Cada bloco é um botão que FILTRA a lista, e reclicar o ativo desliga.
 *
 * 07/10 (redesenho): o MESMO desenho da fila de Passagens (peça compartilhada
 * `FilaDeTrabalho`) — rótulo em caixa normal, filete da ativa que cresce do
 * centro, fundo de marca na ativa, 2 × 2 no celular. Os quatro blocos, os
 * números e a regra de cada um não mudaram (accommodations-queue.ts).
 */
import { BedDouble, TriangleAlert, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { FilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import { DIAS_DE_ATRASO, DIAS_DE_URGENCIA, type BlocoDaFila, type ResumoDaFila } from "./accommodations-queue";

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export default function AccommodationsWorkQueue({ resumo, ativo, onEscolher }: {
  resumo: ResumoDaFila;
  ativo: BlocoDaFila | null;
  onEscolher: (b: BlocoDaFila | null) => void;
}) {
  const registradasSub = resumo.registradas === 0
    ? "nenhuma reserva ainda"
    : `${plural(resumo.hoteisDistintos, "hotel", "hotéis")} · ${plural(resumo.diarias, "diária", "diárias")}`;

  return (
    <FilaDeTrabalho<BlocoDaFila>
      rotulo="Fila de trabalho da hospedagem"
      ativa={ativo}
      onEscolher={onEscolher}
      testid={(k) => `fila-${k}`}
      blocos={[
        // Uma cor por significado — a mesma da pílula de situação correspondente.
        { key: "reservar", rotulo: "Reservar", n: resumo.reservar, sub: "sem hotel registrado", icone: BedDouble, cor: "text-warning-strong" },
        {
          key: "urgente", rotulo: "Urgente", n: resumo.urgente, sub: "chegam nesta semana", icone: TriangleAlert, cor: "text-danger-strong",
          // A sub-linha curta cabe no bloco; a regra inteira fica no título.
          titulo: `${resumo.urgente} sem hotel e com chegada entre ${DIAS_DE_ATRASO} dias atrás e ${DIAS_DE_URGENCIA} dias à frente`,
        },
        { key: "troca", rotulo: "Troca", n: resumo.troca, sub: "aguardando análise", icone: ArrowLeftRight, cor: "text-info-strong" },
        {
          key: "registradas", rotulo: "Registradas", n: resumo.registradas, sub: registradasSub, icone: CheckCircle2, cor: "text-success-strong",
          titulo: `${resumo.registradas} com hotel registrado · ${registradasSub}`,
        },
      ]}
    />
  );
}
