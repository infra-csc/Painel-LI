/**
 * Modal de Hospedagem — estilos, rótulos e peças comuns às abas
 * (25/09, extraídos de accommodation-modal.tsx).
 *
 * 07/10 (redesenho): rótulo, valor e título de seção são OS MESMOS do modal de
 * Passagens (ticket-summary-tab) — os dois registros da Logística leem igual.
 * O rótulo em caixa alta de 10px com tracking largo saiu; ficou o de 11px em
 * caixa normal, que é lido como rótulo e não compete com o dado.
 */
import type { ReactNode } from "react";
import { LBL, VAL, SECAO } from "@/components/tickets/ticket-summary-tab";

export { LBL, VAL, SECAO };

/** Rótulo dos campos do formulário — o mesmo do formulário de Passagens. */
export const FIELD_LBL = "text-xs font-medium text-slate-600 mb-1.5 block";

/** Aba do modal — a mesma de Passagens (filete da ativa, foco visível, rola de lado no celular). */
export const TAB = "relative shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 sm:px-4 pb-2.5 pt-2.5 text-sm font-medium shadow-none hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Um campo de leitura (rótulo + valor) numa lista de definição. */
export function Field({ label, children, mono, className = "" }: { label: string; children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className={LBL}>{label}</dt>
      <dd className={`m-0 ${VAL} break-words ${mono ? "font-mono" : ""}`}>{children}</dd>
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
