/**
 * Espelho operacional — o que as visões compartilham (25/09).
 *
 * Tipos, constantes e formatadores puros que antes viviam soltos no topo da
 * página de 2.900 linhas. Aqui não há JSX: o que renderiza fica em cada
 * `*-view.tsx`, o que calcula fica em `use-mirror-*.ts`.
 */
import type { MirrorRow, MirrorCollaborator } from "@shared/operational-mirror-types";
import type { ContextoDaLinha } from "@shared/mirror-cell-state";
import type { BlocoDeCusto } from "@shared/mirror-pendencia";
import { formatarMoeda } from "@/lib/format";
import { Table2, UserRound, Building2, BedDouble, Car, Landmark } from "lucide-react";
import type { DrawerKind } from "./drawers";

export const brl = formatarMoeda;

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(d);
}

export const genderLabel: Record<string, string> = { male: "M", female: "F", unknown: "?" };

// Direção do grupo de Uber (uber_groups.direction) — antes tudo que não era "ida" virava "Volta"
const UBER_DIRECTION_LABEL: Record<string, string> = {
  ida: "Ida", volta: "Volta", interno: "Deslocamento interno",
  aeroporto_hotel: "Aeroporto → Hotel", hotel_evento: "Hotel → Evento",
};
export function uberDirectionLabel(direction: string | null | undefined): string {
  if (!direction) return "Trajeto";
  return UBER_DIRECTION_LABEL[direction] ?? direction.replace(/_/g, " → ");
}

export type CellType = "text" | "money" | "date" | "time" | "int" | "bool" | "select";
/** Valor de uma célula editável, como vem do servidor e como vai no PATCH. */
export type CellValue = string | number | boolean | null | undefined;
export type SaveCell = (rowId: string, field: string, value: CellValue, anterior?: CellValue) => Promise<void>;

/** Valor de célula em texto curto, para o toast dizer o de/para do que gravou. */
export function textoDoValor(v: CellValue): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "marcado" : "desmarcado";
  if (typeof v === "number") return brl(v);
  return String(v);
}

export type OpenDrawer = (kind: DrawerKind, r: MirrorRow) => void;
export type SortKey = "nome" | "departamento";
export type SortState = { key: SortKey | null; dir: "asc" | "desc" };

/** A pendência por bloco de cada linha, calculada uma vez na página. */
export type PendenciaDaLinha = { abertos: BlocoDeCusto[]; sugestao: boolean; ctx: ContextoDaLinha };
export type PendenciaDe = (r: MirrorRow) => PendenciaDaLinha;

/**
 * Filtros de situação (02/09): a unidade é o bloco. "Documento" e "Extras"
 * saíram daqui porque viraram, respectivamente, os chips da faixa de
 * pendências e os cartões do placar — cada um conta e filtra no lugar em que
 * a informação aparece, em vez de num popover a três cliques de distância.
 */
export type SituacaoFiltro = "comPendencia" | "pronto" | "aConfirmar";
export const SITUACOES: { key: SituacaoFiltro; label: string; match: (abertos: number, sugestao: boolean) => boolean }[] = [
  { key: "comPendencia", label: "Com pendência", match: (abertos) => abertos > 0 },
  { key: "pronto", label: "Pronto", match: (abertos) => abertos === 0 },
  { key: "aConfirmar", label: "Tem sugestão a confirmar", match: (_a, sugestao) => sugestao },
];

/**
 * Identidade das etapas (31/08).
 *
 * A tela gastava SETE famílias de cor em fundos de cabeçalho — decoração de
 * agrupamento. Sobrava nada para sinalizar estado, e havia colisão semântica:
 * emerald queria dizer "hospedagem", "conferido" e "sem pendência" ao mesmo
 * tempo. Agora a etapa se identifica pelo RÓTULO (sempre visível, porque é
 * sticky) mais um ponto de 6px; a cor de fundo fica reservada para o que a
 * célula está dizendo — âmbar falta, verde salvo, vermelho erro.
 */
export const PONTO_ETAPA = {
  schedule: "bg-info-strong",
  ticket: "bg-primary",
  hotel: "bg-success-strong",
  baggage: "bg-warning-strong",
  uber: "bg-primary",
  car: "bg-warning-strong",
  pend: "bg-danger-strong",
};

/** Barra que abre cada etapa — mesma família de cor do cabeçalho do bloco. */
export const BARRA = {
  schedule: "border-l-info/25",
  ticket: "border-l-primary/40",
  hotel: "border-l-success/25",
  baggage: "border-l-warning/25",
  uber: "border-l-primary/40",
  car: "border-l-warning/25",
  pend: "border-l-danger/25",
};

