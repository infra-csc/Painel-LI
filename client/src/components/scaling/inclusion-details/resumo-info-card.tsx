/**
 * Resumo · Col 1 — Informações básicas da vaga (25/09 — extraído do dialog):
 * evento, ID, função, status, Nota Fiscal e as etapas de passagem/hospedagem.
 */
import { ArrowLeftRight, Plane } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { getStatusBadge } from "../scaling-table";
import type { ScalingData, InclusionDetails } from "../use-scaling-data";
import type { ScalingMutations } from "../use-scaling-mutations";
import type { InclusionDialogState } from "./use-inclusion-dialog-state";
import { lbl, val } from "./details-shared";

export function ResumoInfoCard({ inclusion, data, details, mutations, st }: {
  inclusion: TeamInclusion;
  data: ScalingData;
  details: InclusionDetails;
  mutations: ScalingMutations;
  st: InclusionDialogState;
}) {
  const { getEventName, getFunctionName, canManageFunction, isAdminOrPurchasing } = data;
  const { eventLocked, requestLockReason, actionLockReason, selectedTicket, accommodation } = st;
  const { pendingSwap } = details;
  const emitsNf = inclusion.emitsNf !== false;
  // Mesmo gate do Confirmar: responsável pela função, admin ou Compras
  // Pedido em análise trava aqui também: a NF entra na
  // conta do que o aprovador está decidindo.
  const canToggleNf = canManageFunction(inclusion.functionId) && !eventLocked && !requestLockReason;
  const badgeCls = `inline-flex items-center gap-1.5 px-2.5 py-1 text-2xs font-bold rounded-full transition-colors ${emitsNf ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`;
  const dot = <span className={`w-1.5 h-1.5 rounded-full ${emitsNf ? "bg-success-strong" : "bg-slate-400"}`} />;
  const label = emitsNf ? "Emite NF" : "Não emite NF";
  return (
    <div className="space-y-4">
      <div className="bg-surface-muted rounded-xl border border-border p-4 space-y-3">
        <div>
          <div className={lbl}>Evento</div>
          <div className="text-sm font-semibold text-primary leading-snug">{getEventName(inclusion.eventId)}</div>
        </div>
        <div>
          <div className={lbl}>ID</div>
          <div className="text-sm font-bold text-slate-700 font-mono">#{inclusion.inclusionNumber || "N/A"}</div>
        </div>
        <div>
          <div className={lbl}>Função</div>
          <div className={val}>{getFunctionName(inclusion.functionId)}</div>
        </div>
        <div>
          <div className={lbl}>Status</div>
          {getStatusBadge(inclusion, "md")}
        </div>
        <div>
          <div className={lbl}>Nota Fiscal</div>
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
            <MotivoDesabilitado motivo="Clique para alternar. Define se a tela de Notas Fiscais cobra nota deste escalado." desabilitado={mutations.toggleEmitsNf.isPending}>
              <button
              type="button"
              disabled={mutations.toggleEmitsNf.isPending}
              onClick={() => mutations.toggleEmitsNf.mutate({ id: inclusion.id, emitsNf: !emitsNf })}
              className={`${badgeCls} disabled:opacity-50 ${emitsNf ? "hover:bg-success/20" : "hover:bg-border"}`}
              data-testid="button-toggle-emits-nf"
            >
              {dot}{label}
            </button>
            </MotivoDesabilitado>
          )}
        </div>
        {(inclusion.needsTicket || inclusion.needsAccommodation) && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
            {inclusion.needsTicket && (
              selectedTicket ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-brand-soft text-primary text-2xs font-bold rounded-lg border border-primary/25">
                  <Plane style={{ width: 9, height: 9 }} aria-hidden="true" />Passagem registrada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-warning-soft text-warning text-2xs font-bold rounded-lg border border-warning/25">
                  <Plane style={{ width: 9, height: 9 }} aria-hidden="true" />Passagem pendente
                </span>
              )
            )}
            {inclusion.needsAccommodation && (
              accommodation ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-brand-soft text-primary text-2xs font-bold rounded-lg border border-primary/25">🏨 Hospedagem registrada</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-warning-soft text-warning text-2xs font-bold rounded-lg border border-warning/25">🏨 Hospedagem pendente</span>
              )
            )}
          </div>
        )}
        {isAdminOrPurchasing && pendingSwap && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-warning-soft text-warning text-2xs font-bold rounded-lg border border-warning/25">
              <ArrowLeftRight style={{ width: 9, height: 9 }} aria-hidden="true" />Troca pendente
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
