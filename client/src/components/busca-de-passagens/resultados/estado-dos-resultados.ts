/**
 * Estado da tela RESULTADOS da busca (16/10 — dono: "essa busca tem que levar
 * para outra tela"). Tudo na URL, para recarregar ou mandar o link sem perder
 * a busca, e para voltar à lista com o recorte e a seleção de antes:
 *
 *   /busca-de-passagens/resultados
 *     ?vagas=id,id            escalações da busca (até 80)
 *     &aj={…}                 ajustes feitos na tela, por vaga (JSON: datas, 2 conexões, aeroporto, sem horário…)
 *     &idaDe=<vaga anterior>  atalho "Buscar preços do trecho direto"
 *     &remarcar=1             atalho do aviso de alteração (datas NOVAS da escalação)
 *     &rota=<chave>           a rota aberta
 *     &flex=k,k &alt=k,k      datas vizinhas / aeroportos já pedidos (voltam do cache, sem gastar)
 *     &cia=LA,G3 &paradas=0|1 &partida=manha &chegada=… &partidaVolta=… &ordem=preco|duracao|partida
 *     &de=<query da lista>    o recorte da lista, para "Voltar às escalações"
 *     &buscar=1               veio do "Buscar preços": consulta as rotas sem preço UMA vez e sai da URL
 *
 * Os filtros desta tela são LOCAIS: só recortam o que já veio (nunca gastam).
 */
import { MAX_VAGAS_POR_BUSCA, minutoDoDia, pernasDaOpcao, type AjusteDaBusca, type OpcaoAvaliada, type PernaDaRota } from "@shared/busca-de-passagens";

export const CAMINHO_DOS_RESULTADOS = "/busca-de-passagens/resultados";

export type FaixaDoDia = "qualquer" | "madrugada" | "manha" | "tarde" | "noite";
export const FAIXAS_DO_DIA: Array<{ id: Exclude<FaixaDoDia, "qualquer">; rotulo: string; de: number; ate: number; texto: string }> = [
  { id: "madrugada", rotulo: "Madrugada", de: 0, ate: 6 * 60, texto: "0h–6h" },
  { id: "manha", rotulo: "Manhã", de: 6 * 60, ate: 12 * 60, texto: "6h–12h" },
  { id: "tarde", rotulo: "Tarde", de: 12 * 60, ate: 18 * 60, texto: "12h–18h" },
  { id: "noite", rotulo: "Noite", de: 18 * 60, ate: 24 * 60, texto: "18h–24h" },
];

export type OrdemDasOpcoes = "custo" | "preco" | "duracao" | "partida";
export const ORDENS: Array<{ id: OrdemDasOpcoes; rotulo: string }> = [
  { id: "custo", rotulo: "Menor custo total" },
  { id: "preco", rotulo: "Menor preço" },
  { id: "duracao", rotulo: "Mais rápido" },
  { id: "partida", rotulo: "Partida mais cedo" },
];

export const CIAS_DOS_FILTROS = [
  { id: "LA", nome: "LATAM" },
  { id: "G3", nome: "GOL" },
  { id: "AD", nome: "Azul" },
] as const;

export interface FiltrosDasOpcoes {
  /** Companhias marcadas; vazio = todas. */
  cias: string[];
  /** "todas" | 0 = só direto | 1 = até 1 conexão. */
  paradas: "todas" | "0" | "1";
  partida: FaixaDoDia;
  chegada: FaixaDoDia;
  partidaVolta: FaixaDoDia;
  ordem: OrdemDasOpcoes;
}

export const FILTROS_DAS_OPCOES_PADRAO: FiltrosDasOpcoes = { cias: [], paradas: "todas", partida: "qualquer", chegada: "qualquer", partidaVolta: "qualquer", ordem: "custo" };

/** Quantos filtros (não a ordem) estão ligados. */
export const filtrosLigados = (f: FiltrosDasOpcoes) =>
  (f.cias.length ? 1 : 0) + (f.paradas !== "todas" ? 1 : 0) + (f.partida !== "qualquer" ? 1 : 0) + (f.chegada !== "qualquer" ? 1 : 0) + (f.partidaVolta !== "qualquer" ? 1 : 0);

export interface EstadoDosResultados {
  vagas: string[];
  ajustes: Record<string, AjusteDaBusca>;
  idaDe: string | null;
  remarcar: boolean;
  rota: string | null;
  flex: string[];
  alternativas: string[];
  filtros: FiltrosDasOpcoes;
  /** Query da lista (sem "?"). */
  lista: string;
  buscar: boolean;
}

