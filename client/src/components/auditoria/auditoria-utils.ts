/**
 * Log de auditoria — tipos e utilitários de apresentação (redesenho 08/10).
 *
 * Extraídos de pages/consultation.tsx SEM mudar a regra: o registro continua
 * descrito por `descreverLog` (shared/log-auditoria.ts); aqui só o que é da
 * tela — o tom de cada tipo de ação, os períodos do filtro, a hora/dia em
 * pt-BR, o navegador por extenso e o CSV da página.
 */
import { Activity, CheckCircle, Edit, Plus, Send, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { ACOES, type TomDaAcao } from "@shared/log-auditoria";

export interface SystemLog {
  id: string;
  logNumber: number;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: string;
  /** JSON em texto (registros antigos) ou já objeto (jsonb, 25/09). */
  previousData: string | Record<string, unknown> | null;
  newData: string | Record<string, unknown> | null;
  userId: string | null;
  userName: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface LogsResponse {
  logs: SystemLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface FiltrosDaAuditoria { entityType: string; action: string; days: string; userId: string }
export const FILTROS_PADRAO: FiltrosDaAuditoria = { entityType: "all", action: "all", days: "30", userId: "all" };

/**
 * Cor e ícone por TIPO de ação — a cor diz o peso do que aconteceu (os mesmos
 * tons de antes). `marca`: o marcador da trilha; `chip`: a etiqueta da ação.
 */
export const TOM: Record<TomDaAcao, { icon: LucideIcon; marca: string; chip: string; ponto: string; grupo: string }> = {
  criar: { icon: Plus, marca: "bg-success-soft text-success", chip: "bg-success-soft text-success", ponto: "bg-success-strong", grupo: "Criação" },
  alterar: { icon: Edit, marca: "bg-brand-soft text-primary", chip: "bg-brand-soft text-primary", ponto: "bg-primary", grupo: "Alteração" },
  excluir: { icon: Trash2, marca: "bg-danger-soft text-danger", chip: "bg-danger-soft text-danger", ponto: "bg-danger-strong", grupo: "Exclusão e desativação" },
  aprovar: { icon: CheckCircle, marca: "bg-success-soft text-success", chip: "bg-success-soft text-success", ponto: "bg-success-strong", grupo: "Aprovação" },
  recusar: { icon: XCircle, marca: "bg-danger-soft text-danger", chip: "bg-danger-soft text-danger", ponto: "bg-danger-strong", grupo: "Recusa e devolução" },
  enviar: { icon: Send, marca: "bg-warning-soft text-warning", chip: "bg-warning-soft text-warning", ponto: "bg-warning-strong", grupo: "Envio" },
  neutro: { icon: Activity, marca: "bg-muted text-slate-600", chip: "bg-muted text-slate-600", ponto: "bg-slate-400", grupo: "Outras" },
};

const ORDEM_DOS_TONS: TomDaAcao[] = ["criar", "alterar", "excluir", "aprovar", "recusar", "enviar", "neutro"];

/**
 * Ações que vêm do histórico da VAGA (team_inclusion_logs) — o próprio
 * shared/log-auditoria.ts as lista à parte. No filtro ficam num grupo delas:
 * "Criação" aparecia duas vezes seguidas, sem dizer qual era qual.
 */
const ACOES_DO_HISTORICO_DA_VAGA = new Set([
  "created", "deleted", "status_changed", "city_changed", "collaborator_changed", "daily_rates_changed",
  "daily_value_changed", "dates_changed", "travel_dates_changed", "work_days_changed", "observations_changed", "note",
]);

export interface GrupoDeOpcoes { titulo: string; ponto?: string; opcoes: { id: string; nome: string }[] }

/** As MESMAS ações de antes (todas as chaves de ACOES), agrupadas pelo tom. */
export function gruposDeAcoes(): GrupoDeOpcoes[] {
  const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");
  const grupos: GrupoDeOpcoes[] = ORDEM_DOS_TONS.map((tom) => ({
    titulo: TOM[tom].grupo,
    ponto: TOM[tom].ponto,
    opcoes: Object.entries(ACOES)
      .filter(([k, a]) => a.tom === tom && !ACOES_DO_HISTORICO_DA_VAGA.has(k))
      .map(([k, a]) => ({ id: k, nome: a.rotulo }))
      .sort(porNome),
  }));
  grupos.push({
    titulo: "Histórico da vaga",
    opcoes: Object.entries(ACOES)
      .filter(([k]) => ACOES_DO_HISTORICO_DA_VAGA.has(k))
      .map(([k, a]) => ({ id: k, nome: a.rotulo }))
      .sort(porNome),
  });
  return grupos.filter((g) => g.opcoes.length > 0);
}

export const PERIODOS: { id: string; nome: string; curto: string }[] = [
  { id: "1", nome: "Últimas 24 horas", curto: "24 horas" },
  { id: "7", nome: "Últimos 7 dias", curto: "7 dias" },
  { id: "30", nome: "Últimos 30 dias", curto: "30 dias" },
  { id: "90", nome: "Últimos 90 dias", curto: "90 dias" },
  { id: "365", nome: "Último ano", curto: "1 ano" },
];
export const nomeDoPeriodo = (dias: string) => PERIODOS.find((p) => p.id === dias)?.nome ?? `Últimos ${dias} dias`;

export const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

export const horaBr = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "08/10/2026 às 15:24:07" — o detalhe mostra os segundos (é investigação). */
export function dataHoraCompleta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR")}`;
}

const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Cabeçalho do dia: { principal: "Hoje", data: "quarta-feira, 08/10/2026" }. */
export function rotuloDoDia(iso: string): { chave: string; principal: string; data: string } {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const data = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const chave = d.toDateString();
  if (mesmoDia(d, hoje)) return { chave, principal: "Hoje", data };
  if (mesmoDia(d, ontem)) return { chave, principal: "Ontem", data };
  return { chave, principal: d.toLocaleDateString("pt-BR"), data: d.toLocaleDateString("pt-BR", { weekday: "long" }) };
}

/** "Há 5 min", "há 3 h", "há 2 dias" — ao lado da data completa do detalhe. */
export function haQuantoTempo(iso: string, agora = Date.now()): string {
  const min = Math.round((agora - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(min)) return "";
  if (min < 0) return "data futura";
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 60) return `há ${plural(dias, "dia", "dias")}`;
  const meses = Math.round(dias / 30);
  return `há ${plural(meses, "mês", "meses")}`;
}

/** "Chrome 153 · Windows" em vez da string inteira do navegador. */
export function navegadorCurto(ua: string | null): string {
  if (!ua) return "—";
  const nav = ua.match(/Edg\/(\d+)/) ? `Edge ${ua.match(/Edg\/(\d+)/)![1]}`
    : ua.match(/Chrome\/(\d+)/) ? `Chrome ${ua.match(/Chrome\/(\d+)/)![1]}`
    : ua.match(/Firefox\/(\d+)/) ? `Firefox ${ua.match(/Firefox\/(\d+)/)![1]}`
    : ua.match(/Safari\//) ? "Safari" : "Outro navegador";
  const so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return so ? `${nav} · ${so}` : nav;
}

// Campos de CSV precisam ser escapados: o texto pode conter ; e aspas.
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** JSON gravado (texto ou objeto) → objeto, ou null. Para o "dados gravados" recolhível. */
export function jsonGravado(dado: string | Record<string, unknown> | null): Record<string, unknown> | null {
  if (!dado) return null;
  try {
    const v: unknown = typeof dado === "string" ? JSON.parse(dado) : dado;
    return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0 ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
