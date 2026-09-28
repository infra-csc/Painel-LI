/**
 * Sugestão de escala — tipos, constantes e utilitários compartilhados pela
 * página e seus módulos (25/09 — extraídos de pages/scaling-suggestion.tsx).
 */
import type { CopyFromEventResult, PasteFormat, PeriodExpansion, SuggestionGridRow } from "@/components/scaling-validation/scaling-grid-utils";

export interface DraftPayload {
  rows: SuggestionGridRow[];
  periodStart: string;
  periodEnd: string;
  eventObservations: string;
  timestamp: number;
}

export interface Period { start: string; end: string }
export interface PendingPeriod extends Period { pessoasDia: number; dias: number }
export interface PendingPaste { rows: SuggestionGridRow[]; skippedNames: string[]; conflicts: string[]; format: PasteFormat }
/** "Copiar de evento" que vai substituir linhas já preenchidas: mesma confirmação da colagem. */
export interface PendingCopy { result: CopyFromEventResult; sourceName: string; conflicts: string[] }
/** Dias que a planilha traz preenchidos mas estão fora do período atual da grade. */
export interface PendingPasteDates { dates: string[]; expansion: PeriodExpansion }
export interface SentInfo { created: number; eventId: string; eventName: string; byFunction: { name: string; count: number }[] }
/** Um problema apontado pela validação, já separado em função × problema. */
export interface Pendencia { rowId: string; funcao: string; problema: string }

export const DRAFT_TTL_MS = 7 * 24 * 3600_000; // rascunho por evento vale 7 dias
/**
 * Teto de vagas por envio — o MESMO do servidor (POST /bulk recusa acima
 * disto). Guardado aqui só para a tela avisar ANTES do clique, em vez de
 * deixar o usuário montar 600 vagas e descobrir no erro da API.
 */
export const MAX_VAGAS = 500;
/** A partir daqui o contador fica vermelho: está perto do teto. */
export const VAGAS_WARN = 450;
/** Espera antes de anunciar a contagem ao leitor de tela (uma edição por tecla não pode virar um anúncio por tecla). */
export const LIVE_DEBOUNCE_MS = 800;
/** Quantos itens o painel de revisão mostra antes do "Ver mais N". */
export const REVIEW_PREVIEW = 5;
/** Valor sentinela do Select de mapeamento (Radix não aceita SelectItem com value ""). */
export const SKIP_FUNCTION = "__descartar__";
export const SECTION_TITLE = "text-2xs font-bold uppercase tracking-wide text-muted-foreground";
export const HINT = "text-xs text-muted-foreground";
export const PILL = "inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-slate-600 tabular-nums";
export const PILL_BRAND = "inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-semibold text-primary tabular-nums";
export const BANNER_LINK = "inline-flex items-center gap-1 text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
export const BANNER_DANGER_LINK = "inline-flex items-center gap-1 text-danger hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-strong disabled:opacity-60";
export const EMPTY_PERIOD: Period = { start: "", end: "" };
/** Espera antes de reanalisar a colagem (o resumo ao vivo não roda a cada tecla). */
export const PASTE_PREVIEW_DEBOUNCE_MS = 200;
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const nowHHMM = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function writeDraft(key: string, payload: Omit<DraftPayload, "timestamp">, hasContent: boolean) {
  try {
    if (!hasContent) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({ ...payload, timestamp: Date.now() } satisfies DraftPayload));
  } catch { /* quota / storage indisponível */ }
}
