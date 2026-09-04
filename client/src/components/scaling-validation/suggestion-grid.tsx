import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Copy, MoreHorizontal, Pencil, Plus, Route, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QtyCell } from "./qty-cell";
import { LogisticsPanel } from "./logistics-panel";
import { CHIP_NEUTRAL, LegChip, NeedChips, dayText } from "./logistics-chips";
import { formatDateHeader, totalsByDay, type DateHeader, type RowValidation, type SuggestionGridRow } from "./scaling-grid-utils";

export interface SuggestionGridProps {
  rows: SuggestionGridRow[];
  dates: string[];
  /** Validação por rowId, computada uma vez na página (erros bloqueiam, avisos não). */
  issuesByRow: ReadonlyMap<string, RowValidation>;
  /** Área responsável por função (11px sob o nome). */
  areaByFunctionId: ReadonlyMap<string, string>;
  onChangeRow: (rowId: string, patch: Partial<SuggestionGridRow>) => void;
  onChangeQty: (rowId: string, date: string, value: number) => void;
  onDuplicateRow: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
  /** Saídas do estado vazio "Nenhuma função na grade". */
  onPaste: () => void;
  onAddFunction: () => void;
  disabled?: boolean;
  /**
   * Linha com o painel de logística aberto. Opcionalmente CONTROLADO pela
   * página: o "Corrigir" do painel de revisão precisa abrir a logística da
   * linha com problema — sem isto o clique só rolava até a célula de
   * quantidade e o campo errado continuava escondido.
   */
  openRowId?: string | null;
  onOpenRowChange?: (rowId: string | null) => void;
  /** Total de vagas (1 por pessoa) já decomposto pela página — vai no rodapé, ao lado de pessoas-dia. */
  vagasTotal?: number;
}

// Cabeçalho de tabela do design system: 11px, bold, caixa alta, slate-500.
const TH = "px-2 py-2 text-center border-r border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";
/**
 * Coluna fixa da função: 220px no desktop; abaixo de `lg` encolhe para 140px e
 * abaixo de `md` deixa de ser sticky — num celular a coluna colada comia mais
 * da metade da tela e a grade não rolava para lugar nenhum.
 */
const FN_COL = "w-[140px] min-w-[140px] max-w-[140px] lg:w-[220px] lg:min-w-[220px] lg:max-w-[220px] md:sticky md:left-0";
/** Largura da coluna "Pessoas-dia" (cabeçalho, célula e rodapé usam a mesma; o rótulo em caixa alta precisa de ~96px). */
const PD_COL = 96;

/** Atributo usado pela página para focar a linha a partir dos chips de pendência. */
export const rowDomId = (rowId: string) => `sug-row-${rowId}`;
/** id do cartão de logística (aria-controls do botão da linha e alvo do "Corrigir" da página). */
export const LOGISTICS_PANEL_DOM_ID = "sug-logistics-panel";

/** A perna tem algo a dizer (modal, data ou hora)? */
const hasLeg = (mode: string, date: string, time: string) => !!(mode || date || time);

/** Dias da linha com quantidade > 0 (para os avisos de viagem do painel). */
const workDaysOf = (row: SuggestionGridRow, dates: string[]) => dates.filter((d) => (row.quantities[d] || 0) > 0);

interface GridRowProps {
  row: SuggestionGridRow;
  rowIdx: number;
  headers: readonly (DateHeader & { ymd: string })[];
  issues: RowValidation | undefined;
  area: string | undefined;
  expanded: boolean;
  disabled?: boolean;
  onToggleExpand: (rowId: string) => void;
  onChangeQty: SuggestionGridProps["onChangeQty"];
  onDuplicateRow: SuggestionGridProps["onDuplicateRow"];
  onRemoveRow: SuggestionGridProps["onRemoveRow"];
}

