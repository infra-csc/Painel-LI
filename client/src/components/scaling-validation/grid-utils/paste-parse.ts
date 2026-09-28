/**
 * Parser de colagem da planilha (25/09 — extraído de scaling-grid-utils.ts):
 * detecção do formato, leitura dos três formatos e o resumo ao vivo do diálogo.
 *
 * Formatos aceitos na colagem (colunas separadas por TAB):
 * - "grade"     : Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta |
 *                 Hora embarque | Hotel | Passagem | Observação | qtd dia 1 | qtd dia 2 | …
 * - "briefing"  : Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta |
 *                 Hora embarque | Hotel | qtd dia 1 | qtd dia 2 | …   (sem Passagem/Observação)
 * - "logistica" : a planilha real da logística — ver `findLogisticaHeader`. Aqui as
 *                 colunas NÃO têm posição fixa: são lidas pelo CABEÇALHO.
 *
 * Nos dois primeiros as quantidades seguem a ORDEM das colunas de dia da grade.
 */
import { PERIOD_MARGIN_DAYS, addDaysYmd } from "./grid-dates";
import { emptyGridRow, type SuggestionGridRow } from "./grid-rows";
import {
  SMALL_INT_RE, YESNO_TOKENS, buildFunctionMatcher, dedupe, isHeaderLine, isQtyToken, normalizeStr,
  parsePtBrTime, parseSheetDate, parseShortDate, parseTimeHHMM, parseTransportMode, parseYesNo, readQtyCell, splitCols,
} from "./paste-values";
import {
  classifyPasteColumns, findLogisticaHeader, hasLogisticaRowShape,
  type PasteColumnMap, type PasteConfidence, type PasteLayout, type PasteOptions,
} from "./paste-layout";

export type PasteFormat = "grade" | "briefing" | "logistica";
export const PASTE_FORMAT_LABELS: Record<PasteFormat, string> = {
  grade: "Formato completo (com Passagem e Observação)",
  briefing: "Formato do briefing (Hotel e depois as quantidades)",
  logistica: "Planilha da logística (com ou sem a linha de datas)",
};
const QTY_COL_START: Record<"grade" | "briefing", number> = { grade: 10, briefing: 8 };

export interface PasteResult {
  rows: SuggestionGridRow[];
  /** Nomes de função não encontrados no catálogo, na ordem de leitura (pode repetir). */
  skippedNames: string[];
  /** Os mesmos nomes, sem repetição — é o que o diálogo oferece para mapear à mão. */
  unknownNames: string[];
  /**
   * Datas de coluna que a planilha traz COM quantidade mas estão fora do período
   * da grade. Só é preenchido no formato "logistica" (é o único que sabe a data de
   * cada coluna). Dias vazios fora do período não entram aqui — não há o que perder.
   */
  datesOutsideGrid: string[];
  /**
   * Células de quantidade cujo valor aplicado NÃO é o que estava escrito: texto
   * coagido pelo parseInt ("2x" → 2, "abc" → 0) ou número clampado pelo teto
   * (`QTY_MAX`) / pelo piso 0. O resumo transforma isso num aviso visível —
   * ajustar em silêncio esconderia diferenças entre a planilha e a grade.
   */
  adjustedQtyCells: number;
  /** Formato efetivamente usado (detectado ou forçado). */
  format: PasteFormat;
  /** true quando havia cabeçalho e ele foi ignorado. */
  hadHeader: boolean;
  /**
   * true quando a planilha da logística veio SEM a linha de datas e os dias foram
   * alinhados pela ordem do período da grade (ver `alignHeaderlessDayColumns`).
   * É um palpite: a tela DEVE avisar antes de aplicar, com algo como
   * "Sem a linha de datas — os dias foram alinhados pelo período da grade
   * (dd/mm a dd/mm). Confira antes de aplicar."
   *
   * Onde ligar isso na tela (`client/src/pages/scaling-suggestion.tsx`): no bloco do
   * preview da colagem, ao lado de `PASTE_FORMAT_LABELS[pastePreview.format]` /
   * `pastePreview.hadHeader` (hoje por volta da linha 986) — `summarizePaste` já
   * repassa o mesmo campo em `PasteSummary.alignedWithoutHeader`, e o período
   * (dd/mm a dd/mm) sai das `targetDates` que a própria tela já tem.
   */
  alignedWithoutHeader: boolean;
  /**
   * O que a leitura entendeu de cada coluna (só no formato "logistica", que é o
   * que passa pelo classificador): mapa papel → índice, de onde vieram as datas
   * dos dias, confiança e avisos prontos para exibir. Ver `PasteLayout`.
   */
  layout?: PasteLayout;
  /** Por que a leitura não produziu nada (quando aplicável). */
  problem?: "cabecalho-nao-encontrado";
}

