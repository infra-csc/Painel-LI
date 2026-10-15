/**
 * Nível 1 — fila de pedidos. Decisão na própria linha ou pelo detalhe.
 *
 * 07/10 (redesenho): colunas com papel claro — o TIPO e a situação à
 * esquerda (com a data de abertura), QUEM pede e para qual vaga, O QUE muda
 * (o de → para em linhas, não uma frase corrida) com o motivo embaixo, e a
 * decisão discreta à direita: "Aprovar" em contorno verde e os ícones de
 * negar/reajustar sem borda. A tabela tem larguras fixas (nada rola de lado)
 * e vira cartões abaixo de 1280px pelo CSS (`.apr-tabela`) — era uma tabela
 * de 860px que rolava a partir de 768 e uma segunda lista para o celular.
 */
import type { MouseEvent } from "react";
import { CheckCircle2, ChevronRight, PencilLine, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { CHANGE_REQUEST_STATUS, CHANGE_REQUEST_TYPE_LABELS, PROPOSED_FIELD_LABELS, type ChangeRequestType } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem } from "./types";
import { CanDecideBadge, PostScalingBadge, RequestStatusBadge, RequestTypeBadge, changeSummary, formatProposedValue } from "./request-badges";
import { isPostValidationInclusion } from "@shared/scaling-change-window";
import { APROVAR_DA_LINHA, ICONE_DA_LINHA, TH } from "./tokens";
import { LinhaDoEvento } from "./linha-do-evento";

interface RequestQueueProps {
  items: ChangeRequestItem[];
  onOpen: (item: ChangeRequestItem) => void;
  /** Mostrar o evento de cada pedido (quando o filtro é "todos"). */
  showEvent?: boolean;
  /** Período de cada evento ("21/10/2026 – 25/10/2026"), por id. */
  eventPeriodById?: Map<string, string>;
  /** Decisões direto da fila (abrem os mesmos diálogos do detalhe). Sem elas a linha só abre o detalhe. */
  onApprove?: (item: ChangeRequestItem) => void;
  onReajustar?: (item: ChangeRequestItem) => void;
  onNegar?: (item: ChangeRequestItem) => void;
  busy?: boolean;
}

/** Filete colorido da linha, por tipo de pedido — a mesma leitura de cor dos badges. */
const RAIL_CLASS: Record<ChangeRequestType, string> = {
  ajuste: "bg-warning-strong",
  inclusao: "bg-success-strong",
  exclusao: "bg-danger-strong",
};

/** Resumo de uma linha: "vaga #12" ou "N vaga(s) nova(s)". */
export function targetLabel(r: ChangeRequestItem): string {
  if (r.requestType === "inclusao") {
    const q = r.proposed?.quantity ?? 1;
    return `${q} ${q === 1 ? "vaga nova" : "vagas novas"}`;
  }
  return r.inclusionNumber ? `vaga #${r.inclusionNumber}` : "vaga —";
}

function rowAriaLabel(r: ChangeRequestItem): string {
  const type = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
  return `Abrir pedido de ${type.toLowerCase()} — ${r.functionName ?? "função"}, ${targetLabel(r)}${r.canDecide ? " (você decide)" : ""}`;
}

/**
 * Conveniência de mouse: a linha inteira abre o pedido, mas cliques que nasceram
 * dentro de outro controle da linha (decidir, abrir, links, campos) são ignorados.
 * O foco/teclado continua no <button> do nome — a linha não é um tab stop.
 */
function isInnerControlClick(e: MouseEvent<HTMLTableRowElement>): boolean {
  return !!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"]');
}

/**
 * Selecionar texto de um motivo para copiar (arrastar o mouse) termina com um
 * mouseup na linha — e a linha abria o pedido em cima da seleção. Com texto
 * selecionado, o clique é da seleção, não da linha.
 */
function hasTextSelection(): boolean {
  return (window.getSelection?.()?.toString() ?? "") !== "";
}

