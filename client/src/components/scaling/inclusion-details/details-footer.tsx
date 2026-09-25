/**
 * Rodapé do modal da vaga (25/09 — extraído do dialog): motivo do bloqueio ou
 * aviso, Reativar (admin), Pedir ajuste, Fechar, Salvar e Confirmar.
 */
import { AlertCircle, Check, PencilLine, RotateCcw, Save } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { hasRoleIn } from "@shared/roles";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isReadOnly } from "@/lib/interactions";
import { isEscalated, type ModalData } from "../scaling-utils";
import { getSaveBlockReason, getConfirmBlockReason, getScalingWarning } from "../scaling-validation";
import type { ScalingData, ScalingUser } from "../use-scaling-data";
import type { ScalingMutations } from "../use-scaling-mutations";

export interface DetailsFooterProps {
  inclusion: TeamInclusion;
  modalData: ModalData;
  data: ScalingData;
  mutations: ScalingMutations;
  user: ScalingUser;
  eventLocked: boolean;
  requestLockReason: string | null;
  mostrarPedirAjuste: boolean;
  onPedirAjuste: () => void;
  onReativar: () => void;
  onClose: () => void;
  onSave: (thenNext: boolean) => void;
  onConfirm: () => void;
}

export function DetailsFooter({ inclusion, modalData, data, mutations, user, eventLocked, requestLockReason, mostrarPedirAjuste, onPedirAjuste, onReativar, onClose, onSave, onConfirm }: DetailsFooterProps) {
  const isSaving = mutations.saveInclusion.isPending;
  const readOnly = isReadOnly(inclusion, user);
  const escalated = isEscalated(inclusion);
  // Pedido em análise trava TUDO e explica o porquê (regra do dono,
  // 26/08) — vem antes dos demais motivos porque é o mais forte:
  // salvar por baixo faria o aprovador decidir sobre outra vaga.
  const saveReason = isSaving ? null : (requestLockReason ?? getSaveBlockReason(inclusion, modalData, data));
  const confirmReason = isSaving ? null : (requestLockReason ?? getConfirmBlockReason(inclusion, modalData, data));
  const showSave = !readOnly && (data.canEditCollaborator(inclusion) || !escalated);
  const showConfirm = !readOnly && !escalated;
  const inlineReason = showConfirm ? confirmReason : (showSave ? saveReason : null);
  // Aviso não bloqueante (ex.: cenotécnica sem tipo de freela): só
  // aparece quando não há bloqueio, para não competir com ele.
  const warning = inlineReason ? null : getScalingWarning(inclusion, data);
  return (
    <div className="px-4 sm:px-6 py-4 border-t border-border flex flex-wrap items-center justify-end gap-3 shrink-0 bg-card">
      {inclusion.status === "cancelado" && !eventLocked && hasRoleIn(user?.role, ["admin"]) && (
        <Button
          onClick={onReativar}
          disabled={mutations.reactivate.isPending}
          className="mr-auto flex items-center gap-1.5 bg-success hover:bg-success/90 text-white rounded-xl px-4 py-2 text-sm font-semibold"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Reativar escalação
        </Button>
      )}
      {inlineReason && (
        <p
          className="mr-auto flex items-center gap-1.5 text-xs text-warning bg-warning-soft border border-warning/25 rounded-lg px-3 py-1.5 max-w-full sm:max-w-[420px] leading-snug"
          role="status"
          data-testid="text-confirm-block-reason"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{inlineReason}</span>
        </p>
      )}
      {warning && (
        <p
          className="mr-auto flex items-center gap-1.5 text-xs text-slate-600 bg-surface-muted border border-border rounded-lg px-3 py-1.5 max-w-full sm:max-w-[420px] leading-snug"
          role="status"
          data-testid="text-scaling-warning"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">{warning}</span>
        </p>
      )}
      {/* Pedir ajuste no rodapé FIXO (dono, 14/09: "muitos não estão
          vendo porque tem que descer o scroll"). Mesmas condições do
          cartão do Resumo, que continua lá com a explicação. */}
      {mostrarPedirAjuste && (
        <Button
          type="button"
          variant="outline"
          onClick={onPedirAjuste}
          className="flex items-center gap-2 rounded-xl border border-warning/25 bg-warning-soft px-5 py-2 text-sm font-semibold text-warning hover:bg-warning-soft"
          data-testid="button-pedir-ajuste-rodape"
        >
          <PencilLine className="w-4 h-4" aria-hidden="true" />
          Pedir ajuste
        </Button>
      )}
      <Button
        variant="outline"
        onClick={onClose}
        className="border border-border text-slate-600 hover:bg-surface-muted rounded-xl px-5 py-2 text-sm font-medium"
      >
        Fechar
      </Button>
      {showSave && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={saveReason ? 0 : -1} className="inline-flex">
              <Button
                variant="secondary"
                onClick={() => onSave(false)}
                disabled={isSaving || !!saveReason}
                className="flex items-center gap-2 border border-primary/25 text-primary bg-brand-soft hover:bg-brand-soft rounded-xl px-5 py-2 text-sm font-medium"
                data-testid="button-save-scaling"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                {isSaving ? "Salvando…" : "Salvar Alterações"}
              </Button>
            </span>
          </TooltipTrigger>
          {saveReason && <TooltipContent side="top" className="max-w-[300px] text-xs">{saveReason}</TooltipContent>}
        </Tooltip>
      )}
      {showConfirm && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={confirmReason ? 0 : -1} className="inline-flex">
              <Button
                onClick={onConfirm}
                disabled={isSaving || !!confirmReason}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl px-6 py-2 h-10 text-sm font-bold transition-colors disabled:opacity-50"
                data-testid="button-confirm-scaling"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                {isSaving ? "Confirmando…" : "Confirmar Escalação"}
              </Button>
            </span>
          </TooltipTrigger>
          {confirmReason && <TooltipContent side="top" className="max-w-[320px] text-xs">{confirmReason}</TooltipContent>}
        </Tooltip>
      )}
    </div>
  );
}
