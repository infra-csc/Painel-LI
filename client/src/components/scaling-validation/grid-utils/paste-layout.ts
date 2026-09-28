/**
 * Classificador de colunas da planilha da logística (25/09 — extraído de
 * scaling-grid-utils.ts).
 *
 * A planilha da logística muda de evento para evento: às vezes os rótulos e as
 * datas estão na mesma linha do cabeçalho, às vezes em linhas separadas; às vezes
 * há uma coluna vazia entre o bloco de viagem e os dias, às vezes duas; e muita
 * gente cola só as LINHAS DE DADOS, sem cabeçalho nenhum. Por isso a leitura não
 * conta colunas: ela CLASSIFICA cada coluna pelo conteúdo, e usa o cabeçalho só
 * como reforço.
 *
 * O rito é:
 * 1. separar as linhas de CABEÇALHO (as primeiras sem nenhuma função reconhecível)
 *    das linhas de DADOS;
 * 2. montar o perfil de cada coluna olhando TODAS as linhas de dados (quantas
 *    células são vazias, nome de função, data, horário, inteiro pequeno, sim/não
 *    ou texto livre) e somar os rótulos que o cabeçalho der àquela coluna,
 *    combinando TODAS as linhas de cabeçalho (uma pode ter as datas e outra os
 *    rótulos);
 * 3. atribuir os papéis por maior evidência: função → datas de viagem → horários →
 *    hotel/passagem → dias → observação.
 *
 * O que a leitura entendeu volta em `PasteResult.layout` para a tela mostrar.
 */
import {
  HEADER_FUNCTION_RE, SMALL_INT_RE, buildFunctionMatcher, isHeaderLine, isLogisticaTimeCell, isTimeCell,
  normalizeStr, parseLongDateBr, parseSheetDate, parseShortDate,
} from "./paste-values";

export interface PasteOptions {
  /**
   * Mapeamento manual de nomes que o catálogo não reconhece:
   * { chave de `functionNameKey(nome colado)` → id da função }.
   */
  nameMap?: Record<string, string>;
}

// ── Formato "logistica": a planilha real usada pela logística ────────────────

/**
 * Mapa das colunas da planilha da logística. Tudo é índice de coluna descoberto
 * NO CABEÇALHO (-1 = coluna ausente) porque essa planilha tem colunas vazias de
 * separação entre o bloco de viagem e o bloco de dias — qualquer contagem fixa
 * de posição erraria. As quantidades também são lidas pela DATA da coluna, não
 * pela ordem.
 *
 * Layout típico (a 1ª linha do arquivo é o título livre do evento e é ignorada):
 *
 *   (vazio) | ida | chegada (até...) | retorno | horario do retorno (a partir) |
 *   (vazio) | 08/set | 09/set | … | (vazias) | obs
 *
 * Semântica das duas colunas de horário:
 * - "chegada (até...)"              → horário de DESEMBARQUE da ida.
 * - "horario do retorno (a partir)" → horário de EMBARQUE da volta.
 */
export interface LogisticaHeader {
  /**
   * Índice da PRIMEIRA linha do bloco de cabeçalho dentro do texto colado. O bloco
   * pode ter mais de uma linha (ver `findLogisticaHeader`): as seguintes têm a 1ª
   * coluna vazia e, por isso, já são puladas na leitura dos dados.
   */
  lineIndex: number;
  colFunction: number;
  colDepartureDate: number;
  colArrivalTime: number;
  colReturnDate: number;
  colReturnTime: number;
  colObs: number;
  /** Colunas de dia na ordem da planilha (a data é resolvida depois, com a grade). */
  dayColumns: { index: number; raw: string }[];
}

/** Quantas linhas do topo podem conter o cabeçalho (título do evento costuma vir antes). */
const LOGISTICA_SCAN_LINES = 6;

