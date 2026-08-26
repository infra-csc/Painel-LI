/**
 * PALETA ⌘K — busca de telas e eventos.
 *
 * Grupos:
 *  • "Telas": as mesmas telas do menu, filtradas por `hasPermission` (nada de
 *    oferecer rota que o servidor vai recusar com 403);
 *  • "Eventos": GET /api/events (só os ativos) — escolher um abre a tela do
 *    módulo de Escala em que o usuário já está (ou a primeira que ele pode ver)
 *    com `?eventId=`, que é o deep-link real do módulo.
 *
 * O grupo "Ir para vaga" (#1234) do desenho FICOU DE FORA: não existe rota que
 * receba número de vaga — a Validação/Aprovação abrem por evento, e a Aprovação
 * só aceita `?request=` (id do pedido, não o número da vaga). Oferecer o atalho
 * levaria a uma tela que ignora o que foi digitado.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { formatDateRange } from "@/lib/dates";
import { scalingHref } from "@/lib/use-scaling-event";
import type { Event } from "@shared/schema";
import { MI } from "./mi";
import { visibleTabs, groupOf, iconClassFor, SCALING_MODULE_PATHS } from "./nav-items";
import { MOD } from "./shortcuts";

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const currentPath = location.split("?")[0];

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const tabs = useMemo(() => visibleTabs(user), [user]);

  /** Telas do módulo de Escala que este usuário abre — destino dos eventos. */
  const scalingTargets = useMemo(
    () => tabs.filter((t) => SCALING_MODULE_PATHS.includes(t.path)).map((t) => t.path),
    [tabs],
  );
  const eventTarget = scalingTargets.includes(currentPath) ? currentPath : scalingTargets[0];

  // Mesma chave das telas: quando o evento já foi carregado por alguma página,
  // a paleta abre sem requisição nenhuma.
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
    enabled: open && !!eventTarget,
  });
  const activeEvents = useMemo(
    () => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"),
    [events],
  );

  const go = (href: string) => { onOpenChange(false); navigate(href); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12vh] translate-y-0 max-w-[560px] w-[calc(100vw-32px)] p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Buscar tela ou evento</DialogTitle>
        <Command shouldFilter className="bg-card">
          <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-slate-100">
            <MI name="search" size={18} className="text-slate-400" />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={eventTarget ? "Buscar tela ou evento" : "Buscar tela"}
              className="flex-1 h-7 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-slate-400"
            />
            <kbd className="border border-border bg-background rounded-md px-1.5 py-px font-mono text-[10px] text-slate-400">esc</kbd>
          </div>

          <CommandList className="max-h-[320px] p-1.5">
            <CommandEmpty className="py-6 text-center text-xs text-slate-400">
              Nada encontrado para “{query.trim()}”.
            </CommandEmpty>

            <CommandGroup heading="Telas" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em]">
              {tabs.map((tab) => {
                const found = groupOf(tab.id);
                const hint = found ? [found.group.title, found.subLabel].filter(Boolean).join(" / ") : "";
                return (
                  <CommandItem
                    key={tab.id}
                    value={`${tab.label} ${hint}`}
                    onSelect={() => go(tab.path)}
                    className="gap-2.5 px-2.5 py-2 rounded-lg text-[13px] cursor-pointer"
                  >
                    <span className={found ? iconClassFor(found.group, tab.id) : "text-primary"}>
                      <MI name={tab.icon} filled size={17} />
                    </span>
                    <span className="flex-1 text-slate-900">{tab.label}</span>
                    {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {eventTarget && activeEvents.length > 0 && (
              <CommandGroup heading="Eventos" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em]">
                {activeEvents.map((ev) => (
                  <CommandItem
                    key={ev.id}
                    value={`${ev.name} ${ev.location ?? ""}`}
                    onSelect={() => go(scalingHref(eventTarget, ev.id))}
                    className="gap-2.5 px-2.5 py-2 rounded-lg text-[13px] cursor-pointer"
                  >
                    <span className="text-primary"><MI name="event" filled size={17} /></span>
                    <span className="flex-1 truncate text-slate-900">{ev.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatDateRange(ev.startDate as unknown as string, ev.endDate as unknown as string)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          <div className="flex items-center gap-3.5 px-3.5 py-2 border-t border-slate-100 bg-background/60 text-[10px] text-slate-400">
            <span>↑↓ navega</span>
            <span>↵ abre</span>
            <span>{MOD}K fecha</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
