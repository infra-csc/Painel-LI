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

// Cor de cada tipo de evento em classe de token (08/10): o painel pintava com
// `style={{ color }}` a partir de `HIST_CFG.color`. O dado continua igual.
const TOM_DO_EVENTO: Record<HistEvent["type"], { dot: string; text: string }> = {
  enviado:   { dot: "bg-primary",        text: "text-primary" },
  reenviado: { dot: "bg-primary",        text: "text-primary" },
  devolvido: { dot: "bg-warning-strong", text: "text-warning" },
  recusado:  { dot: "bg-danger",         text: "text-danger" },
  aprovado:  { dot: "bg-success-strong", text: "text-success" },
  checkin:   { dot: "bg-success",        text: "text-success" },
};

/**
 * Linha do tempo da nota (08/10, redesenho): uma lista de verdade, com o fio
 * ligando os eventos, a data em números alinhados, quem fez, a OC e o anexo
 * de cada envio e o motivo citado de cada devolução/recusa. Com um evento só,
 * a mesma lista (antes virava uma frase em itálico, outro desenho).
 */
export function HistoryPanel({ events }: { events: HistEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol
      aria-label="Histórico da nota fiscal"
      className="relative m-0 p-0 list-none space-y-2.5 before:absolute before:left-[4px] before:top-2 before:bottom-2 before:w-px before:bg-border"
    >
      {events.map((ev, i) => {
        const tom = TOM_DO_EVENTO[ev.type] ?? TOM_DO_EVENTO.enviado;
        return (
          <li key={i} className="relative pl-5">
            <span aria-hidden="true" className={`absolute left-0 top-[5px] w-[9px] h-[9px] rounded-full ring-[3px] ring-surface-muted ${tom.dot}`} />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={`text-xs font-semibold ${tom.text}`}>{ev.label}</span>
              {ev.at && <span className="text-xs tabular-nums text-slate-600">{ev.at}</span>}
              <span className="text-xs text-muted-foreground">por {ev.by}</span>
            </div>
            {/* OC e anexo de cada envio/reenvio */}
            {(ev.type === "enviado" || ev.type === "reenviado") && (ev.oc || ev.attachmentName) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
                {ev.oc && (
                  <span>
                    OC <span className="font-mono font-semibold text-slate-700">{ev.oc}</span>
                  </span>
                )}
                {ev.attachmentName && (
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <Paperclip className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[280px]" title={ev.attachmentName}>{ev.attachmentName}</span>
                  </span>
                )}
              </div>
            )}
            {ev.comment && (
              <blockquote className={`m-0 mt-1 max-w-[640px] border-l-2 pl-2.5 py-0.5 text-xs leading-relaxed ${
                ev.type === "recusado" ? "border-l-danger text-danger" : "border-l-warning-strong text-warning"
              }`}>
                {ev.comment}
              </blockquote>
            )}
            {ev.paymentDate && (
              <p className="m-0 mt-0.5 text-2xs text-slate-600">
                Pagamento previsto: <span className="font-semibold tabular-nums">{fmtDate(ev.paymentDate)}</span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
