/**
 * A fila de trabalho da Escalação (01/09).
 *
 * Substitui dois banners e um filtro de situação que contavam a MESMA
 * pendência duas vezes, em linguagens diferentes: o banner vermelho dizia
 * "N aguardando aprovação" e a linha repetia "Aguardando gestor" logo abaixo.
 *
 * Cada bloco é um botão que FILTRA a lista. É a diferença entre um aviso — que
 * só informa — e uma fila, que leva ao trabalho.
 *
 * 07/10: rótulos em caixa normal (a caixa alta espaçada cortava "ESCALAR +
 * CON…" em 1366) e cada bloco com a largura do que diz, em vez de seis
 * fatias iguais. No celular a grade de 2×3 (230px de altura antes da
 * primeira vaga) virou uma faixa de pílulas que rola de lado.
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
  trabalho: "text-primary",
  escalar: "text-warning-strong",
  gestor: "text-warning-strong",
  troca: "text-info-strong",
  prontas: "text-success-strong",
};

interface Bloco { key: QueueKey | null; label: string; sub: string; n: number; Icone: typeof UserPlus; cor: string; testid: string }

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
  // "Todas" (04/09): com um bloco ligado por padrão, quem filtrava um evento
  // via 2 de 16 vagas e não achava como ver o resto. Este bloco é o "sem
  // recorte" explícito — ativo quando nenhum outro está.
  const blocos: Bloco[] = [
    { key: null, label: "Todas", sub: "vagas no recorte", n: total, Icone: Rows3, cor: "text-muted-foreground", testid: "fila-todas" },
    ...QUEUE_META
      .filter((q) => (mostrarGestor || q.key !== "gestor") && (mostrarTrocas || q.key !== "troca"))
      .map(({ key, label, sub }) => ({ key, label, sub, n: contagens[key], Icone: ICONE[key], cor: COR[key], testid: `fila-${key}` })),
  ];
  // Reclicar o bloco ativo desliga o filtro: uma fila que só liga vira uma
  // armadilha de mão única. "Todas" sempre volta ao sem-recorte.
  const escolher = (key: QueueKey | null) => onEscolher(key === null || ativa === key ? null : key);

  return (
    <section aria-label="Fila de trabalho da escalação">
      {/* Celular, tablet e notebook estreito: faixa de pílulas. */}
      <div className="esc-rolagem-x -mx-[var(--page-gutter)] flex gap-1.5 px-[var(--page-gutter)] pb-0.5 xl:hidden">
        {blocos.map(({ key, label, sub, n, Icone, cor, testid }) => {
          const on = ativa === key;
          return (
            <button
              key={testid}
              type="button"
              aria-pressed={on}
              onClick={() => escolher(key)}
              title={`${n} ${sub}`}
              className={`esc-alvo inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pl-2.5 pr-1.5 text-xs font-medium transition-colors ${
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-slate-700 hover:border-slate-300"
              }`}
              data-testid={`${testid}-pilula`}
            >
              <Icone className={`h-3.5 w-3.5 shrink-0 ${on ? "text-primary-foreground" : cor}`} aria-hidden="true" />
              {label}
              <span className={`min-w-[22px] rounded-full px-1.5 py-px text-center text-2xs font-semibold tabular-nums ${
                on ? "bg-primary-foreground/20 text-primary-foreground" : n === 0 ? "bg-muted text-muted-foreground" : "bg-muted text-foreground"
              }`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Telas largas: a faixa de blocos com número e explicação. */}
      <div className="hidden xl:flex rounded-xl border border-border bg-card overflow-hidden">
        {blocos.map(({ key, label, sub, n, Icone, cor, testid }, idx) => {
          const on = ativa === key;
          return (
            <button
              key={testid}
              type="button"
              aria-pressed={on}
              onClick={() => escolher(key)}
              title={`${n} ${sub}`}
              className={`group relative flex-[1_1_auto] min-w-0 text-left px-3.5 pt-2.5 pb-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                idx > 0 ? "border-l border-border" : ""
              } ${on ? "bg-brand-soft" : "hover:bg-surface-muted"}`}
              data-testid={testid}
            >
              {/* Filete da ativa: cresce do centro (microinteração da escolha). */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform duration-200 ease-out ${on ? "scale-x-100" : "scale-x-0"}`}
              />
              <span className="flex items-center gap-1.5">
                <Icone className={`w-3.5 h-3.5 shrink-0 ${cor}`} aria-hidden="true" />
                <span className={`text-xs font-medium truncate ${on ? "text-primary" : "text-slate-600"}`}>{label}</span>
              </span>
              <span className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl leading-6 font-semibold tabular-nums tracking-[-0.02em] ${n === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                  {n}
                </span>
                {/* A explicação só cabe inteira em telas largas; abaixo disso
                    fica no title (cortada no meio, ela confundia mais que ajudava). */}
                <span className="hidden 2xl:inline text-2xs text-muted-foreground truncate">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