/** "08/set", "08/09", "08/09/2026" — rótulo de coluna de dia (já normalizado). */
const DAY_HEADER_RE = /^\d{1,2}\s*[/\-.]\s*([a-z]{3,}\.?|\d{1,2})(\s*[/\-.]\s*\d{2,4})?$/;
const isDayHeaderCell = (normalized: string) =>
  DAY_HEADER_RE.test(normalized) && parseShortDate(normalized, "2000") !== "";

/**
 * Acha e mapeia o cabeçalho da planilha da logística nas primeiras linhas.
 *
 * O cabeçalho pode ocupar MAIS DE UMA LINHA — cada planilha do time monta de um
 * jeito, e as duas reais que chegaram são diferentes:
 *
 *   A) rótulos e datas na MESMA linha, e embaixo a linha de dias da semana:
 *      `| ida | chegada (até...) | retorno | horario do retorno | (vazia) | 08/set | 09/set | …`
 *      `|     |                  |         |                    |         | ter    | qua    | …`
 *   B) datas em uma linha e rótulos na linha SEGUINTE (com os dias da semana junto):
 *      `|     |                  |         |                    | (vazias) | 14/out | 15/out | … | obs`
 *      `| ida | chegada (até...) | retorno | horario do retorno | (vazias) | qua    | qui    | …`
 *
 * Por isso as linhas candidatas são COMBINADAS num mapa único: cada uma contribui
 * com o que souber (rótulos de viagem, colunas de data, coluna de observação) e a
 * primeira a definir cada coluna manda. A linha de dias da semana (ter/qua/qui…)
 * entra na varredura e simplesmente não contribui com nada.
 *
 * Só entram na combinação as linhas que (para NÃO confundir com os formatos
 * "grade"/"briefing", cujo cabeçalho começa com "Função"):
 * - têm a 1ª coluna VAZIA (é a coluna dos nomes de função, sem rótulo); e
 * - têm ≥ 3 colunas.
 * O resultado só vale se somar ≥ 2 colunas com data curta OU ≥ 2 rótulos de viagem.
 *
 * `lineIndex` é a PRIMEIRA linha aproveitada; as demais linhas do bloco são puladas
 * na leitura dos dados porque a 1ª coluna delas é vazia.
 */
export function findLogisticaHeader(grid: string[][]): LogisticaHeader | null {
  const limit = Math.min(grid.length, LOGISTICA_SCAN_LINES);
  const h: LogisticaHeader = {
    lineIndex: -1, colFunction: 0,
    colDepartureDate: -1, colArrivalTime: -1, colReturnDate: -1, colReturnTime: -1, colObs: -1,
    dayColumns: [],
  };
  let labels = 0;
  const takenDayColumns = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const cols = grid[i];
    if (cols.length < 3) continue;
    if ((cols[0] ?? "").trim() !== "") continue; // a coluna da função não tem rótulo
    const before = { labels, days: h.dayColumns.length, obs: h.colObs };
    cols.forEach((raw, idx) => {
      const c = normalizeStr(raw);
      if (!c) return;
      if (isDayHeaderCell(c)) {
        if (!takenDayColumns.has(idx)) { takenDayColumns.add(idx); h.dayColumns.push({ index: idx, raw }); }
        return;
      }
      if (c.startsWith("obs")) { if (h.colObs < 0) h.colObs = idx; return; }
      if (c.includes("chegada") || c.includes("desembarque")) {
        if (h.colArrivalTime < 0) h.colArrivalTime = idx;
        labels++; return;
      }
      if (c.includes("retorno") || c.includes("volta")) {
        // "horario do retorno (a partir)" é HORA; "retorno" sozinho é DATA.
        if (c.includes("hora")) { if (h.colReturnTime < 0) h.colReturnTime = idx; }
        else if (h.colReturnDate < 0) h.colReturnDate = idx;
        labels++; return;
      }
      if (c === "ida" || c.startsWith("ida ") || c.includes("data ida") || c.includes("saida")) {
        if (h.colDepartureDate < 0) h.colDepartureDate = idx;
        labels++; return;
      }
      if (c.startsWith("hor")) { if (h.colReturnTime < 0) h.colReturnTime = idx; labels++; }
    });
    // Só marca o início do bloco quando a linha realmente acrescentou algo.
    const contributed = labels > before.labels || h.dayColumns.length > before.days || h.colObs !== before.obs;
    if (contributed && h.lineIndex < 0) h.lineIndex = i;
  }
  if (h.lineIndex < 0) return null;
  if (h.dayColumns.length < 2 && labels < 2) return null;
  h.dayColumns.sort((a, b) => a.index - b.index);
  return h;
}