const GridRow = memo(function GridRow({
  row, rowIdx, headers, issues, area, expanded, disabled,
  onToggleExpand, onChangeQty, onDuplicateRow, onRemoveRow,
}: GridRowProps) {
  // Duas medidas diferentes que a coluna antiga ("Vagas") misturava: a SOMA das
  // quantidades é pessoas-dia; o nº de VAGAS (1 por pessoa) é o MAIOR valor de
  // um dia — a mesma regra da decomposição no envio (decomposeGridRows).
  const total = headers.reduce((acc, h) => acc + (row.quantities[h.ymd] || 0), 0);
  const vagas = headers.reduce((acc, h) => Math.max(acc, row.quantities[h.ymd] || 0), 0);
  const errors = issues?.errors ?? [];
  const warnings = issues?.warnings ?? [];
  const issueText = errors[0] ?? warnings[0] ?? null;
  const issueExtra = errors.length + warnings.length - 1;
  // Ponto de status da linha: cinza vazio · azul ok · âmbar aviso · vermelho erro.
  const dot = errors.length > 0 ? "bg-red-500" : warnings.length > 0 ? "bg-amber-500" : total > 0 ? "bg-primary" : "bg-slate-300";
  const zebra = rowIdx % 2 === 1 ? "bg-slate-50" : "bg-white";
  // Linha com o painel aberto fica marcada em azul de marca (o painel mora fora
  // da tabela, então é a cor que liga os dois). Fundo OPACO de propósito: a
  // célula sticky precisa cobrir o que rola por baixo.
  const rowBg = expanded ? "bg-brand-soft" : zebra;

  const hasLogistics = hasLeg(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)
    || hasLeg(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)
    || row.needsAccommodation || row.needsTicket || !!row.observations;

  return (
    // scroll-mb-16: ao focar por teclado, a linha não fica escondida atrás do rodapé fixo.
    <tr id={rowDomId(row.rowId)} data-row-id={row.rowId} className={cn("group scroll-mb-16 border-b border-slate-100 transition-colors hover:bg-brand-soft/50", rowBg)}>
      {/* Função: ponto de status + nome + área + pendência + repetir 1º valor */}
      <td className={cn("px-3 py-1.5 border-r border-slate-200 z-10 transition-colors group-hover:bg-brand-soft", FN_COL, rowBg)}>
        <div className="flex items-start gap-1.5">
          <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-800" title={row.functionName}>{row.functionName}</span>
            {area && <span className="block truncate text-[11px] text-slate-500" title={area}>{area}</span>}
            {issueText && (
              <span
                className={cn("block truncate text-[11px]", errors.length > 0 ? "text-red-700" : "text-amber-700")}
                title={[...errors, ...warnings].join("; ")}
              >
                {issueText}{issueExtra > 0 ? ` (+${issueExtra})` : ""}
              </span>
            )}
          </div>
        </div>
      </td>

      {headers.map((h, colIdx) => (
        <td key={h.ymd} className="px-1 py-1.5 border-r border-slate-100 text-center">
          <QtyCell
            value={row.quantities[h.ymd] || 0}
            rowId={row.rowId}
            date={h.ymd}
            rowIdx={rowIdx}
            colIdx={colIdx}
            functionName={row.functionName}
            dayLabel={`${h.dayName} ${h.date}`}
            isWeekend={h.isWeekend}
            disabled={disabled}
            onChangeQty={onChangeQty}
          />
        </td>
      ))}

      <td className="px-2 py-1.5 border-r border-slate-100 border-l border-l-slate-200 text-center text-xs font-semibold tabular-nums text-slate-600 leading-tight">
        {total > 0 ? (
          <>
            <span className="block">{total}</span>
            <span className="block text-[11px] font-normal text-slate-500">{vagas} {vagas === 1 ? "vaga" : "vagas"}</span>
          </>
        ) : <span className="text-slate-300">–</span>}
      </td>

      {/* Logística e observação: chips de leitura em UMA linha + botão do painel */}
      <td className="px-2 py-1.5 border-r border-slate-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            <LegChip
              dir="ida" mode={row.transportModeIda} className="shrink-0"
              date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime}
            />
            <LegChip
              dir="volta" mode={row.transportModeVolta} className="shrink-0"
              date={row.flightReturnDate} time={row.flightReturnSuggestedTime}
            />
            <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} className="shrink-0" />
            {row.observations && (
              <span className={cn(CHIP_NEUTRAL, "min-w-0")} title={row.observations}>
                <span className="truncate italic">{row.observations}</span>
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggleExpand(row.rowId)}
            aria-expanded={expanded}
            aria-controls={LOGISTICS_PANEL_DOM_ID}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none",
              expanded
                ? "border-primary/30 bg-white text-primary"
                : hasLogistics
                  ? "border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary"
                  : "border-dashed border-slate-300 bg-white text-slate-500 hover:border-primary/40 hover:text-primary",
            )}
          >
            {!expanded && <Pencil className="w-3 h-3" aria-hidden="true" />}
            {expanded ? "Fechar" : hasLogistics ? "Editar viagem" : "Definir viagem"}
          </button>
        </div>
      </td>

      <td className="px-1 py-1.5 text-center w-[44px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Ações da linha ${row.functionName}`} className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 rounded-lg">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDuplicateRow(row.rowId)}>
              <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar linha
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRemoveRow(row.rowId)} className="text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
});

