// Extraído de invoices.tsx em 25/09 (modularização): rodapé de totais da
// tabela da aba Aprovação RH (aprovado / aguardando / total do evento).
//
// 08/10 (redesenho): saiu do `<tfoot>` — numa célula de 95px o rótulo
// "TOTAL DO EVENTO" e os três valores se sobrepunham. Agora é a faixa do pé
// do cartão da lista, como nas telas irmãs: quantas notas estão na tela à
// esquerda, os totais do evento à direita, em números alinhados.
import type { ReactNode } from "react";
import { formatCurrency } from "./invoice-format";

export interface AprovacaoTotalsFooterProps {
  approvedTotal: number;
  waitingTotal: number;
  grandTotal: number;
  /** "Mostrando N de M notas" (à esquerda). */
  resumo?: ReactNode;
}

function Total({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span className={`text-sm font-semibold tabular-nums ${tom}`}>{formatCurrency(valor)}</span>
    </span>
  );
}

// Totals footer
export function AprovacaoTotalsFooter({ approvedTotal, waitingTotal, grandTotal, resumo }: AprovacaoTotalsFooterProps) {
  const temTotais = approvedTotal > 0 || waitingTotal > 0;
  if (!temTotais && !resumo) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 min-h-11 px-4 py-2 bg-surface-muted border-t border-border">
      {resumo && <p className="m-0 text-xs text-slate-600 tabular-nums" aria-live="polite">{resumo}</p>}
      {temTotais && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:ml-auto" aria-label="Totais do evento" role="group">
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total do evento</span>
          {approvedTotal > 0 && <Total rotulo="Aprovado" valor={approvedTotal} tom="text-success" />}
          {waitingTotal > 0 && <Total rotulo="Aguardando" valor={waitingTotal} tom="text-warning" />}
          <span aria-hidden="true" className="hidden sm:block w-px h-4 bg-border" />
          <Total rotulo="Total" valor={grandTotal} tom="text-foreground" />
        </div>
      )}
    </div>
  );
}
