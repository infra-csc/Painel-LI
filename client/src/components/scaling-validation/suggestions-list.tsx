/**
 * Lista de vagas sugeridas — tabela (≥ md) e cards (< md).
 *
 * Desde 25/09 os selos ficam em `suggestions-list/suggestion-badges`, as células
 * e o agrupamento por evento em `suggestions-list/suggestion-cells` e a linha
 * memoizada em `suggestions-list/suggestion-row`. Este arquivo continua sendo o
 * ponto de importação público (reexports abaixo) — tinha 804 linhas.
 */
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { type SortConfig } from "@/components/common/sortable-header";
import { cn } from "@/lib/utils";
import { lockReason, type SuggestionRow } from "./types";
import { TABLE_TH } from "./logistics-chips";
import { railClass, StatusCell } from "./suggestions-list/suggestion-badges";
import { EventLine, IdChip, LockedHint, LogisticsChips, PeriodCell, groupRowsByEvent, type SuggestionSortField } from "./suggestions-list/suggestion-cells";
import { AreaLine, NameButton, PULSE, RowActions, SuggestionTableRow, type SuggestionRowActions } from "./suggestions-list/suggestion-row";

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

/** `<th scope="col">` no padrão do módulo (mesma tipografia do quadro "Escala"). */
const TH = cn("px-3 py-2 text-left whitespace-nowrap", TABLE_TH);

