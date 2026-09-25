// Extraído de invoices.tsx em 25/09 (modularização): aba "Aprovação RH" da
// tela de Notas Fiscais — tabela das notas enviadas com ações do RH. Estado
// da ação aberta/motivo/data fica aqui; mutations em `useAprovacaoMutations`;
// linha, painel inline e rodapé são componentes próprios.
import { Fragment, useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import type { Invoice } from "@shared/schema";
import { FilterPills } from "./filter-pills";
import { getEffectiveStatus, getStatusCfg } from "./invoice-status";
import { buildHistory, daysSince, HistoryPanel } from "./invoice-history";
import { AprovacaoRow } from "./aprovacao-row";
import { AprovacaoActionPanel } from "./aprovacao-action-panel";
import { AprovacaoTotalsFooter } from "./aprovacao-totals-footer";
import { useAprovacaoMutations } from "./use-invoice-actions";
import type { AbaBaseProps, ActiveAprovAction, AprovAction } from "./types";
import type { BudgetActual } from "@shared/schema";

// ── Aprovação Tab ─────────────────────────────────────────────────────────────
const APROV_FILTERS = [
  { id: "all",               label: "Todos",              activeBg: "bg-slate-700 text-white" },
  { id: "enviada",           label: "Aguardando",         activeBg: "bg-warning-strong text-white" },
  { id: "checkin-pendente",  label: "Aguard. Check-in",   activeBg: "bg-primary text-primary-foreground" },
  { id: "checkin-realizado", label: "Check-in Realizado", activeBg: "bg-success text-white" },
  { id: "devolvida",         label: "Devolvida",          activeBg: "bg-warning-strong text-white" },
  { id: "recusada",          label: "NF recusada",        activeBg: "bg-danger text-white" },
];

export interface AprovacaoTabProps extends AbaBaseProps {
  invoices: Invoice[];
  budgetActuals: BudgetActual[];
}

// Filtro de status controlado pela página (vive na URL desde 23/09).
export function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast, filterStatus, onFilterStatus, highlightActualId }: AprovacaoTabProps) {
  const [active, setActive]             = useState<ActiveAprovAction>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [comment, setComment]           = useState("");
  const [tocouMotivo, setTocouMotivo]   = useState(false);
  const [checkinDate, setCheckinDate]   = useState("");
  const setFilterStatus = onFilterStatus;
  const [highlightedId, setHighlightedId] = useState<string>(highlightActualId || "");

  // Param `actual` → destaca a linha e limpa após a animação (padrão da LancamentoTab)
  useEffect(() => {
    if (highlightActualId) {
      setHighlightedId(highlightActualId);
      const timer = setTimeout(() => setHighlightedId(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightActualId]);

  // Scroll até a linha destacada — tenta de novo até o elemento aparecer no DOM
  useEffect(() => {
    if (!highlightedId) return;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.querySelector(`[data-actual-id="${highlightedId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryScroll, 200);
      }
    };
    const t = setTimeout(tryScroll, 150);
    return () => clearTimeout(t);
  }, [highlightedId, filterStatus, invoices?.length]);

  // `useCallback` (25/09) só para o `React.memo` da linha valer — a lógica é a mesma.
  const openAction = useCallback((invId: string, type: AprovAction) => {
    setHistoryOpenId(null);
    if (active?.invId === invId && active.type === type) {
      setActive(null);
    } else {
      setActive({ invId, type });
      setComment("");
      setCheckinDate("");
    }
  }, [active]);
  const closeAction = useCallback(() => { setActive(null); }, []);
  const toggleHistory = useCallback((invId: string) => {
    setActive(null);
    setHistoryOpenId(prev => prev === invId ? null : invId);
  }, []);

  const { approveMutation, returnMutation, rejectMutation, checkinMutation } =
    useAprovacaoMutations({ selectedEventId, qc, toast, comment, checkinDate, closeAction });

  if (invoices.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-16 text-center">
        <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nenhuma nota enviada ainda para este evento.</p>
      </div>
    );
  }

  const getActual = (id: string | null) => budgetActuals.find(a => a.id === id);

  const aprovCountFor = (id: string) => {
    if (id === "all") return invoices.length;
    return invoices.filter(i => getEffectiveStatus(i) === id).length;
  };
  const alertFor = (id: string): number => {
    if (id !== "enviada") return 0;
    return invoices.filter(i => i.status === "enviada" && daysSince(i) > 3).length;
  };

  const filteredInvoices = filterStatus === "all"
    ? invoices
    : invoices.filter(i => getEffectiveStatus(i) === filterStatus);

  // Totals footer
  const approvedTotal = invoices.reduce((sum: number, inv) => {
    if (inv.status !== "aprovada") return sum;
    const actual = getActual(inv.budgetActualId);
    return sum + (actual?.totalValue || 0);
  }, 0);
  const waitingTotal = invoices.reduce((sum: number, inv) => {
    if (inv.status !== "enviada") return sum;
    const actual = getActual(inv.budgetActualId);
    return sum + (actual?.totalValue || 0);
  }, 0);
  const grandTotal = approvedTotal + waitingTotal;

  return (
    <div className="space-y-3">
      <FilterPills filters={APROV_FILTERS} active={filterStatus} countFor={aprovCountFor} onChange={setFilterStatus} alertFor={alertFor} />

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full" style={{ tableLayout: "fixed", minWidth: "760px" }}>
          <caption className="sr-only">Notas fiscais: colaborador, evento, valor, competência e situação da nota</caption>
          <colgroup>
            <col style={{ width: "210px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "95px" }} />
            <col style={{ width: "95px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "52px" }} />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface-muted/60">
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Colaborador</th>
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Função</th>
              <th scope="col" className="text-right px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Valor</th>
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">OC</th>
              <th scope="col" className="text-left px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Nota</th>
              <th scope="col" className="px-2 py-3" />
              <th scope="col" className="text-right px-4 py-3 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum item com este status.
                </td>
              </tr>
            ) : null}
            {filteredInvoices.map(inv => {
              const actual   = getActual(inv.budgetActualId);
              const name     = getName(inv.collaboratorId);
              const effSt        = getEffectiveStatus(inv);
              const cfg          = getStatusCfg(effSt);
              const isActive     = active?.invId === inv.id;
              const isHistOpen   = historyOpenId === inv.id;
              const history      = buildHistory(inv, name);
              // Realizado devolvido/rejeitado pausa a aprovação da NF até o reenvio
              const actualBlocked = !!actual && (actual.rhStatus === "devolvido" || actual.rhStatus === "rejeitado");
              const isTarget = !!highlightedId && inv.budgetActualId === highlightedId;

              return (
                <Fragment key={inv.id}>
                  <AprovacaoRow
                    inv={inv}
                    actual={actual}
                    name={name}
                    funcName={getFuncName(inv.functionId)}
                    effSt={effSt}
                    cfg={cfg}
                    activeType={isActive && active ? active.type : null}
                    isHistOpen={isHistOpen}
                    historyCount={history.length}
                    isTarget={isTarget}
                    actualBlocked={actualBlocked}
                    onOpenAction={openAction}
                    onToggleHistory={toggleHistory}
                  />

                  {/* Inline action panel */}
                  {isActive && active && (
                    <AprovacaoActionPanel
                      key={`${inv.id}-panel`}
                      inv={inv}
                      cfg={cfg}
                      type={active.type}
                      comment={comment}
                      setComment={setComment}
                      tocouMotivo={tocouMotivo}
                      setTocouMotivo={setTocouMotivo}
                      checkinDate={checkinDate}
                      setCheckinDate={setCheckinDate}
                      closeAction={closeAction}
                      approveMutation={approveMutation}
                      returnMutation={returnMutation}
                      rejectMutation={rejectMutation}
                      checkinMutation={checkinMutation}
                    />
                  )}

                  {/* History panel */}
                  {isHistOpen && (
                    <tr key={`${inv.id}-history`} className="border-b border-primary/25">
                      <td
                        colSpan={7}
                        className="bg-surface-muted border-t border-t-primary/25" style={{
                          padding: "12px 16px 12px 48px",
                        }}
                      >
                        <HistoryPanel events={history} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <AprovacaoTotalsFooter approvedTotal={approvedTotal} waitingTotal={waitingTotal} grandTotal={grandTotal} />
        </table>
        </div>
      </div>
    </div>
  );
}