/** Linha só com o nome da função e mais nada: não é vaga nenhuma, é resto de planilha. */
const isEmptyDataRow = (cols: string[], colFunction: number) =>
  cols.every((c, i) => i === colFunction || !c.trim());

function parseLogisticaText(
  text: string,
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
  options?: PasteOptions,
): PasteResult {
  const grid = text.replace(/\r/g, "").split("\n").map(splitCols);
  // Sem cabeçalho E sem nenhuma linha com a cara da planilha, não há o que ler:
  // avisar é melhor do que inventar colunas a partir de um texto qualquer.
  if (!findLogisticaHeader(grid) && !hasLogisticaRowShape(grid)) {
    return {
      rows: [], skippedNames: [], unknownNames: [], datesOutsideGrid: [], adjustedQtyCells: 0,
      format: "logistica", hadHeader: false, alignedWithoutHeader: false, problem: "cabecalho-nao-encontrado",
    };
  }
  const layout = classifyPasteColumns(grid, functions, dates, defaultYear, options);
  const cols3 = layout.columns;
  const inGrid = new Set(dates);
  const match = buildFunctionMatcher(functions, options?.nameMap);
  const cell = (cols: string[], idx: number) => (idx >= 0 ? (cols[idx] ?? "").trim() : "");
  const headerLines = new Set(layout.headerLines);
  const lastDayCol = cols3.dias.length ? cols3.dias[cols3.dias.length - 1].index : -1;
  const lastDate = dates.length ? dates[dates.length - 1] : "";

  const rows: SuggestionGridRow[] = [];
  const skippedNames: string[] = [];
  const outside = new Set<string>();
  let adjustedQtyCells = 0;
  for (let i = 0; i < grid.length; i++) {
    if (headerLines.has(i)) continue;
    const cols = grid[i];
    const name = cell(cols, cols3.funcao);
    if (!name || isHeaderLine(cols)) continue;
    // Linha sem viagem e sem nenhuma quantidade não vira vaga — e também não é
    // "nome não reconhecido": a planilha só listou a função e deixou tudo em branco.
    if (isEmptyDataRow(cols, cols3.funcao)) continue;
    const func = match(name);
    if (!func) { skippedNames.push(name); continue; }

    const row = emptyGridRow(func.id, func.name, dates, `${func.id}-paste-${Date.now()}-${i}`);
    row.flightDepartureDate = parseSheetDate(cell(cols, cols3.dataIda), defaultYear);
    row.flightArrivalSuggestedTime = parsePtBrTime(cell(cols, cols3.horaChegada));
    row.flightReturnDate = parseSheetDate(cell(cols, cols3.dataVolta), defaultYear);
    row.flightReturnSuggestedTime = parsePtBrTime(cell(cols, cols3.horaRetorno));
    row.observations = cell(cols, cols3.obs);
    // Sem coluna de hotel na planilha, vaga com VIAGEM entra com hotel marcado
    // (regra do dono, 28/08). Com a coluna presente, ela manda.
    row.needsAccommodation = cols3.hotel >= 0
      ? parseYesNo(cell(cols, cols3.hotel))
      : !!(row.needsTicket || row.transportModeIda || row.transportModeVolta || row.flightDepartureDate || row.flightReturnDate);
    // Quando a planilha não tem coluna de passagem, quem viaja (tem data de ida ou
    // de volta) precisa de passagem; as linhas "local" ficam sem nada. Hotel e os
    // modais de ida/volta continuam em branco, para preencher na grade.
    row.needsTicket = cols3.passagem >= 0
      ? parseYesNo(cell(cols, cols3.passagem))
      : !!(row.flightDepartureDate || row.flightReturnDate);

    for (const dc of cols3.dias) {
      const q = readQtyCell(cell(cols, dc.index));
      if (q.adjusted) adjustedQtyCells++;
      if (q.value <= 0) continue;
      if (inGrid.has(dc.date)) row.quantities[dc.date] = q.value;
      else outside.add(dc.date); // fora do período: a tela oferece ampliar a grade
    }
    // Sem as datas do cabeçalho, um número DEPOIS do bloco de dias só pode ser um
    // dia seguinte ao fim da grade (até onde a grade conseguiria ampliar).
    if (layout.alignedWithoutHeader && lastDayCol >= 0 && lastDate) {
      for (let j = lastDayCol + 1; j < cols.length; j++) {
        const raw = (cols[j] ?? "").trim();
        if (!raw || !SMALL_INT_RE.test(raw)) continue;
        const offset = j - lastDayCol;
        if (parseInt(raw, 10) > 0 && offset <= PERIOD_MARGIN_DAYS) outside.add(addDaysYmd(lastDate, offset));
      }
    }
    rows.push(row);
  }
  return {
    rows, skippedNames, unknownNames: dedupe(skippedNames),
    datesOutsideGrid: Array.from(outside).sort(),
    adjustedQtyCells,
    format: "logistica",
    hadHeader: layout.headerLines.length > 0,
    alignedWithoutHeader: layout.alignedWithoutHeader,
    layout,
  };
}