/**
 * Data de uma coluna de dia → ISO. O ano quase nunca está no rótulo ("08/set"),
 * então ele vem da GRADE: se dia/mês bate com algum dia do período atual, usa
 * aquele ano; senão cai no ano do evento (`defaultYear`).
 */
export function resolveHeaderDate(raw: string, dates: string[], defaultYear: string): string {
  const s = raw.trim();
  if (!s) return "";
  const iso = parseShortDate(s, defaultYear);
  if (!iso) return "";
  const parts = s.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length >= 3) return iso; // o ano veio escrito no rótulo
  const mmdd = iso.slice(5);
  return dates.find((d) => d.slice(5) === mmdd) ?? iso;
}

// ── Classificador de colunas da colagem ─────────────────────────────────────

export type PasteConfidence = "alta" | "media" | "baixa";

/** Papel → índice da coluna (-1 = a colagem não tem essa coluna). */
export interface PasteColumnMap {
  funcao: number;
  dataIda: number;
  horaChegada: number;
  dataVolta: number;
  horaRetorno: number;
  hotel: number;
  passagem: number;
  obs: number;
  /** Colunas de dia na ordem da planilha, já com a data resolvida. */
  dias: { index: number; date: string }[];
}

export interface PasteLayout {
  columns: PasteColumnMap;
  /** Linhas do topo tratadas como cabeçalho (e puladas na leitura). */
  headerLines: number[];
  /** true = a data de cada dia veio do cabeçalho; false = alinhada pelo período da grade. */
  daysFromHeader: boolean;
  /** Atalho de `!daysFromHeader`: é o palpite que a tela precisa avisar. */
  alignedWithoutHeader: boolean;
  confidence: PasteConfidence;
  /** Avisos prontos para exibir (pt-BR). */
  warnings: string[];
}

const WEEKDAY_RE = /^(seg|ter|qua|qui|sex|sab|dom)\.?$/;
const YESNO_LABELS = new Set(["sim", "s", "nao", "n", "x", "true", "false", "y", "yes", "no"]);

/**
 * A linha TEM A FORMA de uma linha de dados da logística? É o que permite
 * reconhecer a planilha quando o usuário cola só as linhas de dados: basta uma
 * pista forte nas posições do modelo — data por extenso em pt-BR na 2ª ou na 4ª
 * coluna, ou horário com "h" na 3ª/5ª com a coluna de data ao lado vazia ou com
 * data de verdade (senão "Aéreo | 09/09 | 10h" do formato antigo se passaria por
 * planilha da logística).
 */
function looksLikeLogisticaRow(cols: string[]): boolean {
  if (!(cols[0] ?? "").trim()) return false;
  if (isHeaderLine(cols)) return false;
  const SHAPE_YEAR = "2000"; // ano só para testar o formato da célula
  const dateAt = (i: number) => parseLongDateBr(cols[i] ?? "", SHAPE_YEAR) !== "";
  const timeAt = (i: number) => {
    if (!isLogisticaTimeCell(cols[i] ?? "")) return false;
    const dateCell = (cols[i - 1] ?? "").trim();
    return dateCell === "" || parseSheetDate(dateCell, SHAPE_YEAR) !== "";
  };
  return dateAt(1) || dateAt(3) || timeAt(2) || timeAt(4);
}

