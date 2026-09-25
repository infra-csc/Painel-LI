/**
 * Resumo · Col 2 — Colaborador (25/09 — extraído do dialog): rótulo com a dica
 * de troca, o tipo (Casa/Freela/Local) e, conforme a permissão, o cartão de
 * leitura (com pedido de troca) ou o seletor editável.
 */
import { HelpCircle, MapPin } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import { SwapStatusCard, RequestSwapButton } from "../swap-request-panel";
import { isEscalationConfirmed } from "../scaling-utils";
import { ColaboradorPicker } from "./colaborador-picker";
import { COLLAB_TYPE, lbl, type InclusionDetailsDialogProps } from "./details-shared";
import type { InclusionDialogState } from "./use-inclusion-dialog-state";

export function ResumoColaboradorCard({ inclusion, props, st }: { inclusion: TeamInclusion; props: InclusionDetailsDialogProps; st: InclusionDialogState }) {
  const { modalData, data, details, mutations, user } = props;
  const { collaborators, getCollaboratorName, getCollaboratorCity, getPurchasedTicket, canEditCollaborator, isAdminOrPurchasing } = data;
  const { pendingSwap, latestSwap } = details;
  const { accommodation, actionLockReason, setShowSwapModal } = st;

  const ticketPurchased = inclusion.needsTicket ? !!getPurchasedTicket(inclusion.id) : false;
  const accommodationReserved = inclusion.needsAccommodation ? !!accommodation : false;
  const blocked = !canEditCollaborator(inclusion);
  const blockReason = ticketPurchased && accommodationReserved
    ? "passagem comprada e hospedagem reservada"
    : ticketPurchased ? "passagem já comprada"
    : accommodationReserved ? "hospedagem já reservada"
    : null;
  const collab = collaborators?.find(c => c.id === (modalData.collaboratorId || inclusion.collaboratorId));
  const tipo = collab ? (COLLAB_TYPE[collab.type] ?? { label: collab.type ?? "—", cls: "bg-muted text-slate-600 border-border" }) : null;
  const city = modalData.city || getCollaboratorCity(modalData.collaboratorId);

  return (
    <div className="space-y-4">
      <div className="bg-surface-muted rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className={cn(lbl, "mb-0")}>Colaborador<RequiredMark /></span>
            <div className="relative group inline-flex items-center">
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-primary cursor-help transition-colors" aria-hidden="true" />
              <div className="pointer-events-none absolute left-0 top-6 z-[9999] w-72 bg-slate-800 text-white rounded-xl px-4 py-3 shadow-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute left-3 -top-1.5 border-[6px] border-transparent border-b-slate-800" />
                <div className="text-xs font-bold text-white mb-1.5">Troca de colaborador</div>
                <div className="text-2xs text-muted-foreground leading-relaxed">
                  A alteração é liberada enquanto não houver passagem comprada ou hospedagem reservada vinculada a esta escalação.
                </div>
                {blocked && blockReason && (
                  <div className="mt-2 pt-2 border-t border-slate-600 text-2xs text-warning-soft font-medium">Bloqueio atual: {blockReason}.</div>
                )}
                {blocked && !blockReason && (
                  <div className="mt-2 pt-2 border-t border-slate-600 text-2xs text-warning-soft font-medium">Você não tem permissão para alterar nesta escalação.</div>
                )}
              </div>
            </div>
          </div>
          {tipo && <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-bold border shrink-0 ${tipo.cls}`}>{tipo.label}</span>}
        </div>
        {(!canEditCollaborator(inclusion) || isEscalationConfirmed(inclusion)) ? (
          <div className="space-y-2">
            <div className="border border-border rounded-xl bg-card px-3 py-2.5">
              <div className="text-sm font-medium text-slate-700">
                {inclusion.empreitaEmpresa
                  ? `Empreita · ${inclusion.empreitaEmpresa} · ${inclusion.empreitaPessoas ?? 0} pessoas · ${(Number(inclusion.empreitaValor ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`
                  : getCollaboratorName(modalData.collaboratorId)}
              </div>
              {city && (
                <div className="mt-1.5 rounded-lg bg-brand-soft border border-primary/25 px-2 py-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
                  <div>
                    <div className="text-2xs font-semibold text-primary/70 uppercase tracking-wide leading-none">Sai de</div>
                    <div className="text-xs font-bold text-primary leading-tight">{city}</div>
                  </div>
                </div>
              )}
            </div>
            <SwapStatusCard
              pendingSwap={pendingSwap}
              latestSwap={latestSwap}
              currentUserId={user?.id}
              isAdminOrPurchasing={isAdminOrPurchasing}
              getCollaboratorName={getCollaboratorName}
              mutations={mutations}
              blockReason={actionLockReason}
            />
            {isEscalationConfirmed(inclusion) && inclusion.collaboratorId && !pendingSwap && (
              <RequestSwapButton onClick={() => setShowSwapModal(true)} blockReason={actionLockReason} />
            )}
          </div>
        ) : (
          <ColaboradorPicker inclusion={inclusion} props={props} st={st} />
        )}
      </div>
    </div>
  );
}
