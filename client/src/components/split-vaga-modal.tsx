import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, UserPlus, Check, AlertTriangle, Info,
  Calendar, Briefcase, Sun, Moon, Car, Utensils,
  TrendingUp, TrendingDown, ChevronRight, ArrowLeft, CheckCheck, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, fixEncoding } from "@/lib/utils";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import type { BudgetActual, Collaborator, TeamInclusion } from "@shared/schema";

import { formatarMoeda } from "@/lib/format";
import { CurrencyInput } from "@/components/common/currency-input";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
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

const fmtR$ = formatarMoeda;

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?";
}

function capitalizeName(name: string): string {
  return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function SmLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em]" style={{ margin: "0 0 8px" }}>
      {children}
    </p>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SplitVagaModalProps {
  item: BudgetActual;
  collaborators: Collaborator[];
  teamInclusion: TeamInclusion | undefined;
  /** Datas do evento — fallback quando a escalação não tem período definido */
  eventStartDate?: string | null;
  eventEndDate?: string | null;
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
  item, collaborators, teamInclusion, eventStartDate, eventEndDate, takenDays = [], onClose, onConfirm, isPending,
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
    // Sem datas na escalação: usa as datas do evento (mesmo fallback de getItemDayCounts na página)
    if (eventStartDate && eventEndDate) return getDaysInRange(eventStartDate, eventEndDate);
    return [];
  }, [teamInclusion, eventStartDate, eventEndDate]);

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
      .filter(c => c.status === "aprovado" && c.active !== false)
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

  // ── Acessibilidade: Esc fecha, foco preso dentro do modal ─────────────────
  const modalRef = useRef<HTMLDivElement>(null);
  // "Descartar alterações?" (23/09): Esc, X e Cancelar fechavam e perdiam colaborador,
  // dias e valores do passo 2 sem perguntar. Sujo = já escolheu algo ou já está no passo 2.
  const sujo = !!selectedCollabId || selectedDays.size > 0 || step === 2;
  const { pedirParaFechar, Dialogo: DialogoDescarte, confirmando } = useConfirmarDescarte(sujo, { salvando: isPending });
  const fechar = () => pedirParaFechar(onClose);
  // Refs para o listener (montado uma única vez) enxergar sempre o estado atual
  // sem re-executar o efeito (o que roubaria o foco a cada re-render do pai)
  const escStateRef = useRef({ showZeroDayConfirm, collabDropOpen, confirmando, fechar });
  escStateRef.current = { showZeroDayConfirm, collabDropOpen, confirmando, fechar };
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      // Com o "Descartar alterações?" aberto, Esc e Tab são do AlertDialog do Radix
      // (ele tem o próprio foco preso) — o modal não interfere.
      if (escStateRef.current.confirmando) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        const cur = escStateRef.current;
        if (cur.showZeroDayConfirm) setShowZeroDayConfirm(false);
        else if (cur.collabDropOpen) setCollabDropOpen(false);
        else cur.fechar();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        // O trap precisa enxergar os PORTAIS (dropdown de colaborador e alertdialog
        // de confirmação vivem em document.body): coletar só dentro do modal roubava
        // o foco desses elementos. Com o alertdialog aberto, o trap fica só nele.
        const zeroDayPortal = document.getElementById("split-zeroday-portal");
        const collabPortal = document.getElementById("split-collab-portal");
        const roots: HTMLElement[] = zeroDayPortal
          ? [zeroDayPortal]
          : collabPortal
            ? [modalRef.current, collabPortal]
            : [modalRef.current];
        const focusables = roots.flatMap(root => Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        )).filter(el => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const insideRoots = roots.some(r => r.contains(active));
        if (e.shiftKey) {
          if (active === first || !insideRoots) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !insideRoots) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Dividir escalação"
          tabIndex={-1}
          className="bg-card rounded-xl w-full max-w-[680px] max-h-[92vh] flex flex-col shadow-3 overflow-hidden outline-none border border-black/6"
        >

          {/* ── Title header ── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary-hover">
                <UserPlus className="w-4.5 h-4.5 text-white" style={{width:18,height:18}} aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-base text-foreground leading-tight m-0">Dividir escalação</p>
                <p className="text-xs text-muted-foreground m-0">Atribua dias específicos a outro colaborador</p>
              </div>
            </div>
            <button type="button" onClick={fechar} aria-label="Fechar" className="text-muted-foreground hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* ── Step indicator ── */}
          <div className="flex items-center gap-3 px-5 py-2.5 bg-surface-muted border-b border-border flex-shrink-0">
            {/* Step 1 */}
            <div className="flex items-center gap-2">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold text-white flex-shrink-0", (step === 1 ? "bg-primary-hover" : "bg-success-strong"))}>
                {step === 1 ? '1' : '✓'}
              </div>
              <span className={cn("text-xs font-semibold", (step === 1 ? "text-primary" : "text-success-strong"))}>
                Colaborador & dias
              </span>
            </div>
            <div className="flex-1 h-px bg-border" />
            {/* Step 2 */}
            <div className="flex items-center gap-2">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0", (step === 2 ? "bg-primary-hover" : "bg-border"), (step === 2 ? "text-white" : "text-muted-foreground"))}>
                2
              </div>
              <span className={cn("text-xs font-semibold", (step === 2 ? "text-primary" : "text-muted-foreground"))}>
                Valores
              </span>
            </div>
          </div>

          {/* ══ STEP 1 ══════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="flex flex-col gap-4 flex-1 overflow-y-auto px-6 py-5 bg-surface-muted">

              {/* ── Context banner "De / Para" ── */}
              {(() => {
                const originalCollab = collaborators.find(c => c.id === item.collaboratorId);
                const originalName = originalCollab
                  ? capitalizeName(fixEncoding(originalCollab.fullName || ""))
                  : "Colaborador original";
                const totalDays = parentWorkedDays.length;
                const selCount = selectedDays.size;
                const remCount = totalDays - selCount;
                return (
                  <div className="rounded-xl border border-primary/25 bg-brand-soft px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-sm font-bold bg-primary-hover">
                      {fixEncoding(originalCollab?.fullName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs font-semibold text-primary uppercase tracking-wide m-0 mb-0.5">Dividindo escalação de</p>
                      <p className="text-sm font-semibold text-primary m-0 truncate">{originalName}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-center pl-3 border-l border-primary/25">
                        <p className="text-2xs font-semibold text-primary/70 uppercase tracking-wide m-0">Total</p>
                        <p className="text-xl font-bold text-primary m-0 leading-tight">{totalDays}</p>
                        <p className="text-2xs text-primary/70 m-0">{totalDays === 1 ? 'dia' : 'dias'}</p>
                      </div>
                      {selCount > 0 && (
                        <div className="text-center pl-3 border-l border-primary/25">
                          <p className="text-2xs font-semibold text-primary/70 uppercase tracking-wide m-0">Para novo</p>
                          <p className="text-xl font-bold text-primary m-0 leading-tight">{selCount}</p>
                          <p className="text-2xs text-primary/70 m-0">{selCount === 1 ? 'dia' : 'dias'}</p>
                        </div>
                      )}
                      {selCount > 0 && (
                        <div className="text-center pl-3 border-l border-primary/25">
                          <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide m-0">Resta</p>
                          <p className={`text-xl font-bold m-0 leading-tight ${remCount === 0 ? 'text-danger-strong' : 'text-muted-foreground'}`}>{remCount}</p>
                          <p className="text-2xs text-muted-foreground m-0">{remCount === 1 ? 'dia' : 'dias'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── Collaborator picker ── */}
              <div className="bg-card rounded-xl border border-border p-4">
                <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Novo colaborador</p>
                <div ref={dropRef}>
                  <button
                    onClick={openDrop}
                    className={cn("flex items-center justify-between gap-2 w-full h-11 px-3 rounded-lg bg-card text-left cursor-pointer transition-all", (collabDropOpen ? "border border-primary ring-[3px] ring-primary/10" : "border border-border shadow-1"))}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {selectedCollab ? (
                        <>
                          <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-2xs font-bold text-white bg-primary-hover">
                            {fixEncoding(selectedCollab.fullName || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-foreground truncate">
                            {capitalizeName(fixEncoding(selectedCollab.fullName || ""))}
                          </span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                          <span className="text-sm text-muted-foreground">Buscar colaborador…</span>
                        </>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform" style={{transform: collabDropOpen ? 'rotate(180deg)' : 'none'}} aria-hidden="true" />
                  </button>

                  {collabDropOpen && dropRect && createPortal(
                    <div
                      id="split-collab-portal"
                      className="absolute bg-card rounded-xl overflow-hidden border border-border shadow-3"
                      style={{
                        top: dropRect.top,
                        left: dropRect.left,
                        width: dropRect.width,
                        zIndex: 10000,
                      }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                        <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                        <input
                          ref={inputRef}
                          value={collabSearch}
                          onChange={e => setCollabSearch(e.target.value)}
                          placeholder="Buscar colaborador…"
                          className="flex-1 border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm text-sm text-foreground bg-transparent"
                        />
                      </div>
                      <div className="max-h-[240px] overflow-y-auto">
                        {filteredCollabs.length === 0 ? (
                          <div className="py-4 text-center text-muted-foreground text-sm">Nenhum colaborador encontrado</div>
                        ) : filteredCollabs.map(c => {
                          const name = capitalizeName(fixEncoding(c.fullName || ""));
                          const isSel = c.id === selectedCollabId;
                          const ini = fixEncoding(c.fullName || "?").charAt(0).toUpperCase();
                          return (
                            <button
                              key={c.id}
                              onMouseDown={e => { e.preventDefault(); setSelectedCollabId(c.id); setCollabDropOpen(false); setCollabSearch(""); }}
                              className={cn("flex items-center gap-2.5 w-full px-3.5 py-2 border-0 border-b border-border cursor-pointer text-left transition-colors", (isSel ? "bg-brand-soft" : "bg-transparent"))}
                              onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--surface-muted)'; }}
                              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              <div className={cn("w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-2xs font-bold text-white", (isSel ? "bg-primary-hover" : "bg-neutral"))}>
                                {ini}
                              </div>
                              <span className={cn("text-sm truncate", (isSel ? "font-semibold" : "font-normal"), (isSel ? "text-primary" : "text-slate-700"))}>
                                {name}
                              </span>
                              {isSel && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-primary" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              </div>

              {/* ── Day picker — grid calendar ── */}
              {availableDays.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider m-0">
                      Selecione os dias do novo colaborador
                    </p>
                    {selectedDays.size > 0 && (
                      <span className="inline-flex items-center gap-1 text-2xs font-semibold text-primary bg-brand-soft border border-primary/25 px-2 py-0.5 rounded-full">
                        <Check className="w-3 h-3" aria-hidden="true" />
                        {selectedDays.size} {selectedDays.size === 1 ? 'dia' : 'dias'} selecionado{selectedDays.size !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded border-2 border-primary bg-brand-soft" />
                      <span className="text-2xs text-muted-foreground">Selecionado</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded border border-warning/25 bg-warning-soft" />
                      <span className="text-2xs text-muted-foreground">Fim de semana</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded border border-border bg-muted opacity-60" />
                      <span className="text-2xs text-muted-foreground">Já atribuído</span>
                    </div>
                  </div>

                  {/* Calendar grid — 7 cols (Mon–Sun) or auto if ≤7 days */}
                  <div
                    className="grid gap-2"
                    style={{gridTemplateColumns: `repeat(${Math.min(availableDays.length, 7)}, minmax(0, 1fr))`}}
                  >
                    {availableDays.map(day => {
                      const isSel = selectedDays.has(day);
                      const isTaken = takenSet.has(day);
                      const notParent = !parentWorkedDays.includes(day);
                      const wknd = isWeekend(day);
                      const dt = new Date(day + 'T12:00:00');
                      const dayNum = dt.getDate();
                      const wdShort = dt.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.','').toUpperCase().slice(0,3);
                      const moShort = dt.toLocaleDateString('pt-BR', {month: 'short'}).replace('.','').toUpperCase().slice(0,3);

                      let cardBg = 'var(--surface-muted)', cardBorder = 'var(--border)';
                      let dayColor = 'var(--foreground)', wdColor = 'var(--muted-foreground)';
                      if (isTaken) {
                        cardBg = 'var(--muted)'; cardBorder = 'var(--border)';
                        dayColor = 'var(--muted-foreground)'; wdColor = 'var(--muted-foreground)';
                      } else if (isSel && wknd) {
                        cardBg = 'var(--warning-soft)'; cardBorder = 'var(--warning-strong)';
                        dayColor = 'var(--warning)'; wdColor = 'var(--warning-strong)';
                      } else if (isSel) {
                        cardBg = 'var(--brand-soft)'; cardBorder = 'var(--primary-hover)';
                        dayColor = 'var(--primary)'; wdColor = 'var(--primary)';
                      } else if (wknd) {
                        cardBg = 'var(--warning-soft)'; cardBorder = 'var(--warning-strong)';
                        dayColor = 'var(--warning)'; wdColor = 'var(--warning)';
                      }

                      return (
                        <MotivoDesabilitado motivo={isTaken ? "Dia já atribuído a outro colaborador desta divisão" : notParent ? "Este dia está fora do período original" : undefined} desabilitado={isTaken}>
                          <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          disabled={isTaken}
                          aria-pressed={isSel}
                          aria-label={`${formatDay(day)}${isTaken ? ' — já atribuído' : isSel ? ' — selecionado' : ''}`}
                         
                          className={cn("flex flex-col items-center rounded-xl py-2.5 px-1 transition-all relative", (isTaken ? "cursor-not-allowed" : "cursor-pointer"), (isTaken ? "opacity-50" : "opacity-100"), (isSel && !isTaken ? "shadow-1" : "shadow-none"))}
                          style={{
                            border: `1.5px solid ${cardBorder}`,
                            background: cardBg,
                          }}
                        >
                          {/* Weekday */}
                          <span className="text-2xs font-semibold uppercase tracking-[0.06em]" style={{ color: wdColor, lineHeight: '13px' }}>
                            {wdShort}
                          </span>
                          {/* Day number */}
                          <span className={cn("text-lg font-semibold leading-6", (isTaken ? "line-through" : "no-underline"))} style={{ color: dayColor }}>
                            {dayNum}
                          </span>
                          {/* Month */}
                          <span className={cn("text-2xs", (isTaken ? "text-muted-foreground" : "text-muted-foreground"))} style={{ lineHeight: '13px' }}>
                            {moShort}
                          </span>
                          {/* Check badge */}
                          {isSel && !isTaken && (
                            <div className={cn("absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center", (wknd ? "bg-warning-strong" : "bg-primary-hover"))}>
                              <Check className="text-white" style={{ width: 8, height: 8 }} aria-hidden="true" />
                            </div>
                          )}
                          {/* Out-of-parent warning */}
                          {notParent && !isSel && !isTaken && (
                            <div className="absolute top-0.5 right-0.5 text-warning-strong text-2xs">⚠</div>
                          )}
                        </button>
                        </MotivoDesabilitado>
                      );
                    })}
                  </div>

                  {/* Summary bar */}
                  {selectedDays.size > 0 && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary-hover" />
                      <p className="text-xs text-slate-600 m-0 flex-1">
                        <strong className="text-slate-700">{selectedDays.size}</strong> {selectedDays.size === 1 ? 'dia selecionado' : 'dias selecionados'}
                        {selWeekdays > 0 && <span className="text-primary"> · {selWeekdays} {selWeekdays === 1 ? 'útil' : 'úteis'}</span>}
                        {selWeekends > 0 && <span className="text-warning"> · {selWeekends} fim{selWeekends > 1 ? 's' : ''} de sem.</span>}
                      </p>
                      <button
                        className="text-2xs text-muted-foreground hover:text-danger-strong transition-colors border-0 bg-transparent cursor-pointer px-0"
                        onClick={() => setSelectedDays(new Set())}
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                  {takenDays.length > 0 && (
                    <div className="flex gap-2 items-start mt-2 px-3 py-2 rounded-lg bg-surface-muted border border-border">
                      <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="text-2xs text-muted-foreground m-0">Dias acinzentados já estão atribuídos a outro colaborador desta divisão.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Validations */}
              {!selectedCollabId && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-danger-soft border border-danger/25 text-xs text-danger">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> Selecione um colaborador para continuar.
                </div>
              )}
              {selectedCollabId && selectedDays.size === 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-danger-soft border border-danger/25 text-xs text-danger">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> Selecione pelo menos 1 dia para o novo colaborador.
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2.5 pt-1 border-t border-border flex-shrink-0">
                <Button variant="ghost" className="h-9 px-4 rounded-xl text-muted-foreground hover:text-slate-700" onClick={fechar}>Cancelar</Button>
                <Button
                  onClick={goToStep2}
                  disabled={!canGoNext}
                  className={cn("h-9 px-5 rounded-xl text-white font-medium shadow-2 flex items-center gap-1.5", (canGoNext ? "bg-primary-hover" : undefined))}
                >
                  Próximo <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
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
                <div className="px-5 pt-4 pb-4 flex-shrink-0 bg-primary-hover">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-lg bg-card/20 border border-white/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">{initials(collabName)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-bold text-white truncate leading-tight m-0">{capitalizeName(collabName)}</h2>
                      <p className="text-2xs text-primary-foreground/80 mt-1 m-0">Preencha os valores para este colaborador</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {selWeekdays > 0 && (
                          <span className="text-2xs bg-card/15 text-white px-2 py-0.5 rounded-full font-medium">
                            {selWeekdays} {selWeekdays === 1 ? 'dia útil' : 'dias úteis'}
                          </span>
                        )}
                        {selWeekends > 0 && (
                          <span className="text-2xs bg-warning-strong/30 text-warning-soft px-2 py-0.5 rounded-full font-medium">
                            {selWeekends} fim{selWeekends > 1 ? 's' : ''} de semana
                          </span>
                        )}
                        <span className="text-2xs bg-card/10 text-white/80 px-2 py-0.5 rounded-full font-medium">
                          {selectedDays.size} {selectedDays.size === 1 ? 'dia' : 'dias'} total
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 bg-surface-muted">

                  {/* Period */}
                  {firstDay && (
                    <div className="bg-card rounded-xl border border-border px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                        <span className="text-xs font-semibold text-slate-600">
                          {firstDay === lastDay ? formatDate(firstDay) : `${formatDate(firstDay)} → ${formatDate(lastDay)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {selWeekdays > 0 && (
                          <span className="text-2xs font-semibold bg-brand-soft text-primary border border-primary/25 px-2 py-0.5 rounded-full">
                            {selWeekdays} {selWeekdays === 1 ? 'dia útil' : 'dias úteis'}
                          </span>
                        )}
                        {selWeekends > 0 && (
                          <span className="text-2xs font-semibold bg-warning-soft text-warning border border-warning/25 px-2 py-0.5 rounded-full">
                            {selWeekends} fim{selWeekends > 1 ? 's' : ''} de sem.
                          </span>
                        )}
                        <span className="text-2xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {selectedDays.size}d
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Diárias */}
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="h-[3px] bg-primary" />
                    <div className="flex items-center justify-between px-4 py-2.5 bg-brand-soft/60 border-b border-primary/25">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
                          <Calendar className="w-3 h-3 text-white" aria-hidden="true" />
                        </div>
                        <span className="text-2xs font-semibold text-primary uppercase tracking-wide">Diárias</span>
                      </div>
                      <span className="text-sm font-bold text-primary tabular-nums">{fmtR$(s2SubDiarias)}</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Briefcase className="w-3 h-3 text-primary" aria-hidden="true" />
                          <span className="text-2xs font-semibold text-slate-600">Dias Úteis</span>
                          <span className="text-2xs text-muted-foreground ml-auto">{selWeekdays}d</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-2xs text-muted-foreground">R$</span>
                          <CurrencyInput
                            className={`h-8 text-sm flex-1 text-center font-semibold ${selWeekdays === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.valorDiariaUtil}
                            onChange={v => setStep2Form(f => ({ ...f, valorDiariaUtil: v }))}
                            disabled={selWeekdays === 0}
                          />
                          <span className="text-2xs text-muted-foreground">/d</span>
                        </div>
                        <div className="text-2xs font-bold text-primary tabular-nums text-center mt-1.5">{fmtR$(s2SubDiariasUtil)}</div>
                      </div>
                      <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />
                          <span className="text-2xs font-semibold text-slate-600">Fim de Semana</span>
                          <span className="text-2xs text-muted-foreground ml-auto">{selWeekends}d</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-2xs text-muted-foreground">R$</span>
                          <CurrencyInput
                            className={`h-8 text-sm flex-1 text-center font-semibold ${selWeekends === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.valorDiariaFds}
                            onChange={v => setStep2Form(f => ({ ...f, valorDiariaFds: v }))}
                            disabled={selWeekends === 0}
                          />
                          <span className="text-2xs text-muted-foreground">/d</span>
                        </div>
                        <div className={`text-2xs font-bold tabular-nums text-center mt-1.5 ${selWeekends === 0 ? 'text-muted-foreground' : 'text-primary'}`}>{fmtR$(s2SubDiariasFds)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Mobilidade */}
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="h-[3px] bg-primary" />
                    <div className="flex items-center justify-between px-4 py-2.5 bg-brand-soft/60 border-b border-primary/25">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
                          <Car className="w-3 h-3 text-white" aria-hidden="true" />
                        </div>
                        <span className="text-2xs font-semibold text-primary uppercase tracking-wide">Mobilidade</span>
                      </div>
                      <span className="text-sm font-bold text-primary tabular-nums">{fmtR$(step2Form.mobility)}</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-2xs font-semibold text-muted-foreground block mb-1">Total do período (R$)</label>
                        <CurrencyInput
                          className="h-9 text-sm"
                          value={step2Form.mobility}
                          onChange={v => setStep2Form(f => ({ ...f, mobility: v }))}
                        />
                      </div>
                      <div>
                        <label className="text-2xs font-semibold text-muted-foreground block mb-1">Por dia</label>
                        <div className="h-9 flex items-center px-3 rounded-lg bg-surface-muted border border-border text-xs text-muted-foreground tabular-nums">
                          {selectedDays.size > 0 ? fmtR$(Math.round(step2Form.mobility / selectedDays.size)) : fmtR$(0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Alimentação */}
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="h-[3px] bg-warning-strong" />
                    <div className="flex items-center justify-between px-4 py-2.5 bg-warning-soft/60 border-b border-warning/25">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-warning-strong flex items-center justify-center">
                          <Utensils className="w-3 h-3 text-white" aria-hidden="true" />
                        </div>
                        <span className="text-2xs font-semibold text-warning uppercase tracking-wide">Alimentação</span>
                      </div>
                      <span className="text-sm font-bold text-warning tabular-nums">{fmtR$(s2TotalAlim)}</span>
                    </div>
                    <div className="p-3">
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div />
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-2xs font-bold text-primary bg-brand-soft border border-primary/25 px-2 py-0.5 rounded-full">
                            <Briefcase className="w-2.5 h-2.5" aria-hidden="true" /> Dias Úteis
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-2xs font-bold text-warning bg-warning-soft border border-warning/25 px-2 py-0.5 rounded-full">
                            <Sun className="w-2.5 h-2.5" aria-hidden="true" /> Fins de Sem.
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div className="flex items-center gap-1">
                          <Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />
                          <span className="text-2xs font-semibold text-slate-600">Almoço</span>
                        </div>
                        <div className="rounded-lg p-2 border border-border bg-surface-muted/50">
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekdays === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekdayLunch}
                            onChange={v => setStep2Form(f => ({ ...f, weekdayLunch: v }))}
                            disabled={selWeekdays === 0}
                          />
                        </div>
                        <div className="rounded-lg p-2 border border-border bg-surface-muted/50">
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekends === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekendLunch}
                            onChange={v => setStep2Form(f => ({ ...f, weekendLunch: v }))}
                            disabled={selWeekends === 0}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-3">
                        <div className="flex items-center gap-1">
                          <Moon className="w-3 h-3 text-primary/70" aria-hidden="true" />
                          <span className="text-2xs font-semibold text-slate-600">Jantar</span>
                        </div>
                        <div className="rounded-lg p-2 border border-border bg-surface-muted/50">
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekdays === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekdayDinner}
                            onChange={v => setStep2Form(f => ({ ...f, weekdayDinner: v }))}
                            disabled={selWeekdays === 0}
                          />
                        </div>
                        <div className="rounded-lg p-2 border border-border bg-surface-muted/50">
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${selWeekends === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                            value={step2Form.weekendDinner}
                            onChange={v => setStep2Form(f => ({ ...f, weekendDinner: v }))}
                            disabled={selWeekends === 0}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-t border-border pt-2">
                        <span className="text-2xs font-semibold text-muted-foreground uppercase self-center">Subtotal</span>
                        <div className="text-center"><span className="text-xs font-bold text-primary tabular-nums">{fmtR$(step2Form.weekdayLunch + step2Form.weekdayDinner)}</span></div>
                        <div className="text-center"><span className="text-xs font-bold text-warning tabular-nums">{fmtR$(step2Form.weekendLunch + step2Form.weekendDinner)}</span></div>
                      </div>
                    </div>
                  </div>

                  {remainingForParent.length === 0 && (
                    <div className="flex gap-2 px-3.5 py-3 rounded-xl bg-danger-soft border border-danger/25 items-start">
                      <AlertTriangle className="w-3.5 h-3.5 text-danger-strong flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="text-xs text-danger m-0">
                        O colaborador original ficará <strong>sem dias atribuídos</strong>. Ao confirmar, o registro original ficará zerado.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="bg-card border-t border-border flex-shrink-0 px-6 py-4 space-y-3">
                  {/* Summary card */}
                  <div className="rounded-xl border border-border shadow-1 overflow-hidden">
                    <div className="grid grid-cols-3 divide-x divide-border">
                      {/* Base honesta: os valores vêm do BudgetActual do titular (realizado),
                          não do planejado do RH — o rótulo antigo "Planejado prop." mentia */}
                      <div
                        className="px-3 py-3 text-center"
                        title={`Proporcional calculado sobre o realizado do titular, não sobre o planejado do RH${proportionalPlannedBreakdown ? ` — ${proportionalPlannedBreakdown}` : ''}`}
                      >
                        <div className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest mb-1">Base do titular (realizado)</div>
                        <div className="text-sm font-bold text-slate-600 tabular-nums">{fmtR$(proportionalPlanned)}</div>
                      </div>
                      <div className="px-4 py-3 text-center bg-brand-soft/60">
                        <div className="text-2xs uppercase text-primary font-semibold tracking-widest mb-1">Realizado</div>
                        <div className="text-sm font-bold text-primary tabular-nums">{fmtR$(s2Realizado)}</div>
                      </div>
                      <div className={`px-4 py-3 text-center ${Math.abs(s2Difference) <= 1 ? 'bg-surface-muted/60' : s2Difference < 0 ? 'bg-success-soft/60' : 'bg-danger-soft/60'}`}>
                        <div className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest mb-1">Diferença</div>
                        {Math.abs(s2Difference) <= 1 ? (
                          <div className="text-sm font-bold text-muted-foreground tabular-nums">—</div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {s2Difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" /> : <TrendingUp className="w-3.5 h-3.5 text-danger-strong" aria-hidden="true" />}
                            <span className={`text-sm font-bold tabular-nums ${s2Difference < 0 ? 'text-success' : 'text-danger'}`}>
                              {s2Difference > 0 ? '+' : '−'}{fmtR$(Math.abs(s2Difference))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="ghost" className="h-9 px-4 text-sm text-muted-foreground hover:text-slate-700 rounded-xl flex items-center gap-2" onClick={() => setStep(1)} disabled={isPending}>
                      <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar
                    </Button>
                    <Button
                      onClick={attemptConfirm}
                      disabled={isPending}
                      className="h-9 px-5 text-sm rounded-xl text-white font-medium shadow-2 flex items-center gap-2 bg-primary-hover"
                    >
                      <CheckCheck className="w-4 h-4" aria-hidden="true" />
                      {isPending ? 'Confirmando…' : 'Confirmar divisão'}
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
          <div id="split-zeroday-portal" role="alertdialog" aria-modal="true" aria-label="Colaborador original sem dias" className="bg-card rounded-xl max-w-[420px] w-full p-7 shadow-3">
            <div className="flex gap-3 items-start mb-5">
              <div className="w-10 h-10 rounded-xl bg-danger-soft flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger-strong" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-base text-foreground m-0 mb-1.5">Colaborador original sem dias</p>
                <p className="text-sm text-muted-foreground m-0 leading-relaxed">
                  Todos os dias foram redistribuídos para o novo colaborador. O registro original ficará com <strong>0 dias</strong>. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowZeroDayConfirm(false)}>Cancelar</Button>
              <Button
                onClick={() => { setShowZeroDayConfirm(false); doConfirm(); }}
                className="rounded-xl text-white bg-danger-strong hover:bg-danger/90"
              >
                Confirmar mesmo assim
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {DialogoDescarte}
    </>,
    document.body
  );
}
