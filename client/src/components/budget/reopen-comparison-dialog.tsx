/**
 * "Reabrir o comparativo?" (estorno do Flash) — 25/09 (modularização).
 * Extraído de budget-comparison.tsx; o motivo é obrigatório (mesma regra da
 * devolução por prestação) e sem ele o AlertDialog não fecha sozinho.
 */
import { RotateCcw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/forms/required-mark";
import type { BudgetComparison } from "@shared/schema";
import type { AcoesDoComparativo } from "@/hooks/use-budget-comparison-actions";

export function ReopenComparisonDialog({ acoes, comparison }: { acoes: AcoesDoComparativo; comparison: BudgetComparison | null | undefined }) {
  const { reopenOpen, setReopenOpen, reopenReason, setReopenReason, reopenReasonError, setReopenReasonError, reopenComparisonMutation } = acoes;
  return (
    <AlertDialog open={reopenOpen} onOpenChange={(o) => { setReopenOpen(o); if (!o) { setReopenReason(""); setReopenReasonError(false); } }}>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2.5 text-base">
            <div className="w-8 h-8 rounded-xl bg-warning-soft flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4 text-warning" aria-hidden="true" />
            </div>
            <span className="text-warning">Reabrir o comparativo?</span>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2.5 text-sm text-slate-600">
              <p>
                O comparativo volta para <strong>devolvido</strong> (em ajuste) e{" "}
                <strong>todos os lançamentos automáticos do Flash deste evento são REMOVIDOS</strong> —
                alimentação e mobilidade saem do saldo dos colaboradores.
              </p>
              <p>
                Os lançamentos são apagados, não debitados: o extrato não fica com um par crédito/débito.
                Ao aprovar o comparativo de novo, o crédito é recriado com os valores do Realizado daquele momento.
              </p>
              <p className="text-muted-foreground">
                Lançamentos <strong>manuais</strong> do Flash não são tocados. As prestações continuam com o
                status individual que já tinham.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div>
          <label className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
            Motivo da reabertura<RequiredMark />
          </label>
          <Textarea
            value={reopenReason}
            onChange={e => { setReopenReason(e.target.value); if (e.target.value.trim()) setReopenReasonError(false); }}
            rows={3}
            className={`mt-1.5 rounded-xl text-sm resize-none ${reopenReasonError ? "border-danger-strong focus-visible:ring-danger/25" : ""}`}
            placeholder="Ex.: valor de mobilidade do João estava errado — corrigir e aprovar de novo"
            data-testid="input-motivo-reabertura"
          />
          {reopenReasonError && (
            <p className="text-2xs text-danger font-medium mt-1.5">
              Descreva o motivo — ele fica registrado no comparativo como motivo da devolução.
            </p>
          )}
        </div>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-warning hover:bg-warning/90 text-white"
            disabled={reopenComparisonMutation.isPending}
            onClick={(e) => {
              // O motivo é obrigatório (mesma regra da devolução por prestação):
              // sem ele, o AlertDialog não pode fechar sozinho.
              if (!reopenReason.trim()) {
                e.preventDefault();
                setReopenReasonError(true);
                return;
              }
              if (!comparison) { e.preventDefault(); return; }
              e.preventDefault();
              reopenComparisonMutation.mutate({ id: comparison.id, returnReason: reopenReason.trim() });
            }}
            data-testid="button-confirmar-reabertura"
          >
            {reopenComparisonMutation.isPending ? "Reabrindo…" : "Reabrir e estornar o Flash"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ReopenComparisonDialog;
