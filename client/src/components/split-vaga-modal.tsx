import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, UserPlus, Check, AlertTriangle, Info,
  Calendar, Briefcase, Sun, Moon, Car, Utensils,
  TrendingUp, TrendingDown, ChevronRight, ArrowLeft, CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      className={className}
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
      .filter(c => !q || (c.fullName || "").toLowerCase().includes(q))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR"))
      .slice(0, 40);
  }, [collaborators, collabSearch, item.collaboratorId]);

  const selectedCollab = collaborators.find(c => c.id === selectedCollabId);

  // ── Derived (step 2) ──────────────────────────────────────────────────────
  const s2SubDiariasUtil = selWeekdays * step2Form.valorDiariaUtil;
  const s2SubDiariasFds = selWeekends * step2Form.valorDiariaFds;
  const s2SubDiarias = s2SubDiariasUtil + s2SubDiariasFds;
  const s2TotalAlim = step2Form.weekdayLunch + step2Form.weekdayDinner + step2Form.weekendLunch + step2Form.weekendDinner;
  const s2Realizado = s2SubDiarias + step2Form.mobility + s2TotalAlim;
  const proportionalPlanned = parentWorkedDays.length > 0
    ? Math.round(item.totalValue * selectedDays.size / parentWorkedDays.length)
    : 0;
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
    });
  }

  const canGoNext = !!selectedCollabId && selectedDays.size > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>

          {/* ── Modal title header ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7C3AED,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <UserPlus style={{ width: 18, height: 18, color: "#fff" }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: "#1E293B", margin: 0 }}>Dividir escalação</p>
                <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>Atribua dias específicos a outro colaborador</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4 }}>
              <X style={{ width: 20, height: 20 }} />
            </button>
          </div>

          {/* ── Step indicator ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, flexShrink: 0,
                background: step === 1 ? "linear-gradient(135deg,#7C3AED,#4F46E5)" : "#10B981",
                color: "#fff",
              }}>
                {step === 1 ? "1" : "✓"}
              </div>
              <span style={{ fontSize: 12, fontWeight: step === 1 ? 700 : 500, color: step === 1 ? "#3B5BDB" : "#10B981" }}>
                Selecionar colaborador
              </span>
            </div>
            <ChevronRight style={{ width: 14, height: 14, color: "#CBD5E1" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, flexShrink: 0,
                background: step === 2 ? "linear-gradient(135deg,#7C3AED,#4F46E5)" : "#E2E8F0",
                color: step === 2 ? "#fff" : "#94A3B8",
              }}>
                2
              </div>
              <span style={{ fontSize: 12, fontWeight: step === 2 ? 700 : 400, color: step === 2 ? "#3B5BDB" : "#94A3B8" }}>
                Informar valores
              </span>
            </div>
          </div>

          {/* ══ STEP 1 ══════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, flex: 1, overflowY: "auto" }}>

              {/* Collaborator picker */}
              <div>
                <SmLabel>Colaborador</SmLabel>
                <div ref={dropRef} style={{ position: "relative" }}>
                  {!collabDropOpen ? (
                    <button
                      onClick={openDrop}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 42, padding: "0 12px", border: "1px solid #CBD5E1", borderRadius: 8, background: "#F8FAFC", cursor: "pointer", fontSize: 14, color: selectedCollab ? "#1E293B" : "#94A3B8", textAlign: "left", boxSizing: "border-box" }}
                    >
                      <Search style={{ width: 15, height: 15, color: "#94A3B8", flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: selectedCollab ? 600 : 400 }}>
                        {selectedCollab ? (selectedCollab.fullName || "") : "Buscar colaborador..."}
                      </span>
                    </button>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <Search style={{ position: "absolute", left: 10, top: 13, width: 15, height: 15, color: "#94A3B8", pointerEvents: "none" }} />
                      <input
                        ref={inputRef}
                        value={collabSearch}
                        onChange={e => setCollabSearch(e.target.value)}
                        placeholder="Buscar colaborador..."
                        style={{ width: "100%", height: 42, paddingLeft: 32, paddingRight: 12, border: "1px solid #3B5BDB", borderRadius: 8, fontSize: 14, outline: "none", boxShadow: "0 0 0 3px rgba(59,91,219,0.1)", color: "#1E293B", background: "#fff", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                  {collabDropOpen && dropRect && createPortal(
                    <div
                      id="split-collab-portal"
                      style={{ position: "absolute", top: dropRect.top, left: dropRect.left, width: dropRect.width, zIndex: 10000, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 200, overflowY: "auto" }}
                    >
                      {filteredCollabs.length === 0 ? (
                        <div style={{ padding: "12px 16px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>Nenhum colaborador encontrado</div>
                      ) : filteredCollabs.map((c, i) => (
                        <button
                          key={c.id}
                          onMouseDown={e => { e.preventDefault(); setSelectedCollabId(c.id); setCollabDropOpen(false); setCollabSearch(""); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", border: "none", background: c.id === selectedCollabId ? "#EEF2FF" : "transparent", cursor: "pointer", fontSize: 14, color: c.id === selectedCollabId ? "#3B5BDB" : "#1E293B", textAlign: "left", borderBottom: i < filteredCollabs.length - 1 ? "1px solid #F1F5F9" : "none", fontWeight: c.id === selectedCollabId ? 600 : 400 }}
                          onMouseEnter={e => { if (c.id !== selectedCollabId) (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                          onMouseLeave={e => { if (c.id !== selectedCollabId) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {(c.fullName || "?").charAt(0).toUpperCase()}
                          </div>
                          <span>{c.fullName}</span>
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
                </div>
              </div>

              {/* Day picker */}
              {availableDays.length > 0 && (
                <div>
                  <SmLabel>Dias que este colaborador irá cobrir</SmLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availableDays.map(day => {
                      const isSel = selectedDays.has(day);
                      const isTaken = takenSet.has(day);
                      const notParent = !parentWorkedDays.includes(day);
                      const wknd = isWeekend(day);
                      return (
                        <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          disabled={isTaken}
                          title={isTaken ? "Dia já atribuído a outro colaborador desta divisão" : undefined}
                          style={{
                            padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                            cursor: isTaken ? "not-allowed" : "pointer", border: "1px solid",
                            background: isTaken ? "#F1F5F9" : isSel ? (wknd ? "#FFF7ED" : "#EEF2FF") : "#F8FAFC",
                            borderColor: isTaken ? "#CBD5E1" : isSel ? (wknd ? "#F97316" : "#3B5BDB") : "#E2E8F0",
                            color: isTaken ? "#CBD5E1" : isSel ? (wknd ? "#C2410C" : "#3B5BDB") : "#64748B",
                            opacity: isTaken ? 0.6 : 1,
                            textDecoration: isTaken ? "line-through" : "none",
                          }}
                        >
                          {isSel && !isTaken && <Check style={{ width: 10, height: 10, display: "inline", marginRight: 3 }} />}
                          {formatDay(day)}
                          {notParent && !isSel && !isTaken && <span style={{ fontSize: 9, color: "#F59E0B", marginLeft: 4 }}>⚠</span>}
                        </button>
                      );
                    })}
                  </div>
                  {selectedDays.size > 0 && (
                    <p style={{ marginTop: 8, fontSize: 12, color: "#64748B" }}>
                      <strong>{selectedDays.size} dia(s)</strong> selecionado(s)
                      {selWeekdays > 0 && ` — ${selWeekdays} útil(is)`}
                      {selWeekends > 0 && ` — ${selWeekends} fim(s) de semana`}
                    </p>
                  )}
                  {takenDays.length > 0 && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, padding: "7px 10px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                      <Info style={{ width: 13, height: 13, color: "#3B5BDB", flexShrink: 0 }} />
                      <p style={{ fontSize: 11, color: "#64748B", margin: 0 }}>Dias riscados já estão atribuídos a outro colaborador desta divisão.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Validations */}
              {!selectedCollabId && (
                <div style={{ fontSize: 12, color: "#EF4444", display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle style={{ width: 12, height: 12 }} /> Selecione um colaborador para continuar.
                </div>
              )}
              {selectedCollabId && selectedDays.size === 0 && (
                <div style={{ fontSize: 12, color: "#EF4444", display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle style={{ width: 12, height: 12 }} /> Selecione pelo menos 1 dia para o novo colaborador.
                </div>
              )}

              {/* Footer buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4, borderTop: "1px solid #F1F5F9", flexShrink: 0 }}>
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button
                  onClick={goToStep2}
                  disabled={!canGoNext}
                  style={{
                    background: canGoNext ? "linear-gradient(135deg,#7C3AED,#4F46E5)" : undefined,
                    color: canGoNext ? "#fff" : undefined,
                    border: "none",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  Próximo <ChevronRight style={{ width: 14, height: 14 }} />
                </Button>
              </div>
            </div>
          )}

          {/* ══ STEP 2 ══════════════════════════════════════════════════════ */}
          {step === 2 && selectedCollab && (() => {
            const collabName = selectedCollab.fullName || "";
            const colBg = avatarColor(collabName);
            const firstDay = selDaysSorted[0];
            const lastDay = selDaysSorted[selDaysSorted.length - 1];

            return (
              <>
                {/* Collaborator header */}
                <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-6 pt-4 pb-4" style={{ flexShrink: 0 }}>
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colBg} border-2 border-white/30 flex items-center justify-center flex-shrink-0 shadow-lg`}>
                      <span className="text-white text-sm font-bold">{initials(collabName)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold text-white truncate">{collabName}</h2>
                      <p className="text-xs text-violet-200 mt-1">Preencha os valores realizados para este colaborador</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {selWeekdays > 0 && (
                          <span className="text-[10px] bg-blue-400/30 text-blue-100 px-2 py-0.5 rounded-full font-medium">
                            {selWeekdays} dia(s) útil(is)
                          </span>
                        )}
                        {selWeekends > 0 && (
                          <span className="text-[10px] bg-amber-400/30 text-amber-100 px-2 py-0.5 rounded-full font-medium">
                            {selWeekends} fim(s) de semana
                          </span>
                        )}
                        <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full font-medium">
                          {selectedDays.size} {selectedDays.size === 1 ? "dia" : "dias"} no total
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-6 py-5 space-y-4 bg-gray-50/80" style={{ flex: 1 }}>

                  {/* Period pill */}
                  {firstDay && (
                    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center">
                          <Calendar className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">
                          {firstDay === lastDay ? formatDate(firstDay) : `${formatDate(firstDay)} até ${formatDate(lastDay)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selWeekdays > 0 && (
                          <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                            {selWeekdays} {selWeekdays === 1 ? "dia útil" : "dias úteis"}
                          </span>
                        )}
                        {selWeekends > 0 && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            {selWeekends} {selWeekends === 1 ? "fim de sem." : "fins de sem."}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {selectedDays.size} {selectedDays.size === 1 ? "dia" : "dias"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Diárias */}
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50/60 border-b border-blue-100">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Diárias</span>
                      </div>
                      <span className="text-sm font-bold text-blue-700 tabular-nums">{fmtR$(s2SubDiarias)}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Dias úteis */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                          <div>
                            <div className="text-xs font-semibold text-gray-700">Dias Úteis</div>
                            <div className="text-[10px] text-gray-400">{selWeekdays} {selWeekdays === 1 ? "dia" : "dias"}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 font-medium">R$</span>
                          <ModalCurrencyInput
                            className={`h-9 text-sm w-24 text-center font-medium ${selWeekdays === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                            value={step2Form.valorDiariaUtil}
                            onChange={v => setStep2Form(f => ({ ...f, valorDiariaUtil: v }))}
                            disabled={selWeekdays === 0}
                          />
                          <span className="text-[10px] text-gray-400">/dia</span>
                        </div>
                        <div className="text-right min-w-[90px]">
                          <span className="text-sm font-bold text-gray-700 tabular-nums">{fmtR$(s2SubDiariasUtil)}</span>
                          {selWeekdays > 0 && (
                            <div className="text-[10px] text-gray-400 tabular-nums">{selWeekdays} × {fmtR$(step2Form.valorDiariaUtil)}</div>
                          )}
                        </div>
                      </div>
                      <div className="border-t border-gray-100" />
                      {/* Fim de semana */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <div>
                            <div className="text-xs font-semibold text-gray-700">Fim de Semana</div>
                            <div className="text-[10px] text-gray-400">{selWeekends} {selWeekends === 1 ? "dia" : "dias"}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 font-medium">R$</span>
                          <ModalCurrencyInput
                            className={`h-9 text-sm w-24 text-center font-medium ${selWeekends === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                            value={step2Form.valorDiariaFds}
                            onChange={v => setStep2Form(f => ({ ...f, valorDiariaFds: v }))}
                            disabled={selWeekends === 0}
                          />
                          <span className="text-[10px] text-gray-400">/dia</span>
                        </div>
                        <div className="text-right min-w-[90px]">
                          <span className={`text-sm font-bold tabular-nums ${selWeekends === 0 ? "text-gray-300" : "text-gray-700"}`}>{fmtR$(s2SubDiariasFds)}</span>
                          {selWeekends > 0 && (
                            <div className="text-[10px] text-gray-400 tabular-nums">{selWeekends} × {fmtR$(step2Form.valorDiariaFds)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobilidade */}
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50/60 border-b border-purple-100">
                      <div className="flex items-center gap-2">
                        <Car className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wide">Mobilidade</span>
                      </div>
                      <span className="text-sm font-bold text-purple-700 tabular-nums">{fmtR$(step2Form.mobility)}</span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-medium text-gray-500 mb-1 block">Total do período (R$)</label>
                          <ModalCurrencyInput
                            className="h-9 text-sm"
                            value={step2Form.mobility}
                            onChange={v => setStep2Form(f => ({ ...f, mobility: v }))}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-gray-500 mb-1 block">Por dia</label>
                          <div className="h-9 flex items-center px-3 rounded-md bg-gray-50 border border-gray-100 text-xs text-gray-400 tabular-nums">
                            {selectedDays.size > 0 ? fmtR$(Math.round(step2Form.mobility / selectedDays.size)) : fmtR$(0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Alimentação 2×2 */}
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-orange-400 flex items-center justify-center">
                          <Utensils className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">Alimentação</span>
                      </div>
                      <span className="text-sm font-black text-orange-700 tabular-nums border-l border-orange-200 pl-2">{fmtR$(s2TotalAlim)}</span>
                    </div>
                    <div className="p-3">
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div />
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            <Briefcase className="w-2.5 h-2.5" /> Dias Úteis
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <Sun className="w-2.5 h-2.5" /> Fins de Sem.
                          </span>
                        </div>
                      </div>
                      {/* Almoço */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div className="flex items-center gap-1">
                          <Sun className="w-3 h-3 text-amber-400" />
                          <span className="text-[11px] font-semibold text-gray-600">Almoço</span>
                        </div>
                        <div className="rounded-xl p-2 border border-gray-100 bg-gray-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekdays === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                            value={step2Form.weekdayLunch}
                            onChange={v => setStep2Form(f => ({ ...f, weekdayLunch: v }))}
                            disabled={selWeekdays === 0}
                          />
                        </div>
                        <div className="rounded-xl p-2 border border-gray-100 bg-gray-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekends === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                            value={step2Form.weekendLunch}
                            onChange={v => setStep2Form(f => ({ ...f, weekendLunch: v }))}
                            disabled={selWeekends === 0}
                          />
                        </div>
                      </div>
                      {/* Jantar */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-3">
                        <div className="flex items-center gap-1">
                          <Moon className="w-3 h-3 text-indigo-400" />
                          <span className="text-[11px] font-semibold text-gray-600">Jantar</span>
                        </div>
                        <div className="rounded-xl p-2 border border-gray-100 bg-gray-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekdays === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                            value={step2Form.weekdayDinner}
                            onChange={v => setStep2Form(f => ({ ...f, weekdayDinner: v }))}
                            disabled={selWeekdays === 0}
                          />
                        </div>
                        <div className="rounded-xl p-2 border border-gray-100 bg-gray-50/50">
                          <ModalCurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekends === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                            value={step2Form.weekendDinner}
                            onChange={v => setStep2Form(f => ({ ...f, weekendDinner: v }))}
                            disabled={selWeekends === 0}
                          />
                        </div>
                      </div>
                      {/* Subtotal */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-t border-gray-100 pt-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider self-center">Subtotal</span>
                        <div className="text-center">
                          <span className="text-xs font-black text-blue-600 tabular-nums">{fmtR$(step2Form.weekdayLunch + step2Form.weekdayDinner)}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-xs font-black text-amber-600 tabular-nums">{fmtR$(step2Form.weekendLunch + step2Form.weekendDinner)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warning: parent gets 0 days */}
                  {remainingForParent.length === 0 && (
                    <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", alignItems: "flex-start" }}>
                      <AlertTriangle style={{ width: 14, height: 14, color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: "#991B1B", margin: 0 }}>
                        O colaborador original ficará <strong>sem dias atribuídos</strong>. Ao confirmar, você precisará remover o registro original manualmente ou ele ficará zerado.
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Footer ── */}
                <div className="border-t border-gray-200 bg-white" style={{ flexShrink: 0 }}>
                  {/* Totals bar: PLANEJADO / REALIZADO / DIFERENÇA */}
                  <div className="grid grid-cols-3 divide-x divide-gray-200">
                    <div className="px-4 py-3 text-center">
                      <div className="text-[9px] uppercase text-gray-400 font-bold tracking-widest mb-1">Planejado proporcional</div>
                      <div className="text-sm font-black text-gray-600 tabular-nums">{fmtR$(proportionalPlanned)}</div>
                    </div>
                    <div className="px-4 py-3 text-center bg-violet-50/50">
                      <div className="text-[9px] uppercase text-violet-500 font-bold tracking-widest mb-1">Realizado</div>
                      <div className="text-sm font-black text-violet-700 tabular-nums">{fmtR$(s2Realizado)}</div>
                    </div>
                    <div className={`px-4 py-3 text-center ${Math.abs(s2Difference) <= 1 ? "bg-gray-50/60" : s2Difference < 0 ? "bg-emerald-50/60" : "bg-red-50/60"}`}>
                      <div className="text-[9px] uppercase text-gray-400 font-bold tracking-widest mb-1">Diferença</div>
                      {Math.abs(s2Difference) <= 1 ? (
                        <div className="text-sm font-black text-gray-400 tabular-nums">—</div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          {s2Difference < 0
                            ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
                            : <TrendingUp className="w-3.5 h-3.5 text-red-500" />}
                          <span className={`text-sm font-black tabular-nums ${s2Difference < 0 ? "text-emerald-700" : "text-red-700"}`}>
                            {s2Difference > 0 ? "+" : "−"}{fmtR$(Math.abs(s2Difference))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      className="h-9 px-4 text-sm text-gray-500 hover:text-gray-700 rounded-xl flex items-center gap-2"
                      onClick={() => setStep(1)}
                      disabled={isPending}
                    >
                      <ArrowLeft className="w-4 h-4" /> Voltar
                    </Button>
                    <Button
                      onClick={attemptConfirm}
                      disabled={isPending}
                      className="h-10 px-6 text-sm rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-md shadow-violet-200 flex items-center gap-2"
                    >
                      <CheckCheck className="w-4 h-4" />
                      {isPending ? "Confirmando..." : "Confirmar divisão"}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Zero-day confirmation dialog */}
      {showZeroDayConfirm && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 420, width: "100%", padding: "28px 28px 22px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle style={{ width: 20, height: 20, color: "#EF4444" }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: "#1E293B", margin: "0 0 6px" }}>Colaborador original sem dias</p>
                <p style={{ fontSize: 13, color: "#64748B", margin: 0, lineHeight: 1.5 }}>
                  Todos os dias foram redistribuídos para o novo colaborador. O registro original ficará com <strong>0 dias</strong>. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="outline" onClick={() => setShowZeroDayConfirm(false)}>Cancelar</Button>
              <Button
                onClick={() => { setShowZeroDayConfirm(false); doConfirm(); }}
                style={{ background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", border: "none" }}
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
