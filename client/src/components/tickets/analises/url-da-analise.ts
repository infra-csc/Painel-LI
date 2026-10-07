/**
 * A visão da aba Análises na URL (07/10): filtros (período, evento,
 * companhia, transporte) e os alternadores (Ida/Volta, Total/Por pessoa,
 * Rotas/Companhias/Transporte). Recarregar ou compartilhar o link abre a
 * mesma visão.
 *
 * Tudo com prefixo `an_` — a Lista já usa `event`, `transport`, `periodo`,
 * `de`, `ate`… (filters-url.ts) e os dois conjuntos convivem na mesma query
 * sem um sobrescrever o outro. Só vai para a URL o que difere do padrão.
 */
import { diaISO } from "@shared/analise-de-passagens";
import { FILTROS_PADRAO, PRESETS_DO_PERIODO, type FiltrosDaAba, type PresetDoPeriodo } from "./use-analises-de-passagens";

export type TrechoDoDia = "ida" | "volta";
export type OrdemDosEventos = "total" | "pessoa";
export type GrupoDeRotas = "rotas" | "companhias" | "transporte";

export interface VisaoDaAnalise {
  filtros: FiltrosDaAba;
  trecho: TrechoDoDia;
  ordem: OrdemDosEventos;
  grupo: GrupoDeRotas;
}

export const VISAO_PADRAO: VisaoDaAnalise = { filtros: FILTROS_PADRAO, trecho: "ida", ordem: "total", grupo: "rotas" };

const PRESETS = new Set<string>(PRESETS_DO_PERIODO.map((p) => p.id));

export function visaoDaUrl(search: string): VisaoDaAnalise {
  const p = new URLSearchParams(search);
  const preset = p.get("an_periodo");
  const presetValido: PresetDoPeriodo = preset && PRESETS.has(preset) ? (preset as PresetDoPeriodo) : FILTROS_PADRAO.preset;
  const trecho = p.get("an_trecho");
  const ordem = p.get("an_ordem");
  const grupo = p.get("an_grupo");
  return {
    filtros: {
      preset: presetValido,
      de: presetValido === "custom" ? (diaISO(p.get("an_de")) ?? "") : "",
      ate: presetValido === "custom" ? (diaISO(p.get("an_ate")) ?? "") : "",
      eventId: p.get("an_evento") || "all",
      // `an_cia=` (vazio) é "sem companhia" — por isso `has`, não `get || "all"`.
      companhia: p.has("an_cia") ? (p.get("an_cia") ?? "") : "all",
      transporte: p.has("an_transporte") ? (p.get("an_transporte") ?? "") : "all",
    },
    trecho: trecho === "volta" ? "volta" : "ida",
    ordem: ordem === "pessoa" ? "pessoa" : "total",
    grupo: grupo === "companhias" || grupo === "transporte" ? grupo : "rotas",
  };
}

/** Acrescenta a visão (só o que difere do padrão) à query. */
export function visaoNaUrl(p: URLSearchParams, v: VisaoDaAnalise): void {
  const f = v.filtros;
  if (f.preset !== FILTROS_PADRAO.preset) p.set("an_periodo", f.preset);
  if (f.preset === "custom") {
    if (f.de) p.set("an_de", f.de);
    if (f.ate) p.set("an_ate", f.ate);
  }
  if (f.eventId !== "all") p.set("an_evento", f.eventId);
  if (f.companhia !== "all") p.set("an_cia", f.companhia);
  if (f.transporte !== "all") p.set("an_transporte", f.transporte);
  if (v.trecho !== "ida") p.set("an_trecho", v.trecho);
  if (v.ordem !== "total") p.set("an_ordem", v.ordem);
  if (v.grupo !== "rotas") p.set("an_grupo", v.grupo);
}

/** Igualdade de duas visões (para a re-sincronia com a URL não entrar em laço). */
export function mesmaVisao(a: VisaoDaAnalise, b: VisaoDaAnalise): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
