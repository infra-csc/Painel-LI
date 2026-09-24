/**
 * Helpers puros da tela de Escalação (sem estado, sem React).
 * Extraídos de pages/scaling.tsx — comportamento preservado.
 */
import { parseISO } from "date-fns";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import type { TeamInclusion } from "@shared/schema";
import { CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import { ACTIVE_CONFLICT_STATUSES, CONFIRMED_STATUSES } from "@shared/vaga-status";
import { tipoDeConflitoDeAgenda } from "@shared/conflito-de-agenda";

// Trocas já resolvidas por outra aba (Passagem/Hospedagem) não entram no atalho
// de "trocas pendentes".
export const ALREADY_HANDLED_SWAP_STATUSES = new Set([
  "passagem_comprada",
  "hospedagem_passagem_comprada",
  "hospedagem_comprada",
]);

/**
 * Statuses em que a escalação conta como "escalada" (colaborador confirmado).
 * Re-export do vocabulário compartilhado (23/09): a lista local não tinha
 * `hospedagem_passagem_comprada` — uma vaga com tudo comprado não contava
 * como escalada e passava na confirmação em massa.
 */
export const ESCALATED_STATUSES: ReadonlySet<string> = CONFIRMED_STATUSES;

/** Statuses ativos para detecção de conflito de datas de um colaborador (shared). */
export { ACTIVE_CONFLICT_STATUSES };

/** Conflito de agenda entre duas vagas — movida para @shared/conflito-de-agenda (23/09). */
export { tipoDeConflitoDeAgenda };

// Converte "YYYY-MM-DD" (ou ISO com timestamp) em Date LOCAL de meia-noite.
// parseISO de um ISO completo devolve UTC e, em Brasília, joga a data um dia
// para trás. Retorna null quando a data é inválida.
export const parseDay = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const clean = String(value).split("T")[0];
  const d = parseISO(clean);
  return isNaN(d.getTime()) ? null : d;
};

// Mensagem de erro amigável para falhas de carregamento (distingue sessão expirada
// de "não há dados": uma falha de rede nunca pode virar estado vazio).
export const describeLoadError = (err: any): string => {
  if (err?.status === 401) return "Sua sessão expirou. Atualize a página e entre novamente.";
  if (err?.status === 403) return "Você não tem permissão para ver estes registros.";
  return err?.body?.message || "Não foi possível carregar os dados. Verifique sua conexão e tente novamente.";
};

/** Escalação concluída (colaborador + status pós-confirmação). */
// Empreita por empresa (10/09) preenche a vaga sem colaborador.
export const isEscalated = (inclusion: TeamInclusion): boolean =>
  (!!inclusion.collaboratorId || vagaComEmpreita(inclusion as any)) && ESCALATED_STATUSES.has(inclusion.status);

/** Escalação confirmada (igual a isEscalated, mas SEM aguardando_producao). */
export const isEscalationConfirmed = (inclusion: TeamInclusion): boolean =>
  (!!inclusion.collaboratorId || vagaComEmpreita(inclusion as any)) &&
  inclusion.status !== "aguardando_producao" &&
  ESCALATED_STATUSES.has(inclusion.status);

export const isCityFromSP = (city: string | null | undefined): boolean => {
  if (!city) return true; // default SP
  return city.toLowerCase().includes("paulo") || city.trim().toUpperCase() === "SP";
};

// Formata data com dia da semana
export const formatDateWithWeekday = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "N/A";
  // Recorta qualquer timestamp antes de fixar meia-noite local: sem isso a data
  // vinha em UTC e caía um dia atrás em Brasília (ou virava Invalid Date).
  const cleanDate = String(dateStr).split("T")[0];
  const date = new Date(cleanDate + "T00:00:00");
  if (isNaN(date.getTime())) return String(dateStr);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "N/A";
  const cleanDate = String(dateStr).split("T")[0];
  const [year, month, day] = cleanDate.split("-");
  if (!year || !month || !day) return String(dateStr);
  return `${day}/${month}/${year}`;
};

// Datas nas sugestões de viagem com dia da semana
export const formatSuggestionDate = (dateStr: string | null | undefined): string => {
  if (!dateStr || dateStr === "N/A" || dateStr === "Não definido" || dateStr === "Não informado") {
    return "Não informado";
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) return formatDateWithWeekday(dateStr);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split("/");
    return formatDateWithWeekday(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  }
  const dateMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return formatDateWithWeekday(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  }
  return dateStr;
};

export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return "N/A";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
};