const MAX_MUDANCAS = 3;

/**
 * O QUE o pedido muda, em linhas "campo  de → para" — o motivo sozinho
 * ("teste") obrigava a abrir cada pedido para descobrir (dono, 26/08). Até
 * 06/10 era uma frase corrida com " · " que quebrava no meio de uma data.
 * O texto inteiro continua no `title` (o mesmo `changeSummary` de antes).
 */
export function MudancasDoPedido({ r, max = MAX_MUDANCAS }: { r: ChangeRequestItem; max?: number }) {
  const resumo = changeSummary(r);
  if (r.requestType === "exclusao") {
    return <p className="text-xs font-medium text-danger" title={resumo}>Tirar a vaga da escala</p>;
  }
  if (r.requestType === "inclusao") {
    return resumo ? <p className="text-xs font-medium text-success" title={resumo}>{resumo}</p> : null;
  }
  const diff = r.diff ?? [];
  if (!diff.length) return <p className="text-xs text-muted-foreground">Nada muda em relação à vaga de hoje.</p>;
  return (
    <ul className="space-y-0.5 text-xs" title={resumo}>
      {diff.slice(0, max).map((d) => (
        <li key={d.field} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="text-muted-foreground">{d.label || PROPOSED_FIELD_LABELS[d.field] || d.field}</span>
          <span className="text-muted-foreground line-through decoration-muted-foreground/60">{formatProposedValue(d.field, d.from)}</span>
          <span className="text-muted-foreground" aria-label="para">→</span>
          <span className="font-semibold text-primary">{formatProposedValue(d.field, d.to)}</span>
        </li>
      ))}
      {diff.length > max && <li className="text-2xs text-muted-foreground">+ {diff.length - max} {diff.length - max === 1 ? "alteração" : "alterações"} no detalhe</li>}
    </ul>
  );
}

