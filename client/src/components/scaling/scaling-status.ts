/**
 * Vocabulário ÚNICO de status da Escalação.
 *
 * Extraído de scaling-table.tsx em 01/09 para virar um módulo sem JSX: a fila
 * de trabalho e as Análises precisam classificar linhas sem arrastar a tabela
 * inteira junto, e um módulo puro pode ser testado direto.
 *
 * Antes cada lugar tinha a sua cadeia de ifs ("Escalado" × "Aprovado" para o
 * mesmo registro, "Aguard. Gestor" × "Aguardando Gestor"). Gestor = quem
 * aprova cenotécnica; o status gravado no banco continua `aguardando_producao`.
 *
 * **Cor = estado (redesenho 01/09).** A paleta abaixo tem um papel só: a
 * pílula diz o estado, e o marcador de 3px da linha diz se espera VOCÊ. Antes
 * havia seis famílias de cor competindo na mesma célula.
 */
import type { TeamInclusion } from "@shared/schema";

/**
 * Estados da vaga na Escalação (dono, 15/09: "esse aprovado não deve aparecer
 * na escalação, não faz nenhum sentido; tem vaga aberta, temos que criar um para
 * quando apenas salva e o escalado quando confirmar"):
 *   Vaga aberta → Salvo · falta confirmar → (Aguardando gestor) → Escalado.
 * "Aprovado"/"Concluído" gravados no banco contam como Escalado aqui.
 */
export type ScalingStatusKey =
  | "pendente"
  | "salvo"
  | "aguardando_producao"
  | "escalado"
  | "cancelado";

/** Status gravados que significam escalação CONFIRMADA. */
const CONFIRMED_STATUSES = new Set([
  "escalado",
  "aguardando_passagem",
  "aguardando_hospedagem",
  "passagem",
  "passagem_comprada",
  "hospedagem",
  "hospedagem_comprada",
  "hospedagem_passagem_comprada",
  "aprovacao",
  "aprovado",
  "concluido",
]);

export function getScalingStatusKey(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId"> & { empreitaEmpresa?: string | null },
): ScalingStatusKey {
  const status = inclusion.status ?? "";
  if (status === "cancelado") return "cancelado";
  if (status === "aguardando_producao") return "aguardando_producao";
  // Sem colaborador nunca é "escalado", independentemente do status gravado
  // (empreita por empresa, 10/09, também preenche a vaga).
  if (!inclusion.collaboratorId && !inclusion.empreitaEmpresa) return "pendente";
  if (CONFIRMED_STATUSES.has(status)) return "escalado";
  // Tem nome mas não foi confirmada (planejado, pendente, reaberto…).
  return "salvo";
}

export interface StatusMeta {
  label: string;
  /** Classes da pílula: fundo e texto. Sem borda — a cor já é o sinal. */
  wrap: string;
  dot: string;
}

/**
 * Uma cor por significado. "Pendente" virou **Vaga aberta**: o nome diz o que
 * falta fazer, não que o registro está num limbo.
 */
export const STATUS_META: Record<ScalingStatusKey, StatusMeta> = {
  pendente: { label: "Vaga aberta", wrap: "bg-[#FEF3C7] text-[#92400E]", dot: "bg-[#D97706]" },
  salvo: { label: "Salvo · falta confirmar", wrap: "bg-[#EEF2FF] text-[#3730A3]", dot: "bg-[#6366F1]" },
  aguardando_producao: { label: "Aguardando gestor", wrap: "bg-[#FEF2F2] text-[#B91C1C]", dot: "bg-[#EF4444]" },
  escalado: { label: "Escalado", wrap: "bg-[#ECFDF5] text-[#047857]", dot: "bg-[#10B981]" },
  cancelado: { label: "Cancelada", wrap: "bg-[#F1F5F9] text-[#64748B]", dot: "bg-[#94A3B8]" },
};

export function getScalingStatusLabel(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId"> & { empreitaEmpresa?: string | null },
): string {
  return STATUS_META[getScalingStatusKey(inclusion)].label;
}
