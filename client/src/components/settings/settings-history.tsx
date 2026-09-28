// Extraído de system-settings.tsx em 25/09 (modularização): card "Histórico
// deste navegador" (localStorage — não compartilhado). Agrupa as entradas por
// evento de salvamento (mesmo timestamp + usuário) e mostra as 10 últimas.
// O aberto/fechado é estado local: só interessa a este card.
import { useState } from "react";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateTime, getUserInitials, type HistoryEntry } from "./settings-utils";

export interface SettingsHistoryProps {
  history: HistoryEntry[];
}

export function SettingsHistory({ history }: SettingsHistoryProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  /* ── Group history by save event (same timestamp) ── */
  const groupedHistory = history.reduce<{ timestamp: string; user: string; entries: HistoryEntry[] }[]>((acc, e) => {
    const existing = acc.find(g => g.timestamp === e.timestamp && g.user === e.user);
    if (existing) { existing.entries.push(e); }
    else { acc.push({ timestamp: e.timestamp, user: e.user, entries: [e] }); }
    return acc;
  }, []).slice(0, 10);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {groupedHistory.length === 0 ? (
        <div className="flex items-center gap-2.5 px-5 py-4 text-sm text-muted-foreground">
          <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span>Histórico deste navegador</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-normal text-muted-foreground">Nenhuma alteração registrada neste navegador</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="flex w-full items-center justify-between bg-surface-muted px-5 py-4 transition-colors hover:bg-muted"
          >
            <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-slate-700">
              <Clock className="w-4 h-4 text-primary" aria-hidden="true" />
              Histórico deste navegador
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-primary">
                {groupedHistory.length}
              </span>
              <span className="text-2xs font-normal text-muted-foreground">
                registrado localmente — outros usuários não veem estas entradas
              </span>
            </div>
            {historyOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
          </button>
          {historyOpen && (
            <div className="divide-y divide-border bg-card">
              {groupedHistory.map((group, gi) => (
                <div key={gi} className="flex items-start gap-4 px-5 py-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-bold text-primary-foreground">
                    {getUserInitials(group.user)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{group.user}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(group.timestamp)}</span>
                      <span className="text-xs text-muted-foreground">· alterou:</span>
                    </div>
                    <div className="space-y-0.5">
                      {group.entries.map((e, ei) => (
                        <div key={ei} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="text-muted-foreground">·</span>
                          <span className="font-medium text-slate-700">{e.field}:</span>
                          <span className="text-danger-strong line-through">{e.oldValue}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-semibold text-success">{e.newValue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
