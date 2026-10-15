import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Copy, FolderInput, MoreHorizontal, Pencil, Plus, Route, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QtyCell } from "./qty-cell";
import { LogisticsPanel } from "./logistics-panel";
import type { EventoParaTrecho } from "./trechos-da-perna";
import { CHIP_NEED, CHIP_NEUTRAL, LegChip, NeedChips, SaiDeChip, dayText } from "./logistics-chips";
import { textoDaIndicacao } from "@shared/janela-de-viagem";
import { nomeDoEventoNoCache } from "@/lib/nome-do-evento";
import { cidadeDaLinha, formatDateHeader, totalsByDay, type DateHeader, type RowValidation, type SuggestionGridRow } from "./scaling-grid-utils";

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
  /** Terceira saída do estado vazio (opcional): copiar de outro evento. */
  onCopyEvent?: () => void;
  /** Trava só os caminhos do estado vazio (ex.: funções não carregaram — não há o que colar nem adicionar). */
  startDisabled?: boolean;
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
  /** Período do EVENTO ("AAAA-MM-DD"): os dias dele ganham o filete no cabeçalho (o resto é margem de montagem/desmontagem). */
  eventStart?: string;
  eventEnd?: string;
  /** Outros eventos para "vem direto de / segue direto para" no painel de logística (09/10). */
  eventosParaTrecho?: EventoParaTrecho[];
}

// Cabeçalho de tabela do design system: 11px, bold, caixa alta, slate-500.
const TH = "px-2 py-2 text-center border-r border-border text-2xs font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
/**
 * Coluna fixa da função: 220px no desktop; abaixo de `lg` encolhe para 140px e
 * abaixo de `md` deixa de ser sticky — num celular a coluna colada comia mais
 * da metade da tela e a grade não rolava para lugar nenhum.
 */
const FN_COL = "w-[140px] min-w-[140px] max-w-[140px] lg:w-[220px] lg:min-w-[220px] lg:max-w-[220px] md:sticky md:left-0 sug-col-funcao";
/** Largura da coluna "Pessoas-dia" (cabeçalho, célula e rodapé usam a mesma; o rótulo em caixa alta precisa de ~96px). */
const PD_COL = 96;
/** Largura mínima da coluna de logística: dois chips de perna por linha, o resto quebra para a segunda. */
const LOG_COL = 300;

/** Atributo usado pela página para focar a linha a partir dos chips de pendência. */
export const rowDomId = (rowId: string) => `sug-row-${rowId}`;
/** id do cartão de logística (aria-controls do botão da linha e alvo do "Corrigir" da página). */
export const LOGISTICS_PANEL_DOM_ID = "sug-logistics-panel";

/** A perna tem algo a dizer (modal, data ou hora)? */
const hasLeg = (mode: string, date: string, time: string) => !!(mode || date || time);

/** Dias da linha com quantidade > 0 (para os avisos de viagem do painel). */
const workDaysOf = (row: SuggestionGridRow, dates: string[]) => dates.filter((d) => (row.quantities[d] || 0) > 0);

type Header = DateHeader & { ymd: string; doEvento: boolean };

interface GridRowProps {
  row: SuggestionGridRow;
  rowIdx: number;
  headers: readonly Header[];
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
  const dot = errors.length > 0 ? "bg-danger-strong" : warnings.length > 0 ? "bg-warning-strong" : total > 0 ? "bg-primary" : "bg-slate-300";
  const zebra = rowIdx % 2 === 1 ? "bg-surface-muted" : "bg-card";
  // Linha com o painel aberto fica marcada em azul de marca (o painel mora fora
  // da tabela, então é a cor que liga os dois). Fundo OPACO de propósito: a
  // célula sticky precisa cobrir o que rola por baixo.
  const rowBg = expanded ? "bg-brand-soft" : zebra;

  const hasLogistics = hasLeg(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)
    || hasLeg(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)
    || row.needsAccommodation || row.needsTicket || !!row.observations || !!cidadeDaLinha(row);
  // "Sai de" (09/10): de onde a equipe da linha sai.
  const saiDe = cidadeDaLinha(row);

