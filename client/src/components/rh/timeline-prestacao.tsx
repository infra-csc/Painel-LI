// Extraído de rh-control.tsx em 25/09 (modularização): o stepper
// Escalação → Planejado → Realizado → Comparativo → Nota Fiscal → Check-in
// mostrado no corpo expandido do cartão. Era `renderTimeline` (closure da
// página); agora recebe a NF já resolvida e o flag de isenção por props.
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { XCircle, Check } from "lucide-react";
import type { NotaParaControle, PrestacaoItem } from "./prestacao-types";
import { getTimelineStep, getStepDate, STEP_TOOLTIPS } from "./prestacao-utils";

export interface TimelinePrestacaoProps {
  item: PrestacaoItem;
  /** Nota fiscal do `item.actual`, se houver. */
  invoice: NotaParaControle | undefined;
  /** Isento definido na escalação → passo NF neutro, sem cobrança de envio. */
  itemEmitsNf: boolean;
}

export function TimelinePrestacao({ item, invoice, itemEmitsNf }: TimelinePrestacaoProps) {
  const step = getTimelineStep(item);
  const isConcluded = item.status === "aprovada_faturamento" || item.status === "recusada";

  // NF disponível a partir do envio do Realizado — não espera o comparativo.
  const nfEligible = item.status === "aprovada_faturamento" || item.status === "prestacao_recebida";
  const nfInv = nfEligible && item.actual ? invoice : undefined;
  const nfStatus = nfInv?.status || "pendente";
  const checkinDone = !!(nfInv?.checkinAt);
  const checkinEligible = nfStatus === "aprovada";
  const checkinDateStr = checkinDone && nfInv?.checkinAt
    ? new Date(nfInv.checkinAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null;
  const nfCompleted = nfStatus === "aprovada";
  const nfRecusada = nfStatus === "recusada";
  const nfEnviada = nfStatus === "enviada";
  const nfDevolvida = nfStatus === "devolvida";
  const nfAwaitingSubmission = itemEmitsNf && nfEligible && nfStatus === "pendente"; // waiting collaborator to send NF (nunca para isentos)
  const nfDateStr = nfCompleted && nfInv?.approvedAt
    ? new Date(nfInv.approvedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : (nfEnviada || nfDevolvida) && nfInv?.createdAt
    ? new Date(nfInv.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null;
  const nfTooltip = nfCompleted ? "Nota fiscal aprovada"
    : nfRecusada ? "Nota fiscal recusada — decisão definitiva, sem reenvio"
    : nfEnviada ? "Nota fiscal enviada — aguardando aprovação do RH"
    : nfDevolvida ? "Nota fiscal devolvida para correção"
    : !itemEmitsNf ? "Não emite NF — definido na escalação"
    : nfEligible ? "Aguardando envio da nota fiscal"
    : item.status === "devolvida_para_ajuste" ? "NF pausada — Realizado devolvido para ajuste"
    : "Disponível após o envio do realizado";

  const mainSteps = ["Escalação", "Planejado", "Realizado", "Comparativo"];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-start w-full min-w-[560px] px-1 py-1">
        {/* Steps 0–3 with connectors (connector always follows each step) */}
        {mainSteps.map((label, i) => {
          const isCompleted = isConcluded ? true : i < step;
          const isCurrent = !isConcluded && i === step;
          const isFuture = !isCompleted && !isCurrent;
          const dateStr = getStepDate(item, i);
          const connectorColor = i === 3
            ? nfCompleted ? 'bg-success/20' : nfEligible && itemEmitsNf ? 'bg-warning/20' : 'bg-border'
            : isCompleted ? 'bg-primary/40' : 'bg-border';
          return (
            <div key={label} className="flex items-start flex-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center flex-shrink-0 cursor-default w-14">
                    <div className="relative flex items-center justify-center">
                      {isCurrent && <span className="absolute w-7 h-7 rounded-full bg-brand-soft animate-ping opacity-60 motion-reduce:hidden" />}
                      <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isCompleted ? 'bg-primary shadow-1 '
                        : isCurrent ? 'bg-card border-2 border-primary'
                        : 'bg-muted border border-border'
                      }`}>
                        {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />}
                        {isCurrent && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                    </div>
                    <span className={`text-2xs font-semibold mt-1.5 whitespace-nowrap ${
                      isCompleted || isCurrent ? 'text-primary' : 'text-muted-foreground'
                    }`}>{label}</span>
                    {(isCompleted || isCurrent) && dateStr
                      ? <span className="text-2xs text-muted-foreground whitespace-nowrap">{dateStr}</span>
                      : isFuture ? <span className="text-2xs text-muted-foreground italic">Pendente</span>
                      : null}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                  <p className="font-semibold">{label}</p>
                  <p className="text-muted-foreground">{STEP_TOOLTIPS[i]}</p>
                </TooltipContent>
              </Tooltip>
              {/* Connector — always shown from each main step to the next */}
              <div className={`h-px flex-1 mt-3 rounded-full mx-1 transition-all ${connectorColor}`} />
            </div>
          );
        })}

        {/* NF step */}
        <div className="flex items-start flex-1 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center flex-shrink-0 cursor-default w-14">
                <div className="relative flex items-center justify-center">
                  {(nfEnviada || nfAwaitingSubmission) && <span className="absolute w-7 h-7 rounded-full bg-warning-soft animate-ping opacity-60 motion-reduce:hidden" />}
                  <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    nfCompleted ? 'bg-success-strong shadow-1 '
                    : nfRecusada ? 'bg-danger-strong'
                    : nfEnviada ? 'bg-card border-2 border-warning-strong'
                    : nfDevolvida ? 'bg-card border-2 border-warning-strong'
                    : nfAwaitingSubmission ? 'bg-card border-2 border-warning-strong'
                    : 'bg-border border border-slate-300'
                  }`}>
                    {nfCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />}
                    {nfRecusada && <XCircle className="w-3 h-3 text-white" strokeWidth={2} aria-hidden="true" />}
                    {nfEnviada && <div className="w-2 h-2 rounded-full bg-warning-strong" />}
                    {nfDevolvida && <div className="w-2 h-2 rounded-full bg-warning-strong" />}
                    {nfAwaitingSubmission && <div className="w-2 h-2 rounded-full bg-warning/20" />}
                  </div>
                </div>
                <span className={`text-2xs font-semibold mt-1.5 whitespace-nowrap ${
                  nfCompleted ? 'text-success'
                  : nfEnviada || nfAwaitingSubmission ? 'text-warning'
                  : nfDevolvida ? 'text-warning'
                  : nfRecusada ? 'text-danger'
                  : 'text-muted-foreground'
                }`}>Nota Fiscal</span>
                {nfDateStr
                  ? <span className="text-2xs text-muted-foreground whitespace-nowrap">{nfDateStr}</span>
                  : nfRecusada
                  ? <span className="text-2xs text-danger-strong italic font-medium">Recusada</span>
                  : !itemEmitsNf
                  ? <span className="text-2xs text-muted-foreground">Não emite</span>
                  : <span className="text-2xs text-warning-strong italic font-medium">{nfEligible ? "Ag. envio" : "—"}</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[200px]">
              <p className="font-semibold">Nota Fiscal</p>
              <p className="text-muted-foreground">{nfTooltip}</p>
            </TooltipContent>
          </Tooltip>
          {/* Connector NF → Check-in */}
          <div className={`h-px flex-1 mt-3 rounded-full mx-1 transition-all ${checkinDone ? 'bg-success/20' : checkinEligible ? 'bg-primary/40' : 'bg-border'}`} />
        </div>

        {/* Check-in step */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center flex-shrink-0 cursor-default w-16">
              <div className="relative flex items-center justify-center">
                {checkinEligible && !checkinDone && <span className="absolute w-7 h-7 rounded-full bg-brand-soft animate-ping opacity-60 motion-reduce:hidden" />}
                <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  checkinDone ? 'bg-success-strong shadow-1 '
                  : checkinEligible ? 'bg-card border-2 border-primary'
                  : 'bg-muted border border-border'
                }`}>
                  {checkinDone && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />}
                  {checkinEligible && !checkinDone && <div className="w-2 h-2 rounded-full bg-primary/40" />}
                </div>
              </div>
              <span className={`text-2xs font-semibold mt-1.5 whitespace-nowrap ${
                checkinDone ? 'text-success'
                : checkinEligible ? 'text-primary'
                : 'text-muted-foreground'
              }`}>Check-in</span>
              {checkinDateStr
                ? <span className="text-2xs text-muted-foreground whitespace-nowrap">{checkinDateStr}</span>
                : checkinEligible
                ? <span className="text-2xs text-primary italic font-medium">Pendente</span>
                : <span className="text-2xs text-muted-foreground">—</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[200px]">
            <p className="font-semibold">Check-in Financeiro</p>
            <p className="text-muted-foreground">{STEP_TOOLTIPS[5]}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
