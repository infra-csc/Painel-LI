/**
 * Peças do detalhe do pedido e dos diálogos de decisão: o de → para, a lista
 * da vaga proposta, a vaga inteira como está hoje e o motivo do solicitante.
 *
 * 07/10 (redesenho): cabeçalhos em caixa de frase e cantos/sombras do resto do
 * módulo; o "para" do de → para ganhou peso (é o que se decide), e o "de"
 * riscado continua legível (informação, não decoração).
 */
import { MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROPOSED_FIELD_LABELS, type InclusionDiffEntry, type ProposedChanges, type ProposedField } from "@shared/scaling-validation-rules";
import { formatProposedValue } from "./request-badges";
import type { TeamInclusion } from "@shared/schema";
import { draftFromProposed, fullFromDraft } from "./proposed-changes-form";

/** `th` do de/para — caixa de frase, como as tabelas do módulo. */
const DIFF_TH = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";

/** Tabela "de → para" (pedido de AJUSTE) a partir do `diff` que o servidor devolve. */
export function DiffTable({ diff, className, tom = "resultado" }: { diff: InclusionDiffEntry[]; className?: string; tom?: "resultado" | "pedido" }) {
  if (diff.length === 0) {
    return <p className={cn("rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground", className)}>Nenhuma diferença em relação à vaga atual.</p>;
  }
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <table className="w-full table-fixed text-xs">
        <caption className="sr-only">Alterações pedidas (de / para)</caption>
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={cn(DIFF_TH, "w-[34%]")}>Campo</th>
            <th scope="col" className={DIFF_TH}>De</th>
            <th scope="col" className={DIFF_TH}>Para</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((d) => (
            <tr key={d.field} className="border-b border-border align-top last:border-b-0">
              <td className="px-3 py-2.5 font-medium text-slate-700">{d.label || PROPOSED_FIELD_LABELS[d.field] || d.field}</td>
              {/* O valor antigo é informação, não decoração: ainda lê no riscado. */}
              <td className="break-words px-3 py-2.5 text-muted-foreground line-through decoration-muted-foreground/60">{formatProposedValue(d.field, d.from)}</td>
              <td className={cn("break-words px-3 py-2.5 text-[13px] font-semibold", tom === "pedido" ? "text-primary" : "text-success")}>{formatProposedValue(d.field, d.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista completa dos campos propostos (pedido de INCLUSÃO) + quantidade. */
export function ProposedList({ proposed, className, semQuantidade = false }: { proposed: ProposedChanges | null; className?: string; semQuantidade?: boolean }) {
  if (!proposed) return <p className={cn("text-xs text-muted-foreground", className)}>Sem detalhes da vaga proposta.</p>;
  const fields = (Object.keys(PROPOSED_FIELD_LABELS) as ProposedField[]).filter((f) => proposed[f] !== undefined);
  return (
    <dl className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-xs", className)}>
      {!semQuantidade && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 bg-success-soft/50 px-3 py-2.5">
          <dt className="font-medium text-slate-700">Quantidade de vagas</dt>
          <dd className="font-bold tabular-nums text-success">{proposed.quantity ?? 1}</dd>
        </div>
      )}
      {fields.map((f) => (
        <div key={f} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 px-3 py-2.5">
          <dt className="text-muted-foreground">{PROPOSED_FIELD_LABELS[f]}</dt>
          <dd className="break-words font-medium text-foreground">{formatProposedValue(f, proposed[f])}</dd>
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
/** Campos que só entram no resumo da vaga quando preenchidos (09/10). */
const SO_QUANDO_TEM = new Set<ProposedField>(["idaVemDoEventoId", "voltaSegueParaEventoId", "trechosSugeridos", "city"]);

export function VagaCompleta({ inclusion, falhou, className }: { inclusion: TeamInclusion | null | undefined; falhou?: boolean; className?: string }) {
  // A vaga pode vir por uma busca separada (pedido de ajuste sobre vaga já
  // escalada); se essa busca falhar, "Carregando…" para sempre esconderia o
  // problema — a pessoa precisa saber que a lista abaixo não veio.
  if (!inclusion && falhou) return <p className={cn("rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-xs text-danger", className)} role="alert">Não foi possível carregar a vaga — recarregue a página para tentar de novo.</p>;
  if (!inclusion) {
    return (
      <div className={cn("overflow-hidden rounded-xl border border-border bg-border", className)} role="status" aria-label="Carregando a vaga">
        <div className="grid grid-cols-2 gap-px md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 bg-card px-3 py-2.5">
              <div className="val-osso h-2.5 w-14" />
              <div className="val-osso h-3.5 w-20" />
              <div className="val-osso h-3.5 w-16" />
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
      ? <span className="text-muted-foreground" title="não definido">—</span>
      : <span className="text-foreground">{formatProposedValue(f, v)}</span>;
  };
  const blocos: { titulo: string; campos: [ProposedField, string][] }[] = [
    { titulo: "Trabalho", campos: [["workDays", "Dias"], ["dailyRates", "Diárias"]] },
    { titulo: "Ida", campos: [["city", "Sai de"], ["flightDepartureDate", "Data"], ["flightArrivalSuggestedTime", "Chegar até"], ["flightDepartureSuggestedTime", "Saída sugerida"], ["transportModeIda", "Transporte"], ["idaVemDoEventoId", "Vem direto de"]] },
    { titulo: "Volta", campos: [["flightReturnDate", "Data"], ["flightReturnSuggestedTime", "Sair após"], ["transportModeVolta", "Transporte"], ["voltaSegueParaEventoId", "Segue direto para"]] },
    { titulo: "Logística", campos: [["needsTicket", "Passagem"], ["needsAccommodation", "Hospedagem"], ["trechosSugeridos", "Trechos"]] },
  ];
  const obs = String(completa.observations ?? "").trim();
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-border text-xs", className)} data-testid="vaga-completa">
      <div className="grid grid-cols-2 gap-px md:grid-cols-4">
        {blocos.map((bl) => (
          <section key={bl.titulo} className="min-w-0 bg-card px-3 py-2.5" aria-label={bl.titulo}>
            <p className="mb-1.5 text-xs font-semibold text-foreground">{bl.titulo}</p>
            <dl className="space-y-1.5">
              {/* Trecho direto / uma perna (09/10): só aparece quando a vaga tem. */}
              {bl.campos.filter(([f]) => !SO_QUANDO_TEM.has(f) || !!completa[f]).map(([f, rotulo]) => (
                <div key={f} className="min-w-0">
                  <dt className="text-2xs text-muted-foreground">{rotulo}</dt>
                  <dd className="break-words text-[13px] font-medium leading-snug">{valor(f)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {obs && (
        <section className="border-t border-border bg-card px-3 py-2.5" aria-label="Observações">
          <p className="mb-1 text-xs font-semibold text-foreground">Observações</p>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{obs}</p>
        </section>
      )}
    </div>
  );
}

/** Motivo do solicitante, em destaque — filete da marca, título em caixa de frase. */
export function ReasonBlock({ reason, by, className }: { reason: string; by?: string | null; className?: string }) {
  return (
    <blockquote className={cn("relative overflow-hidden rounded-xl border border-primary/20 bg-brand-soft/40 py-3 pl-4 pr-4", className)}>
      <span className="absolute inset-y-0 left-0 w-[3px] bg-primary opacity-70" aria-hidden="true" />
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold leading-5 text-primary">
        <MessageSquareQuote className="h-4 w-4" aria-hidden="true" /> Motivo do solicitante{by ? <span className="font-normal text-slate-600"> · {by}</span> : ""}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm text-foreground">{reason || "Sem motivo informado"}</p>
    </blockquote>
  );
}

