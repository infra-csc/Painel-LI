/**
 * Vocabulário e peças do detalhe da vaga sugerida (25/09 — extraídos de
 * suggestion-detail-drawer.tsx): rótulos pt-BR do log, cartão, chip de dia,
 * a frase "vaga sugerida" e "onde a vaga está agora".
 */
import type { LucideIcon } from "lucide-react";
import { formatDateBr } from "@/lib/dates";
import { scalingHref } from "@/lib/use-scaling-event";
import { cn, formatDiarias } from "@/lib/utils";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODES, TRANSPORT_MODE_LABELS,
  isSuggestionInclusion,
  type SugestaoStatus, type TransportMode,
} from "@shared/scaling-validation-rules";
import { dayInfo, dayText, legValue } from "./logistics-chips";
import { workDaysOf, type SuggestionRow } from "./types";

// ── Vocabulário: nada de chave de banco na tela ──────────────────────────────

/**
 * Fases de `team_inclusions` em pt-BR — mesma leitura do `getPhaseLabel` de
 * `client/src/components/scaling/scaling-utils.ts` (mapa local para não acoplar
 * o módulo da Validação ao da Escalação).
 */
const PHASE_LABELS: Record<string, string> = {
  sugestao: "Sugestão",
  inclusao: "Inclusão de equipe",
  escalacao: "Escalação",
  passagem: "Compra de passagem",
  hospedagem: "Hospedagem",
  aprovacao: "Aprovação",
};

/**
 * Status de `team_inclusions` FORA da sugestão (a vaga aprovada vira inclusão
 * comum) — mesmos rótulos do mapa pt-BR de
 * `client/src/components/scaling/swap-request-panel.tsx`.
 */
const INCLUSION_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  planejado: "Planejado",
  confirmado: "Confirmado",
  pendente: "Pendente",
  reaberto: "Reaberto",
  escalacao: "Escalado",
  passagem: "Aguardando passagem",
  passagem_comprada: "Passagem comprada",
  hospedagem: "Aguardando hospedagem",
  hospedagem_comprada: "Hospedagem reservada",
  hospedagem_passagem_comprada: "Passagem e hospedagem prontas",
  aprovacao: "Em aprovação",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
  aguardando_producao: "Aguardando a produção",
};

/** Estados que o servidor escreve à mão no log (server/scaling-validation.ts). */
const SPECIAL_STATE_LABELS: Record<string, string> = {
  removida: "Removida da sugestão",
};

/**
 * Ações de log em pt-BR — só as que este módulo gera. Mesma ideia do
 * `LOG_ACTION_LABELS` de `client/src/components/scaling/inclusion-details-tabs.tsx`
 * (aqui sem emoji, e usado apenas como reserva quando o log vem sem frase).
 */
export const LOG_ACTION_LABELS: Record<string, string> = {
  created: "Criada",
  create: "Criada",
  update: "Atualizada",
  deleted: "Excluída",
  delete: "Excluída",
  status_changed: "Status alterado",
  suggestion_sent: "Escala sugerida enviada",
  suggestion_validated: "Validada pela área",
  suggestion_approved: "Aprovada pelo aprovador",
  suggestion_rejected: "Reprovada pelo aprovador",
  suggestion_returned: "Devolvida para a área",
  suggestion_change_requested: "Pedido aberto pela área",
  created_from_change_request: "Criada por pedido de inclusão",
  change_request_approved: "Pedido aprovado",
  change_request_reajustar: "Pedido reajustado",
  change_request_negar: "Pedido negado",
  suggestion_bypass_approve: "Aprovada sem validação da área",
  suggestion_bypass_reject: "Reprovada sem validação da área",
};

/** Chave técnica (snake_case, com ou sem "fase/status") — nunca vai para a tela. */
const TECHNICAL_KEY_RE = /^[a-z][a-z0-9_]*(?:\/[a-z][a-z0-9_]*)?$/;

const statusLabel = (s: string): string | null =>
  SUGESTAO_STATUS_LABELS[s as SugestaoStatus] ?? INCLUSION_STATUS_LABELS[s] ?? SPECIAL_STATE_LABELS[s] ?? null;

/**
 * Estado da vaga em pt-BR a partir do que o log guardou ("sugestao/
 * sugestao_pendente", "sugestao_pendente", "inclusao/planejado", "removida").
 * `null` quando não há rótulo — a regra é não mostrar nada, jamais a chave crua.
 */
function stateLabel(raw: string): string | null {
  if (raw.includes("/")) {
    const [phase, status] = raw.split("/");
    const st = statusLabel(status);
    if (!st) return null;
    const ph = PHASE_LABELS[phase];
    // Dentro da sugestão o próprio rótulo do status já diz a fase.
    return ph && phase !== "sugestao" ? `${ph} · ${st}` : st;
  }
  return statusLabel(raw);
}

/**
 * Um lado do "de → para" do log. Estado conhecido vira rótulo pt-BR; chave
 * técnica sem rótulo (dado legado, fase nova) some; valor humano que o log já
 * grava em português (nome, período, observação) passa como está.
 */
export function valueText(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const state = stateLabel(v);
  if (state) return state;
  return TECHNICAL_KEY_RE.test(v) ? null : v;
}

// ── Estilo ───────────────────────────────────────────────────────────────────


