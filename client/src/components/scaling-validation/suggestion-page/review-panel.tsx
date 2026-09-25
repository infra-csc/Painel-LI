/**
 * Painel de revisão da Sugestão de escala (25/09 — extraído da página).
 *
 * Erro e aviso deixam de ter o mesmo peso. Eram chips do mesmo tamanho
 * embaralhados numa faixa só — o que trava o envio e o que apenas merece um
 * olhar liam igual, e o texto "Função: problema" cortava dentro da pílula.
 * Agora cada item é uma linha inteira, com o ponto de cor, a função em
 * destaque, o problema embaixo e a ação nomeada ("Corrigir" para erro,
 * "Revisar" para aviso).
 */
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { REVIEW_PREVIEW, plural, type Pendencia } from "./suggestion-shared";

export interface ReviewPanelProps {
  pendencias: { errors: Pendencia[]; warnings: Pendencia[] };
  showAll: boolean;
  onToggleShowAll: () => void;
  onFocusRow: (rowId: string) => void;
}

export function ReviewPanel({ pendencias, showAll, onToggleShowAll, onFocusRow }: ReviewPanelProps) {
  if (pendencias.errors.length === 0 && pendencias.warnings.length === 0) return null;
  const temErro = pendencias.errors.length > 0;
  // Erros primeiro; a lista mostra REVIEW_PREVIEW itens e o resto
  // atrás de "Ver mais N" — 40 avisos empilhados empurravam a grade
  // para fora da tela.
  const todos = [
    ...pendencias.errors.map((e) => ({ ...e, tipo: "erro" as const })),
    ...pendencias.warnings.map((w) => ({ ...w, tipo: "aviso" as const })),
  ];
  const ocultos = Math.max(0, todos.length - REVIEW_PREVIEW);
  const itens = showAll || ocultos === 0 ? todos : todos.slice(0, REVIEW_PREVIEW);
  return (
    <section
      aria-label="Pontos a revisar antes de enviar"
      data-testid="scaling-suggestion-revisao"
      className={cn("overflow-hidden rounded-xl border", temErro ? "border-danger/25 bg-danger-soft/60" : "border-warning/25 bg-warning-soft/60")}
    >
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
        <AlertTriangle className={cn("mt-px h-4 w-4 shrink-0", temErro ? "text-danger" : "text-warning")} aria-hidden="true" />
        <div className="min-w-0">
          <p className={cn("text-sm font-bold", temErro ? "text-danger" : "text-warning")}>
            {temErro
              ? `${pendencias.errors.length} ${pendencias.errors.length === 1 ? "linha impede" : "linhas impedem"} o envio`
              : `${pendencias.warnings.length} ${pendencias.warnings.length === 1 ? "ponto para revisar" : "pontos para revisar"}`}
          </p>
          <p className={cn("text-xs", temErro ? "text-danger" : "text-warning")}>
            {temErro
              ? pendencias.warnings.length > 0
                ? `E mais ${plural(pendencias.warnings.length, "aviso", "avisos")} — avisos não travam o envio.`
                : "Corrija para liberar o envio."
              : "Avisos não travam o envio — dá para enviar assim mesmo."}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-white/70 border-t border-white/70">
        {itens.map((item, i) => {
          const erro = item.tipo === "erro";
          return (
            <li key={`${item.tipo}-${item.rowId}-${i}`}>
              {/* Todo problema apontado é de logística: "Corrigir" abre o painel da linha, não a célula. */}
              <button
                type="button"
                onClick={() => onFocusRow(item.rowId)}
                aria-label={`${erro ? "Corrigir" : "Revisar"} ${item.funcao}: ${item.problema}`}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-card/70 focus-visible:outline-none focus-visible:bg-card/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", erro ? "bg-danger-strong" : "bg-warning-strong")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{item.funcao}</span>
                  <span className="block truncate text-xs text-slate-600">{item.problema}</span>
                </span>
                <span className={cn("shrink-0 text-xs font-semibold", erro ? "text-danger" : "text-warning")}>
                  {erro ? "Corrigir" : "Revisar"}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {ocultos > 0 && (
        <div className="border-t border-white/70 px-3.5 py-1.5">
          <button
            type="button"
            onClick={onToggleShowAll}
            aria-expanded={showAll}
            className={cn("rounded text-xs font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", temErro ? "text-danger" : "text-warning")}
          >
            {showAll ? "Ver menos" : `Ver mais ${ocultos}`}
          </button>
        </div>
      )}
    </section>
  );
}
