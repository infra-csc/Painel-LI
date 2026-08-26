import type { MouseEvent } from "react";
import { CheckCircle2, ChevronRight, PencilLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { CHANGE_REQUEST_STATUS, CHANGE_REQUEST_TYPE_LABELS, daysPending, type ChangeRequestType } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem } from "./types";
import { CanDecideBadge, PostScalingBadge, RequestAgeBadge, RequestStatusBadge, RequestTypeBadge } from "./request-badges";
import { isPostValidationInclusion } from "@shared/scaling-change-window";

interface RequestQueueProps {
  items: ChangeRequestItem[];
  onOpen: (item: ChangeRequestItem) => void;
  /** Mostrar a coluna do evento (quando o filtro é "todos"). */
  showEvent?: boolean;
  /** Decisões direto da fila (abrem os mesmos diálogos do detalhe). Sem elas a linha só abre o detalhe. */
  onApprove?: (item: ChangeRequestItem) => void;
  onReajustar?: (item: ChangeRequestItem) => void;
  onNegar?: (item: ChangeRequestItem) => void;
  busy?: boolean;
}

const TH = "px-2.5 py-2 text-left text-[11px] uppercase tracking-[0.06em] text-slate-500 font-semibold whitespace-nowrap border-b border-slate-200";
const ICON_BTN = "h-7 w-7 p-0 rounded-lg";

