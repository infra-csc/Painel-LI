/**
 * MENU DO USUÁRIO — avatar + nome + papel na barra do topo.
 *
 * Só entram itens que FAZEM alguma coisa hoje: os atalhos do teclado e o Sair.
 * O desenho previa ainda "meu perfil", "preferências de aviso" e "tema do
 * painel" — nenhum tem tela ou efeito no app (o tema escuro está desligado em
 * App.tsx), e item morto em menu é pior que item ausente. Quando existirem,
 * entram aqui sem mexer no resto da casca.
 */
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getRoleLabel, type UserRole } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MI, initials } from "./mi";

export default function UserMenu({ onOpenShortcuts }: { onOpenShortcuts: () => void }) {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const name = user?.name || "Usuário";
  const roleLabel = getRoleLabel((user?.role || "production") as UserRole);
  const subtitle = [user?.area, roleLabel].filter(Boolean).join(" · ");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Conta de ${name}`}
          className={cn(
            "flex items-center gap-2 h-[38px] min-w-[44px] pl-1 pr-2 rounded-full border cursor-pointer overflow-hidden transition-colors",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            open ? "bg-brand-soft border-primary/30" : "bg-card border-border hover:bg-slate-50",
          )}
        >
          <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
            {initials(name)}
          </span>
          <span className="hidden md:flex flex-col items-start leading-[1.15] min-w-0 overflow-hidden">
            <span className="text-xs font-semibold text-slate-900 truncate max-w-[140px]">{name}</span>
            <span className="text-[10px] text-slate-400 truncate max-w-[140px]">{subtitle}</span>
          </span>
          <MI name="expand_more" size={16} className="shrink-0 text-slate-400" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-[280px] p-0 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 p-3.5 border-b border-slate-100">
          <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold text-slate-900 truncate">{name}</p>
            <p className="m-0 text-[11px] text-slate-400 truncate">{user?.email}</p>
            <p className="m-0 text-[11px] text-slate-400 truncate">{subtitle}</p>
          </div>
        </div>

        <div className="p-1.5">
          <DropdownMenuItem
            onSelect={() => { setOpen(false); onOpenShortcuts(); }}
            className="gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-slate-700 cursor-pointer"
          >
            <MI name="keyboard" size={17} className="text-slate-500" />
            <span className="flex-1">Atalhos do teclado</span>
            <kbd className="border border-border bg-background rounded-md px-1.5 py-px font-mono text-[10px] text-slate-400">⌘/</kbd>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem
            onSelect={() => { setOpen(false); logout(); }}
            className="gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-red-700 cursor-pointer focus:bg-red-50 focus:text-red-700"
          >
            <MI name="logout" size={17} />
            <span className="flex-1">Sair</span>
          </DropdownMenuItem>
        </div>

        <div className="px-3.5 py-2 border-t border-slate-100 text-[10px] text-slate-400">
          Painel LI · acesso via Portal Norte (SSO Microsoft)
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
