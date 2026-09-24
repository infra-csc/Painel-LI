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
import { UserPlus, Gavel, ArrowLeftRight, CheckCircle2, ListChecks, Rows3 } from "lucide-react";
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
  trabalho: "var(--primary)",
  escalar: "var(--warning)",
  gestor: "var(--danger-strong)",
  troca: "var(--primary)",
  prontas: "var(--success-strong)",
};

export default function ScalingWorkQueue({ contagens, total, ativa, onEscolher, mostrarGestor = true, mostrarTrocas = true }: {
  contagens: Record<QueueKey, number>;
  /** Todas as vagas do recorte (evento/período/excluídas) — o bloco "Todas". */
  total: number;
  ativa: QueueKey | null;
  onEscolher: (k: QueueKey | null) => void;
  /**
   * "Com o gestor" só para quem está no fluxo de aprovação da cenotécnica
   * (04/09): para os demais é um bloco que nunca é trabalho deles.
   */
  mostrarGestor?: boolean;
  /** "Em análise" só para quem aprova troca de colaborador (dono, 15/09). */
  mostrarTrocas?: boolean;
}) {
  const blocos = QUEUE_META.filter((q) => (mostrarGestor || q.key !== "gestor") && (mostrarTrocas || q.key !== "troca"));
  return (
    <section aria-label="Fila de trabalho da escalação" className="flex rounded-xl border border-border bg-card overflow-hidden">
      {/* "Todas" (04/09): com um bloco ligado por padrão, quem filtrava um
          evento via 2 de 16 vagas e não achava como ver o resto. Este bloco é
          o "sem recorte" explícito — ativo quando nenhum outro está. */}
      <button
        type="button"
        aria-pressed={ativa === null}
        onClick={() => onEscolher(null)}
        className={`flex-1 min-w-0 text-left px-4 py-[13px] border-b-2 transition-colors ${
          ativa === null ? "bg-background border-b-primary" : "border-b-transparent hover:bg-background"
        }`}
        data-testid="fila-todas"
      >
        <span className="flex items-center gap-[7px]">
          <Rows3 className="w-[15px] h-[15px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground truncate">Todas</span>
        </span>
        <span className="flex items-baseline gap-[7px] mt-1.5">
          <span className={`text-xl font-semibold tabular-nums tracking-[-0.02em] ${total === 0 ? "text-muted-foreground" : "text-foreground"}`}>{total}</span>
          <span className="text-xs text-muted-foreground truncate">vagas no recorte</span>
        </span>
      </button>
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
            className={`flex-1 min-w-0 text-left px-4 py-[13px] border-l border-border first:border-l-0 border-b-2 transition-colors ${
              on ? "bg-background border-b-primary" : "border-b-transparent hover:bg-background"
            }`}
            data-testid={`fila-${key}`}
          >
            <span className="flex items-center gap-[7px]">
              <Icone className="w-[15px] h-[15px] shrink-0" style={{ color: COR[key] }} aria-hidden="true" />
              <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground truncate">
                {label}
              </span>
            </span>
            <span className="flex items-baseline gap-[7px] mt-1.5">
              <span className={`text-xl font-semibold tabular-nums tracking-[-0.02em] ${n === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                {n}
              </span>
              <span className="text-xs text-muted-foreground truncate">{sub}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
