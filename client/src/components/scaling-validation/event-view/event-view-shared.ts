/**
 * Histórico da escala — tipos, constantes e utilitários puros (25/09, extraídos
 * de pages/scaling-event-view.tsx). Sem JSX: o que renderiza mora nos
 * componentes desta pasta; o que consulta e deriva, nos hooks.
 */
import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, Gavel, PencilLine, Send, Trash2 } from "lucide-react";
import type { ScalingChangeRequest, TeamInclusion } from "@shared/schema";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS,
  isSuggestionInclusion, type SugestaoStatus, type ChangeRequestStatus, type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import { formatDayMonthBr } from "@/lib/dates";
import { workDaysOf, type SuggestionRow } from "@/components/scaling-validation/types";
import { TONE_CLASS, toneDoStatus, type Tone } from "@/components/common/status-badge";
import { legValue } from "@/components/scaling-validation/logistics-chips";

export const ALL = "all";
export const BASE_PATH = "/scaling-event-view";

export type ApiViewRow = TeamInclusion & {
  requests: ScalingChangeRequest[];
  /** Evento da vaga — o servidor anexa (necessário no modo "Todos os eventos"). */
  eventName?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
};
export interface EventViewData {
  suggestions: ApiViewRow[];
  inclusions: ApiViewRow[];
  requests: ScalingChangeRequest[];
  /** Só no modo "Todos os eventos": a consulta bateu no teto de linhas. */
  truncated?: boolean;
  rowLimit?: number | null;
  /** Quantos eventos entraram no recorte do servidor. */
  eventCount?: number;
}
/** Linha da tela: a da API + os campos que os componentes da Validação (lista/quadro) esperam. */
export type EventViewRow = ApiViewRow & SuggestionRow;

export type Tab = "timeline" | "lista" | "escala" | "pedidos";
/** `timeline` é a aba padrão (sem `?tab=`); as demais viajam na URL. */
export const TABS: Tab[] = ["timeline", "lista", "escala", "pedidos"];
export const TAB_LABEL: Record<Tab, string> = { timeline: "Linha do tempo", lista: "Lista", escala: "Escala", pedidos: "Pedidos" };

/** Chaves de "origem/status" além dos status de sugestão. */
export const IN_INCLUSION = "__inclusao__";
export const DELETED = "__excluida__";
export const ORIGIN_LABEL_INCLUSAO = "Em Inclusão de Equipe";
export const ORIGIN_LABEL_EXCLUIDA = "Excluída";

/**
 * Timestamp da API (ISO com fuso) → Date local. Precisa vir ANTES de
 * `originLabel`: `formatDayMonthBr` de `lib/dates.ts` lê a data crua da string
 * ISO (é feito para datas de calendário, sem fuso), então uma exclusão às 22h
 * de Brasília sairia como o dia seguinte. Convertendo para `Date` primeiro, o
 * badge da Lista e a linha do tempo passam a falar do mesmo dia.
 */
export const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const isDeleted = (row: { deletedAt?: unknown }) => !!row.deletedAt;
export function originKey(row: EventViewRow): string {
  if (isDeleted(row)) return DELETED;
  return isSuggestionInclusion(row) ? row.status : IN_INCLUSION;
}
export function originLabel(row: EventViewRow): string {
  const k = originKey(row);
  if (k === DELETED) return `${ORIGIN_LABEL_EXCLUIDA} em ${formatDayMonthBr(toDate(row.deletedAt))}`;
  if (k === IN_INCLUSION) return ORIGIN_LABEL_INCLUSAO;
  return SUGESTAO_STATUS_LABELS[k as SugestaoStatus] ?? k;
}
export const ORIGIN_ORDER = [...Object.values(SUGESTAO_STATUS), IN_INCLUSION, DELETED];
export const ORIGIN_LABELS: Record<string, string> = { ...SUGESTAO_STATUS_LABELS, [IN_INCLUSION]: ORIGIN_LABEL_INCLUSAO, [DELETED]: ORIGIN_LABEL_EXCLUIDA };

