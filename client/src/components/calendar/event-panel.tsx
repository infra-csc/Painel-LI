/**
 * Painel flutuante com o detalhe de um evento do Calendário (25/09 — extraído
 * de pages/calendar.tsx): status, local, período, escala e atalhos.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, ClipboardList, Clock, MapPin, Table2, Tag, Users, X } from "lucide-react";
import type { Event, TeamInclusion } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { listaDeVagasQuery } from "@/hooks/use-vaga-acoes";
import { dayCount, formatDateRange, getCfg, getEffectiveStatus, useDialogFocus } from "./calendar-shared";

const PANEL_W = 296;
const PANEL_MARGIN = 14;

export function EventPanel({ event, onClose, clickPos }: {
  event: Event;
  onClose: () => void;
  clickPos: { x: number; y: number };
}) {
  const cfg = getCfg(getEffectiveStatus(event));
  const StatusIcon = cfg.icon;
  const days = dayCount(event.startDate, event.endDate);

  // Só as vagas DESTE evento (`?eventId=`, 24/09) — antes baixava a fila inteira.
  const { data: teamInclusions = [], isLoading: loadingTeam, isError: teamError } = useQuery<TeamInclusion[]>(
    listaDeVagasQuery({ eventId: event.id }),
  );

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const eventInclusions = useMemo(() =>
    teamInclusions.filter(ti => ti.eventId === event.id && !ti.deletedAt),
    [teamInclusions, event.id]
  );
  const collaboratorCount = useMemo(() =>
    new Set(eventInclusions.map(ti => ti.collaboratorId).filter(Boolean)).size,
    [eventInclusions]
  );
  const functionCount = useMemo(() =>
    new Set(eventInclusions.map(ti => ti.functionId)).size,
    [eventInclusions]
  );

  const openLeft = clickPos.x > window.innerWidth / 2;
  const rawLeft = openLeft
    ? clickPos.x - PANEL_W - PANEL_MARGIN
    : clickPos.x + PANEL_MARGIN;
  const left = Math.max(PANEL_MARGIN, Math.min(window.innerWidth - PANEL_W - PANEL_MARGIN, rawLeft));

  const panelRef = useDialogFocus<HTMLDivElement>();
  const PANEL_H_EST = 260;
  const top = Math.max(PANEL_MARGIN, Math.min(window.innerHeight - PANEL_H_EST - PANEL_MARGIN, clickPos.y - PANEL_H_EST / 2));

  return (
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-panel-title"
        ref={panelRef}
        tabIndex={-1}
        className="absolute bg-card rounded-xl border border-border overflow-hidden animate-in motion-reduce:animate-none fade-in zoom-in-95 duration-150 shadow-3"
        style={{ width: PANEL_W, left, top }}
      >
        <div className={`h-[3px] w-full ${cfg.bar}`} />
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Badge variant="outline" className={`text-2xs ${cfg.bg} ${cfg.text} border ${cfg.border} hover:bg-inherit`}>
              <StatusIcon className="w-2.5 h-2.5 mr-1" />
              {cfg.label}
            </Badge>
            <button
              onClick={onClose}
              aria-label="Fechar detalhes do evento"
              className="w-7 h-7 rounded-full bg-muted hover:bg-border flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <h2 id="event-panel-title" className="text-sm font-bold text-foreground leading-snug">
            {event.name}
          </h2>
        </div>

        <div className="border-t border-border mx-4" />

        <div className="px-4 pt-3.5 pb-4 space-y-3.5">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <MapPin className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
              <span className="text-xs text-slate-700">{event.location}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CalendarDays className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
              <span className="text-xs text-slate-700">{formatDateRange(event.startDate, event.endDate)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
              <span className="text-xs text-slate-700">{days} {days === 1 ? "dia" : "dias"}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-border" />

          <div className="space-y-2.5">
            {/* Nunca mostrar "0 colaboradores" quando na verdade a escala não foi carregada */}
            {loadingTeam ? (
              <p className="text-xs text-muted-foreground">Carregando escala…</p>
            ) : teamError ? (
              <p className="text-xs text-warning">
                Não foi possível carregar a escala deste evento.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <Users className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
                  <span className="text-xs text-slate-700">
                    <span className="font-semibold text-foreground">{collaboratorCount}</span>
                    {" "}{collaboratorCount === 1 ? "colaborador escalado" : "colaboradores escalados"}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Tag className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
                  <span className="text-xs text-slate-700">
                    <span className="font-semibold text-foreground">{functionCount}</span>
                    {" "}{functionCount === 1 ? "função envolvida" : "funções envolvidas"}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-dashed border-border" />

          {/* Atalhos — Escala não lê query params (abre a tela); o Espelho lê ?eventId= */}
          <div className="flex items-center gap-2">
            <Link
              href="/scaling"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-2xs font-semibold text-slate-700 hover:bg-surface-muted transition-colors"
            >
              <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" /> Ver escala
            </Link>
            <Link
              href={`/operational-mirror?eventId=${encodeURIComponent(event.id)}`}
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-2xs font-semibold text-slate-700 hover:bg-surface-muted transition-colors"
            >
              <Table2 className="w-3.5 h-3.5" aria-hidden="true" /> Espelho operacional
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
