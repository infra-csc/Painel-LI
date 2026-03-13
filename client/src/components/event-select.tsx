import { useMemo, useState, useEffect, useRef } from "react";
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

export function EventSearchSelect({ value, onValueChange, events, className }: EventSelectProps) {
  const sorted = useSortedEvents(events);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedEvent = useMemo(() => events?.find(e => e.id === value), [events, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    return sorted.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  }, [sorted, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleOpen() {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelect(eventId: string) {
    onValueChange(eventId);
    setIsOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 280 }} className={className}>
      {/* Trigger button — shows selected event or placeholder */}
      {!isOpen ? (
        <button
          onClick={handleOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px',
            width: '100%', border: '1px solid #CBD5E1', borderRadius: 8,
            background: '#fff', cursor: 'pointer', fontSize: 14,
            color: value && selectedEvent ? '#1E293B' : '#94A3B8',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <Calendar style={{ width: 16, height: 16, color: '#3B5BDB', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: value ? 500 : 400 }}>
            {selectedEvent ? selectedEvent.name : 'Selecionar evento'}
          </span>
          <ChevronDown style={{ width: 14, height: 14, color: '#94A3B8', flexShrink: 0 }} />
        </button>
      ) : (
        /* Search input */
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search style={{ position: 'absolute', left: 12, width: 15, height: 15, color: '#94A3B8', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            style={{
              width: '100%', height: 44, paddingLeft: 36, paddingRight: search ? 36 : 14,
              border: '1px solid #3B5BDB', borderRadius: 8, fontSize: 14, outline: 'none',
              boxShadow: '0 0 0 3px rgba(59,91,219,0.1)', color: '#1E293B', background: '#fff',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94A3B8', display: 'flex', alignItems: 'center' }}
            >
              <X style={{ width: 15, height: 15 }} />
            </button>
          )}
        </div>
      )}

      {/* Dropdown list */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '14px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Nenhum evento encontrado
            </div>
          ) : (
            filtered.map((event, i) => (
              <button
                key={event.id}
                onClick={() => handleSelect(event.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', border: 'none',
                  background: event.id === value ? '#EEF2FF' : 'transparent',
                  cursor: 'pointer', fontSize: 14,
                  color: event.id === value ? '#3B5BDB' : '#1E293B',
                  textAlign: 'left', fontWeight: event.id === value ? 600 : 400,
                  borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none',
                }}
                onMouseEnter={e => { if (event.id !== value) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                onMouseLeave={e => { if (event.id !== value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Calendar style={{ width: 15, height: 15, color: event.id === value ? '#3B5BDB' : '#94A3B8', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</span>
              </button>
            ))
          )}
        </div>
      )}
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
