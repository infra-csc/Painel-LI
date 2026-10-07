// Formatação da aba Análises de passagens.
import { formatarMoeda } from "@/lib/format";

/**
 * Centavos → "R$ 1.234" (reais inteiros). Nas análises os centavos são ruído:
 * "R$ 184.320,47" lê pior que "R$ 184.320" e não muda decisão nenhuma.
 */
export function moeda(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined || !Number.isFinite(centavos)) return "—";
  return formatarMoeda(Math.round(centavos / 100) * 100).replace(/,00$/, "");
}

/** "1 passagem" / "3 passagens". */
export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

/** "2026-10-12" → "12/10/26". */
export function dataCurta(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : "sem data";
}

/** Largura da barra em %, com piso visível para valor > 0. */
export function largura(valor: number | null | undefined, maior: number): number {
  if (!valor || valor <= 0 || maior <= 0) return 0;
  return Math.max(2, Math.round((valor / maior) * 1000) / 10);
}