const FAIXAS: FaixaDoDia[] = ["qualquer", "madrugada", "manha", "tarde", "noite"];
const um = <T extends string>(v: string | null, validos: readonly T[], padrao: T): T => (v && (validos as readonly string[]).includes(v) ? (v as T) : padrao);
const IATA = /^[A-Z]{3}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Só o que é um ajuste válido passa (a URL é texto de fora). */
function limparAjuste(v: unknown): AjusteDaBusca | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: AjusteDaBusca = {};
  if (typeof o.aeroportoDeCasa === "string" && IATA.test(o.aeroportoDeCasa)) out.aeroportoDeCasa = o.aeroportoDeCasa;
  if (typeof o.aeroportoDoEvento === "string" && IATA.test(o.aeroportoDoEvento)) out.aeroportoDoEvento = o.aeroportoDoEvento;
  if (typeof o.dataIda === "string" && DATA.test(o.dataIda)) out.dataIda = o.dataIda;
  if (typeof o.dataVolta === "string" && DATA.test(o.dataVolta)) out.dataVolta = o.dataVolta;
  if (o.maxParadas === 1 || o.maxParadas === 2) out.maxParadas = o.maxParadas;
  if (typeof o.idaDoEventoId === "string" && o.idaDoEventoId.length <= 64) out.idaDoEventoId = o.idaDoEventoId;
  if (o.somente === "ida" || o.somente === "volta") out.somente = o.somente;
  if (o.semHorario === true) out.semHorario = true;
  return Object.keys(out).length ? out : null;
}

export function lerAjustes(texto: string | null): Record<string, AjusteDaBusca> {
  if (!texto) return {};
  try {
    const bruto = JSON.parse(texto) as unknown;
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
    const out: Record<string, AjusteDaBusca> = {};
    for (const [id, v] of Object.entries(bruto as Record<string, unknown>).slice(0, MAX_VAGAS_POR_BUSCA)) {
      const a = limparAjuste(v);
      if (a && id.length <= 64) out[id] = a;
    }
    return out;
  } catch {
    return {};
  }
}

/** Ajustes só das vagas pedidas e sem campos vazios (a URL fica curta). */
export function escreverAjustes(ajustes: Record<string, AjusteDaBusca | undefined>, vagas: readonly string[]): string {
  const out: Record<string, AjusteDaBusca> = {};
  for (const id of vagas) {
    const a = limparAjuste(ajustes[id]);
    if (a) out[id] = a;
  }
  return Object.keys(out).length ? JSON.stringify(out) : "";
}

export function lerResultados(search: string): EstadoDosResultados {
  const p = new URLSearchParams(search);
  const lista = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    vagas: Array.from(new Set(lista("vagas"))).slice(0, MAX_VAGAS_POR_BUSCA),
    ajustes: lerAjustes(p.get("aj")),
    idaDe: p.get("idaDe") || null,
    remarcar: p.get("remarcar") === "1",
    rota: p.get("rota") || null,
    flex: lista("flex").slice(0, 40),
    alternativas: lista("alt").slice(0, 40),
    filtros: {
      cias: lista("cia").filter((c) => CIAS_DOS_FILTROS.some((x) => x.id === c)),
      paradas: um(p.get("paradas"), ["todas", "0", "1"] as const, "todas"),
      partida: um(p.get("partida"), FAIXAS, "qualquer"),
      chegada: um(p.get("chegada"), FAIXAS, "qualquer"),
      partidaVolta: um(p.get("partidaVolta"), FAIXAS, "qualquer"),
      ordem: um(p.get("ordem"), ORDENS.map((o) => o.id), "custo"),
    },
    lista: p.get("de") ?? "",
    buscar: p.get("buscar") === "1",
  };
}

/** A query da tela (sem "?"); `buscar` nunca volta para a URL depois de lido. */
export function escreverResultados(e: Omit<EstadoDosResultados, "buscar"> & { buscar?: boolean }): string {
  const p = new URLSearchParams();
  p.set("vagas", e.vagas.join(","));
  const aj = escreverAjustes(e.ajustes, e.vagas);
  if (aj) p.set("aj", aj);
  if (e.idaDe) p.set("idaDe", e.idaDe);
  if (e.remarcar) p.set("remarcar", "1");
  if (e.rota) p.set("rota", e.rota);
  if (e.flex.length) p.set("flex", e.flex.join(","));
  if (e.alternativas.length) p.set("alt", e.alternativas.join(","));
  const f = e.filtros;
  if (f.cias.length) p.set("cia", f.cias.join(","));
  if (f.paradas !== "todas") p.set("paradas", f.paradas);
  if (f.partida !== "qualquer") p.set("partida", f.partida);
  if (f.chegada !== "qualquer") p.set("chegada", f.chegada);
  if (f.partidaVolta !== "qualquer") p.set("partidaVolta", f.partidaVolta);
  if (f.ordem !== "custo") p.set("ordem", f.ordem);
  if (e.lista) p.set("de", e.lista);
  if (e.buscar) p.set("buscar", "1");
  return p.toString();
}

