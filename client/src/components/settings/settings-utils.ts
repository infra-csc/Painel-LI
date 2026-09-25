// Extraído de system-settings.tsx em 25/09 (modularização): utilitários puros
// da tela Valores padrão — conversão centavos↔reais, formatação e as chaves do
// histórico local. Vivem separados para que hooks e cartões importem a MESMA
// implementação (o toTitleCase/formatCurrency daqui são os da tela, não os de
// @/lib/format — mantidos para não mudar o que o usuário vê).
import { parseBrNumber } from "@/lib/utils";

// Histórico gravado APENAS no localStorage deste navegador — em ambiente
// multiusuário cada pessoa vê só o que ela mesma salvou nesta máquina.
export const HISTORY_KEY = "system_settings_history";
export const LAST_SAVED_KEY = "system_settings_last_saved";

export interface HistoryEntry {
  timestamp: string;
  user: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export function centavosToReais(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export function formatCurrency(val: string): string {
  const n = parseBrNumber(val);
  return isNaN(n) ? val : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

export function getUserInitials(name: string): string {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

export function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Fallback único "freela zerado → usa o valor casa correspondente".
// Antes esta regra estava duplicada em 3 pontos (reset dos mapas, isFunctionDirty
// e a renderização da tabela por função) e as cópias podiam divergir.
export function freelaOuCasa(freelaCentavos: number | null | undefined, casaCentavos: number | null | undefined): number {
  const f = freelaCentavos ?? 0;
  return f !== 0 ? f : (casaCentavos ?? 0);
}

// Mantém no form o texto como o usuário digita (vírgula E ponto de milhar),
// só barrando caracteres inválidos — quem interpreta é o parseBrNumber.
// (A troca cega vírgula→ponto de antes transformava "1.500,00" em "1.500.00",
// que o parser lia como 1,5.)
export function normalizeDecimal(raw: string): string {
  return raw.replace(/[^\d.,]/g, "");
}
