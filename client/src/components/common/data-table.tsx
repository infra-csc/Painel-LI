/**
 * DataTable — a tabela única do Painel-LI (28/09).
 *
 * Por quê: cada tela desenhava a própria `<table>` (Eventos, Funções, Usuários,
 * Colaboradores, Flash…) com cabeçalho, ordenação, zebra, estado vazio e modo
 * cartão reescritos à mão — e nenhuma delas fazia tudo certo (Eventos tinha
 * `<th role="button">` sem botão de verdade; Funções não tinha cartão no
 * celular; Usuários não tinha `caption`). Este componente concentra:
 *
 *  - semântica: `<table aria-rowcount>` com `<caption class="sr-only">`,
 *    `<th scope="col">`; a ordenação é um `<button>` DENTRO do `th` (teclado
 *    de graça) e o `th` carrega `aria-sort`;
 *  - visual: cabeçalho `bg-surface-muted` (token do guia), opcionalmente
 *    `sticky top-0`; densidade `compact` (listas operacionais) ou `regular`
 *    (cadastros); zebra opcional; linha clicável acessível (o clique real é um
 *    botão na célula principal — o `onClick` da `<tr>` é só conveniência de mouse);
 *  - celular: abaixo de `md` (`useIsMobile`) vira lista de cartões — o
 *    `cardRender(row)` da tela ou um cartão padrão montado a partir das colunas
 *    (`papel: "principal" | "secundaria" | "acoes" | "oculta"`);
 *  - desempenho: `rowRender` para telas que já memoizam a linha, e
 *    virtualização opcional (`virtual`) com `common/virtual-rows.tsx` quando
 *    `rows.length > LIMIAR_VIRTUALIZACAO` (60).
 *
 * O que ele NÃO faz de propósito: filtrar, paginar ou ordenar os dados. A tela
 * é dona da lista (já ordenada/paginada) e recebe `onSort(key)` para decidir.
 * Também não desenha o card em volta (borda, sombra) — cada tela já tem o seu.
 */
