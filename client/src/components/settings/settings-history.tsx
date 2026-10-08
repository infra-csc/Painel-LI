// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// "Histórico deste navegador" (localStorage — não compartilhado). Agrupa as
// entradas por evento de salvamento (mesmo timestamp + usuário) e mostra as
// 10 últimas. O aberto/fechado é estado local: só interessa a este bloco.
//
// 08/10 — linha do tempo: quem e quando no alto de cada salvamento, e cada
// campo como "antes → depois" em colunas (o antes riscado em cinza, não em
// vermelho: mudar um valor não é erro). O aviso "só neste navegador" fica no
// título, não escondido numa linha de 10px.
import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { avatarClasses, initials, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ancoraDaSecao } from "./settings-secoes";
import { formatDateTime, type HistoryEntry } from "./settings-utils";

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
  const vazio = groupedHistory.length === 0;

  return (
    <section id={ancoraDaSecao("historico")} aria-labelledby="cfg-historico-titulo" className="cfg-grupo rounded-xl border border-border bg-card" data-testid="cfg-historico">
      <button
        type="button"
        onClick={() => setHistoryOpen(o => !o)}
        disabled={vazio}
        aria-expanded={vazio ? undefined : historyOpen}
        className="group flex w-full items-start justify-between gap-3 px-5 py-4 text-left rounded-xl transition-colors enabled:hover:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-sm:px-4"
        data-testid="cfg-historico-alternar"
      >
        <span className="flex items-start gap-3 min-w-0">
          <History className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span id="cfg-historico-titulo" className="text-[15px] font-semibold leading-6 text-foreground">Histórico deste navegador</span>
              {!vazio && (
                <span className="inline-flex items-center h-6 px-2 rounded-full bg-muted text-2xs font-semibold tabular-nums text-muted-foreground">
                  {groupedHistory.length} {groupedHistory.length === 1 ? "salvamento" : "salvamentos"}
                </span>
              )}
            </span>
            <span className="block mt-0.5 text-xs leading-5 text-muted-foreground">
              {vazio
                ? "Nenhuma alteração salva por este navegador ainda. O registro fica só nesta máquina — outras pessoas não veem."
                : "Registrado só nesta máquina — outras pessoas e outros computadores não veem estas entradas."}
            </span>
          </span>
        </span>
        {!vazio && (
          <span className="inline-flex items-center gap-1.5 shrink-0 mt-0.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <span className="max-sm:hidden">{historyOpen ? "Recolher" : "Ver"}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 motion-reduce:transition-none", historyOpen && "rotate-180")} aria-hidden="true" />
          </span>
        )}
      </button>
      {historyOpen && !vazio && (
        <ol className="pas-entra m-0 list-none border-t border-border px-5 py-2 max-sm:px-4" aria-label="Salvamentos registrados neste navegador">
          {groupedHistory.map((group, gi) => {
            const nome = toTitleCase(group.user);
            const [bg, fg] = avatarClasses(group.user);
            return (
              <li key={gi} className="cfg-historico-item">
                <span className={cn("cfg-historico-avatar", bg, fg)} aria-hidden="true">{initials(group.user)}</span>
                <div className="min-w-0 flex-1 pb-4">
                  <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-foreground">{nome}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(group.timestamp)}</span>
                    <span className="text-xs text-muted-foreground">· {group.entries.length} {group.entries.length === 1 ? "valor" : "valores"}</span>
                  </p>
                  <dl className="cfg-historico-mudancas">
                    {group.entries.map((e, ei) => (
                      <div key={ei} className="contents">
                        <dt className="text-xs text-muted-foreground min-w-0">{e.field}</dt>
                        <dd className="m-0 text-xs tabular-nums whitespace-nowrap">
                          <span className="text-muted-foreground line-through decoration-muted-foreground/50">{e.oldValue}</span>
                          <span className="mx-1.5 text-muted-foreground" aria-hidden="true">→</span>
                          <span className="sr-only"> passou para </span>
                          <span className="font-semibold text-foreground">{e.newValue}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
