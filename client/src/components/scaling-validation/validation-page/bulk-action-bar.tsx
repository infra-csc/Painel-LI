/**
 * Barra de ações em massa da Validação (25/09 — extraída da página). Empilha
 * abaixo de `sm` (04/09): no celular os quatro botões não cabiam numa linha
 * com o contador e a barra estourava a largura da tela.
 */
import { CheckCheck, PencilLine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionWithHint } from "./action-with-hint";
import { vagas } from "./validation-shared";
import type { ValidationSelection } from "./use-validation-selection";
import type { ValidationActions } from "./use-validation-actions";

export function BulkActionBar({ sel, act }: { sel: ValidationSelection; act: ValidationActions }) {
  const { effectiveSelected, validatableSelected, singleSelected, clearSelection } = sel;
  const { openAdjust, openDelete, openValidateConfirm, validateMutation } = act;
  const nSel = effectiveSelected.length;
  /** Quantas das selecionadas ainda dá para validar — o botão "Validar" age só sobre estas. */
  const nVal = validatableSelected.length;
  if (nSel === 0) return null;
  return (
    <div role="region" aria-label="Ações para as vagas selecionadas"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex w-[calc(100%-2rem)] max-w-3xl flex-col items-stretch gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-2 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:mr-auto">
        <span className="block text-sm font-semibold text-slate-700">{vagas(nSel)} {nSel === 1 ? "selecionada" : "selecionadas"}</span>
        {/* Frase inteira, nunca cortada no meio: em 1366px a dica encolhe
            antes dos botões (min-w-0 + truncate), que ficam sempre na mesma
            linha graças ao flex-nowrap do grupo ao lado. Abaixo de `sm`
            ela sai — o espaço é dos botões. */}
        <span className="hidden truncate text-2xs text-muted-foreground sm:block">
          {nSel > 1 ? "Ajuste e exclusão: uma vaga por vez." : "Validar envia a vaga para o aprovador."}
        </span>
      </div>
      <div className="flex flex-nowrap items-center gap-2 sm:flex-shrink-0">
      <Button type="button" size="sm" variant="ghost" className="shrink-0 rounded-lg text-muted-foreground" onClick={clearSelection} aria-label="Limpar seleção">
        <X className="w-4 h-4" aria-hidden="true" />
      </Button>
      <ActionWithHint
        disabled={!singleSelected} wrapClassName="flex-1 sm:flex-none"
        hint={singleSelected ? "Pedido para a vaga selecionada" : "Selecione apenas uma vaga para pedir ajuste"}
      >
        <Button type="button" size="sm" variant="outline" className="w-full flex-1 rounded-lg sm:w-auto sm:flex-none" disabled={!singleSelected} onClick={() => singleSelected && openAdjust(singleSelected)}>
          <PencilLine className="w-4 h-4 sm:mr-1.5" aria-hidden="true" /> <span className="sr-only sm:not-sr-only">Pedir ajuste</span>
        </Button>
      </ActionWithHint>
      <ActionWithHint
        disabled={!singleSelected} wrapClassName="flex-1 sm:flex-none"
        hint={singleSelected ? "Pedido para a vaga selecionada" : "Selecione apenas uma vaga para pedir exclusão"}
      >
        <Button type="button" size="sm" variant="outline" className="w-full flex-1 rounded-lg border-danger/25 text-danger hover:bg-danger-soft sm:w-auto sm:flex-none" disabled={!singleSelected} onClick={() => singleSelected && openDelete(singleSelected)}>
          <Trash2 className="w-4 h-4 sm:mr-1.5" aria-hidden="true" /> <span className="sr-only sm:not-sr-only">Pedir exclusão</span>
        </Button>
      </ActionWithHint>
      {/* Sem dica de "já validada": pela regra de 26/08 uma vaga validada
          nem entra na seleção — o caso não existe mais. */}
      <Button type="button" size="sm" className="flex-1 rounded-lg bg-success text-white hover:bg-success/90 sm:flex-none"
        onClick={() => openValidateConfirm(null)} disabled={nVal === 0 || validateMutation.isPending}>
        <CheckCheck className="w-4 h-4 mr-1.5" aria-hidden="true" /> Validar ({nVal})
      </Button>
      </div>
    </div>
  );
}
