import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StateBannerTone = "slate" | "amber" | "emerald" | "red";

const TONES: Record<StateBannerTone, { band: string; icon: string; title: string }> = {
  slate: { band: "border-border bg-surface-muted/70 text-slate-700", icon: "bg-card text-muted-foreground ring-1 ring-border", title: "text-foreground" },
  amber: { band: "border-warning/25 bg-warning-soft text-warning", icon: "bg-card text-warning ring-1 ring-warning/25", title: "text-warning" },
  emerald: { band: "border-success/25 bg-success-soft text-success", icon: "bg-card text-success ring-1 ring-success/25", title: "text-success" },
  red: { band: "border-danger/25 bg-danger-soft text-danger", icon: "bg-card text-danger ring-1 ring-danger/25", title: "text-danger" },
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
  testId?: string;
}

/**
 * A ÚNICA faixa de estado da Sugestão de Escala (1–2 linhas): modo leitura,
 * já enviado, pós-envio ou falha de API — a página escolhe qual mostrar, nunca
 * mais de uma ao mesmo tempo.
 *
 * 07/10 (redesenho): o desenho do aviso de modo leitura da Validação — ícone
 * num círculo, título em 14px, apoio em 12px e as ações alinhadas à direita.
 */
export function StateBanner({ tone, icon: Icon, role = "status", title, detail, actions, className, testId }: StateBannerProps) {
  const t = TONES[tone];
  return (
    <div role={role} data-testid={testId} className={cn("sug-entra flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-xl border px-4 py-3", t.band, className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", t.icon)} aria-hidden="true">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 pt-0.5 text-xs leading-relaxed">
          <p className={cn("text-sm font-semibold leading-5", t.title)}>{title}</p>
          {detail && <p className="mt-0.5">{detail}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-x-1 gap-y-1 pl-10 text-xs font-medium sm:pl-0">{actions}</div>}
    </div>
  );
}

export default StateBanner;
