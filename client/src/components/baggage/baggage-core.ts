/**
 * Tipos, constantes e helpers puros do Controle de Bagagem.
 *
 * Tudo aqui saiu de `pages/baggage-control.tsx`, que tinha 1.563 linhas com a
 * regra, o formulário, a lista e os dois relatórios no mesmo arquivo. O
 * conteúdo foi COPIADO, não reescrito de memória — os testes ao lado travam o
 * comportamento exatamente como ele é hoje.
 */

// ── Formas locais das respostas da API (apenas os campos usados) ─────────────

export interface CollaboratorItem {
  id: string;
  fullName: string;
  documentType?: string | null;
  officialDocument?: string | null;
  secondaryDocument?: string | null;
  secondaryDocumentType?: string | null;
  type?: string | null;
  status?: string | null;
  active?: boolean | null;
}

export interface EventItem {
  id: string;
  name: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** Forma normalizada usada pelo combobox de evento (nome já com encoding corrigido). */
export interface EventOption {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
}

export interface BaggageRequestItem {
  id: string;
  eventId: string;
  collaboratorId: string;
  loc: string;
  cia: string;
  valueCents: number;
  os: string;
  quantity: number;
  agency: string;
  requestDate: string;
  boardingDate: string;
  notes?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface BaggageHistoryItem {
  collaboratorId: string;
  cia: string;
  quantity: number;
}

export type TabId = "solicitacoes" | "colaboradores" | "eventos";

export interface FormErrors {
  [field: string]: string | undefined;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

/** dd/mm/aa — usado nas opções do combobox de evento. */
export function fmtDateShort(d?: string | null) {
  if (!d) return "";
  const [y, m, day] = String(d).split("T")[0].split("-");
  if (!y || !m || !day) return "";
  return `${day}/${m}/${y.slice(2)}`;
}

export function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function toTitleCase(str: string) {
  if (!str) return str;
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * CPF do colaborador: officialDocument quando documentType === 'cpf',
 * senão secondaryDocument quando secondaryDocumentType === 'cpf'.
 */
export function getCpf(c: CollaboratorItem): string {
  if (c.documentType === "cpf") return c.officialDocument || "";
  if (c.secondaryDocumentType === "cpf") return c.secondaryDocument || "";
  return "";
}

export function formatCpf(cpf: string): string {
  const digits = (cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return cpf || "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export const CIAS_FIXAS = ["Azul", "Gol", "TAM"] as const;
export type CiaGroup = "Azul" | "Gol" | "TAM" | "Outros";

export function ciaGroup(cia: string): CiaGroup {
  const c = (cia || "").trim().toLowerCase();
  if (c === "azul") return "Azul";
  if (c === "gol") return "Gol";
  if (c === "tam" || c === "latam") return "TAM";
  return "Outros";
}

/** Cores do sistema (paleta Tailwind já usada nas outras telas). */
export const CIA_STYLE: Record<CiaGroup, { stub: string; badge: string }> = {
  Azul:   { stub: "bg-sky-600",     badge: "bg-sky-50 text-sky-700" },
  Gol:    { stub: "bg-orange-500",  badge: "bg-orange-50 text-orange-700" },
  TAM:    { stub: "bg-red-600",     badge: "bg-red-50 text-red-700" },
  Outros: { stub: "bg-slate-500",   badge: "bg-slate-100 text-slate-600" },
};

/** A cor sólida de cada CIA, para o marcador da fila. */
export const CIA_COR: Record<CiaGroup, string> = {
  Azul: "#0284C7", Gol: "#F97316", TAM: "#DC2626", Outros: "#64748B",
};

/** Ordem fixa das CIAs — a fila não pode dançar quando um contador muda. */
export const CIA_ORDEM: CiaGroup[] = ["Azul", "Gol", "TAM", "Outros"];

export const AGENCIAS_FIXAS = ["LCA", "Flytour", "Onfly", "Direto no site"] as const;

export const TYPE_LABEL: Record<string, string> = { casa: "Casa", freela: "Freela", local: "Local" };

export function eventPeriod(ev: EventOption) {
  const a = fmtDateShort(ev.startDate);
  const b = fmtDateShort(ev.endDate);
  if (a && b && a !== b) return `${a} – ${b}`;
  return a || b;
}

// ── Formulário ───────────────────────────────────────────────────────────────

export const emptyForm = {
  eventId: "",
  collaboratorId: "",
  loc: "",
  ciaSelect: "Azul" as string,     // Azul | Gol | TAM | Outros
  ciaOther: "",
  valueText: "",
  os: "",
  quantityText: "1",
  agencySelect: "LCA" as string,   // LCA | Flytour | Onfly | Direto no site | Outros
  agencyOther: "",
  requestDate: todayISO(),
  boardingDate: "",
  notes: "",
};

export type FormState = typeof emptyForm;

/**
 * Ordem visual dos obrigatórios — é por ela que o foco vai para o primeiro
 * campo inválido ao submeter.
 */
export const ERROR_FIELD_IDS: [string, string][] = [
  ["eventId", "bg-event"],
  ["collaboratorId", "bg-collab"],
  ["loc", "bg-loc"],
  ["cia", "bg-cia-other"],
  ["value", "bg-value"],
  ["os", "bg-os"],
  ["quantity", "bg-qty"],
  ["agency", "bg-agency-other"],
  ["requestDate", "bg-request-date"],
  ["boardingDate", "bg-boarding-date"],
];

/**
 * Os seis grupos de campos que a faixa de progresso conta.
 *
 * Não são dez: CIA e Agência já vêm escolhidas, e a data da solicitação nasce
 * com hoje. Contar campo que o formulário mesmo preencheu faria a barra abrir
 * em "3 de 10" sem o usuário ter digitado nada.
 */
export function contarObrigatorios(f: FormState): { preenchidos: number; total: number } {
  const grupos = [
    f.eventId,
    f.collaboratorId,
    f.loc.trim(),
    f.valueText.trim(),
    f.os.trim(),
    f.boardingDate,
  ];
  return { preenchidos: grupos.filter(Boolean).length, total: grupos.length };
}
