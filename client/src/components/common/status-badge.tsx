/**
 * PÍLULA DE STATUS ÚNICA do Painel-LI (23/09).
 *
 * Antes havia 12+ implementações e o mesmo estado mudava de cor conforme a
 * tela ("Planejado" laranja no CSS global e violeta em Eventos; "Escalado"
 * azul numa tabela e verde noutra; "Pendente" violeta na Aprovação e âmbar
 * na Validação). Aqui a cor sai do SIGNIFICADO, nunca da tela:
 *
 *   warning  → pendente / aguardando / em análise (alguém ainda precisa agir)
 *   primary  → ação SUA / em andamento (a bola está com quem olha)
 *   success  → ok / escalado / aprovado / concluído / comprado
 *   danger   → bloqueio / negado / rejeitado / erro
 *   neutral  → cancelado / inativo / excluído
 *   info     → informação (validada e passada adiante, reajustado, agendado)
 *
 * Visual único: rounded-full, fundo `*-soft`, texto `*`, ponto opcional
 * `*-strong`. Tamanhos: sm = text-2xs (11px), md = text-xs.
 *
 * Vocabulário de recusa (decisão 23/09, uma palavra por tipo):
 *   sugestão → "Negada" · pedido de ajuste → "Negado" (rótulo do shared,
 *   o pedido é masculino) · troca → "Rejeitada". Nunca "Recusada"/"Devolvido".
 *   Vaga cancelada → "Cancelada" (é a vaga); pedido/troca → "Cancelado".
 */
import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { rotuloDoStatus } from "@shared/vaga-status";
import type { TeamInclusion } from "@shared/schema";
import { getScalingStatusKey, STATUS_META } from "@/components/scaling/scaling-status";

export type Tone = "success" | "warning" | "info" | "danger" | "neutral" | "primary";
export type StatusBadgeSize = "sm" | "md";

/** Classes por tom — só tokens semânticos de index.css/tailwind.config.ts. */
export const TONE_CLASS: Record<Tone, { wrap: string; dot: string }> = {
  success: { wrap: "bg-success-soft text-success", dot: "bg-success-strong" },
  warning: { wrap: "bg-warning-soft text-warning", dot: "bg-warning-strong" },
  info: { wrap: "bg-info-soft text-info", dot: "bg-info-strong" },
  danger: { wrap: "bg-danger-soft text-danger", dot: "bg-danger-strong" },
  neutral: { wrap: "bg-neutral-soft text-neutral", dot: "bg-neutral" },
  primary: { wrap: "bg-brand-soft text-primary", dot: "bg-primary" },
};

const SIZE_CLASS: Record<StatusBadgeSize, string> = {
  sm: "px-2 py-0.5 text-2xs gap-1.5",
  md: "px-2.5 py-0.5 text-xs gap-1.5",
};

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tone: Tone;
  size?: StatusBadgeSize;
  /** Ponto colorido antes do texto (leitura rápida em tabelas densas). */
  dot?: boolean;
  /** Ponto pulsando — só para "ao vivo" (evento em andamento). */
  pulse?: boolean;
  /** Ícone lucide (12px) antes do texto. */
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}

export function StatusBadge({ tone, size = "sm", dot = false, pulse = false, icon: Icon, className, children, ...rest }: StatusBadgeProps) {
  const t = TONE_CLASS[tone];
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full font-semibold leading-4",
        SIZE_CLASS[size],
        t.wrap,
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot, pulse && "animate-pulse")} />}
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

// ─── Dicionário semântico ────────────────────────────────────────────────────

/**
 * Tom de um status pela chave gravada (vaga, sugestão, pedido, troca, evento).
 * Chaves são as strings do banco; compara em minúsculas e aceita variações
 * de gênero. Desconhecido → neutral (nunca inventa urgência).
 */
