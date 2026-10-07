/**
 * Barra de ações em massa da Validação (25/09 — extraída da página). Empilha
 * abaixo de `sm` (04/09): no celular os quatro botões não cabiam numa linha
 * com o contador e a barra estourava a largura da tela.
 *
 * 07/10 (redesenho): barra ESCURA flutuante, centrada — a mesma da Escalação.
 * Era um cartão branco com sombra que se confundia com mais uma linha da
 * lista; escura, ela se separa da lista sem competir com ela, e o único botão
 * cheio é o "Validar".
 */
import { CheckCheck, PencilLine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionWithHint } from "./action-with-hint";
import { vagas } from "./validation-shared";
import type { ValidationSelection } from "./use-validation-selection";
import type { ValidationActions } from "./use-validation-actions";

/** Botão claro sobre a barra escura (ajuste, exclusão). */
const SOBRE_ESCURO = "val-alvo h-8 w-full flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-white/90 hover:bg-white/15 hover:text-white disabled:border-white/10 disabled:text-white/40 sm:w-auto sm:flex-none";

export function BulkActionBar({ sel, act }: { sel: ValidationSelection; act: ValidationActions }) {
  const { effectiveSelected, validatableSelected, singleSelected, clearSelection } = sel;
  const { openAdjust, openDelete, openValidateConfirm, validateMutation } = act;
  const nSel = effectiveSelected.length;
  /** Quantas das selecionadas ainda dá para validar — o botão "Validar" age só sobre estas. */
  const nVal = validatableSelected.length;
  if (nSel === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div role="region" aria-label="Ações para as vagas selecionadas"
        className="val-sobe pointer-events-auto flex w-full max-w-3xl flex-col items-stretch gap-2.5 rounded-xl bg-foreground px-3.5 py-2.5 text-white shadow-3 sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:py-2 sm:pl-4 sm:pr-2">
        <div className="flex min-w-0 items-center gap-2.5 sm:mr-1 sm:shrink-0">
          <CheckCheck className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
          <div className="min-w-0 flex-1 sm:flex-none" aria-live="polite">
            <span className="block whitespace-nowrap text-sm font-semibold leading-5">{vagas(nSel)} {nSel === 1 ? "selecionada" : "selecionadas"}</span>
            {/* Frase inteira, nunca cortada no meio: em 1366px a dica encolhe
                antes dos botões (min-w-0 + truncate). Abaixo de `sm` ela sai —
                o espaço é dos botões. */}
            <span className="hidden whitespace-nowrap text-2xs leading-4 text-white/60 sm:block">
              {nSel > 1 ? "Ajuste e exclusão: uma vaga por vez." : "Validar envia a vaga para o aprovador."}
            </span>
          </div>
          {/* No celular o "limpar" fica na linha do contador, à direita. */}
          <Button type="button" size="sm" variant="ghost" className="val-alvo h-8 w-8 shrink-0 rounded-lg p-0 text-white/70 hover:bg-white/10 hover:text-white sm:hidden" onClick={clearSelection} aria-label="Limpar seleção">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <span aria-hidden="true" className="hidden h-6 w-px bg-white/15 sm:block" />
        <div className="flex flex-nowrap items-center gap-1.5 sm:flex-shrink-0">
          <Button type="button" size="sm" variant="ghost" className="hidden h-8 shrink-0 rounded-lg px-2.5 text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white sm:inline-flex" onClick={clearSelection} aria-label="Limpar seleção">
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Limpar
          </Button>
          <ActionWithHint
            disabled={!singleSelected} wrapClassName="flex-1 sm:flex-none"
            hint={singleSelected ? "Pedido para a vaga selecionada" : "Selecione apenas uma vaga para pedir ajuste"}
          >
            <Button type="button" size="sm" variant="ghost" className={SOBRE_ESCURO} disabled={!singleSelected} onClick={() => singleSelected && openAdjust(singleSelected)}>
              <PencilLine className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" /> <span className="sr-only sm:not-sr-only">Pedir ajuste</span>
            </Button>
          </ActionWithHint>
          <ActionWithHint
            disabled={!singleSelected} wrapClassName="flex-1 sm:flex-none"
            hint={singleSelected ? "Pedido para a vaga selecionada" : "Selecione apenas uma vaga para pedir exclusão"}
          >
            <Button type="button" size="sm" variant="ghost" className={SOBRE_ESCURO} disabled={!singleSelected} onClick={() => singleSelected && openDelete(singleSelected)}>
              <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" /> <span className="sr-only sm:not-sr-only">Pedir exclusão</span>
            </Button>
          </ActionWithHint>
          {/* Sem dica de "já validada": pela regra de 26/08 uma vaga validada
              nem entra na seleção — o caso não existe mais. */}
          <Button type="button" size="sm" className="val-alvo h-8 flex-[1.4] rounded-lg bg-success px-3 text-xs font-semibold text-white hover:bg-success/90 disabled:bg-white/10 disabled:text-white/40 disabled:opacity-100 sm:flex-none"
            onClick={() => openValidateConfirm(null)} disabled={nVal === 0 || validateMutation.isPending}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Validar ({nVal})
          </Button>
        </div>
      </div>
    </div>
  );
}
