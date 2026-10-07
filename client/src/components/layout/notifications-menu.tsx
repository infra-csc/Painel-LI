/**
 * SINO DE PENDÊNCIAS — painel da barra do topo.
 *
 * Só mostra o que tem origem em dado real (ver `use-shell-data.ts`): pedidos de
 * ajuste que ESTE usuário pode decidir e trocas pendentes. Sem pendência, o
 * badge não aparece (nem zero) e o painel diz que não há nada.
 * "Marcar tudo como visto" apaga apenas o ponto de novidade — a contagem
 * continua sendo a realidade do servidor.
 *
 * 07/10 (casca premium): carregando vira esqueleto das linhas (o texto fica
 * para o leitor de tela), erro ganha "Tentar de novo" que refaz só as consultas
 * do sino, vazio vira "Tudo em dia" e o ponto de novo é azul — vermelho no app
 * é erro; o único vermelho daqui é o contador do sino.
 */
import { useId, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Bell, CheckCheck, ChevronRight, CloudOff, ArrowRight, CircleCheckBig, RotateCw } from "lucide-react";
import { useShellData } from "./use-shell-data";
import { useQueryKeysState } from "@/components/common/query-state";
import { FOCO, PAINEL_DO_TOPO, TOPBAR_ICON_BTN } from "./shell-styles";

/**
 * Chaves das consultas que alimentam o sino (ver `use-shell-data.ts`). Servem
 * para saber se AINDA está carregando ou se falhou — o hook não expõe isso e
 * "Nada pendente" aparecia durante a busca (23/09).
 */
export const SHELL_QUERY_KEYS: readonly (readonly string[])[] = [["/api/swap-requests"], ["shell"]];

/** Linhas-fantasma do carregamento (mesma geometria da linha real). */
export function LinhasCarregando({ linhas = 3, className }: { linhas?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("divide-y divide-border", className)}>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0 bg-border/60" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className={cn("h-3 bg-border/60", i % 2 ? "w-3/5" : "w-4/5")} />
            <Skeleton className="h-2.5 w-2/5 bg-border/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** "há 2 h · Aprovação de escala" — sem repetir a tela quando o título já a nomeia ("… em Escalação"). */
const meta = (n: { when: string; screen: string; title: string }) =>
  [n.when, n.title.includes(n.screen) ? "" : n.screen].filter(Boolean).join(" · ");

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { notifications, pendingTotal, hasUnseen, markAllSeen } = useShellData();
  const estado = useQueryKeysState(SHELL_QUERY_KEYS);
  const queryClient = useQueryClient();
  const [, navegar] = useLocation();
  /** O painel (role=dialog do Radix) se chama pelo título "Pendências" — sem isso era um diálogo sem nome. */
  const tituloId = useId();
  /** Navega com um carimbo novo: clicar de novo (ou já estando na tela) reabre o recorte. */
  const abrir = (href: string) => {
    setOpen(false);
    navegar(`${href}${href.includes("?") ? "&" : "?"}t=${Date.now()}`);
  };
  /** Refaz só as consultas do sino (as mesmas chaves que decidem o estado). */
  const tentarDeNovo = () => {
    for (const key of SHELL_QUERY_KEYS) void queryClient.refetchQueries({ queryKey: [...key] });
  };

  const vazio = notifications.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={pendingTotal > 0 ? `Pendências (${pendingTotal})` : "Pendências"}
              className={cn(TOPBAR_ICON_BTN, open && "bg-brand-soft text-primary hover:bg-brand-soft hover:text-primary")}
            >
              <Bell className="h-[19px] w-[19px]" aria-hidden="true" />
              {pendingTotal > 0 && (
                <span className="absolute -top-0.5 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger-strong text-white text-2xs font-semibold leading-none tabular-nums ring-2 ring-card">
                  {pendingTotal > 99 ? "99+" : pendingTotal}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>Pendências</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-labelledby={tituloId}
        className={cn(PAINEL_DO_TOPO, "w-[400px] max-w-[calc(100vw-24px)]")}
      >
        <div className="flex items-center justify-between gap-2 h-12 pl-4 pr-2 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span id={tituloId} className="text-sm font-semibold text-foreground">Pendências</span>
            {pendingTotal > 0 && (
              <span data-testid="sino-contagem" className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-muted text-2xs font-semibold text-foreground tabular-nums">
                {pendingTotal}
              </span>
            )}
          </div>
          {hasUnseen && (
            <button
              type="button"
              onClick={markAllSeen}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border-0 bg-transparent text-xs font-medium text-primary cursor-pointer",
                "transition-colors hover:bg-brand-soft",
                FOCO,
              )}
            >
              <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Marcar tudo como visto
            </button>
          )}
        </div>

        <div className="max-h-[min(420px,calc(100dvh-180px))] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {vazio && estado.isLoading ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">Carregando pendências…</span>
              <LinhasCarregando />
            </div>
          ) : vazio && estado.isError ? (
            <div role="alert" className="casca-surgir flex flex-col items-center text-center px-6 py-8">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-danger-soft text-danger mb-3">
                <CloudOff className="w-5 h-5" aria-hidden="true" />
              </span>
              <p className="m-0 text-[13px] font-semibold text-foreground">Não foi possível carregar as pendências.</p>{" "}
              <p className="m-0 mt-1 text-xs text-muted-foreground">Verifique sua conexão.</p>
              <button
                type="button"
                onClick={tentarDeNovo}
                className={cn(
                  "mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-xs font-medium text-foreground cursor-pointer",
                  "transition-colors hover:bg-muted",
                  FOCO,
                )}
              >
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                Tentar de novo
              </button>
            </div>
          ) : vazio ? (
            <div className="casca-surgir flex flex-col items-center text-center px-6 py-9">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-success-soft text-success-strong mb-3">
                <CircleCheckBig className="w-5 h-5" aria-hidden="true" />
              </span>
              <p className="m-0 text-[13px] font-semibold text-foreground">Tudo em dia</p>
              <p className="m-0 mt-1 text-xs text-muted-foreground">Nada pendente para você agora.</p>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={(e) => { e.preventDefault(); abrir(n.href); }}
                    className={cn(
                      "group relative flex items-start gap-3 px-4 py-3 no-underline transition-colors",
                      "hover:bg-surface-muted focus-visible:bg-surface-muted",
                      "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                      n.isNew && "bg-brand-soft/40",
                    )}
                  >
                    <span className={cn("flex items-center justify-center w-8 h-8 shrink-0 rounded-lg", n.iconClass)}>
                      <n.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold leading-snug text-foreground">{n.title}</span>
                      {n.text && <span className="block mt-0.5 text-xs leading-snug text-muted-foreground">{n.text}</span>}
                      {meta(n) && <span className="block mt-1 text-2xs text-muted-foreground/90">{meta(n)}</span>}
                    </span>
                    <span className="flex items-center self-center gap-2 shrink-0">
                      {n.isNew && <span className="casca-pulso w-2 h-2 rounded-full bg-primary" aria-hidden="true" />}
                      {n.isNew && <span className="sr-only">Novo</span>}
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 -translate-x-1 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Página geral (dono, 15/09): todas as pendências do sistema, não só da Escala. */}
        <div className="border-t border-border bg-surface-muted">
          <Link
            href="/pendencias"
            onClick={() => setOpen(false)}
            className={cn(
              "group flex items-center justify-center gap-1.5 h-11 text-xs font-medium text-primary no-underline transition-colors hover:bg-brand-soft",
              "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
            )}
          >
            Ver todas as pendências
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
