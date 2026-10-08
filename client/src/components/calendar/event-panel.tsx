/**
 * Painel flutuante com o detalhe de um evento do Calendário (25/09 — extraído
 * de pages/calendar.tsx): status, local, período, escala e atalhos.
 *
 * 07/10 (redesenho):
 *  - hierarquia: status, nome (título de verdade), e o "onde e quando" com o
 *    período, a duração e "termina em 2 dias" numa linha só (eram três linhas
 *    de ícone colorido iguais, com "4 dias" solto);
 *  - a escala em dois números lado a lado (colaboradores · funções), com
 *    esqueleto enquanto carrega e "Tentar novamente" se falhar;
 *  - atalhos só para as telas que o papel abre: a Área de Função (que entra
 *    pelo Calendário) via "Espelho operacional" e caía em "sem acesso";
 *  - a altura é medida depois de desenhar — com a estimativa fixa de 260px o
 *    rodapé saía da tela perto da borda de baixo;
 *  - celular: folha que sobe do rodapé, com fundo escurecido (um cartão de
 *    296px boiando sobre a grade cobria o dia e não tinha onde tocar fora).
 */
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, CalendarDays, ChevronRight, ClipboardList, MapPin, RotateCw, Table2, X } from "lucide-react";
import type { Event, TeamInclusion } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { listaDeVagasQuery } from "@/hooks/use-vaga-acoes";
import { EventStatusBadge, quandoAcontece } from "@/components/events/events-shared";
import { dayCount, formatDateRange, getEffectiveStatus, useDialogFocus } from "./calendar-shared";

const PANEL_W = 340;
const PANEL_MARGIN = 14;

const ATALHO = "group flex items-center gap-2.5 h-10 px-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SETA = "w-4 h-4 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none";

