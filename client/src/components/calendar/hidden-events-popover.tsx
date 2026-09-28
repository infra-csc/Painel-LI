/**
 * Popover "+ N eventos" de um dia do Mês (25/09 — extraído de pages/calendar.tsx):
 * abre ao lado do clique, vira para o outro lado quando não cabe e rola por dentro.
 */
import { useEffect } from "react";
import type { Event } from "@shared/schema";
import { getCfg, getEffectiveStatus, useDialogFocus, type SelectEventFn } from "./calendar-shared";

const POPOVER_W = 320;

export function HiddenEventsPopover({ dayEvents, title, x, y, onSelectEvent, onClose }: {
  dayEvents: Event[];
  title: string;
  x: number; y: number;
  onSelectEvent: SelectEventFn;
  onClose: () => void;
}) {
  const GAP = 6;
  const EDGE = 8;
  // Hard cap — content scrolls inside
  const MAX_H = 280;
  const HEADER_H = 38;

  // ── Horizontal: prefer right, flip left, clamp ───────────────────────────
  const spaceRight = window.innerWidth - x - GAP;
  const spaceLeft  = x - GAP;
  let left: number;
  if (spaceRight >= POPOVER_W) {
    left = x + GAP;
  } else if (spaceLeft >= POPOVER_W) {
    left = x - POPOVER_W - GAP;
  } else {
    left = spaceRight >= spaceLeft
      ? Math.max(EDGE, window.innerWidth - POPOVER_W - EDGE)
      : EDGE;
  }
  left = Math.max(EDGE, Math.min(window.innerWidth - POPOVER_W - EDGE, left));

  // ── Vertical: prefer below click, flip above if too close to bottom ──────
  const spaceBelow = window.innerHeight - y - GAP;
  const spaceAbove = y - GAP;
  // Estimate actual rendered height (generous: 68px/item for 2-line names)
  const estimatedH = Math.min(dayEvents.length * 68 + HEADER_H, MAX_H);

  let top: number;
  if (spaceBelow >= estimatedH) {
    // Enough room below — open just under click point
    top = y + GAP;
  } else if (spaceAbove >= estimatedH) {
    // Not enough below but enough above — open above click point
    top = y - estimatedH - GAP;
  } else {
    // Tight on both sides — center in viewport
    top = Math.max(EDGE, Math.min(window.innerHeight - estimatedH - EDGE, (window.innerHeight - estimatedH) / 2));
  }
  top = Math.max(EDGE, Math.min(window.innerHeight - EDGE - estimatedH, top));

  const popoverRef = useDialogFocus<HTMLDivElement>();
  // Available height for the scroll container: viewport minus header minus edges
  const maxListH = Math.min(MAX_H - HEADER_H, window.innerHeight - top - HEADER_H - EDGE);

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
        aria-label={title}
        ref={popoverRef}
        tabIndex={-1}
        className="absolute bg-card animate-in motion-reduce:animate-none fade-in zoom-in-95 duration-150 flex flex-col rounded-xl border border-border shadow-3 overflow-hidden"
        style={{ width: POPOVER_W, left, top, maxHeight: MAX_H }}
      >
        {/* Header — always visible */}
        <div className="px-3 py-2.5 border-b border-border shrink-0">
          <span className="text-2xs font-semibold text-muted-foreground capitalize">{title}</span>
        </div>

        {/* Scrollable list */}
        <div
          className="overflow-y-auto divide-y divide-border"
          style={{
            maxHeight: maxListH,
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border) transparent",
          }}
        >
          {dayEvents.map(ev => {
            const cfg = getCfg(getEffectiveStatus(ev));
            const StatusIcon = cfg.icon;
            return (
              <button
                key={ev.id}
                onClick={(e) => { e.stopPropagation(); onSelectEvent(ev, { x: e.clientX, y: e.clientY }); onClose(); }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface-muted text-left transition-colors"
              >
                <div className={`w-6 h-6 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0 mt-0.5`}>
                  <StatusIcon className={`w-3 h-3 ${cfg.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-semibold text-foreground leading-snug overflow-hidden"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
                  >
                    {ev.name}
                  </p>
                  <p className="text-2xs text-muted-foreground truncate leading-tight mt-0.5">{ev.location}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