import { Fragment, useRef, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { LoadingState } from "./loading-state";
import { EspacadorLinha, LIMIAR_VIRTUALIZACAO, useLinhasVirtuais } from "./virtual-rows";

export type DensidadeDaTabela = "compact" | "regular";
export type DirecaoDaOrdem = "asc" | "desc";
export type AlinhamentoDaColuna = "left" | "center" | "right";
/**
 * Papel da coluna no cartão padrão (celular): `principal` vira o título,
 * `secundaria` vira "rótulo: valor", `acoes` vai para o canto direito e
 * `oculta` não aparece no cartão (ex.: um "#" sequencial).
 */
export type PapelDaColuna = "principal" | "secundaria" | "acoes" | "oculta";

export interface OrdemDaTabela<K extends string = string> {
  key: K;
  dir: DirecaoDaOrdem;
}

export interface ColunaDaTabela<T, K extends string = string> {
  /** Identidade da coluna: chave da ordenação e `key` do React. */
  key: K;
  header: ReactNode;
  /** Nome falado quando `header` não é texto (coluna de ações sem rótulo visível). */
  headerLabel?: string;
  /** Tooltip do cabeçalho (ex.: "Escal." → "Escalações ativas"). */
  headerTip?: string;
  cell: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  align?: AlinhamentoDaColuna;
  /** Largura fixa em px (colunas de nº, status, ações). Sem valor: flexível. */
  width?: number;
  headerClassName?: string;
  cellClassName?: string;
  papel?: PapelDaColuna;
}

export interface SelecaoDaTabela<T> {
  selecionados: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Sem ele, o cabeçalho não tem a caixa "Selecionar todos". */
  onToggleTodos?: () => void;
  /** Texto do `aria-label` da caixa de cada linha ("Selecionar {rótulo}"). */
  rotuloDaLinha?: (row: T) => string;
}

export interface VirtualizacaoDaTabela {
  /** Chute inicial da altura de uma linha (px); a real é medida. Padrão 52. */
  alturaEstimada?: number;
  /** Classe de altura máxima do contêiner que rola. Padrão `max-h-[70vh]`. */
  maxHeightClassName?: string;
}

export interface DataTableProps<T, K extends string = string> {
  columns: ColunaDaTabela<T, K>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Resumo da tabela para leitores de tela (fica `sr-only`). */
  caption: string;
  density?: DensidadeDaTabela;
  stickyHeader?: boolean;
  zebra?: boolean;
  /** Mantém o `<thead>` para leitores de tela, mas escondido (listas curtas). */
  hideHeader?: boolean;
  sort?: OrdemDaTabela<K> | null;
  onSort?: (key: K) => void;
  /** Renderizado NO LUGAR da tabela quando `rows` está vazio. */
  emptyState?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  loadingCount?: number;
  selectable?: SelecaoDaTabela<T>;
  onRowClick?: (row: T) => void;
  /** Coluna extra ao final com as ações da linha. */
  rowActions?: (row: T) => ReactNode;
  /** Nome falado da coluna de ações. Padrão "Ações". */
  rowActionsLabel?: string;
  rowClassName?: (row: T, index: number) => string | undefined;
  /**
   * Linha inteira por conta da tela (uma `<tr>` memoizada). Com ele, `columns`
   * só desenha o cabeçalho e o cartão padrão; `onRowClick`/`rowActions`/zebra
   * não se aplicam à linha.
   */
  rowRender?: (row: T, index: number) => ReactNode;
  /** `auto` (padrão): cartões abaixo de `md`. `never`: sempre tabela. `always`: sempre cartões. */
  cardMode?: "auto" | "never" | "always";
  cardRender?: (row: T, index: number) => ReactNode;
  cardListClassName?: string;
  /** Liga a virtualização (só ativa acima de `LIMIAR_VIRTUALIZACAO` linhas). */
  virtual?: boolean | VirtualizacaoDaTabela;
  /** Largura mínima da tabela (rola na horizontal dentro do contêiner). */
  minWidthClassName?: string;
  className?: string;
  tableClassName?: string;
  "data-testid"?: string;
}

const ARIA_SORT: Record<DirecaoDaOrdem, "ascending" | "descending"> = { asc: "ascending", desc: "descending" };

const ALINHAMENTO: Record<AlinhamentoDaColuna, string> = { left: "text-left", center: "text-center", right: "text-right" };

/** Densidade por classes de espaçamento do tema (não há px soltos). */
const DENSIDADE: Record<DensidadeDaTabela, { th: string; td: string }> = {
  compact: { th: "px-3.5 py-2.5", td: "px-3.5 py-2.5" },
  regular: { th: "px-5 py-3", td: "px-5 py-3.5" },
};

const TH_BASE = "text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] whitespace-nowrap select-none";
const BOTAO_ORDENAR = "group inline-flex items-center gap-1 max-w-full text-left uppercase tracking-[inherit] cursor-pointer rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const BOTAO_LINHA = "block w-full text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/** Clique de mouse na linha não pode roubar o clique de um controle da célula. */
function veioDeUmControle(e: MouseEvent<HTMLElement>): boolean {
  return !!(e.target as HTMLElement).closest("button, a, input, select, textarea, label, [role='button'], [role='menuitem']");
}

function textoDoCabecalho<T, K extends string>(col: ColunaDaTabela<T, K>): string | undefined {
  if (col.headerLabel) return col.headerLabel;
  return typeof col.header === "string" || typeof col.header === "number" ? String(col.header) : undefined;
}

function colunaPrincipal<T, K extends string>(columns: ColunaDaTabela<T, K>[]): ColunaDaTabela<T, K> | undefined {
  return columns.find(c => c.papel === "principal") ?? columns.find(c => c.papel !== "acoes" && c.papel !== "oculta");
}

export function DataTable<T, K extends string = string>({
  columns, rows, getRowId, caption,
  density = "regular", stickyHeader = false, zebra = false, hideHeader = false,
  sort, onSort, emptyState, loading = false, loadingLabel = "Carregando…", loadingCount = 5,
  selectable, onRowClick, rowActions, rowActionsLabel = "Ações", rowClassName, rowRender,
  cardMode = "auto", cardRender, cardListClassName,
  virtual, minWidthClassName, className, tableClassName,
  "data-testid": testId,
}: DataTableProps<T, K>) {
  const isMobile = useIsMobile();
  const emCartoes = cardMode === "always" || (cardMode === "auto" && isMobile);

  const scrollRef = useRef<HTMLDivElement>(null);
  const opcoesVirtuais = typeof virtual === "object" ? virtual : {};
  const virtualLigado = !!virtual && !emCartoes && rows.length > LIMIAR_VIRTUALIZACAO;
  const v = useLinhasVirtuais(rows, { scrollRef, alturaEstimada: opcoesVirtuais.alturaEstimada ?? 52, ativo: virtualLigado });

  if (loading) return <LoadingState count={loadingCount} label={loadingLabel} className={className} />;
  if (rows.length === 0) {
    return <>{emptyState ?? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum registro.</p>}</>;
  }

  const d = DENSIDADE[density];
  const principal = colunaPrincipal(columns);
  const totalDeColunas = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  const tituloClicavel = (row: T, conteudo: ReactNode) =>
    onRowClick
      ? <button type="button" onClick={() => onRowClick(row)} className={BOTAO_LINHA}>{conteudo}</button>
      : conteudo;

  const caixaDaLinha = (row: T, id: string) => selectable && (
    <Checkbox
      checked={selectable.selecionados.has(id)}
      onCheckedChange={() => selectable.onToggle(id)}
      aria-label={`Selecionar ${selectable.rotuloDaLinha ? selectable.rotuloDaLinha(row) : id}`}
    />
  );

  // ── Cartões (celular ou `cardMode="always"`) ─────────────────────────────
  if (emCartoes) {
    const secundarias = columns.filter(c => c !== principal && (c.papel === undefined || c.papel === "secundaria"));
    const deAcoes = columns.filter(c => c.papel === "acoes");
    return (
      <ul role="list" aria-label={caption} className={cn("flex flex-col gap-1.5", cardListClassName)} data-testid={testId}>
        {rows.map((row, i) => {
          const id = getRowId(row);
          if (cardRender) return <li key={id}>{cardRender(row, i)}</li>;
          const acoes = [...deAcoes.map(c => c.cell(row, i)), rowActions?.(row)].filter(Boolean);
          return (
            <li key={id} className={cn("bg-card rounded-lg border border-border shadow-1 px-3.5 py-3 flex flex-col gap-2", onRowClick && "hover:shadow-2 transition-shadow")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {selectable && <span className="pt-0.5">{caixaDaLinha(row, id)}</span>}
                  <div className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                    {principal ? tituloClicavel(row, principal.cell(row, i)) : null}
                  </div>
                </div>
                {acoes.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {acoes.map((a, j) => <Fragment key={j}>{a}</Fragment>)}
                  </div>
                )}
              </div>
              {secundarias.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {secundarias.map(c => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-2xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{c.header}</dt>
                      <dd className="text-xs text-foreground min-w-0 break-words">{c.cell(row, i)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  // ── Tabela ────────────────────────────────────────────────────────────────
  const todosSelecionados = !!selectable && rows.every(r => selectable.selecionados.has(getRowId(r)));
  const algumSelecionado = !!selectable && rows.some(r => selectable.selecionados.has(getRowId(r)));

  const cabecalho = (col: ColunaDaTabela<T, K>) => {
    const ativa = !!sort && sort.key === col.key;
    const nome = textoDoCabecalho(col);
    const rotulo = col.header === "" || col.header === undefined
      ? <span className="sr-only">{nome}</span>
      : col.header;
    const conteudo = col.sortable && onSort ? (
      <button type="button" onClick={() => onSort(col.key)} className={BOTAO_ORDENAR} aria-label={nome ? `Ordenar por ${nome}` : undefined}>
        <span>{rotulo}</span>
        {ativa && sort.dir === "asc" && <ChevronUp className="w-3 h-3 text-primary" aria-hidden="true" />}
        {ativa && sort.dir === "desc" && <ChevronDown className="w-3 h-3 text-primary" aria-hidden="true" />}
        {!ativa && <ChevronsUpDown className="w-3 h-3 opacity-20 group-hover:opacity-60" aria-hidden="true" />}
      </button>
    ) : rotulo;
    return (
      <th
        key={col.key}
        scope="col"
        aria-sort={col.sortable && onSort ? (ativa ? ARIA_SORT[sort.dir] : "none") : undefined}
        style={col.width ? { width: col.width } : undefined}
        className={cn(TH_BASE, d.th, ALINHAMENTO[col.align ?? "left"], col.headerClassName)}
        data-testid={`header-${col.key}`}
      >
        {col.headerTip ? (
          <Tooltip>
            <TooltipTrigger asChild><span className="inline-flex">{conteudo}</span></TooltipTrigger>
            <TooltipContent>{col.headerTip}</TooltipContent>
          </Tooltip>
        ) : conteudo}
      </th>
    );
  };

  const linhaPadrao = (row: T, i: number, medir: (el: Element | null) => void) => {
    const id = getRowId(row);
    return (
      <tr
        key={id}
        ref={medir}
        data-index={i}
        onClick={onRowClick ? (e) => { if (!veioDeUmControle(e)) onRowClick(row); } : undefined}
        className={cn(
          // A linha de cima da primeira linha é a de baixo do cabeçalho (sem dobrar).
          "border-t border-border/60 first:border-t-0 transition-colors",
          onRowClick ? "cursor-pointer hover:bg-brand-soft/30" : "hover:bg-muted/40",
          zebra && i % 2 === 1 && "bg-surface-muted/40",
          rowClassName?.(row, i),
        )}
      >
        {selectable && <td className={cn(d.td, "w-10")}>{caixaDaLinha(row, id)}</td>}
        {columns.map(col => (
          <td key={col.key} className={cn(d.td, ALINHAMENTO[col.align ?? "left"], col.cellClassName)}>
            {col === principal ? tituloClicavel(row, col.cell(row, i)) : col.cell(row, i)}
          </td>
        ))}
        {rowActions && <td className={cn(d.td, "text-right")}>{rowActions(row)}</td>}
      </tr>
    );
  };

  const vir = typeof virtual === "object" ? virtual : undefined;

  return (
    <div
      ref={scrollRef}
      className={cn(virtualLigado ? cn("overflow-auto", vir?.maxHeightClassName ?? "max-h-[70vh]") : "overflow-x-auto", className)}
      data-testid={testId}
    >
      <table className={cn("w-full border-collapse", minWidthClassName, tableClassName)} aria-rowcount={rows.length + 1}>
        <caption className="sr-only">{caption}</caption>
        <thead className={cn("bg-surface-muted", stickyHeader && "sticky top-0 z-10", hideHeader && "sr-only")}>
          <tr className="border-b border-border">
            {selectable && (
              <th scope="col" className={cn(TH_BASE, d.th, "w-10")}>
                {selectable.onToggleTodos
                  ? <Checkbox checked={todosSelecionados ? true : algumSelecionado ? "indeterminate" : false} onCheckedChange={selectable.onToggleTodos} aria-label="Selecionar todos" />
                  : <span className="sr-only">Seleção</span>}
              </th>
            )}
            {columns.map(cabecalho)}
            {rowActions && <th scope="col" className={cn(TH_BASE, d.th, "text-right")}><span className="sr-only">{rowActionsLabel}</span></th>}
          </tr>
        </thead>
        <tbody>
          <EspacadorLinha altura={v.espacoAntes} colunas={totalDeColunas} />
          {v.linhas.map(l => rowRender ? rowRender(l.item, l.index) : linhaPadrao(l.item, l.index, l.medir))}
          <EspacadorLinha altura={v.espacoDepois} colunas={totalDeColunas} />
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
