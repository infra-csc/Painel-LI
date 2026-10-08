// Extraído de rh-control.tsx em 25/09 (modularização); redesenho 08/10.
//
// O trilho Escalação → Planejado → Realizado → Comparativo → Nota fiscal →
// Check-in no corpo da prestação aberta. Antes: círculos de 24px com "ping"
// infinito na etapa atual e cores diferentes por etapa (azul nas quatro
// primeiras, verde só na NF). Agora o MESMO desenho do trilho do Planejado e
// do Comparativo: feitas em verde com ✓, a atual com o anel que pulsa duas
// vezes ao chegar (pla-etapa-atual), a nota em âmbar enquanto espera alguém,
// recusa em vermelho; a data de cada etapa embaixo. A regra de cada estado é a
// de antes, linha por linha (getTimelineStep, getStepDate, tooltips).
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotaParaControle, PrestacaoItem } from "./prestacao-types";
import { getTimelineStep, getStepDate, STEP_TOOLTIPS } from "./prestacao-utils";

export interface TimelinePrestacaoProps {
  item: PrestacaoItem;
  /** Nota fiscal do `item.actual`, se houver. */
  invoice: NotaParaControle | undefined;
  /** Isento definido na escalação → passo NF neutro, sem cobrança de envio. */
  itemEmitsNf: boolean;
}

type Estado = "feita" | "atual" | "espera" | "erro" | "futura" | "neutra";
interface Etapa { label: string; estado: Estado; sub: string | null; subTom?: string; dica: string; titulo: string }

const ddmm = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function TimelinePrestacao({ item, invoice, itemEmitsNf }: TimelinePrestacaoProps) {
  const step = getTimelineStep(item);
  const isConcluded = item.status === "aprovada_faturamento" || item.status === "recusada";

  // NF disponível a partir do envio do Realizado — não espera o comparativo.
  const nfEligible = item.status === "aprovada_faturamento" || item.status === "prestacao_recebida";
  const nfInv = nfEligible && item.actual ? invoice : undefined;
  const nfStatus = nfInv?.status || "pendente";
  const checkinDone = !!(nfInv?.checkinAt);
  const checkinEligible = nfStatus === "aprovada";
  const checkinDateStr = checkinDone && nfInv?.checkinAt ? ddmm(nfInv.checkinAt) : null;
  const nfCompleted = nfStatus === "aprovada";
  const nfRecusada = nfStatus === "recusada";
  const nfEnviada = nfStatus === "enviada";
  const nfDevolvida = nfStatus === "devolvida";
  const nfAwaitingSubmission = itemEmitsNf && nfEligible && nfStatus === "pendente"; // esperando o colaborador enviar (nunca para isentos)
  const nfDateStr = nfCompleted && nfInv?.approvedAt ? ddmm(nfInv.approvedAt)
    : (nfEnviada || nfDevolvida) && nfInv?.createdAt ? ddmm(nfInv.createdAt)
    : null;
  const nfTooltip = nfCompleted ? "Nota fiscal aprovada"
    : nfRecusada ? "Nota fiscal recusada — decisão definitiva, sem reenvio"
    : nfEnviada ? "Nota fiscal enviada — aguardando aprovação do RH"
    : nfDevolvida ? "Nota fiscal devolvida para correção"
    : !itemEmitsNf ? "Não emite NF — definido na escalação"
    : nfEligible ? "Aguardando envio da nota fiscal"
    : item.status === "devolvida_para_ajuste" ? "NF pausada — Realizado devolvido para ajuste"
    : "Disponível após o envio do realizado";

  const principais = ["Escalação", "Planejado", "Realizado", "Comparativo"];
  const etapas: Etapa[] = principais.map((label, i) => {
    const feita = isConcluded ? true : i < step;
    const atual = !isConcluded && i === step;
    const data = getStepDate(item, i);
    return {
      label, titulo: label, dica: STEP_TOOLTIPS[i],
      estado: feita ? "feita" : atual ? "atual" : "futura",
      sub: (feita || atual) && data ? data : !feita && !atual ? "Pendente" : null,
    };
  });
  etapas.push({
    label: "Nota fiscal", titulo: "Nota fiscal", dica: nfTooltip,
    estado: nfCompleted ? "feita" : nfRecusada ? "erro" : (nfEnviada || nfDevolvida || nfAwaitingSubmission) ? "espera" : !itemEmitsNf ? "neutra" : "futura",
    sub: nfDateStr ?? (nfRecusada ? "Recusada" : !itemEmitsNf ? "Não emite" : nfEligible ? "Ag. envio" : "—"),
    subTom: nfDateStr ? undefined : nfRecusada ? "text-danger font-medium" : !itemEmitsNf ? undefined : nfEligible ? "text-warning font-medium" : undefined,
  });
  etapas.push({
    label: "Check-in", titulo: "Check-in Financeiro", dica: STEP_TOOLTIPS[5],
    estado: checkinDone ? "feita" : checkinEligible ? "atual" : "futura",
    sub: checkinDateStr ?? (checkinEligible ? "Pendente" : "—"),
    subTom: !checkinDateStr && checkinEligible ? "text-primary font-medium" : undefined,
  });

  const atual = etapas.find(e => e.estado === "atual" || e.estado === "espera");

  return (
    <TooltipProvider delayDuration={200}>
      <ol className="crh-etapas" aria-label={atual ? `Etapa atual: ${atual.label}` : "Etapas da prestação"}>
        {etapas.map((e, i) => (
          <li key={e.label} className={cn("crh-etapa", `crh-etapa-${e.estado}`, i > 0 && (etapas[i - 1].estado === "feita" ? "crh-liga-feita" : "crh-liga"))} aria-current={e.estado === "atual" || e.estado === "espera" ? "step" : undefined}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="crh-etapa-alvo">
                  <span className={cn("crh-etapa-ponto", e.estado === "atual" && "pla-etapa-atual")} aria-hidden="true">
                    {e.estado === "feita" && <Check className="w-3 h-3" strokeWidth={3.5} />}
                    {e.estado === "erro" && <X className="w-3 h-3" strokeWidth={3.5} />}
                    {(e.estado === "atual" || e.estado === "espera") && <span className="crh-etapa-miolo" />}
                  </span>
                  <span className="crh-etapa-nome">{e.label}</span>
                  {e.sub && <span className={cn("crh-etapa-sub", e.subTom)}>{e.sub}</span>}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                <p className="font-semibold">{e.titulo}</p>
                <p className="text-muted-foreground">{e.dica}</p>
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ol>
    </TooltipProvider>
  );
}
