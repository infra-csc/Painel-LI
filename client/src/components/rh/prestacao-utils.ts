// Extraído de rh-control.tsx em 25/09 (modularização): funções PURAS do
// Controle RH (tempo parado, avatar, datas da timeline, destino de navegação,
// borda do cartão). Nada aqui lê estado da página — recebe o item e devolve
// valor; por isso pode viver fora do componente e ser testado isolado.
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Eye, ExternalLink } from "lucide-react";
import { formatDias } from "@/lib/utils";
import type { FiltroDeStatus } from "@shared/controle-rh";
import { CONCLUDED_STATUSES, type NotaParaControle, type PrestacaoItem, type PrestacaoStatus } from "./prestacao-types";

// ── Consulta ao endpoint agregado ───────────────────────────────────────────
/** Prefixo da chave de cache: `invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] })` derruba todos os recortes. */
export const CHAVE_CONTROLE_RH = "/api/rh/controle";

/** "all" da tela = sem `status` na URL (o servidor devolve tudo). */
export function statusParaServidor(filterStatus: PrestacaoStatus): FiltroDeStatus | undefined {
  return filterStatus === "all" ? undefined : filterStatus;
}

/** URL de GET /api/rh/controle para o recorte (evento opcional + status opcional). */
export function urlDoControleRh(eventId: string | null, status: FiltroDeStatus | undefined): string {
  const params = new URLSearchParams();
  if (eventId) params.set("eventId", eventId);
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `${CHAVE_CONTROLE_RH}?${qs}` : CHAVE_CONTROLE_RH;
}

/**
 * Denominador da barra "Progresso geral" e do "de N total" do card Concluídos.
 * Exclui quem nunca terá check-in: não compareceu (marcado no Planejado OU no
 * Realizado — o fluxo marca no Realizado), recusados, quem não emite NF
 * (definido na escalação) e NF recusada (terminal) — senão o progresso nunca
 * chega a 100%. Recebe TODAS as linhas do recorte, não a lista filtrada.
 */
export function contarParaProgresso(
  linhas: readonly Pick<PrestacaoItem, "status" | "emiteNf" | "invoice" | "planned" | "actual">[],
): number {
  let total = 0;
  for (const l of linhas) {
    if (l.planned?.didNotAttend || l.actual?.didNotAttend) continue;
    if (l.status === "recusada") continue;
    if (!l.emiteNf) continue;
    if (l.invoice?.status === "recusada") continue;
    total += 1;
  }
  return total;
}

