// Aba "Resumo" do modal: a vaga, o colaborador, o período e as sugestões
// + painel de análise de troca (quando há troca pendente).
//
// 07/10 (redesenho): três cartões cinza com rótulos em caixa alta pesada
// viraram duas seções de leitura (Vaga · Colaborador) em lista de definição,
// com a sugestão da escalação ao lado. Os mesmos campos, na mesma ordem.
import type { ReactNode } from "react";
import { Plane, CheckCheck, XCircle, MapPin } from "lucide-react";
import type { TeamInclusion, Ticket, Collaborator } from "@shared/schema";
import { extractTravelSuggestion } from "@/lib/ticket-form";
import SuggestedDates from "./suggested-dates";
import SwapReviewPanel from "./swap-review-panel";
import { formatDate, toTitleCase, type SwapRequestRow } from "./use-tickets-data";

/** Rótulo e valor dos campos de leitura do modal (Resumo e Dados). */
export const LBL = "text-2xs font-medium text-muted-foreground mb-0.5";
export const VAL = "text-sm font-medium text-foreground";

/** Título de seção dentro das abas (mesmo desenho em todas). */
export const SECAO = "m-0 mb-3 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

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

function Campo({ rotulo, children, className = "" }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className={LBL}>{rotulo}</dt>
      <dd className={`m-0 ${VAL} break-words`}>{children}</dd>
    </div>
  );
}

export default function TicketSummaryTab({
  inclusion, ticket, collaborator, eventName, functionName, collaboratorName, getCollaboratorName,
  pendingSwap, latestSwap, isPurchasingRole, swapPending, onApproveSwap, onRejectSwap,
}: TicketSummaryTabProps) {
  const swap = pendingSwap || latestSwap;
  const suggestion = extractTravelSuggestion(inclusion);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Vaga */}
          <section aria-labelledby={`resumo-vaga-${inclusion.id}`}>
            <h3 id={`resumo-vaga-${inclusion.id}`} className={SECAO}>Vaga</h3>
            <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3.5 rounded-xl border border-border bg-card p-4">
              <Campo rotulo="Evento" className="col-span-2 sm:col-span-3">
                <span className="text-primary font-semibold">{eventName}</span>
              </Campo>
              <Campo rotulo="ID"><span className="font-mono font-semibold">#{inclusion.inclusionNumber || "N/A"}</span></Campo>
              <Campo rotulo="Função">{functionName}</Campo>
              <Campo rotulo="Passagem">
                {ticket ? (
                  <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-success-soft text-success text-2xs font-medium">
                    <Plane className="w-3 h-3" aria-hidden="true" />Registrada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-warning-soft text-warning text-2xs font-medium">
                    <Plane className="w-3 h-3" aria-hidden="true" />Pendente
                  </span>
                )}
              </Campo>
              <Campo rotulo="Início do trabalho">{inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : "—"}</Campo>
              <Campo rotulo="Término do trabalho">{inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : "—"}</Campo>
              {inclusion.city && (
                <Campo rotulo="Sai de">
                  <span className="inline-flex items-center gap-1 text-primary font-semibold">
                    <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />{inclusion.city}
                  </span>
                </Campo>
              )}
            </dl>
          </section>

          {/* Colaborador */}
          <section aria-labelledby={`resumo-colab-${inclusion.id}`}>
            <h3 id={`resumo-colab-${inclusion.id}`} className={SECAO}>Colaborador</h3>
            <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3.5 rounded-xl border border-border bg-card p-4">
              <Campo rotulo="Colaborador" className="col-span-2 sm:col-span-3">{collaboratorName}</Campo>
              {collaborator && (<>
                {/* Documento e nascimento só chegam para admin/Compras/RH (projeção
                    do GET /api/collaborators, 23/09): sem o dado, a linha some —
                    nada de "N/A: N/A". */}
                {collaborator.officialDocument && (
                  <Campo rotulo="Documento">
                    <span className="font-mono">
                      {collaborator.documentType ? `${collaborator.documentType.toUpperCase()}: ` : ""}{collaborator.officialDocument}
                    </span>
                  </Campo>
                )}
                {collaborator.birthDate && <Campo rotulo="Data de nascimento">{formatDate(collaborator.birthDate)}</Campo>}
                <Campo rotulo="Tipo">{collaborator.type || "—"}</Campo>
                <Campo rotulo="Cidade do colaborador">{collaborator.city || "—"}</Campo>
              </>)}
              {swap && swap.status === "pendente" && (
                <div className="col-span-2 sm:col-span-3" title="Há uma solicitação de troca de colaborador aguardando análise de Compras.">
                  <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-warning-soft text-2xs text-warning">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning-strong shrink-0" aria-hidden="true" />
                    Troca solicitada · <span className="font-semibold">Aguardando análise</span>
                  </span>
                </div>
              )}
              {swap && swap.status === "aprovado" && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-success-soft text-2xs text-success">
                    <CheckCheck className="w-3 h-3 shrink-0" aria-hidden="true" />Troca aprovada por Compras
                  </span>
                </div>
              )}
              {swap && swap.status === "rejeitado" && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-danger-soft text-2xs text-danger">
                    <XCircle className="w-3 h-3 shrink-0" aria-hidden="true" />Troca rejeitada por Compras
                  </span>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* Sugestão da escalação: referência para comprar */}
        <section aria-label="Datas sugeridas pela escalação" className="min-w-0">
          <h3 className={SECAO}>Sugestão da escalação</h3>
          <SuggestedDates suggestion={suggestion} />
        </section>
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
