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

// 08/10 (redesenho): o círculo de iniciais colorido (avatarColorRh/initialsRh)
// saiu — a fila é uma tabela como a do Comparativo, onde o nome lidera a linha.

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

// `invoice` é a nota do `item.actual` (a linha já chega com ela do servidor).
// 08/10 (redesenho): era `getLeftBorderStyle`, que devolvia classes de borda
// de 4px e fundo tingido; agora devolve o TOM do filete de 3px da linha. A
// regra é a mesma, ramo por ramo: situação da NF para os aprovados, recusa, e
// tempo parado (> 30, > 7, > 0 dias) para os demais.
export type TomDaLinha = "nf-aprovada" | "nf-recusada" | "nf-analise" | "nf-pendente" | "recusada" | "atrasada" | "parada" | "recente" | "nova";
export const tomDaLinha = (item: PrestacaoItem, invoice: NotaParaControle | null | undefined): TomDaLinha => {
  if (CONCLUDED_STATUSES.includes(item.status)) {
    if (item.status === "aprovada_faturamento") {
      const nfInv = item.actual ? invoice : undefined;
      const nfSt = nfInv?.status || "pendente";
      if (nfSt === "aprovada") return "nf-aprovada";
      if (nfSt === "recusada") return "nf-recusada";
      if (nfSt === "enviada") return "nf-analise";
      return "nf-pendente"; // devolvida ou ainda sem nota
    }
    return "recusada";
  }
  const days = getDiffDays(item.lastActivityDate);
  if (days > 30) return "atrasada";
  if (days > 7) return "parada";
  if (days > 0) return "recente";
  return "nova";
};

// ── Prazo da linha (coluna "Prazo") ─────────────────────────────────────────
// Era um IIFE dentro da linha do cartão; virou função pura com a MESMA regra:
// o que é do RH mede o prazo pelo evento (encerrado há N dias, ou começa em
// até 14 dias); o resto mede o tempo parado na etapa (> 30 dias é alerta).
// 08/10: quando o item do RH não tem alerta de evento, a coluna mostra o tempo
// parado (antes ficava vazia) — o mesmo dado, sem regra nova.
export interface PrazoDaLinha { texto: string; tom: "perigo" | "atencao" | "neutro"; alerta: boolean }

/** "YYYY-MM-DD" como data LOCAL — `new Date(string)` interpretaria como UTC. */
function dataLocal(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = String(s).split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function prazoDaLinha(item: PrestacaoItem, agora: Date = new Date()): PrazoDaLinha | null {
  if (item.status === "aprovada_faturamento") return null;
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  const days = getDiffDays(item.lastActivityDate);
  const parado = (): PrazoDaLinha | null => {
    if (days > 30) return { texto: timeInStatus(item.lastActivityDate), tom: "perigo", alerta: true };
    return days > 0 ? { texto: timeInStatus(item.lastActivityDate), tom: "neutro", alerta: false } : null;
  };
  const doRh = item.status === "planejamento_pendente" || item.status === "prestacao_recebida";
  if (!doRh) return parado();
  const fim = dataLocal(item.event.endDate);
  const inicio = dataLocal(item.event.startDate);
  if (fim && fim < hoje) {
    const n = Math.floor((hoje.getTime() - fim.getTime()) / 864e5);
    return { texto: `Evento encerrado há ${n} dia${n !== 1 ? "s" : ""}`, tom: "perigo", alerta: true };
  }
  if (inicio) {
    const n = Math.floor((inicio.getTime() - hoje.getTime()) / 864e5);
    if (n <= 14) return { texto: `Evento em ${n <= 0 ? "andamento" : `${n} dia${n !== 1 ? "s" : ""}`}`, tom: "atencao", alerta: true };
  }
  const p = parado();
  return p ? { ...p, tom: "neutro", alerta: false } : null;
}

/** "11/09 – 12/09/2026" (ou só o dia) — o mesmo desenho do Planejado e do Comparativo. */
export function periodoDoEvento(e: { startDate?: string | null; endDate?: string | null }): string {
  if (!e.startDate) return "";
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const ano = e.startDate.slice(0, 4);
  if (!e.endDate || e.endDate === e.startDate) return `${dm(e.startDate)}/${ano}`;
  return `${dm(e.startDate)} – ${dm(e.endDate)}/${e.endDate.slice(0, 4)}`;
}
