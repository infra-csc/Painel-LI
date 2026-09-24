/**
 * Estado de tela na query string (23/09, code review — Fase 3).
 *
 * Por quê: busca, filtros, aba e página viviam em `useState` e sumiam ao
 * trocar de tela e voltar; cada tela que precisava de deep-link escrevia a sua
 * própria (de)serialização (`tickets/filters-url.ts`, `use-scaling-event.ts`).
 * Este hook generaliza aquele padrão: um esquema declara os campos e seus
 * padrões, e o hook lê/escreve só o que difere do padrão — a URL fica limpa e
 * copiável, e `replace` evita um item de histórico a cada tecla digitada.
 *
 * Uso:
 *   const [f, setF] = useUrlState({
 *     q: campo.texto(""),
 *     status: campo.texto("all"),
 *     pagina: campo.numero(1),
 *     somenteAtivos: campo.booleano(false),
 *     funcoes: campo.lista([]),
 *   });
 *   setF({ q: "ana" });           // mescla (patch)
 *   setF(prev => ({ ...prev, pagina: prev.pagina + 1 }));
 *
 * As funções puras `lerDaUrl`/`escreverNaUrl` são exportadas para teste e para
 * quem só precisa montar um link (`href`) com o mesmo esquema.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";

export type TipoDeCampo = "texto" | "numero" | "booleano" | "lista";

export interface CampoDaUrl<T> {
  tipo: TipoDeCampo;
  /** Valor quando o parâmetro não está na URL; também é o que NÃO se escreve. */
  padrao: T;
  /** Nome do parâmetro na URL, quando diferente da chave do esquema. */
  parametro?: string;
}

export type EsquemaDaUrl<S> = { [K in keyof S]: CampoDaUrl<S[K]> };

/** Açúcar para declarar o esquema sem repetir `tipo`/`padrao`. */
export const campo = {
  /** Texto livre (busca, id). Para um conjunto fechado de valores, use `opcao`. */
  texto: (padrao: string, parametro?: string): CampoDaUrl<string> => ({ tipo: "texto", padrao, parametro }),
  /** Texto de um conjunto fechado (aba, visão, status) — mantém o tipo união. */
  opcao: <T extends string>(padrao: T, parametro?: string): CampoDaUrl<T> => ({ tipo: "texto", padrao, parametro }),
  numero: (padrao: number, parametro?: string): CampoDaUrl<number> => ({ tipo: "numero", padrao, parametro }),
  booleano: (padrao: boolean, parametro?: string): CampoDaUrl<boolean> => ({ tipo: "booleano", padrao, parametro }),
  lista: (padrao: string[], parametro?: string): CampoDaUrl<string[]> => ({ tipo: "lista", padrao, parametro }),
};

function nomeDoParametro<S>(esquema: EsquemaDaUrl<S>, chave: keyof S): string {
  return esquema[chave].parametro ?? String(chave);
}

function lerCampo(tipo: TipoDeCampo, bruto: string | null, padrao: unknown): unknown {
  if (bruto === null) return padrao;
  switch (tipo) {
    case "texto":
      return bruto;
    case "numero": {
      const n = Number(bruto);
      return Number.isFinite(n) ? n : padrao;
    }
    case "booleano":
      return bruto === "1" || bruto === "true";
    case "lista":
      return bruto.split(",").filter(Boolean);
  }
}

function iguais(tipo: TipoDeCampo, a: unknown, b: unknown): boolean {
  if (tipo === "lista") {
    const la = a as string[], lb = b as string[];
    return la.length === lb.length && la.every((v, i) => v === lb[i]);
  }
  return a === b;
}

function escreverCampo(tipo: TipoDeCampo, valor: unknown): string {
  switch (tipo) {
    case "texto": return String(valor);
    case "numero": return String(valor);
    case "booleano": return valor ? "1" : "0";
    case "lista": return (valor as string[]).join(",");
  }
}

/** Lê o estado a partir de uma query string (`?a=1&b=x` ou `a=1&b=x`). */
export function lerDaUrl<S>(esquema: EsquemaDaUrl<S>, busca: string): S {
  const p = new URLSearchParams(busca);
  const out = {} as S;
  for (const chave of Object.keys(esquema) as (keyof S)[]) {
    const c = esquema[chave];
    out[chave] = lerCampo(c.tipo, p.get(nomeDoParametro(esquema, chave)), c.padrao) as S[keyof S];
  }
  return out;
}

/**
 * Escreve o estado na query string, preservando parâmetros que o esquema não
 * conhece (ex.: `?event=` do evento em foco) e omitindo campos no padrão.
 * Devolve a string SEM o `?` inicial (vazia quando não há nada a escrever).
 */
export function escreverNaUrl<S>(esquema: EsquemaDaUrl<S>, valor: S, buscaAtual = ""): string {
  const p = new URLSearchParams(buscaAtual);
  for (const chave of Object.keys(esquema) as (keyof S)[]) {
    const c = esquema[chave];
    const nome = nomeDoParametro(esquema, chave);
    const v = valor[chave];
    if (v === undefined || v === null || iguais(c.tipo, v, c.padrao)) p.delete(nome);
    else p.set(nome, escreverCampo(c.tipo, v));
  }
  return p.toString();
}

/** Monta um `href` para a mesma tela com o recorte dado (deep-link). */
export function hrefComEstado<S>(caminho: string, esquema: EsquemaDaUrl<S>, valor: S, buscaAtual = ""): string {
  const qs = escreverNaUrl(esquema, valor, buscaAtual);
  return qs ? `${caminho}?${qs}` : caminho;
}

export type AtualizarEstadoDaUrl<S> = (patch: Partial<S> | ((anterior: S) => S)) => void;

export interface OpcoesDoUrlState {
  /** `replace` (padrão) não cria histórico a cada tecla; `false` empilha. */
  replace?: boolean;
}

export function useUrlState<S>(esquema: EsquemaDaUrl<S>, opcoes?: OpcoesDoUrlState): [S, AtualizarEstadoDaUrl<S>] {
  const busca = useSearch();
  const [caminho, navegar] = useLocation();
  const replace = opcoes?.replace ?? true;

  // O esquema costuma ser um literal inline — mantemos a primeira instância
  // para que `useMemo`/`useCallback` não recalculem a cada render.
  const esquemaRef = useRef(esquema);

  const estado = useMemo(() => lerDaUrl(esquemaRef.current, busca), [busca]);

  // Duas chamadas no mesmo tick (ex.: `setF({q})` e `setF({pagina:1})`) leriam
  // a mesma `busca` antiga e a segunda apagaria a primeira. A ref guarda a
  // query string que acabamos de pedir e é a base da próxima escrita.
  const buscaRef = useRef(busca);
  useEffect(() => { buscaRef.current = busca; }, [busca]);

  const atualizar = useCallback<AtualizarEstadoDaUrl<S>>((patch) => {
    const anterior = lerDaUrl(esquemaRef.current, buscaRef.current);
    const proximo = typeof patch === "function" ? patch(anterior) : { ...anterior, ...patch };
    const qs = escreverNaUrl(esquemaRef.current, proximo, buscaRef.current);
    if (qs === buscaRef.current.replace(/^\?/, "")) return;
    buscaRef.current = qs;
    navegar(qs ? `${caminho}?${qs}` : caminho, { replace });
  }, [caminho, navegar, replace]);

  return [estado, atualizar];
}

export default useUrlState;
