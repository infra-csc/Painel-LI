/**
 * Resumo da Validação (25/09 — extraído da página): o funil (vagas → aguardando
 * validação → aguardando aprovação → com pedido) e o recorte "Minhas pendentes".
 * Soma SEMPRE o conjunto exibido (um evento ou todos); cada card filtra a lista.
 */
import { Gauge, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SECTION_TITLE } from "@/components/scaling-validation/logistics-chips";
import { KPI_TOOLTIPS, type Kpi } from "./validation-shared";
import type { ValidationData } from "./use-validation-data";

const KPI_BOX = "rounded-xl border px-3 py-2 text-left";

export function ValidationSummary({ d, eventId, anyEditable }: { d: ValidationData; eventId: string; anyEditable: boolean }) {
  const { counts, isAdmin, minhasFuncoesIds, onlyMine, setOnlyMine, kpiFiltro, setKpiFiltro } = d;
  /**
   * O funil: da vaga sugerida à decisão do aprovador. Cada card diz em UMA
   * linha o que o número significa (dono, 11/09: "parece que tudo diz a mesma
   * coisa") — os três do meio somam o total.
   */
  const FUNIL: Kpi[] = [
    { label: "Vagas", n: counts.total, cls: "text-foreground", hint: "todas em validação, somando as três situações abaixo" },
    { label: "Aguardando validação", n: counts.pendentes, cls: "text-warning", filtro: "pendentes", hint: "a área ainda não validou — é o trabalho desta tela" },
    { label: "Aguardando aprovação", n: counts.aguardandoAprovacao, cls: "text-info", filtro: "aguardandoAprovacao", hint: "já validadas pela área; na mesa do aprovador" },
    { label: "Com pedido", n: counts.comPedido, cls: "text-primary", filtro: "comPedido", hint: "com ajuste ou exclusão pedidos; o aprovador decide" },
  ];
  /**
   * Recorte de "Aguardando validação" pelas MINHAS funções. Só existe quando
   * o recorte diz algo diferente do card ao lado: admin sem cadastro de
   * validador via o mesmo 22 nos dois cards (11/09).
   */
  const RECORTES: Kpi[] = minhasFuncoesIds.size > 0 || !isAdmin
    ? [{ label: "Minhas pendentes", n: counts.minhas, cls: "text-primary", filtro: "minhas", hint: "das suas funções, prontas para você validar" }]
    : [];
  const renderKpi = ({ label, n, cls, filtro, hint }: Kpi) => {
    const tip = KPI_TOOLTIPS[label];
    // "Vagas" é o total — não há o que recortar. "Minhas pendentes"
    // liga os DOIS recortes (minhas funções + aguardando validação): é o que
    // o número conta. Clicar de novo desliga os dois. Os demais recortam por
    // status, um de cada vez.
    const ativo = filtro === "minhas" ? onlyMine && kpiFiltro === "pendentes" : filtro !== undefined && kpiFiltro === filtro;
    const clickable = filtro === "minhas" ? anyEditable : filtro !== undefined && (n > 0 || ativo);
    const alternar = () => {
      if (filtro === "minhas") {
        const ligar = !(onlyMine && kpiFiltro === "pendentes");
        setOnlyMine(ligar);
        setKpiFiltro(ligar ? "pendentes" : null);
        return;
      }
      if (filtro) setKpiFiltro((atual) => (atual === filtro ? null : filtro));
    };
    const box = (
      <div
        key={label}
        className={cn(KPI_BOX, "relative border-border bg-card",
          clickable && "transition-colors hover:border-primary/30",
          ativo && "border-primary/30 bg-brand-soft",
          !clickable && tip && "cursor-help")}
        tabIndex={!clickable && tip ? 0 : undefined}
      >
        <dt className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}{tip && <Info className="w-3 h-3 text-muted-foreground" aria-hidden="true" />}
        </dt>
        <dd className={cn("mt-0.5 text-xl font-bold tabular-nums", cls)}>
          {n}
          <span className="mt-0.5 block text-2xs font-normal leading-tight text-muted-foreground">{hint}</span>
          {/* Botão em cima do cartão inteiro: mantém o clique no KPI sem
              quebrar o par <dt>/<dd> (botão não pode conter dt/dd). */}
          {clickable && (
            <button
              type="button" aria-pressed={ativo}
              aria-label={filtro === "minhas" ? `${label}: ${n}. Filtrar a lista pelas minhas funções` : `${label}: ${n}. ${ativo ? "Tirar o filtro" : "Filtrar a lista"}`}
              onClick={alternar}
              className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
        </dd>
      </div>
    );
    if (!tip) return box;
    return (
      <Tooltip key={label}>
        <TooltipTrigger asChild>{box}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">{tip}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <section aria-labelledby="val-resumo" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand-soft/60 px-4 py-2.5">
        <Gauge className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 id="val-resumo" className="text-2xs font-black uppercase tracking-[0.12em] text-primary">
          Resumo {eventId ? "do evento" : "de todos os eventos"}
        </h2>
        <span className="ml-auto text-2xs text-muted-foreground">Clique num indicador para filtrar a lista.</span>
      </div>
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        {/* <dl>/<dt>/<dd>: cada KPI é um par rótulo/valor de verdade para o
            leitor de tela (um <div aria-label> sem role seria ignorado).
            Grade que QUEBRA (04/09) em vez de rolar para o lado: a faixa
            de uma linha só escondia o último indicador sem barra visível. */}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Funil das vagas">
          {FUNIL.map(renderKpi)}
        </dl>
        {RECORTES.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
          <p className={SECTION_TITLE}>Recorte de “Aguardando validação”</p>
          <dl className="grid grid-cols-2 gap-2 xl:grid-cols-[repeat(1,minmax(180px,1fr))]" aria-label="Recorte de aguardando validação">
            {RECORTES.map(renderKpi)}
          </dl>
        </div>
        )}
      </div>
    </section>
  );
}
