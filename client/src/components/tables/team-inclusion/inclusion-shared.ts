/**
 * Tabela de Inclusões de Equipe — utilitários puros (25/09, extraídos de
 * tables/team-inclusion-table.tsx).
 */
import type { TeamInclusion } from "@shared/schema";

// Helper: Mostrar "Escalado" apenas quando não precisa passagem nem hospedagem
export const getDisplayStatus = (inclusion: TeamInclusion) => {
  if (inclusion.status === "escalado" && (inclusion.needsTicket || inclusion.needsAccommodation)) {
    if (inclusion.needsTicket) return "aguardando_passagem";
    if (inclusion.needsAccommodation) return "aguardando_hospedagem";
  }
  return inclusion.status;
};

// Nº de colunas da tabela (checkbox + 9 dados/ações) — usado pelos espaçadores da virtualização.
export const COLUNAS_TABELA = 10;

// Variante do pedido de confirmação (23/09): delete/cancel = destrutivo, confirm = neutro.
export type ConfirmVariant = "delete" | "cancel" | "confirm";
export interface ConfirmState {
  open: boolean; variant: ConfirmVariant; title: string; message: string; confirmLabel: string; onConfirm: () => void;
}

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const formatDate = (dateStr: string) => {
  // Parse manual para evitar problemas de timezone (e recorta timestamp se houver)
  const [year, month, day] = String(dateStr).split('T')[0].split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

// Normaliza qualquer valor de data para "YYYY-MM-DD"
export const normDay = (d: string | Date | null | undefined): string => {
  if (!d) return '';
  if (typeof d === 'string') return d.split('T')[0];
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d).split('T')[0];
};

export const generateDaysInRange = (start: string, end: string): string[] => {
  const s = normDay(start);
  const e = normDay(end);
  if (!s || !e) return [];
  const days: string[] = [];
  // Usar split YYYY-MM-DD diretamente para evitar conversão UTC
  const [sy, sm, sd] = s.split('-').map(Number);
  const [ey, em, ed] = e.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);
  while (cur <= endDate) {
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    days.push(`${yy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

/** Dias salvos da vaga normalizados; sem nenhum, o intervalo completo. */
export const savedOrRangeDays = (inc: TeamInclusion): string[] => {
  const savedDays = (inc.workDays || []).map(normDay).filter(Boolean);
  return savedDays.length > 0 ? savedDays : generateDaysInRange(normDay(inc.scheduleStartDate), normDay(inc.scheduleEndDate));
};

export const canCancelEscalation = (inclusion: TeamInclusion) => {
  // Pode cancelar em qualquer status, exceto quando já está cancelado
  return inclusion.status !== 'cancelado';
};

export const canDeleteInclusion = (inclusion: TeamInclusion) => {
  // Só pode excluir antes da escalação (não pode ter comprado nada)
  const blockedStatuses = ['aguardando_producao', 'escalado', 'passagem_comprada', 'hospedagem_comprada', 'hospedagem_passagem_comprada'];
  return !blockedStatuses.includes(inclusion.status);
};
