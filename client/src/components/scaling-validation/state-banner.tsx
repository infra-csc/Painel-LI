import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StateBannerTone = "slate" | "amber" | "emerald" | "red";

const TONES: Record<StateBannerTone, { band: string; icon: string }> = {
  slate: { band: "border-slate-200 bg-slate-50 text-slate-700", icon: "text-slate-500" },
  amber: { band: "border-amber-200 bg-amber-50 text-amber-900", icon: "text-amber-600" },
  emerald: { band: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "text-emerald-600" },
  red: { band: "border-red-200 bg-red-50 text-red-800", icon: "text-red-600" },
};

export interface StateBannerProps {
  tone: StateBannerTone;
  icon: LucideIcon;
  role?: "alert" | "status" | "note";
  /** Frase principal (1 linha). */
  title: React.ReactNode;
  /** Linha de apoio opcional (quebras, explicação curta). */
  detail?: React.ReactNode;
  /** Ações à direita (links/botões pequenos). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * A ÚNICA faixa de estado da Sugestão de Escala (1–2 linhas): modo leitura,
 * já enviado, pós-envio ou falha de API — a página escolhe qual mostrar, nunca
 * mais de uma ao mesmo tempo.
 */
export function StateBanner({ tone, icon: Icon, role = "status", title, detail, actions, className }: StateBannerProps) {
  const t = TONES[tone];
  return (
    <div role={role} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border py-2.5 px-3.5", t.band, className)}>
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", t.icon)} aria-hidden="true" />
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-sm leading-5">{title}</p>
          {detail && <p className="mt-0.5">{detail}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium shrink-0">{actions}</div>}
    </div>
  );
}

export default StateBanner;
