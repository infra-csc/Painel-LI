/**
 * Tipos e utilitários puros do Orçamento PLANEJADO — 25/09 (modularização).
 *
 * Extraídos de budget-planned.tsx para que hooks (rascunho, motor, modal) e
 * componentes (planilha, cards, diálogos) compartilhem o mesmo vocabulário sem
 * importar a página.
 */
import type { BudgetActual, Collaborator, FunctionValue, TeamInclusion } from "@shared/schema";
import type { DeflationSegment, PercurseiroDiaria, PercurseiroTipo, RegraDiaria } from "@shared/calculation-rules";
import type { AtendimentoTipo } from "@shared/atendimento";
import type { CenoEmpreitaValor, CenoFreelaTipo } from "@shared/cenotecnica-empreita";
import type { ResultadoDoPlanejado } from "@shared/budget-engine";
import { formatarMoeda } from "@/lib/format";

export interface BudgetEdit {
  inclusionId: string;
  qtdDiarias: number;
  valorDiaria: number;
  valorDiariaUtil: number;
  valorDiariaFds: number;
  mobilidade: number;
  mobilidadeIda: number;
  mobilidadeVolta: number;
  almocoSemana: number;
  jantarSemana: number;
  almocoFds: number;
  jantarFds: number;
}

// Override ESPARSO: só os campos que o usuário realmente alterou entram aqui.
// Campos ausentes continuam sendo recalculados pelo motor (ex.: mobilidade e
// alimentação reagem à chegada da passagem mesmo depois de editar a diária).
// qtdDiarias NÃO faz parte do override: a contagem de dias vem sempre do
// período da escalação (weekdays + weekends).
export type BudgetOverride = Partial<Omit<BudgetEdit, "inclusionId" | "qtdDiarias">> & { inclusionId: string };

export type BudgetOverrides = Record<string, BudgetOverride>;

// Resultado do MOTOR compartilhado (@shared/budget-engine, 23/09) + o que a
// tela precisa para exibir/agrupar. A fórmula (diária plana → deflação →
// mobilidade → alimentação) deixou de viver aqui: é a mesma do servidor.
export type CalculatedBudget = ResultadoDoPlanejado & {
  inclusion: TeamInclusion;
  collaborator?: Collaborator;
  functionValue?: FunctionValue | null;
};

/** Campo editável da planilha (e dos lotes). */
export type SheetField = "valorDia" | "alimentacao" | "alimentacaoUtil" | "alimentacaoFds" | "mobilidade";

/** Campo do popover de lote do cabeçalho da planilha. */
export type BatchField = "vdia" | "alim" | "mob";

/** Alvo e campo do diálogo "Edição em lote". */
export interface AdvancedBatch {
  target: "all" | "casa" | "freela" | "selected";
  field: "vdia" | "alimUtil" | "alimFds" | "mob";
  value: string;
}

/** Cabeçalho do modal de edição (nome, período, tipos escolhidos…). */
export interface EditingBudgetInfo {
  name: string;
  functionName: string;
  type: string;
  weekdays: number;
  weekends: number;
  diasComDiaria: number;
  regraDiaria: RegraDiaria;
  period: string;
  vooChegadaIda?: string | null;
  vooPartidaVolta?: string | null;
  fonteVoo?: "passagem" | "sugerido" | "nenhum";
  alimEstimada?: boolean;
  voa?: boolean;
  isAtend?: boolean;
  atendimentoTipo?: AtendimentoTipo | null;
  savedAtendimentoTipo?: AtendimentoTipo | null;
  isPercurso?: boolean;
  funcaoLocal?: boolean;
  percurseiroTipo?: PercurseiroTipo | null;
  savedPercurseiroTipo?: PercurseiroTipo | null;
  percurseiro?: PercurseiroDiaria | null;
  cenoEmpreitaVaga?: boolean;
  cenoFreelaTipo?: CenoFreelaTipo | null;
  cenoEmpreita?: CenoEmpreitaValor | null;
  inclusionId?: string;
}

/** Envio para o Realizado: ids e origem (card individual × lote). */
export interface ConfirmSend {
  ids: string[];
  source: "single" | "batch";
}

export interface NotAttendedModalState {
  id?: string;
  budget?: CalculatedBudget;
  name: string;
  functionName: string;
}

export interface RestoreModalState {
  id: string;
  name: string;
  functionName: string;
  startDate?: string;
  endDate?: string;
}

export type MatchingActual = BudgetActual | undefined;

// Formatador único de moeda (lib/format) — antes era uma cópia local do Intl.
export const formatCurrency = formatarMoeda;

// "4d × R$ 540,00 + 2d × R$ 486,00" — memória compacta da deflação por faixa
export const formatSegmentsMemo = (segments: DeflationSegment[]) =>
  segments.map(s => `${s.days}d × ${formatCurrency(s.dailyCents)}`).join(" + ");

/** 'casa' inclui 'local', como no resto da tela. */
export const isCasaType = (type?: string | null) => type === "casa" || type === "local";

/** Nome que a linha mostra: colaborador, ou a empresa da empreita (10/09). */
export function nomeDaVaga(i: TeamInclusion, getCollaboratorName: (id?: string | null) => string): string {
  const empresa = i.empreitaEmpresa as string | null | undefined;
  if (empresa) return `Empreita · ${empresa}${i.empreitaPessoas ? ` (${i.empreitaPessoas} pessoas)` : ""}`;
  return getCollaboratorName(i.collaboratorId);
}

/** Chave "colaborador|função" usada para cruzar Planejado × Realizado × escalação. */
export const collabFuncKey = (i: { collaboratorId: string | null; functionId: string | null }) =>
  `${i.collaboratorId}|${i.functionId}`;

/** Avatar color based on first letter */
export const avatarColor = (name: string) => {
  const colors = [
    "bg-primary", "bg-primary", "bg-success-strong", "bg-warning-strong",
    "bg-danger-strong", "bg-info-strong", "bg-info-strong", "bg-warning-strong",
  ];
  return colors[(name.charCodeAt(0) || 0) % colors.length];
};

export function formatEventDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const [year, month, day] = dateStr.split("-");
  return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`;
}

/** dd/mm a partir de "YYYY-MM-DD" (meio-dia para não deslocar o dia no fuso). */
export const ddmm = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** dd/mm a partir de "YYYY-MM-DD" à meia-noite local (como os cards faziam). */
export const ddmmLocal = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
