/**
 * Formatação de texto/nomes/documentos — fonte única.
 *
 * Substitui as cópias locais de toTitleCase/initials/formatCpf/avatarClasses
 * espalhadas pelas telas (collaborator-management, admin-users, functions,
 * baggage-control, invoices, rh-control...). Migre importando daqui.
 */

// Preposições/artigos que ficam minúsculos no meio de nomes em pt-BR.
const LOWER_WORDS = new Set([
  "de", "da", "das", "do", "dos", "e", "em", "a", "o", "as", "os", "ao", "aos", "à", "às", "na", "no", "nas", "nos",
]);

/**
 * "MARIA DA SILVA E SOUZA" → "Maria da Silva e Souza".
 * Primeira palavra sempre capitalizada; "de/da/do/e..." ficam minúsculas
 * nas demais posições. Preserva hífens ("Ana-Clara") e múltiplos espaços não.
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return str ?? "";
  const s = String(str).trim();
  if (!s || s === "—" || s === "-") return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      return word
        .split("-")
        .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join("-");
    })
    .join(" ");
}

/** "Maria da Silva" → "MS"; "Ana" → "AN"; "" → "". */
export function initials(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "12345678901" → "123.456.789-01". Se não tiver 11 dígitos, devolve como veio. */
export function formatCpf(cpf: string | null | undefined): string {
  const digits = String(cpf ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return cpf ?? "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Formata o documento conforme o tipo: só CPF ganha máscara; os demais passam direto. */
export function formatDocument(doc: string | null | undefined, type: string | null | undefined): string {
  if (!doc) return "";
  if ((type ?? "").toLowerCase() === "cpf") return formatCpf(doc);
  return doc;
}

// ─── Avatar ────────────────────────────────────────────────────────────────
export const AVATAR_COLORS: readonly (readonly [string, string])[] = [
  ["bg-blue-100", "text-blue-700"],
  ["bg-violet-100", "text-violet-700"],
  ["bg-emerald-100", "text-emerald-700"],
  ["bg-orange-100", "text-orange-700"],
  ["bg-pink-100", "text-pink-700"],
  ["bg-cyan-100", "text-cyan-700"],
  ["bg-amber-100", "text-amber-700"],
  ["bg-rose-100", "text-rose-700"],
  ["bg-purple-100", "text-purple-700"],
  ["bg-teal-100", "text-teal-700"],
];

/**
 * Par [bg, text] de classes Tailwind determinístico por nome (ou id) —
 * o mesmo nome sempre ganha a mesma cor.
 */
export function avatarClasses(name: string | null | undefined): readonly [string, string] {
  const s = String(name ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
