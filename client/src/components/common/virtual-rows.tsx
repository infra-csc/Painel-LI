/**
 * Virtualização de linhas e cartões (23/09) — envoltório do `useVirtualizer`.
 *
 * A tabela de inclusões renderizava ~4.500 `<tr>` × 11 colunas de uma vez
 * (~270 mil nós de DOM); o Planejado, todos os cards e linhas da planilha.
 * Aqui só o que está no viewport (mais `overscan` linhas) vai para o DOM.
 *
 * Duas formas:
 *  - `useLinhasVirtuais`: para `<tbody>` — devolve as linhas visíveis e dois
 *    espaçadores (antes/depois) para o `<table>` manter a altura real.
 *  - `useCardsVirtuais`: para grades de cartões — agrupa em fileiras de N
 *    colunas e posiciona cada fileira por `translateY`.
 *
 * Regras:
 *  - Abaixo de `LIMIAR_VIRTUALIZACAO` itens NÃO virtualiza (telas pequenas não
 *    pagam o overhead e a semântica fica a mesma).
 *  - Altura medida de verdade (`measureElement`): as linhas têm alturas
 *    diferentes (nomes que quebram, badges). O elemento precisa do
 *    `data-index` — use o `ref`/`data-index` devolvidos em cada linha.
 *  - O contêiner que rola é o `scrollRef` (div com `overflow-auto` e altura
 *    máxima). Cabeçalho da tabela fica `sticky top-0` dentro dele.
 */
import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";

export const LIMIAR_VIRTUALIZACAO = 60;

export interface OpcoesVirtuais {
  /** Div que rola (`overflow-auto`). */
  scrollRef: RefObject<HTMLElement | null>;
  /** Altura estimada de UMA linha/fileira em px (é só o chute inicial; a real é medida). */
  alturaEstimada: number;
  /** Linhas extras acima/abaixo do viewport. Padrão 12. */
  overscan?: number;
  /** Força ligar/desligar. Padrão: liga quando `itens.length >= LIMIAR_VIRTUALIZACAO`. */
  ativo?: boolean;
}

export interface LinhaVirtual<T> {
  item: T;
  index: number;
  /** Passe em `ref` do `<tr>` para a altura real ser medida. */
  medir: (el: Element | null) => void;
}

export interface LinhasVirtuais<T> {
  ativo: boolean;
  linhas: LinhaVirtual<T>[];
  /** Altura (px) que as linhas fora da tela ocupariam antes/depois das renderizadas. */
  espacoAntes: number;
  espacoDepois: number;
  /** Rola até um índice (ex.: destacar uma linha vinda da URL). */
  rolarPara: (index: number) => void;
}

// `measureElement` do TanStack lê `data-index` do elemento. Este `ref` garante
// que o atributo exista mesmo se a linha não o repassar.
function medidorCom(virtualizer: Virtualizer<HTMLElement, Element> | Virtualizer<Window, Element>, index: number) {
  return (el: Element | null) => {
    if (!el) return;
    if (el.getAttribute("data-index") !== String(index)) el.setAttribute("data-index", String(index));
    virtualizer.measureElement(el);
  };
}

const semMedicao = () => {};

/**
 * Linhas virtuais para `<tbody>`. Uso:
 *
 *   const v = useLinhasVirtuais(itens, { scrollRef, alturaEstimada: 56 });
 *   <tbody aria-rowcount={itens.length}>
 *     <EspacadorLinha altura={v.espacoAntes} colunas={11} />
 *     {v.linhas.map(l => <Linha key={l.item.id} ref={l.medir} data-index={l.index} … />)}
 *     <EspacadorLinha altura={v.espacoDepois} colunas={11} />
 *   </tbody>
 */
export function useLinhasVirtuais<T>(itens: readonly T[], opcoes: OpcoesVirtuais): LinhasVirtuais<T> {
  const { scrollRef, alturaEstimada, overscan = 12 } = opcoes;
  const ativo = opcoes.ativo ?? itens.length >= LIMIAR_VIRTUALIZACAO;

  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count: ativo ? itens.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => alturaEstimada,
    overscan,
  });

  return montarLinhas(itens, ativo, virtualizer, 0);
}

export interface OpcoesVirtuaisNaJanela {
  /** Elemento da tabela: a distância dele ao topo do documento é a margem de rolagem. */
  tabelaRef: RefObject<HTMLElement | null>;
  alturaEstimada: number;
  overscan?: number;
  ativo?: boolean;
}

/**
 * Linhas virtuais que rolam pela JANELA, não por um contêiner próprio (28/09).
 *
 * Para listas que são o corpo da página (Passagens): uma caixa de altura fixa
 * dentro da página rola por dentro, a página rola por fora e sobra um vazio
 * embaixo. Aqui a tabela tem altura natural e a página rola como sempre; só o
 * que está à vista vai para o DOM.
 */