/** Botão de ordenação usado dentro dos `<th scope="col">` (o `<th scope="col">` carrega o `aria-sort`). */
function SortButton({
  field, label, sortConfig, onSort, className,
}: {
  field: SuggestionSortField; label: string;
  sortConfig: SortConfig<SuggestionSortField> | null;
  onSort: (field: SuggestionSortField) => void;
  className?: string;
}) {
  const active = sortConfig?.field === field;
  const dir = active ? sortConfig!.direction : null;
  return (
    <button
      type="button" onClick={() => onSort(field)} data-testid={`header-${field}`}
      aria-label={`Ordenar por ${label}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm uppercase tracking-[inherit] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active ? "text-primary" : "hover:text-slate-700",
        className,
      )}
    >
      <span>{label}</span>
      {dir === "asc" && <ChevronUp className="w-3 h-3" aria-hidden="true" />}
      {dir === "desc" && <ChevronDown className="w-3 h-3" aria-hidden="true" />}
      {!dir && <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" aria-hidden="true" />}
    </button>
  );
}

const ariaSort = (sortConfig: SortConfig<SuggestionSortField> | null, ...fields: SuggestionSortField[]) =>
  sortConfig && fields.includes(sortConfig.field)
    ? (sortConfig.direction === "asc" ? "ascending" : "descending")
    : "none";

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
  const rowTone = (row: SuggestionRow) => (row.canEdit ? "text-foreground" : "text-slate-600");

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
  const colCount = showSelection ? 8 : 7;
  const groups = showEvent ? groupRowsByEvent(rows) : [];

  return (
    <>
      {/* Tabela (≥ md) */}
      {/* Nada de `overflow-hidden` aqui: qualquer ancestral com overflow vira
          um contêiner de rolagem e o `sticky` do cabeçalho passa a se ancorar
          NELE — que não rola — ou seja, o cabeçalho não gruda em lugar nenhum. */}
      <div className="hidden md:block rounded-xl border border-border bg-card">
        {/* Sem altura máxima: a lista rola COM a página (nada de barra dentro de
            barra). Até `xl` a tabela (820px) pode não caber e precisa da barra
            horizontal; de `xl` para cima ela cabe, o overflow volta a `visible`
            e só então o cabeçalho consegue grudar no topo da página.
            Por que `xl` e não `lg` (04/09): em 1024px a área útil é 1024 −
            248 do sidebar − 64 de padding = 712px — nenhuma tabela de sete
            colunas cabe, e overflow visível ali só faria a tabela vazar do
            card. Em 1280px (968px úteis) a versão compacta (~880px) cabe. */}
        <div className="overflow-x-auto xl:overflow-x-visible">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">Vagas sugeridas do evento</caption>
            {/* --sticky-top (main-layout) = barra do topo + banner de simulação:
                o cabeçalho para EMBAIXO do que está fixo, nunca atrás. */}
            <thead className="bg-surface-muted border-b border-border sticky top-[var(--sticky-top,3.5rem)] z-10 shadow-1 [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
              <tr className="group">
                <th scope="col" className="w-9 p-0"><span className="sr-only">Situação</span></th>
                {showSelection && (
                  <th scope="col" className={cn(TH, "w-10 px-1 text-center")}>
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      disabled={selectableList.length === 0}
                      onCheckedChange={onToggleAll}
                      className="data-[state=indeterminate]:bg-primary/70 data-[state=indeterminate]:text-primary-foreground"
                      aria-label={allSelected ? "Desmarcar todas as vagas visíveis" : "Selecionar todas as vagas visíveis em que posso agir"}
                    />
                  </th>
                )}
                {/* "#" e "Vaga" em colunas próprias (04/09): cada uma com o seu
                    `aria-sort` — num `<th scope="col">` só, o leitor de tela anunciava
                    "ordenado" sem dizer por qual dos dois. */}
                <th scope="col" className={cn(TH, "w-[64px] pr-1")} aria-sort={ariaSort(sortConfig, "id")}>
                  <SortButton field="id" label="#" sortConfig={sortConfig} onSort={onSort} />
                </th>
                <th scope="col" className={TH} aria-sort={ariaSort(sortConfig, "function")}>
                  <SortButton field="function" label="Vaga" sortConfig={sortConfig} onSort={onSort} />
                </th>
                <th scope="col" className={cn(TH, "hidden 2xl:table-cell")} aria-sort={ariaSort(sortConfig, "period")}>
                  <SortButton field="period" label="Período / diárias" sortConfig={sortConfig} onSort={onSort} />
                </th>
                <th scope="col" className={TH}>Logística</th>
                <th scope="col" className={cn(TH, "min-w-[220px]")}>Status</th>
                <th scope="col" className={cn(TH, "min-w-[180px] text-right")}>Ações</th>
              </tr>
            </thead>
            {/* Um <tbody> por evento no modo "Todos os eventos" (HTML válido:
                a tabela aceita vários), com um cabeçalho de grupo por bloco. */}
            {showEvent ? (
              groups.map((g) => (
                <tbody key={g.key}>
                  <tr className="bg-surface-muted/80">
                    <th scope="colgroup" colSpan={colCount} className="border-y border-border px-3 py-1.5 text-left">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className={TABLE_TH}>Evento</span>
                        <span className="text-sm font-semibold text-foreground">{g.name}</span>
                        {g.period && <span className="font-mono text-2xs text-muted-foreground">{g.period}</span>}
                        <span className="text-2xs text-muted-foreground">· {g.rows.length} {g.rows.length === 1 ? "vaga" : "vagas"}</span>
                      </span>
                    </th>
                  </tr>
                  {g.rows.map((row, i) => tableRow(row, i))}
                </tbody>
              ))
            ) : (
              <tbody>{rows.map((row, i) => tableRow(row, i))}</tbody>
            )}
          </table>
        </div>
      </div>

      {/* Cards (< md) */}
      <ul className="md:hidden space-y-2" aria-label="Vagas sugeridas">
        {rows.map((row) => {
          const selectable = selectableIds.has(row.id);
          const selected = selectedIds.has(row.id);
          const reason = selectable ? null : lockReason(row);
          const open = onOpenDetail ? () => onOpenDetail(row) : undefined;
          return (
            <li key={row.id} className={cn("overflow-hidden rounded-xl border bg-card", selected ? "border-primary/40 bg-brand-soft/40" : "border-border", rowTone(row), highlightIds?.has(row.id) && PULSE)}>
              <div className="flex">
                <span className={cn("w-1 shrink-0", railClass(row.status))} aria-hidden="true" />
                <div className="flex-1 min-w-0 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {showSelection && (
                      <span className="w-4 h-4 mt-0.5 shrink-0 inline-flex items-center justify-center">
                        {selectable
                          ? <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
                          : <LockedHint reason={reason ?? "Sem ações disponíveis"} />}
                      </span>
                    )}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <IdChip row={row} onClick={open} />
                        <span className="min-w-0 flex-1"><NameButton name={nameOf(row)} onOpen={open} /></span>
                      </div>
                      <AreaLine row={row} />
                      {showEvent && <EventLine row={row} />}
                    </div>
                  </div>
                  <p className="text-xs"><PeriodCell row={row} /></p>
                  <LogisticsChips row={row} />
                  <StatusCell row={row} approverNames={approverNamesFor?.(row)} />
                  <div className="flex justify-end pt-0.5">
                    <RowActions row={row} {...acoes} onOpenDetail={onOpenDetail} compact />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default SuggestionsList;
