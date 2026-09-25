// Extraído de invoices.tsx em 25/09 (modularização): linha principal da
// tabela da aba Aprovação RH (colaborador, função, valor, OC, nota, histórico
// e botões de ação). O painel inline e o histórico ficam em linhas próprias
// (ver aprovacao-tab.tsx). `React.memo` porque é linha de lista.
import { memo } from "react";
import {
  FileText, CheckCircle2, RotateCcw, Clock,
  AlertTriangle, CircleDot, Ban,
} from "lucide-react";
import type { BudgetActual, Invoice } from "@shared/schema";
import { toTitleCase } from "@/lib/format";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { fmtDate, formatCurrency } from "./invoice-format";
import type { EffStatus, StatusCfg } from "./invoice-status";
import { daysSince } from "./invoice-history";
import type { AprovAction } from "./types";

export interface AprovacaoRowProps {
  inv: Invoice;
  actual: BudgetActual | undefined;
  name: string;
  funcName: string;
  effSt: EffStatus;
  cfg: StatusCfg;
  /** Ação aberta NESTA linha (null = nenhuma). */
  activeType: AprovAction | null;
  isHistOpen: boolean;
  historyCount: number;
  isTarget: boolean;
  /** Realizado devolvido/rejeitado pausa a aprovação da NF até o reenvio. */
  actualBlocked: boolean;
  onOpenAction: (invId: string, type: AprovAction) => void;
  onToggleHistory: (invId: string) => void;
}

export const AprovacaoRow = memo(function AprovacaoRow({
  inv, actual, name, funcName, effSt, cfg, activeType, isHistOpen, historyCount, isTarget, actualBlocked, onOpenAction, onToggleHistory,
}: AprovacaoRowProps) {
  const isActive     = activeType !== null;
  const initial      = name && name !== "—" ? name.charAt(0).toUpperCase() : "?";
  const hasReturn    = !!inv.returnComment;
  const borderColor  = isHistOpen ? "var(--primary)" : cfg.border;

  return (
    <tr
      data-actual-id={inv.budgetActualId}
      className={`hover:bg-surface-muted/60 transition-colors duration-700 ${
        isTarget
          ? "bg-brand-soft/70"
          : activeType === "approve"
          ? "bg-card"
          : isHistOpen
          ? "bg-brand-soft/30"
          : isActive
          ? "bg-surface-muted"
          : "border-b border-border"
      }`}
      style={{
        borderLeft: `3px solid ${borderColor}`,
        ...(isTarget ? { boxShadow: "inset 0 0 0 2px var(--primary)" } : {}),
      }}
    >
      {/* Colaborador */}
      <td className="px-4 py-3.5 overflow-hidden" style={{ minWidth: "180px" }}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cfg.avatarCls}`}>
            {initial}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground truncate block" title={toTitleCase(name)}>{toTitleCase(name)}</span>
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
              {hasReturn && (
                <span title="Houve devolução" className="text-2xs text-warning-strong font-bold leading-none">↩</span>
              )}
              {effSt === "enviada" && (() => {
                const d = daysSince(inv);
                const color = d <= 2 ? "var(--muted-foreground)" : d <= 5 ? "var(--warning)" : "var(--danger)";
                return (
                  <span className="text-2xs font-medium leading-none" style={{ color }}>
                    há {d} {d === 1 ? "dia" : "dias"}{d > 5 ? " ⚠" : ""}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </td>
      {/* Função */}
      <td className="px-4 py-3.5 overflow-hidden">
        <span className="text-xs text-muted-foreground truncate block">{funcName}</span>
      </td>
      {/* Valor */}
      <td className="px-4 py-3.5 text-right">
        <span className="text-sm font-bold text-primary tabular-nums font-mono">
          {actual ? formatCurrency(actual.totalValue) : "—"}
        </span>
      </td>
      {/* OC */}
      <td className="px-4 py-3.5 overflow-hidden">
        <span className="text-xs font-mono text-slate-600 truncate block">{inv.oc || "—"}</span>
      </td>
      {/* Nota */}
      <td className="px-4 py-3.5">
        {inv.attachmentUrl ? (
          <a href={inv.attachmentUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-brand-soft hover:bg-brand-soft px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver nota
          </a>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      {/* Histórico toggle */}
      <td className="px-2 py-3.5 text-center">
        <button
          onClick={() => onToggleHistory(inv.id)}
          title={isHistOpen ? "Fechar histórico" : `${historyCount} evento(s)`}
          aria-expanded={isHistOpen}
          aria-label={isHistOpen ? "Fechar histórico" : `Abrir histórico (${historyCount} eventos)`}
          className={`inline-flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors ${
            isHistOpen
              ? "text-primary bg-brand-soft"
              : "text-muted-foreground hover:text-primary hover:bg-brand-soft"
          }`}
        >
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          {!isHistOpen && (
            <span className="text-2xs font-semibold leading-none tabular-nums">{historyCount}</span>
          )}
        </button>
      </td>
      {/* Ações */}
      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-1.5">
          {effSt === "enviada" && (
            <>
              {actualBlocked && (
                <span
                  className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-1 rounded-full bg-warning-soft text-warning border border-warning/25 whitespace-nowrap"
                  title="Realizado devolvido — aguarde o reenvio"
                >
                  <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Realizado devolvido
                </span>
              )}
              <MotivoDesabilitado motivo={actualBlocked ? "Realizado devolvido — aguarde o reenvio" : undefined} desabilitado={actualBlocked}>
                <button
                onClick={() => onOpenAction(inv.id, "approve")}
                disabled={actualBlocked}

                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                  actualBlocked
                    ? "text-muted-foreground bg-surface-muted border-border cursor-not-allowed opacity-60"
                    : activeType === "approve"
                    ? "bg-success text-white border-success"
                    : "text-success bg-success-soft border-success/25 hover:bg-success-soft"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Aprovar
              </button>
              </MotivoDesabilitado>
              <button
                onClick={() => onOpenAction(inv.id, "return")}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                  activeType === "return"
                    ? "bg-warning text-white border-warning"
                    : "text-warning bg-warning-soft border-warning/25 hover:bg-warning-soft"
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Devolver
              </button>
              <button
                onClick={() => onOpenAction(inv.id, "reject")}
                title="Recusar em definitivo — a nota não poderá ser reenviada"
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                  activeType === "reject"
                    ? "bg-danger text-white border-danger"
                    : "text-danger bg-danger-soft border-danger/25 hover:bg-danger-soft"
                }`}
              >
                <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Recusar
              </button>
            </>
          )}
          {effSt === "checkin-pendente" && (
            <button
              onClick={() => onOpenAction(inv.id, "checkin")}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
                activeType === "checkin"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-primary bg-brand-soft border-primary/25 hover:bg-brand-soft"
              }`}
            >
              <CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Fazer Check-in
            </button>
          )}
          {effSt === "checkin-realizado" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success bg-success-soft border border-success/25 px-2.5 py-1.5 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {fmtDate(inv.paymentDate)}
            </span>
          )}
          {effSt === "devolvida" && (
            <span className="text-2xs text-muted-foreground italic truncate max-w-[180px]" title={inv.returnComment || undefined}>
              {inv.returnComment || "Devolvida"}
            </span>
          )}
          {effSt === "recusada" && (
            <span
              className="text-2xs text-danger italic truncate max-w-[180px]"
              title={inv.returnComment ? `Recusada: ${inv.returnComment}` : "Recusada"}
            >
              {inv.returnComment || "Recusada"}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
});