export function useLinhasVirtuaisNaJanela<T>(itens: readonly T[], opcoes: OpcoesVirtuaisNaJanela): LinhasVirtuais<T> {
  const { tabelaRef, alturaEstimada, overscan = 12 } = opcoes;
  const ativo = opcoes.ativo ?? itens.length >= LIMIAR_VIRTUALIZACAO;

  // Onde a tabela começa no documento. Medida de novo quando a lista muda
  // (KPIs e filtros acima podem mudar de altura) e ao redimensionar.
  const [margem, setMargem] = useState(0);
  useLayoutEffect(() => {
    if (!ativo) return;
    const medir = () => {
      const el = tabelaRef.current;
      if (el) setMargem(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [ativo, tabelaRef, itens.length]);

  const virtualizer = useWindowVirtualizer({
    count: ativo ? itens.length : 0,
    estimateSize: () => alturaEstimada,
    overscan,
    scrollMargin: margem,
  });

  return montarLinhas(itens, ativo, virtualizer, margem);
}

/** `start`/`end` dos itens incluem a margem de rolagem; os espaçadores não. */
function montarLinhas<T>(
  itens: readonly T[],
  ativo: boolean,
  virtualizer: Virtualizer<HTMLElement, Element> | Virtualizer<Window, Element>,
  margem: number,
): LinhasVirtuais<T> {
  const rolarPara = (index: number) => {
    if (!ativo) return;
    virtualizer.scrollToIndex(index, { align: "center" });
  };

  if (!ativo) {
    return {
      ativo,
      linhas: itens.map((item, index) => ({ item, index, medir: semMedicao })),
      espacoAntes: 0,
      espacoDepois: 0,
      rolarPara,
    };
  }

  const virtuais = virtualizer.getVirtualItems();
  const total = virtualizer.getTotalSize();
  const espacoAntes = virtuais.length > 0 ? Math.max(0, virtuais[0].start - margem) : 0;
  const espacoDepois = virtuais.length > 0 ? Math.max(0, total - (virtuais[virtuais.length - 1].end - margem)) : 0;

  return {
    ativo,
    linhas: virtuais.map(v => ({ item: itens[v.index], index: v.index, medir: medidorCom(virtualizer, v.index) })),
    espacoAntes,
    espacoDepois,
    rolarPara,
  };
}

/** Linha vazia que guarda a altura das linhas fora da tela (não aparece para leitores de tela). */
export function EspacadorLinha({ altura, colunas }: { altura: number; colunas: number }) {
  if (altura <= 0) return null;
  return (
    <tr aria-hidden="true" className="border-0">
      <td colSpan={colunas} className="p-0 border-0" style={{ height: altura }} />
    </tr>
  );
}

// ─── Cartões ────────────────────────────────────────────────────────────────

export interface FileiraVirtual<T> {
  index: number;
  itens: T[];
  /** Deslocamento (px) a partir do topo do contêiner. */
  inicio: number;
  medir: (el: Element | null) => void;
}

export interface CardsVirtuais<T> {
  ativo: boolean;
  colunas: number;
  /** Altura total (px) do contêiner `relative` quando ativo. */
  alturaTotal: number;
  fileiras: FileiraVirtual<T>[];
  rolarPara: (indexDoItem: number) => void;
}

/** `matchMedia` como hook — para o nº de colunas seguir o breakpoint do Tailwind. */
export function useMediaQuery(query: string): boolean {
  const [ok, setOk] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const onChange = () => setOk(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return ok;
}

/**
 * Cartões virtuais em grade. A grade vira fileiras de `colunas` itens; cada
 * fileira renderiza um `grid` normal (mesmas classes de antes), posicionada com
 * `position:absolute; transform: translateY(inicio)` dentro de um contêiner
 * `relative` com `height: alturaTotal`.
 *
 *   const v = useCardsVirtuais(itens, { scrollRef, alturaEstimada: 320, colunas: duasColunas ? 2 : 1 });
 *   <div className="relative" style={v.ativo ? { height: v.alturaTotal } : undefined}>
 *     {v.fileiras.map(f => (
 *       <div key={f.index} ref={f.medir} data-index={f.index}
 *            className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch pb-4"
 *            style={v.ativo ? { position:'absolute', top:0, left:0, width:'100%', transform:`translateY(${f.inicio}px)` } : undefined}>
 *         {f.itens.map(renderCard)}
 *       </div>
 *     ))}
 *   </div>
 */
export function useCardsVirtuais<T>(
  itens: readonly T[],
  opcoes: OpcoesVirtuais & { colunas: number },
): CardsVirtuais<T> {
  const { scrollRef, alturaEstimada, overscan = 6 } = opcoes;
  const colunas = Math.max(1, opcoes.colunas);
  const ativo = opcoes.ativo ?? itens.length >= LIMIAR_VIRTUALIZACAO;

  const fileirasTodas = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < itens.length; i += colunas) out.push(itens.slice(i, i + colunas));
    return out;
  }, [itens, colunas]);

  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count: ativo ? fileirasTodas.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => alturaEstimada,
    overscan,
  });

  const rolarPara = useCallback((indexDoItem: number) => {
    if (!ativo) return;
    virtualizer.scrollToIndex(Math.floor(indexDoItem / colunas), { align: "center" });
  }, [ativo, virtualizer, colunas]);

  if (!ativo) {
    return {
      ativo,
      colunas,
      alturaTotal: 0,
      fileiras: fileirasTodas.map((f, index) => ({ index, itens: f, inicio: 0, medir: semMedicao })),
      rolarPara,
    };
  }

  return {
    ativo,
    colunas,
    alturaTotal: virtualizer.getTotalSize(),
    fileiras: virtualizer.getVirtualItems().map(v => ({
      index: v.index,
      itens: fileirasTodas[v.index],
      inicio: v.start,
      medir: medidorCom(virtualizer, v.index),
    })),
    rolarPara,
  };
}
