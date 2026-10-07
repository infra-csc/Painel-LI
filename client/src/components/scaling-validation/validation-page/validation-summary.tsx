/**
 * Resumo da Validação (25/09 — extraído da página): o funil (vagas → aguardando
 * validação → aguardando aprovação → com pedido) e o recorte "Minhas pendentes".
 * Soma SEMPRE o conjunto exibido (um evento ou todos); cada card filtra a lista.
 *
 * 07/10 (redesenho): UMA faixa dividida em células, como a fila da Escalação —
 * eram cinco cartões com borda dentro de um cartão com faixa azul e título em
 * caixa alta, e no celular o resumo ocupava a tela inteira antes da primeira
 * vaga. O recorte "Minhas pendentes" fecha a faixa, separado por um filete
 * mais forte, e acende quando há trabalho seu esperando.
 */
import { CircleDashed, Clock, Info, Layers, MessageSquareWarning, Stamp, UserCheck, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { KPI_TOOLTIPS, type Kpi } from "./validation-shared";
import type { ValidationData } from "./use-validation-data";

/** Ícone de cada indicador — a cor diz de quem é a vez (âmbar: área; azul: aprovador). */
const ICONE: Record<string, { Icon: LucideIcon; cls: string }> = {
  Vagas: { Icon: Layers, cls: "text-muted-foreground" },
  "Aguardando validação": { Icon: Clock, cls: "text-warning" },
  "Aguardando aprovação": { Icon: Stamp, cls: "text-info" },
  "Com pedido": { Icon: MessageSquareWarning, cls: "text-primary" },
  "Minhas pendentes": { Icon: UserCheck, cls: "text-primary" },
};

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
  const renderKpi = ({ label, n, filtro, hint }: Kpi, recorte = false) => {
    const tip = KPI_TOOLTIPS[label];
    const { Icon, cls: iconCls } = ICONE[label] ?? { Icon: CircleDashed, cls: "text-muted-foreground" };
    // "Vagas" é o total — não há o que recortar. "Minhas pendentes"
    // liga os DOIS recortes (minhas funções + aguardando validação): é o que
    // o número conta. Clicar de novo desliga os dois. Os demais recortam por
    // status, um de cada vez.
    const ativo = filtro === "minhas" ? onlyMine && kpiFiltro === "pendentes" : filtro !== undefined && kpiFiltro === filtro;
    const clickable = filtro === "minhas" ? anyEditable : filtro !== undefined && (n > 0 || ativo);
    /** Trabalho seu esperando: o recorte acende (fundo da marca, número em azul). */
    const chama = recorte && n > 0 && !ativo;
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
        className={cn(
          "val-kpi relative flex min-w-0 flex-col px-3.5 sm:px-4", recorte ? "flex-1 pb-3 pt-1.5" : "bg-card py-2.5 sm:py-3",
          clickable && "cursor-pointer hover:bg-surface-muted/70",
          chama && "hover:bg-brand-soft/40",
          // Ligado: fundo da marca + filete embaixo (o "selecionado" da fila da Escalação).
          ativo && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
          ativo && !recorte && "bg-brand-soft/80 hover:bg-brand-soft",
          !clickable && tip && "cursor-help",
        )}
        tabIndex={!clickable && tip ? 0 : undefined}
      >
        <dt className={cn("flex items-start gap-1.5 text-xs font-medium", ativo || chama ? "text-primary" : "text-muted-foreground")}>
          <Icon className={cn("mt-px h-3.5 w-3.5 shrink-0", iconCls)} aria-hidden="true" />
          <span className="leading-4">{label}</span>
          {tip && <Info className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
        </dt>
        <dd className="mt-1 flex flex-1 flex-col">
          <span className={cn("val-kpi-n block text-2xl font-semibold leading-7 tracking-tight tabular-nums",
            n === 0 ? "text-muted-foreground" : ativo || chama ? "text-primary" : "text-foreground")}>
            {n}
          </span>
          <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">{hint}</span>
          {/* Botão em cima do cartão inteiro: mantém o clique no KPI sem
              quebrar o par <dt>/<dd> (botão não pode conter dt/dd). */}
          {clickable && (
            <button
              type="button" aria-pressed={ativo}
              aria-label={filtro === "minhas" ? `${label}: ${n}. Filtrar a lista pelas minhas funções` : `${label}: ${n}. ${ativo ? "Tirar o filtro" : "Filtrar a lista"}`}
              onClick={alternar}
              className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
    <section aria-labelledby="val-resumo" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="val-resumo" className="text-[13px] font-semibold text-foreground">
          Resumo {eventId ? "do evento" : "de todos os eventos"}
        </h2>
        <span className="text-2xs text-muted-foreground">Clique num indicador para filtrar a lista.</span>
      </div>
      {/* Grade com filetes de 1px (gap sobre o fundo da borda): quebra em
          duas colunas no celular sem filete solto nem borda dupla. */}
      {/* Sem recorte (admin sem cadastro de validador), o funil ocupa a faixa toda. */}
      <div className={cn("grid overflow-hidden rounded-xl border border-border bg-border shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]",
        RECORTES.length > 0 && "xl:grid-cols-[minmax(0,4fr)_minmax(0,1.2fr)]")}>
        {/* <dl>/<dt>/<dd>: cada KPI é um par rótulo/valor de verdade para o
            leitor de tela (um <div aria-label> sem role seria ignorado). */}
        <dl className="grid grid-cols-2 gap-px sm:grid-cols-4" aria-label="Funil das vagas">
          {FUNIL.map((k) => renderKpi(k))}
        </dl>
        {RECORTES.length > 0 && (
          <div className={cn("flex flex-col border-t-2 border-border xl:border-l-2 xl:border-t-0",
            onlyMine && kpiFiltro === "pendentes" ? "bg-brand-soft/80" : counts.minhas > 0 ? "bg-brand-soft/45" : "bg-card")}>
            <p className="px-3.5 pt-2.5 text-2xs font-medium text-muted-foreground sm:px-4">Recorte de “Aguardando validação”</p>
            <dl className="grid flex-1 grid-cols-1" aria-label="Recorte de aguardando validação">
              {RECORTES.map((k) => renderKpi(k, true))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
