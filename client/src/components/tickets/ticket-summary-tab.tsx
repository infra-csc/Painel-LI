// Aba "Resumo" do modal: informações básicas, colaborador, período e sugestões
// + painel de análise de troca (quando há troca pendente).
import { Plane, CheckCheck, XCircle } from "lucide-react";
import type { TeamInclusion, Ticket, Collaborator } from "@shared/schema";
import { extractTravelSuggestion } from "@/lib/ticket-form";
import SuggestedDates from "./suggested-dates";
import SwapReviewPanel from "./swap-review-panel";
import { formatDate, toTitleCase, type SwapRequestRow } from "./use-tickets-data";

export const LBL = "text-2xs uppercase tracking-[0.12em] text-muted-foreground font-black mb-1";
export const VAL = "text-sm font-semibold text-slate-700";

interface TicketSummaryTabProps {
  inclusion: TeamInclusion;
  ticket: Ticket | undefined;
  collaborator: Collaborator | null;
  eventName: string;
  functionName: string;
  collaboratorName: string;
  getCollaboratorName: (id?: string | null) => string;
  pendingSwap: SwapRequestRow | undefined;
  latestSwap: SwapRequestRow | undefined;
  isPurchasingRole: boolean;
  swapPending: boolean;
  onApproveSwap: (id: string) => void;
  onRejectSwap: (id: string, comment: string) => void;
}

export default function TicketSummaryTab({
  inclusion, ticket, collaborator, eventName, functionName, collaboratorName, getCollaboratorName,
  pendingSwap, latestSwap, isPurchasingRole, swapPending, onApproveSwap, onRejectSwap,
}: TicketSummaryTabProps) {
  const swap = pendingSwap || latestSwap;
  const suggestion = extractTravelSuggestion(inclusion);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Col 1: Informações Básicas */}
        <div className="bg-surface-muted rounded-xl border border-border p-4 space-y-3">
          <div>
            <div className={LBL}>Evento</div>
            <div className="text-sm font-semibold text-primary leading-snug">{eventName}</div>
          </div>
          <div>
            <div className={LBL}>ID</div>
            <div className="text-sm font-bold text-slate-700 font-mono">#{inclusion.inclusionNumber || "N/A"}</div>
          </div>
          <div>
            <div className={LBL}>Função</div>
            <div className={VAL}>{functionName}</div>
          </div>
          <div>
            <div className={LBL}>Passagem</div>
            {ticket ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-brand-soft text-primary text-2xs font-bold rounded-lg border border-primary/25">
                <Plane style={{ width: 9, height: 9 }} />Registrada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-warning-soft text-warning text-2xs font-bold rounded-lg border border-warning/25">
                <Plane style={{ width: 9, height: 9 }} />Pendente
              </span>
            )}
          </div>
        </div>

        {/* Col 2: Colaborador */}
        <div className="bg-surface-muted rounded-xl border border-border p-4 space-y-3">
          <div>
            <div className={LBL}>Colaborador</div>
            <div className={VAL}>{collaboratorName}</div>
          </div>
          {collaborator && (<>
            {/* Documento e nascimento só chegam para admin/Compras/RH (projeção
                do GET /api/collaborators, 23/09): sem o dado, a linha some —
                nada de "N/A: N/A". */}
            {collaborator.officialDocument && (
              <div>
                <div className={LBL}>Documento</div>
                <div className="text-sm font-semibold text-slate-700 font-mono">
                  {collaborator.documentType ? `${collaborator.documentType.toUpperCase()}: ` : ""}{collaborator.officialDocument}
                </div>
              </div>
            )}
            {collaborator.birthDate && (
              <div>
                <div className={LBL}>Data de Nascimento</div>
                <div className={VAL}>{formatDate(collaborator.birthDate)}</div>
              </div>
            )}
            <div>
              <div className={LBL}>Tipo</div>
              <div className={VAL}>{collaborator.type || "—"}</div>
            </div>
            <div>
              <div className={LBL}>Cidade do colaborador</div>
              <div className={VAL}>{collaborator.city || "—"}</div>
            </div>
          </>)}
          {inclusion.city && (
            <div className="mt-1 rounded-xl bg-brand-soft border border-primary/25 px-3 py-2 flex items-center gap-2">
              <span className="text-primary text-base">📍</span>
              <div>
                <div className="text-2xs font-semibold text-primary/70 uppercase tracking-wide">Sai de</div>
                <div className="text-sm font-bold text-primary">{inclusion.city}</div>
              </div>
            </div>
          )}
          {swap && swap.status === "pendente" && (
            <div title="Há uma solicitação de troca de colaborador aguardando análise de Compras.">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warning-soft border border-warning/25 text-2xs text-warning cursor-default">
                <span className="w-1.5 h-1.5 rounded-full bg-warning-strong animate-pulse shrink-0" />
                Troca solicitada · <span className="font-semibold">Aguardando análise</span>
              </span>
            </div>
          )}
          {swap && swap.status === "aprovado" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success-soft border border-success/25 text-2xs text-success">
              <CheckCheck className="w-3 h-3 shrink-0" />Troca aprovada por Compras
            </span>
          )}
          {swap && swap.status === "rejeitado" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-danger-soft border border-danger/25 text-2xs text-danger">
              <XCircle className="w-3 h-3 shrink-0" />Troca rejeitada por Compras
            </span>
          )}
        </div>

        {/* Col 3: Período + Sugestões */}
        <div className="space-y-3">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-primary/5 border-b border-border px-4 py-2.5 flex items-center gap-2">
              <span className="text-2xs font-black text-primary uppercase tracking-[0.12em]">Período de Trabalho</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={LBL}>Início</div>
                  <div className={VAL}>{inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : "—"}</div>
                </div>
                <div>
                  <div className={LBL}>Término</div>
                  <div className={VAL}>{inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : "—"}</div>
                </div>
              </div>
            </div>
          </div>
          <SuggestedDates suggestion={suggestion} />
        </div>
      </div>

      {pendingSwap && (
        <SwapReviewPanel
          swap={pendingSwap}
          inclusion={inclusion}
          currentCollabName={toTitleCase(collaboratorName)}
          requestedCollabName={toTitleCase(getCollaboratorName(pendingSwap.new_collaborator_id ?? pendingSwap.newCollaboratorId))}
          isPurchasingRole={isPurchasingRole}
          isPending={swapPending}
          onApprove={onApproveSwap}
          onReject={onRejectSwap}
        />
      )}
    </>
  );
}
