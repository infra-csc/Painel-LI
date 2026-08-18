import { ChevronRight, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { CHANGE_REQUEST_STATUS, daysPending } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem } from "./types";
import { RequestAgeBadge, RequestStatusBadge, RequestTypeBadge } from "./request-badges";

interface RequestQueueProps {
  items: ChangeRequestItem[];
  onOpen: (item: ChangeRequestItem) => void;
  /** Mostrar a coluna do evento (quando o filtro é "todos"). */
  showEvent?: boolean;
}

const TH = "px-3 py-2 text-left text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap";

/** Resumo de uma linha: "vaga #12" ou "N vaga(s) nova(s)". */
function targetLabel(r: ChangeRequestItem): string {
  if (r.requestType === "inclusao") {
    const q = r.proposed?.quantity ?? 1;
    return `${q} ${q === 1 ? "vaga nova" : "vagas novas"}`;
  }
  return r.inclusionNumber ? `vaga #${r.inclusionNumber}` : "vaga —";
}

/** Nível 1 — fila de pedidos (tabela ≥ md, cards < md). */
export function RequestQueue({ items, onOpen, showEvent = true }: RequestQueueProps) {
  return (
    <>
      <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">Pedidos de ajuste, inclusão e exclusão</caption>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={TH}>Tipo</th>
                <th className={TH}>Função / vaga</th>
                {showEvent && <th className={TH}>Evento</th>}
                <th className={TH}>Solicitante</th>
                <th className={TH}>Aberto</th>
                <th className={TH}>Status</th>
                <th className={cn(TH, "text-right")}><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => {
                const pending = r.status === CHANGE_REQUEST_STATUS.PENDENTE;
                const days = daysPending(r.createdAt);
                return (
                  <tr
                    key={r.id}
                    className={cn("border-b border-slate-100 transition-colors cursor-pointer hover:bg-brand-soft/30", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}
                    onClick={() => onOpen(r)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r); } }}
                    tabIndex={0}
                    aria-label={`Abrir pedido de ${r.requestType} — ${r.functionName ?? ""}`}
                  >
                    <td className="px-3 py-2"><RequestTypeBadge type={r.requestType} /></td>
                    <td className="px-3 py-2 max-w-[280px]">
                      <span className="block font-semibold text-slate-800 truncate" title={r.functionName ?? undefined}>{r.functionName ?? "—"}</span>
                      <span className="block text-[11px] text-slate-400 font-mono">{targetLabel(r)}{r.area ? ` · ${r.area}` : ""}</span>
                    </td>
                    {showEvent && <td className="px-3 py-2 text-xs text-slate-600 max-w-[220px]"><span className="block truncate" title={r.eventName ?? undefined}>{r.eventName ?? "—"}</span></td>}
                    <td className="px-3 py-2 text-xs text-slate-700">
                      <span className="block truncate max-w-[180px]">{r.requestedByName}</span>
                      {r.reason && <span className="flex items-center gap-1 text-[11px] text-slate-400 truncate max-w-[220px]" title={r.reason}><MessageSquareText className="w-3 h-3 shrink-0" aria-hidden="true" />{r.reason}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {pending ? <RequestAgeBadge days={days} /> : <span className="font-mono text-slate-500">{formatDateBr(r.createdAt ? new Date(r.createdAt) : null)}</span>}
                    </td>
                    <td className="px-3 py-2"><RequestStatusBadge status={r.status} /></td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-primary" onClick={(e) => { e.stopPropagation(); onOpen(r); }}>
                        Abrir <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
                      </Button>
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
              <div className="flex flex-wrap items-center gap-1.5">
                <RequestTypeBadge type={r.requestType} />
                <RequestStatusBadge status={r.status} />
                {pending && <RequestAgeBadge days={days} />}
              </div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">
                {r.functionName ?? "—"} <span className="font-mono text-xs text-slate-400 font-normal">· {targetLabel(r)}</span>
              </p>
              <p className="text-[11px] text-slate-500">{showEvent && r.eventName ? `${r.eventName} · ` : ""}por {r.requestedByName}{!pending && r.createdAt ? ` · ${formatDateBr(new Date(r.createdAt))}` : ""}</p>
              {r.reason && <p className="text-xs text-slate-600 line-clamp-2">{r.reason}</p>}
              <Button type="button" size="sm" variant="outline" className="w-full rounded-lg" onClick={() => onOpen(r)}>
                Abrir <ChevronRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default RequestQueue;
