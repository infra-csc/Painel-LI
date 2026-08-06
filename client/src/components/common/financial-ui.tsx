/**
 * Primitivos visuais da área financeira.
 *
 * As telas financeiras foram construídas em momentos diferentes e cada uma
 * repete seu próprio cabeçalho, card de métrica, estado vazio e formatação de
 * dinheiro — com espaçamentos e pesos ligeiramente distintos. Isso é o que faz
 * a área parecer montada por partes.
 *
 * Estes componentes existem para as telas convergirem para um vocabulário só.
 * São deliberadamente pequenos e sem opinião de layout: cada tela continua dona
 * da sua estrutura.
 *
 * Decisões fixadas aqui:
 *
 * - Escala de espaçamento em múltiplos de 4px. Sem valores avulsos.
 * - Dinheiro sempre com `tabular-nums`: sem isso as colunas de valor dançam
 *   entre linhas, que é o defeito mais visível de uma tabela financeira.
 * - Positivo/negativo com cor E sinal. Cor sozinha não passa em WCAG para
 *   quem não distingue vermelho e verde.
 * - Rótulos de coluna em 11px/600/uppercase com tracking largo — legível sem
 *   competir com o dado, que é o que precisa ser escaneado.
 * - Foco visível em tudo que é clicável. A tabela é navegável por teclado.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Centavos → "R$ 1.234,56". Nunca formatar dinheiro à mão nas telas. */
export function formatMoney(cents: number | null | undefined): string {
  const v = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "2026-08-04" ou ISO → "04/08/2026". Aceita nulo. */
export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const iso = typeof value === "string" ? value : value.toISOString();
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : "—";
}

/* ── Cabeçalho de tela ───────────────────────────────────────────────────── */

export function PageHeader({
  icon, title, subtitle, accent = "#0033CC", actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  accent?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4 sm:gap-5">
      <div
        className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl sm:rounded-3xl flex items-center justify-center text-white shrink-0 shadow-lg"
        style={{ background: accent, boxShadow: `0 10px 24px -12px ${accent}` }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <h1 className="text-xl sm:text-[26px] font-bold tracking-tight text-slate-900 leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-slate-500 mt-1 leading-snug">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

/* ── Card de métrica ─────────────────────────────────────────────────────── */

export function MetricCard({
  label, value, accent = "#0F172A", hint, emphasis = false,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
  /** Usa fundo tonal em vez de branco — para o número que importa mais. */
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5 transition-colors",
        emphasis ? "border-transparent" : "bg-white border-slate-200"
      )}
      style={emphasis ? { background: `${accent}0F` } : undefined}
    >
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] leading-none">
        {label}
      </p>
      <p
        className="text-[24px] font-bold tabular-nums mt-2 leading-none tracking-tight"
        style={{ color: accent }}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

/* ── Valor monetário com sinal ───────────────────────────────────────────── */

export function MoneyDelta({ cents, showSign = true, className }: {
  cents: number;
  showSign?: boolean;
  className?: string;
}) {
  const negative = cents < 0;
  const neutral = cents === 0;
  return (
    <span
      className={cn(
        "tabular-nums font-semibold whitespace-nowrap",
        neutral ? "text-slate-400" : negative ? "text-red-600" : "text-emerald-700",
        className
      )}
    >
      {/* Sinal explícito, e não só cor — WCAG 1.4.1: a informação não pode
          depender exclusivamente de cor. */}
      {showSign && !neutral && (negative ? "− " : "+ ")}
      {formatMoney(Math.abs(cents))}
    </span>
  );
}

/* ── Cabeçalho de tabela ─────────────────────────────────────────────────── */

export function Th({ children, align = "left", className }: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

/* ── Estados ─────────────────────────────────────────────────────────────── */

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && (
        <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4" aria-hidden>
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-slate-800">{title}</p>
      {description && (
        <p className="text-[13px] text-slate-500 mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Esqueleto de tabela — mesma altura de linha do conteúdo real, para a
 *  transição não deslocar a página. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-2.5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}

export function ErrorState({ title, description, onRetry }: {
  title: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6" role="alert">
      <p className="text-[15px] font-semibold text-slate-800">{title}</p>
      {description && <p className="text-[13px] text-slate-500 mt-1.5 max-w-sm">{description}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 h-9 px-4 rounded-xl text-[13px] font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 transition-colors"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/* ── Contêiner de tabela ─────────────────────────────────────────────────── */

/** Tabela larga precisa rolar dentro do próprio card — nunca deixar a página
 *  rolar na horizontal, que é o que quebra a leitura no celular. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white rounded-2xl border border-slate-200 overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
