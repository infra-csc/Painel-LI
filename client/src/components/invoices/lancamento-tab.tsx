// Extraído de invoices.tsx em 25/09 (modularização): aba "Lançamento" da tela
// de Notas Fiscais — lista os itens NF-elegíveis do Realizado com o card de
// envio (ou a linha "Não emite NF"). Filtro de status vem da URL via página.
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { BudgetActual, Event, Invoice } from "@shared/schema";
import { FilterPills } from "./filter-pills";
import { InvoiceCard } from "./invoice-card";
import { SemNfItem } from "./sem-nf-item";
import { getEffectiveStatus } from "./invoice-status";
import type { AbaBaseProps } from "./types";

// ── Lançamento Tab ────────────────────────────────────────────────────────────
const LANC_FILTERS = [
  { id: "all",               label: "Todos",              activeBg: "bg-slate-700 text-white" },
  { id: "pendente",          label: "Pendente",           activeBg: "bg-slate-500 text-white" },
  { id: "enviada",           label: "Aguardando RH",      activeBg: "bg-warning-strong text-white" },
  { id: "devolvida",         label: "Devolvida",          activeBg: "bg-warning-strong text-white" },
  { id: "recusada",          label: "NF recusada",        activeBg: "bg-danger text-white" },
  { id: "checkin-pendente",  label: "Aguard. Check-in",   activeBg: "bg-primary text-primary-foreground" },
  { id: "checkin-realizado", label: "Check-in Realizado", activeBg: "bg-success text-white" },
  { id: "sem-nf",            label: "Não emite NF",       activeBg: "bg-slate-500 text-white" },
];

export interface LancamentoTabProps extends AbaBaseProps {
  approvedActuals: BudgetActual[];
  emitsNfFor: (actual: BudgetActual) => boolean;
  getInvoice: (actualId: string) => Invoice | undefined;
  selectedEvent: Event | undefined;
}

// Filtro de status controlado pela página (vive na URL desde 23/09).
export function LancamentoTab({ approvedActuals, emitsNfFor, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast, filterStatus, onFilterStatus, highlightActualId }: LancamentoTabProps) {
  const setFilterStatus = onFilterStatus;
  const [highlightedId, setHighlightedId] = useState<string>(highlightActualId || "");

  // When highlightActualId arrives, update and clear after animation
  useEffect(() => {
    if (highlightActualId) {
      setHighlightedId(highlightActualId);
      const timer = setTimeout(() => setHighlightedId(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightActualId]);

  // Scroll to the highlighted card — retries until element appears in DOM (data may load async)
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
  }, [highlightedId, filterStatus, approvedActuals?.length]);

  function getEffStatus(actual: BudgetActual) {
    if (!emitsNfFor(actual)) return "sem-nf"; // definido na escalação
    return getEffectiveStatus(getInvoice(actual.id));
  }

  const countFor = (id: string) =>
    id === "all"
      ? approvedActuals.length
      : approvedActuals.filter(a => getEffStatus(a) === id).length;

  const filtered = filterStatus === "all"
    ? approvedActuals
    : approvedActuals.filter(a => getEffStatus(a) === filterStatus);

  if (approvedActuals.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-16 text-center">
        <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nenhum colaborador com Realizado enviado para este evento.</p>
        <p className="text-xs text-muted-foreground mt-1">O lançamento de notas é liberado assim que o Realizado é enviado. Itens devolvidos ou rejeitados ficam pausados até a regularização.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterPills filters={LANC_FILTERS} active={filterStatus} countFor={countFor} onChange={setFilterStatus} />

      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhum item com este status.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(actual => {
            const isTarget = actual.id === highlightedId;
            if (!emitsNfFor(actual)) {
              // Definido na escalação: não emite NF — mostra o item sem cobrar nota
              return (
                <SemNfItem key={actual.id} actual={actual} getName={getName} getFuncName={getFuncName} />
              );
            }
            return (
              <div
                key={actual.id}
                data-actual-id={actual.id}
                className={`rounded-xl transition-all duration-700 ${isTarget ? "ring-2 ring-ring ring-offset-2 shadow-2 " : ""}`}
              >
                <InvoiceCard
                  actual={actual}
                  invoice={getInvoice(actual.id)}
                  getName={getName}
                  getFuncName={getFuncName}
                  selectedEvent={selectedEvent}
                  selectedEventId={selectedEventId}
                  qc={qc}
                  toast={toast}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