export function EventPanel({ event, onClose, clickPos }: {
  event: Event;
  onClose: () => void;
  clickPos: { x: number; y: number };
}) {
  const { user } = useAuth();
  const folha = useMediaQuery("(max-width: 639px)");
  const ds = getEffectiveStatus(event);
  const days = dayCount(event.startDate, event.endDate);
  const quando = quandoAcontece(event);
  // Atalhos: só para as telas que o papel abre (as rotas já barram; aqui some o convite).
  const verEscala = hasPermission(user, "canAccessScreen2");
  const verEspelho = hasPermission(user, "canAccessScreen3");

  // Só as vagas DESTE evento (`?eventId=`, 24/09) — antes baixava a fila inteira.
  const { data: teamInclusions = [], isLoading: loadingTeam, isError: teamError, refetch: recarregarEscala, isFetching: buscandoEscala } = useQuery<TeamInclusion[]>(
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

  const panelRef = useDialogFocus<HTMLDivElement>();

  // ── Posição (desktop): ao lado do clique, virando quando não cabe; altura medida. ──
  const [altura, setAltura] = useState(300);
  // Mede antes de pintar e acompanha a troca esqueleto → números/erro da escala.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const medir = () => { if (el.offsetHeight) setAltura(el.offsetHeight); };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelRef]);
  const openLeft = clickPos.x > window.innerWidth / 2;
  const rawLeft = openLeft
    ? clickPos.x - PANEL_W - PANEL_MARGIN
    : clickPos.x + PANEL_MARGIN;
  const left = Math.max(PANEL_MARGIN, Math.min(window.innerWidth - PANEL_W - PANEL_MARGIN, rawLeft));
  const top = Math.max(PANEL_MARGIN, Math.min(window.innerHeight - altura - PANEL_MARGIN, clickPos.y - altura / 2));

  return (
    <div className="fixed inset-0 z-[1000]">
      <div
        className={cn("absolute inset-0", folha && "cal-veu bg-foreground/40")}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-panel-title"
        ref={panelRef}
        tabIndex={-1}
        data-testid="cal-painel"
        className={cn(
          "absolute bg-card border border-border shadow-3 outline-none",
          folha
            ? "cal-folha inset-x-0 bottom-0 rounded-t-2xl max-h-[85dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
            : "cal-flutua rounded-xl overflow-hidden",
        )}
        style={folha ? undefined : { width: PANEL_W, left, top }}
      >
        {folha && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden="true" />}

        {/* Cabeçalho: status, nome e fechar */}
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
          <div className="min-w-0 flex-1">
            <EventStatusBadge ds={ds} />
            <h2 id="event-panel-title" className="m-0 mt-2 text-base font-semibold leading-snug text-foreground">
              {event.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do evento"
            className="pas-alvo -mr-1.5 -mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Onde e quando */}
        <dl className="m-0 px-4 pb-3.5 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0 mt-0.5"><MapPin className="w-4 h-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Local</span></dt>
            <dd className="m-0 text-sm text-foreground leading-5">{event.location}</dd>
          </div>
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0 mt-0.5"><CalendarDays className="w-4 h-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Período</span></dt>
            <dd className="m-0 leading-5">
              <span className="block text-sm text-foreground">{formatDateRange(event.startDate, event.endDate)}</span>
              <span className="block text-xs text-muted-foreground">
                {days} {days === 1 ? "dia" : "dias"}
                {quando && <> · <span className={ds === "em andamento" ? "text-primary font-medium" : undefined}>{quando}</span></>}
              </span>
            </dd>
          </div>
        </dl>

        {/* Escala — nunca "0 colaboradores" quando na verdade não carregou */}
        <div className="mx-4 mb-3.5 rounded-lg border border-border bg-surface-muted/60">
          <p className="m-0 px-3 pt-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Escala</p>
          {loadingTeam ? (
            <div className="grid grid-cols-2 gap-3 px-3 pt-1.5 pb-2.5" role="status" aria-label="Carregando a escala">
              {[0, 1].map(i => (
                <div key={i} className="space-y-1.5"><div className="pas-osso h-5 w-8" /><div className="pas-osso h-3 w-24" /></div>
              ))}
            </div>
          ) : teamError ? (
            <div className="flex items-start gap-2 px-3 pt-1 pb-2.5" role="alert">
              <AlertTriangle className="w-4 h-4 mt-px shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0">
              <p className="m-0 text-xs leading-5 text-slate-700">Não foi possível carregar a escala deste evento.</p>
              <button
                type="button"
                onClick={() => recarregarEscala()}
                disabled={buscandoEscala}
                className="pas-alvo -ml-2 mt-0.5 inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCw className={cn("w-3.5 h-3.5", buscandoEscala && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                Tentar novamente
              </button>
              </div>
            </div>
          ) : (
            <dl className="m-0 grid grid-cols-2 px-3 pt-0.5 pb-2.5">
              {/* dt antes do dd no HTML; o número aparece em cima pelo flex-col-reverse. */}
              <div className="flex flex-col-reverse justify-end">
                <dt className="text-xs text-muted-foreground">{collaboratorCount === 1 ? "colaborador" : "colaboradores"}</dt>
                <dd className="m-0 text-lg font-semibold leading-6 tabular-nums text-foreground" data-testid="cal-painel-colaboradores">{collaboratorCount}</dd>
              </div>
              <div className="flex flex-col-reverse justify-end pl-3 border-l border-border">
                <dt className="text-xs text-muted-foreground">{functionCount === 1 ? "função" : "funções"}</dt>
                <dd className="m-0 text-lg font-semibold leading-6 tabular-nums text-foreground" data-testid="cal-painel-funcoes">{functionCount}</dd>
              </div>
            </dl>
          )}
        </div>

        {/* Atalhos — Escala não lê query params (abre a tela); o Espelho lê ?eventId= */}
        {(verEscala || verEspelho) && (
          <nav aria-label="Atalhos do evento" className="flex flex-col p-1.5 border-t border-border">
            {verEscala && (
              <Link href="/scaling" onClick={onClose} className={ATALHO}>
                <ClipboardList className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate">Ver escala</span>
                <ChevronRight className={SETA} aria-hidden="true" />
              </Link>
            )}
            {verEspelho && (
              <Link href={`/operational-mirror?eventId=${encodeURIComponent(event.id)}`} onClick={onClose} className={ATALHO}>
                <Table2 className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate">Espelho operacional</span>
                <ChevronRight className={SETA} aria-hidden="true" />
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
