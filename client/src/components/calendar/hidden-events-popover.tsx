/**
 * Popover "+ N mais" de um dia do Mês (25/09 — extraído de pages/calendar.tsx):
 * abre ao lado do clique, vira para o outro lado quando não cabe e rola por dentro.
 *
 * 07/10 (redesenho): cabeçalho com o dia por extenso ("Sexta, 16 de outubro",
 * era "16 De Outubro · 6 Eventos" pelo `capitalize`) e a contagem à direita;
 * os eventos no MESMO chip da Semana (nome, local, período, cor do status) —
 * eram ícones de relógio iguais para tudo. A altura é medida depois de
 * desenhar (a estimativa fixa deixava o fim cortado ou um vão embaixo).
 */
import { useEffect, useLayoutEffect, useState } from "react";
import type { Event } from "@shared/schema";
import { ChipDoEvento, diaPorExtenso, useDialogFocus, type SelectEventFn } from "./calendar-shared";

const POPOVER_W = 300;
const GAP = 6;
const EDGE = 8;
// Hard cap — content scrolls inside
const MAX_H = 360;

export function HiddenEventsPopover({ dayEvents, day, x, y, onSelectEvent, onClose }: {
  dayEvents: Event[];
  day: Date;
  x: number; y: number;
  onSelectEvent: SelectEventFn;
  onClose: () => void;
}) {
  const popoverRef = useDialogFocus<HTMLDivElement>();
  const titulo = diaPorExtenso(day);
  const n = dayEvents.length;

  // ── Horizontal: prefer right, flip left, clamp ───────────────────────────
  const spaceRight = window.innerWidth - x - GAP;
  const spaceLeft = x - GAP;
  let left: number;
  if (spaceRight >= POPOVER_W) left = x + GAP;
  else if (spaceLeft >= POPOVER_W) left = x - POPOVER_W - GAP;
  else left = spaceRight >= spaceLeft ? window.innerWidth - POPOVER_W - EDGE : EDGE;
  left = Math.max(EDGE, Math.min(window.innerWidth - POPOVER_W - EDGE, left));

  // ── Vertical: abaixo do clique; se não couber, acima; senão, centrado. Altura real medida. ──
  const [altura, setAltura] = useState<number>(Math.min(MAX_H, 48 + n * 72));
  useLayoutEffect(() => {
    const h = popoverRef.current?.offsetHeight;
    if (h) setAltura(h);
  }, [popoverRef, n]);
  const maxH = Math.min(MAX_H, window.innerHeight - 2 * EDGE);
  const h = Math.min(altura, maxH);
  let top: number;
  if (window.innerHeight - y - GAP >= h) top = y + GAP;
  else if (y - GAP >= h) top = y - h - GAP;
  else top = (window.innerHeight - h) / 2;
  top = Math.max(EDGE, Math.min(window.innerHeight - EDGE - h, top));

  // Close on ESC key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${titulo}: ${n} ${n === 1 ? "evento" : "eventos"}`}
        ref={popoverRef}
        tabIndex={-1}
        className="cal-flutua absolute bg-card flex flex-col rounded-xl border border-border shadow-3 overflow-hidden outline-none"
        style={{ width: POPOVER_W, left, top, maxHeight: maxH }}
        data-testid="cal-popover-dia"
      >
        <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">{titulo}</span>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{n} {n === 1 ? "evento" : "eventos"}</span>
        </div>
        <div className="overflow-y-auto overscroll-contain p-2 flex flex-col gap-1" style={{ scrollbarWidth: "thin" }}>
          {dayEvents.map(ev => (
            <ChipDoEvento
              key={ev.id}
              ev={ev}
              onSelect={(e, pos) => { onSelectEvent(e, pos); onClose(); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
