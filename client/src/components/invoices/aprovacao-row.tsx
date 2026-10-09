// Extraído de invoices.tsx em 25/09 (modularização): linha principal da
// tabela da aba Aprovação RH (colaborador, função, valor, OC, nota, histórico
// e botões de ação). O painel inline e o histórico ficam em linhas próprias
// (ver aprovacao-tab.tsx). `React.memo` porque é linha de lista.
//
// 08/10 (redesenho): a função desceu para baixo do nome (a coluna própria
// cortava "Simone Freitas Cu…" para mostrar "Sup Ceno"), a situação, o prazo
// e o aviso de Realizado devolvido moram juntos embaixo do nome, os valores
// ficaram em números alinhados (sem fonte de máquina de escrever) e as três
// ações deixaram de ser três botões coloridos por linha: "Aprovar" tem o
// contorno verde; "Devolver" e "Recusar" são discretos e só ganham cor ao
// apontar ou quando o painel deles está aberto. Abaixo de 960px úteis a MESMA
// árvore vira cartão por CSS (`.nf-tab-cartao` no index.css).
import { memo } from "react";
import {
  FileText, CheckCircle2, RotateCcw, Clock,
  AlertTriangle, CircleDot, Ban,
} from "lucide-react";
import type { BudgetActual, Invoice } from "@shared/schema";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { fmtDate, formatCurrency, haDias } from "./invoice-format";
import { PILULA, type EffStatus, type StatusCfg } from "./invoice-status";
import { daysSince } from "./invoice-history";
import { useAcabouDeMudar } from "./use-acabou-de-mudar";
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

