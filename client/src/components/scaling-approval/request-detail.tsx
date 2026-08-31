import { MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROPOSED_FIELD_LABELS, type InclusionDiffEntry, type ProposedChanges, type ProposedField } from "@shared/scaling-validation-rules";
import { formatProposedValue } from "./request-badges";

/** Tabela "de → para" (pedido de AJUSTE) a partir do `diff` que o servidor devolve. */
export function DiffTable({ diff, className, tom = "resultado" }: { diff: InclusionDiffEntry[]; className?: string; tom?: "resultado" | "pedido" }) {
  if (diff.length === 0) {
    return <p className={cn("text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center", className)}>Nenhuma diferença em relação à vaga atual.</p>;
  }
  return (
    <div className={cn("rounded-xl border border-slate-200 overflow-hidden", className)}>
      <table className="w-full text-xs">
        <caption className="sr-only">Alterações pedidas (de / para)</caption>
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-[10px] text-slate-400">Campo</th>
            <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-[10px] text-slate-400">De</th>
            <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-[10px] text-slate-400">Para</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((d) => (
            <tr key={d.field} className="border-b border-slate-100 last:border-b-0 align-top">
              <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{d.label || PROPOSED_FIELD_LABELS[d.field] || d.field}</td>
              <td className="px-3 py-2 text-slate-400 line-through break-words">{formatProposedValue(d.field, d.from)}</td>
              <td className={cn("px-3 py-2 font-medium break-words", tom === "pedido" ? "text-primary" : "text-emerald-800")}>{formatProposedValue(d.field, d.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista completa dos campos propostos (pedido de INCLUSÃO) + quantidade. */
export function ProposedList({ proposed, className }: { proposed: ProposedChanges | null; className?: string }) {
  if (!proposed) return <p className={cn("text-xs text-slate-400", className)}>Sem detalhes da vaga proposta.</p>;
  const fields = (Object.keys(PROPOSED_FIELD_LABELS) as ProposedField[]).filter((f) => proposed[f] !== undefined);
  return (
    <dl className={cn("rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 px-3 py-2 bg-emerald-50/50">
        <dt className="font-semibold text-slate-700">Quantidade de vagas</dt>
        <dd className="font-bold text-emerald-800 tabular-nums">{proposed.quantity ?? 1}</dd>
      </div>
      {fields.map((f) => (
        <div key={f} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 px-3 py-2">
          <dt className="font-semibold text-slate-600">{PROPOSED_FIELD_LABELS[f]}</dt>
          <dd className="text-slate-800 break-words">{formatProposedValue(f, proposed[f])}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Motivo do solicitante, em destaque. */
export function ReasonBlock({ reason, by, className }: { reason: string; by?: string | null; className?: string }) {
  return (
    <blockquote className={cn("rounded-xl border-l-4 border-primary bg-brand-soft/40 px-4 py-3", className)}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary mb-1">
        <MessageSquareQuote className="w-3.5 h-3.5" aria-hidden="true" /> Motivo do solicitante{by ? ` · ${by}` : ""}
      </p>
      <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{reason || "Sem motivo informado"}</p>
    </blockquote>
  );
}