/** Alguma linha do texto colado tem a forma de dados da planilha da logística. */
export function hasLogisticaRowShape(grid: string[][]): boolean {
  return grid.some(looksLikeLogisticaRow);
}

type HeaderLabel = "" | "funcao" | "ida" | "chegada" | "retorno" | "horaRetorno" | "hotel" | "passagem" | "obs" | "dia" | "semana";

/** Que papel um RÓTULO de cabeçalho anuncia (a data curta volta junto, para o dia). */
function headerLabelOf(raw: string): { label: HeaderLabel; date: string } {
  const c = normalizeStr(raw);
  if (!c) return { label: "", date: "" };
  if (isDayHeaderCell(c)) return { label: "dia", date: raw.trim() };
  if (WEEKDAY_RE.test(c)) return { label: "semana", date: "" };
  if (HEADER_FUNCTION_RE.test(c)) return { label: "funcao", date: "" };
  if (c.startsWith("obs")) return { label: "obs", date: "" };
  if (c.startsWith("hotel") || c.includes("hospedagem")) return { label: "hotel", date: "" };
  if (c.includes("passagem")) return { label: "passagem", date: "" };
  if (c.includes("chegada") || c.includes("desembarque")) return { label: "chegada", date: "" };
  if (c.includes("retorno") || c.includes("volta") || c.includes("embarque")) {
    // "horario do retorno (a partir)" e "hora embarque" são HORA; "retorno"/"data volta" são DATA.
    const isTime = c.includes("hora") || c.includes("embarque");
    return { label: isTime ? "horaRetorno" : "retorno", date: "" };
  }
  if (c === "ida" || c.startsWith("ida ") || c.includes("data ida") || c.includes("saida")) return { label: "ida", date: "" };
  if (c.startsWith("hor")) return { label: "horaRetorno", date: "" };
  return { label: "", date: "" };
}

interface ColumnProfile {
  index: number;
  nonEmpty: number;
  funcName: number;
  date: number;
  time: number;
  smallInt: number;
  yesNo: number;
  /** Texto que não é data, hora, número nem sim/não. */
  text: number;
  label: HeaderLabel;
  /** Rótulo de data curta do cabeçalho ("08/set"), como veio escrito. */
  headerDate: string;
}

/** Uma linha de cabeçalho: não traz função nenhuma e só tem rótulos/datas/dias da semana. */
function isHeaderish(cols: string[]): boolean {
  let labels = 0;
  let days = 0;
  let weekdays = 0;
  let nonEmpty = 0;
  let others = 0;
  for (const raw of cols) {
    if (!raw.trim()) continue;
    nonEmpty++;
    const { label } = headerLabelOf(raw);
    if (label === "dia") days++;
    else if (label === "semana") weekdays++;
    else if (label) labels++;
    else others++;
  }
  if (nonEmpty === 0) return false;
  if (labels >= 2 || days >= 2 || weekdays >= 2) return true;
  // Linha de título do evento: uma única célula de texto, sem número nem data.
  return nonEmpty === 1 && others === 1 && !cols.some((c) => SMALL_INT_RE.test(c.trim()));
}

/** Quantas linhas do topo podem ser cabeçalho (o título do evento costuma vir antes). */
const HEADER_SCAN_LINES = 6;

interface SplitLines {
  headerLines: number[];
  dataLines: number[];
}
function splitHeaderAndData(grid: string[][], match: (raw: string) => { id: string } | undefined): SplitLines {
  const headerLines: number[] = [];
  const dataLines: number[] = [];
  grid.forEach((cols, i) => {
    if (cols.every((c) => !c.trim())) return; // linha em branco: não é nada
    const hasFunction = cols.some((c) => c.trim() && match(c));
    if (!hasFunction && i < HEADER_SCAN_LINES && isHeaderish(cols)) { headerLines.push(i); return; }
    dataLines.push(i);
  });
  return { headerLines, dataLines };
}

