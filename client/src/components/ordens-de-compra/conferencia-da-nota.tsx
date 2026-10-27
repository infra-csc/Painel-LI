/**
 * Conferência da nota × OC registrada × CNPJ emissor (28/10, etapa 6) — a
 * mesma peça nas Ordens de compra e na Aprovação DP de Notas fiscais.
 *
 *  - `SeloDaConferencia`: "Confere" (verde), "Divergente" (vermelho, com
 *    quantas) ou "Sem como conferir" (falta um dos lados — ex.: a nota foi
 *    lançada sem o valor);
 *  - `QuadroDaConferencia`: os três itens lado a lado — o que a OC diz e o
 *    que a nota diz — com a diferença do valor em R$ e as frases das
 *    divergências do servidor.
 */
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { mascararCnpj } from "@shared/cnpj";
import type { ConferenciaDaNota, ConferenciaDoItem } from "@shared/honorarios-pagamento";
import { reais } from "./oc-utils";

export type ResultadoDaConferencia = "confere" | "divergente" | "incompleta";

export function resultadoDaConferencia(c: ConferenciaDaNota | null | undefined): ResultadoDaConferencia {
  if (!c) return "incompleta";
  if (c.confere) return "confere";
  if (c.oc.confere === false || c.valor.confere === false || c.cnpj.confere === false || !c.oc.esperado) return "divergente";
  return "incompleta";
}

const TOM: Record<ResultadoDaConferencia, string> = {
  confere: "border-success/30 bg-success-soft text-success",
  divergente: "border-danger/30 bg-danger-soft text-danger",
  incompleta: "border-border bg-surface-muted text-slate-600",
};

/** O que falta para conferir (a nota foi lançada sem valor, sem CNPJ…). */
function faltas(c: ConferenciaDaNota): string[] {
  const f: string[] = [];
  if (c.oc.confere === null && c.oc.esperado) f.push("a nota não traz o nº da OC");
  if (c.valor.confere === null) f.push(c.valor.esperado == null ? "a OC sem valor" : "a nota sem o valor");
  if (c.cnpj.confere === null) f.push(c.cnpj.esperado ? "a nota sem o CNPJ" : "a prestação sem CNPJ emissor");
  return f;
}

export function SeloDaConferencia({ conferencia, className, testid }: { conferencia: ConferenciaDaNota | null | undefined; className?: string; testid?: string }) {
  const r = resultadoDaConferencia(conferencia);
  const n = conferencia?.divergencias.length ?? 0;
  const Icone = r === "confere" ? CheckCircle2 : r === "divergente" ? AlertTriangle : HelpCircle;
  const rotulo = r === "confere" ? "Confere" : r === "divergente" ? (n > 1 ? `${n} divergências` : "Divergente") : "Sem como conferir";
  const dica = !conferencia ? "Ainda não há nota para conferir."
    : r === "confere" ? "Nº da OC, valor e CNPJ da nota batem com a OC registrada."
    : r === "divergente" ? conferencia.divergencias.join(" ")
    : `Não dá para conferir tudo: ${faltas(conferencia).join(", ") || "falta um dos lados"}.`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn("inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border px-1.5 text-2xs font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", TOM[r], className)}
          aria-label={`Conferência: ${rotulo}. ${dica}`}
          data-testid={testid}
          data-resultado={r}
        >
          <Icone className="h-3 w-3" aria-hidden="true" />{rotulo}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] text-xs leading-relaxed">{dica}</TooltipContent>
    </Tooltip>
  );
}

function Item<T>({ titulo, item, formatar, extra }: { titulo: string; item: ConferenciaDoItem<T>; formatar: (v: T) => string; extra?: string | null }) {
  const tom = item.confere === true ? "text-success" : item.confere === false ? "text-danger" : "text-muted-foreground";
  const Icone = item.confere === true ? CheckCircle2 : item.confere === false ? AlertTriangle : HelpCircle;
  return (
    <div className={cn("min-w-0 rounded-lg border px-3 py-2", item.confere === false ? "border-danger/30 bg-danger-soft/50" : "border-border bg-card")} data-confere={String(item.confere)}>
      <p className={cn("m-0 flex items-center gap-1 text-2xs font-semibold uppercase tracking-[0.05em]", tom)}>
        <Icone className="h-3 w-3" aria-hidden="true" />{titulo}
      </p>
      <dl className="m-0 mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs leading-5">
        <dt className="text-muted-foreground">OC</dt>
        <dd className="m-0 min-w-0 truncate font-medium tabular-nums text-foreground" title={item.esperado != null ? formatar(item.esperado) : undefined}>{item.esperado != null ? formatar(item.esperado) : "—"}</dd>
        <dt className="text-muted-foreground">Nota</dt>
        <dd className={cn("m-0 min-w-0 truncate font-medium tabular-nums", item.confere === false ? "text-danger" : "text-foreground")} title={item.informado != null ? formatar(item.informado) : undefined}>
          {item.informado != null ? formatar(item.informado) : "não informado"}
        </dd>
      </dl>
      {extra && <p className="m-0 mt-0.5 text-2xs font-semibold tabular-nums text-danger">{extra}</p>}
    </div>
  );
}


export function QuadroDaConferencia({ conferencia, className }: { conferencia: ConferenciaDaNota; className?: string }) {
  const dif = conferencia.valor.diferenca;
  return (
    <div className={cn("min-w-0", className)} data-testid="quadro-da-conferencia">
      <div className="grid gap-2 sm:grid-cols-3">
        <Item titulo="Nº da OC" item={conferencia.oc} formatar={(v) => v} />
        <Item titulo="Valor" item={conferencia.valor} formatar={reais}
          extra={dif != null && dif !== 0 ? `${dif > 0 ? "+" : "−"}${reais(Math.abs(dif))} ${dif > 0 ? "acima" : "abaixo"} da OC` : null} />
        <Item titulo="CNPJ" item={conferencia.cnpj} formatar={mascararCnpj} />
      </div>
      {conferencia.divergencias.length > 0 && (
        <ul className="m-0 mt-2 list-none space-y-0.5 p-0 text-xs leading-5 text-danger" data-testid="divergencias">
          {conferencia.divergencias.map((d) => <li key={d} className="flex gap-1.5"><span aria-hidden="true">•</span><span className="min-w-0">{d}</span></li>)}
        </ul>
      )}
    </div>
  );
}
