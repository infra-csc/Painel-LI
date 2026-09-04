import type { TravelDraft } from "./travel-fields";
import { ymd } from "./types";

/** Avisos (não erros) de ida/volta × dias de trabalho. Vazio = tudo coerente. */
export function avisosDeViagem(v: Pick<TravelDraft, "flightDepartureDate" | "flightReturnDate">, workDays?: string[]): string[] {
  const dias = (workDays ?? []).map(ymd).filter(Boolean).sort();
  if (dias.length === 0) return [];
  const primeiro = dias[0], ultimo = dias[dias.length - 1];
  const ddmm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  const out: string[] = [];
  const ida = ymd(v.flightDepartureDate), volta = ymd(v.flightReturnDate);
  if (ida) {
    if (ida > primeiro) out.push(`Ida em ${ddmm(ida)}, depois do primeiro dia de trabalho (${ddmm(primeiro)}).`);
    else if (!dias.includes(ida)) out.push(`Ida em ${ddmm(ida)} — não há diária nesse dia (trabalho começa ${ddmm(primeiro)}).`);
  }
  if (volta) {
    if (volta < ultimo) out.push(`Volta em ${ddmm(volta)}, antes do último dia de trabalho (${ddmm(ultimo)}).`);
    else if (!dias.includes(volta)) out.push(`Volta em ${ddmm(volta)} — não há diária nesse dia (trabalho termina ${ddmm(ultimo)}).`);
  }
  return out;
}
