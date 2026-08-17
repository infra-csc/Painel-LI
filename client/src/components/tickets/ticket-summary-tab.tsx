// Aba "Resumo" do modal: informações básicas, colaborador, período e sugestões
// + painel de análise de troca (quando há troca pendente).
import { Plane, CheckCheck, XCircle } from "lucide-react";
import type { TeamInclusion, Ticket, Collaborator } from "@shared/schema";
import { extractTravelSuggestion } from "@/lib/ticket-form";
import SuggestedDates from "./suggested-dates";
import SwapReviewPanel from "./swap-review-panel";
import { formatDate, toTitleCase, type SwapRequestRow } from "./use-tickets-data";

export const LBL = "text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1";
export const VAL = "text-[13px] font-semibold text-slate-700";

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
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
          <div>
            <div className={LBL}>Evento</div>
            <div className="text-[13px] font-semibold text-[#2563EB] leading-snug">{eventName}</div>
          </div>
          <div>
            <div className={LBL}>ID</div>
            <div className="text-[13px] font-bold text-slate-700 font-mono">#{inclusion.inclusionNumber || "N/A"}</div>
          </div>
          <div>
            <div className={LBL}>Função</div>
            <div className={VAL}>{functionName}</div>
          </div>
          <div>
            <div className={LBL}>Passagem</div>
            {ticket ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-100">
                <Plane style={{ width: 9, height: 9 }} />Registrada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                <Plane style={{ width: 9, height: 9 }} />Pendente
              </span>
            )}
          </div>
        </div>

        {/* Col 2: Colaborador */}
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
          <div>
            <div className={LBL}>Colaborador</div>
            <div className={VAL}>{collaboratorName}</div>
          </div>
          {collaborator && (<>
            <div>
              <div className={LBL}>Documento</div>
              <div className="text-[13px] font-semibold text-slate-700 font-mono">{collaborator.documentType?.toUpperCase() || "N/A"}: {collaborator.officialDocument || "N/A"}</div>
            </div>
            <div>
              <div className={LBL}>Data de Nascimento</div>
              <div className={VAL}>{collaborator.birthDate ? formatDate(collaborator.birthDate) : "N/A"}</div>
            </div>
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
            <div className="mt-1 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
              <span className="text-blue-500 text-base">📍</span>
              <div>
                <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Sai de</div>
                <div className="text-[13px] font-bold text-blue-700">{inclusion.city}</div>
              </div>
            </div>
          )}
          {swap && swap.status === "pendente" && (
            <div title="Há uma solicitação de troca de colaborador aguardando análise de Compras.">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-100 text-[11px] text-amber-700 cursor-default">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                Troca solicitada · <span className="font-semibold">Aguardando análise</span>
              </span>
            </div>
          )}
          {swap && swap.status === "aprovado" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-50 border border-green-100 text-[11px] text-green-700">
              <CheckCheck className="w-3 h-3 shrink-0" />Troca aprovada por Compras
            </span>
          )}
          {swap && swap.status === "rejeitado" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-100 text-[11px] text-red-700">
              <XCircle className="w-3 h-3 shrink-0" />Troca rejeitada por Compras
            </span>
          )}
        </div>

        {/* Col 3: Período + Sugestões */}
        <div className="space-y-3">
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-[#2563EB]/5 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
              <span className="text-[11px] font-black text-[#2563EB] uppercase tracking-[0.12em]">Período de Trabalho</span>
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
