/**
 * "Reabrir o comparativo?" — 25/09 (modularização); redesenho 08/10.
 *
 * O motivo é obrigatório (mesma regra da devolução por prestação) e sem ele o
 * AlertDialog não fecha sozinho. Redesenho: o efeito no Flash deixou de ser
 * um parágrafo — é a primeira coisa da lista, em vermelho, e o botão diz o que
 * faz ("Reabrir e apagar os créditos do Flash"). A REGRA não mudou (decisão
 * pendente do dono): reabrir devolve o comparativo e o servidor APAGA os
 * lançamentos automáticos do Flash daquele evento.
 */
import { Info, Loader2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import type { BudgetComparison } from "@shared/schema";
import type { AcoesDoComparativo } from "@/hooks/use-budget-comparison-actions";

export function ReopenComparisonDialog({ acoes, comparison }: { acoes: AcoesDoComparativo; comparison: BudgetComparison | null | undefined }) {
  const { reopenOpen, setReopenOpen, reopenReason, setReopenReason, reopenReasonError, setReopenReasonError, reopenComparisonMutation } = acoes;
  const pendente = reopenComparisonMutation.isPending;
  return (
    <AlertDialog open={reopenOpen} onOpenChange={(o) => { setReopenOpen(o); if (!o) { setReopenReason(""); setReopenReasonError(false); } }}>
      <AlertDialogContent className="max-w-[500px] rounded-xl" data-testid="dialogo-reabrir-comparativo">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="flex items-start gap-3 text-base">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-warning-soft text-warning shrink-0" aria-hidden="true">
              <RotateCcw className="w-[18px] h-[18px]" />
            </span>
            <span className="pt-1.5">Reabrir o comparativo aprovado?</span>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-slate-600">
              <p className="m-0">O que acontece ao reabrir:</p>
              <ul className="m-0 p-0 list-none space-y-2 text-sm leading-5">
                <li className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-danger" data-testid="reabrir-efeito-flash">
                  <Trash2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>Os créditos automáticos do Flash deste evento são APAGADOS</strong> — alimentação e mobilidade saem do saldo dos colaboradores.
                    Não fica um par crédito/débito no extrato: os lançamentos somem.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Undo2 className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>O comparativo volta para <strong className="text-foreground">devolvido</strong> (em ajuste). Ao aprovar de novo, o crédito é recriado com os valores do Realizado daquele momento.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>Lançamentos <strong className="text-foreground">manuais</strong> do Flash não são tocados, e as prestações continuam com o status individual que já tinham.</span>
                </li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div>
          <label htmlFor="motivo-reabertura" className="block text-sm font-medium text-foreground">
            Motivo da reabertura<RequiredMark />
          </label>
          <Textarea
            id="motivo-reabertura"
            value={reopenReason}
            onChange={e => { setReopenReason(e.target.value); if (e.target.value.trim()) setReopenReasonError(false); }}
            rows={3}
            aria-required
            aria-invalid={reopenReasonError || undefined}
            aria-describedby="motivo-reabertura-ajuda"
            className={cn("mt-1.5 rounded-lg text-sm resize-none", reopenReasonError && "border-danger-strong focus-visible:ring-danger/25")}
            placeholder="Ex.: valor de mobilidade do João estava errado — corrigir e aprovar de novo"
            data-testid="input-motivo-reabertura"
          />
          <p id="motivo-reabertura-ajuda" className={cn("m-0 mt-1.5 text-xs leading-5", reopenReasonError ? "text-danger font-medium" : "text-muted-foreground")}>
            {reopenReasonError
              ? "Descreva o motivo — ele fica registrado no comparativo como motivo da devolução."
              : "Fica registrado no comparativo como motivo da devolução."}
          </p>
        </div>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-lg gap-1.5 bg-danger hover:bg-danger/90 text-white"
            disabled={pendente}
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
            {pendente ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
            {pendente ? "Reabrindo…" : "Reabrir e apagar os créditos do Flash"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ReopenComparisonDialog;
