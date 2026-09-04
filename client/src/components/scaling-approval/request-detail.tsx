import { MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROPOSED_FIELD_LABELS, type InclusionDiffEntry, type ProposedChanges, type ProposedField } from "@shared/scaling-validation-rules";
import { formatProposedValue } from "./request-badges";
import type { TeamInclusion } from "@shared/schema";
import { draftFromProposed, fullFromDraft } from "./proposed-changes-form";
import { SECTION } from "./tokens";

/** `th` do de/para no mesmo micro-rótulo das outras tabelas do módulo. */
const DIFF_TH = `px-3 py-2 text-left ${SECTION}`;

/** Tabela "de → para" (pedido de AJUSTE) a partir do `diff` que o servidor devolve. */
export function DiffTable({ diff, className, tom = "resultado" }: { diff: InclusionDiffEntry[]; className?: string; tom?: "resultado" | "pedido" }) {
  if (diff.length === 0) {
    return <p className={cn("text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center", className)}>Nenhuma diferença em relação à vaga atual.</p>;
  }
  return (
    <div className={cn("rounded-xl border border-slate-200 overflow-hidden", className)}>
      <table className="w-full text-xs">
        <caption className="sr-only">Alterações pedidas (de / para)</caption>
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th scope="col" className={DIFF_TH}>Campo</th>
            <th scope="col" className={DIFF_TH}>De</th>
            <th scope="col" className={DIFF_TH}>Para</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((d) => (
            <tr key={d.field} className="border-b border-slate-100 last:border-b-0 align-top">
              <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{d.label || PROPOSED_FIELD_LABELS[d.field] || d.field}</td>
              {/* O valor antigo é informação, não decoração: slate-500 ainda lê no riscado. */}
              <td className="px-3 py-2 text-slate-500 line-through break-words">{formatProposedValue(d.field, d.from)}</td>
              <td className={cn("px-3 py-2 font-medium break-words", tom === "pedido" ? "text-primary" : "text-emerald-800")}>{formatProposedValue(d.field, d.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista completa dos campos propostos (pedido de INCLUSÃO) + quantidade. */
export function ProposedList({ proposed, className, semQuantidade = false }: { proposed: ProposedChanges | null; className?: string; semQuantidade?: boolean }) {
  if (!proposed) return <p className={cn("text-xs text-slate-500", className)}>Sem detalhes da vaga proposta.</p>;
  const fields = (Object.keys(PROPOSED_FIELD_LABELS) as ProposedField[]).filter((f) => proposed[f] !== undefined);
  return (
    <dl className={cn("rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs", className)}>
      {!semQuantidade && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 px-3 py-2 bg-emerald-50/50">
          <dt className="font-semibold text-slate-700">Quantidade de vagas</dt>
          <dd className="font-bold text-emerald-800 tabular-nums">{proposed.quantity ?? 1}</dd>
        </div>
      )}
      {fields.map((f) => (
        <div key={f} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 px-3 py-2">
          <dt className="font-semibold text-slate-600">{PROPOSED_FIELD_LABELS[f]}</dt>
          <dd className="text-slate-800 break-words">{formatProposedValue(f, proposed[f])}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A vaga inteira, como está hoje (04/09).
 *
 * O pedido mostrava só o que muda — "Horário sugerido de chegada: 22h → 07:00"
 * — e o aprovador decidia sem ver os dias, a volta, a passagem, o hotel. Uma
 * alteração não se avalia sozinha: 07:00 é cedo ou tarde dependendo de quando
 * a pessoa trabalha. Reaproveita o mesmo rascunho que o formulário de reajuste
 * usa, então a lista é exatamente o que o servidor conhece da vaga.
 */
export function VagaCompleta({ inclusion, falhou, className }: { inclusion: TeamInclusion | null | undefined; falhou?: boolean; className?: string }) {
  // A vaga pode vir por uma busca separada (pedido de ajuste sobre vaga já
  // escalada); se essa busca falhar, "Carregando…" para sempre esconderia o
  // problema — a pessoa precisa saber que a lista abaixo não veio.
  if (!inclusion && falhou) return <p className={cn("text-xs text-red-600", className)}>Não foi possível carregar a vaga — recarregue a página para tentar de novo.</p>;
  if (!inclusion) {
    return (
      <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-slate-100", className)} role="status" aria-label="Carregando a vaga">
        <div className="grid grid-cols-2 gap-px md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 bg-white px-3 py-2.5">
              <div className="h-2 w-12 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <span className="sr-only">Carregando a vaga…</span>
      </div>
    );
  }
  const completa = fullFromDraft(draftFromProposed(null, inclusion));
  // Um card só, em quatro colunas, rótulo em cima e valor embaixo — o mesmo
  // desenho do card "Período de trabalho" do modal da Escalação (04/09). No
  // resumo, vazio é "—": "não definido" repetido quatro vezes era só ruído.
  const valor = (f: ProposedField) => {
    const v = completa[f];
    const vazio = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    return vazio
      // O "—" de vazio fica claro de propósito (com `title`): é ausência, não valor.
      ? <span className="text-slate-400" title="não definido">—</span>
      : <span className="text-slate-700">{formatProposedValue(f, v)}</span>;
  };
  const blocos: { titulo: string; campos: [ProposedField, string][] }[] = [
    { titulo: "Trabalho", campos: [["workDays", "Dias"], ["dailyRates", "Diárias"]] },
    { titulo: "Ida", campos: [["flightDepartureDate", "Data"], ["flightArrivalSuggestedTime", "Chegar até"], ["flightDepartureSuggestedTime", "Saída sugerida"], ["transportModeIda", "Transporte"]] },
    { titulo: "Volta", campos: [["flightReturnDate", "Data"], ["flightReturnSuggestedTime", "Sair após"], ["transportModeVolta", "Transporte"]] },
    { titulo: "Logística", campos: [["needsTicket", "Passagem"], ["needsAccommodation", "Hospedagem"]] },
  ];
  const obs = String(completa.observations ?? "").trim();
  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-xs", className)} data-testid="vaga-completa">
      <div className="grid grid-cols-2 gap-px md:grid-cols-4">
        {blocos.map((bl) => (
          <section key={bl.titulo} className="min-w-0 bg-white px-3 py-2.5" aria-label={bl.titulo}>
            <p className={cn("mb-1.5", SECTION)}>{bl.titulo}</p>
            <dl className="space-y-1.5">
              {bl.campos.map(([f, rotulo]) => (
                <div key={f} className="min-w-0">
                  <dt className="text-[11px] text-slate-500">{rotulo}</dt>
                  <dd className="text-[13px] font-semibold leading-snug break-words">{valor(f)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {obs && (
        <section className="border-t border-slate-100 bg-white px-3 py-2.5" aria-label="Observações">
          <p className={cn("mb-1", SECTION)}>Observações</p>
          <p className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">{obs}</p>
        </section>
      )}
    </div>
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