const RH_AVATAR_COLORS = [
  'bg-info-strong','bg-primary','bg-success-strong','bg-warning-strong',
  'bg-primary','bg-primary','bg-warning','bg-info-strong','bg-danger-strong','bg-info-strong',
];
export function avatarColorRh(name: string) {
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % RH_AVATAR_COLORS.length;
  return RH_AVATAR_COLORS[idx];
}
export function initialsRh(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function timeInStatus(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `Há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Há 1 dia";
  return `Há ${formatDias(diffD)}`;
}


export function getDiffDays(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const now = new Date();
  const d = new Date(date);
  return (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
}

export const formatDateTime = (d: Date | string | null | undefined) => {
  if (!d) return "-";
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " +
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export const getTimelineStep = (item: PrestacaoItem): number => {
  // step = index of the CURRENT active step (steps before it are completed ✓)
  // 0=Escalação, 1=Planejado, 2=Realizado, 3=Aprovação
  if (item.status === "planejamento_pendente") return 1;   // Escalação ✓ → Planejado is current
  if (item.status === "aguardando_prestacao") return 2;    // Escalação+Planejado ✓ → Realizado is current
  if (item.status === "prestacao_recebida") return 3;      // Escalação+Planejado+Realizado ✓ → Aprovação is current
  if (item.status === "devolvida_para_ajuste") return 2;   // Returned to Realizado (correction needed)
  return 3; // concluded statuses use isConcluded=true → all steps marked ✓
};

export const getStepDate = (item: PrestacaoItem, stepIndex: number): string | null => {
  if (stepIndex === 0 && item.teamInclusion?.createdAt) {
    return new Date(item.teamInclusion.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  if (stepIndex === 1 && item.planned?.createdAt) {
    return new Date(item.planned.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  if (stepIndex === 2 && item.actual?.updatedAt) {
    return new Date(item.actual.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  if (stepIndex === 3 && item.actual?.rhActionAt) {
    return new Date(item.actual.rhActionAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  return null;
};

export const STEP_TOOLTIPS = [
  "Equipe definida e confirmada para o evento",
  "Valores planejados pelo RH",
  "Valores realizados preenchidos pelo responsável da função",
  "Análise do comparativo pelo RH",
  "Nota fiscal liberada com o envio do Realizado — enviada pelo colaborador e aprovada pelo RH",
  "Check-in financeiro realizado pelo RH — encerra o processo",
];

export const buildNavPath = (base: string, item: PrestacaoItem) => {
  const params = new URLSearchParams();
  params.set("event", item.event.id);
  if (item.collaboratorId) params.set("collaborator", item.collaboratorId);
  if (item.functionId) params.set("function", item.functionId);
  return `${base}?${params.toString()}`;
};

export interface NavigationTarget { label: string; path: string; icon: LucideIcon }

export const getNavigationTarget = (item: PrestacaoItem): NavigationTarget | null => {
  if (item.status === "planejamento_pendente") {
    return { label: "Ir para Planejado", path: buildNavPath("/budget-planned", item), icon: ArrowRight };
  }
  if (item.status === "prestacao_recebida") {
    return { label: "Analisar comparativo", path: buildNavPath("/budget-comparison", item), icon: Eye };
  }
  if (item.status === "devolvida_para_ajuste") {
    return { label: "Ver realizado", path: buildNavPath("/budget-actual", item), icon: ExternalLink };
  }
  if (item.status === "aguardando_prestacao") {
    // If actual already has data (filled but not sent), go to budget-actual so RH can see it
    if (item.actual) {
      return { label: "Ver realizado", path: buildNavPath("/budget-actual", item), icon: ExternalLink };
    }
    return { label: "Ver planejado", path: buildNavPath("/budget-planned", item), icon: ExternalLink };
  }
  if (item.status === "aprovada_faturamento" || item.status === "recusada") {
    return { label: "Ver detalhes", path: buildNavPath("/budget-comparison", item), icon: ExternalLink };
  }
  return null;
};

// `invoice` é a nota do `item.actual` (a linha já chega com ela do servidor) — a
// função antes chamava `getInvoiceForActual(item.actual.id)`; o resultado é o mesmo.
export const getLeftBorderStyle = (item: PrestacaoItem, invoice: NotaParaControle | null | undefined): { border: string; bg: string } => {
  if (CONCLUDED_STATUSES.includes(item.status)) {
    if (item.status === "aprovada_faturamento") {
      const nfInv = item.actual ? invoice : undefined;
      const nfSt = nfInv?.status || "pendente";
      // Green = NF approved (concluded); red = NF refused (terminal); blue = NF in review; amber = pending/returned
      if (nfSt === "aprovada") return { border: "border-l-4 border-l-success-strong", bg: "" };
      if (nfSt === "recusada") return { border: "border-l-4 border-l-danger-strong", bg: "" };
      if (nfSt === "enviada") return { border: "border-l-4 border-l-primary/40", bg: "" };
      if (nfSt === "devolvida") return { border: "border-l-4 border-l-warning/25", bg: "" };
      return { border: "border-l-4 border-l-warning/25", bg: "" };
    }
    return { border: "border-l-4 border-l-danger-strong", bg: "" };
  }
  const days = getDiffDays(item.lastActivityDate);
  if (days > 30) return { border: "border-l-4 border-l-danger-strong", bg: "bg-danger-soft/20" };
  if (days > 7)  return { border: "border-l-4 border-l-warning-strong", bg: "bg-warning-soft/20" };
  if (days > 0)  return { border: "border-l-4 border-l-info-strong", bg: "" };
  return { border: "border-l-4 border-l-border", bg: "" };
};
