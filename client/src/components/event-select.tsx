import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Calendar, Search, X, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Event } from "@shared/schema";

interface EventSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  events: Event[] | undefined;
  className?: string;
}

function useSortedEvents(events: Event[] | undefined) {
  return useMemo(() => {
    if (!events) return [];
    return [...events].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [events]);
}

function EventItems({ events, checkedClass }: { events: Event[]; checkedClass: string }) {
  return (
    <>
      {events.map((event, index) => (
        <TooltipProvider key={event.id} delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                {index > 0 && (
                  <div className="mx-2 h-px bg-gray-100 dark:bg-gray-800" />
                )}
                <SelectItem
                  value={event.id}
                  className={`py-2.5 px-3 pl-8 text-[14px] rounded-md cursor-pointer ${checkedClass} data-[state=checked]:font-semibold focus:bg-gray-50 dark:focus:bg-gray-800`}
                >
                  <span className="break-words">{event.name}</span>
                </SelectItem>
              </div>
            </TooltipTrigger>
            {event.name.length > 35 && (
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-sm">{event.name}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      ))}
    </>
  );
}

export function EventSelect({ value, onValueChange, events, className }: EventSelectProps) {
  const sorted = useSortedEvents(events);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`h-11 min-w-[280px] px-3.5 text-[15px] rounded-lg border-gray-300 dark:border-gray-600 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 transition-colors ${className ?? ""}`}
      >
        <Calendar className="w-4.5 h-4.5 text-gray-400 dark:text-gray-500 mr-2.5 shrink-0" />
        <SelectValue placeholder="Selecionar evento" />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-lg border-gray-200 dark:border-gray-700">
        <EventItems events={sorted} checkedClass="data-[state=checked]:bg-blue-50 dark:data-[state=checked]:bg-blue-950/30 data-[state=checked]:text-blue-700 dark:data-[state=checked]:text-blue-300" />
      </SelectContent>
    </Select>
  );
}

function fmtEventDate(start?: string, end?: string) {
  const target = end && end !== start ? end : start;
  if (!target) return "";
  const [y, m, day] = target.split("-");
  return `${day}/${m}/${y}`;
}

export function EventSearchSelect({ value, onValueChange, events, className }: EventSelectProps) {
  const sorted = useSortedEvents(events);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedEvent = useMemo(() => events?.find(e => e.id === value), [events, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(e => e.name.toLowerCase().includes(q));
  }, [sorted, search]);

  function handleOpen() {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function handleClose() {
    setIsOpen(false);
    setSearch("");
  }

  function handleSelect(eventId: string) {
    onValueChange(eventId);
    handleClose();
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange("");
  }

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Command palette portal — renders at document.body, always centered, never clipped
  const palette = isOpen && createPortal(
    <div
      id="event-command-palette"
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Modal */}
      <div
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(255, 255, 255, 0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(226, 232, 240, 0.6)',
          borderRadius: 18,
          boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,51,204,0.08)',
          overflow: 'hidden',
          animation: 'cmdPaletteIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Search header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid #F1F5F9',
        }}>
          <Search style={{ width: 18, height: 18, color: '#0033CC', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            style={{
              flex: 1, fontSize: 15, fontWeight: 500,
              outline: 'none', border: 'none', background: 'transparent',
              color: '#0F172A', caretColor: '#0033CC',
            }}
          />
          {search ? (
            <button
              onMouseDown={e => { e.preventDefault(); setSearch(""); }}
              style={{
                background: '#F1F5F9', border: 'none', cursor: 'pointer',
                padding: '4px', borderRadius: 6, color: '#94A3B8',
                display: 'flex', alignItems: 'center',
              }}
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          ) : (
            <kbd style={{
              fontSize: 11, color: '#94A3B8', background: '#F8FAFC',
              border: '1px solid #E2E8F0', borderRadius: 5,
              padding: '2px 6px', fontFamily: 'inherit',
            }}>ESC</kbd>
          )}
        </div>

        {/* Event count badge */}
        {!search && (
          <div style={{
            padding: '8px 20px 4px',
            fontSize: 11, fontWeight: 600, color: '#94A3B8',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {sorted.length} evento{sorted.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* List */}
        <div className="event-search-list" style={{ overflowY: 'auto', padding: '4px 10px 12px', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '32px 16px', textAlign: 'center',
              color: '#94A3B8', fontSize: 14,
            }}>
              <Search style={{ width: 28, height: 28, color: '#CBD5E1', marginBottom: 8 }} />
              <div>Nenhum evento encontrado</div>
              <div style={{ fontSize: 12, marginTop: 4, color: '#CBD5E1' }}>Tente outro termo de busca</div>
            </div>
          ) : (
            filtered.map((event) => {
              const isSelected = event.id === value;
              return (
                <button
                  key={event.id}
                  onMouseDown={e => { e.preventDefault(); handleSelect(event.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 13,
                    width: '100%', padding: '11px 12px',
                    border: 'none', borderRadius: 12, marginBottom: 3,
                    cursor: 'pointer', textAlign: 'left', outline: 'none',
                    background: isSelected
                      ? 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)'
                      : 'transparent',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.background = '#F0F7FF';
                      (e.currentTarget as HTMLElement).style.transform = 'translateX(3px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                    }
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: isSelected
                      ? 'linear-gradient(135deg, #0033CC, #0044FF)'
                      : '#F1F5F9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isSelected ? '0 3px 10px rgba(0,51,204,0.28)' : 'none',
                    transition: 'all 0.12s ease',
                  }}>
                    <Calendar style={{ width: 15, height: 15, color: isSelected ? '#fff' : '#94A3B8' }} />
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600,
                      color: isSelected ? '#0033CC' : '#0F172A',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      letterSpacing: '-0.01em',
                    }}>
                      {event.name}
                    </div>
                    {(event.startDate || event.endDate) && (
                      <div style={{ fontSize: 12, color: isSelected ? '#5580FF' : '#94A3B8', marginTop: 2 }}>
                        {fmtEventDate(event.startDate, event.endDate)}
                      </div>
                    )}
                  </div>

                  {/* Check */}
                  {isSelected && (
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#0033CC', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,51,204,0.35)',
                    }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M2 5.5l2.5 2.5L9 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div style={{ position: 'relative', minWidth: 280 }} className={className}>
      {/* Trigger */}
      <button
        onClick={handleOpen}
        className="hover:scale-[1.015] active:scale-[0.985]"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px',
          width: '100%',
          border: isOpen ? '1.5px solid #0033CC' : '1px solid #CBD5E1',
          borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 14,
          color: selectedEvent ? '#1E293B' : '#94A3B8',
          boxShadow: isOpen
            ? '0 0 0 3px rgba(0,51,204,0.10), 0 2px 8px rgba(0,51,204,0.08)'
            : '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <Search style={{ width: 14, height: 14, color: isOpen ? '#0033CC' : '#94A3B8', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedEvent ? 500 : 400 }}>
          {selectedEvent ? selectedEvent.name : 'Selecionar evento'}
        </span>
        {selectedEvent ? (
          <button
            onMouseDown={e => { e.preventDefault(); }}
            onClick={handleClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94A3B8', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        ) : (
          <ChevronDown style={{ width: 14, height: 14, color: '#94A3B8', flexShrink: 0 }} />
        )}
      </button>

      {palette}
    </div>
  );
}

export function EventSelectCTA({
  value,
  onValueChange,
  events,
  accentColor = "blue",
}: EventSelectProps & { accentColor?: "blue" | "purple" | "emerald" }) {
  const sorted = useSortedEvents(events);

  const colorMap = {
    blue: {
      border: "border-blue-300 dark:border-blue-700 hover:border-blue-400",
      icon: "text-blue-500",
      checked: "data-[state=checked]:bg-blue-50 dark:data-[state=checked]:bg-blue-950/30 data-[state=checked]:text-blue-700 dark:data-[state=checked]:text-blue-300",
    },
    purple: {
      border: "border-purple-300 dark:border-purple-700 hover:border-purple-400",
      icon: "text-purple-500",
      checked: "data-[state=checked]:bg-purple-50 dark:data-[state=checked]:bg-purple-950/30 data-[state=checked]:text-purple-700 dark:data-[state=checked]:text-purple-300",
    },
    emerald: {
      border: "border-emerald-300 dark:border-emerald-700 hover:border-emerald-400",
      icon: "text-emerald-500",
      checked: "data-[state=checked]:bg-emerald-50 dark:data-[state=checked]:bg-emerald-950/30 data-[state=checked]:text-emerald-700 dark:data-[state=checked]:text-emerald-300",
    },
  };

  const colors = colorMap[accentColor];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`w-72 h-11 px-3.5 text-[15px] mx-auto bg-white dark:bg-gray-800 ${colors.border} rounded-lg shadow-sm transition-colors`}
      >
        <Calendar className={`w-4.5 h-4.5 ${colors.icon} mr-2.5 shrink-0`} />
        <SelectValue placeholder="Selecionar evento" />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-lg border-gray-200 dark:border-gray-700">
        <EventItems events={sorted} checkedClass={`${colors.checked}`} />
      </SelectContent>
    </Select>
  );
}