function profileColumns(
  grid: string[][],
  lines: SplitLines,
  match: (raw: string) => { id: string } | undefined,
  defaultYear: string,
): ColumnProfile[] {
  let maxCols = 0;
  for (const i of [...lines.headerLines, ...lines.dataLines]) maxCols = Math.max(maxCols, grid[i].length);
  const profiles: ColumnProfile[] = [];
  for (let j = 0; j < maxCols; j++) {
    const p: ColumnProfile = {
      index: j, nonEmpty: 0, funcName: 0, date: 0, time: 0, smallInt: 0, yesNo: 0, text: 0,
      label: "", headerDate: "",
    };
    for (const i of lines.dataLines) {
      const raw = (grid[i][j] ?? "").trim();
      if (!raw) continue;
      p.nonEmpty++;
      if (match(raw)) p.funcName++;
      const isDate = parseSheetDate(raw, defaultYear) !== "";
      const isTime = !isDate && isTimeCell(raw);
      const isInt = !isDate && !isTime && SMALL_INT_RE.test(raw);
      const isYesNo = YESNO_LABELS.has(normalizeStr(raw));
      if (isDate) p.date++;
      if (isTime) p.time++;
      if (isInt) p.smallInt++;
      if (isYesNo) p.yesNo++;
      if (!isDate && !isTime && !isInt && !isYesNo) p.text++;
    }
    // O cabeçalho é reforço: a 1ª linha que der um rótulo à coluna manda.
    for (const i of lines.headerLines) {
      const { label, date } = headerLabelOf(grid[i][j] ?? "");
      if (!label || label === "semana") continue;
      if (!p.label) p.label = label;
      if (label === "dia" && !p.headerDate) p.headerDate = date;
    }
    profiles.push(p);
  }
  return profiles;
}

/** dd/mm legível, para os avisos. */
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/**
 * Alinha as colunas de dia QUANDO NÃO HÁ datas no cabeçalho.
 *
 * Sem as datas, o bloco de dias é uma janela contígua de `dates.length` colunas
 * depois do bloco de viagem — e só o conteúdo diz onde ela começa. Duas evidências
 * são combinadas:
 *
 * - GEOMETRIA: a janela precisa conter todos os inteiros da colagem, e fica o mais
 *   à ESQUERDA possível respeitando isso (colunas vazias antes dela são as
 *   separadoras do modelo, quantas forem).
 * - DATA DE VOLTA: numa planilha da logística, quem viaja costuma trabalhar até o
 *   dia em que embarca de volta. Então cada linha com data de volta dentro do
 *   período "vota" em um começo de janela (última coluna com número − posição da
 *   data de volta na grade). Vence o mais votado, se ele couber na geometria.
 *
 * Concordância entre as duas → confiança "media"; discordância (ou nenhuma data de
 * volta para conferir) → "baixa", e o aviso diz para conferir antes de aplicar.
 */