/**
 * Detecta o formato da colagem, nesta ordem:
 *
 * 0. Cabeçalho da planilha da logística (1ª coluna vazia + colunas de dia/rótulos
 *    de viagem) → "logistica". Vem antes porque esse formato não tem posição fixa.
 * 0b. FORMA das linhas de dados (data por extenso na 2ª/4ª coluna ou horário com
 *    "h" na 3ª/5ª) → "logistica" sem cabeçalho. Também vem antes de tudo: colar só
 *    as linhas de dados é o normal de quem seleciona no Excel, e sem essa regra a
 *    planilha caía em "briefing" e os dias saíam trocados EM SILÊNCIO.
 * 1. Cabeçalho reconhecido → decide pelas colunas "Passagem"/"Observação".
 * 2. Texto livre na 10ª coluna, ou sim/não por extenso na 9ª → formato da grade.
 * 3. POSIÇÃO das colunas (só quando o nº de dias da grade é conhecido): vence o
 *    formato cujo total de colunas depois do bloco fixo bate EXATAMENTE com o nº
 *    de dias — briefing = 8 colunas fixas, grade = 10. É o que desempata a grade
 *    de 1 dia, em que a quantidade "0"/"1" é indistinguível de um sim/não.
 * 4. Quantidade inequívoca (número ≥ 2 na 9ª coluna, ou número na 10ª) → briefing.
 * 5. Linhas curtas: se nenhuma linha alcança a 11ª coluna e da 9ª em diante só há
 *    números, ler como "grade" não produziria quantidade nenhuma → briefing.
 * 6. Nada disso → grade (formato completo, o padrão da tela).
 */
