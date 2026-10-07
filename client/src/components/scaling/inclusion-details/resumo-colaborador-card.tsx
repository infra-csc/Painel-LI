/**
 * Resumo · Colaborador (25/09 — extraído do dialog): rótulo com a dica de
 * troca, o tipo (Casa/Freela/Local) e, conforme a permissão, o cartão de
 * leitura (com pedido de troca) ou o seletor editável.
 *
 * 07/10: a dica "Troca de colaborador" era um balão escuro que só abria com o
 * MOUSE (div com `group-hover`) — no teclado e no toque não existia. Virou o
 * Tooltip do app. O "Sai de" deixou de ser uma caixa azul dentro da caixa e
 * virou uma linha com o alfinete, como nos outros lugares.
 */
import { HelpCircle, MapPin } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { RequiredMark } from "@/components/forms/required-mark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SwapStatusCard, RequestSwapButton } from "../swap-request-panel";
import { isEscalationConfirmed } from "../scaling-utils";
import { ColaboradorPicker } from "./colaborador-picker";
import { COLLAB_TYPE, Secao, type InclusionDetailsDialogProps } from "./details-shared";
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
  const leitura = !canEditCollaborator(inclusion) || isEscalationConfirmed(inclusion);

  const titulo = (
    <span className="inline-flex items-center gap-1.5">
      <span>Colaborador<RequiredMark /></span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="esc-alvo inline-flex rounded-full text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Quando dá para trocar o colaborador">
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-[300px] text-xs leading-relaxed">
          <p className="font-semibold">Troca de colaborador</p>
          <p className="mt-1">A alteração é liberada enquanto não houver passagem comprada ou hospedagem reservada vinculada a esta escalação.</p>
          {blocked && (
            <p className="mt-1.5 border-t border-border pt-1.5 font-medium text-warning">
              {blockReason ? `Bloqueio atual: ${blockReason}.` : "Você não tem permissão para alterar nesta escalação."}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </span>
  );

  return (
    <Secao
      titulo={titulo}
      acessorio={tipo && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border shrink-0 ${tipo.cls}`}>{tipo.label}</span>}
      testId="secao-colaborador"
    >
      {leitura ? (
        <div className="space-y-3">
          <div>
            <p className="text-[15px] font-semibold leading-snug text-foreground break-words">
              {inclusion.empreitaEmpresa
                ? `Empreita · ${inclusion.empreitaEmpresa} · ${inclusion.empreitaPessoas ?? 0} pessoas · ${(Number(inclusion.empreitaValor ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`
                : getCollaboratorName(modalData.collaboratorId)}
            </p>
            {city && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600" data-testid="text-sai-de-leitura">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>Sai de <b className="font-semibold text-foreground">{city}</b></span>
              </p>
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
    </Secao>
  );
}
