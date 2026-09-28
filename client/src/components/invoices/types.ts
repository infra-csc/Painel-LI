// Extraído de invoices.tsx em 25/09 (modularização): tipos compartilhados
// entre a página, as abas, o card e os hooks de Notas Fiscais. Ficam à parte
// para nenhum módulo precisar importar outro só por causa de um tipo.
import type { QueryClient } from "@tanstack/react-query";
import type { useToast } from "@/hooks/use-toast";

export type ToastFn = ReturnType<typeof useToast>["toast"];

/** Props comuns das abas e do card: resolvedores de nome e infra da página. */
export interface AbaBaseProps {
  getName: (id?: string | null) => string;
  getFuncName: (id?: string | null) => string;
  selectedEventId: string;
  qc: QueryClient;
  toast: ToastFn;
  filterStatus: string;
  onFilterStatus: (v: string) => void;
  highlightActualId: string;
}

/** Ações do RH sobre uma NF (aba Aprovação). */
export type AprovAction = "approve" | "return" | "reject" | "checkin";
export type ActiveAprovAction = { invId: string; type: AprovAction } | null;

/** O que o painel de ação precisa de uma mutation: disparar e saber se está em andamento. */
export interface AcaoNfMutation {
  mutate: (id: string) => void;
  isPending: boolean;
}
