// Extraído de invoices.tsx em 25/09 (modularização): linha da aba Lançamento
// para quem, pela escalação, não emite NF — mostra o item sem cobrar nota.
// `React.memo` porque é item de lista.
//
// 08/10 (redesenho): a mesma linha (`.nf-grade`) das notas, num tom abaixo —
// nome, função e valor nas colunas de sempre, a etiqueta "Não emite NF" na
// coluna da situação e nada nas de OC/nota (não há o que enviar). Antes era um
// cartão cinza de 72px que, no "Todos", empurrava as notas para baixo.
import { memo } from "react";
import type { BudgetActual } from "@shared/schema";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { PILULA } from "./invoice-status";
import type { AbaBaseProps } from "./types";

export interface SemNfItemProps extends Pick<AbaBaseProps, "getName" | "getFuncName"> {
  actual: BudgetActual;
}

export const SemNfItem = memo(function SemNfItem({ actual, getName, getFuncName }: SemNfItemProps) {
  // Definido na escalação: não emite NF — mostra o item sem cobrar nota
  const nome = toTitleCase(getName(actual.collaboratorId));
  return (
    <div
      role="listitem"
      data-actual-id={actual.id}
      className="nf-linha nf-linha-sem-nf border-b border-border last:border-b-0 border-l-[3px] border-l-transparent"
    >
      <div className="nf-grade">
        <div data-col="colab" className="nf-cel flex items-center gap-2.5 min-w-0">
          <span aria-hidden="true" className="w-8 h-8 rounded-full inline-flex items-center justify-center text-xs font-semibold shrink-0 bg-muted text-muted-foreground">
            {(nome && nome !== "—" ? nome : "?").charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-sm leading-5 text-slate-600" title={nome}>{nome}</p>
            <p className="m-0 text-2xs leading-4 text-muted-foreground truncate">{getFuncName(actual.functionId)}</p>
          </div>
        </div>
        <div data-col="valor" className="nf-cel text-right">
          <span className="sr-only">Valor: </span>
          <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">{formatarMoeda(actual.totalValue || 0)}</span>
        </div>
        <div data-col="sit" className="nf-cel min-w-0">
          <span className={`${PILULA} bg-muted text-slate-600`} title="Definido na escalação — nenhuma nota fiscal será cobrada deste colaborador">
            Não emite NF
          </span>
        </div>
        <div data-col="oc" className="nf-cel nf-vazia" aria-hidden="true"><span className="text-xs text-muted-foreground/60">—</span></div>
        <div data-col="nota" className="nf-cel nf-vazia" aria-hidden="true"><span className="text-xs text-muted-foreground/60">—</span></div>
        <div data-col="acao" className="nf-cel" />
        <div data-col="hist" className="nf-cel" />
      </div>
    </div>
  );
});
