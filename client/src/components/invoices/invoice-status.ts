// Extraído de invoices.tsx em 25/09 (modularização): status "efetivo" da NF
// (aprovada vira aguardando/realizado check-in) e a tabela de estilos por
// status. Card, linha da tabela e filtros leem daqui — uma única fonte.
import type { Invoice } from "@shared/schema";

// Effective status for display (aprovada splits into checkin-pendente / checkin-realizado)
export type EffStatus = "pendente" | "enviada" | "devolvida" | "recusada" | "aprovada" | "checkin-pendente" | "checkin-realizado";

export function getEffectiveStatus(inv: Invoice | null | undefined): EffStatus {
  if (!inv) return "pendente";
  if (inv.status === "aprovada") {
    // "Concluído" = checkin realizado (checkinAt set); otherwise waiting for physical check-in
    return inv.checkinAt ? "checkin-realizado" : "checkin-pendente";
  }
  return inv.status as EffStatus;
}

export type StatusCfg = { label: string; pill: string; border: string; avatarCls: string };

const STATUS_CFG: Record<EffStatus, StatusCfg> = {
  pendente:          { label: "Pendente",            pill: "bg-muted text-muted-foreground",                              border: "var(--border)", avatarCls: "bg-muted text-muted-foreground" },
  enviada:           { label: "Aguardando RH",        pill: "bg-warning-soft text-warning ring-1 ring-warning/25",       border: "var(--warning-strong)", avatarCls: "bg-warning-soft text-warning" },
  devolvida:         { label: "Devolvida",            pill: "bg-warning-soft text-warning ring-1 ring-warning/25",    border: "var(--warning-strong)", avatarCls: "bg-warning-soft text-warning" },
  recusada:          { label: "NF recusada",          pill: "bg-danger-soft text-danger ring-1 ring-danger/25",            border: "var(--danger)", avatarCls: "bg-danger-soft text-danger" },
  aprovada:          { label: "Aprovada",             pill: "bg-success-soft text-success ring-1 ring-success/25", border: "var(--success-strong)", avatarCls: "bg-success-soft text-success" },
  "checkin-pendente":{ label: "Aguard. Check-in",    pill: "bg-brand-soft text-primary ring-1 ring-primary/25",         border: "var(--primary)", avatarCls: "bg-brand-soft text-primary" },
  "checkin-realizado":{ label: "Check-in Realizado", pill: "bg-success-soft text-success ring-1 ring-success/25", border: "var(--success)", avatarCls: "bg-success-soft text-success" },
};

// Fallback defensivo: um status desconhecido vindo do servidor não pode
// derrubar a tela inteira (foi o que aconteceu quando "recusada" surgiu).
const STATUS_CFG_FALLBACK: StatusCfg = {
  label: "Status desconhecido",
  pill: "bg-muted text-slate-600 ring-1 ring-border",
  border: "var(--neutral)",
  avatarCls: "bg-muted text-muted-foreground",
};

export function getStatusCfg(st: string): StatusCfg {
  return (STATUS_CFG as Record<string, StatusCfg>)[st] ?? STATUS_CFG_FALLBACK;
}
