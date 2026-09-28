// Extraído de flash-account.tsx em 25/09 (modularização): tabela do extrato
// (data, lançamento, valor, saldo e ações). Cada linha é memoizada — a lista
// pode ter centenas de lançamentos e só a linha editada precisa repintar.
import { memo } from "react";
import { ArrowDownCircle, ArrowUpCircle, Pencil, Sparkles, Trash2 } from "lucide-react";
import { isAutomaticFlashMovement } from "@shared/flash-rules";
import { automaticBadgeLabel, fmtDate, formatCurrency, type ExtratoLinha } from "./flash-types";

export interface MovementRowProps {
  m: ExtratoLinha;
  eventName: string;
  canManage: boolean;
  onEdit: (m: ExtratoLinha) => void;
  onDelete: (m: ExtratoLinha) => void;
}

export const MovementRow = memo(function MovementRow({ m, eventName, canManage, onEdit, onDelete }: MovementRowProps) {
  const automatico = isAutomaticFlashMovement(m);
  return (
    <tr className="hover:bg-surface-muted/60">
      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap font-mono">{fmtDate(m.movementDate)}</td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {m.type === "credito"
            ? <ArrowUpCircle className="w-3.5 h-3.5 text-success-strong shrink-0" aria-hidden="true" />
            : <ArrowDownCircle className="w-3.5 h-3.5 text-danger-strong shrink-0" aria-hidden="true" />}
          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full ${m.category === "alimentacao" ? "bg-success-soft text-success" : "bg-brand-soft text-primary"}`}>
            {m.category === "alimentacao" ? "Alimentação" : "Mobilidade"}
          </span>
          {automatico && (
            <span
              className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-brand-soft text-primary inline-flex items-center gap-1"
              title={m.sourceType === "oc"
                ? "Crédito automático legado, gerado pela OC da nota fiscal (regra até 18/08) — somente leitura"
                : "Crédito automático gerado na aprovação do comparativo do evento — somente leitura"}
            >
              <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
              {automaticBadgeLabel(m)}
            </span>
          )}
        </div>
        {(m.description || m.eventId) && (
          <p className="text-2xs text-muted-foreground mt-1 truncate max-w-[260px]">
            {[eventName, m.description].filter(Boolean).join(" — ")}
          </p>
        )}
      </td>
      <td className={`px-2 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${m.signed >= 0 ? "text-success" : "text-danger-strong"}`}>
        {m.signed >= 0 ? "+" : "−"}{formatCurrency(Math.abs(m.signed))}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">
        {formatCurrency(m.category === "alimentacao" ? m.runningFood : m.runningMobility)}
      </td>
      {canManage && automatico && (
        <td className="px-2 py-2.5 text-right whitespace-nowrap">
          <span className="text-2xs text-muted-foreground" title="Lançamento automático: acompanha o Realizado; estorno em Comparativo → Fechamento do comparativo → Reabrir comparativo">
            somente leitura
          </span>
        </td>
      )}
      {canManage && !automatico && (
        <td className="px-2 py-2.5 text-right whitespace-nowrap">
          <button
            title="Editar lançamento"
            aria-label="Editar lançamento"
            onClick={() => onEdit(m)}
            className="w-6 h-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary-hover hover:bg-brand-soft transition-colors"
          >
            <Pencil className="w-3 h-3" aria-hidden="true" />
          </button>
          <button
            title="Excluir lançamento"
            aria-label="Excluir lançamento"
            onClick={() => onDelete(m)}
            className="w-6 h-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-danger-strong hover:bg-danger-soft transition-colors"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" />
          </button>
        </td>
      )}
    </tr>
  );
});

export interface MovementsTableProps {
  extratoVisible: ExtratoLinha[];
  canManage: boolean;
  getEventName: (id?: string | null) => string;
  onEdit: (m: ExtratoLinha) => void;
  onDelete: (m: ExtratoLinha) => void;
}

export function MovementsTable({ extratoVisible, canManage, getEventName, onEdit, onDelete }: MovementsTableProps) {
  return (
    <table className="w-full min-w-[560px] text-xs">
      <thead className="sticky top-0 bg-surface-muted text-2xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th scope="col" className="text-left font-bold px-4 py-2.5">Data</th>
          <th scope="col" className="text-left font-bold px-2 py-2.5">Lançamento</th>
          <th scope="col" className="text-right font-bold px-2 py-2.5">Valor</th>
          <th scope="col" className="text-right font-bold px-4 py-2.5">Saldo</th>
          {canManage && <th scope="col" className="px-2 py-2.5" />}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {extratoVisible.map(m => (
          <MovementRow key={m.id} m={m} eventName={getEventName(m.eventId)} canManage={canManage} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </tbody>
    </table>
  );
}

export default MovementsTable;
