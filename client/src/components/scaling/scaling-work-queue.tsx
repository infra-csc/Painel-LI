/**
 * A fila de trabalho da Escalação (01/09).
 *
 * Substitui dois banners e um filtro de situação que contavam a MESMA
 * pendência duas vezes, em linguagens diferentes: o banner vermelho dizia
 * "N aguardando aprovação" e a linha repetia "Aguardando Gestor" logo abaixo.
 *
 * Cada bloco é um botão que FILTRA a lista. É a diferença entre um aviso — que
 * só informa — e uma fila, que leva ao trabalho.
 */
import { UserPlus, Gavel, ArrowLeftRight, CheckCircle2, ListChecks } from "lucide-react";
import { QUEUE_META, type QueueKey } from "./scaling-queue";

const ICONE: Record<QueueKey, typeof UserPlus> = {
  trabalho: ListChecks,
  escalar: UserPlus,
  gestor: Gavel,
  troca: ArrowLeftRight,
  prontas: CheckCircle2,
};

/** Uma cor por significado — a mesma da pílula de situação correspondente. */
const COR: Record<QueueKey, string> = {
  trabalho: "#0033CC",
  escalar: "#D97706",
  gestor: "#EF4444",
  troca: "#A855F7",
  prontas: "#10B981",
};

export default function ScalingWorkQueue({ contagens, ativa, onEscolher, mostrarGestor = true }: {
  contagens: Record<QueueKey, number>;
  ativa: QueueKey | null;
  onEscolher: (k: QueueKey | null) => void;
  /**
   * "Com o gestor" só para quem está no fluxo de aprovação da cenotécnica
   * (04/09): para os demais é um bloco que nunca é trabalho deles.
   */
  mostrarGestor?: boolean;
}) {
  const blocos = QUEUE_META.filter((q) => mostrarGestor || q.key !== "gestor");
  return (
    <section aria-label="Fila de trabalho da escalação" className="flex rounded-xl border border-border bg-card overflow-hidden">
      {blocos.map(({ key, label, sub }) => {
        const Icone = ICONE[key];
        const n = contagens[key];
        const on = ativa === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            // Reclicar o bloco ativo desliga o filtro: uma fila que só liga
            // vira uma armadilha de mão única.
            onClick={() => onEscolher(on ? null : key)}
            className={`flex-1 min-w-0 text-left px-4 py-[13px] border-l border-slate-100 first:border-l-0 border-b-2 transition-colors ${
              on ? "bg-background border-b-primary" : "border-b-transparent hover:bg-background"
            }`}
            data-testid={`fila-${key}`}
          >
            <span className="flex items-center gap-[7px]">
              <Icone className="w-[15px] h-[15px] shrink-0" style={{ color: COR[key] }} aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground truncate">
                {label}
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
