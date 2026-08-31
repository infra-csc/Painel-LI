/**
 * Linha discreta de links cruzados entre as 4 telas do módulo Validação de
 * Escala (Sugestão → Validação → Aprovação → Histórico), carregando o
 * `eventId` corrente na URL (mesma chave do hook `useScalingEvent`).
 * Esconde as telas que o usuário não acessa (role-utils) e marca a corrente.
 */
import { Link } from "wouter";
import { ClipboardCheck, History, ListPlus, Stamp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, type RolePermissions } from "@/lib/role-utils";
import { scalingHref } from "@/lib/use-scaling-event";
import { cn } from "@/lib/utils";

export type ScalingScreen = "suggestion" | "validation" | "approval" | "history";

const SCREENS: { key: ScalingScreen; label: string; path: string; permission: keyof RolePermissions; icon: LucideIcon }[] = [
  { key: "suggestion", label: "Sugestão",  path: "/scaling-suggestion", permission: "canAccessScalingSuggestion", icon: ListPlus },
  { key: "validation", label: "Validação", path: "/scaling-validation", permission: "canAccessScalingValidation", icon: ClipboardCheck },
  { key: "approval",   label: "Aprovação", path: "/scaling-approval",   permission: "canAccessScalingApproval",   icon: Stamp },
  { key: "history",    label: "Histórico", path: "/scaling-event-view", permission: "canAccessScalingEventView",  icon: History },
];

export interface ScalingModuleNavProps {
  current: ScalingScreen;
  eventId?: string | null;
  className?: string;
}

export function ScalingModuleNav({ current, eventId, className }: ScalingModuleNavProps) {
  const { user } = useAuth();
  const visible = SCREENS.filter((s) => hasPermission(user, s.permission));
  if (visible.length <= 1) return null;
  return (
    <nav aria-label="Telas do módulo de Escala" className={cn("flex flex-nowrap shrink-0 items-center gap-1", className)}>
      {visible.map((s) => {
        const active = s.key === current;
        const Icon = s.icon;
        const cls = cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors",
          active
            ? "border-primary/30 bg-brand-soft text-primary cursor-default"
            : "border-slate-200 bg-white text-slate-500 hover:border-primary/30 hover:text-primary",
        );
        if (active) {
          return (
            <span key={s.key} className={cls} aria-current="page">
              <Icon className="w-3 h-3" aria-hidden="true" />{s.label}
            </span>
          );
        }
        return (
          <Link key={s.key} href={scalingHref(s.path, eventId)} className={cls} title={eventId ? `${s.label} — mesmo evento` : s.label}>
            <Icon className="w-3 h-3" aria-hidden="true" />{s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default ScalingModuleNav;