const TONE_DO_STATUS: Record<string, Tone> = {
  // ok / concluído
  escalado: "success",
  confirmado: "success",
  aprovado: "success",
  aprovada: "success",
  sugestao_aprovada: "success",
  concluido: "success",
  "concluído": "success",
  passagem_comprada: "success",
  hospedagem_comprada: "success",
  hospedagem_passagem_comprada: "success",
  comprado: "success",
  comprada: "success",
  validado: "success",
  // pendente / aguardando / em análise
  pendente: "warning",
  planejado: "warning",
  incluido: "warning",
  escalacao: "warning",
  aguardando: "warning",
  aguardando_producao: "warning",
  aguardando_passagem: "warning",
  aguardando_hospedagem: "warning",
  passagem: "warning",
  hospedagem: "warning",
  aprovacao: "warning",
  sugestao_pendente: "warning",
  sugestao_ajuste: "warning",
  reenviado_validacao: "warning",
  em_analise: "warning",
  "em análise": "warning",
  // ação sua / em andamento
  salvo: "primary",
  reaberto: "primary",
  "em andamento": "primary",
  em_andamento: "primary",
  // informação
  sugestao_validada: "info",
  validada: "info",
  reajustado: "info",
  // bloqueio / negado / rejeitado / erro
  negado: "danger",
  negada: "danger",
  sugestao_negada: "danger",
  rejeitado: "danger",
  rejeitada: "danger",
  recusado: "danger",
  recusada: "danger",
  reprovado: "danger",
  reprovada: "danger",
  bloqueado: "danger",
  erro: "danger",
  // cancelado / inativo / neutro
  cancelado: "neutral",
  cancelada: "neutral",
  inativo: "neutral",
  inativa: "neutral",
  excluido: "neutral",
  "excluído": "neutral",
  excluida: "neutral",
  "excluída": "neutral",
};

export function toneDoStatus(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  return TONE_DO_STATUS[status.toLowerCase().trim()] ?? "neutral";
}

/**
 * Rótulo da VAGA: o do shared, com um ajuste de gênero — a vaga é feminina,
 * então `cancelado` vira "Cancelada" (o shared serve também a pedidos e
 * trocas, onde "Cancelado" está certo).
 */
export function rotuloDaVaga(status: string | null | undefined): string {
  if (status === "cancelado") return "Cancelada";
  return rotuloDoStatus(status);
}

export { rotuloDoStatus };

// ─── Atalhos prontos ─────────────────────────────────────────────────────────

/** Pílula de qualquer status gravado: tom pelo dicionário, rótulo pelo shared. */
export function StatusPorChaveBadge({ status, size, className, dot }: { status: string | null | undefined; size?: StatusBadgeSize; className?: string; dot?: boolean }) {
  return (
    <StatusBadge tone={toneDoStatus(status)} size={size} dot={dot} className={className} data-testid={`status-${status ?? "vazio"}`}>
      {rotuloDaVaga(status)}
    </StatusBadge>
  );
}

/**
 * Pílula da situação da vaga na ESCALAÇÃO (Vaga aberta · Salvo · Aguardando
 * gestor · Escalado · Cancelada) — usa `getScalingStatusKey`, a mesma regra da
 * fila e das Análises; a linha, o modal e o resumo mostram a mesma coisa.
 */
export function StatusDaVagaBadge({
  status, collaboratorId, empreitaEmpresa, size = "sm", className,
}: {
  status: TeamInclusion["status"];
  collaboratorId: TeamInclusion["collaboratorId"];
  empreitaEmpresa?: string | null;
  size?: StatusBadgeSize;
  className?: string;
}) {
  const key = getScalingStatusKey({ status, collaboratorId, empreitaEmpresa });
  const meta = STATUS_META[key];
  return (
    <StatusBadge tone={meta.tone} size={size} dot className={className} data-testid={`scaling-status-${key}`}>
      {meta.label}
    </StatusBadge>
  );
}

export default StatusBadge;
