/**
 * Resumo · A vaga (25/09 — extraído do dialog): evento, função, período, Nota
 * Fiscal, as etapas de passagem/hospedagem, troca pendente e observações.
 *
 * 07/10: virou um painel de propriedades (rótulo à esquerda, valor à direita,
 * uma linha por dado) no lugar da pilha "rótulo em cima, valor embaixo" que
 * fazia o cartão ter 340px para cinco dados. O ID e a situação moram no
 * cabeçalho do modal (a mesma pílula) e não se repetem aqui. O período e as
 * observações, que eram cartões próprios, entraram no painel. Passagem e
 * hospedagem viraram atalhos para as abas.
 */
import { ArrowLeftRight, BedDouble, ChevronRight, Plane } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { ScalingData, InclusionDetails } from "../use-scaling-data";
import type { ScalingMutations } from "../use-scaling-mutations";
import type { InclusionDialogState } from "./use-inclusion-dialog-state";
import { Propriedade, Secao } from "./details-shared";
import { PeriodoDaVaga } from "./resumo-periodo-card";

export function ResumoInfoCard({ inclusion, data, details, mutations, st }: {
  inclusion: TeamInclusion;
  data: ScalingData;
  details: InclusionDetails;
  mutations: ScalingMutations;
  st: InclusionDialogState;
}) {
  const { getEventName, getFunctionName, canManageFunction, isAdminOrPurchasing } = data;
  const { eventLocked, requestLockReason, actionLockReason, selectedTicket, accommodation, setActiveTab } = st;
  const { pendingSwap } = details;
  const emitsNf = inclusion.emitsNf !== false;
  // Mesmo gate do Confirmar: responsável pela função, admin ou Compras
  // Pedido em análise trava aqui também: a NF entra na
  // conta do que o aprovador está decidindo.
  const canToggleNf = canManageFunction(inclusion.functionId) && !eventLocked && !requestLockReason;
  const badgeCls = `inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full transition-colors ${emitsNf ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`;
  const dot = <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${emitsNf ? "bg-success-strong" : "bg-slate-400"}`} />;
  const label = emitsNf ? "Emite NF" : "Não emite NF";

  /** Atalho para a aba: o chip diz o estado e leva até o detalhe. */
  const etapa = (aba: "passagem" | "hospedagem", pronto: boolean, Icone: typeof Plane, texto: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(aba)}
      title={`Abrir a aba ${aba === "passagem" ? "Passagem" : "Hospedagem"}`}
      className={`esc-alvo group inline-flex items-center gap-1 rounded-md border px-2 py-[3px] text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        pronto ? "border-primary/25 bg-brand-soft text-primary hover:border-primary/50" : "border-warning/40 bg-card text-warning hover:bg-warning-soft"
      }`}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />{texto}
      <ChevronRight className="h-3 w-3 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );

  return (
    <Secao titulo="A vaga" corpo="py-1">
      <dl className="divide-y divide-border">
        <Propriedade rotulo="Evento">
          <span className="font-semibold text-primary leading-snug">{getEventName(inclusion.eventId)}</span>
        </Propriedade>
        <Propriedade rotulo="Função">
          <span className="font-medium">{getFunctionName(inclusion.functionId)}</span>
        </Propriedade>
        <Propriedade rotulo="Período">
          <PeriodoDaVaga inclusion={inclusion} />
        </Propriedade>
        <Propriedade rotulo="Nota fiscal">
          {!canToggleNf ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className={`${badgeCls} cursor-not-allowed opacity-80`} aria-disabled="true" data-testid="badge-emits-nf-readonly">
                  {dot}{label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-xs">
                {actionLockReason ?? "Somente o responsável pela função, administradores ou Compras podem alterar se este escalado emite nota fiscal."}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              <MotivoDesabilitado motivo="Clique para alternar. Define se a tela de Notas Fiscais cobra nota deste escalado." desabilitado={mutations.toggleEmitsNf.isPending}>
                <button
                  type="button"
                  disabled={mutations.toggleEmitsNf.isPending}
                  onClick={() => mutations.toggleEmitsNf.mutate({ id: inclusion.id, emitsNf: !emitsNf })}
                  className={`${badgeCls} esc-alvo disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${emitsNf ? "hover:bg-success/20" : "hover:bg-border"}`}
                  data-testid="button-toggle-emits-nf"
                >
                  {dot}{label}
                </button>
              </MotivoDesabilitado>
              {mutations.toggleEmitsNf.isPending && <span className="text-2xs text-muted-foreground" role="status">Gravando…</span>}
            </span>
          )}
        </Propriedade>
        {(inclusion.needsTicket || inclusion.needsAccommodation) && (
          <Propriedade rotulo="Logística">
            <span className="flex flex-wrap gap-1.5">
              {inclusion.needsTicket && etapa("passagem", !!selectedTicket, Plane, selectedTicket ? "Passagem registrada" : "Passagem pendente")}
              {inclusion.needsAccommodation && etapa("hospedagem", !!accommodation, BedDouble, accommodation ? "Hospedagem registrada" : "Hospedagem pendente")}
            </span>
          </Propriedade>
        )}
        {isAdminOrPurchasing && pendingSwap && (
          <Propriedade rotulo="Troca">
            <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning-soft px-2 py-[3px] text-xs font-semibold text-warning">
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />Troca pendente
            </span>
          </Propriedade>
        )}
        {inclusion.observations && (
          <Propriedade rotulo="Observações" testId="resumo-observacoes">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{inclusion.observations}</p>
          </Propriedade>
        )}
      </dl>
    </Secao>
  );
}
