/**
 * SINO DE PENDÊNCIAS — painel da barra do topo.
 *
 * Só mostra o que tem origem em dado real (ver `use-shell-data.ts`): pedidos de
 * ajuste que ESTE usuário pode decidir e trocas pendentes. Sem pendência, o
 * badge não aparece (nem zero) e o painel diz que não há nada.
 * "Marcar tudo como visto" apaga apenas o ponto de novidade — a contagem
 * continua sendo a realidade do servidor.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import { MI } from "./mi";
import { useShellData } from "./use-shell-data";

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { notifications, pendingTotal, hasUnseen, markAllSeen } = useShellData();
  const canOpenApprovals = hasPermission(user, "canAccessScalingApproval");

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
                open ? "bg-brand-soft text-primary" : "bg-transparent hover:bg-slate-100",
              )}
            >
              <MI name="notifications" size={19} />
              {pendingTotal > 0 && (
                <span className="absolute top-[3px] right-1 flex items-center justify-center min-w-[16px] h-4 px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold leading-none ring-2 ring-card">
                  {pendingTotal > 99 ? "99+" : pendingTotal}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>Pendências</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" sideOffset={8} className="w-[380px] max-w-[calc(100vw-32px)] p-0 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3.5 py-3 border-b border-slate-100">
          <span className="text-[13px] font-semibold text-slate-900">
            Pendências {pendingTotal > 0 && <span className="font-normal text-slate-400">· {pendingTotal}</span>}
          </span>
          {hasUnseen && (
            <button
              type="button"
              onClick={markAllSeen}
              className="border-0 bg-transparent p-0 text-[11px] font-medium text-primary cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Marcar tudo como visto
            </button>
          )}
        </div>

        <div className="max-h-[340px] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3.5 py-6 m-0 text-xs text-slate-400 text-center">Nada pendente para você agora.</p>
          ) : notifications.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex gap-2.5 px-3.5 py-2.5 border-b border-slate-100 no-underline transition-colors hover:bg-slate-50",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                n.isNew ? "bg-brand-soft/35" : "bg-card",
              )}
            >
              <span className={cn("flex items-center justify-center w-7 h-7 shrink-0 rounded-lg", n.iconClass)}>
                <MI name={n.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-900">{n.title}</span>
                {n.text && <span className="block text-[11px] text-slate-500">{n.text}</span>}
                <span className="block mt-0.5 text-[10px] text-slate-400">{[n.when, n.screen].filter(Boolean).join(" · ")}</span>
              </span>
              {n.isNew && <span aria-label="novo" className="w-[7px] h-[7px] mt-1 shrink-0 rounded-full bg-red-500" />}
            </Link>
          ))}
        </div>

        {canOpenApprovals && (
          <div className="px-3.5 py-2.5 bg-background/60 border-t border-slate-100">
            <Link
              href="/scaling-approval"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded"
            >
              Ver todas as pendências do módulo de Escala
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