function alignDayColumns(
  grid: string[][],
  dataLines: number[],
  candidates: number[],
  dates: string[],
  colReturnDate: number,
  defaultYear: string,
): { dias: { index: number; date: string }[]; confidence: PasteConfidence; warnings: string[] } {
  const warnings: string[] = [];
  const periodo = dates.length ? `${ddmm(dates[0])} a ${ddmm(dates[dates.length - 1])}` : "";
  const aviso = `Sem a linha de datas — os dias foram alinhados pelo período da grade (${periodo}). Confira antes de aplicar.`;
  if (dates.length === 0 || candidates.length === 0) return { dias: [], confidence: "baixa", warnings: [aviso] };

  const isInt = (i: number, j: number) => SMALL_INT_RE.test((grid[i][j] ?? "").trim());
  const first = candidates[0];
  let firstInt = -1;
  let lastInt = -1;
  for (const i of dataLines) {
    for (const j of candidates) {
      if (!isInt(i, j)) continue;
      if (firstInt < 0 || j < firstInt) firstInt = j;
      if (j > lastInt) lastInt = j;
    }
  }
  if (firstInt < 0) return { dias: [], confidence: "baixa", warnings: [aviso] };

  // Geometria: o mais à esquerda que ainda cobre o último número.
  let start = Math.max(first, lastInt - dates.length + 1);
  if (start > firstInt) start = firstInt; // bloco maior que a grade: o excedente vira "dia fora do período"
  const fits = (s: number) => s >= first && s <= firstInt && s + dates.length - 1 >= lastInt;

  // Votação pela data de volta.
  const votes = new Map<number, number>();
  if (colReturnDate >= 0) {
    for (const i of dataLines) {
      const back = parseSheetDate((grid[i][colReturnDate] ?? "").trim(), defaultYear);
      const backIdx = dates.indexOf(back);
      if (backIdx < 0) continue;
      let lastNum = -1;
      for (const j of candidates) if (isInt(i, j)) lastNum = j;
      if (lastNum < 0) continue;
      const s = lastNum - backIdx;
      votes.set(s, (votes.get(s) ?? 0) + 1);
    }
  }
  const tally: { start: number; count: number }[] = [];
  votes.forEach((count, start) => tally.push({ start, count }));
  const winner = tally.sort((a, b) => b.count - a.count || a.start - b.start)[0];
  let confidence: PasteConfidence = "baixa";
  // A data de volta é evidência mais forte que a geometria: ela vence desde que não
  // jogue nenhum número para ANTES do bloco (aí sim haveria quantidade perdida).
  if (winner && winner.start >= first && winner.start <= firstInt) {
    confidence = winner.start === start ? "media" : "baixa";
    if (winner.start !== start) {
      warnings.push("As datas de volta e a posição das colunas discordam sobre onde começam os dias — confira a grade.");
    }
    start = winner.start;
    if (!fits(start)) {
      warnings.push("A planilha tem mais colunas de dia do que o período da grade — as que sobram viram dias fora do período.");
    }
  } else if (!winner) {
    warnings.push("Nenhuma linha tem data de volta dentro do período para conferir o alinhamento dos dias.");
  }
  warnings.unshift(aviso);
  return { dias: dates.map((date, k) => ({ index: start + k, date })), confidence, warnings };
}

/**
 * Atribui os papéis às colunas por maior evidência. Colunas 100% vazias não
 * ganham papel nenhum (só entram no bloco de dias, se caírem dentro dele).
 */
