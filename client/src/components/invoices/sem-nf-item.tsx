// Extraído de invoices.tsx em 25/09 (modularização): linha da aba Lançamento
// para quem, pela escalação, não emite NF — mostra o item sem cobrar nota.
// `React.memo` porque é item de lista.
import { memo } from "react";
import type { BudgetActual } from "@shared/schema";
import { formatarMoeda } from "@/lib/format";
import type { AbaBaseProps } from "./types";

export interface SemNfItemProps extends Pick<AbaBaseProps, "getName" | "getFuncName"> {
  actual: BudgetActual;
}

export const SemNfItem = memo(function SemNfItem({ actual, getName, getFuncName }: SemNfItemProps) {
  // Definido na escalação: não emite NF — mostra o item sem cobrar nota
  return (
    <div data-actual-id={actual.id} className="rounded-xl bg-surface-muted border border-border px-5 py-4 flex items-center gap-4">
      <div className="w-9 h-9 rounded-full bg-border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
        {(getName(actual.collaboratorId) || "?").charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-600 truncate">{getName(actual.collaboratorId)}</p>
        <p className="text-2xs text-muted-foreground">{getFuncName(actual.functionId)}</p>
      </div>
      <span className="text-sm font-mono font-semibold text-muted-foreground">
        {formatarMoeda(actual.totalValue || 0)}
      </span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-border text-slate-600 text-2xs font-bold whitespace-nowrap" title="Definido na escalação — nenhuma nota fiscal será cobrada deste colaborador">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Não emite NF
      </span>
    </div>
  );
});
