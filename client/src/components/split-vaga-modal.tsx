import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, UserPlus, Check, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BudgetActual, Collaborator, TeamInclusion } from "@shared/schema";

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

function fmtR$(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
      {children}
    </p>
  );
}

function ReadRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid #F1F5F9' }}>
      <span style={{ fontSize: 12, color: '#64748B' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', textAlign: 'right' }}>
        {value}
        {sub && <span style={{ fontSize: 11, fontWeight: 400, color: '#94A3B8', marginLeft: 4 }}>{sub}</span>}
      </span>
    </div>
  );
}

export function SplitVagaModal({ item, collaborators, teamInclusion, takenDays = [], onClose, onConfirm, isPending }: SplitVagaModalProps) {
  const [collabSearch, setCollabSearch] = useState("");
  const [selectedCollabId, setSelectedCollabId] = useState<string | null>(null);
  const [collabDropOpen, setCollabDropOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [mobility, setMobility] = useState(item.mobility ?? 0);
  const [showZeroDayConfirm, setShowZeroDayConfirm] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // The days this item currently "owns" — either explicit workedDays or all available days
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

  // Per-day rate derivation from parent item
  const parentWeekdayCount = useMemo(() => parentWorkedDays.filter(d => !isWeekend(d)).length, [parentWorkedDays]);
  const parentWeekendCount = useMemo(() => parentWorkedDays.filter(d => isWeekend(d)).length, [parentWorkedDays]);

  const perDayWeekdayLunch = parentWeekdayCount > 0 ? Math.round((item.weekdayLunch || 0) / parentWeekdayCount) : 0;
  const perDayWeekdayDinner = parentWeekdayCount > 0 ? Math.round((item.weekdayDinner || 0) / parentWeekdayCount) : 0;
  const perDayWeekendLunch = parentWeekendCount > 0 ? Math.round((item.weekendLunch || 0) / parentWeekendCount) : 0;
  const perDayWeekendDinner = parentWeekendCount > 0 ? Math.round((item.weekendDinner || 0) / parentWeekendCount) : 0;

  // Stats on selected days
  const selWeekdays = Array.from(selectedDays).filter(d => !isWeekend(d)).length;
  const selWeekends = Array.from(selectedDays).filter(d => isWeekend(d)).length;

  // Auto-calculated costs for new collaborator
  const calcDailyTotal = selectedDays.size * item.dailyValue;
  const calcWeekdayLunch = selWeekdays * perDayWeekdayLunch;
  const calcWeekdayDinner = selWeekdays * perDayWeekdayDinner;
  const calcWeekendLunch = selWeekends * perDayWeekendLunch;
  const calcWeekendDinner = selWeekends * perDayWeekendDinner;
  const calcAlimTotal = calcWeekdayLunch + calcWeekdayDinner + calcWeekendLunch + calcWeekendDinner;
  const calcTotal = calcDailyTotal + calcAlimTotal + mobility;

  // Remaining days for parent after split
  const remainingForParent = parentWorkedDays.filter(d => !selectedDays.has(d));

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
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && portal && !portal.contains(e.target as Node)) {
        setCollabDropOpen(false);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [collabDropOpen]);

  function attemptConfirm() {
    if (!selectedCollabId || selectedDays.size === 0) return;
    if (remainingForParent.length === 0) {
      setShowZeroDayConfirm(true);
    } else {
      doConfirm();
    }
  }

  function doConfirm() {
    if (!selectedCollabId) return;
    onConfirm({
      collaboratorId: selectedCollabId,
      workedDays: Array.from(selectedDays).sort(),
      parentWorkedDays: remainingForParent,
      mobility,
      weekdayLunch: calcWeekdayLunch,
      weekdayDinner: calcWeekdayDinner,
      weekendLunch: calcWeekendLunch,
      weekendDinner: calcWeekendDinner,
      dailyValue: item.dailyValue,
      dailyQuantity: selectedDays.size,
      totalValue: calcTotal,
    });
  }

  const canConfirm = !!selectedCollabId && selectedDays.size > 0 && !isPending;

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserPlus style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#1E293B', margin: 0 }}>Dividir escalação</p>
                <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Atribua dias específicos a outro colaborador</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
              <X style={{ width: 20, height: 20 }} />
            </button>
          </div>

          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflowY: 'auto' }}>

            {/* ── 1. Collaborator picker ── */}
            <div>
              <Label>Colaborador</Label>
              <div ref={dropRef} style={{ position: 'relative' }}>
                {!collabDropOpen ? (
                  <button onClick={openDrop} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 42, padding: '0 12px', border: `1px solid ${selectedCollab ? '#CBD5E1' : '#CBD5E1'}`, borderRadius: 8, background: '#F8FAFC', cursor: 'pointer', fontSize: 14, color: selectedCollab ? '#1E293B' : '#94A3B8', textAlign: 'left', boxSizing: 'border-box' }}>
                    <Search style={{ width: 15, height: 15, color: '#94A3B8', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedCollab ? 600 : 400 }}>
                      {selectedCollab ? (selectedCollab.fullName || "") : 'Buscar colaborador...'}
                    </span>
                  </button>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: 10, top: 13, width: 15, height: 15, color: '#94A3B8', pointerEvents: 'none' }} />
                    <input ref={inputRef} value={collabSearch} onChange={e => setCollabSearch(e.target.value)} placeholder="Buscar colaborador..." style={{ width: '100%', height: 42, paddingLeft: 32, paddingRight: 12, border: '1px solid #3B5BDB', borderRadius: 8, fontSize: 14, outline: 'none', boxShadow: '0 0 0 3px rgba(59,91,219,0.1)', color: '#1E293B', background: '#fff', boxSizing: 'border-box' }} />
                  </div>
                )}
                {collabDropOpen && dropRect && createPortal(
                  <div id="split-collab-portal" style={{ position: 'absolute', top: dropRect.top, left: dropRect.left, width: dropRect.width, zIndex: 10000, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                    {filteredCollabs.length === 0 ? (
                      <div style={{ padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Nenhum colaborador encontrado</div>
                    ) : filteredCollabs.map((c, i) => (
                      <button key={c.id}
                        onMouseDown={e => { e.preventDefault(); setSelectedCollabId(c.id); setCollabDropOpen(false); setCollabSearch(""); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', border: 'none', background: c.id === selectedCollabId ? '#EEF2FF' : 'transparent', cursor: 'pointer', fontSize: 14, color: c.id === selectedCollabId ? '#3B5BDB' : '#1E293B', textAlign: 'left', borderBottom: i < filteredCollabs.length - 1 ? '1px solid #F1F5F9' : 'none', fontWeight: c.id === selectedCollabId ? 600 : 400 }}
                        onMouseEnter={e => { if (c.id !== selectedCollabId) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                        onMouseLeave={e => { if (c.id !== selectedCollabId) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
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

            {/* ── 2. Day picker ── */}
            {availableDays.length > 0 && (
              <div>
                <Label>Dias que este colaborador irá cobrir</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {availableDays.map(day => {
                    const isSel = selectedDays.has(day);
                    const isTaken = takenSet.has(day);
                    const notParent = !parentWorkedDays.includes(day);
                    const wknd = isWeekend(day);
                    return (
                      <button key={day} onClick={() => toggleDay(day)} disabled={isTaken}
                        title={isTaken ? "Dia já atribuído a outro colaborador desta divisão" : undefined}
                        style={{
                          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          cursor: isTaken ? 'not-allowed' : 'pointer', border: '1px solid',
                          background: isTaken ? '#F1F5F9' : isSel ? (wknd ? '#FFF7ED' : '#EEF2FF') : '#F8FAFC',
                          borderColor: isTaken ? '#CBD5E1' : isSel ? (wknd ? '#F97316' : '#3B5BDB') : '#E2E8F0',
                          color: isTaken ? '#CBD5E1' : isSel ? (wknd ? '#C2410C' : '#3B5BDB') : '#64748B',
                          opacity: isTaken ? 0.6 : 1,
                          textDecoration: isTaken ? 'line-through' : 'none',
                        }}>
                        {isSel && !isTaken && <Check style={{ width: 10, height: 10, display: 'inline', marginRight: 3 }} />}
                        {formatDay(day)}
                        {notParent && !isSel && !isTaken && <span style={{ fontSize: 9, color: '#F59E0B', marginLeft: 4 }}>⚠</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedDays.size > 0 && (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>
                    <strong>{selectedDays.size} dia(s)</strong> selecionado(s)
                    {selWeekdays > 0 && ` — ${selWeekdays} útil(is)`}
                    {selWeekends > 0 && ` — ${selWeekends} fim de semana`}
                  </p>
                )}
                {takenDays.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, padding: '7px 10px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <Info style={{ width: 13, height: 13, color: '#3B5BDB', flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
                      Dias riscados já estão atribuídos a outro colaborador desta divisão.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── 3. Costs breakdown (auto-calculated, read-only preview + editable mobility) ── */}
            {selectedDays.size > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                {/* Diárias */}
                <div style={{ background: 'linear-gradient(135deg,#EEF2FF,#E0E7FF)', borderRadius: 12, padding: '14px 14px 10px', border: '1px solid #C7D2FE' }}>
                  <p style={{ fontSize: 10, fontWeight: 800, color: '#3B5BDB', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
                    💼 Diárias
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: '#1E293B', margin: '0 0 8px', tabularNums: true } as React.CSSProperties}>
                    {fmtR$(calcDailyTotal)}
                  </p>
                  <ReadRow label={`${selWeekdays} dia(s) útil(is)`} value={fmtR$(selWeekdays * item.dailyValue)} sub={`× ${fmtR$(item.dailyValue)}`} />
                  <ReadRow label={`${selWeekends} fim(s) de semana`} value={fmtR$(selWeekends * item.dailyValue)} sub={`× ${fmtR$(item.dailyValue)}`} />
                </div>

                {/* Alimentação */}
                <div style={{ background: 'linear-gradient(135deg,#FFF7ED,#FEF3C7)', borderRadius: 12, padding: '14px 14px 10px', border: '1px solid #FCD34D' }}>
                  <p style={{ fontSize: 10, fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
                    🍽 Alimentação
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: '#1E293B', margin: '0 0 8px' }}>
                    {fmtR$(calcAlimTotal)}
                  </p>
                  {selWeekdays > 0 && (
                    <>
                      <ReadRow label="Almoço útil" value={fmtR$(calcWeekdayLunch)} sub={`${selWeekdays}×`} />
                      <ReadRow label="Jantar útil" value={fmtR$(calcWeekdayDinner)} sub={`${selWeekdays}×`} />
                    </>
                  )}
                  {selWeekends > 0 && (
                    <>
                      <ReadRow label="Almoço f.s." value={fmtR$(calcWeekendLunch)} sub={`${selWeekends}×`} />
                      <ReadRow label="Jantar f.s." value={fmtR$(calcWeekendDinner)} sub={`${selWeekends}×`} />
                    </>
                  )}
                  {calcAlimTotal === 0 && (
                    <p style={{ fontSize: 11, color: '#D97706', margin: 0 }}>Sem alimentação configurada</p>
                  )}
                </div>
              </div>
            )}

            {/* Mobilidade (editable) */}
            <div>
              <Label>Mobilidade</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 10, top: 11, fontSize: 13, color: '#94A3B8', fontWeight: 600, pointerEvents: 'none' }}>R$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={mobility / 100}
                    onChange={e => setMobility(Math.round(parseFloat(e.target.value || "0") * 100))}
                    style={{ width: '100%', height: 40, paddingLeft: 32, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#F8FAFC' }}
                  />
                </div>
                <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>por evento</span>
              </div>
            </div>

            {/* Total preview */}
            {selectedDays.size > 0 && (
              <div style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total do novo colaborador</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0 }}>{fmtR$(calcTotal)}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '0 0 2px' }}>Colaborador original fica com</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: remainingForParent.length === 0 ? '#FCA5A5' : '#A5F3FC', margin: 0 }}>
                    {remainingForParent.length} dia(s)
                  </p>
                </div>
              </div>
            )}

            {/* Warning: parent gets 0 days */}
            {remainingForParent.length === 0 && selectedDays.size > 0 && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', alignItems: 'flex-start' }}>
                <AlertTriangle style={{ width: 14, height: 14, color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#991B1B', margin: 0 }}>
                  O colaborador original ficará <strong>sem dias atribuídos</strong>. Ao confirmar, você precisará remover o registro original manualmente ou ele ficará zerado.
                </p>
              </div>
            )}

            {/* Validations */}
            {!selectedCollabId && (
              <div style={{ fontSize: 12, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle style={{ width: 12, height: 12 }} /> Selecione um colaborador para continuar.
              </div>
            )}
            {selectedCollabId && selectedDays.size === 0 && (
              <div style={{ fontSize: 12, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle style={{ width: 12, height: 12 }} /> Selecione pelo menos 1 dia para o novo colaborador.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
              <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button
                onClick={attemptConfirm}
                disabled={!canConfirm}
                style={{ background: canConfirm ? 'linear-gradient(135deg,#7C3AED,#4F46E5)' : undefined, color: canConfirm ? '#fff' : undefined, border: 'none' }}
              >
                {isPending ? "Confirmando..." : "Confirmar divisão"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Zero-day confirmation dialog */}
      {showZeroDayConfirm && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 420, width: '100%', padding: '28px 28px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle style={{ width: 20, height: 20, color: '#EF4444' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#1E293B', margin: '0 0 6px' }}>Colaborador original sem dias</p>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                  Todos os dias foram redistribuídos para o novo colaborador. O registro original ficará com <strong>0 dias</strong>. Deseja continuar mesmo assim?
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="outline" onClick={() => setShowZeroDayConfirm(false)}>Cancelar</Button>
              <Button onClick={() => { setShowZeroDayConfirm(false); doConfirm(); }} style={{ background: '#EF4444', color: '#fff', border: 'none' }}>
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
