/**
 * A linha da lista abre o modal da vaga (23/10) — o mesmo contrato da linha da
 * Escalação: clique em qualquer ponto da linha FORA dos controles dela
 * (checkbox, botões de decisão, links, dicas), Enter com a linha em foco.
 * Arrastar o mouse para copiar um texto não abre nada.
 */
import type { KeyboardEvent, MouseEvent } from "react";

/** O clique nasceu dentro de outro controle da linha? Então é dele, não da linha. */
export function cliqueEmControle(e: MouseEvent<HTMLElement>): boolean {
  return !!(e.target as HTMLElement).closest('button, a, input, textarea, label, [role="checkbox"], [role="button"]');
}

function temTextoSelecionado(): boolean {
  return (window.getSelection?.()?.toString() ?? "") !== "";
}

/** Classe da linha que abre: cursor de mão e o anel de foco do teclado. */
export const CLASSE_LINHA_QUE_ABRE = "apr-clicavel focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";

export function linhaQueAbre(abrir: () => void, rotulo: string) {
  return {
    tabIndex: 0,
    "aria-label": rotulo,
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (cliqueEmControle(e) || temTextoSelecionado()) return;
      abrir();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Enter num controle de dentro (checkbox, botão) é do controle.
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter") { e.preventDefault(); abrir(); }
    },
  };
}
