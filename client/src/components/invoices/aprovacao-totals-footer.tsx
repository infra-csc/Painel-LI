// Extraído de invoices.tsx em 25/09 (modularização): rodapé de totais da
// tabela da aba Aprovação RH (aprovado / aguardando / total do evento).
import { formatCurrency } from "./invoice-format";

export interface AprovacaoTotalsFooterProps {
  approvedTotal: number;
  waitingTotal: number;
  grandTotal: number;
}

// Totals footer
export function AprovacaoTotalsFooter({ approvedTotal, waitingTotal, grandTotal }: AprovacaoTotalsFooterProps) {
  if (!(approvedTotal > 0 || waitingTotal > 0)) return null;
  return (
    <tfoot>
      <tr className="bg-surface-muted border-t-2 border-t-border">
        <td className="px-4 py-3" colSpan={2}>
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Total do Evento</span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-5">
            {approvedTotal > 0 && (
              <div className="flex flex-col items-end">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Aprovado</span>
                <span className="text-sm font-bold text-success tabular-nums font-mono">{formatCurrency(approvedTotal)}</span>
              </div>
            )}
            {waitingTotal > 0 && (
              <div className="flex flex-col items-end">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Aguardando</span>
                <span className="text-sm font-bold text-warning tabular-nums font-mono">{formatCurrency(waitingTotal)}</span>
              </div>
            )}
            <div className="flex flex-col items-end border-l border-border pl-5">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
              <span className="text-sm font-bold tabular-nums font-mono text-primary">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </td>
        <td colSpan={4} />
      </tr>
    </tfoot>
  );
}