export function RequestQueue({ items, onOpen, showEvent = true, eventPeriodById, onApprove, onReajustar, onNegar, busy }: RequestQueueProps) {
  const canAct = !!(onApprove && onReajustar && onNegar);
  return (
    <div className="apr-tabela xl:rounded-xl xl:border xl:border-border xl:bg-card xl:shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Pedidos de ajuste, inclusão e exclusão</caption>
        <thead className="apr-cabecalho sticky z-10 border-b border-border bg-surface-muted [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
          <tr>
            <th scope="col" className="w-2 p-0"><span className="sr-only">Tipo (faixa)</span></th>
            <th scope="col" className={cn(TH, "w-[150px]")}>Pedido</th>
            <th scope="col" className={cn(TH, "w-[30%]")}>Função e vaga</th>
            <th scope="col" className={TH}>O que muda e por quê</th>
            <th scope="col" className={cn(TH, "text-right", canAct ? "w-[196px]" : "w-14")}>Decisão</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const pending = r.status === CHANGE_REQUEST_STATUS.PENDENTE;
            const decidable = pending && r.canDecide && canAct;
            const periodo = eventPeriodById?.get(r.eventId);
            const nome = r.functionName ?? "Sem função";
            return (
              <tr
                key={r.id}
                data-testid={`pedido-row-${r.id}`}
                onClick={(e) => { if (!isInnerControlClick(e) && !hasTextSelection()) onOpen(r); }}
                className="apr-linha apr-clicavel border-b border-border bg-card align-top last:border-b-0 hover:bg-surface-muted/60"
              >
                {/* Filete na altura toda da linha: o tipo lido antes do texto. */}
                <td data-col="rail" className="relative w-2 p-0">
                  <span className={cn("absolute inset-y-2.5 left-0 w-[3px] rounded-r-full", RAIL_CLASS[r.requestType as ChangeRequestType] ?? "bg-slate-300")} aria-hidden="true" />
                </td>
                <td data-primeira className="px-3 py-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <RequestTypeBadge type={r.requestType} />
                      <RequestStatusBadge status={r.status} />
                      {isPostValidationInclusion(r.inclusionState) && <PostScalingBadge />}
                    </div>
                    {/* Só a data de abertura — o "há N dias" saiu (04/09). */}
                    <span className="block whitespace-nowrap text-2xs tabular-nums text-muted-foreground">
                      Aberto em {formatDateBr(r.createdAt ? new Date(r.createdAt) : null)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="min-w-0 space-y-0.5">
                    {/* O nome é o ÚNICO botão de abrir na linha (04/09). */}
                    <button
                      type="button"
                      onClick={() => onOpen(r)}
                      aria-label={rowAriaLabel(r)}
                      className="block max-w-full break-words rounded-sm text-left text-sm font-semibold leading-5 text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={nome}
                    >
                      {nome}
                    </button>
                    <span className="block break-words text-2xs leading-4 text-muted-foreground">
                      <span className="font-medium tabular-nums text-slate-600">{targetLabel(r)}</span>
                      <span title={r.requestedByName ?? undefined}> · por {r.requestedByName}</span>
                    </span>
                    {/* A data embaixo do nome do evento (04/09): sem ela não se
                        sabe se o pedido é para a semana que vem ou daqui a dois meses. */}
                    {showEvent && <LinhaDoEvento nome={r.eventName ?? "Sem evento"} periodo={periodo} className="pt-1" />}
                    {pending && r.canDecide && <CanDecideBadge className="mt-1.5" />}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="min-w-0 space-y-1.5">
                    <MudancasDoPedido r={r} />
                    {/* Motivo embaixo do que muda: é a justificativa do pedido. */}
                    {r.reason
                      ? <p className="line-clamp-2 break-words border-l-2 border-border pl-2 text-xs italic text-slate-600" title={r.reason}>{r.reason}</p>
                      : <p className="text-xs text-muted-foreground" title="Sem motivo informado">Sem motivo informado</p>}
                    {r.par && (
                      <p className="text-2xs font-medium text-primary" data-testid={`pedido-par-${r.id}`}>
                        Em par com #{r.par.inclusionNumber ?? "?"} · {r.par.eventName ?? "outro evento"} — decididos juntos
                      </p>
                    )}
                  </div>
                </td>
                <td data-col="acoes" className="whitespace-nowrap py-2.5 pl-2 pr-3 text-right">
                  {decidable ? (
                    <span className="inline-flex items-center gap-0.5" role="group" aria-label={`Decidir o pedido de ${r.functionName ?? "função"}`}>
                      <button type="button" disabled={busy} onClick={() => onNegar!(r)}
                        aria-label={`Negar o pedido de ${r.functionName ?? "função"}`} title="Negar pedido"
                        className={cn(ICONE_DA_LINHA, "hover:bg-danger-soft hover:text-danger")}>
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {!r.grupoId && (
                      <button type="button" disabled={busy} onClick={() => onReajustar!(r)}
                        aria-label={`Reajustar o pedido de ${r.functionName ?? "função"}`} title="Reajustar pedido"
                        className={cn(ICONE_DA_LINHA, "mr-1 hover:bg-brand-soft hover:text-primary")}>
                        <PencilLine className="h-4 w-4" aria-hidden="true" />
                      </button>
                      )}
                      <button type="button" disabled={busy} onClick={() => onApprove!(r)}
                        aria-label={`Aprovar o pedido de ${r.functionName ?? "função"}`} className={cn(APROVAR_DA_LINHA, "w-[92px]")}>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Aprovar
                      </button>
                    </span>
                  ) : pending && !r.canDecide ? (
                    <span className="inline-block whitespace-normal text-left text-2xs leading-4 text-muted-foreground xl:text-right">Aprovador da função decide</span>
                  ) : (
                    // Decidido (ou sem ações): nada a fazer aqui; a seta só sinaliza que a linha abre.
                    <span className="apr-abrir inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground">
                      <span className="xl:hidden">{pending ? "Abrir pedido" : "Ver decisão"}</span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default RequestQueue;
