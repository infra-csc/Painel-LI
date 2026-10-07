/**
 * Rodapé do modal da vaga (25/09 — extraído do dialog): motivo do bloqueio ou
 * aviso, Reativar (admin), Pedir ajuste, Fechar, Salvar e Confirmar.
 */
import { AlertCircle, Check, Loader2, PencilLine, RotateCcw, Save } from "lucide-react";
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
  const mensagem = inlineReason ?? warning;
  const podeReativar = inclusion.status === "cancelado" && !eventLocked && hasRoleIn(user?.role, ["admin"]);
  const soFechar = !showSave && !showConfirm && !mostrarPedirAjuste && !podeReativar;
  /*
   * 07/10 — duas faixas:
   *  1. o MOTIVO (o que trava ou o aviso), em linha inteira, colado aos botões
   *     — espremido à esquerda dos botões ele quebrava em quatro linhas;
   *  2. as AÇÕES, em ordem de peso: Reativar (admin, à esquerda), Pedir ajuste
   *     e Fechar discretos, Salvar em contorno e Confirmar como o único botão
   *     cheio. Antes eram quatro botões de peso parecido, e o "Pedir ajuste"
   *     âmbar lia como alerta. No celular, Confirmar ocupa a linha de baixo.
   */
  return (
    <div className="shrink-0 border-t border-border bg-card">
      {mensagem && (
        <p
          className={`flex items-start gap-2 border-b px-4 py-2 text-xs leading-snug sm:px-6 ${inlineReason ? "border-warning/20 bg-warning-soft/70 text-warning" : "border-border bg-surface-muted text-slate-600"}`}
          role="status"
          data-testid={inlineReason ? "text-confirm-block-reason" : "text-scaling-warning"}
        >
          <AlertCircle className={`mt-px w-3.5 h-3.5 shrink-0 ${inlineReason ? "" : "text-muted-foreground"}`} aria-hidden="true" />
          <span className="min-w-0">{mensagem}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6">
        {podeReativar && (
          <Button
            variant="outline"
            onClick={onReativar}
            disabled={mutations.reactivate.isPending}
            className="mr-auto h-9 gap-1.5 rounded-lg border-success/35 bg-card px-3.5 text-sm font-semibold text-success hover:bg-success-soft hover:text-success"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reativar escalação
          </Button>
        )}
        {/* Pedir ajuste no rodapé FIXO (dono, 14/09: "muitos não estão
            vendo porque tem que descer o scroll"). Mesmas condições do
            cartão do Resumo, que continua lá com a explicação. */}
        {mostrarPedirAjuste && (
          <Button
            type="button"
            variant="outline"
            onClick={onPedirAjuste}
            className="h-9 gap-1.5 rounded-lg border-border bg-card px-3.5 text-sm font-medium text-slate-700 hover:border-warning/50 hover:bg-warning-soft hover:text-warning"
            data-testid="button-pedir-ajuste-rodape"
          >
            <PencilLine className="w-4 h-4 text-warning-strong" aria-hidden="true" />
            Pedir ajuste
          </Button>
        )}
        {/* Sozinho, o Fechar vira um botão de verdade (contorno) — texto solto no
            canto parecia esquecido. Com outras ações ele é discreto e, no
            celular, fica só o X do topo. */}
        <Button
          variant={soFechar ? "outline" : "ghost"}
          onClick={onClose}
          className={soFechar
            ? "h-9 rounded-lg border-border bg-card px-4 text-sm font-medium text-slate-700 hover:bg-muted"
            : "hidden h-9 rounded-lg px-3.5 text-sm font-medium text-slate-600 hover:bg-muted hover:text-foreground sm:inline-flex"}
        >
          Fechar
        </Button>
        {showSave && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={saveReason ? 0 : -1} className="inline-flex">
                <Button
                  variant="outline"
                  onClick={() => onSave(false)}
                  disabled={isSaving || !!saveReason}
                  className="h-9 gap-1.5 rounded-lg border-primary/30 bg-card px-3.5 text-sm font-semibold text-primary hover:bg-brand-soft hover:text-primary"
                  data-testid="button-save-scaling"
                >
                  {isSaving
                    ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    : <Save className="w-4 h-4" aria-hidden="true" />}
                  {isSaving ? "Salvando…" : "Salvar alterações"}
                </Button>
              </span>
            </TooltipTrigger>
            {saveReason && <TooltipContent side="top" className="max-w-[300px] text-xs">{saveReason}</TooltipContent>}
          </Tooltip>
        )}
        {showConfirm && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={confirmReason ? 0 : -1} className="inline-flex basis-full sm:basis-auto">
                <Button
                  onClick={onConfirm}
                  disabled={isSaving || !!confirmReason}
                  className="h-10 w-full gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-1 transition-colors hover:bg-primary-hover disabled:opacity-50 sm:h-9 sm:w-auto"
                  data-testid="button-confirm-scaling"
                >
                  {isSaving
                    ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    : <Check className="w-4 h-4" aria-hidden="true" />}
                  {isSaving ? "Confirmando…" : "Confirmar escalação"}
                </Button>
              </span>
            </TooltipTrigger>
            {confirmReason && <TooltipContent side="top" className="max-w-[320px] text-xs">{confirmReason}</TooltipContent>}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
