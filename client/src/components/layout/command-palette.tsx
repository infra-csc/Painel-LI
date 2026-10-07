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
 *
 * 07/10: ícones com a cor do grupo (como no menu), a tela atual marcada, "↵"
 * na linha selecionada, carregamento dos eventos visível, vazio com dica e o
 * rodapé com as teclas certas (era "CtrlK fecha").
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { formatDateRange } from "@/lib/dates";
import { scalingHref } from "@/lib/use-scaling-event";
import { cn } from "@/lib/utils";
import type { Event } from "@shared/schema";
import { Search, CalendarDays, SearchX, Loader2 } from "lucide-react";
import { visibleTabs, groupOf, classeDeCorDaTela, SCALING_MODULE_PATHS } from "./nav-items";
import { Kbd } from "./kbd";
import { FOCO } from "./shell-styles";

const GRUPO = cn(
  "px-1.5 pb-1",
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5",
  "[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground",
);
const ITEM = cn(
  "group gap-3 h-10 px-2.5 rounded-lg text-sm cursor-pointer text-foreground",
  "data-[selected=true]:bg-brand-soft data-[selected=true]:text-foreground",
  // O utilitário do CommandItem força 16px em todo svg; aqui o ícone manda.
  "[&_svg]:size-[17px]",
);

/** "↵" que aparece só na linha selecionada, no lugar da dica da direita. */
function Enter() {
  return <Kbd className="hidden sm:group-data-[selected=true]:inline-flex">↵</Kbd>;
}

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
  const { data: events, isLoading: carregandoEventos } = useQuery<Event[]>({
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
        className={cn(
          "top-[12vh] sm:top-[14vh] translate-y-0 data-[state=open]:slide-in-from-top-[2%] data-[state=closed]:slide-out-to-top-[2%]",
          "max-w-[600px] w-[calc(100vw-24px)] p-0 gap-0 rounded-2xl overflow-hidden bg-card",
          "[&>button:last-child]:hidden",
        )}
      >
        <DialogTitle className="sr-only">Buscar tela ou evento</DialogTitle>
        <Command shouldFilter className="bg-card rounded-none">
          <div className="flex items-center gap-3 h-14 px-4 border-b border-border">
            <Search className="w-[18px] h-[18px] shrink-0 text-primary" aria-hidden="true" />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={eventTarget ? "Buscar tela ou evento…" : "Buscar tela…"}
              className="flex-1 min-w-0 h-full border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <DialogClose className={cn("shrink-0 rounded-md border-0 bg-transparent p-0 cursor-pointer", FOCO)} aria-label="Fechar a busca">
              {/* No toque não existe Esc: o mesmo botão diz "Fechar". */}
              <Kbd className="hover:text-foreground"><span className="sm:hidden">Fechar</span><span className="hidden sm:inline">Esc</span></Kbd>
            </DialogClose>
          </div>

          <CommandList className="max-h-[min(400px,calc(100dvh-14vh-140px))] py-1 [scrollbar-width:thin]">
            <CommandEmpty className="flex flex-col items-center text-center px-6 py-10">
              <SearchX className="w-6 h-6 text-muted-foreground mb-2" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">Nada encontrado para “{query.trim()}”</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {eventTarget ? "Tente o nome de uma tela, de um evento ou de uma cidade." : "Tente o nome de uma tela."}
              </span>
            </CommandEmpty>

            <CommandGroup heading="Telas" className={GRUPO}>
              {tabs.map((tab) => {
                const found = groupOf(tab.id);
                const hint = found ? [found.group.title, found.subLabel].filter(Boolean).join(" › ") : "";
                const atual = tab.path === currentPath;
                return (
                  <CommandItem
                    key={tab.id}
                    value={`${tab.label} ${hint}`}
                    onSelect={() => go(tab.path)}
                    className={ITEM}
                  >
                    <span className={cn("flex items-center justify-center w-5", classeDeCorDaTela(tab.id))}>
                      <tab.icon aria-hidden="true" />
                    </span>
                    <span className="flex-1 min-w-0 truncate">{tab.label}</span>
                    {atual ? (
                      <span className="shrink-0 text-2xs font-medium text-primary sm:group-data-[selected=true]:hidden">Tela atual</span>
                    ) : hint ? (
                      <span className="shrink-0 text-2xs text-muted-foreground sm:group-data-[selected=true]:hidden">{hint}</span>
                    ) : null}
                    <Enter />
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {eventTarget && carregandoEventos && (
              <div role="status" className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Carregando eventos…
              </div>
            )}

            {eventTarget && activeEvents.length > 0 && (
              <CommandGroup heading="Eventos" className={GRUPO}>
                {activeEvents.map((ev) => (
                  <CommandItem
                    key={ev.id}
                    value={`${ev.name} ${ev.location ?? ""}`}
                    onSelect={() => go(scalingHref(eventTarget, ev.id))}
                    className={ITEM}
                  >
                    <span className="flex items-center justify-center w-5 text-primary"><CalendarDays aria-hidden="true" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{ev.name}</span>
                    </span>
                    <span className="shrink-0 text-2xs text-muted-foreground tabular-nums sm:group-data-[selected=true]:hidden">
                      {formatDateRange(ev.startDate as unknown as string, ev.endDate as unknown as string)}
                    </span>
                    <Enter />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          <div className="hidden sm:flex items-center gap-4 h-10 px-4 border-t border-border bg-surface-muted text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
            <span className="inline-flex items-center gap-1.5"><Kbd>↵</Kbd> abrir</span>
            <span className="inline-flex items-center gap-1.5"><Kbd>Esc</Kbd> fechar</span>
            {eventTarget && <span className="ml-auto truncate">Eventos abrem no módulo de Escala</span>}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
