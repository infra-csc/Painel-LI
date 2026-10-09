/**
 * Resumo do Histórico da escala (07/10 — redesenho premium).
 *
 * UMA faixa dividida em células, como a da Validação e a da Aprovação. Eram
 * sete cartões de KPI de peso igual (com rótulos em caixa alta cortados em
 * "AGUARDANDO …") e, solto acima deles, o funil colorido sem legenda.
 *
 *  - Linha de cima: o TOTAL de vagas com o funil ao lado — a barra é a
 *    composição desse número, e agora mora junto dele. As excluídas ficam no
 *    canto, fora da soma, com o atalho "Ver excluídas".
 *  - Embaixo: as seis situações, cada uma com o ponto da cor do funil, o
 *    número e uma linha que diz o que ele significa. Clicar filtra a Lista
 *    (a mesma regra de antes: `onKpiClick`); clicar de novo, na Lista, limpa.
 */
import { Layers } from "lucide-react";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { cn } from "@/lib/utils";
import { ALL, DELETED, IN_INCLUSION, ORIGIN_DOT, plural } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

interface Celula { key: string; label: string; n: number; sub: string; hint?: string }

export function HistorySummary({ h, eventId }: { h: EventHistory; eventId: string }) {
  const { funnel, counts, originFilter, kpiWouldClear, onKpiClick, deletedCount } = h;
  const CELULAS: Celula[] = [
    { key: SUGESTAO_STATUS.PENDENTE, label: "Aguardando validação", n: counts.pendentes, sub: "a área ainda não validou" },
    // Validar não aprova (regra de 19/08): a vaga validada fica parada
    // aguardando o aprovador — o rótulo diz o que está travando.
    {
      key: SUGESTAO_STATUS.VALIDADA, label: "Aguardando aprovação", n: counts.validadas, sub: "validadas, na mesa do aprovador",
      hint: "Validadas pela área e aguardando a decisão do aprovador — clique para filtrar a Lista",
    },
    { key: SUGESTAO_STATUS.AJUSTE, label: "Com pedido", n: counts.comPedido, sub: "pedido da área em aberto" },
    { key: SUGESTAO_STATUS.APROVADA, label: "Aprovadas", n: counts.aprovadas, sub: "decididas pelo aprovador" },
    { key: SUGESTAO_STATUS.NEGADA, label: "Negadas", n: counts.negadas, sub: "fora da soma do quadro" },
    { key: IN_INCLUSION, label: "Em inclusão", n: counts.emInclusao, sub: "já na Inclusão de Equipe" },
  ];
  const excluidasAtivo = originFilter === DELETED;

  return (
    <section aria-labelledby="hes-resumo" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="hes-resumo" className="text-[13px] font-semibold text-foreground">
          Resumo {eventId ? "do evento" : "de todos os eventos"}
        </h2>
        <span className="text-2xs text-muted-foreground">Clique num indicador para filtrar a Lista.</span>
      </div>

      {/* Grade com filetes de 1px (gap sobre o fundo da borda): quebra em
          três e em duas colunas sem filete solto nem borda dupla. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-[0_1px_2px_hsl(222_47%_11%/0.04)] sm:grid-cols-3 xl:grid-cols-6">
        {/* ── Total + funil ── */}
        <div className="hes-kpi relative col-span-2 flex flex-col gap-2.5 bg-card px-3.5 hover:bg-surface-muted/50 py-3 sm:col-span-3 sm:flex-row sm:items-center sm:gap-5 sm:px-4 xl:col-span-6">
          <div className="flex shrink-0 items-baseline gap-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Vagas
            </span>
            <span className="hes-kpi-n text-2xl font-semibold leading-7 tracking-tight tabular-nums text-foreground">{counts.total}</span>
            <span className="hidden text-2xs text-muted-foreground sm:inline">na escala, somando as seis situações</span>
          </div>
          {funnel.length > 0 && (
            <div
              className="flex h-2 min-w-0 flex-1 items-center gap-[3px] overflow-hidden rounded-full"
              role="img"
              aria-label={`Funil da escala: ${funnel.map((f) => `${f.label} ${f.n}`).join(", ")}`}
              data-testid="hes-funil"
            >
              {funnel.map((f) => (
                <span key={f.key} title={`${f.label}: ${f.n}`} className={cn("h-2 first:rounded-l-full last:rounded-r-full", ORIGIN_DOT[f.key])} style={{ flexGrow: f.n, flexBasis: 0 }} />
              ))}
            </div>
          )}
          {/* O total também é um botão (limpa o filtro de situação e abre a
              Lista) — por cima da célula, sem quebrar o atalho das excluídas. */}
          <button
            type="button"
            onClick={() => onKpiClick(ALL)}
            title="Limpar filtro de origem/status"
            aria-label={`Vagas: ${counts.total}. Ver todas na Lista`}
            className={cn(
              "absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            )}
            data-testid="hes-kpi-total"
          />
          {deletedCount > 0 && (
            <p className="relative z-[2] shrink-0 text-2xs text-muted-foreground sm:ml-auto">
              + {plural(deletedCount, "vaga excluída", "vagas excluídas")}, fora da soma ·{" "}
              <button
                type="button"
                onClick={() => onKpiClick(DELETED)}
                aria-pressed={excluidasAtivo}
                className="val-alvo rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {kpiWouldClear(DELETED) ? "Limpar filtro" : "Ver excluídas"}
              </button>
            </p>
          )}
        </div>

        {/* ── As seis situações ── */}
        {CELULAS.map((c) => {
          const ativo = originFilter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onKpiClick(c.key)}
              aria-pressed={ativo}
              title={kpiWouldClear(c.key) ? "Clique para limpar o filtro" : c.hint ?? `Filtrar a Lista por "${c.label}"`}
              data-testid={`hes-kpi-${c.key}`}
              className={cn(
                "hes-kpi relative flex min-w-0 flex-col items-start px-3.5 py-2.5 text-left focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4 sm:py-3",
                ativo ? "bg-brand-soft/80 hover:bg-brand-soft" : "bg-card hover:bg-surface-muted/70",
                // Ligado: filete embaixo (o "selecionado" da faixa da Validação).
                ativo && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
              )}
            >
              <span className={cn("flex items-center gap-1.5 text-xs font-medium leading-4", ativo ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", ORIGIN_DOT[c.key])} aria-hidden="true" />
                <span className="truncate">{c.label}</span>
              </span>
              <span className={cn("hes-kpi-n mt-1 block text-xl font-semibold leading-7 tracking-tight tabular-nums sm:text-2xl",
                c.n === 0 ? "text-muted-foreground" : ativo ? "text-primary" : "text-foreground")}>
                {c.n}
              </span>
              {/* No celular a linha de significado sai: o rótulo basta, e a faixa
                  ocupava a tela inteira antes da primeira vaga. */}
              <span className="mt-0.5 hidden text-2xs leading-snug text-muted-foreground sm:block">{c.sub}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