/** Faixa colorida da linha, por tipo de pedido — a mesma leitura de cor dos badges. */
const RAIL_CLASS: Record<ChangeRequestType, string> = {
  ajuste: "bg-amber-400",
  inclusao: "bg-emerald-400",
  exclusao: "bg-red-400",
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

/** Nível 1 — fila de pedidos (tabela ≥ md, cards < md). Decisão na própria linha ou pelo detalhe. */
export function RequestQueue({ items, onOpen, showEvent = true, onApprove, onReajustar, onNegar, busy }: RequestQueueProps) {
  const canAct = !!(onApprove && onReajustar && onNegar);
  return (
    <>
      <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13px]">
            <caption className="sr-only">Pedidos de ajuste, inclusão e exclusão</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={cn(TH, "w-9 px-0 pl-3")}><span className="sr-only">Tipo (faixa)</span></th>
                <th scope="col" className={TH}>Pedido</th>
                <th scope="col" className={TH}>Função / vaga</th>
                {showEvent && <th scope="col" className={TH}>Evento</th>}
                <th scope="col" className={cn(TH, "min-w-[240px]")}>Motivo</th>
                <th scope="col" className={TH}>Aberto</th>
                <th scope="col" className={cn(TH, "text-right", canAct ? "min-w-[230px]" : "min-w-[60px]")}>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => {
                const pending = r.status === CHANGE_REQUEST_STATUS.PENDENTE;
                const days = daysPending(r.createdAt);
                const decidable = pending && r.canDecide && canAct;
                return (
                  <tr
                    key={r.id}
                    onClick={(e) => { if (!isInnerControlClick(e)) onOpen(r); }}
                    className={cn(
                      "border-b border-slate-100 cursor-pointer transition-colors hover:bg-brand-soft/30",
                      i % 2 === 1 ? "bg-slate-50/50" : "bg-white",
                    )}
                  >
                    <td className="w-9 p-0">
                      <span className={cn("block w-1 h-12 ml-3 rounded-full", RAIL_CLASS[r.requestType as ChangeRequestType] ?? "bg-slate-300")} aria-hidden="true" />
                    </td>
                    <td className="px-2.5 py-2 align-middle">
                      <div className="flex flex-col items-start gap-1">
                        <RequestTypeBadge type={r.requestType} />
                        {isPostValidationInclusion(r.inclusionState) && <PostScalingBadge />}
                        <RequestStatusBadge status={r.status} />
                      </div>
                    </td>
                    <td className="px-2.5 py-2 align-middle max-w-[240px]">
                      <button
                        type="button"
                        onClick={() => onOpen(r)}
                        aria-label={rowAriaLabel(r)}
                        className="block max-w-full truncate text-left font-semibold text-slate-800 rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={r.functionName ?? undefined}
                      >
                        {r.functionName ?? "—"}
                      </button>
                      <span className="block text-[11px] text-slate-400 font-mono">{targetLabel(r)}{r.area ? ` · ${r.area}` : ""}</span>
                      <span className="block text-[11px] text-slate-400 truncate" title={r.requestedByName ?? undefined}>por {r.requestedByName}</span>
                    </td>
                    {showEvent && <td className="px-2.5 py-2 align-middle text-xs text-slate-600 max-w-[180px]"><span className="block truncate" title={r.eventName ?? undefined}>{r.eventName ?? "—"}</span></td>}
                    <td className="px-2.5 py-2 align-middle min-w-[240px] max-w-[340px]">
                      {r.reason
                        ? <span className="block text-xs text-slate-600 truncate" title={r.reason}>{r.reason}</span>
                        : <span className="block text-xs text-slate-300">—</span>}
                      {pending && r.canDecide && <CanDecideBadge className="mt-1" />}
                    </td>
                    <td className="px-2.5 py-2 align-middle whitespace-nowrap">
                      {pending
                        ? <RequestAgeBadge days={days} />
                        : <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-400">{formatDateBr(r.createdAt ? new Date(r.createdAt) : null)}</span>}
                    </td>
                    <td className="px-2.5 py-2 align-middle text-right">
                      <span className="inline-flex items-center gap-1.5">
                        {decidable && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" size="sm" variant="outline" className={cn(ICON_BTN, "text-red-700 border-red-200 hover:bg-red-50")} disabled={busy}
                                  onClick={() => onNegar!(r)} aria-label={`Negar o pedido de ${r.functionName ?? "função"}`}>
                                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">Negar pedido</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" size="sm" variant="outline" className={ICON_BTN} disabled={busy}
                                  onClick={() => onReajustar!(r)} aria-label={`Reajustar o pedido de ${r.functionName ?? "função"}`}>
                                  <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">Reajustar pedido</TooltipContent>
                            </Tooltip>
                            <Button type="button" size="sm" className="h-7 rounded-lg px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy}
                              onClick={() => onApprove!(r)} aria-label={`Aprovar o pedido de ${r.functionName ?? "função"}`}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Aprovar
                            </Button>
                          </>
                        )}
                        {pending && !r.canDecide && (
                          <span className="text-[11px] text-slate-400">Aprovador da função decide</span>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className={cn(ICON_BTN, "text-primary")} onClick={() => onOpen(r)} aria-label={rowAriaLabel(r)}>
                              <ChevronRight className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Abrir pedido</TooltipContent>
                        </Tooltip>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="md:hidden space-y-2" aria-label="Pedidos">
        {items.map((r) => {
          const pending = r.status === CHANGE_REQUEST_STATUS.PENDENTE;
          const days = daysPending(r.createdAt);
          return (
            <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <RequestTypeBadge type={r.requestType} />
                  {isPostValidationInclusion(r.inclusionState) && <PostScalingBadge />}
                  <RequestStatusBadge status={r.status} />
                  {pending && <RequestAgeBadge days={days} />}
                  {pending && r.canDecide && <CanDecideBadge />}
                </div>
                <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-primary shrink-0 -mr-1" onClick={() => onOpen(r)} aria-label={rowAriaLabel(r)}>
                  Abrir <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
                </Button>
              </div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">
                {r.functionName ?? "—"} <span className="font-mono text-xs text-slate-400 font-normal">· {targetLabel(r)}</span>
              </p>
              <p className="text-[11px] text-slate-500">{showEvent && r.eventName ? `${r.eventName} · ` : ""}por {r.requestedByName}{!pending && r.createdAt ? ` · ${formatDateBr(new Date(r.createdAt))}` : ""}</p>
              {r.reason && <p className="text-xs text-slate-600 line-clamp-2" title={r.reason}>{r.reason}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default RequestQueue;