/** Cor sutil por origem/status — mesma paleta dos badges (funil, legenda do quadro e KPIs): o ponto `*-strong` do tom. */
export const ORIGIN_DOT: Record<string, string> = {
  [SUGESTAO_STATUS.PENDENTE]: TONE_CLASS[toneDoStatus(SUGESTAO_STATUS.PENDENTE)].dot,
  [SUGESTAO_STATUS.VALIDADA]: TONE_CLASS[toneDoStatus(SUGESTAO_STATUS.VALIDADA)].dot,
  [SUGESTAO_STATUS.AJUSTE]: TONE_CLASS[toneDoStatus(SUGESTAO_STATUS.AJUSTE)].dot,
  [SUGESTAO_STATUS.APROVADA]: TONE_CLASS[toneDoStatus(SUGESTAO_STATUS.APROVADA)].dot,
  [SUGESTAO_STATUS.NEGADA]: TONE_CLASS[toneDoStatus(SUGESTAO_STATUS.NEGADA)].dot,
  [IN_INCLUSION]: TONE_CLASS.primary.dot,
  [DELETED]: TONE_CLASS.neutral.dot,
};

/**
 * Só a hora ("hh:mm"). Data+hora completa é `formatDateTimeBr` (compartilhado
 * com a Aprovação); este fica porque a linha do tempo e a coluna "Hora" do CSV
 * mostram a hora SEM a data — o dia já está no cabeçalho do grupo.
 */
export const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
/**
 * "dd/mm hh:mm" — colunas compactas (Último movimento, última movimentação da
 * barra). Sem o ano de propósito: o evento cabe num mês ou dois e a coluna é
 * estreita; a data completa mora no CSV e no drawer da vaga.
 */
