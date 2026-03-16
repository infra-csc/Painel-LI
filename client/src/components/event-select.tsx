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
                  <span className="truncate block max-w-[260px]">{event.name}</span>
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
  if (!start) return "";
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export function EventSearchSelect({ value, onValueChange, events, className }: EventSelectProps) {
  const sorted = useSortedEvents(events);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedEvent = useMemo(() => events?.find(e => e.id === value), [events, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(e => e.name.toLowerCase().includes(q));
  }, [sorted, search]);

  function updateRect() {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
  }

  function handleOpen() {
    updateRect();
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelect(eventId: string) {
    onValueChange(eventId);
    setIsOpen(false);
    setSearch("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange("");
  }

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(ev: MouseEvent) {
      const target = ev.target as Node;
      const portal = document.getElementById("event-search-portal");
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        portal && !portal.contains(target)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    }
    function handleScroll() { updateRect(); }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  const dropdown = isOpen && dropdownRect && createPortal(
    <div
      id="event-search-portal"
      style={{
        position: 'absolute',
        top: dropdownRect.top,
        left: dropdownRect.left,
        width: Math.max(dropdownRect.width, 300),
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
        overflow: 'hidden',
      }}
    >
      {/* Search bar inside dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>
        <Search style={{ width: 14, height: 14, color: '#94A3B8', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar evento..."
          style={{
            flex: 1, fontSize: 13, outline: 'none', border: 'none',
            background: 'transparent', color: '#1E293B',
          }}
        />
        {search && (
          <button
            onMouseDown={e => { e.preventDefault(); setSearch(""); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94A3B8', display: 'flex', alignItems: 'center' }}
          >
            <X style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>
      {/* List */}
      <div style={{ maxHeight: 252, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Nenhum evento encontrado
          </div>
        ) : (
          filtered.map((event, i) => {
            const isSelected = event.id === value;
            return (
              <button
                key={event.id}
                onMouseDown={e => { e.preventDefault(); handleSelect(event.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 14px', border: 'none',
                  background: isSelected ? '#F5F3FF' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F8FAFC' : 'none',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Calendar style={{ width: 14, height: 14, color: isSelected ? '#7C3AED' : '#94A3B8', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#7C3AED' : '#1E293B',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {event.name}
                  </div>
                  {(event.startDate || event.endDate) && (
                    <div style={{ fontSize: 11, color: isSelected ? '#A78BFA' : '#94A3B8', marginTop: 1 }}>
                      {fmtEventDate(event.startDate, event.endDate)}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C3AED', flexShrink: 0 }} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 280 }} className={className}>
      {/* Trigger */}
      <button
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 12px',
          width: '100%', border: isOpen ? '1px solid #7C3AED' : '1px solid #CBD5E1',
          borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14,
          color: selectedEvent ? '#1E293B' : '#94A3B8',
          boxShadow: isOpen ? '0 0 0 3px rgba(124,58,237,0.1)' : '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <Search style={{ width: 14, height: 14, color: isOpen ? '#7C3AED' : '#94A3B8', flexShrink: 0 }} />
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

      {dropdown}
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
