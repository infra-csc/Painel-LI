// Extraído de invoices.tsx em 25/09 (modularização): leitura do JSON gravado
// em `invoices.history`, reconstrução do histórico para notas antigas, o
// painel visual da linha do tempo e o prazo "há N dias" da aprovação.
// Tudo o que interpreta o histórico mora aqui para o card e a tabela
// mostrarem exatamente os mesmos eventos.
import { Paperclip } from "lucide-react";
import type { Invoice } from "@shared/schema";
import { toTitleCase } from "@/lib/format";
import { lerJson } from "@/lib/json-seguro";
import { fmtDate, fmtDateTime, iso } from "./invoice-format";

export type HistEvent = {
  type: "enviado" | "reenviado" | "devolvido" | "recusado" | "aprovado" | "checkin";
  label: string;
  color: string;
  at: string | null;
  by: string;
  oc?: string | null;
  attachmentName?: string | null;
  comment?: string | null;
  paymentDate?: string;
};

const HIST_CFG: Record<HistEvent["type"], { label: string; color: string; by: "colaborador" | "rh" }> = {
  enviado:   { label: "Enviado",   color: "var(--primary)", by: "colaborador" },
  reenviado: { label: "Reenviado", color: "var(--primary)", by: "colaborador" },
  devolvido: { label: "Devolvido", color: "var(--warning)", by: "rh" },
  recusado:  { label: "Recusado",  color: "var(--danger)", by: "rh" },
  aprovado:  { label: "Aprovado",  color: "var(--success)", by: "rh" },
  checkin:   { label: "Check-in",  color: "var(--primary)", by: "rh" },
};

/** Entrada do JSON gravado em `invoices.history` (texto livre do servidor). */
interface StoredHistEntry {
  type?: string;
  at?: string | null;
  oc?: string | null;
  attachmentName?: string | null;
  comment?: string | null;
  paymentDate?: string | null;
}

// Aceita string (API de hoje) ou array (jsonb direto) — ver lib/json-seguro.
function parseStoredHistory(raw: string | StoredHistEntry[] | null | undefined): StoredHistEntry[] {
  const parsed = lerJson<unknown>(raw);
  return Array.isArray(parsed) ? (parsed as StoredHistEntry[]) : [];
}

export function buildHistory(inv: Invoice, collabName: string): HistEvent[] {
  // Use stored history if available
  if (inv.history) {
    try {
      const stored = parseStoredHistory(inv.history);
      if (stored.length > 0) {
        return stored.map(e => {
          const cfg = HIST_CFG[e.type as HistEvent["type"]] || HIST_CFG.enviado;
          return {
            type: e.type,
            label: cfg.label,
            color: cfg.color,
            at: e.at ? fmtDateTime(e.at) : null,
            by: cfg.by === "colaborador" ? toTitleCase(collabName) : "RH",
            oc: e.oc || null,
            attachmentName: e.attachmentName || null,
            comment: e.comment || null,
            paymentDate: e.paymentDate || undefined,
          } as HistEvent;
        });
      }
    } catch { /* fall through */ }
  }
  // Fallback reconstruction for old invoices without stored history
  const events: HistEvent[] = [];
  events.push({ type: "enviado", label: "Enviado", color: "var(--primary)", at: fmtDateTime(inv.createdAt), by: toTitleCase(collabName) });
  if (inv.returnComment) {
    events.push({ type: "devolvido", label: "Devolvido", color: "var(--warning)", at: null, by: "RH", comment: inv.returnComment });
  }
  if (inv.approvedAt) {
    events.push({ type: "aprovado", label: "Aprovado", color: "var(--success)", at: fmtDateTime(inv.approvedAt), by: "RH" });
  }
  if (inv.paymentDate) {
    events.push({ type: "checkin", label: "Check-in", color: "var(--primary)", at: null, by: "RH", paymentDate: inv.paymentDate });
  }
  return events;
}

export function daysSince(inv: Invoice) {
  // Conta a partir do último envio/reenvio registrado no histórico
  // (após uma devolução + reenvio, o prazo reinicia). Fallback: createdAt.
  let ref: string | null = iso(inv.createdAt);
  if (inv.history) {
    try {
      const stored = parseStoredHistory(inv.history);
      for (const e of stored) {
        if ((e?.type === "enviado" || e?.type === "reenviado") && e?.at) ref = e.at;
      }
    } catch { /* histórico inválido — mantém createdAt */ }
  }
  const t = ref ? Date.parse(ref) : NaN;
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

export function HistoryPanel({ events }: { events: HistEvent[] }) {
  if (events.length === 0) return null;
  if (events.length === 1) {
    const e = events[0];
    return (
      <div className="text-2xs text-muted-foreground italic">
        Enviado em {e.at || "—"} por {e.by}
        {e.oc && <span className="not-italic text-slate-600 ml-1">· OC: <span className="font-mono font-semibold">{e.oc}</span></span>}
        {e.attachmentName && <span className="not-italic text-muted-foreground ml-1">· Nota: {e.attachmentName}</span>}
      </div>
    );
  }
  return (
    <div className="relative pl-4">
      {/* vertical dotted line */}
      <div className="absolute left-[7px] top-3 bottom-3 w-px border-l-2 border-dotted border-border" />
      <div className="space-y-3">
        {events.map((ev, i) => (
          <div key={i} className="relative flex items-start gap-3">
            {/* dot */}
            <div className="absolute -left-4 top-[5px] w-2 h-2 rounded-full ring-2 ring-white shrink-0" style={{ background: ev.color }} />
            <div className="min-w-0 w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: ev.color }}>{ev.label}</span>
                {ev.at && <span className="text-2xs text-muted-foreground">{ev.at}</span>}
                <span className="text-2xs text-muted-foreground italic">por {ev.by}</span>
              </div>
              {/* OC and attachment for sent/resent */}
              {(ev.type === "enviado" || ev.type === "reenviado") && (ev.oc || ev.attachmentName) && (
                <div className="mt-1 ml-0 flex items-center gap-3 flex-wrap">
                  {ev.oc && (
                    <span className="text-2xs text-slate-600">
                      OC: <span className="font-mono font-semibold text-foreground">{ev.oc}</span>
                    </span>
                  )}
                  {ev.attachmentName && (
                    <span className="text-2xs text-muted-foreground flex items-center gap-1">
                      <Paperclip className="w-2.5 h-2.5" aria-hidden="true" /> {ev.attachmentName}
                    </span>
                  )}
                </div>
              )}
              {ev.comment && (
                <div className="mt-1 text-2xs text-warning bg-warning-soft border-l-2 border-l-warning py-1 px-2"
                  style={{ borderRadius: "0 4px 4px 0" }}>
                  {ev.comment}
                </div>
              )}
              {ev.paymentDate && (
                <div className="mt-1 text-2xs text-primary italic">
                  Pagamento previsto: {fmtDate(ev.paymentDate)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
