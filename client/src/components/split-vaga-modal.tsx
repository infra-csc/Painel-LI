import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, UserPlus, Check, AlertTriangle, Info,
  Calendar, Briefcase, Sun, Moon, Car, Utensils,
  TrendingUp, TrendingDown, ChevronRight, ArrowLeft, CheckCheck, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fixEncoding } from "@/lib/utils";
import type { BudgetActual, Collaborator, TeamInclusion } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  while (cur <= end) {
    days.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function isWeekend(d: string) {
  const day = new Date(d + "T12:00:00").getDay();
  return day === 0 || day === 6;
}

function formatDay(d: string) {
  const dt = new Date(d + "T12:00:00");
  const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const mo = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${wd[dt.getDay()]} ${dt.getDate()}/${mo[dt.getMonth()]}`;
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtR$(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function avatarColor(name: string): string {
  const colors = [
    "from-violet-500 to-purple-600", "from-blue-500 to-indigo-600",
    "from-emerald-500 to-teal-600", "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-600", "from-cyan-500 to-sky-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?";
}

function capitalizeName(name: string): string {
  return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function SmLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
      {children}
    </p>
  );
}

function ModalCurrencyInput({ value, onChange, disabled, className }: {
  value: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => (value / 100).toFixed(2).replace(".", ","));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDisplay((value / 100).toFixed(2).replace(".", ","));
    }
  }, [value]);

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      className={`bg-slate-50 border-slate-200 rounded-lg font-medium focus-visible:ring-2 focus-visible:ring-violet-300/60 focus-visible:border-violet-300 transition-colors ${className ?? ''}`}
      value={display}
      onChange={e => {
        const raw = e.target.value;
        setDisplay(raw);
        const parsed = parseFloat(raw.replace(",", "."));
        if (!isNaN(parsed)) onChange(Math.round(parsed * 100));
      }}
      onBlur={() => {
        const parsed = parseFloat(display.replace(",", "."));
        if (!isNaN(parsed)) {
          const cents = Math.round(parsed * 100);
          onChange(cents);
          setDisplay((cents / 100).toFixed(2).replace(".", ","));
        } else {
          setDisplay((value / 100).toFixed(2).replace(".", ","));
        }
      }}
      onFocus={() => setTimeout(() => inputRef.current?.select(), 0)}
      disabled={disabled}
    />
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SplitVagaModalProps {
  item: BudgetActual;
  collaborators: Collaborator[];
  teamInclusion: TeamInclusion | undefined;
  takenDays?: string[];
  onClose: () => void;
  onConfirm: (payload: {
    collaboratorId: string;
    workedDays: string[];
    parentWorkedDays: string[];
    mobility: number;
    weekdayLunch: number;
    weekdayDinner: number;
    weekendLunch: number;
    weekendDinner: number;
    dailyValue: number;
    dailyQuantity: number;
    totalValue: number;
    parentValues: {
      weekdayLunch: number;
      weekdayDinner: number;
      weekendLunch: number;
      weekendDinner: number;
      mobility: number;
      dailyQuantity: number;
      totalValue: number;
    };
  }) => void;
  isPending?: boolean;
}

interface Step2Form {
  valorDiariaUtil: number;
  valorDiariaFds: number;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobility: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SplitVagaModal({
  item, collaborators, teamInclusion, takenDays = [], onClose, onConfirm, isPending,
}: SplitVagaModalProps) {

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [collabSearch, setCollabSearch] = useState("");
  const [selectedCollabId, setSelectedCollabId] = useState<string | null>(null);
  const [collabDropOpen, setCollabDropOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [showZeroDayConfirm, setShowZeroDayConfirm] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [step2Form, setStep2Form] = useState<Step2Form>({
    valorDiariaUtil: item.dailyValue,
    valorDiariaFds: item.dailyValue,
    weekdayLunch: 0,
    weekdayDinner: 0,
    weekendLunch: 0,
    weekendDinner: 0,
    mobility: 0,
  });

  // ── Derived (step 1) ──────────────────────────────────────────────────────
  const availableDays = useMemo(() => {
    const s = teamInclusion?.scheduleStartDate;
    const e = teamInclusion?.scheduleEndDate;
    if (s && e) return getDaysInRange(s, e);
    return [];
  }, [teamInclusion]);

  const parentWorkedDays = useMemo(() => {
    if (item.workedDays && item.workedDays.length > 0) return item.workedDays;
    return availableDays;
  }, [item.workedDays, availableDays]);

  const parentWeekdayCount = useMemo(() => parentWorkedDays.filter(d => !isWeekend(d)).length, [parentWorkedDays]);
  const parentWeekendCount = useMemo(() => parentWorkedDays.filter(d => isWeekend(d)).length, [parentWorkedDays]);

  const perDayWeekdayLunch = parentWeekdayCount > 0 ? Math.round((item.weekdayLunch || 0) / parentWeekdayCount) : 0;
  const perDayWeekdayDinner = parentWeekdayCount > 0 ? Math.round((item.weekdayDinner || 0) / parentWeekdayCount) : 0;
  const perDayWeekendLunch = parentWeekendCount > 0 ? Math.round((item.weekendLunch || 0) / parentWeekendCount) : 0;
  const perDayWeekendDinner = parentWeekendCount > 0 ? Math.round((item.weekendDinner || 0) / parentWeekendCount) : 0;

  const selDaysSorted = useMemo(() => Array.from(selectedDays).sort(), [selectedDays]);
  const selWeekdays = useMemo(() => selDaysSorted.filter(d => !isWeekend(d)).length, [selDaysSorted]);
  const selWeekends = useMemo(() => selDaysSorted.filter(d => isWeekend(d)).length, [selDaysSorted]);

  const remainingForParent = useMemo(() => parentWorkedDays.filter(d => !selectedDays.has(d)), [parentWorkedDays, selectedDays]);
  const takenSet = useMemo(() => new Set(takenDays), [takenDays]);

  const filteredCollabs = useMemo(() => {
    const q = collabSearch.toLowerCase();
    return collaborators
      .filter(c => c.id !== item.collaboratorId)
      .filter(c => !q || fixEncoding(c.fullName || "").toLowerCase().includes(q))
      .sort((a, b) => fixEncoding(a.fullName || "").localeCompare(fixEncoding(b.fullName || ""), "pt-BR"))
      .slice(0, 60);
  }, [collaborators, collabSearch, item.collaboratorId]);

  const selectedCollab = collaborators.find(c => c.id === selectedCollabId);

  // ── Derived (step 2) ──────────────────────────────────────────────────────
  const s2SubDiariasUtil = selWeekdays * step2Form.valorDiariaUtil;
  const s2SubDiariasFds = selWeekends * step2Form.valorDiariaFds;
  const s2SubDiarias = s2SubDiariasUtil + s2SubDiariasFds;
  const s2TotalAlim = step2Form.weekdayLunch + step2Form.weekdayDinner + step2Form.weekendLunch + step2Form.weekendDinner;
  const s2Realizado = s2SubDiarias + step2Form.mobility + s2TotalAlim;
  const plannedDiariasUtil = selWeekdays * item.dailyValue;
  const plannedDiariasFds = selWeekends * item.dailyValue;
  const plannedMobility = parentWorkedDays.length > 0
    ? Math.round((item.mobility || 0) * selectedDays.size / parentWorkedDays.length)
    : 0;
  const plannedAlimUtil = selWeekdays * (perDayWeekdayLunch + perDayWeekdayDinner);
  const plannedAlimFds = selWeekends * (perDayWeekendLunch + perDayWeekendDinner);
  const proportionalPlanned = plannedDiariasUtil + plannedDiariasFds + plannedMobility + plannedAlimUtil + plannedAlimFds;
  const proportionalPlannedBreakdown = (() => {
    const parts: string[] = [];
    if (selWeekdays > 0) parts.push(`${selWeekdays} dia(s) útil × ${fmtR$(item.dailyValue)}`);
    if (selWeekends > 0) parts.push(`${selWeekends} fim de sem. × ${fmtR$(item.dailyValue)}`);
    if (plannedMobility > 0) parts.push(`mobilidade ${fmtR$(plannedMobility)}`);
    const totalAlim = plannedAlimUtil + plannedAlimFds;
    if (totalAlim > 0) parts.push(`alimentação ${fmtR$(totalAlim)}`);
    return parts.join(" + ");
  })();
  const s2Difference = s2Realizado - proportionalPlanned;

  // ── Handlers ──────────────────────────────────────────────────────────────
  function toggleDay(day: string) {
    if (takenSet.has(day)) return;
    setSelectedDays(prev => {
      const s = new Set(prev);
      if (s.has(day)) s.delete(day); else s.add(day);
      return s;
    });
  }

  function openDrop() {
    if (dropRef.current) {
      const r = dropRef.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    setCollabDropOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => {
    if (!collabDropOpen) return;
    function h(e: MouseEvent) {
      const portal = document.getElementById("split-collab-portal");
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        portal && !portal.contains(e.target as Node)
      ) setCollabDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [collabDropOpen]);

  function goToStep2() {
    if (!selectedCollabId || selectedDays.size === 0) return;
    const newWeekdays = selDaysSorted.filter(d => !isWeekend(d)).length;
    const newWeekends = selDaysSorted.filter(d => isWeekend(d)).length;
    const proRateMobility = parentWorkedDays.length > 0
      ? Math.round((item.mobility || 0) * selectedDays.size / parentWorkedDays.length)
      : 0;
    setStep2Form({
      valorDiariaUtil: item.dailyValue,
      valorDiariaFds: item.dailyValue,
      weekdayLunch: newWeekdays * perDayWeekdayLunch,
      weekdayDinner: newWeekdays * perDayWeekdayDinner,
      weekendLunch: newWeekends * perDayWeekendLunch,
      weekendDinner: newWeekends * perDayWeekendDinner,
      mobility: proRateMobility,
    });
    setStep(2);
  }

  function attemptConfirm() {
    if (remainingForParent.length === 0) {
      setShowZeroDayConfirm(true);
    } else {
      doConfirm();
    }
  }

  function doConfirm() {
    if (!selectedCollabId) return;
    const totalDays = selDaysSorted.length;
    const wkdys = selDaysSorted.filter(d => !isWeekend(d)).length;
    const wknds = selDaysSorted.filter(d => isWeekend(d)).length;
    const subUtil = wkdys * step2Form.valorDiariaUtil;
    const subFds = wknds * step2Form.valorDiariaFds;
    const subDiarias = subUtil + subFds;
    const totalAlim = step2Form.weekdayLunch + step2Form.weekdayDinner + step2Form.weekendLunch + step2Form.weekendDinner;
    const totalValue = subDiarias + step2Form.mobility + totalAlim;
    const dailyValue = totalDays > 0 ? Math.round(subDiarias / totalDays) : 0;

    // Compute parent's new values for remaining days
    const remWkdys = remainingForParent.filter(d => !isWeekend(d)).length;
    const remWknds = remainingForParent.filter(d => isWeekend(d)).length;
    const parentNewWeekdayLunch = remWkdys * perDayWeekdayLunch;
    const parentNewWeekdayDinner = remWkdys * perDayWeekdayDinner;
    const parentNewWeekendLunch = remWknds * perDayWeekendLunch;
    const parentNewWeekendDinner = remWknds * perDayWeekendDinner;
    const parentNewMobility = parentWorkedDays.length > 0
      ? Math.round((item.mobility || 0) * remainingForParent.length / parentWorkedDays.length)
      : 0;
    const parentNewDiarias = remainingForParent.length * item.dailyValue;
    const parentNewTotal = parentNewDiarias + parentNewMobility + parentNewWeekdayLunch + parentNewWeekdayDinner + parentNewWeekendLunch + parentNewWeekendDinner;

    onConfirm({
      collaboratorId: selectedCollabId,
      workedDays: selDaysSorted,
      parentWorkedDays: remainingForParent,
      mobility: step2Form.mobility,
      weekdayLunch: step2Form.weekdayLunch,
      weekdayDinner: step2Form.weekdayDinner,
      weekendLunch: step2Form.weekendLunch,
      weekendDinner: step2Form.weekendDinner,
      dailyValue,
      dailyQuantity: totalDays,
      totalValue,
      parentValues: {
        weekdayLunch: parentNewWeekdayLunch,
        weekdayDinner: parentNewWeekdayDinner,
        weekendLunch: parentNewWeekendLunch,
        weekendDinner: parentNewWeekendDinner,
        mobility: parentNewMobility,
        dailyQuantity: remainingForParent.length,
        totalValue: parentNewTotal,
      },
    });
  }

  const canGoNext = !!selectedCollabId && selectedDays.size > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-[680px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" style={{border:'1px solid rgba(0,0,0,0.06)'}}>

          {/* ── Title header ── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{background: '#6d28d9'}}>
                <UserPlus className="w-4.5 h-4.5 text-white" style={{width:18,height:18}} />
              </div>
              <div>
                <p className="font-bold text-[15px] text-slate-800 leading-tight m-0">Dividir escalação</p>
                <p className="text-xs text-slate-400 m-0">Atribua dias específicos a outro colaborador</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Step indicator ── */}
          <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex-shrink-0">
            {/* Step 1 */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{background: step === 1 ? '#6d28d9' : '#10B981'}}>
                {step === 1 ? '1' : '✓'}
              </div>
              <span className="text-xs font-semibold" style={{color: step === 1 ? '#6d28d9' : '#10B981'}}>
                Colaborador & dias
              </span>
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            {/* Step 2 */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{background: step === 2 ? '#6d28d9' : '#E2E8F0', color: step === 2 ? '#fff' : '#94A3B8'}}>
                2
              </div>
              <span className="text-xs font-semibold" style={{color: step === 2 ? '#6d28d9' : '#94A3B8'}}>
                Valores
              </span>
            </div>
          </div>

          {/* ══ STEP 1 ══════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="flex flex-col gap-5 flex-1 overflow-y-auto px-6 py-5 bg-slate-50">

              {/* Collaborator picker */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Colaborador</p>
                <div ref={dropRef}>
                  <button
                    onClick={openDrop}
                    className="flex items-center justify-between gap-2 w-full h-11 px-3 rounded-lg bg-white text-left cursor-pointer transition-all"
                    style={{
                      border: collabDropOpen ? '1.5px solid #6d28d9' : '1.5px solid #E2E8F0',
                      boxShadow: collabDropOpen ? '0 0 0 3px rgba(109,40,217,0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {selectedCollab ? (
                        <>
                          <div className="w-7 h-7 rounded-[8px] flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                            style={{background: '#6d28d9'}}>
                            {fixEncoding(selectedCollab.fullName || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-slate-800 truncate">
                            {capitalizeName(fixEncoding(selectedCollab.fullName || ""))}
                          </span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="text-sm text-slate-400">Buscar colaborador...</span>
                        </>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 transition-transform" style={{transform: collabDropOpen ? 'rotate(180deg)' : 'none'}} />
                  </button>

                  {collabDropOpen && dropRect && createPortal(
                    <div
                      id="split-collab-portal"
                      className="absolute bg-white rounded-xl overflow-hidden"
                      style={{
                        top: dropRect.top, left: dropRect.left, width: dropRect.width,
                        zIndex: 10000,
                        border: '1.5px solid #E2E8F0',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                      }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
                        <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <input
                          ref={inputRef}
                          value={collabSearch}
                          onChange={e => setCollabSearch(e.target.value)}
                          placeholder="Buscar colaborador..."
                          className="flex-1 border-0 outline-none text-[13px] text-slate-800 bg-transparent"
                        />
                      </div>
                      <div className="max-h-[240px] overflow-y-auto">
                        {filteredCollabs.length === 0 ? (
                          <div className="py-4 text-center text-slate-400 text-[13px]">Nenhum colaborador encontrado</div>
                        ) : filteredCollabs.map(c => {
                          const name = capitalizeName(fixEncoding(c.fullName || ""));
                          const isSel = c.id === selectedCollabId;
                          const ini = fixEncoding(c.fullName || "?").charAt(0).toUpperCase();
                          return (
                            <button
                              key={c.id}
                              onMouseDown={e => { e.preventDefault(); setSelectedCollabId(c.id); setCollabDropOpen(false); setCollabSearch(""); }}
                              className="flex items-center gap-2.5 w-full px-3.5 py-2 border-0 border-b border-slate-50 cursor-pointer text-left transition-colors"
                              style={{background: isSel ? '#EDE9FE' : 'transparent'}}
                              onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              <div className="w-7 h-7 rounded-[8px] flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                                style={{background: isSel ? '#6d28d9' : '#94A3B8'}}>
                                {ini}
                              </div>
                              <span className="text-[13px] truncate" style={{fontWeight: isSel ? 600 : 400, color: isSel ? '#6D28D9' : '#334155'}}>
                                {name}
                              </span>
                              {isSel && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{color: '#6d28d9'}} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              </div>

              {/* Day picker */}
              {availableDays.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Dias que este colaborador irá cobrir
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableDays.map(day => {
                      const isSel = selectedDays.has(day);
                      const isTaken = takenSet.has(day);
                      const notParent = !parentWorkedDays.includes(day);
                      const wknd = isWeekend(day);

                      let bg = '#F8FAFC', border = '#E2E8F0', color = '#64748B';
                      if (isTaken) { bg = '#F1F5F9'; border = '#CBD5E1'; color = '#CBD5E1'; }
                      else if (isSel && wknd) { bg = '#FFF7ED'; border = '#F97316'; color = '#C2410C'; }
                      else if (isSel) { bg = '#EDE9FE'; border = '#6d28d9'; color = '#6d28d9'; }
                      else if (wknd) { bg = '#FFFBEB'; border = '#FDE68A'; color = '#92400E'; }

                      return (
                        <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          disabled={isTaken}
                          title={isTaken ? "Dia já atribuído a outro colaborador desta divisão" : undefined}
                          className="flex flex-col items-center rounded-xl transition-all"
                          style={{
                            padding: '6px 10px', minWidth: 56,
                            cursor: isTaken ? 'not-allowed' : 'pointer',
                            border: `1.5px solid ${border}`, background: bg,
                            opacity: isTaken ? 0.5 : 1,
                          }}
                        >
                          {isSel && !isTaken
                            ? <Check style={{width:12, height:12, color, marginBottom:1}} />
                            : <span style={{fontSize: 9, fontWeight: 700, color: isTaken ? '#CBD5E1' : wknd ? '#F59E0B' : '#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em', lineHeight:'14px'}}>
                                {new Date(day+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','').toUpperCase()}
                              </span>
                          }
                          <span style={{fontSize: 13, fontWeight: 700, color, lineHeight: '16px', textDecoration: isTaken ? 'line-through' : 'none'}}>
                            {new Date(day+'T12:00:00').getDate()}
                          </span>
                          <span style={{fontSize: 9, color: isTaken ? '#CBD5E1' : '#94A3B8', lineHeight:'12px'}}>
                            {new Date(day+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase()}
                          </span>
                          {notParent && !isSel && !isTaken && (
                            <span style={{fontSize:8, color:'#F59E0B', marginTop:1}}>⚠</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedDays.size > 0 && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                      <p className="text-xs text-slate-600 m-0">
                        <strong>{selectedDays.size}</strong> {selectedDays.size === 1 ? 'dia selecionado' : 'dias selecionados'}
                        {selWeekdays > 0 && <span className="text-indigo-600"> · {selWeekdays} {selWeekdays === 1 ? 'útil' : 'úteis'}</span>}
                        {selWeekends > 0 && <span className="text-amber-600"> · {selWeekends} fim{selWeekends > 1 ? 's' : ''} de semana</span>}
                      </p>
                    </div>
                  )}
                  {takenDays.length > 0 && (
                    <div className="flex gap-2 items-start mt-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                      <Info className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-slate-500 m-0">Dias acinzentados já estão atribuídos a outro colaborador desta divisão.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Validations */}
              {!selectedCollabId && (
                <div className="flex items-center gap-2 text-xs text-red-500">
                  <AlertTriangle className="w-3.5 h-3.5" /> Selecione um colaborador para continuar.
                </div>
              )}
              {selectedCollabId && selectedDays.size === 0 && (
                <div className="flex items-center gap-2 text-xs text-red-500">
                  <AlertTriangle className="w-3.5 h-3.5" /> Selecione pelo menos 1 dia para o novo colaborador.
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2.5 pt-1 border-t border-slate-100 flex-shrink-0">
                <Button variant="outline" className="h-9 px-4 rounded-xl" onClick={onClose}>Cancelar</Button>
                <Button
                  onClick={goToStep2}
                  disabled={!canGoNext}
                  className="h-9 px-5 rounded-xl text-white font-medium shadow-md flex items-center gap-1.5"
                  style={{background: canGoNext ? '#6d28d9' : undefined}}
                >
                  Próximo <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ══ STEP 2 ══════════════════════════════════════════════════════ */}
          {step === 2 && selectedCollab && (() => {
            const collabName = selectedCollab.fullName || "";
            const firstDay = selDaysSorted[0];
            const lastDay = selDaysSorted[selDaysSorted.length - 1];

            return (
              <>
                {/* Collaborator header */}
                <div className="px-5 pt-4 pb-4 flex-shrink-0" style={{background: '#6d28d9'}}>
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-[10px] bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">{initials(collabName)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-bold text-white truncate leading-tight m-0">{capitalizeName(collabName)}</h2>
                      <p className="text-[11px] text-violet-200 mt-1 m-0">Preencha os valores para este colaborador</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {selWeekdays > 0 && (
                          <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full font-medium">
                            {selWeekdays} {selWeekdays === 1 ? 'dia útil' : 'dias úteis'}
                          </span>
                        )}
                        {selWeekends > 0 && (
                          <span className="text-[10px] bg-amber-400/30 text-amber-100 px-2 py-0.5 rounded-full font-medium">
                            {selWeekends} fim{selWeekends > 1 ? 's' : ''} de semana
                          </span>
                        )}
                        <span className="text-[10px] bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-medium">
                          {selectedDays.size} {selectedDays.size === 1 ? 'dia' : 'dias'} total
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 bg-slate-50">

                  {/* Period */}
                  {firstDay && (
                    <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-600">
                          {firstDay === lastDay ? formatDate(firstDay) : `${formatDate(firstDay)} → ${formatDate(lastDay)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {selWeekdays > 0 && (
                          <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                            {selWeekdays} {selWeekdays === 1 ? 'dia útil' : 'dias úteis'}
                          </span>
                        )}
                        {selWeekends > 0 && (
                          <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            {selWeekends} fim{selWeekends > 1 ? 's' : ''} de sem.
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {selectedDays.size}d
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Diárias */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="h-[3px] bg-indigo-500" />
                    <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-indigo-500 flex items-center justify-center">
                          <Calendar className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">Diárias</span>
                      </div>
                      <span className="text-sm font-bold text-indigo-700 tabular-nums">{fmtR$(s2SubDiarias)}</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Briefcase className="w-3 h-3 text-indigo-500" />
                          <span className="text-[11px] font-semibold text-slate-600">Dias Úteis</span>
                          <span className="text-[10px] text-slate-400 ml-auto">{selWeekdays}d</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <ModalCurrencyInput
                            className={`h-8 text-sm flex-1 text-center font-semibold ${selWeekdays === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.valorDiariaUtil}
                            onChange={v => setStep2Form(f => ({ ...f, valorDiariaUtil: v }))}
                            disabled={selWeekdays === 0}
                          />
                          <span className="text-[10px] text-slate-400">/d</span>
                        </div>
                        <div className="text-[11px] font-bold text-indigo-700 tabular-nums text-center mt-1.5">{fmtR$(s2SubDiariasUtil)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sun className="w-3 h-3 text-amber-500" />
                          <span className="text-[11px] font-semibold text-slate-600">Fim de Semana</span>
                          <span className="text-[10px] text-slate-400 ml-auto">{selWeekends}d</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <ModalCurrencyInput
                            className={`h-8 text-sm flex-1 text-center font-semibold ${selWeekends === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.valorDiariaFds}
                            onChange={v => setStep2Form(f => ({ ...f, valorDiariaFds: v }))}
                            disabled={selWeekends === 0}
                          />
                          <span className="text-[10px] text-slate-400">/d</span>
                        </div>
                        <div className={`text-[11px] font-bold tabular-nums text-center mt-1.5 ${selWeekends === 0 ? 'text-slate-300' : 'text-indigo-700'}`}>{fmtR$(s2SubDiariasFds)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Mobilidade */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="h-[3px] bg-violet-500" />
                    <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50/60 border-b border-violet-100">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-violet-500 flex items-center justify-center">
                          <Car className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">Mobilidade</span>
                      </div>
                      <span className="text-sm font-bold text-violet-700 tabular-nums">{fmtR$(step2Form.mobility)}</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Total do período (R$)</label>
                        <ModalCurrencyInput
                          className="h-9 text-sm"
                          value={step2Form.mobility}
                          onChange={v => setStep2Form(f => ({ ...f, mobility: v }))}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Por dia</label>
                        <div className="h-9 flex items-center px-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-400 tabular-nums">
                          {selectedDays.size > 0 ? fmtR$(Math.round(step2Form.mobility / selectedDays.size)) : fmtR$(0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Alimentação */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="h-[3px] bg-orange-400" />
                    <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50/60 border-b border-orange-100">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-orange-400 flex items-center justify-center">
                          <Utensils className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide">Alimentação</span>
                      </div>
                      <span className="text-sm font-bold text-orange-700 tabular-nums">{fmtR$(s2TotalAlim)}</span>
                    </div>
                    <div className="p-3">
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div />
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                            <Briefcase className="w-2.5 h-2.5" /> Dias Úteis
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <Sun className="w-2.5 h-2.5" /> Fins de Sem.
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div className="flex items-center gap-1">
                          <Sun className="w-3 h-3 text-amber-400" />
                          <span className="text-[11px] font-semibold text-slate-600">Almoço</span>
                        </div>
                        <div className="rounded-lg p-2 border border-slate-100 bg-slate-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekdays === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekdayLunch}
                            onChange={v => setStep2Form(f => ({ ...f, weekdayLunch: v }))}
                            disabled={selWeekdays === 0}
                          />
                        </div>
                        <div className="rounded-lg p-2 border border-slate-100 bg-slate-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekends === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekendLunch}
                            onChange={v => setStep2Form(f => ({ ...f, weekendLunch: v }))}
                            disabled={selWeekends === 0}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-3">
                        <div className="flex items-center gap-1">
                          <Moon className="w-3 h-3 text-indigo-400" />
                          <span className="text-[11px] font-semibold text-slate-600">Jantar</span>
                        </div>
                        <div className="rounded-lg p-2 border border-slate-100 bg-slate-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekdays === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekdayDinner}
                            onChange={v => setStep2Form(f => ({ ...f, weekdayDinner: v }))}
                            disabled={selWeekdays === 0}
                          />
                        </div>
                        <div className="rounded-lg p-2 border border-slate-100 bg-slate-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekends === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekendDinner}
                            onChange={v => setStep2Form(f => ({ ...f, weekendDinner: v }))}
                            disabled={selWeekends === 0}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-t border-slate-100 pt-2">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase self-center">Subtotal</span>
                        <div className="text-center"><span className="text-xs font-bold text-indigo-600 tabular-nums">{fmtR$(step2Form.weekdayLunch + step2Form.weekdayDinner)}</span></div>
                        <div className="text-center"><span className="text-xs font-bold text-amber-600 tabular-nums">{fmtR$(step2Form.weekendLunch + step2Form.weekendDinner)}</span></div>
                      </div>
                    </div>
                  </div>

                  {remainingForParent.length === 0 && (
                    <div className="flex gap-2 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200 items-start">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-800 m-0">
                        O colaborador original ficará <strong>sem dias atribuídos</strong>. Ao confirmar, o registro original ficará zerado.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="bg-white border-t border-slate-100 flex-shrink-0 px-6 py-4 space-y-3">
                  {/* Summary card */}
                  <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="grid grid-cols-3 divide-x divide-slate-200">
                      <div className="px-3 py-3 text-center">
                        <div className="text-[9px] uppercase text-slate-400 font-semibold tracking-widest mb-1">Planejado prop.</div>
                        <div className="text-sm font-bold text-slate-600 tabular-nums">{fmtR$(proportionalPlanned)}</div>
                      </div>
                      <div className="px-4 py-3 text-center bg-violet-50/60">
                        <div className="text-[9px] uppercase text-violet-500 font-semibold tracking-widest mb-1">Realizado</div>
                        <div className="text-sm font-bold text-violet-700 tabular-nums">{fmtR$(s2Realizado)}</div>
                      </div>
                      <div className={`px-4 py-3 text-center ${Math.abs(s2Difference) <= 1 ? 'bg-slate-50/60' : s2Difference < 0 ? 'bg-emerald-50/60' : 'bg-red-50/60'}`}>
                        <div className="text-[9px] uppercase text-slate-400 font-semibold tracking-widest mb-1">Diferença</div>
                        {Math.abs(s2Difference) <= 1 ? (
                          <div className="text-sm font-bold text-slate-300 tabular-nums">—</div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {s2Difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingUp className="w-3.5 h-3.5 text-red-500" />}
                            <span className={`text-sm font-bold tabular-nums ${s2Difference < 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {s2Difference > 0 ? '+' : '−'}{fmtR$(Math.abs(s2Difference))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="ghost" className="h-9 px-4 text-sm text-slate-500 hover:text-slate-700 rounded-xl flex items-center gap-2" onClick={() => setStep(1)} disabled={isPending}>
                      <ArrowLeft className="w-4 h-4" /> Voltar
                    </Button>
                    <Button
                      onClick={attemptConfirm}
                      disabled={isPending}
                      className="h-9 px-5 text-sm rounded-xl text-white font-medium shadow-md flex items-center gap-2"
                      style={{background: '#6d28d9'}}
                    >
                      <CheckCheck className="w-4 h-4" />
                      {isPending ? 'Confirmando...' : 'Confirmar divisão'}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Zero-day confirmation */}
      {showZeroDayConfirm && createPortal(
        <div className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-[420px] w-full p-7 shadow-2xl">
            <div className="flex gap-3 items-start mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-bold text-[15px] text-slate-800 m-0 mb-1.5">Colaborador original sem dias</p>
                <p className="text-[13px] text-slate-500 m-0 leading-relaxed">
                  Todos os dias foram redistribuídos para o novo colaborador. O registro original ficará com <strong>0 dias</strong>. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowZeroDayConfirm(false)}>Cancelar</Button>
              <Button
                onClick={() => { setShowZeroDayConfirm(false); doConfirm(); }}
                className="rounded-xl text-white bg-red-500 hover:bg-red-600"
              >
                Confirmar mesmo assim
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}
