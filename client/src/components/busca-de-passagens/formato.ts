// Formatos curtos da tela Busca de passagens (09/10). Sem `new Date("AAAA-MM-DD")`
// para datas de calendário: lido como UTC, volta um dia em Brasília.
import { NOME_DA_CIA } from "@shared/busca-de-passagens";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-11-12" → "12/11". */
export const ddmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

/** "2026-11-12" → "qui 12/11". */
export function diaCurto(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${ddmm(iso)}`;
}

/** "AAAA-MM-DDTHH:MM" → "08:15". */
export const hhmm = (iso: string | null | undefined) => (iso ? iso.slice(11, 16) : "");

/** "há 12 min", "há 2 h", "agora há pouco". */
export function haQuanto(iso: string, agora: number = Date.now()): string {
  const min = Math.max(0, Math.round((agora - Date.parse(iso)) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `há ${h} h ${r} min` : `há ${h} h`;
}

/** Nome da companhia pelo código (LA → LATAM). */
export const nomeDaCia = (codigo: string) => NOME_DA_CIA[codigo] ?? codigo;

/** Cor da marca de cada companhia — só no selo do código (o resto é token). */
export const CLASSE_DA_CIA: Record<string, string> = {
  LA: "bg-[#1b0088] text-white",
  JJ: "bg-[#1b0088] text-white",
  G3: "bg-[#ff6b00] text-white",
  AD: "bg-[#0a3d91] text-white",
};

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
