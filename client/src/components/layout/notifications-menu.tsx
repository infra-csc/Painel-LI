/**
 * SINO DE PENDÊNCIAS — painel da barra do topo.
 *
 * Só mostra o que tem origem em dado real (ver `use-shell-data.ts`): pedidos de
 * ajuste que ESTE usuário pode decidir e trocas pendentes. Sem pendência, o
 * badge não aparece (nem zero) e o painel diz que não há nada.
 * "Marcar tudo como visto" apaga apenas o ponto de novidade — a contagem
 * continua sendo a realidade do servidor.
 */
import { useId, useState } from "react";
import { Link, useLocation } from "wouter";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import { useShellData } from "./use-shell-data";
import { useQueryKeysState } from "@/components/common/query-state";

/**
 * Chaves das consultas que alimentam o sino (ver `use-shell-data.ts`). Servem
 * para saber se AINDA está carregando ou se falhou — o hook não expõe isso e
 * "Nada pendente" aparecia durante a busca (23/09).
 */
export const SHELL_QUERY_KEYS: readonly (readonly string[])[] = [["/api/swap-requests"], ["shell"]];

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { notifications, pendingTotal, hasUnseen, markAllSeen } = useShellData();
  const estado = useQueryKeysState(SHELL_QUERY_KEYS);
  const [, navegar] = useLocation();
  /** O painel (role=dialog do Radix) se chama pelo título "Pendências" — sem isso era um diálogo sem nome. */
  const tituloId = useId();
  /** Navega com um carimbo novo: clicar de novo (ou já estando na tela) reabre o recorte. */
  const abrir = (href: string) => {
    setOpen(false);
    navegar(`${href}${href.includes("?") ? "&" : "?"}t=${Date.now()}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={pendingTotal > 0 ? `Pendências (${pendingTotal})` : "Pendências"}
              className={cn(
                "relative flex items-center justify-center w-[34px] h-[34px] rounded-lg border-0 cursor-pointer text-slate-600 transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                open ? "bg-brand-soft text-primary" : "bg-transparent hover:bg-muted",
              )}
            >
              <Bell className="h-[19px] w-[19px]" aria-hidden="true" />
              {pendingTotal > 0 && (
                <span className="absolute top-[3px] right-1 flex items-center justify-center min-w-[16px] h-4 px-[3px] rounded-full bg-danger-strong text-white text-2xs font-bold leading-none ring-2 ring-card">
                  {pendingTotal > 99 ? "99+" : pendingTotal}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>Pendências</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" sideOffset={8} aria-labelledby={tituloId} className="w-[380px] max-w-[calc(100vw-32px)] p-0 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3.5 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">
            <span id={tituloId}>Pendências</span> {pendingTotal > 0 && <span className="font-normal text-muted-foreground">· {pendingTotal}</span>}
          </span>
          {hasUnseen && (
            <button
              type="button"
              onClick={markAllSeen}
              className="border-0 bg-transparent p-0 text-2xs font-medium text-primary cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Marcar tudo como visto
            </button>
          )}
        </div>

        <div className="max-h-[340px] overflow-y-auto">
          {notifications.length === 0 && estado.isLoading ? (
            <p role="status" aria-live="polite" className="px-3.5 py-6 m-0 text-xs text-muted-foreground text-center">Carregando pendências…</p>
          ) : notifications.length === 0 && estado.isError ? (
            <p role="alert" className="px-3.5 py-6 m-0 text-xs text-destructive text-center">Não foi possível carregar as pendências. Verifique sua conexão.</p>
          ) : notifications.length === 0 ? (
            <p className="px-3.5 py-6 m-0 text-xs text-muted-foreground text-center">Nada pendente para você agora.</p>
          ) : notifications.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={(e) => { e.preventDefault(); abrir(n.href); }}
              className={cn(
                "flex gap-2.5 px-3.5 py-2.5 border-b border-border no-underline transition-colors hover:bg-surface-muted",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                n.isNew ? "bg-brand-soft/35" : "bg-card",
              )}
            >
              <span className={cn("flex items-center justify-center w-7 h-7 shrink-0 rounded-lg", n.iconClass)}>
                <n.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">{n.title}</span>
                {n.text && <span className="block text-2xs text-muted-foreground">{n.text}</span>}
                <span className="block mt-0.5 text-2xs text-muted-foreground">{[n.when, n.screen].filter(Boolean).join(" · ")}</span>
              </span>
              {n.isNew && <span className="w-[7px] h-[7px] mt-1 shrink-0 rounded-full bg-danger-strong" aria-hidden="true" />}{n.isNew && <span className="sr-only">Novo</span>}
            </Link>
          ))}
        </div>

        {/* Página geral (dono, 15/09): todas as pendências do sistema, não só da Escala. */}
        <div className="px-3.5 py-2.5 bg-background/60 border-t border-border">
          <Link
            href="/pendencias"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded"
          >
            Ver todas as pendências
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