export function detectPasteFormat(text: string, options?: { dayCount?: number }): { format: PasteFormat; hadHeader: boolean } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { format: "grade", hadHeader: false };
  const grid = lines.map(splitCols);
  if (findLogisticaHeader(grid)) return { format: "logistica", hadHeader: true }; // (0)
  if (hasLogisticaRowShape(grid)) return { format: "logistica", hadHeader: false }; // (0b)
  const first = splitCols(lines[0]);
  if (isHeaderLine(first)) {
    const norm = first.map(normalizeStr);
    const hasGradeCols = norm.some((c) => c.startsWith("passagem") || c.startsWith("observ"));
    return { format: hasGradeCols ? "grade" : "briefing", hadHeader: true };
  }

  let maxCols = 0;
  let sawQty = false; // número que não pode ser sim/não
  let tailAllNumeric = true; // da 9ª coluna em diante só há números (ou vazios)
  for (const line of lines) {
    const cols = splitCols(line);
    maxCols = Math.max(maxCols, cols.length);
    const c8 = cols[8] ?? "", c9 = cols[9] ?? "";
    // (2) Observação com texto livre ou Passagem com sim/não explícito → formato da grade.
    if ((c9 && !isQtyToken(c9)) || (c8 && !isQtyToken(c8) && YESNO_TOKENS.has(normalizeStr(c8)))) return { format: "grade", hadHeader: false };
    if ((c8 && !YESNO_TOKENS.has(normalizeStr(c8)) && isQtyToken(c8)) || (c9 && isQtyToken(c9))) sawQty = true;
    for (let j = QTY_COL_START.briefing; j < cols.length; j++) if (cols[j] && !isQtyToken(cols[j])) tailAllNumeric = false;
  }

  // (3) Desempate por posição — só quando um formato encaixa e o outro não.
  const dayCount = options?.dayCount ?? 0;
  if (dayCount > 0) {
    const briefingFits = maxCols - QTY_COL_START.briefing === dayCount;
    const gradeFits = maxCols - QTY_COL_START.grade === dayCount;
    if (briefingFits && !gradeFits && tailAllNumeric) return { format: "briefing", hadHeader: false };
    if (gradeFits && !briefingFits) return { format: "grade", hadHeader: false };
  }

  if (sawQty) return { format: "briefing", hadHeader: false }; // (4)
  // (5) No formato da grade não sobraria NENHUMA coluna de dia.
  if (tailAllNumeric && maxCols > QTY_COL_START.briefing && maxCols <= QTY_COL_START.grade) return { format: "briefing", hadHeader: false };
  return { format: "grade", hadHeader: false }; // (6)
}

export function parsePastedRows(
  text: string,
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
  forcedFormat?: PasteFormat,
  options?: PasteOptions,
): PasteResult {
  const rows: SuggestionGridRow[] = [];
  const skippedNames: string[] = [];
  // O nº de dias da grade é o melhor desempate quando "0"/"1" pode ser quantidade ou sim/não.
  const detected = detectPasteFormat(text, { dayCount: dates.length });
  const format = forcedFormat ?? detected.format;
  if (format === "logistica") return parseLogisticaText(text, functions, dates, defaultYear, options);
  const qtyStart = QTY_COL_START[format];
  const lines = text.trim().split(/\r?\n/);
  const match = buildFunctionMatcher(functions, options?.nameMap);
  let headerSkipped = false;
  let adjustedQtyCells = 0;
  const seenHeaderLines = new Set<string>();
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cols = splitCols(line);
    if (isHeaderLine(cols)) {
      const headerKey = cols.join("\t");
      if (!headerSkipped && rows.length === 0 && skippedNames.length === 0) {
        headerSkipped = true;
        seenHeaderLines.add(headerKey);
        return;
      }
      // Cabeçalho REPETIDO no meio do texto (duas colagens emendadas): pular de
      // novo, em vez de devolvê-lo como "função não reconhecida".
      if (seenHeaderLines.has(headerKey)) return;
    }
    const name = cols[0];
    if (!name) return;
    const func = match(name);
    if (!func) { skippedNames.push(name); return; }
    const row = emptyGridRow(func.id, func.name, dates, `${func.id}-paste-${Date.now()}-${i}`);
    row.transportModeIda = parseTransportMode(cols[1] ?? "");
    row.flightDepartureDate = parseShortDate(cols[2] ?? "", defaultYear);
    row.flightArrivalSuggestedTime = parseTimeHHMM(cols[3] ?? "");
    row.transportModeVolta = parseTransportMode(cols[4] ?? "");
    row.flightReturnDate = parseShortDate(cols[5] ?? "", defaultYear);
    row.flightReturnSuggestedTime = parseTimeHHMM(cols[6] ?? "");
    row.needsAccommodation = parseYesNo(cols[7] ?? "");
    if (format === "grade") {
      row.needsTicket = parseYesNo(cols[8] ?? "");
      row.observations = cols[9] ?? "";
    }
    for (let j = qtyStart; j < cols.length && j - qtyStart < dates.length; j++) {
      const q = readQtyCell(cols[j] ?? "");
      if (q.adjusted) adjustedQtyCells++;
      row.quantities[dates[j - qtyStart]] = q.value;
    }
    rows.push(row);
  });
  return {
    rows, skippedNames, unknownNames: dedupe(skippedNames), datesOutsideGrid: [], adjustedQtyCells,
    format, hadHeader: headerSkipped, alignedWithoutHeader: false,
  };
}

