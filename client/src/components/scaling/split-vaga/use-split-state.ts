/**
 * Estado do "Dividir escalação" (25/09 — extraído de split-vaga-modal.tsx):
 * passo atual, colaborador e dias escolhidos, valores do passo 2, os cálculos
 * proporcionais do titular, a montagem do payload e a acessibilidade do modal
 * (Esc, foco preso, "Descartar alterações?").
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { fixEncoding } from "@/lib/utils";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { getDaysInRange, isWeekend, fmtR$, type SplitVagaModalProps, type Step2Form } from "./split-shared";

export function useSplitState({ item, collaborators, teamInclusion, eventStartDate, eventEndDate, takenDays = [], onClose, onConfirm, isPending }: SplitVagaModalProps) {
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
  }, []);

  return {
    step, setStep, collabSearch, setCollabSearch, selectedCollabId, setSelectedCollabId,
    collabDropOpen, setCollabDropOpen, selectedDays, setSelectedDays, showZeroDayConfirm, setShowZeroDayConfirm,
    dropRef, inputRef, dropRect, step2Form, setStep2Form,
    availableDays, parentWorkedDays, selDaysSorted, selWeekdays, selWeekends, remainingForParent, takenSet,
    filteredCollabs, selectedCollab,
    s2SubDiariasUtil, s2SubDiariasFds, s2SubDiarias, s2TotalAlim, s2Realizado,
    proportionalPlanned, proportionalPlannedBreakdown, s2Difference,
    toggleDay, openDrop, goToStep2, attemptConfirm, doConfirm, canGoNext,
    modalRef, DialogoDescarte, fechar,
  };
}

export type SplitState = ReturnType<typeof useSplitState>;