/** Link da tela de resultados a partir da lista (ou de um atalho). */
export function linkDosResultados(o: { vagas: readonly string[]; ajustes?: Record<string, AjusteDaBusca | undefined>; lista?: string; buscar?: boolean; idaDe?: string | null; remarcar?: boolean }): string {
  return `${CAMINHO_DOS_RESULTADOS}?${escreverResultados({
    vagas: Array.from(o.vagas), ajustes: (o.ajustes ?? {}) as Record<string, AjusteDaBusca>, idaDe: o.idaDe ?? null, remarcar: !!o.remarcar, rota: null,
    flex: [], alternativas: [], filtros: FILTROS_DAS_OPCOES_PADRAO, lista: o.lista ?? "", buscar: o.buscar,
  })}`;
}

/** Volta à lista: o recorte de antes + a seleção e os ajustes (a lista os lê como atalho e tira da URL). */
export function linkDaLista(lista: string, vagas: readonly string[], ajustes: Record<string, AjusteDaBusca | undefined>): string {
  const p = new URLSearchParams(lista);
  p.delete("vagas"); p.delete("aj"); p.delete("idaDe"); p.delete("remarcar");
  if (vagas.length) p.set("vagas", vagas.join(","));
  const aj = escreverAjustes(ajustes, vagas);
  if (aj) p.set("aj", aj);
  const qs = p.toString();
  return `/busca-de-passagens${qs ? `?${qs}` : ""}`;
}

// ── Filtros locais sobre as opções que já vieram ───────────────────────────

/** Companhias da opção (JJ é LATAM). */
export function ciasDaOpcao(o: OpcaoAvaliada): string[] {
  const s = new Set<string>();
  for (const p of o.itinerario.pernas) for (const seg of p.segmentos) s.add(seg.companhia === "JJ" ? "LA" : seg.companhia);
  if (s.size === 0) for (const p of o.itinerario.pernas) s.add(p.companhia === "JJ" ? "LA" : p.companhia);
  return Array.from(s);
}

const naFaixa = (iso: string | undefined, f: FaixaDoDia) => {
  if (f === "qualquer") return true;
  const min = iso ? minutoDoDia(iso) : null;
  const faixa = FAIXAS_DO_DIA.find((x) => x.id === f)!;
  return min !== null && min >= faixa.de && min < faixa.ate;
};

/** Passa nos filtros locais? `ignorar` zera um filtro (para contar as opções dele). */
export function passaNasOpcoes(o: OpcaoAvaliada, perna: PernaDaRota, f: FiltrosDasOpcoes, ignorar?: "cias" | "paradas"): boolean {
  if (ignorar !== "cias" && f.cias.length && !ciasDaOpcao(o).every((c) => f.cias.includes(c))) return false;
  if (ignorar !== "paradas" && f.paradas !== "todas" && o.paradas > Number(f.paradas)) return false;
  const { ida, volta } = pernasDaOpcao(o.itinerario, perna);
  if (ida) {
    if (!naFaixa(ida.segmentos[0]?.partida, f.partida)) return false;
    if (!naFaixa(ida.segmentos[ida.segmentos.length - 1]?.chegada, f.chegada)) return false;
  }
  if (volta) {
    // Rota só de volta: a partida dela é a "partida" e a chegada é a "chegada".
    if (!ida) {
      if (!naFaixa(volta.segmentos[0]?.partida, f.partida)) return false;
      if (!naFaixa(volta.segmentos[volta.segmentos.length - 1]?.chegada, f.chegada)) return false;
    } else if (!naFaixa(volta.segmentos[0]?.partida, f.partidaVolta)) return false;
  }
  return true;
}

const partidaDe = (o: OpcaoAvaliada) => o.itinerario.pernas[0]?.segmentos[0]?.partida ?? "9999";

/** Ordem escolhida. "custo" é a ordem da regra (boas → fora do horário → absurdas, por custo total). */
export function ordenarParaTela(opcoes: readonly OpcaoAvaliada[], ordem: OrdemDasOpcoes): OpcaoAvaliada[] {
  if (ordem === "custo") return opcoes.slice();
  const l = opcoes.slice();
  if (ordem === "preco") l.sort((a, b) => a.itinerario.precoCentavos - b.itinerario.precoCentavos || a.custoTotalCentavos - b.custoTotalCentavos);
  if (ordem === "duracao") l.sort((a, b) => (a.duracaoMin ?? 9e9) - (b.duracaoMin ?? 9e9) || a.custoTotalCentavos - b.custoTotalCentavos);
  if (ordem === "partida") l.sort((a, b) => partidaDe(a).localeCompare(partidaDe(b)) || a.custoTotalCentavos - b.custoTotalCentavos);
  return l;
}
