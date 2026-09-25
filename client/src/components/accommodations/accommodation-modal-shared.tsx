/**
 * Modal de Hospedagem — estilos, rótulos e peças comuns às abas
 * (25/09, extraídos de accommodation-modal.tsx).
 */
import { Hotel, RefreshCw, UserRound, CalendarDays, Pencil, Sparkles, CheckCircle2, Unlock, type LucideIcon } from "lucide-react";

export const LBL = "text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-0.5";
export const VAL = "text-sm font-semibold text-slate-700";
export const FIELD_LBL = "text-2xs font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1 block";
export const TAB = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";

export const LOG_ACTIONS: Record<string, { label: string; icon: LucideIcon }> = {
  status_changed: { label: "Status alterado", icon: RefreshCw },
  collaborator_changed: { label: "Colaborador alterado", icon: UserRound },
  dates_changed: { label: "Período alterado", icon: CalendarDays },
  accommodation_created: { label: "Hospedagem criada", icon: Hotel },
  accommodation_updated: { label: "Hospedagem atualizada", icon: Pencil },
  created: { label: "Criado", icon: Sparkles },
  confirmed: { label: "Confirmado", icon: CheckCircle2 },
  reopened: { label: "Reaberto", icon: Unlock },
};

export function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className={LBL}>{label}</div>
      <div className={`${VAL} ${mono ? "font-mono font-bold" : ""}`}>{children}</div>
    </div>
  );
}

/** O que o voucher traz e esta tela não guarda — dito por extenso no aviso. */
export const ROTULO_FORA: Record<string, string> = {
  roomType: "o tipo de quarto",
  nightsCount: "o número de diárias",
  dailyRate: "o valor da diária",
  totalCents: "o total da hospedagem",
  paymentCompany: "a empresa pagadora",
};