/** dd/mm/aa hh:mm — usado nos cards de troca. Vazio para data inválida. */
export const formatShortDateTime = (d: unknown): string => {
  if (!d) return "";
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export interface TravelInfo { ida: string; retorno: string; chegada: string; horario: string }

// Dados de passagem dos campos específicos (prioridade) ou das observações (legado)
export const extractTravelInfoFromObservations = (
  observations: string | undefined,
  inclusion?: TeamInclusion,
): TravelInfo => {
  if (inclusion && (inclusion.flightDepartureDate || inclusion.flightArrivalSuggestedTime ||
      inclusion.flightReturnDate || inclusion.flightReturnSuggestedTime)) {
    return {
      ida: inclusion.flightDepartureDate || "Não informado",
      retorno: inclusion.flightReturnDate || "Não informado",
      chegada: inclusion.flightArrivalSuggestedTime || "Não informado",
      horario: inclusion.flightReturnSuggestedTime || "Não informado",
    };
  }
  if (observations && observations.trim()) {
    const idaMatch = observations.match(/Ida:\s*([^|]*?)(?:\s*\||\s*$)/);
    const retornoMatch = observations.match(/Retorno:\s*([^|]*?)(?:\s*\||\s*$)/);
    const chegadaMatch = observations.match(/Chegada:\s*([^|]*?)(?:\s*\||\s*$)/);
    const horarioMatch = observations.match(/Horário:\s*([^|]*?)(?:\s*\||\s*$)/);
    if (idaMatch || retornoMatch || chegadaMatch || horarioMatch) {
      return {
        ida: (idaMatch && idaMatch[1].trim()) ? idaMatch[1].trim() : "Não definido",
        retorno: (retornoMatch && retornoMatch[1].trim()) ? retornoMatch[1].trim() : "Não definido",
        chegada: (chegadaMatch && chegadaMatch[1].trim()) ? chegadaMatch[1].trim() : "Não definido",
        horario: (horarioMatch && horarioMatch[1].trim()) ? horarioMatch[1].trim() : "Não definido",
      };
    }
  }
  return { ida: "Não informado", retorno: "Não informado", chegada: "Não informado", horario: "Não informado" };
};

export const getPhaseLabel = (phase: string): string => {
  switch (phase) {
    case "inclusao": return "Inclusão de Equipe";
    case "escalacao": return "Escalação";
    case "passagem": return "Compra de Passagem";
    case "hospedagem": return "Hospedagem";
    case "aprovado": return "Aprovado";
    default: return phase;
  }
};

export const isImageFile = (name?: string, type?: string): boolean =>
  !!((name || "").toLowerCase().match(/\.(jpe?g|png|gif|webp|bmp)$/) || (type || "").includes("image/"));

export const isPdfFile = (name?: string, type?: string): boolean =>
  (name || "").toLowerCase().endsWith(".pdf") || (type || "").includes("pdf");

// ── Troca de colaborador normalizada ────────────────────────────────────────
// Tipo e normalizador ÚNICOS do client desde 23/09 (client/src/lib/swap-types.ts):
// havia dois `NormalizedSwap` (este e o de Hospedagem) com campos diferentes
// alimentando a MESMA chave de cache. Re-exportados aqui para os imports das
// telas de Escalação continuarem valendo.
export { normalizeSwap, type NormalizedSwap } from "@/lib/swap-types";

/** Dados editáveis do modal de detalhes. */
export interface ModalData {
  collaboratorId: string;
  observations: string;
  dailyValue: number;
  city: string;
  departureFromSP: boolean;
  atendimentoTipo: string;
  percurseiroTipo: string;
  /** Empreita por empresa (10/09): modo ligado + os três campos (valor em reais, sem centavos). */
  empreitaModo: boolean;
  empreitaEmpresa: string;
  empreitaPessoas: string;
  empreitaValor: string;
}

export const modalDataFromInclusion = (inclusion: TeamInclusion): ModalData => {
  const city = inclusion.city || "";
  return {
    collaboratorId: inclusion.collaboratorId || "",
    observations: inclusion.observations || "",
    dailyValue: 0,
    empreitaModo: vagaComEmpreita(inclusion as any),
    empreitaEmpresa: (inclusion as any).empreitaEmpresa ?? "",
    empreitaPessoas: (inclusion as any).empreitaPessoas != null ? String((inclusion as any).empreitaPessoas) : "",
    empreitaValor: (inclusion as any).empreitaValor != null ? String(Math.round(Number((inclusion as any).empreitaValor) / 100)) : "",
    city,
    departureFromSP: isCityFromSP(city),
    atendimentoTipo: (inclusion as any).atendimentoTipo || "",
    percurseiroTipo: (inclusion as any).percurseiroTipo || "",
  };
};

/** Tipo de atendimento em rótulo curto (coluna Necessidades). */
export const ATENDIMENTO_SHORT: Record<string, { short: string; label: string }> = {
  key_account: { short: "KA", label: "Key Account" },
  executivo_contas: { short: "EC", label: "Executivo de Contas" },
};

/** Tipo de percurseiro em rótulo curto (coluna Necessidades). */
export const PERCURSEIRO_SHORT: Record<string, { short: string; label: string }> = {
  tipo_1: { short: "Tipo 1", label: "Percurseiro Tipo 1" },
  tipo_2: { short: "Tipo 2", label: "Percurseiro Tipo 2" },
};

/**
 * Modalidade de EMPREITA do cenotécnico em rótulo curto (coluna Necessidades).
 * Regra do usuário (19/08): o tipo de freela é escolhido NA ESCALAÇÃO, por vaga,
 * e o Planejado usa o valor FECHADO da modalidade (shared/cenotecnica-empreita).
 */
export const CENO_FREELA_SHORT: Record<string, { short: string; label: string }> = {
  viagem:  { short: "Viagem",  label: CENO_FREELA_TIPO_LABELS.viagem },
  sp:      { short: "SP",      label: CENO_FREELA_TIPO_LABELS.sp },
  local_a: { short: "Local A", label: CENO_FREELA_TIPO_LABELS.local_a },
  local_b: { short: "Local B", label: CENO_FREELA_TIPO_LABELS.local_b },
};
