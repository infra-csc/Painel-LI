// Extraído de invoices.tsx em 25/09 (modularização): rodapé de totais da
// tabela da aba Aprovação RH (aprovado / aguardando / total).
//
// 08/10 (redesenho): saiu do `<tfoot>` — numa célula de 95px o rótulo
// "TOTAL DO EVENTO" e os três valores se sobrepunham. Agora é a faixa do pé
// do cartão da lista, como nas telas irmãs: quantas notas estão na tela à
// esquerda, os totais à direita, em números alinhados.
//
// 08/10 (correção): os totais somavam TODAS as notas do evento enquanto a
// contagem ao lado dizia "Mostrando N de M" — com filtro ou busca, os números
// não batiam entre si. Agora somam o MESMO conjunto da lista (`somarNotas`),
// cada valor diz quantas notas soma e o título diz se é o evento ou o recorte.
import type { ReactNode } from "react";
import type { Invoice } from "@shared/schema";
import { formatCurrency } from "./invoice-format";

export interface TotaisDasNotas {
  /** NFs aprovadas (com ou sem check-in) e a soma do Realizado delas. */
  aprovadas: { n: number; valor: number };
  /** NFs enviadas, aguardando a análise do RH. */
  aguardando: { n: number; valor: number };
  /** Aprovadas + aguardando (devolvidas e recusadas não entram). */
  total: number;
}

/** Soma o Realizado das notas da lista: aprovadas, aguardando e as duas juntas. */
export function somarNotas(
  notas: readonly Pick<Invoice, "status" | "budgetActualId">[],
  valorDoRealizado: (budgetActualId: string | null) => number,
): TotaisDasNotas {
  const aprovadas = { n: 0, valor: 0 };
  const aguardando = { n: 0, valor: 0 };
  for (const nota of notas) {
    const alvo = nota.status === "aprovada" ? aprovadas : nota.status === "enviada" ? aguardando : null;
    if (!alvo) continue;
    alvo.n++;
    alvo.valor += valorDoRealizado(nota.budgetActualId);
  }
  return { aprovadas, aguardando, total: aprovadas.valor + aguardando.valor };
}

export interface AprovacaoTotalsFooterProps {
  approvedTotal: number;
  waitingTotal: number;
  grandTotal: number;
  /** "Mostrando N de M notas" (à esquerda). */
  resumo?: ReactNode;
  /** Quantas notas cada valor soma (aparece ao lado do rótulo). */
  nAprovadas?: number;
  nAguardando?: number;
  /** Os totais são do recorte da lista (filtro/busca) e não do evento inteiro. */
  doRecorte?: boolean;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Total({ rotulo, valor, tom, n, dica }: { rotulo: string; valor: number; tom: string; n?: number; dica?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap" title={dica}>
      <span className="text-xs text-muted-foreground">
        {rotulo}
        {n !== undefined && <span className="tabular-nums"> ({n})</span>}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${tom}`}>{formatCurrency(valor)}</span>
    </span>
  );
}

// Totals footer
export function AprovacaoTotalsFooter({ approvedTotal, waitingTotal, grandTotal, resumo, nAprovadas, nAguardando, doRecorte = false }: AprovacaoTotalsFooterProps) {
  const temTotais = approvedTotal > 0 || waitingTotal > 0;
  if (!temTotais && !resumo) return null;
  const titulo = doRecorte ? "Total do recorte" : "Total do evento";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 min-h-11 px-4 py-2 bg-surface-muted border-t border-border">
      {resumo && <p className="m-0 text-xs text-slate-600 tabular-nums" aria-live="polite">{resumo}</p>}
      {temTotais && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:ml-auto" aria-label={titulo} role="group" data-testid="nf-totais-aprovacao">
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{titulo}</span>
          {approvedTotal > 0 && (
            <Total rotulo="Aprovadas" n={nAprovadas} valor={approvedTotal} tom="text-success"
              dica={nAprovadas !== undefined ? `Realizado de ${plural(nAprovadas, "nota aprovada", "notas aprovadas")} (com ou sem check-in)` : undefined} />
          )}
          {waitingTotal > 0 && (
            <Total rotulo="Aguardando" n={nAguardando} valor={waitingTotal} tom="text-warning"
              dica={nAguardando !== undefined ? `Realizado de ${plural(nAguardando, "nota enviada", "notas enviadas")}, aguardando a análise do RH` : undefined} />
          )}
          <span aria-hidden="true" className="hidden sm:block w-px h-4 bg-border" />
          <Total rotulo="Aprovadas + aguardando" valor={grandTotal} tom="text-foreground"
            dica="Devolvidas e recusadas não entram na soma" />
        </div>
      )}
    </div>
  );
}
