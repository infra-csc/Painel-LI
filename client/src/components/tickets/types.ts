// Tipos compartilhados entre a página de Passagens e seus componentes.
import type { ReactNode } from "react";
import type { TicketFormValues } from "@/lib/ticket-form";

/** Formulários por escopo: "quick" (lote) ou o id da inclusão (modal). */
export type TicketFormState = Record<string, TicketFormValues>;

/** Erros inline por escopo → campo → mensagem. */
export type FieldErrorsState = Record<string, Record<string, string>>;

export interface TicketFilters {
  eventId: string;
  functionId: string[];
  collaboratorId: string;
  searchId: string;
  /** all | pending | processed | no_arrival */
  ticketStatus: string;
  /** all | active | cancelado */
  inclusionStatus: string;
  /** all | aereo | rodoviario | van */
  transportType: string;
}

export const DEFAULT_TICKET_FILTERS: TicketFilters = {
  eventId: "all",
  functionId: [],
  collaboratorId: "all",
  searchId: "",
  ticketStatus: "all",
  inclusionStatus: "active",
  transportType: "all",
};

/** Helpers de apresentação de erro/obrigatoriedade — funções, não componentes (não remontam a cada tecla). */
export interface FormFieldHelpers {
  errCls: (scope: string, field: string) => string;
  fieldErrorMsg: (scope: string, field: string) => ReactNode;
}

/** Callbacks de edição de formulário compartilhados por lote e modal. */
export interface TicketFormHandlers {
  onFieldChange: (scope: string, field: string, value: unknown) => void;
  onPatch: (scope: string, patch: Partial<TicketFormValues>) => void;
}

export interface BatchResult {
  created: number;
  updated: number;
  failures: string[];
}

export interface SuccessInfo {
  message: string;
  inclusionNumber: number | null;
  eventName: string;
  collaboratorName: string;
  functionName: string;
}
