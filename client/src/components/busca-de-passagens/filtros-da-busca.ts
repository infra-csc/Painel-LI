/**
 * Filtros e abas da tela Busca de passagens (09/10) — na URL, como as outras
 * telas: recarregar ou mandar o link abre o mesmo recorte.
 *
 *   ?aba=buscar|previsao|melhor-momento|preco-por-rota|pago-x-encontrado|orcamento|consumo
 *   &periodo=90|180|365|tudo  (abas de análise; padrão 180 — sai da URL)
 *   &situacao=pendentes|compradas|todas   (padrão: pendentes — sai da URL)
 *   &passados=1  (15/10: inclui eventos que já terminaram; padrão = só eventos de hoje em diante)
 *   &q= &evento= &funcoes=a,b &saida= &destino= &trecho= &falta= &de= &ate=
 *   &vagas=id,id  (seleção: volta da tela de resultados ou atalho antigo; consumido na abertura)
 *   &aj={…}  (ajustes da seleção, como na tela de resultados; consumido na abertura)
 *   &idaDe= / &remarcar=1  (atalhos antigos: hoje levam direto à tela de resultados)
 *   &acompanhando=1  (atalho do sino: abre a lista de preços acompanhados)
 */
import type { AjusteDaBusca } from "@shared/busca-de-passagens";
import { lerAjustes } from "./resultados/estado-dos-resultados";

export type AbaDaBusca = "buscar" | "previsao" | "melhor-momento" | "preco-por-rota" | "pago-x-encontrado" | "orcamento" | "consumo";
export const ABAS_DA_BUSCA: AbaDaBusca[] = ["buscar", "previsao", "melhor-momento", "preco-por-rota", "pago-x-encontrado", "orcamento", "consumo"];

/** Período das abas de análise (dias para trás, ou tudo). */
export type PeriodoDaAnalise = "90" | "180" | "365" | "tudo";
export const PERIODOS_DA_ANALISE: PeriodoDaAnalise[] = ["90", "180", "365", "tudo"];

export type Situacao = "pendentes" | "compradas" | "todas";
export type FiltroDeTrecho = "todos" | "ida_e_volta" | "so_ida" | "so_volta" | "direto";
export type FiltroDeFalta = "todas" | "prontas" | "com_falta" | "sem_data" | "sem_cidade" | "sem_aeroporto";

export interface FiltrosDaBusca {
  situacao: Situacao;
  q: string;
  evento: string;
  funcoes: string[];
  saida: string;
  destino: string;
  trecho: FiltroDeTrecho;
  falta: FiltroDeFalta;
  /** Período (AAAA-MM-DD, inclusive): vale a IDA ou a VOLTA da vaga (28/10). */
  de: string;
  ate: string;
  /**
   * Incluir eventos que já terminaram (15/10, dono: "de primeira só os eventos
   * que a data ainda não passou"). Desligado = só evento cujo FIM é hoje ou
   * depois (fuso de São Paulo) — e o servidor já manda só esses.
   */
  passados: boolean;
}

export const FILTROS_PADRAO: FiltrosDaBusca = {
  situacao: "pendentes", q: "", evento: "all", funcoes: [], saida: "all", destino: "all", trecho: "todos", falta: "todas", de: "", ate: "", passados: false,
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const um = <T extends string>(v: string | null, validos: readonly T[], padrao: T): T => (v && (validos as readonly string[]).includes(v) ? (v as T) : padrao);

export interface EstadoDaUrl {
  aba: AbaDaBusca;
  filtros: FiltrosDaBusca;
  vagas: string[];
  /** Ajustes da seleção (`aj`), de volta da tela de resultados. */
  ajustes: Record<string, AjusteDaBusca>;
  idaDe: string | null;
  periodo: PeriodoDaAnalise;
  remarcar: boolean;
  acompanhando: boolean;
}

export function lerUrl(search: string): EstadoDaUrl {
  const p = new URLSearchParams(search);
  const lista = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    aba: um(p.get("aba"), ABAS_DA_BUSCA, "buscar"),
    filtros: {
      situacao: um(p.get("situacao"), ["pendentes", "compradas", "todas"] as const, "pendentes"),
      q: p.get("q") ?? "",
      evento: p.get("evento") || "all",
      funcoes: lista("funcoes"),
      saida: p.get("saida") || "all",
      destino: p.get("destino") || "all",
      trecho: um(p.get("trecho"), ["todos", "ida_e_volta", "so_ida", "so_volta", "direto"] as const, "todos"),
      falta: um(p.get("falta"), ["todas", "prontas", "com_falta", "sem_data", "sem_cidade", "sem_aeroporto"] as const, "todas"),
      de: DATA.test(p.get("de") ?? "") ? p.get("de")! : "",
      ate: DATA.test(p.get("ate") ?? "") ? p.get("ate")! : "",
      passados: p.get("passados") === "1",
    },
    vagas: lista("vagas").slice(0, 80),
    ajustes: lerAjustes(p.get("aj")),
    idaDe: p.get("idaDe") || null,
    periodo: um(p.get("periodo"), PERIODOS_DA_ANALISE, "180"),
    remarcar: p.get("remarcar") === "1",
    acompanhando: p.get("acompanhando") === "1",
  };
}

/** Só o que foge do padrão vai para a URL (o atalho `vagas` não volta). */
export function escreverUrl(aba: AbaDaBusca, f: FiltrosDaBusca, periodo: PeriodoDaAnalise = "180"): string {
  const p = new URLSearchParams();
  if (aba !== "buscar") p.set("aba", aba);
  if (aba !== "buscar" && aba !== "consumo" && periodo !== "180") p.set("periodo", periodo);
  if (f.situacao !== "pendentes") p.set("situacao", f.situacao);
  if (f.q.trim()) p.set("q", f.q);
  if (f.evento !== "all") p.set("evento", f.evento);
  if (f.funcoes.length) p.set("funcoes", f.funcoes.join(","));
  if (f.saida !== "all") p.set("saida", f.saida);
  if (f.destino !== "all") p.set("destino", f.destino);
  if (f.trecho !== "todos") p.set("trecho", f.trecho);
  if (f.falta !== "todas") p.set("falta", f.falta);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  if (f.passados) p.set("passados", "1");
  return p.toString();
}
