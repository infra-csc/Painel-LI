/**
 * MENU DO USUÁRIO — avatar + nome + papel na barra do topo.
 *
 * Só entram itens que FAZEM alguma coisa hoje: os atalhos do teclado e o Sair.
 * O desenho previa ainda "meu perfil", "preferências de aviso" e "tema do
 * painel" — nenhum tem tela ou efeito no app (o tema escuro está desligado em
 * App.tsx), e item morto em menu é pior que item ausente. Quando existirem,
 * entram aqui sem mexer no resto da casca.
 *
 * 07/10: o atalho aparecia como "⌘/" também no Windows; o gatilho perdeu a
 * borda de pílula (pesava ao lado do sino) e o rodapé cabe numa linha.
 */
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getRoleLabel, type UserRole } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Keyboard, LogOut, ShieldCheck } from "lucide-react";
import { initials } from "@/lib/format";
import { combo, teclas } from "./shortcuts";
import { Keys } from "./kbd";
import { FOCO, PAINEL_DO_TOPO } from "./shell-styles";

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
            "flex items-center gap-2.5 h-10 min-w-[44px] pl-1 pr-1.5 md:pr-2 rounded-xl border-0 cursor-pointer overflow-hidden transition-colors duration-150",
            FOCO,
            open ? "bg-brand-soft" : "bg-transparent hover:bg-muted",
          )}
        >
          <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground text-2xs font-semibold tracking-wide">
            {initials(name)}
          </span>
          <span className="hidden md:flex flex-col items-start leading-tight min-w-0 overflow-hidden">
            <span className="text-[13px] font-semibold text-foreground truncate max-w-[150px]">{name}</span>
            <span className="text-2xs text-muted-foreground truncate max-w-[150px]">{subtitle}</span>
          </span>
          <ChevronDown className={cn("hidden sm:block h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className={cn(PAINEL_DO_TOPO, "w-[292px]")}>
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-semibold tracking-wide">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold text-foreground truncate">{name}</p>
            {user?.email && <p className="m-0 text-xs text-muted-foreground truncate">{user.email}</p>}
            <p className="m-0 mt-1.5">
              <span className="inline-flex max-w-full items-center h-5 px-2 rounded-full bg-brand-soft text-2xs font-medium text-primary truncate">{subtitle}</span>
            </p>
          </div>
        </div>

        <DropdownMenuSeparator className="m-0" />

        <div className="p-1.5">
          <DropdownMenuItem
            onSelect={() => { setOpen(false); onOpenShortcuts(); }}
            className="gap-2.5 h-9 px-2.5 rounded-lg text-[13px] text-slate-700 cursor-pointer focus:bg-muted focus:text-foreground"
          >
            <Keyboard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1">Atalhos do teclado</span>
            <Keys parts={teclas("/")} label={combo("/")} />
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => { setOpen(false); logout(); }}
            className="gap-2.5 h-9 px-2.5 rounded-lg text-[13px] text-danger cursor-pointer focus:bg-danger-soft focus:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">Sair</span>
          </DropdownMenuItem>
        </div>

        <div className="flex items-center gap-2 px-4 h-10 border-t border-border bg-surface-muted text-2xs text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-success-strong" aria-hidden="true" />
          <span className="truncate">Acesso pelo Portal Norte · conta Microsoft</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
