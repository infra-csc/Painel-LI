/**
 * Colagem da planilha e "Copiar de evento" na Sugestão de escala (25/09 —
 * extraído da página).
 *
 * Nada entra na grade antes do "Aplicar": o resumo ao vivo só exibe. O fluxo
 * para antes quando falta decisão do usuário — mapear nome não reconhecido,
 * decidir dias fora do período, confirmar substituição de função já na grade.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event, Function as FunctionType } from "@shared/schema";
import { formatDayMonthBr } from "@/lib/dates";
import {
  buildDateList, detectPasteFormat, expandPeriodForDates, functionNameKey, mergePastedRows, parsePastedRows, pasteConflicts,
  PERIOD_MARGIN_DAYS, summarizePaste,
  type CopyFromEventResult, type PasteFormat, type SuggestionGridRow,
} from "@/components/scaling-validation/scaling-grid-utils";
import { PASTE_PREVIEW_DEBOUNCE_MS, SKIP_FUNCTION, plural, type PendingCopy, type PendingPaste, type PendingPasteDates } from "./suggestion-shared";
import type { SuggestionDraft } from "./use-suggestion-draft";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export interface UseSuggestionPasteArgs {
  draft: Pick<SuggestionDraft, "setRows" | "rowsRef" | "dates" | "applied" | "bounds" | "applyPeriod">;
  functions: FunctionType[] | undefined;
  selectedEvent: Event | undefined;
  userId: string | undefined;
  readOnly: boolean;
  presentFunctionIds: Set<string>;
  toast: Toast;
}

export function useSuggestionPaste({ draft, functions, selectedEvent, userId, readOnly, presentFunctionIds, toast }: UseSuggestionPasteArgs) {
  const { setRows, rowsRef, dates, applied, bounds, applyPeriod } = draft;
  const [showPaste, setShowPaste] = useState(false);
  const [showCopyEvent, setShowCopyEvent] = useState(false);
  const [pasteText, setPasteText] = useState("");
  /** Cópia atrasada de `pasteText`: é o que alimenta o resumo ao vivo. */
  const [pasteTextDebounced, setPasteTextDebounced] = useState("");
  const [pasteFormat, setPasteFormat] = useState<"auto" | PasteFormat>("auto");
  /** "Formatos aceitos" (com o Select de formato) — fechado por padrão. */
  const [showPasteHelp, setShowPasteHelp] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);
  const [pendingPasteDates, setPendingPasteDates] = useState<PendingPasteDates | null>(null);
  // Nomes da planilha que o catálogo não reconhece + a função escolhida à mão para cada um.
  const [unknownNames, setUnknownNames] = useState<string[]>([]);
  const [pasteNameMap, setPasteNameMap] = useState<Record<string, string>>({});
  const askedMappingRef = useRef(false); // só interrompe uma vez: no 2º clique, o que não foi mapeado é descartado
  const pasteUnknownRef = useRef<HTMLDivElement>(null);

  // ── Copiar de evento ──
  const commitCopy = useCallback((result: CopyFromEventResult, sourceName: string, replaced: number) => {
    setRows((prev) => mergePastedRows(prev, result.rows));
    setPendingCopy(null);
    toast({
      title: "Grade copiada",
      description: `${plural(result.rows.length, "linha", "linhas")} de ${sourceName} ${result.rows.length === 1 ? "entrou" : "entraram"} na grade${replaced ? `, ${plural(replaced, "função substituída", "funções substituídas")}` : ""} — revise as quantidades e a logística antes de enviar.`,
    });
  }, [toast, setRows]);
  const applyCopy = useCallback((result: CopyFromEventResult, sourceName: string) => {
    if (readOnly) return; // modo leitura não monta grade (nem conseguiria limpar depois)
    // Substituir linha já preenchida pede a MESMA confirmação da colagem.
    const conflicts = pasteConflicts(rowsRef.current, result.rows);
    if (conflicts.length > 0) { setPendingCopy({ result, sourceName, conflicts }); return; }
    commitCopy(result, sourceName, 0);
  }, [readOnly, commitCopy, rowsRef]);

  // ── Colagem ──
  // Debounce leve: só reanalisa a colagem quando o usuário para de digitar/colar.
  useEffect(() => {
    const t = setTimeout(() => setPasteTextDebounced(pasteText), PASTE_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pasteText]);
  const pasteYear = useMemo(
    () => (applied.start || selectedEvent?.startDate || String(new Date().getFullYear())).slice(0, 4),
    [applied.start, selectedEvent],
  );
  const detectedPaste = useMemo(
    () => (pasteTextDebounced.trim() ? detectPasteFormat(pasteTextDebounced, { dayCount: dates.length }) : null),
    [pasteTextDebounced, dates.length],
  );
  /** Resultado da leitura, ao vivo, só para exibição — nada é aplicado na grade aqui. */
  const pasteParsed = useMemo(() => {
    if (!showPaste || !pasteTextDebounced.trim()) return null;
    return parsePastedRows(
      pasteTextDebounced, functions ?? [], dates, pasteYear,
      pasteFormat === "auto" ? undefined : pasteFormat, { nameMap: pasteNameMap },
    );
  }, [showPaste, pasteTextDebounced, functions, dates, pasteYear, pasteFormat, pasteNameMap]);
  const pastePreview = useMemo(() => (pasteParsed ? summarizePaste(pasteParsed) : null), [pasteParsed]);
  /** Enquanto o debounce não alcança o texto, o resumo mostra "analisando". */
  const pasteAnalyzing = !!pasteText.trim() && pasteText !== pasteTextDebounced;
  /** Nomes a mapear: o que o resumo ao vivo achou (com o que `runPaste` apontou como reserva). */
  const unknownToMap = pastePreview ? pastePreview.unknownNames : unknownNames;
  const pasteApplyCount = pastePreview?.recognized ?? 0;
  // Nomes ainda SEM decisão (nem função, nem "descartar"): enquanto houver um,
  // o Aplicar não aplica — ele leva ao bloco âmbar. Antes o 1º clique virava um
  // toast vermelho e o 2º descartava em silêncio o que não foi mapeado.
  const pasteUndecided = useMemo(
    () => unknownToMap.filter((n) => !(functionNameKey(n) in pasteNameMap)),
    [unknownToMap, pasteNameMap],
  );
  const goToUnknownNames = () => {
    pasteUnknownRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    pasteUnknownRef.current?.querySelector<HTMLElement>("button[role='combobox']")?.focus({ preventScroll: true });
  };
  /** "Como vai entrar na grade": quantas linhas substituem funções já na grade × quantas são novas. */
  const pasteImpact = useMemo(() => {
    if (!pasteParsed) return { replaced: 0, added: 0 };
    const replaced = pasteParsed.rows.filter((r) => presentFunctionIds.has(r.functionId)).length;
    return { replaced, added: pasteParsed.rows.length - replaced };
  }, [pasteParsed, presentFunctionIds]);
  /**
   * Avisos do resumo: não impedem aplicar, mas o usuário precisa vê-los antes.
   * `detail` traz QUAIS dias/linhas: com até 3 o chip mostra inline, com mais
   * vai para o title — "2 dias fora do período" sem dizer quais não ajudava.
   */
  const pasteWarnings = useMemo(() => {
    if (!pastePreview) return [];
    const w: { text: string; detail?: string[] }[] = [];
    if (pastePreview.unknownNames.length > 0) w.push({ text: plural(pastePreview.unknownNames.length, "nome não reconhecido", "nomes não reconhecidos"), detail: pastePreview.unknownNames });
    if (pastePreview.outsideDays > 0) {
      w.push({ text: plural(pastePreview.outsideDays, "dia fora do período", "dias fora do período"), detail: (pasteParsed?.datesOutsideGrid ?? []).map((d) => formatDayMonthBr(d)) });
    }
    if (pastePreview.rowsWithoutQty > 0) {
      const semQtd = (pasteParsed?.rows ?? []).filter((r) => !Object.values(r.quantities).some((q) => q > 0)).map((r) => r.functionName);
      w.push({ text: plural(pastePreview.rowsWithoutQty, "linha sem quantidade", "linhas sem quantidade"), detail: semQtd });
    }
    // Avisos do classificador de colunas (ex.: dias alinhados pelo período por
    // falta da linha de datas) — já vêm prontos em pt-BR do parser.
    for (const msg of pastePreview.warnings ?? []) w.push({ text: msg });
    return w;
  }, [pastePreview, pasteParsed]);
  // O mapeamento manual de nomes é por usuário (o catálogo é o mesmo em todos os eventos).
  const nameMapKey = `scaling-suggestion-fnmap:${userId ?? "anon"}`;
  const readStoredNameMap = useCallback((): Record<string, string> => {
    try {
      const raw = localStorage.getItem(nameMapKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch { return {}; }
  }, [nameMapKey]);
  const storeNameMap = useCallback((map: Record<string, string>) => {
    try {
      if (Object.keys(map).length === 0) localStorage.removeItem(nameMapKey);
      else localStorage.setItem(nameMapKey, JSON.stringify(map));
    } catch { /* quota / storage indisponível */ }
  }, [nameMapKey]);

  const openPaste = () => {
    setPasteNameMap(readStoredNameMap()); // reaproveita o que o usuário já mapeou antes
    setUnknownNames([]);
    setPasteText(""); setPasteTextDebounced(""); setShowPasteHelp(false);
    askedMappingRef.current = false;
    setShowPaste(true);
  };
  const closePaste = () => {
    setShowPaste(false); setPasteText(""); setPasteTextDebounced(""); setPasteFormat("auto");
    setUnknownNames([]); setPendingPasteDates(null); setShowPasteHelp(false);
    askedMappingRef.current = false;
  };
  const commitPaste = (pasted: SuggestionGridRow[], skippedNames: string[], replaced: number) => {
    setRows((prev) => mergePastedRows(prev, pasted));
    setPendingPaste(null);
    closePaste();
    toast({
      title: "Linhas coladas",
      description: `${plural(pasted.length, "linha aplicada", "linhas aplicadas")}${replaced ? `, ${plural(replaced, "função substituída", "funções substituídas")}` : ""}.${skippedNames.length ? ` Não encontradas: ${skippedNames.join(", ")}.` : ""}`,
      variant: skippedNames.length ? "destructive" : "default",
    });
  };

  /**
   * Lê a colagem contra um conjunto de dias e aplica — parando antes quando ainda
   * falta uma decisão do usuário: (1) mapear nomes não reconhecidos, (2) decidir o
   * que fazer com os dias fora do período, (3) confirmar a substituição de funções.
   */
  const runPaste = (targetDates: string[], nameMap: Record<string, string>, allowOutside: boolean) => {
    const res = parsePastedRows(pasteText, functions ?? [], targetDates, pasteYear, pasteFormat === "auto" ? undefined : pasteFormat, { nameMap });
    if (res.problem === "cabecalho-nao-encontrado") {
      toast({
        title: "Cabeçalho não encontrado",
        description: "No formato da logística é preciso colar também a linha de cabeçalho (ida, chegada, retorno e as colunas de dia).",
        variant: "destructive",
      });
      return;
    }
    // "Decidido" = o nome tem entrada no mapa, inclusive quando a escolha foi
    // "Descartar linha" (SKIP_FUNCTION). Só o que continua sem decisão interrompe.
    const undecided = res.unknownNames.filter((n) => !(functionNameKey(n) in nameMap));
    if (undecided.length > 0 && !askedMappingRef.current) {
      askedMappingRef.current = true;
      setUnknownNames(res.unknownNames);
      toast({
        title: plural(undecided.length, "função não reconhecida", "funções não reconhecidas"),
        description: "Escolha a função correspondente de cada nome abaixo e aplique de novo. O que ficar sem função é descartado.",
        variant: "destructive",
      });
      return;
    }
    if (!allowOutside && res.datesOutsideGrid.length > 0) {
      setPendingPasteDates({ dates: res.datesOutsideGrid, expansion: expandPeriodForDates(applied, res.datesOutsideGrid, bounds) });
      return;
    }
    if (res.rows.length === 0) {
      toast({
        title: "Nenhuma linha reconhecida",
        description: res.skippedNames.length ? `Funções não encontradas: ${res.skippedNames.join(", ")}.` : "Verifique o formato (colunas separadas por TAB).",
        variant: "destructive",
      });
      return;
    }
    storeNameMap(nameMap); // o mapeamento usado com sucesso vale para as próximas colagens
    const conflicts = pasteConflicts(rowsRef.current, res.rows);
    if (conflicts.length > 0) { setPendingPaste({ rows: res.rows, skippedNames: res.skippedNames, conflicts, format: res.format }); return; }
    commitPaste(res.rows, res.skippedNames, 0);
  };

  const applyPaste = () => {
    if (!pasteText.trim()) {
      toast({ title: "Nada para colar", description: "Cole as linhas da planilha primeiro.", variant: "destructive" });
      return;
    }
    runPaste(dates, pasteNameMap, false);
  };
  /** Amplia a grade para cobrir os dias da planilha e relê a colagem já no novo período. */
  const acceptPasteExpansion = () => {
    const exp = pendingPasteDates?.expansion;
    setPendingPasteDates(null);
    if (!exp || !exp.changed) { runPaste(dates, pasteNameMap, true); return; }
    applyPeriod(exp.start, exp.end);
    runPaste(buildDateList(exp.start, exp.end), pasteNameMap, true);
    if (exp.ignored.length > 0) {
      toast({
        title: "Alguns dias ficaram de fora",
        description: `${exp.ignored.map((d) => formatDayMonthBr(d)).join(", ")} — a grade só pode ir até ${PERIOD_MARGIN_DAYS} dias antes/depois do evento.`,
        variant: "destructive",
      });
    }
  };
  /** Mantém o período e cola assim mesmo: as quantidades dos dias de fora são ignoradas. */
  const rejectPasteExpansion = () => {
    const ignored = pendingPasteDates?.dates ?? [];
    setPendingPasteDates(null);
    runPaste(dates, pasteNameMap, true);
    if (ignored.length > 0) {
      toast({
        title: "Dias ignorados na colagem",
        description: `${ignored.map((d) => formatDayMonthBr(d)).join(", ")} ${ignored.length === 1 ? "ficou" : "ficaram"} fora do período da grade.`,
        variant: "destructive",
      });
    }
  };
  /**
   * Registra a decisão do usuário para um nome não reconhecido. "Descartar linha"
   * também é decisão: fica gravada como SKIP_FUNCTION (nenhuma função tem esse id,
   * então o parser continua ignorando o nome) para o Aplicar não perguntar de novo.
   */
  const mapUnknownName = (name: string, value: string) => {
    const key = functionNameKey(name);
    setPasteNameMap((prev) => ({ ...prev, [key]: value }));
  };
  /** Atalho para quem só quer as linhas conhecidas: decide "descartar" para todas as pendentes de uma vez. */
  const descartarPendentes = () => {
    setPasteNameMap((prev) => { const next = { ...prev }; for (const n of pasteUndecided) next[functionNameKey(n)] = SKIP_FUNCTION; return next; });
  };
  /**
   * Desfazer um mapeamento salvo (11/09). "ceno" entrava como "Montagem" e o
   * dono não achava por quê: um mapa antigo, invisível, mandava em toda
   * colagem. Grava na hora — senão o mapa velho voltava ao reabrir o diálogo.
   */
  const removerMapeamento = (key: string) => {
    setPasteNameMap((prev) => { const next = { ...prev }; delete next[key]; storeNameMap(next); return next; });
  };
  const limparMapeamentos = () => { setPasteNameMap({}); storeNameMap({}); };
  const nomeDoMapeamento = (id: string) => (id === SKIP_FUNCTION ? "Descartar linha" : (functions ?? []).find((f) => f.id === id)?.name ?? "função que não existe mais");
  /** Mudou o conteúdo colado → os nomes não reconhecidos são perguntados de novo. */
  const changePasteText = (v: string) => { setPasteText(v); askedMappingRef.current = false; };

  return {
    showPaste, showCopyEvent, setShowCopyEvent, openPaste, closePaste,
    pasteText, changePasteText, pasteFormat, setPasteFormat, showPasteHelp, setShowPasteHelp,
    pasteAnalyzing, pastePreview, pasteParsed, detectedPaste, pasteWarnings, pasteImpact,
    unknownToMap, pasteUndecided, pasteNameMap, pasteApplyCount, pasteUnknownRef, goToUnknownNames,
    mapUnknownName, descartarPendentes, removerMapeamento, limparMapeamentos, nomeDoMapeamento,
    applyPaste, acceptPasteExpansion, rejectPasteExpansion,
    pendingPaste, setPendingPaste, commitPaste, pendingCopy, setPendingCopy, commitCopy, applyCopy,
    pendingPasteDates, setPendingPasteDates,
  };
}

export type SuggestionPaste = ReturnType<typeof useSuggestionPaste>;
