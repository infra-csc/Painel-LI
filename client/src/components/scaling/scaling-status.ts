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
// Só o TIPO: import de tipo é apagado na compilação, não cria ciclo com o
// status-badge (que importa STATUS_META daqui em runtime).
import type { Tone } from "@/components/common/status-badge";
// Lista de "confirmada" vem do vocabulário compartilhado (23/09): a cópia
// local aqui era uma das cinco listas divergentes — esta não tinha
// `aguardando_producao` e o servidor não tinha `hospedagem_passagem_comprada`.
import { ACTIVE_CONFLICT_STATUSES, CONFIRMED_STATUSES } from "@shared/vaga-status";

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

export function getScalingStatusKey(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId"> & { empreitaEmpresa?: string | null },
): ScalingStatusKey {
  const status = inclusion.status ?? "";
  if (status === "cancelado") return "cancelado";
  if (status === "aguardando_producao") return "aguardando_producao";
  // Sem colaborador nunca é "escalado", independentemente do status gravado
  // (empreita por empresa, 10/09, também preenche a vaga).
  if (!inclusion.collaboratorId && !inclusion.empreitaEmpresa) return "pendente";
  // Legados de confirmação (`confirmado`, `aguardando_*`) de linhas antigas
  // também contam como escalado — antes só os dois `aguardando_*` contavam.
  if (CONFIRMED_STATUSES.has(status) || ACTIVE_CONFLICT_STATUSES.includes(status)) return "escalado";
  // Tem nome mas não foi confirmada (planejado, pendente, reaberto…).
  return "salvo";
}

export interface StatusMeta {
  label: string;
  /**
   * Tom semântico (23/09) — a pílula é o `StatusBadge` de components/common;
   * as classes de cor moram lá, uma vez só. Antes cada chave carregava hex
   * próprio e "Aguardando gestor" era vermelho (parecia erro, é espera).
   */
  tone: Tone;
}

/**
 * Uma cor por significado. "Pendente" virou **Vaga aberta**: o nome diz o que
 * falta fazer, não que o registro está num limbo.
 *   warning = alguém precisa agir (vaga aberta, gestor) · primary = ação sua
 *   (salvo, falta confirmar) · success = escalado · neutral = cancelada.
 */
export const STATUS_META: Record<ScalingStatusKey, StatusMeta> = {
  pendente: { label: "Vaga aberta", tone: "warning" },
  // Pílula curta (cabe numa linha); o "falta confirmar" vai no detalhe embaixo.
  salvo: { label: "Salvo", tone: "primary" },
  aguardando_producao: { label: "Aguardando gestor", tone: "warning" },
  escalado: { label: "Escalado", tone: "success" },
  cancelado: { label: "Cancelada", tone: "neutral" },
};

export function getScalingStatusLabel(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId"> & { empreitaEmpresa?: string | null },
): string {
  return STATUS_META[getScalingStatusKey(inclusion)].label;
}