export function fmtShort(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${formatDayMonthBr(d)} ${hhmm(d)}` : "Sem data";
}
/** Alguma perna da viagem tem modal, data ou hora? (Mesmo critério do LegChip: sem nada, ele não desenha.) */
export const hasLeg = (mode: string | null | undefined, date: string | Date | null | undefined, time: string | null | undefined) =>
  !!(legValue(mode) || legValue(date) || legValue(time));
/** Vaga sem passagem, hotel nem perna de viagem — a Lista escreve "Sem logística". */
export const semLogistica = (row: EventViewRow) =>
  !row.needsTicket && !row.needsAccommodation
  && !hasLeg(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)
  && !hasLeg(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime);
/**
 * Adapta a linha da API ao formato que SuggestionsList/ScheduleBoard esperam.
 * `canEdit: true` é proposital: o ScheduleBoard usa `canEdit=false` só para
 * pintar a linha de cinza com "somente leitura" (escopo do usuário na
 * Validação) e não expõe prop `readOnly`; aqui a tela inteira já é consulta,
 * então todas as linhas ficam na cor normal.
 */
export function toViewRow(row: ApiViewRow): EventViewRow {
  return { ...row, canEdit: true, canDecide: false, daysPending: 0, pendingRequest: null, lastDecision: null, lastVagaDecision: null };
}

/** Slug ASCII p/ nome de arquivo. */
export const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
export function downloadCsv(filename: string, header: string[], lines: string[][]) {
  const qv = (v: unknown) => {
    let s = String(v ?? "");
    // Anti-injeção de fórmula: célula que começa com = + - @ ganharia vida no Excel
    // ("=cmd|…"). O apóstrofo na frente faz o Excel tratá-la como texto puro.
    if (/^[=+\-@]/.test(s.trimStart())) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const body = [header.map(qv).join(";"), ...lines.map((l) => l.map(qv).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Colunas anunciadas no diálogo de exportação, NA ORDEM em que saem no CSV
 * (ver `exportCsv`) — quem lê o diálogo e depois abre o arquivo encontra os
 * grupos na mesma sequência. A coluna "Evento" do modo "todos" é anunciada à
 * parte (`EXPORT_EVENT_COL`), porque só existe sem filtro de evento.
 */
export const EXPORT_COLS: Record<Tab, [string, string][]> = {
  timeline: [["Quando", "data e hora"], ["Movimento", "tipo, título e descrição"], ["Quem", "autor do movimento"], ["Vagas", "#IDs e contagens envolvidas"], ["Comentário", "texto do pedido ou da decisão"]],
  lista: [["Vaga", "#ID, função, área, origem/status"], ["Período", "período, dias de trabalho, diárias"], ["Logística", "ida, volta, passagem, hotel"], ["Situação", "quantidade de pedidos, observações"], ["Último movimento", "o que aconteceu e quando"]],
  escala: [["Função", "nome e área"], ["Vagas", "total por função"], ["Dias", "uma coluna por dia do período"], ["Pessoas-dia", "total por função, mais a linha Total por dia"]],
  pedidos: [["Pedido", "tipo, função, vaga, área"], ["Abertura", "solicitante e data"], ["Motivo", "texto do solicitante"], ["Decisão", "status, aprovador, data, comentário"]],
};
export const EXPORT_EVENT_COL: [string, string] = ["Evento", "de qual evento é cada linha (modo \"Todos os eventos\")"];

/** Linha do quadro função × dia agregada (CSV da Escala e lista mobile). */
export interface FunctionAggregate { functionId: string; name: string; area: string; vagas: number; perDay: Record<string, number>; total: number }
/**
 * Mesma agregação do ScheduleBoard: vagas e pessoas-dia por função (soma dos
 * dias de trabalho de todas as áreas), em ordem alfabética. Fica fora do
 * componente para o CSV e a lista mobile lerem os MESMOS números do quadro.
 */
export function aggregateByFunction(rows: EventViewRow[], nameById: Map<string, string>): FunctionAggregate[] {
  const byFn = new Map<string, FunctionAggregate>();
  for (const r of rows) {
    let l = byFn.get(r.functionId);
    if (!l) { l = { functionId: r.functionId, name: nameById.get(r.functionId) ?? "Sem função", area: r.area ?? "", vagas: 0, perDay: {}, total: 0 }; byFn.set(r.functionId, l); }
    l.vagas += 1;
    for (const d of workDaysOf(r)) { l.perDay[d] = (l.perDay[d] || 0) + 1; l.total += 1; }
  }
  return Array.from(byFn.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

/** Último movimento de UMA vaga (para a coluna da Lista e o CSV). */
export function lastMoveOf(row: EventViewRow): { label: string; at: Date | null } {
  const c: { label: string; at: Date | null }[] = [];
  const push = (label: string, v: unknown) => { const d = toDate(v); if (d) c.push({ label, at: d }); };
  push("Vaga criada", row.createdAt);
  push("Enviada para validação", row.suggestionSentAt);
  push("Validada pela área", row.validatedAt);
  for (const r of row.requests) {
    const tipo = (CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType).toLowerCase();
    push(`Pedido de ${tipo} aberto`, r.createdAt);
    push(`Pedido de ${tipo} — ${(CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status).toLowerCase()}`, r.reviewedAt);
  }
  if (!isSuggestionInclusion(row)) push("Aprovada — virou Inclusão de Equipe", row.updatedAt);
  else if (row.status === SUGESTAO_STATUS.NEGADA) push("Vaga negada", row.updatedAt);
  push("Vaga excluída", row.deletedAt);
  if (!c.length) return { label: "Sem movimento", at: null };
  return c.reduce((best, x) => (x.at && best.at && x.at.getTime() >= best.at.getTime() ? x : best));
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

export type TlCat = "envio" | "validacao" | "pedido" | "decisao" | "exclusao";
/**
 * Estilo de cada categoria (07/10 — redesenho): o marcador da trilha (círculo
 * no tom suave com o ícone no tom forte) e o ponto do filtro. Até 06/10 cada
 * movimento era um cartão tingido com borda colorida — uma parede de cor em
 * que nada se destacava. A cor ficou no marcador e na etiqueta; o texto corre
 * sobre o branco. Pedido aberto é âmbar (alguém ainda precisa agir) e exclusão
 * é NEUTRA (regra de 23/09: registro encerrado, não erro).
 */
export interface TlStyle { label: string; icon: LucideIcon; dot: string; marker: string; tone: Tone }
export const TL_ORDER: TlCat[] = ["envio", "validacao", "pedido", "decisao", "exclusao"];
export const TL: Record<TlCat, TlStyle> = {
  envio:     { label: "Envios",     icon: Send,           dot: "bg-primary",        marker: "bg-brand-soft text-primary",   tone: "primary" },
  validacao: { label: "Validações", icon: ClipboardCheck, dot: "bg-info-strong",    marker: "bg-info-soft text-info",       tone: "info" },
  pedido:    { label: "Pedidos",    icon: PencilLine,     dot: "bg-warning-strong", marker: "bg-warning-soft text-warning", tone: "warning" },
  decisao:   { label: "Decisões",   icon: Gavel,          dot: "bg-success-strong", marker: "bg-success-soft text-success", tone: "success" },
  exclusao:  { label: "Exclusões",  icon: Trash2,         dot: "bg-neutral",        marker: "bg-neutral-soft text-neutral", tone: "neutral" },
};

export interface TlEntry {
  id: string;
  cat: TlCat;
  at: Date;
  title: string;
  tag: string;
  /** Tom da etiqueta pelo SIGNIFICADO (pedido: o tipo; decisão: o status). Sem ele, o da categoria. */
  tagTone?: Tone;
  text: string;
  author?: string;
  chips?: string[];
  quote?: string;
  href?: string;
  linkLabel?: string;
  /** Evento do movimento — a linha do tempo agrupa por ele no modo "todos". */
  eventId?: string;
  /**
   * Texto pesquisável já em minúsculas (título, descrição, tag, autor, citação
   * e chips). Pré-computado UMA vez por movimento: a busca re-filtra a cada
   * tecla e montar essa string por cartão a cada vez era o custo dominante.
   */
  haystack: string;
}
/** Movimento antes de ganhar o `haystack` (montado de uma vez no fim). */
export type TlDraft = Omit<TlEntry, "haystack">;
/** Movimentos de um dia (cabeçalho do grupo na linha do tempo). */
export interface TlDay { key: string; label: string; items: TlEntry[] }

/**
 * Agrupa por minuto: um envio/validação/exclusão em lote vira UM movimento.
 * `bucket` separa lotes que caíram no mesmo minuto mas são de EVENTOS
 * diferentes — no modo "Todos os eventos" eles virariam um cartão só, dizendo
 * que uma escala foi enviada para funções de dois eventos ao mesmo tempo.
 */
export function batchByMinute<T>(items: T[], at: (x: T) => unknown, bucket?: (x: T) => string): { at: Date; items: T[] }[] {
  const map = new Map<string, { at: Date; items: T[] }>();
  for (const it of items) {
    const d = toDate(at(it));
    if (!d) continue;
    const k = `${Math.floor(d.getTime() / 60_000)}|${bucket?.(it) ?? ""}`;
    const g = map.get(k);
    if (g) g.items.push(it);
    else map.set(k, { at: d, items: [it] });
  }
  return Array.from(map.values());
}
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export function namesOf(rows: EventViewRow[], nameById: Map<string, string>, max = 4): string {
  const uniq = Array.from(new Set(rows.map((r) => nameById.get(r.functionId) ?? "Sem função")));
  return uniq.length <= max ? uniq.join(", ") : `${uniq.slice(0, max).join(", ")} e mais ${uniq.length - max}`;
}
export const idChips = (rows: EventViewRow[], max = 8) =>
  rows.slice(0, max).map((r) => `#${r.inclusionNumber}`).concat(rows.length > max ? [`+${rows.length - max}`] : []);

/** Quantos eventos a linha do tempo mostra por vez no modo "Todos os eventos". */
export const TIMELINE_EVENTS_STEP = 3;

/**
 * Cabeçalho de coluna — caixa de frase, 12px, cinza: o mesmo da Validação e
 * da Aprovação (07/10). Era caixa alta em negrito, o desenho de antes do módulo.
 */
export const TH = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
export const LABEL = "text-xs text-muted-foreground";
/** Chip de #ID da linha do tempo. */
export const CHIP = "inline-flex items-center h-[22px] rounded-md px-1.5 font-mono text-2xs font-semibold tabular-nums";
/** Aviso em faixa (histórico parcial, escala travada, quadro sem evento) — o mesmo da Validação. */
export const AVISO = "val-entra flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed";
/** Moldura das listas (sombra de 1px, a mesma da Validação e da Aprovação). */
export const MOLDURA = "rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]";
/**
 * Filtro liga/desliga em pílula (categorias da linha do tempo, legenda do
 * quadro): ponto da cor, rótulo e contagem. Ligado fica no tom da marca.
 */
export const PILULA = "hes-pilula val-alvo inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const PILULA_ON = "border-primary/35 bg-brand-soft text-primary";
export const PILULA_OFF = "border-border bg-card text-slate-600 hover:border-slate-300 hover:text-foreground";
/** Botão secundário em contorno (comentários do evento, exportar): 36px. */
export const CONTORNO = "val-alvo inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-medium text-slate-700 transition-colors hover:border-primary/30 hover:bg-brand-soft/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