export type Block = "passagem" | "hospedagem" | "bagagem" | "uber" | "locacao" | "pendencias";
export const ALL_BLOCKS: { key: Block; label: string; colunas: number; ponto: string }[] = [
  { key: "passagem", label: "Passagem", colunas: 9, ponto: "bg-primary" },
  { key: "hospedagem", label: "Hospedagem", colunas: 12, ponto: "bg-success-strong" },
  { key: "bagagem", label: "Bagagem Extra", colunas: 3, ponto: "bg-warning-strong" },
  { key: "uber", label: "Uber", colunas: 3, ponto: "bg-primary" },
  { key: "locacao", label: "Locação de Carro", colunas: 4, ponto: "bg-warning-strong" },
  { key: "pendencias", label: "Pendências", colunas: 2, ponto: "bg-danger-strong" },
];

export const VIEWS = [
  { key: "grade", label: "Grade", icon: Table2 },
  // "Pessoas", não "Colaboradores": é mais curto e é como a equipe fala.
  { key: "colaboradores", label: "Pessoas", icon: UserRound },
  { key: "departamentos", label: "Departamentos", icon: Building2 },
  { key: "quartos", label: "Quartos", icon: BedDouble },
  { key: "uber", label: "Uber", icon: Car },
  { key: "rateio", label: "Rateio", icon: Landmark },
] as const;
export type ViewKey = typeof VIEWS[number]["key"];

// v2: só preferências de layout (density/hiddenBlocks/view). Filtros, flags e
// ordenação NÃO persistem — eram carregados de um evento para outro e o usuário
// abria o espelho já filtrado sem perceber.
export const LS_KEY = "operational-mirror-prefs-v2";

/**
 * Abaixo de 900px a grade de 39 colunas é inutilizável — rolar de lado esconde
 * justamente a coluna que a pessoa foi ver. Nessa faixa a visão Pessoas assume
 * o lugar da Grade e a preferência salva de visão é ignorada.
 */
export function isNarrowViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 899px)").matches;
}

/** "qui", "dom" — as planilhas da equipe abrem cada linha pelo dia da semana. */
export function diaSemana(d: string | null | undefined): string {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const data = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][data.getDay()] ?? "—";
}

/**
 * Faixas de cor para separar um grupo do outro, como as linhas coloridas da
 * planilha: o que importa é enxergar de relance quem viaja junto / divide
 * quarto, não a cor em si.
 */
export const FAIXA = [
  "bg-info-soft/70",
  "bg-success-soft/70",
  "bg-warning-soft/70",
  "bg-brand-soft/70",
  "bg-warning-soft/70",
  "bg-brand-soft/70",
];

// Membros de grupo vêm do servidor como linhas {collaboratorId, ...}; o nome/gênero
// é resolvido pelas linhas do espelho (collabById).
// Aceita a linha de membro (com collaboratorId) ou um id solto; nome/gênero podem
// vir denormalizados no próprio membro em respostas mais antigas.
export type GroupMemberLike = string | { collaboratorId?: string | null; id?: string; fullName?: string | null; name?: string | null; gender?: string | null };
export interface MemberInfo { id: string | undefined; name: string; gender: string | null; noGender: boolean }

export function memberInfo(m: GroupMemberLike, collabById: Map<string, MirrorCollaborator>): MemberInfo {
  const obj = typeof m === "string" ? null : m;
  const id = typeof m === "string" ? m : (obj?.collaboratorId || obj?.id || undefined);
  const c = id ? collabById.get(id) : undefined;
  const name = obj?.fullName || obj?.name || c?.fullName || (id ? `#${String(id).slice(0, 8)}` : "?");
  const gender = obj?.gender ?? c?.gender ?? null;
  return { id, name, gender, noGender: !gender || gender === "unknown" };
}

export interface GroupViewProps<G> {
  groups: G[];
  collabById: Map<string, MirrorCollaborator>;
  /** Linhas do espelho: é delas que vêm departamento, datas e voos. */
  rows: MirrorRow[];
  /** Salva campos do grupo (hotel, titular do carro). */
  onPatch: (id: string, campos: Record<string, unknown>) => void;
  /** Só na tela de quartos: desfaz o compartilhamento. */
  onSeparar?: (id: string) => void;
  /** Tira a pessoa deste grupo e põe em outro (ou num novo, se destino nulo). */
  onMover: (collaboratorId: string, deGrupoId: string, paraGrupoId: string | null) => void;
  canEdit: boolean;
  onConfirm: (id: string) => void;
  pendingId: string | null | undefined;
}
