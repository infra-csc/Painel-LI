// Extraído de invoices.tsx em 25/09 (modularização): as etapas das notas
// fiscais do evento. Componente puro — recebe as contagens (e os valores).
//
// 08/10 (redesenho, irmão do resumo do Planejado): deixou de ser uma fileira
// de bolinhas de 14px com selos "N aguardando" e virou o painel de resumo da
// tela — as três etapas lado a lado, cada uma com o número grande, o que ele
// significa e quanto soma, ligadas por um filete (é um fluxo, não três KPIs
// soltos). A empresa pagadora entra no mesmo painel, à direita (slot).
//
// Regra de sempre: reflete o ESTÁGIO real dos itens do evento, não a aba
// ativa. Etapa sem pendências aparece concluída (✓ e "em dia").
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";

export type StepperCounts = { lancamento: number; aprovacao: number; checkin: number };

const ETAPAS: { id: keyof StepperCounts; label: string; sub: string; oQue: string }[] = [
  { id: "lancamento", label: "Lançamento",   sub: "a enviar",   oQue: "sem nota enviada ou com nota devolvida" },
  { id: "aprovacao",  label: "Aprovação RH", sub: "em análise", oQue: "com nota enviada, aguardando a análise do RH" },
  { id: "checkin",    label: "Check-in",     sub: "a fazer",    oQue: "com nota aprovada, aguardando o check-in financeiro" },
];

export function InvoiceStepper({ counts, valores, pagadora }: {
  counts: StepperCounts;
  /** Soma do Realizado dos mesmos itens de cada contagem (opcional). */
  valores?: StepperCounts;
  /** Bloco da empresa pagadora, à direita do fluxo (opcional). */
  pagadora?: ReactNode;
}) {
  return (
    <section
      aria-label="Resumo das notas fiscais do evento"
      className="flex flex-col md:flex-row rounded-xl border border-border bg-card overflow-hidden"
      data-testid="nf-resumo"
    >
      <ol className="grid grid-cols-3 flex-1 min-w-0" aria-label="Etapas das notas fiscais">
        {ETAPAS.map((etapa, i) => {
          const n = counts[etapa.id];
          const done = n === 0;
          const valor = valores?.[etapa.id] ?? 0;
          return (
            <li
              key={etapa.id}
              className={cn("min-w-0 px-3 sm:px-4 pt-3 pb-3.5", i > 0 && "border-l border-border")}
              title={done ? `${etapa.label}: nada pendente` : `${n} ${n === 1 ? "item" : "itens"} ${etapa.oQue}`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-2xs font-semibold tabular-nums shrink-0 transition-colors",
                    done ? "bg-success-soft text-success" : "bg-primary text-primary-foreground",
                  )}
                >
                  {done ? <Check className="w-3 h-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-xs font-semibold leading-4 min-w-0 sm:truncate", done ? "text-success" : "text-primary")}>
                  {etapa.label}
                </span>
                {/* O fio do fluxo: liga uma etapa à próxima. */}
                {i < ETAPAS.length - 1 && <span aria-hidden="true" className="hidden md:block flex-1 h-px bg-border ml-1" />}
              </div>
              <p className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
                <span className={cn("text-xl leading-6 font-semibold tabular-nums tracking-[-0.02em]", done ? "text-muted-foreground" : "text-foreground")}>
                  {n}
                </span>
                <span className="text-xs text-muted-foreground">{done ? "em dia" : etapa.sub}</span>
              </p>
              {valores && (
                <p className={cn("m-0 mt-0.5 text-xs tabular-nums truncate", done || valor === 0 ? "text-muted-foreground" : "text-slate-600")}>
                  {formatarMoeda(valor)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {pagadora && (
        <div className="md:w-[220px] lg:w-[300px] xl:w-[340px] shrink-0 border-t md:border-t-0 md:border-l border-border">
          {pagadora}
        </div>
      )}
    </section>
  );
}