/** Botão de ação da linha: 32px, ícone + verbo. */
const ACAO = "pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const AprovacaoRow = memo(function AprovacaoRow({
  inv, actual, name, funcName, effSt, cfg, activeType, isHistOpen, historyCount, isTarget, actualBlocked, onOpenAction, onToggleHistory,
}: AprovacaoRowProps) {
  const isActive     = activeType !== null;
  const displayName  = toTitleCase(name);
  const initial      = displayName && displayName !== "—" ? displayName.charAt(0).toUpperCase() : "?";
  const hasReturn    = !!inv.returnComment;
  const borderCls    = isHistOpen ? "border-l-primary" : cfg.borderCls;
  const acesa        = useAcabouDeMudar(effSt);
  const dias         = effSt === "enviada" ? daysSince(inv) : 0;
  const tomDosDias   = dias <= 2 ? "text-muted-foreground" : dias <= 5 ? "text-warning" : "text-danger";
  const aberta       = isActive || isHistOpen;

  return (
    <tr
      data-actual-id={inv.budgetActualId}
      className={cn(
        "nf-tr border-l-[3px] align-top",
        isTarget && "nf-alvo",
        acesa && "nf-acesa",
        aberta ? "bg-surface-muted/70" : "border-b border-border hover:bg-surface-muted/50",
        // Depois de `border-border`: o tailwind-merge descartaria a cor da borda esquerda.
        borderCls,
      )}
    >
      {/* Colaborador · função · situação · prazo */}
      <td data-col="colab" className="nf-td pl-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span aria-hidden="true" className={`mt-0.5 w-8 h-8 rounded-full inline-flex items-center justify-center text-xs font-semibold shrink-0 ${cfg.avatarCls}`}>
            {initial}
          </span>
          <div className="min-w-0">
            <span className="block text-sm font-medium leading-5 text-foreground" title={displayName}>{displayName}</span>
            <span className="block text-2xs leading-4 text-muted-foreground">{funcName}</span>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className={`${PILULA} ${cfg.pill}`}>{cfg.label}</span>
              {hasReturn && (
                <span title="Houve devolução" className="inline-flex items-center text-warning-strong">
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span className="sr-only">Houve devolução</span>
                </span>
              )}
              {effSt === "enviada" && (
                <span className={`inline-flex items-center gap-0.5 text-2xs font-medium tabular-nums ${tomDosDias}`} title="Desde o último envio da nota">
                  {haDias(dias)}
                  {dias > 5 && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
                </span>
              )}
              {effSt === "enviada" && actualBlocked && (
                <span
                  className={`${PILULA} gap-1 bg-warning-soft text-warning`}
                  title="Realizado devolvido — aguarde o reenvio"
                >
                  <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Realizado devolvido
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      {/* Valor */}
      <td data-col="valor" data-rotulo="Valor" className="nf-td text-right">
        <span className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">
          {actual ? formatCurrency(actual.totalValue) : "—"}
        </span>
      </td>
      {/* OC */}
      <td data-col="oc" data-rotulo="OC" className="nf-td">
        <span className="block font-mono text-xs font-semibold text-slate-700 break-all">{inv.oc || "—"}</span>
      </td>
      {/* Nota */}
      <td data-col="nota" data-rotulo="Nota" className="nf-td">
        {inv.attachmentUrl ? (
          <a href={inv.attachmentUrl} target="_blank" rel="noopener noreferrer"
            className="pas-alvo inline-flex items-center gap-1.5 h-7 px-2 -ml-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Ver nota
          </a>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      {/* Histórico */}
      <td data-col="hist" className="nf-td px-1 text-center">
        <button
          type="button"
          onClick={() => onToggleHistory(inv.id)}
          title={isHistOpen ? "Fechar histórico" : `Histórico: ${historyCount} ${historyCount === 1 ? "evento" : "eventos"}`}
          aria-expanded={isHistOpen}
          aria-label={isHistOpen ? "Fechar histórico" : `Abrir histórico (${historyCount} ${historyCount === 1 ? "evento" : "eventos"})`}
          className={cn(
            "pas-alvo h-8 min-w-8 px-1.5 inline-flex items-center justify-center gap-1 rounded-lg text-2xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isHistOpen ? "bg-brand-soft text-primary" : "text-muted-foreground hover:bg-brand-soft hover:text-primary",
          )}
        >
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          {historyCount}
        </button>
      </td>
      {/* Ações */}
      <td data-col="acoes" className="nf-td pr-4">
        <div className="nf-acoes flex flex-wrap items-center justify-end gap-1">
          {effSt === "enviada" && (
            <>
              <MotivoDesabilitado motivo={actualBlocked ? "Realizado devolvido — aguarde o reenvio" : undefined} desabilitado={actualBlocked}>
                <button
                  type="button"
                  onClick={() => onOpenAction(inv.id, "approve")}
                  disabled={actualBlocked}
                  aria-expanded={activeType === "approve"}
                  className={cn(
                    ACAO,
                    actualBlocked
                      ? "text-muted-foreground bg-surface-muted border-border cursor-not-allowed opacity-60"
                      : activeType === "approve"
                      ? "bg-success text-white border-success"
                      : "text-success bg-card border-success/35 hover:bg-success-soft",
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Aprovar
                </button>
              </MotivoDesabilitado>
              <button
                type="button"
                onClick={() => onOpenAction(inv.id, "return")}
                aria-expanded={activeType === "return"}
                className={cn(
                  ACAO,
                  activeType === "return"
                    ? "bg-warning-soft text-warning border-warning/40"
                    : "border-transparent text-slate-700 hover:bg-warning-soft hover:text-warning",
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Devolver
              </button>
              <button
                type="button"
                onClick={() => onOpenAction(inv.id, "reject")}
                title="Recusar em definitivo — a nota não poderá ser reenviada"
                aria-expanded={activeType === "reject"}
                className={cn(
                  ACAO,
                  activeType === "reject"
                    ? "bg-danger-soft text-danger border-danger/40"
                    : "border-transparent text-muted-foreground hover:bg-danger-soft hover:text-danger",
                )}
              >
                <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Recusar
              </button>
            </>
          )}
          {effSt === "checkin-pendente" && (
            <button
              type="button"
              onClick={() => onOpenAction(inv.id, "checkin")}
              aria-expanded={activeType === "checkin"}
              className={cn(
                ACAO,
                activeType === "checkin"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-primary bg-card border-primary/35 hover:bg-brand-soft",
              )}
            >
              <CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Fazer check-in
            </button>
          )}
          {effSt === "checkin-realizado" && (
            <span className="inline-flex items-center gap-1.5 h-8 px-1 text-xs text-success" title="Data de pagamento definida no check-in">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Pgto <span className="font-semibold tabular-nums">{fmtDate(inv.paymentDate)}</span>
            </span>
          )}
          {effSt === "devolvida" && (
            <span className="nf-motivo text-xs text-slate-600 text-right" title={inv.returnComment || undefined}>
              {inv.returnComment || "Devolvida"}
            </span>
          )}
          {effSt === "recusada" && (
            <span
              className="nf-motivo text-xs text-danger text-right"
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
