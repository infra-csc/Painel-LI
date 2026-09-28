/**
 * Lógica pura da grade função × dia usada pela Sugestão de Escala.
 *
 * Desde 25/09 este arquivo é só o BARRIL: a implementação foi dividida por
 * domínio em `./grid-utils/*` (datas, linhas, valores de planilha, layout da
 * colagem, parser, cópia de evento, validação), cada um com seu teste ao lado.
 * Os importadores continuam apontando para aqui — a API pública é a mesma.
 *
 * POR QUE NÃO REUSAR `components/forms/grid-team-inclusion-form.tsx` DIRETO:
 * aquele componente é um `export default` sem props — o estado da grade, o
 * formulário react-hook-form, o POST em /api/team-inclusions/bulk e o rascunho
 * ficam todos dentro dele. Parametrizá-lo (payload diferente, colunas extras de
 * modal/observação, endpoint diferente) exigiria mexer no comportamento da
 * Inclusão de Equipe. Então extraímos AQUI só a lógica mínima (lista de datas,
 * decomposição "1 registro por pessoa" e parser de colagem), fiel ao original.
 */
export {
  MAX_GRID_DAYS, MAX_READ_DAYS, PERIOD_MARGIN_DAYS,
  countDaysInclusive, buildDateList, buildReadDateList, periodProblem, PERIOD_PROBLEM_MESSAGES, periodBounds,
  toYmdLocal, addDaysYmd, formatDateHeader, expandPeriodForDates,
  type ReadDateList, type PeriodProblem, type DateHeader, type PeriodExpansion,
} from "./grid-utils/grid-dates";
export {
  QTY_MAX, sortFunctionsByOrder, countOutsidePeriod, emptyGridRow, reframeRows, sanitizeDraftRow, sanitizeDraftRows,
  decomposeGridRows, summarizeGrid, totalsByDay, pasteConflicts, mergePastedRows,
  type SuggestionGridRow, type SuggestionRecord, type DayTotalsSummary,
} from "./grid-utils/grid-rows";
export {
  normalizeStr, parseLongDateBr, parseSheetDate, parseShortDate, parseTimeHHMM, parsePtBrTime, parseTransportMode, parseYesNo,
  readQtyCell, functionNameKey, buildFunctionMatcher, isTimeCell, isLogisticaTimeCell,
} from "./grid-utils/paste-values";
export {
  findLogisticaHeader, resolveHeaderDate, hasLogisticaRowShape, classifyPasteColumns,
  type PasteOptions, type LogisticaHeader, type PasteConfidence, type PasteColumnMap, type PasteLayout,
} from "./grid-utils/paste-layout";
export {
  PASTE_FORMAT_LABELS, detectPasteFormat, parsePastedRows, summarizePaste,
  type PasteFormat, type PasteResult, type PasteSummary,
} from "./grid-utils/paste-parse";
export {
  copyLogisticsSignature, rowsFromSuggestions,
  type CopyableSuggestion, type CopyFromEventResult,
} from "./grid-utils/copy-from-event";
export { validateGridRow, legValue, type RowValidation } from "./grid-utils/grid-validation";
