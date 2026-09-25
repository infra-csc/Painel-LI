/**
 * Linha do tempo do Histórico da escala (25/09 — extraído da página): cada
 * movimento real do fluxo (envio → validação → pedido → decisão → exclusão),
 * agrupado por minuto, filtrado e organizado por dia e por evento.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Event } from "@shared/schema";
import {
  CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS, isSuggestionInclusion,
  type ChangeRequestStatus, type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import { formatDateBr } from "@/lib/dates";
import { formatDateRange } from "@/lib/utils";
import { scalingHref } from "@/lib/use-scaling-event";
import { workDaysOf } from "@/components/scaling-validation/types";
import {
  TIMELINE_EVENTS_STEP, TL_ORDER, batchByMinute, idChips, isDeleted, namesOf, plural, toDate,
  type EventViewRow, type TlCat, type TlDay, type TlDraft, type TlEntry,
} from "./event-view-shared";
import type { EventHistory, RequestRow } from "./use-event-history";

export interface UseEventTimelineArgs {
  eventId: string;
  canOpenApproval: boolean;
  rows: EventViewRow[];
  requests: RequestRow[];
  rowById: Map<string, EventViewRow>;
  functionNameById: Map<string, string>;
  eventById: Map<string, Event>;
  eventNameByRowId: Map<string, string>;
  deferredSearch: string;
}

export function useEventTimeline({ eventId, canOpenApproval, rows, requests, rowById, functionNameById, eventById, eventNameByRowId, deferredSearch }: UseEventTimelineArgs) {
  /** Categorias visíveis na linha do tempo. */
  const [tlCats, setTlCats] = useState<TlCat[]>(TL_ORDER);
  /** Quantos eventos a linha do tempo mostra no modo "Todos os eventos". */
  const [visibleEvents, setVisibleEvents] = useState(TIMELINE_EVENTS_STEP);

  const timeline = useMemo<TlEntry[]>(() => {
    if (rows.length === 0 && requests.length === 0) return [];
    const out: TlDraft[] = [];
    const fnName = (id: string) => functionNameById.get(id) ?? "Sem função";

    // `eventOf` separa os lotes por evento (ver `batchByMinute`) e carimba a
    // entrada, para a linha do tempo poder agrupar por evento.
    const eventOf = (r: EventViewRow) => r.eventId ?? "";
    for (const g of batchByMinute(rows, (r) => r.suggestionSentAt, eventOf)) {
      const funcs = new Set(g.items.map((r) => r.functionId)).size;
      const pessoasDia = g.items.reduce((a, r) => a + (workDaysOf(r).length || r.dailyRates || 0), 0);
      out.push({
        id: `envio-${g.items[0].eventId}-${g.at.getTime()}`, cat: "envio", at: g.at, eventId: g.items[0].eventId,
        title: "Escala sugerida enviada para validação", tag: "Envio",
        text: `${namesOf(g.items, functionNameById)} — a logística mandou as vagas para as áreas conferirem.`,
        chips: [plural(g.items.length, "vaga", "vagas"), plural(funcs, "função", "funções"), `${pessoasDia} pessoas-dia`],
      });
    }
    for (const g of batchByMinute(rows, (r) => r.validatedAt, eventOf)) {
      out.push({
        id: `val-${g.items[0].eventId}-${g.at.getTime()}`, cat: "validacao", at: g.at, eventId: g.items[0].eventId,
        title: `Área validou ${plural(g.items.length, "vaga", "vagas")}`, tag: "Validação",
        text: `${namesOf(g.items, functionNameById)} — seguiram para a aprovação.`,
        chips: idChips(g.items),
      });
    }
    // Aprovação: a vaga aprovada sai da fase 'sugestao' e vira Inclusão de Equipe.
    // A API não guarda a data da decisão em si, então usamos `updatedAt` — o MESMO
    // critério da coluna "Último movimento" da Lista (lastMoveOf). Como `updatedAt`
    // é bumpado por qualquer edição posterior (escalação, passagem, hospedagem),
    // o texto é conservador: diz que a vaga está em Inclusão e que a data é a da
    // última alteração, sem afirmar que aquele minuto foi o clique do aprovador.
    for (const g of batchByMinute(rows.filter((r) => !isSuggestionInclusion(r) && !isDeleted(r)), (r) => r.updatedAt, eventOf)) {
      out.push({
        id: `apr-${g.items[0].eventId}-${g.at.getTime()}`, cat: "decisao", at: g.at, eventId: g.items[0].eventId,
        title: `${plural(g.items.length, "vaga virou", "vagas viraram")} Inclusão de Equipe`, tag: "Aprovação",
        text: `${namesOf(g.items, functionNameById)} — aprovadas pelo aprovador e fora da Validação (data da última alteração da vaga).`,
        chips: idChips(g.items),
      });
    }
    for (const g of batchByMinute(rows, (r) => r.deletedAt, eventOf)) {
      out.push({
        id: `del-${g.items[0].eventId}-${g.at.getTime()}`, cat: "exclusao", at: g.at, eventId: g.items[0].eventId,
        title: `${plural(g.items.length, "vaga excluída", "vagas excluídas")}`, tag: "Excluída",
        text: `${namesOf(g.items, functionNameById)} — fora da soma dos indicadores e do quadro.`,
        chips: idChips(g.items),
      });
    }
    for (const r of requests) {
      const tipo = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
      const alvo = r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova";
      const where = `${fnName(r.functionId)} · ${alvo}`;
      // O link leva ao evento DO PEDIDO (no modo "todos", `eventId` é vazio).
      const href = canOpenApproval ? scalingHref("/scaling-approval", eventId || r.eventId, { request: r.id }) : undefined;
      const created = toDate(r.createdAt);
      if (created) {
        out.push({
          id: `req-${r.id}`, cat: "pedido", at: created, eventId: r.eventId,
          title: `Pedido de ${tipo.toLowerCase()} aberto`, tag: tipo,
          text: where, author: r.requestedByName ? `${r.requestedByName} (solicitante)` : undefined,
          quote: r.reason ?? undefined, href, linkLabel: "Abrir na Aprovação",
        });
      }
      const reviewed = toDate(r.reviewedAt);
      if (reviewed) {
        const st = CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status;
        out.push({
          id: `dec-${r.id}`, cat: "decisao", at: reviewed, eventId: r.eventId,
          title: `Pedido de ${tipo.toLowerCase()} — ${st.toLowerCase()}`, tag: st,
          text: where, author: r.reviewedByName ? `${r.reviewedByName} (aprovador)` : undefined,
          quote: r.reviewComment ?? undefined, href, linkLabel: "Abrir na Aprovação",
        });
      }
    }
    // Os chips entram no texto pesquisável: carregam os #IDs das vagas (e as
    // contagens do envio) — sem eles o placeholder prometeria "#ID" e buscar
    // "1049" não acharia o cartão.
    return out
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((e) => ({ ...e, haystack: `${e.title} ${e.text} ${e.tag} ${e.author ?? ""} ${e.quote ?? ""} ${(e.chips ?? []).join(" ")}`.toLowerCase() }));
  }, [rows, requests, rowById, functionNameById, canOpenApproval, eventId]);

  const filteredTimeline = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return timeline
      .filter((e) => tlCats.includes(e.cat))
      .filter((e) => !q || e.haystack.includes(q));
  }, [timeline, tlCats, deferredSearch]);
  /** Movimentos agrupados por dia (mais recente primeiro — a ordem de inserção do Map preserva isso). */
  const groupByDay = useCallback((entries: TlEntry[]): TlDay[] => {
    const today = formatDateBr(new Date());
    const groups = new Map<string, TlDay>();
    for (const e of entries) {
      const key = formatDateBr(e.at);
      let g = groups.get(key);
      if (!g) { g = { key, label: key === today ? `${key} · hoje` : key, items: [] }; groups.set(key, g); }
      g.items.push(e);
    }
    return Array.from(groups.values());
  }, []);
  const timelineDays = useMemo(() => groupByDay(filteredTimeline), [groupByDay, filteredTimeline]);

  /**
   * Modo "Todos os eventos": a linha do tempo de todos os eventos de uma vez
   * ficaria interminável e misturaria histórias diferentes. Por isso ela é
   * agrupada POR EVENTO (o de movimento mais recente primeiro) e só os
   * `TIMELINE_EVENTS_STEP` primeiros aparecem — o resto vem no "Ver mais".
   * Dentro de cada evento continua a leitura por dia de sempre.
   */
  const timelineEvents = useMemo(() => {
    if (eventId) return [];
    const groups = new Map<string, { key: string; name: string; period: string; items: TlEntry[] }>();
    for (const e of filteredTimeline) {
      const key = e.eventId ?? "";
      let g = groups.get(key);
      if (!g) {
        const ev = eventById.get(key);
        g = {
          key,
          name: ev?.name ?? eventNameByRowId.get(key) ?? "Evento sem nome",
          period: ev ? formatDateRange(ev.startDate, ev.endDate, { withYear: true }) : "",
          items: [],
        };
        groups.set(key, g);
      }
      g.items.push(e);
    }
    // `filteredTimeline` já vem do mais recente para o mais antigo, então a
    // ordem de inserção no Map já é a ordem certa dos grupos.
    return Array.from(groups.values());
  }, [eventId, filteredTimeline, eventById, eventNameByRowId]);
  const timelineStart = timeline.length ? formatDateBr(timeline[timeline.length - 1].at) : "";
  const lastMovement = timeline[0] ?? null;
  // "Ver mais eventos" volta ao começo quando o recorte muda: o número de
  // eventos abertos era de OUTRA busca/evento e não faz sentido continuar valendo.
  useEffect(() => { setVisibleEvents(TIMELINE_EVENTS_STEP); }, [eventId, deferredSearch, tlCats]);

  const toggleCat = (k: TlCat) => setTlCats((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : TL_ORDER.filter((x) => cur.includes(x) || x === k)));
  const showMoreEvents = () => setVisibleEvents((n) => n + TIMELINE_EVENTS_STEP);

  return {
    tlCats, toggleCat, setTlCats, visibleEvents, showMoreEvents,
    timeline, filteredTimeline, groupByDay, timelineDays, timelineEvents, timelineStart, lastMovement,
  };
}

export type EventTimelineData = ReturnType<typeof useEventTimeline>;
/** Atalho para montar os argumentos a partir do hook de dados. */
export function timelineArgsFrom(h: EventHistory, eventId: string, canOpenApproval: boolean): UseEventTimelineArgs {
  return {
    eventId, canOpenApproval, rows: h.rows, requests: h.requests, rowById: h.rowById, functionNameById: h.functionNameById,
    eventById: h.eventById, eventNameByRowId: h.eventNameByRowId, deferredSearch: h.deferredSearch,
  };
}