/** Resumo legível de uma colagem — o que o diálogo mostra ao vivo antes de aplicar. */
export interface PasteSummary {
  format: PasteFormat;
  hadHeader: boolean;
  /** Linhas de dados consideradas na leitura (reconhecidas + não reconhecidas). */
  lines: number;
  /** Linhas cuja função foi encontrada no catálogo (é o que seria aplicado). */
  recognized: number;
  /** Nomes que o catálogo não reconheceu, sem repetição. */
  unknownNames: string[];
  /** Dias distintos da grade que vieram com quantidade > 0. */
  mappedDays: number;
  /** Dias com quantidade que caem fora do período da grade (só no formato da logística). */
  outsideDays: number;
  /** Linhas reconhecidas que não trouxeram nenhuma quantidade. */
  rowsWithoutQty: number;
  /** Células de quantidade coagidas ("2x" → 2) ou clampadas pelo teto — ver `PasteResult.adjustedQtyCells`. */
  adjustedQtyCells: number;
  /**
   * Planilha da logística colada SEM a linha de datas: os dias foram alinhados
   * pela ordem do período da grade. A tela deve avisar antes de aplicar — ver o
   * comentário em `PasteResult.alignedWithoutHeader`.
   */
  alignedWithoutHeader: boolean;
  /** Quanta certeza a leitura tem do mapa de colunas (só no formato "logistica"). */
  confidence?: PasteConfidence;
  /** Avisos prontos para exibir (pt-BR) — inclui o do alinhamento sem cabeçalho. */
  warnings: string[];
  /** Mapa papel → coluna, para a tela mostrar o que foi entendido. */
  columns?: PasteColumnMap;
  /** Repassa o problema estrutural da leitura (ex.: cabeçalho da logística ausente). */
  problem?: PasteResult["problem"];
}

/** Conta o que a leitura produziu, sem tocar na grade (função pura, usada no preview do diálogo). */
export function summarizePaste(res: PasteResult): PasteSummary {
  const days = new Set<string>();
  let rowsWithoutQty = 0;
  for (const row of res.rows) {
    let hasQty = false;
    for (const [date, qty] of Object.entries(row.quantities)) {
      if (qty > 0) { days.add(date); hasQty = true; }
    }
    if (!hasQty) rowsWithoutQty += 1;
  }
  // Ajuste silencioso de quantidade ("2x" → 2, clamp no teto) vira aviso visível.
  const warnings = [...(res.layout?.warnings ?? [])];
  if (res.adjustedQtyCells > 0) {
    warnings.push(`${res.adjustedQtyCells} célula(s) de quantidade foram ajustadas — confira`);
  }
  return {
    format: res.format,
    hadHeader: res.hadHeader,
    lines: res.rows.length + res.skippedNames.length,
    recognized: res.rows.length,
    unknownNames: res.unknownNames,
    mappedDays: days.size,
    outsideDays: res.datesOutsideGrid.length,
    rowsWithoutQty,
    adjustedQtyCells: res.adjustedQtyCells,
    alignedWithoutHeader: res.alignedWithoutHeader,
    confidence: res.layout?.confidence,
    warnings,
    columns: res.layout?.columns,
    problem: res.problem,
  };
}