  return (
    // scroll-mb-16: ao focar por teclado, a linha não fica escondida atrás do rodapé fixo.
    <tr
      id={rowDomId(row.rowId)} data-row-id={row.rowId}
      data-estado={errors.length > 0 ? "erro" : warnings.length > 0 ? "aviso" : undefined}
      data-aberta={expanded || undefined}
      className={cn("sug-linha group scroll-mb-16 border-b border-border", rowBg)}
    >
      {/* Função: ponto de status + nome + área + pendência */}
      <td className={cn("z-10 border-r border-border px-3 py-1.5", FN_COL, rowBg)}>
        <div className="flex items-start gap-2">
          <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-5 text-foreground" title={row.functionName}>{row.functionName}</span>
            {area && <span className="block truncate text-2xs leading-4 text-muted-foreground" title={area}>{area}</span>}
            {issueText && (
              <span
                className={cn("block truncate text-2xs font-medium leading-4", errors.length > 0 ? "text-danger" : "text-warning")}
                title={[...errors, ...warnings].join("; ")}
              >
                {issueText}{issueExtra > 0 ? ` (+${issueExtra})` : ""}
              </span>
            )}
          </div>
        </div>
      </td>

      {headers.map((h, colIdx) => (
        <td key={h.ymd} className={cn("border-r border-border px-1 py-1.5 text-center", h.isWeekend && "sug-fds")}>
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

      <td className="border-l border-r border-border border-l-border px-2 py-1.5 text-center text-xs font-semibold tabular-nums leading-tight text-slate-700">
        {total > 0 ? (
          <>
            <span className="block text-[13px]">{total}</span>
            <span className="block text-2xs font-normal text-muted-foreground">{vagas} {vagas === 1 ? "vaga" : "vagas"}</span>
          </>
        ) : <span className="text-muted-foreground">–</span>}
      </td>

      {/* Logística e observação: chips de leitura (quebram em até duas linhas) + botão do painel */}
      <td className="border-r border-border px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="sug-chips flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <SaiDeChip cidade={saiDe} testId={`sug-chip-sai-de-${row.rowId}`} />
            <LegChip
              dir="ida" mode={row.transportModeIda} className="shrink-0"
              date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime}
            />
            <LegChip
              dir="volta" mode={row.transportModeVolta} className="shrink-0"
              date={row.flightReturnDate} time={row.flightReturnSuggestedTime}
            />
            <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} className="shrink-0" />
            {/* Só ida / só volta / trecho direto (09/10). */}
            {textoDaIndicacao(row, nomeDoEventoNoCache).map((t) => (
              <span key={t} className={cn(CHIP_NEED, "min-w-0 max-w-full font-medium")} title={t} data-testid={`sug-chip-trecho-${row.rowId}`}>
                <Route className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{t}</span>
              </span>
            ))}
            {row.observations && (
              <span className={cn(CHIP_NEUTRAL, "min-w-0 max-w-full")} title={row.observations}>
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
              "sug-alvo inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              expanded
                ? "border-primary/40 bg-card text-primary shadow-1"
                : hasLogistics
                  ? "sug-revela border-border bg-card text-slate-600 hover:border-primary/30 hover:text-primary"
                  : "border-dashed border-slate-300 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
            )}
          >
            {expanded ? <X className="h-3 w-3" aria-hidden="true" /> : <Pencil className="h-3 w-3" aria-hidden="true" />}
            {expanded ? "Fechar" : hasLogistics ? "Editar viagem" : "Definir viagem"}
          </button>
        </div>
      </td>

      <td className="w-[44px] px-1 py-1.5 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Ações da linha ${row.functionName}`} className="sug-alvo sug-revela h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => onDuplicateRow(row.rowId)}>
              <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Duplicar linha
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onRemoveRow(row.rowId)} className="text-destructive focus:bg-danger-soft focus:text-danger">
              <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Remover
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
 *
 * 07/10 (redesenho): a grade ocupa a altura da tela entre a barra do topo e a
 * barra de envio (antes eram 560px fixos — num notebook a grade começava
 * abaixo da dobra e terminava atrás da barra de envio); os dias do evento têm
 * um filete no cabeçalho (o resto é margem de montagem/desmontagem); a
 * logística quebra em duas linhas em vez de cortar o botão "Editar viagem"
 * para fora da tela; e a grade vazia oferece os três caminhos para começar.
 */
export function SuggestionGrid({
  rows, dates, issuesByRow, areaByFunctionId, onChangeRow, onChangeQty, onDuplicateRow, onRemoveRow,
  onPaste, onAddFunction, onCopyEvent, startDisabled, disabled, openRowId: openRowIdProp, onOpenRowChange, vagasTotal, eventStart, eventEnd, eventosParaTrecho,
}: SuggestionGridProps) {
  const evIni = eventStart?.slice(0, 10) ?? "";
  const evFim = eventEnd?.slice(0, 10) ?? "";
  const headers = useMemo<Header[]>(
    () => dates.map((ymd) => ({ ymd, ...formatDateHeader(ymd), doEvento: !!evIni && !!evFim && ymd >= evIni && ymd <= evFim })),
    [dates, evIni, evFim],
  );
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
  // Função (220) + dias (58) + Pessoas-dia (96) + Logística (mín. 300) + ações (44):
  // 5 dias cabem em ~1000px — sem rolagem horizontal num notebook de 1366px.
  const minWidth = 220 + dates.length * 58 + PD_COL + LOG_COL + 44;

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

  // ── Grade vazia: os três caminhos para começar (antes: tabela com cabeçalho e dois botões no meio) ──
  if (rows.length === 0) {
    const caminhos = [
      { key: "colar", Icon: ClipboardPaste, titulo: "Colar da planilha", texto: "Copie as linhas no Excel e cole — o formato é reconhecido sozinho.", onClick: onPaste, recomendado: true },
      ...(onCopyEvent ? [{ key: "copiar", Icon: FolderInput, titulo: "Copiar de outro evento", texto: "As vagas de um evento parecido viram linhas desta grade.", onClick: onCopyEvent, recomendado: false }] : []),
      { key: "adicionar", Icon: Plus, titulo: "Adicionar funções", texto: "Escolha as funções e preencha as quantidades dia a dia.", onClick: onAddFunction, recomendado: false },
    ];
    return (
      <div className="sug-entra rounded-xl border border-dashed border-slate-300 bg-card px-5 py-8 sm:px-8" data-testid="sug-grade-vazia">
        <p className="text-center text-[15px] font-semibold text-foreground">Nenhuma função na grade</p>
        <p className="mx-auto mt-1 max-w-[540px] text-center text-sm text-muted-foreground">Comece por um destes caminhos — dá para combinar os três depois.</p>
        <div className={cn("mx-auto mt-5 grid max-w-[860px] gap-2.5", caminhos.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
          {caminhos.map(({ key, Icon, titulo, texto, onClick, recomendado }) => (
            <button
              key={key} type="button" disabled={disabled || startDisabled} onClick={onClick}
              className={cn(
                "sug-caminho group/caminho flex items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                recomendado ? "border-primary/30 bg-brand-soft/50 hover:border-primary/50 hover:bg-brand-soft" : "border-border bg-card hover:border-primary/30 hover:bg-surface-muted/70",
              )}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", recomendado ? "bg-primary text-primary-foreground" : "bg-muted text-slate-600 group-hover/caminho:text-primary")} aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-foreground">
                  {titulo}
                  {recomendado && <span className="rounded-full bg-primary/10 px-1.5 py-px text-2xs font-semibold text-primary">mais rápido</span>}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{texto}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* `isolate`: os z-index das células grudadas ficam DENTRO da grade — sem isto o
          rodapé "Pessoas por dia" (z-30) atravessava a prévia da barra de envio. */}
      <div className="isolate overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
        <div className="sug-grade-rolagem overflow-auto">
          <table className="w-full text-sm" style={{ minWidth }}>
            <thead className="sticky top-0 z-20 bg-surface-muted">
              <tr>
                <th scope="col" className={cn(TH, "z-30 border-r-border bg-surface-muted px-3 text-left", FN_COL)}>Função</th>
                {headers.map((h) => (
                  <th
                    key={h.ymd} scope="col"
                    title={h.doEvento ? "Dia do evento" : evIni ? "Fora do período do evento (montagem/desmontagem)" : undefined}
                    className={cn(TH, "w-[58px] min-w-[58px]", h.isWeekend ? "bg-warning-soft text-warning" : "bg-surface-muted", h.doEvento && "sug-dia-evento")}
                  >
                    <div className={cn("leading-none", h.doEvento ? (h.isWeekend ? "text-warning" : "text-foreground") : undefined)}>{h.date}</div>
                    <div className={cn("mt-0.5 text-2xs font-normal normal-case tracking-normal", h.isWeekend ? "text-warning" : "text-muted-foreground")}>{h.dayName}</div>
                  </th>
                ))}
                <th scope="col" className={cn(TH, "border-l border-l-border bg-surface-muted")} style={{ width: PD_COL, minWidth: PD_COL }}>Pessoas-dia</th>
                <th scope="col" className={cn(TH, "text-left")} style={{ minWidth: LOG_COL }}>Logística e observação</th>
                <th scope="col" className={cn(TH, "w-[44px] border-r-0")}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
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
            <tfoot>
              <tr>
                <td className={cn("sticky bottom-0 z-30 border-t border-border bg-surface-muted px-3 py-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground", FN_COL)}>
                  Pessoas por dia
                </td>
                {headers.map((h) => {
                  const t = totals.byDay[h.ymd] || 0;
                  const isPeak = totals.peakDate === h.ymd && totals.peakTotal > 0;
                  return (
                    <td
                      key={h.ymd}
                      className={cn(
                        "sticky bottom-0 z-20 border-t border-border bg-surface-muted px-1 py-2 text-center text-xs tabular-nums",
                        isPeak ? "bg-brand-soft font-bold text-primary" : t > 0 ? "font-semibold text-slate-700" : "text-muted-foreground",
                      )}
                    >
                      {t > 0 ? t : "–"}
                    </td>
                  );
                })}
                <td className="sticky bottom-0 z-20 border-l border-t border-border border-l-border bg-surface-muted px-2 py-2 text-center text-xs font-bold tabular-nums leading-tight text-primary">
                  {totals.grand > 0 ? (
                    <>
                      <span className="block text-[13px]">{totals.grand}</span>
                      {vagasTotal !== undefined && (
                        <span className="block text-2xs font-normal text-muted-foreground">{vagasTotal} {vagasTotal === 1 ? "vaga" : "vagas"}</span>
                      )}
                    </>
                  ) : "–"}
                </td>
                <td colSpan={2} className="sticky bottom-0 z-20 border-t border-border bg-surface-muted px-3 py-2 text-2xs text-muted-foreground">
                  {totals.peakTotal > 0 ? (
                    <span className="whitespace-nowrap">
                      Pico em <span className="font-semibold text-primary">{dayText(totals.peakDate)}</span> · <span className="tabular-nums">{totals.peakTotal} {totals.peakTotal === 1 ? "pessoa" : "pessoas"}</span>
                    </span>
                  ) : (
                    <span className="whitespace-nowrap">Preencha as quantidades por dia.</span>
                  )}
                </td>
              </tr>
            </tfoot>
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
          className="sug-entra scroll-mb-36 overflow-hidden rounded-xl border border-primary/30 bg-card shadow-2 focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-brand-soft/70 px-4 py-2.5">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <Route className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="shrink-0 text-xs font-medium text-muted-foreground">Logística sugerida</span>
              <span className="text-muted-foreground" aria-hidden="true">·</span>
              <span className="truncate font-semibold text-foreground">{openRow.functionName}</span>
            </p>
            <button
              type="button"
              onClick={() => setOpenRowId(null)}
              aria-label={`Fechar logística de ${openRow.functionName}`}
              className="sug-alvo rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="px-4 py-3.5">
            <LogisticsPanel row={openRow} disabled={disabled} onChangeRow={onChangeRow} workDays={openRowWorkDays} eventos={eventosParaTrecho} />
          </div>
        </div>
      )}
    </div>
  );
}

export default SuggestionGrid;