function assignColumnRoles(
  grid: string[][],
  lines: SplitLines,
  profiles: ColumnProfile[],
  dates: string[],
  defaultYear: string,
): PasteLayout {
  const used = new Set<number>();
  const take = (i: number) => { if (i >= 0) used.add(i); return i; };
  const byLabel = (label: HeaderLabel) => profiles.find((p) => p.label === label)?.index ?? -1;
  const free = (p: ColumnProfile) => !used.has(p.index);
  /** "majoritariamente X": X é o conteúdo mais comum das células preenchidas. */
  const mostly = (count: number, p: ColumnProfile) => count > 0 && count * 2 >= p.nonEmpty;

  // (1) FUNÇÃO: a coluna com mais nomes do catálogo; sem catálogo, a 1ª com texto.
  let funcao = byLabel("funcao");
  if (funcao < 0) {
    const best = profiles.filter((p) => p.funcName > 0).sort((a, b) => b.funcName - a.funcName || a.index - b.index)[0];
    funcao = best ? best.index : (profiles.find((p) => p.text > 0)?.index ?? 0);
  }
  take(funcao);

  // (2) DATAS de viagem: as colunas majoritariamente data; a 1ª é ida, a 2ª é volta.
  //     O rótulo do cabeçalho, quando existe, manda.
  const dateCols = profiles.filter((p) => free(p) && mostly(p.date, p)).map((p) => p.index);
  const dataIda = take(byLabel("ida") >= 0 ? byLabel("ida") : (dateCols[0] ?? -1));
  const dataVolta = take(byLabel("retorno") >= 0 ? byLabel("retorno") : (dateCols.find((i) => i !== dataIda) ?? -1));

  // (3) HORÁRIOS: colunas majoritariamente horário. Sem rótulo, vale a vizinhança —
  //     o horário depois da data de ida é o desembarque; depois da volta, o embarque.
  const timeCols = profiles.filter((p) => free(p) && mostly(p.time, p)).map((p) => p.index);
  const afterIda = timeCols.find((i) => i > dataIda && (dataVolta < 0 || i < dataVolta));
  const horaChegada = take(byLabel("chegada") >= 0 ? byLabel("chegada") : (dataIda >= 0 ? afterIda ?? -1 : timeCols[0] ?? -1));
  const afterVolta = timeCols.find((i) => i > dataVolta && i !== horaChegada);
  const horaRetorno = take(
    byLabel("horaRetorno") >= 0 ? byLabel("horaRetorno")
      : dataVolta >= 0 ? afterVolta ?? -1
        : timeCols.find((i) => i !== horaChegada) ?? -1,
  );

  // (4) HOTEL/PASSAGEM: sim/não é ambíguo demais sem rótulo (um "1" tanto pode ser
  //     "sim" quanto uma vaga), então só entram quando o cabeçalho os nomeia.
  const hotel = take(byLabel("hotel"));
  const passagem = take(byLabel("passagem"));
  const obsLabel = take(byLabel("obs"));

  // (5) DIAS: as colunas de inteiro pequeno (as vazias no meio contam, são dias sem
  //     ninguém). Com datas no cabeçalho, cada coluna já sabe seu dia; sem elas, o
  //     bloco é alinhado pelo período da grade.
  const headerDays = profiles
    .filter((p) => free(p) && p.headerDate)
    .map((p) => ({ index: p.index, date: resolveHeaderDate(p.headerDate, dates, defaultYear) }))
    .filter((d) => d.date);
  let dias = headerDays;
  const daysFromHeader = headerDays.length > 0;
  let confidence: PasteConfidence = "alta";
  let warnings: string[] = [];
  if (!daysFromHeader) {
    const candidates = profiles
      .filter((p) => free(p) && p.text === 0 && p.date === 0 && p.time === 0 && p.yesNo === 0)
      .map((p) => p.index)
      .filter((i) => i > Math.max(funcao, dataIda, horaChegada, dataVolta, horaRetorno, hotel, passagem));
    const aligned = alignDayColumns(grid, lines.dataLines, candidates, dates, dataVolta, defaultYear);
    dias = aligned.dias;
    confidence = aligned.confidence;
    warnings = aligned.warnings;
  }
  for (const d of dias) used.add(d.index);

  // (6) OBSERVAÇÃO: o texto livre que sobrou — normalmente a última coluna.
  let obs = obsLabel;
  if (obs < 0) {
    const textCols = profiles.filter((p) => free(p) && p.text > 0).map((p) => p.index);
    obs = textCols.length ? textCols[textCols.length - 1] : -1;
  }
  take(obs);

  return {
    columns: { funcao, dataIda, horaChegada, dataVolta, horaRetorno, hotel, passagem, obs, dias },
    headerLines: lines.headerLines,
    daysFromHeader,
    alignedWithoutHeader: !daysFromHeader,
    confidence,
    warnings,
  };
}

/** Lê a colagem como matriz e devolve o que cada coluna significa. */
export function classifyPasteColumns(
  grid: string[][],
  functions: { id: string; name: string }[],
  dates: string[],
  defaultYear: string,
  options?: PasteOptions,
): PasteLayout {
  const match = buildFunctionMatcher(functions, options?.nameMap);
  const lines = splitHeaderAndData(grid, match);
  const profiles = profileColumns(grid, lines, match, defaultYear);
  return assignColumnRoles(grid, lines, profiles, dates, defaultYear);
}
