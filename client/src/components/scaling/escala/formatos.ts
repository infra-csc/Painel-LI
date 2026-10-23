/**
 * Textos da logística da aba Escala (23/10) — sem React, testáveis.
 *
 * Os mesmos formatos de Passagens: "dd/mm" sem passar por fuso, horário
 * "07:30 → 09:55" (partida → chegada), "POA → GRU" (aeroporto; sem ele, a
 * cidade), LOC à parte da OC.
 */
import type { LogisticaDaVagaNaEscala, Movimento, PassagemDaEscala } from "@shared/logistica-da-escala";
import { NOME_DO_MODO_DO_MOVIMENTO, ROTULO_DA_SITUACAO } from "@shared/logistica-da-escala";
import { NOME_DO_MODO, textoDoTrecho, type PernaDaViagem } from "@shared/transporte-terrestre";
import { formatDateHeader } from "@/components/scaling-validation/scaling-grid-utils";

const DIAS_POR_EXTENSO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "09/12" */
export const dm = (iso: string | null | undefined): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

/** "Qua 09/12" */
export const diaCurto = (iso: string): string => {
  const h = formatDateHeader(iso);
  return `${h.dayName} ${h.date}`;
};

/** "Quarta, 09/12" */
export const diaPorExtenso = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DIAS_POR_EXTENSO[new Date(y, m - 1, d).getDay()]}, ${dm(iso)}`;
};

export const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** "07:30 → 09:55", "07:30", "→ 09:55" ou null. */
export function horarioDoTrecho(m: Pick<Movimento, "partida" | "chegada">): string | null {
  if (m.partida && m.chegada) return `${m.partida} → ${m.chegada}`;
  if (m.partida) return m.partida;
  if (m.chegada) return `→ ${m.chegada}`;
  return null;
}

/** "POA → GRU" (ou a cidade, sem aeroporto). */
export function rotaDoTrecho(m: Pick<Movimento, "de" | "para">): string | null {
  if (!m.de && !m.para) return null;
  return `${m.de ?? "?"} → ${m.para ?? "?"}`;
}

/** "Aéreo · LATAM" */
export function modoECompanhia(m: Pick<Movimento, "modo" | "companhia">): string | null {
  const partes = [m.modo ? NOME_DO_MODO_DO_MOVIMENTO[m.modo] : null, m.companhia].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** O horário que identifica o movimento na lista do dia: "09:55", "≈14:00" ou "—". */
export const horaDaLista = (m: Pick<Movimento, "hora" | "fonte">): string =>
  m.hora ? `${m.fonte === "sugestao" ? "≈" : ""}${m.hora}` : "—";

/** LOC e OC da passagem, quando houver. */
export function codigosDaPassagem(t: PassagemDaEscala | null | undefined): { loc: string | null; oc: string | null } {
  const loc = String(t?.locator ?? "").trim() || null;
  const oc = String(t?.purchaseOrderNumber ?? "").trim() || null;
  return { loc, oc };
}

/** "Van · Vans do Sul · R$ 500,00" da perna terrestre registrada. */
export function textoDaPernaTerrestre(l: LogisticaDaVagaNaEscala, perna: PernaDaViagem): string | null {
  const r = l.terrestrePorPerna[perna];
  if (r) return textoDoTrecho(r);
  const indicado = l.indicado[perna];
  if (indicado && l.pernasTerrestres.includes(perna)) return `${NOME_DO_MODO[indicado]} indicado · falta registrar`;
  return null;
}

/** "Emitida", "Comprada"… ou o que falta. */
export function situacaoEmTexto(l: LogisticaDaVagaNaEscala): string | null {
  if (l.situacao) return ROTULO_DA_SITUACAO[l.situacao];
  if (l.passagem === "falta") return "Falta a passagem";
  return null;
}

/** Linha de texto de um movimento — para copiar a lista do dia. */
export function movimentoEmTexto(m: Movimento, nome: string, funcao: string): string {
  return [
    horaDaLista(m),
    nome,
    `(${funcao})`,
    modoECompanhia(m),
    rotaDoTrecho(m),
    m.fonte === "sugestao" ? `sugestão: ${m.textoDaSugestao ?? "sem horário"}` : horarioDoTrecho(m),
    m.segueParaOutroEvento ? "segue para outro evento" : null,
  ].filter(Boolean).join(" · ");
}
