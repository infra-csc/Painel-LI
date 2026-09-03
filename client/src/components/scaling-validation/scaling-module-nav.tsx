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

/**
 * O módulo é uma fila de quatro etapas, e a tela não dizia isso: quatro pills
 * iguais pareciam abas irmãs, não passos com ordem. O número diz onde a pessoa
 * está e o que vem depois.
 *
 * A numeração é a do FLUXO, não a das telas visíveis: quem não acessa a
 * Aprovação continua vendo "4 Histórico", porque o passo 4 é o quarto do
 * processo — renumerar por visibilidade faria duas pessoas falarem de "passo 3"
 * querendo dizer telas diferentes.
 */
const SCREENS: { key: ScalingScreen; passo: number; label: string; path: string; permission: keyof RolePermissions; icon: LucideIcon }[] = [
  { key: "suggestion", passo: 1, label: "Sugestão",  path: "/scaling-suggestion", permission: "canAccessScalingSuggestion", icon: ListPlus },
  { key: "validation", passo: 2, label: "Validação", path: "/scaling-validation", permission: "canAccessScalingValidation", icon: ClipboardCheck },
  { key: "approval",   passo: 3, label: "Aprovação", path: "/scaling-approval",   permission: "canAccessScalingApproval",   icon: Stamp },
  { key: "history",    passo: 4, label: "Histórico", path: "/scaling-event-view", permission: "canAccessScalingEventView",  icon: History },
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
        const cls = cn(
          "inline-flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-0.5 text-[11px] font-medium leading-4 transition-colors",
          active
            ? "border-primary/30 bg-brand-soft text-primary cursor-default"
            : "border-slate-200 bg-white text-slate-500 hover:border-primary/30 hover:text-primary",
        );
        /*
         * O número em círculo é o que transforma quatro pills irmãs numa fila
         * com ordem. O ícone sai: com o número, ele passava a ser o terceiro
         * elemento a competir dentro de uma pill de 11px.
         */
        const numero = (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums",
              active ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-400",
            )}
          >
            {s.passo}
          </span>
        );
        if (active) {
          return (
            <span key={s.key} className={cls} aria-current="step">
              {numero}<span className="sr-only">Passo {s.passo}: </span>{s.label}
            </span>
          );
        }
        return (
          <Link key={s.key} href={scalingHref(s.path, eventId)} className={cls} title={eventId ? `Passo ${s.passo} — ${s.label}, mesmo evento` : `Passo ${s.passo} — ${s.label}`}>
            {numero}<span className="sr-only">Passo {s.passo}: </span>{s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default ScalingModuleNav;