/**
 * Grade função × dia da Sugestão de Escala, com quantidades separadas da
 * logística: colunas de dia + Pessoas-dia + UMA coluna de logística (chips +
 * botão) + rodapé fixo "Pessoas por dia" com o pico do evento.
 *
 * O painel de logística fica FORA da tabela, num cartão logo abaixo do
 * contêiner de rolagem: dentro da tabela ele era uma <tr colSpan> que sumia da
 * viewport assim que a grade rolava (e a grade rola sempre que passa de ~10
 * linhas). Componente controlado (o estado mora na página, que também cuida
 * do rascunho).
 */
export function SuggestionGrid({
  rows, dates, issuesByRow, areaByFunctionId, onChangeRow, onChangeQty, onDuplicateRow, onRemoveRow,
  onPaste, onAddFunction, disabled, openRowId: openRowIdProp, onOpenRowChange, vagasTotal,
}: SuggestionGridProps) {
  const headers = useMemo(() => dates.map((ymd) => ({ ymd, ...formatDateHeader(ymd) })), [dates]);
  // Controlado pela página quando ela passa `openRowId`; senão, estado local.
  const [openRowIdLocal, setOpenRowIdLocal] = useState<string | null>(null);
  const controlled = openRowIdProp !== undefined;
  const openRowId = controlled ? openRowIdProp : openRowIdLocal;
  const setOpenRowId = useCallback((next: string | null) => {
    if (!controlled) setOpenRowIdLocal(next);
    onOpenRowChange?.(next);
  }, [controlled, onOpenRowChange]);
  const toggleExpand = useCallback((rowId: string) => setOpenRowId(openRowId === rowId ? null : rowId), [openRowId, setOpenRowId]);
  const totals = useMemo(() => totalsByDay(rows, dates), [rows, dates]);
  const openRow = useMemo(() => (openRowId ? rows.find((r) => r.rowId === openRowId) ?? null : null), [rows, openRowId]);
  const openRowWorkDays = useMemo(() => (openRow ? workDaysOf(openRow, dates) : []), [openRow, dates]);
  // Função (220) + dias (58) + Pessoas-dia (96) + Logística (mín. 260) + ações (44):
  // 6 dias cabem em ~1000px — sem rolagem horizontal num notebook de 1366px.
  const colCount = dates.length + 4;
  const minWidth = 220 + dates.length * 58 + PD_COL + 260 + 44;

  // Ao abrir o painel: traz o cartão para a vista (ele fica abaixo da grade,
  // muitas vezes fora da tela) e leva o foco ao primeiro campo — quem clicou
  // "Definir viagem" quer digitar, não rolar.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openRowId || !panelRef.current) return;
    const first = panelRef.current.querySelector<HTMLElement>("input, button, select, [tabindex]:not([tabindex='-1'])");
    first?.focus({ preventScroll: true });
    panelRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openRowId]);

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-sm" style={{ minWidth }}>
            <thead className="bg-slate-50 sticky top-0 z-20">
              <tr>
                <th scope="col" className={cn(TH, "text-left bg-slate-50 z-30 border-r-slate-200 px-3", FN_COL)}>Função</th>
                {headers.map((h) => (
                  <th key={h.ymd} scope="col" className={cn(TH, "w-[58px] min-w-[58px]", h.isWeekend ? "bg-orange-50 text-orange-700" : "bg-brand-soft/60")}>
                    <div className="leading-none">{h.date}</div>
                    <div className={cn("mt-0.5 text-[10px] font-normal normal-case tracking-normal", h.isWeekend ? "text-orange-600" : "text-slate-500")}>{h.dayName}</div>
                  </th>
                ))}
                <th scope="col" className={cn(TH, "bg-slate-50 border-l border-l-slate-200")} style={{ width: PD_COL, minWidth: PD_COL }}>Pessoas-dia</th>
                <th scope="col" className={cn(TH, "text-left min-w-[260px]")}>Logística e observação</th>
                <th scope="col" className={cn(TH, "border-r-0 w-[44px]")}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-6 py-10 text-center">
                    <p className="text-sm font-medium text-slate-600">Nenhuma função na grade</p>
                    <p className="text-xs text-slate-500 mt-1">Cole a escala direto da planilha ou adicione as funções uma a uma.</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <Button type="button" size="sm" disabled={disabled} onClick={onPaste} className="rounded-lg bg-primary hover:bg-primary-hover">
                        <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Colar da planilha
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onAddFunction} className="rounded-lg">
                        <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Adicionar função
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((row, rowIdx) => (
                <GridRow
                  key={row.rowId}
                  row={row}
                  rowIdx={rowIdx}
                  headers={headers}
                  issues={issuesByRow.get(row.rowId)}
                  area={areaByFunctionId.get(row.functionId)}
                  expanded={openRowId === row.rowId}
                  disabled={disabled}
                  onToggleExpand={toggleExpand}
                  onChangeQty={onChangeQty}
                  onDuplicateRow={onDuplicateRow}
                  onRemoveRow={onRemoveRow}
                />
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className={cn("sticky bottom-0 z-30 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500", FN_COL)}>
                    Pessoas por dia
                  </td>
                  {headers.map((h) => {
                    const t = totals.byDay[h.ymd] || 0;
                    const isPeak = totals.peakDate === h.ymd && totals.peakTotal > 0;
                    return (
                      <td
                        key={h.ymd}
                        className={cn(
                          "sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50 px-1 py-2 text-center text-xs tabular-nums",
                          isPeak ? "bg-brand-soft font-bold text-primary" : t > 0 ? "font-semibold text-slate-700" : "text-slate-300",
                        )}
                      >
                        {t > 0 ? t : "–"}
                      </td>
                    );
                  })}
                  <td className="sticky bottom-0 z-20 border-t border-slate-200 border-l border-l-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-bold tabular-nums text-primary leading-tight">
                    {totals.grand > 0 ? (
                      <>
                        <span className="block">{totals.grand}</span>
                        {vagasTotal !== undefined && (
                          <span className="block text-[11px] font-normal text-slate-500">{vagasTotal} {vagasTotal === 1 ? "vaga" : "vagas"}</span>
                        )}
                      </>
                    ) : "–"}
                  </td>
                  <td colSpan={2} className="sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                    {totals.peakTotal > 0 ? (
                      <span className="whitespace-nowrap font-semibold text-primary">
                        Pico em {dayText(totals.peakDate)} ({totals.peakTotal} {totals.peakTotal === 1 ? "pessoa" : "pessoas"})
                      </span>
                    ) : (
                      <span className="whitespace-nowrap">Preencha as quantidades por dia.</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Painel de logística da linha aberta — cartão com faixa de cabeçalho,
          fora do contêiner de rolagem (scroll-mb: não fica sob a barra fixa de envio). */}
      {openRow && (
        <div
          ref={panelRef}
          id={LOGISTICS_PANEL_DOM_ID}
          role="region"
          aria-label={`Logística sugerida — ${openRow.functionName}`}
          tabIndex={-1}
          className="scroll-mb-36 rounded-2xl border border-primary/30 bg-white overflow-hidden focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-brand-soft px-4 py-2">
            <p className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Route className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Logística sugerida — <span className="normal-case tracking-normal text-[12px]">{openRow.functionName}</span></span>
            </p>
            <button
              type="button"
              onClick={() => setOpenRowId(null)}
              aria-label={`Fechar logística de ${openRow.functionName}`}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="px-4 py-3">
            <LogisticsPanel row={openRow} disabled={disabled} onChangeRow={onChangeRow} workDays={openRowWorkDays} />
          </div>
        </div>
      )}
    </div>
  );
}

export default SuggestionGrid;
