import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, UserPlus, Calendar, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BudgetActual, Collaborator, TeamInclusion } from "@shared/schema";

interface SplitVagaModalProps {
  item: BudgetActual;
  collaborators: Collaborator[];
  teamInclusion: TeamInclusion | undefined;
  onClose: () => void;
  onConfirm: (payload: {
    collaboratorId: string;
    workedDays: string[];
    parentWorkedDays: string[];
    mobility: number;
  }) => void;
  isPending?: boolean;
}

function getDaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  while (current <= end) {
    days.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${days[d.getDay()]} ${d.getDate()}/${months[d.getMonth()]}`;
}

export function SplitVagaModal({ item, collaborators, teamInclusion, onClose, onConfirm, isPending }: SplitVagaModalProps) {
  const [collabSearch, setCollabSearch] = useState("");
  const [selectedCollabId, setSelectedCollabId] = useState<string | null>(null);
  const [collabDropOpen, setCollabDropOpen] = useState(false);
  const [newWorkedDays, setNewWorkedDays] = useState<Set<string>>(new Set());
  const [mobility, setMobility] = useState(item.mobility ?? 0);
  const dropContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const availableDays = useMemo(() => {
    const start = teamInclusion?.scheduleStartDate;
    const end = teamInclusion?.scheduleEndDate;
    if (start && end) return getDaysInRange(start, end);
    return [];
  }, [teamInclusion]);

  const parentWorkedDays = useMemo(() => {
    if (item.workedDays && item.workedDays.length > 0) return item.workedDays;
    return availableDays;
  }, [item.workedDays, availableDays]);

  const filteredCollabs = useMemo(() => {
    const q = collabSearch.toLowerCase();
    return collaborators
      .filter(c => c.id !== item.collaboratorId)
      .filter(c => !q || (c.fullName || "").toLowerCase().includes(q))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR"))
      .slice(0, 30);
  }, [collaborators, collabSearch, item.collaboratorId]);

  const selectedCollab = collaborators.find(c => c.id === selectedCollabId);
  const selectedCollabName = selectedCollab ? (selectedCollab.fullName || "") : "";

  function toggleDay(day: string) {
    setNewWorkedDays(prev => {
      const s = new Set(prev);
      if (s.has(day)) s.delete(day); else s.add(day);
      return s;
    });
  }

  function openDrop() {
    if (dropContainerRef.current) {
      const rect = dropContainerRef.current.getBoundingClientRect();
      setDropRect({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
    setCollabDropOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => {
    if (!collabDropOpen) return;
    function handler(e: MouseEvent) {
      const portal = document.getElementById("split-collab-portal");
      if (dropContainerRef.current && !dropContainerRef.current.contains(e.target as Node) && portal && !portal.contains(e.target as Node)) {
        setCollabDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [collabDropOpen]);

  function handleConfirm() {
    if (!selectedCollabId || newWorkedDays.size === 0) return;
    const assignedToNew = Array.from(newWorkedDays).sort();
    const remainingForParent = parentWorkedDays.filter(d => !newWorkedDays.has(d));
    onConfirm({ collaboratorId: selectedCollabId, workedDays: assignedToNew, parentWorkedDays: remainingForParent, mobility });
  }

  // Coverage check
  const allAssigned = new Set([...parentWorkedDays.filter(d => !newWorkedDays.has(d)), ...Array.from(newWorkedDays)]);
  const uncovered = availableDays.filter(d => !allAssigned.has(d));

  const weekdayCount = Array.from(newWorkedDays).filter(d => !isWeekend(d)).length;
  const weekendCount = Array.from(newWorkedDays).filter(d => isWeekend(d)).length;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Collaborator picker */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
              Colaborador
            </label>
            <div ref={dropContainerRef} style={{ position: 'relative' }}>
              {!collabDropOpen ? (
                <button onClick={openDrop} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 42, padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#F8FAFC', cursor: 'pointer', fontSize: 14, color: selectedCollab ? '#1E293B' : '#94A3B8', textAlign: 'left' }}>
                  <Search style={{ width: 15, height: 15, color: '#94A3B8', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedCollabName ? 500 : 400 }}>
                    {selectedCollabName || 'Buscar colaborador...'}
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
                    <button key={c.id} onMouseDown={e => { e.preventDefault(); setSelectedCollabId(c.id); setCollabDropOpen(false); setCollabSearch(""); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', border: 'none', background: c.id === selectedCollabId ? '#EEF2FF' : 'transparent', cursor: 'pointer', fontSize: 14, color: c.id === selectedCollabId ? '#3B5BDB' : '#1E293B', textAlign: 'left', borderBottom: i < filteredCollabs.length - 1 ? '1px solid #F1F5F9' : 'none', fontWeight: c.id === selectedCollabId ? 600 : 400 }}
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

          {/* Day picker */}
          {availableDays.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                Dias que este colaborador irá cobrir
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableDays.map(day => {
                  const isSelected = newWorkedDays.has(day);
                  const isParentDay = parentWorkedDays.includes(day);
                  const wknd = isWeekend(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                        background: isSelected ? (wknd ? '#FFF7ED' : '#EEF2FF') : '#F8FAFC',
                        borderColor: isSelected ? (wknd ? '#F97316' : '#3B5BDB') : '#E2E8F0',
                        color: isSelected ? (wknd ? '#C2410C' : '#3B5BDB') : '#64748B',
                        position: 'relative',
                      }}
                    >
                      {isSelected && <Check style={{ width: 10, height: 10, display: 'inline', marginRight: 3 }} />}
                      {formatDay(day)}
                      {!isParentDay && !isSelected && <span style={{ fontSize: 9, color: '#F59E0B', marginLeft: 4 }}>⚠</span>}
                    </button>
                  );
                })}
              </div>
              {Array.from(newWorkedDays).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>
                  <span style={{ fontWeight: 600 }}>{Array.from(newWorkedDays).length} dia(s)</span> selecionado(s)
                  {weekdayCount > 0 && ` — ${weekdayCount} útil(is)`}
                  {weekendCount > 0 && ` — ${weekendCount} fim de semana`}
                </div>
              )}
            </div>
          )}

          {/* Mobility */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
              Mobilidade (R$)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 11, fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>R$</span>
              <input
                type="number" step="0.01" min="0"
                value={mobility / 100}
                onChange={e => setMobility(Math.round(parseFloat(e.target.value || "0") * 100))}
                style={{ width: '100%', height: 40, paddingLeft: 32, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#F8FAFC' }}
              />
            </div>
          </div>

          {/* Coverage warning */}
          {uncovered.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A', alignItems: 'flex-start' }}>
              <AlertTriangle style={{ width: 14, height: 14, color: '#D97706', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
                Após a divisão, <strong>{uncovered.length} dia(s)</strong> da vaga original ficarão sem cobertura.
                Você pode voltar e dividir novamente para cobrir esses dias.
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid #F1F5F9' }}>
            <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedCollabId || newWorkedDays.size === 0 || isPending}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
            >
              {isPending ? "Confirmando..." : "Confirmar divisão"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
