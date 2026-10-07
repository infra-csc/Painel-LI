/**
 * Lista de vagas sugeridas — tabela (≥ xl) e cartões (< xl; 07/10, era md).
 *
 * Desde 25/09 os selos ficam em `suggestions-list/suggestion-badges`, as células
 * e o agrupamento por evento em `suggestions-list/suggestion-cells` e a linha
 * memoizada em `suggestions-list/suggestion-row`. Este arquivo continua sendo o
 * ponto de importação público (reexports abaixo) — tinha 804 linhas.
 */
import { CalendarDays, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { type SortConfig } from "@/components/common/sortable-header";
import { cn } from "@/lib/utils";
import { canRequestChange, canValidate, lockReason, type SuggestionRow } from "./types";
import { railClass, StatusCell } from "./suggestions-list/suggestion-badges";
import { EventLine, IdChip, LockedHint, LogisticsChips, PeriodCell, groupRowsByEvent, type EventGroup, type SuggestionSortField } from "./suggestions-list/suggestion-cells";
import { AreaLine, NameButton, PULSE, RowActions, SuggestionTableRow, motivoDaTrava, type SuggestionRowActions } from "./suggestions-list/suggestion-row";

// Reexport: outros módulos (ex.: scaling-approval) importam daqui.
export { workDaysOf } from "./types";
export {
  SuggestionStatusBadge, PendingDaysBadge, PendingRequestBadge, LastDecisionBadge, VagaDecisionBadge, StatusCell,
  type PendingDaysRow,
} from "./suggestions-list/suggestion-badges";
export {
  periodLabel, legLabel, eventPeriodLabel, groupRowsByEvent, EventLine,
  type SuggestionSortField, type EventGroup,
} from "./suggestions-list/suggestion-cells";
export type { SuggestionRowActions } from "./suggestions-list/suggestion-row";

export interface SuggestionsListProps extends SuggestionRowActions {
  rows: SuggestionRow[];
  functionNameById: Map<string, string>;
  /** Vagas (visíveis) que aceitam ação do usuário. */
  selectableIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  showSelection: boolean;
  sortConfig: SortConfig<SuggestionSortField> | null;
  onSort: (field: SuggestionSortField) => void;
  onOpenDetail?: (row: SuggestionRow) => void;
  /** Linhas realçadas por um instante (pedido enviado; "Ver quais" do lote parcial). */
  highlightIds?: ReadonlySet<string>;
  /**
   * Aprovador(es) cadastrados da função da linha (de /api/functions). Lista
   * vazia → a vaga validada não tem para quem ir (aviso na linha + banner da
   * tela). Prop ausente → a tela não sabe e nada é afirmado.
   */
  approverNamesFor?: (row: SuggestionRow) => string[];
  /**
   * Modo "Todos os eventos": a tabela ganha cabeçalho de grupo por evento e o
   * card ganha a linha do evento. Com um evento selecionado fica `false` — a
   * barra de contexto já diz qual é, repetir em toda linha seria ruído.
   */
  showEvent?: boolean;
}

/**
 * `<th scope="col">` da lista (07/10): caixa de frase, 12px, cinza — o mesmo
 * cabeçalho da tabela da Escalação. A caixa alta espaçada gritava mais que o
 * conteúdo das linhas.
 */
const TH = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

/** Botão de ordenação usado dentro dos `<th scope="col">` (o `<th scope="col">` carrega o `aria-sort`). */
function SortButton({
  field, label, ariaLabel, sortConfig, onSort, className,
}: {
  field: SuggestionSortField; label: string; ariaLabel?: string;
  sortConfig: SortConfig<SuggestionSortField> | null;
  onSort: (field: SuggestionSortField) => void;
  className?: string;
}) {
  const active = sortConfig?.field === field;
  const dir = active ? sortConfig!.direction : null;
  return (
    <button
      type="button" onClick={() => onSort(field)} data-testid={`header-${field}`}
      aria-label={`Ordenar por ${ariaLabel ?? label}`}
      className={cn(
        "group/ord inline-flex items-center gap-1 rounded-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active ? "text-primary" : "hover:text-foreground",
        className,
      )}
    >
      <span>{label}</span>
      {dir === "asc" && <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />}
      {dir === "desc" && <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
      {!dir && <ChevronsUpDown className="w-3.5 h-3.5 opacity-30 group-hover/ord:opacity-70" aria-hidden="true" />}
    </button>
  );
}

const ariaSort = (sortConfig: SortConfig<SuggestionSortField> | null, ...fields: SuggestionSortField[]) =>
  sortConfig && fields.includes(sortConfig.field)
    ? (sortConfig.direction === "asc" ? "ascending" : "descending")
    : "none";

/** Cabeçalho de um grupo (evento) no modo "Todos os eventos" — a mesma linha na tabela e nos cartões. */
function GroupHeading({ g }: { g: EventGroup }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
      <span className="text-[13px] font-semibold text-foreground">{g.name}</span>
      {g.period && <span className="text-xs tabular-nums text-muted-foreground">{g.period}</span>}
      <span className="text-xs text-muted-foreground">· {g.rows.length} {g.rows.length === 1 ? "vaga" : "vagas"}</span>
    </span>
  );
}

export function SuggestionsList({
  rows, functionNameById, selectableIds, selectedIds, onToggle, onToggleAll, showSelection, sortConfig, onSort,
  onOpenDetail, highlightIds, approverNamesFor, showEvent = false, onValidate, onAdjust, onDelete,
}: SuggestionsListProps) {
  const selectableList = Array.from(selectableIds);
  const selectedVisible = selectableList.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectableList.length > 0 && selectedVisible === selectableList.length;
  const someSelected = selectedVisible > 0 && !allSelected;
  /** Ações por linha só quando a tela permite agir (fora do modo leitura). */
  const acoes: SuggestionRowActions = showSelection ? { onValidate, onAdjust, onDelete } : {};

  const nameOf = (row: SuggestionRow) => functionNameById.get(row.functionId) ?? "Sem função";

  /** Uma linha da tabela (a mesma, agrupada por evento ou não). */
  const tableRow = (row: SuggestionRow, i: number) => (
    <SuggestionTableRow
      key={row.id}
      row={row}
      name={nameOf(row)}
      zebra={i % 2 === 1}
      selectable={selectableIds.has(row.id)}
      selected={selectedIds.has(row.id)}
      showSelection={showSelection}
      highlighted={!!highlightIds?.has(row.id)}
      approverNames={approverNamesFor?.(row)}
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
      {...acoes}
    />
  );

  /** Colunas da tabela — o cabeçalho de grupo atravessa todas. */
  // Colunas VISÍVEIS abaixo de 2xl (sem "Período"). Com `table-fixed`, um
  // colSpan maior que o número real de colunas cria uma coluna fantasma que
  // rouba largura — em 2xl a célula vazia abaixo completa a coluna "Período".
  const colCount = showSelection ? 6 : 5;
  const groups = showEvent ? groupRowsByEvent(rows) : [];

  /** Um cartão (abaixo de `xl`). */
  const card = (row: SuggestionRow) => {
    const selectable = selectableIds.has(row.id);
    const selected = selectedIds.has(row.id);
    const reason = selectable ? null : lockReason(row);
    const open = onOpenDetail ? () => onOpenDetail(row) : undefined;
    const motivo = motivoDaTrava(row, !!((acoes.onValidate && canValidate(row)) || canRequestChange(row)));
    return (
      <li key={row.id} data-testid={`suggestion-card-${row.inclusionNumber}`}
        className={cn("val-cartao relative flex flex-col overflow-hidden rounded-xl border bg-card",
          selected ? "border-primary/40 bg-brand-soft/40" : "border-border",
          row.canEdit ? "text-foreground" : "text-slate-600", highlightIds?.has(row.id) && PULSE)}>
        <span className={cn("absolute inset-y-0 left-0 w-[3px]", railClass(row.status))} aria-hidden="true" />
        <div className="flex flex-1 flex-col gap-2.5 py-3 pl-4 pr-3">
          <div className="flex items-start gap-2.5">
            {showSelection && (
              <span className="val-alvo -my-1 -ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center">
                {selectable
                  ? <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                  : <LockedHint reason={reason ?? "Sem ações disponíveis"} />}
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <NameButton name={nameOf(row)} onOpen={open} />
              <AreaLine row={row} numero={<IdChip row={row} onClick={open} />} />
              {showEvent && <EventLine row={row} className="pt-0.5" />}
            </div>
          </div>
          <p className="text-xs text-foreground"><PeriodCell row={row} /></p>
          <LogisticsChips row={row} />
          {/* Situação à esquerda, ações à direita na MESMA faixa (07/10) — um
              rodapé só para o "›" deixava meio cartão vazio nas vagas sem ação. */}
          <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-2 border-t border-border/60 pt-2.5">
            <div className="min-w-0 space-y-1">
              <StatusCell row={row} approverNames={approverNamesFor?.(row)} />
              {motivo && <p className="text-2xs text-muted-foreground">{motivo}</p>}
            </div>
            <div className="-mb-1 -mr-1.5 ml-auto">
              <RowActions row={row} {...acoes} onOpenDetail={onOpenDetail} compact semMotivo />
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      {/* Tabela (≥ xl, 07/10) — abaixo disso a tabela de sete colunas não
          cabia (em 1024 sobram ~700px úteis) e rolava de lado com a Situação
          e as ações fora da vista. Do tablet para baixo, cartões. */}
      {/* Nada de `overflow-hidden` aqui: qualquer ancestral com overflow vira
          um contêiner de rolagem e o `sticky` do cabeçalho passa a se ancorar
          NELE — que não rola — ou seja, o cabeçalho não gruda em lugar nenhum. */}
      <div className="hidden xl:block rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
        {/* Larguras FIXAS pelos <th> (07/10): no layout automático a coluna
            "Vaga" era espremida para ~120px (nome e observação quebrando em
            três linhas) enquanto a Situação sobrava com 300px de vazio. A
            "Vaga" fica com o que resta. Abaixo de 2xl o período mora no bloco
            "Vaga" (3ª linha) — em 1366 não cabe coluna própria sem cortar
            "Sáb 21/11 – Seg 23/11" ou a pílula da situação. */}
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Vagas sugeridas do evento</caption>
          {/* Gruda abaixo da barra do topo E da barra da tela (56px) — ver `.val-cabecalho`. */}
          <thead className="val-cabecalho sticky z-10 border-b border-border bg-surface-muted [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
            <tr>
              <th scope="col" className="w-2 p-0"><span className="sr-only">Situação</span></th>
              {showSelection && (
                <th scope="col" className="w-10 py-2.5 pl-2 pr-1 text-center">
                  <span className="inline-flex h-5 items-center">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      disabled={selectableList.length === 0}
                      onCheckedChange={onToggleAll}
                      className="data-[state=indeterminate]:bg-primary/70 data-[state=indeterminate]:text-primary-foreground"
                      aria-label={allSelected ? "Desmarcar todas as vagas visíveis" : "Selecionar todas as vagas visíveis em que posso agir"}
                    />
                  </span>
                </th>
              )}
              {/* "Vaga" e "#" no MESMO cabeçalho (07/10), como "Função · ID" na
                  Escalação — o número desceu para a linha da observação. Cada
                  botão diz por qual campo ordena; o `aria-sort` vale para a coluna. */}
              <th scope="col" className={TH} aria-sort={ariaSort(sortConfig, "function", "id")}>
                <span className="inline-flex items-center gap-3">
                  <SortButton field="function" label="Vaga" sortConfig={sortConfig} onSort={onSort} />
                  <SortButton field="id" label="#" ariaLabel="número da vaga" sortConfig={sortConfig} onSort={onSort} />
                  {/* O período mora no bloco "Vaga" abaixo de 2xl: a ordenação vem junto. */}
                  <SortButton field="period" label="Período" ariaLabel="período / diárias" sortConfig={sortConfig} onSort={onSort} className="2xl:hidden" />
                </span>
              </th>
              <th scope="col" className={cn(TH, "hidden w-[164px] 2xl:table-cell")} aria-sort={ariaSort(sortConfig, "period")}>
                <SortButton field="period" label="Período" ariaLabel="período / diárias" sortConfig={sortConfig} onSort={onSort} />
              </th>
              <th scope="col" className={cn(TH, "w-[228px] 2xl:w-[400px]")}>Logística</th>
              <th scope="col" className={cn(TH, "w-[276px] 2xl:w-[300px]")}>Situação</th>
              <th scope="col" className={cn(TH, "text-right", showSelection ? "w-[188px]" : "w-14")}><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          {/* Um <tbody> por evento no modo "Todos os eventos" (HTML válido:
              a tabela aceita vários), com um cabeçalho de grupo por bloco. */}
          {showEvent ? (
            groups.map((g) => (
              <tbody key={g.key}>
                <tr className="bg-surface-muted/60">
                  <th scope="colgroup" colSpan={colCount} className="border-b border-border px-4 py-2 text-left font-normal">
                    <GroupHeading g={g} />
                  </th>
                  <td className="hidden border-b border-border 2xl:table-cell" aria-hidden="true" />
                </tr>
                {g.rows.map((row, i) => tableRow(row, i))}
              </tbody>
            ))
          ) : (
            <tbody>{rows.map((row, i) => tableRow(row, i))}</tbody>
          )}
        </table>
      </div>

      {/* Cartões (< xl): uma coluna no celular, duas do tablet em diante. */}
      {showEvent ? (
        <div className="space-y-4 xl:hidden">
          {groups.map((g) => (
            <section key={g.key} aria-label={`Evento ${g.name}`} className="space-y-2">
              <h3 className="px-1"><GroupHeading g={g} /></h3>
              <ul className="grid gap-2.5 md:grid-cols-2" aria-label={`Vagas sugeridas — ${g.name}`}>{g.rows.map(card)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2 xl:hidden" aria-label="Vagas sugeridas">
          {rows.map(card)}
        </ul>
      )}
    </>
  );
}

export default SuggestionsList;
