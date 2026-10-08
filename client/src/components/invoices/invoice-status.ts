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

// `borderCls` (25/09): a borda esquerda colorida do card/linha em classe de
// token (`border-l-*`), no lugar de `style={{ borderLeft }}` com a variável —
// o guia proíbe cor por `style` em .tsx.
//
// 08/10 (redesenho): as pílulas perderam o anel (a forma vem de quem desenha:
// 22px, cantos de 6px, como nas telas irmãs) e ganharam `dot` — a bolinha da
// situação nos filtros e no histórico, na mesma cor da borda.
export type StatusCfg = { label: string; pill: string; borderCls: string; avatarCls: string; dot: string };

const STATUS_CFG: Record<EffStatus, StatusCfg> = {
  pendente:           { label: "Pendente",           pill: "bg-muted text-slate-600",         borderCls: "border-l-border",         avatarCls: "bg-muted text-muted-foreground",  dot: "bg-slate-400" },
  enviada:            { label: "Aguardando RH",      pill: "bg-warning-soft text-warning",    borderCls: "border-l-warning-strong", avatarCls: "bg-warning-soft text-warning",    dot: "bg-warning-strong" },
  devolvida:          { label: "Devolvida",          pill: "bg-warning-soft text-warning",    borderCls: "border-l-warning-strong", avatarCls: "bg-warning-soft text-warning",    dot: "bg-warning-strong" },
  recusada:           { label: "NF recusada",        pill: "bg-danger-soft text-danger",      borderCls: "border-l-danger",         avatarCls: "bg-danger-soft text-danger",      dot: "bg-danger" },
  aprovada:           { label: "Aprovada",           pill: "bg-success-soft text-success",    borderCls: "border-l-success-strong", avatarCls: "bg-success-soft text-success",    dot: "bg-success-strong" },
  "checkin-pendente": { label: "Aguard. check-in",   pill: "bg-brand-soft text-primary",      borderCls: "border-l-primary",        avatarCls: "bg-brand-soft text-primary",      dot: "bg-primary" },
  "checkin-realizado":{ label: "Check-in realizado", pill: "bg-success-soft text-success",    borderCls: "border-l-success",        avatarCls: "bg-success-soft text-success",    dot: "bg-success" },
};

// Fallback defensivo: um status desconhecido vindo do servidor não pode
// derrubar a tela inteira (foi o que aconteceu quando "recusada" surgiu).
const STATUS_CFG_FALLBACK: StatusCfg = {
  label: "Status desconhecido",
  pill: "bg-muted text-slate-600 ring-1 ring-border",
  borderCls: "border-l-neutral",
  avatarCls: "bg-muted text-muted-foreground",
  dot: "bg-neutral",
};

/** Forma das pílulas de situação (22px · cantos de 6px · 11px) — a das telas irmãs. */
export const PILULA = "inline-flex items-center h-[22px] px-[7px] rounded-md text-2xs font-semibold whitespace-nowrap";

export function getStatusCfg(st: string): StatusCfg {
  return (STATUS_CFG as Record<string, StatusCfg>)[st] ?? STATUS_CFG_FALLBACK;
}