/** "Qua 20/08 14:32" — dia da semana como no resto do módulo. */
export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "Sem data";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Sem data";
  const weekday = dayText(d).split(" ")[0];
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${weekday ? `${weekday} ` : ""}${formatDateBr(d)} ${time}`;
}

/**
 * Seção do detalhe (07/10) — a mesma moldura das seções do modal da vaga na
 * Escalação: cartão branco, cabeçalho de 40px com título em caixa de frase e,
 * à direita, o que qualifica a seção (contagem, "agora"). Era um título de
 * 11px em caixa alta espaçada solto dentro do cartão.
 */
export function Card({ id, title, icon: Icon, acessorio, children }: {
  id: string; title: string; icon?: LucideIcon; acessorio?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
      <header className="flex min-h-10 items-center gap-2 border-b border-border px-4 py-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <h3 id={id} className="text-[13px] font-semibold leading-5 text-foreground">{title}</h3>
        {acessorio && <div className="ml-auto flex items-center gap-2">{acessorio}</div>}
      </header>
      <div className="space-y-2.5 px-4 py-3">{children}</div>
    </section>
  );
}

/**
 * Aviso em destaque no topo do detalhe (07/10): decisão do aprovador, pedido
 * em aberto. Filete de cor à esquerda + fundo suave, título em caixa de frase
 * — o mesmo desenho para os três, mudando só o tom.
 */
export function Destaque({ id, tom, icon: Icon, title, meta, children }: {
  id: string; tom: string; icon: LucideIcon; title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("relative overflow-hidden rounded-xl border py-3 pl-4 pr-4", tom)}>
      <span className="absolute inset-y-0 left-0 w-[3px] bg-current opacity-70" aria-hidden="true" />
      <h3 id={id} className="flex items-center gap-1.5 text-[13px] font-semibold leading-5">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {title}
      </h3>
      <div className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{children}</div>
      {meta && <p className="mt-1.5 text-2xs text-slate-600">{meta}</p>}
    </section>
  );
}

/** Chip de dia em leitura — mesma caixa do `WorkDaysPicker`, sem clique. */
export function DayChip({ v }: { v: string }) {
  const h = dayInfo(v);
  if (!h) return null;
  // Sem fundo pintado no fim de semana: fundo aqui significaria "marcado"
  // (mesma regra do seletor de dias) — o sinal fica no nome do dia.
  return (
    <span className="flex min-w-[52px] flex-col items-center rounded-lg border border-border bg-surface-muted/50 px-2 py-1.5 leading-tight">
      <span className={cn("text-2xs font-medium uppercase tracking-wide", h.isWeekend ? "text-warning" : "text-muted-foreground")}>{h.dayName}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{h.date}</span>
    </span>
  );
}

/**
 * Uma perna em texto corrido para a frase do histórico: "ida ônibus Qua 09/09
 * 07:30". Devolve "" quando a perna não tem nada de real.
 */
function legPhrase(dir: "ida" | "volta", mode: unknown, date: unknown, time: unknown): string {
  const m = legValue(mode as string | null) as string | null;
  const modeLabel = m && (TRANSPORT_MODES as readonly string[]).includes(m)
    ? TRANSPORT_MODE_LABELS[m as TransportMode].toLowerCase() : "";
  const day = dayText(legValue(date as string | null));
  const hour = (legValue(time as string | null) as string | null) ?? "";
  const parts = [modeLabel, day, hour].filter(Boolean);
  return parts.length ? `${dir} ${parts.join(" ")}` : "";
}

/**
 * Como a vaga foi sugerida, em uma frase — a entrada de criação do histórico.
 *
 * Existe porque a linha do tempo não pode AFIRMAR o que não aconteceu: quando a
 * vaga ainda não tem log nenhum, o único fato verdadeiro é que a logística a
 * sugeriu, e a frase descreve a própria vaga. A unidade sai de `formatDiarias`
 * ("3 diárias"), nunca o número cru, que cortava a frase pela metade.
 */
export function describeSuggestedVaga(row: SuggestionRow): string {
  const days = workDaysOf(row);
  const diarias = formatDiarias(days.length || row.dailyRates || 0);
  const legs = [
    legPhrase("ida", row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime),
    legPhrase("volta", row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime),
  ].filter(Boolean);
  const tail = legs.length ? legs.join(", ") : "sem logística";
  return `Vaga sugerida pela logística — ${diarias}, ${tail}`;
}

/**
 * A vaga tem ALGUMA perna de viagem?
 *
 * Passa por `legValue`, que trata travessão solto ("—", "-", "--:--") como
 * ausência: sem isso um campo "vazio preenchido com traço" virava chip
 * "Volta · —", que afirma viagem onde não há nenhuma.
 */
export function hasAnyLeg(row: SuggestionRow): boolean {
  return [
    row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime,
    row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime,
  ].some((v) => legValue(v) !== null);
}

/**
 * Em que tela a vaga se encontra AGORA. É o que responde "e daí, onde ela
 * está?" depois de ler a trilha — sem isso a ficha termina no passado.
 */
export function ondeEstaAVaga(row: SuggestionRow): { href: string; label: string } | null {
  if (row.deletedAt) return null; // vaga excluída não está em fila nenhuma
  if (!isSuggestionInclusion(row)) return { href: scalingHref("/scaling", row.eventId), label: "Abrir na Escalação" };
  switch (row.status) {
    case SUGESTAO_STATUS.PENDENTE:
      return { href: scalingHref("/scaling-validation", row.eventId), label: "Abrir na Validação" };
    case SUGESTAO_STATUS.VALIDADA:
    case SUGESTAO_STATUS.AJUSTE:
      return { href: scalingHref("/scaling-approval", row.eventId), label: "Abrir na Aprovação" };
    case SUGESTAO_STATUS.APROVADA:
      return { href: scalingHref("/scaling", row.eventId), label: "Abrir na Escalação" };
    default:
      return null; // negada: fica só no Histórico, que é onde a ficha já está
  }
}
