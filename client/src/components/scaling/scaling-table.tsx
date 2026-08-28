import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { MessageSquare, CalendarDays, Clock, MapPin, Plane, Bus, ArrowLeftRight, BedDouble, Receipt, Headset, Bike, Hammer } from "lucide-react";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDiarias, formatDateRange } from "@/lib/utils";
import type { TeamInclusion, Ticket, Accommodation } from "@shared/schema";
import type { PendingChangeRequest } from "./use-scaling-data";
import { isPercursoFunction, diasPercurseiro } from "@shared/calculation-rules";

// Decisão do usuário (17/08): a Escalação não mostra alertas de regra do
// percurseiro (tipo/diárias) — isso é assunto do Planejado. Religar aqui se mudar.
const SHOW_PERCURSO_DIARIAS_ALERT = false;
// Cenotécnica: o tipo de freela (empreita) É cobrado na Escalação — decisão do
// usuário em 19/08. `isCenotecnicaFunction` (alimentacao) exclui "sup ceno".
import { isCenotecnicaFunction as isCenoEmpreitaFunction } from "@shared/alimentacao";
import { ATENDIMENTO_SHORT, PERCURSEIRO_SHORT, CENO_FREELA_SHORT, type NormalizedSwap } from "./scaling-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário ÚNICO de status da tela de Escalação.
// Usado na tabela, no header do modal e no Resumo — antes cada lugar tinha a
// sua própria cadeia de ifs ("Escalado" × "Aprovado" para o mesmo registro,
// "Aguard. Gestor" × "Aguardando Gestor" × "Aprovado pelo gestor").
// Gestor = quem aprova cenotécnica (mesmo rótulo de status-badge.tsx);
// o status técnico gravado no banco continua sendo `aguardando_producao`.
// ─────────────────────────────────────────────────────────────────────────────
export type ScalingStatusKey =
  | "pendente"
  | "aguardando_producao"
  | "escalado"
  | "em_aprovacao"
  | "aprovado"
  | "cancelado";

const ESCALATED_STATUSES = new Set([
  "escalado",
  "passagem",
  "passagem_comprada",
  "hospedagem",
  "hospedagem_comprada",
  "hospedagem_passagem_comprada",
]);

export function getScalingStatusKey(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId">,
): ScalingStatusKey {
  const status = inclusion.status ?? "";
  if (status === "cancelado") return "cancelado";
  if (status === "aguardando_producao") return "aguardando_producao";
  // Sem colaborador nunca é "escalado", independentemente do status gravado
  if (!inclusion.collaboratorId) return "pendente";
  if (status === "aprovado" || status === "concluido") return "aprovado";
  if (status === "aprovacao") return "em_aprovacao";
  if (ESCALATED_STATUSES.has(status)) return "escalado";
  return "pendente";
}

const STATUS_META: Record<
  ScalingStatusKey,
  { label: string; wrap: string; dot: string; pulse?: boolean }
> = {
  pendente: {
    label: "Pendente",
    wrap: "bg-orange-50 text-orange-600 border-orange-200",
    dot: "bg-orange-400",
    pulse: true,
  },
  aguardando_producao: {
    label: "Aguardando Gestor",
    wrap: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    pulse: true,
  },
  escalado: {
    label: "Escalado",
    wrap: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  em_aprovacao: {
    label: "Em aprovação",
    wrap: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    pulse: true,
  },
  aprovado: {
    label: "Aprovado",
    wrap: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  cancelado: {
    label: "Cancelado",
    wrap: "bg-slate-100 text-slate-500 border-slate-200",
    dot: "bg-slate-400",
  },
};

export function getScalingStatusLabel(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId">,
): string {
  return STATUS_META[getScalingStatusKey(inclusion)].label;
}

const SIZE_CLS = {
  sm: "gap-1 px-2 py-0.5 text-[10px]",
  md: "gap-1.5 px-2.5 py-1 text-[11px]",
  lg: "gap-1.5 px-3 py-1.5 text-[11px] border",
} as const;

export function getStatusBadge(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId">,
  size: keyof typeof SIZE_CLS = "sm",
): ReactNode {
  const key = getScalingStatusKey(inclusion);
  const meta = STATUS_META[key];
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold shrink-0 ${SIZE_CLS[size]} ${meta.wrap}`}
      data-testid={`scaling-status-${key}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${meta.pulse ? "animate-pulse" : ""}`} />
      {meta.label}
    </span>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Tabela de escalações — usada nas duas abas (Sem Passagem / Com Transporte).
// ─────────────────────────────────────────────────────────────────────────────
export interface ScalingTableProps {
  rows: TeamInclusion[];
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
  onRowClick: (inclusion: TeamInclusion) => void;
  /** Abre o modal direto na aba Comentários e Histórico */
  onViewComments: (e: React.MouseEvent, inclusion: TeamInclusion) => void;
  getFunctionName: (functionId: string | null) => string;
  getEventName: (eventId: string | null) => string;
  getCollaboratorName: (collaboratorId?: string | null) => string;
  getCollaboratorCity: (collaboratorId?: string | null) => string | null;
  getTicket: (inclusionId: string) => Ticket | undefined;
  getAccommodation: (inclusionId: string) => Accommodation | undefined;
  pendingSwapByInclusion: Map<string, NormalizedSwap>;
  /** Vagas com pedido de ajuste/exclusão EM ABERTO — a linha avisa e o modal trava. */
  pendingChangeByInclusion?: Map<string, PendingChangeRequest>;
  approvedSwapInclusionIds: Set<string>;
  /** Trocas pendentes que o solicitante já visualizou (não repete o badge) */
  seenSwapIds: Set<string>;
  currentUserId?: string;
  /** admin/purchasing: pode analisar trocas de escalações sem logística */
  isAdminOrPurchasing: boolean;
  // ── Seleção múltipla (ações em massa) ──
  selectedIds: Set<string>;
  /** Motivo pelo qual a linha NÃO pode ser selecionada (null = pode) */
  getSelectBlockReason: (inclusion: TeamInclusion) => string | null;
  onToggleSelect: (inclusionId: string) => void;
  onToggleAllVisible: (ids: string[], select: boolean) => void;
}

/**
 * Regra ÚNICA do badge "Troca pendente" (antes cada aba tinha a sua):
 * - o solicitante vê o badge da própria troca até abrir o registro;
 * - Compras/admin vê o badge em escalações SEM passagem/hospedagem (as demais
 *   são analisadas nas abas Passagem/Hospedagem);
 * - os demais papéis não veem.
 */
export function shouldShowPendingSwapBadge(
  swap: Pick<NormalizedSwap, "id" | "requestedBy"> | undefined,
  inclusion: Pick<TeamInclusion, "needsTicket" | "needsAccommodation">,
  opts: { currentUserId?: string; isAdminOrPurchasing: boolean; seenSwapIds: Set<string> },
): boolean {
  if (!swap) return false;
  if (opts.seenSwapIds.has(swap.id)) return false;
  const isRequester = !!opts.currentUserId && swap.requestedBy === opts.currentUserId;
  if (isRequester) return true;
  if (!opts.isAdminOrPurchasing) return false;
  const noLogistics = !inclusion.needsTicket && !inclusion.needsAccommodation;
  return noLogistics;
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Ícone de necessidade com rótulo acessível (coluna Necessidades). */
function NeedIcon({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-md border text-[10px] font-bold ${active ? "bg-blue-50 border-blue-100 text-[#2563EB]" : "bg-slate-50 border-slate-100 text-slate-300"}`}
    >
      {children}
    </span>
  );
}

const PAGE_SIZE = 150;

const CHECKBOX_CLS = "border-slate-300 data-[state=checked]:bg-[#2563EB] data-[state=checked]:border-[#2563EB]";

export default function ScalingTable({
  rows,
  sortConfig,
  onSort,
  onRowClick,
  onViewComments,
  getFunctionName,
  getEventName,
  getCollaboratorName,
  getCollaboratorCity,
  getTicket,
  getAccommodation,
  pendingSwapByInclusion,
  pendingChangeByInclusion,
  approvedSwapInclusionIds,
  seenSwapIds,
  currentUserId,
  isAdminOrPurchasing,
  selectedIds,
  getSelectBlockReason,
  onToggleSelect,
  onToggleAllVisible,
}: ScalingTableProps) {
  // Corte de renderização (auditoria 28/08): sem filtro, a tela montava TODAS
  // as linhas de uma vez (milhares de células e tooltips) e cada tecla na
  // busca repintava tudo. O dado continua inteiro em memória — só o DOM é
  // servido em blocos; exportações e contadores não passam por aqui.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [rows.length]);
  const visibleRows = rows.length > visibleCount ? rows.slice(0, visibleCount) : rows;
  const selectableIds = visibleRows.filter(r => !getSelectBlockReason(r)).map(r => r.id);
  const selectedVisible = selectableIds.filter(id => selectedIds.has(id)).length;
  const allVisibleSelected = selectableIds.length > 0 && selectedVisible === selectableIds.length;
  const someVisibleSelected = selectedVisible > 0 && !allVisibleSelected;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-4">
      <div className="overflow-x-auto">
        <table className="table-fixed w-full min-w-[980px]">
          <colgroup>
            <col style={{ width: "44px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "160px" }} />
            <col style={{ width: "220px" }} />
          </colgroup>
          <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
            <tr>
              <th className="px-3 py-4 text-left">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Checkbox
                        checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                        disabled={selectableIds.length === 0}
                        onCheckedChange={(v) => onToggleAllVisible(selectableIds, v === true)}
                        aria-label={allVisibleSelected ? "Desmarcar todas as visíveis" : "Selecionar todas as visíveis que podem ser confirmadas"}
                        data-testid="checkbox-select-all-visible"
                        className={CHECKBOX_CLS}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">
                    {selectableIds.length === 0
                      ? "Nenhuma linha visível pode ser confirmada por você"
                      : `Selecionar as ${selectableIds.length} visíveis que você pode confirmar`}
                  </TooltipContent>
                </Tooltip>
              </th>
              <SortableHeader field="id" sortConfig={sortConfig} onSort={onSort}>ID</SortableHeader>
              <SortableHeader field="function" sortConfig={sortConfig} onSort={onSort}>Função / Evento</SortableHeader>
              <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={onSort}>Colaborador</SortableHeader>
              <SortableHeader field="period" className="whitespace-nowrap" sortConfig={sortConfig} onSort={onSort}>Período / Diárias</SortableHeader>
              <th className="px-4 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] whitespace-nowrap">
                Necessidades
              </th>
              <th className="w-[220px] min-w-[220px] px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((inclusion, rowIdx) => {
              const ticket = getTicket(inclusion.id);
              const accommodation = getAccommodation(inclusion.id);
              const hasAccommodationAttachments = !!(accommodation?.attachmentIds && accommodation.attachmentIds.length > 0);
              const swap = pendingSwapByInclusion.get(inclusion.id);
              const showSwapBadge = shouldShowPendingSwapBadge(swap, inclusion, { currentUserId, isAdminOrPurchasing, seenSwapIds });
              const city = inclusion.city || getCollaboratorCity(inclusion.collaboratorId);
              const selectBlock = getSelectBlockReason(inclusion);
              const isSelected = selectedIds.has(inclusion.id);
              const emitsNf = (inclusion as any).emitsNf !== false;
              const atendimento = ATENDIMENTO_SHORT[(inclusion as any).atendimentoTipo ?? ""];
              const isPercurso = isPercursoFunction(getFunctionName(inclusion.functionId));
              const percurseiro = isPercurso ? PERCURSEIRO_SHORT[(inclusion as any).percurseiroTipo ?? ""] : undefined;
              // Cenotécnica: modalidade de empreita (valor fechado por dias) —
              // definida no modal desta tela; sem ela, cobra com badge âmbar.
              const isCenoEmpreita = isCenoEmpreitaFunction(getFunctionName(inclusion.functionId));
              const cenoFreela = isCenoEmpreita ? CENO_FREELA_SHORT[(inclusion as any).cenoFreelaTipo ?? ""] : undefined;
              // Percurso: regra fixa de diárias (2 em viagem / 1 local) vive no
              // Planejado, que ignora o número da escala. Por decisão do usuário
              // (17/08) a Escalação NÃO mostra aviso de divergência.
              const percursoDiariasEsperadas = SHOW_PERCURSO_DIARIAS_ALERT && isPercurso ? diasPercurseiro(inclusion.needsTicket) : null;
              const percursoDiariasDivergem =
                percursoDiariasEsperadas !== null && inclusion.dailyRates != null && inclusion.dailyRates !== percursoDiariasEsperadas;
              const idLabel = `#${inclusion.inclusionNumber ?? ""}`;
              return (
                <tr
                  key={inclusion.id}
                  className={`group/row transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${isSelected ? "bg-blue-50/70" : rowIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"} hover:bg-blue-50/50 ${inclusion.status === "cancelado" ? "opacity-50" : ""}`}
                  onClick={() => onRowClick(inclusion)}
                  tabIndex={0}
                  aria-label={`Abrir detalhes da escalação ${idLabel}`}
                  aria-selected={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(inclusion);
                    }
                  }}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex" tabIndex={selectBlock ? 0 : -1}>
                          <Checkbox
                            checked={isSelected}
                            disabled={!!selectBlock}
                            onCheckedChange={() => onToggleSelect(inclusion.id)}
                            aria-label={selectBlock ? `Não selecionável: ${selectBlock}` : `Selecionar escalação ${idLabel}`}
                            data-testid={`checkbox-select-${inclusion.id}`}
                            className={CHECKBOX_CLS}
                          />
                        </span>
                      </TooltipTrigger>
                      {selectBlock && (
                        <TooltipContent side="right" className="text-[11px] max-w-[240px]">{selectBlock}</TooltipContent>
                      )}
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-lg font-mono border border-blue-100">
                        #{inclusion.inclusionNumber || "N/A"}
                      </span>
                      <button
                        type="button"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 bg-slate-50 border border-slate-200 hover:bg-[#2563EB] hover:text-white hover:border-[#2563EB] transition-all duration-150"
                        onClick={(e) => onViewComments(e, inclusion)}
                        title="Comentários e histórico"
                        aria-label={`Abrir comentários e histórico da escalação ${idLabel}`}
                        data-testid={`button-comments-${inclusion.id}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-bold text-slate-800 leading-tight">
                      {getFunctionName(inclusion.functionId)}
                    </div>
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] text-[10px] font-semibold border border-blue-100/80 max-w-full">
                      <CalendarDays className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate max-w-[200px]">{getEventName(inclusion.eventId)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {inclusion.collaboratorId ? (() => {
                      const name = getCollaboratorName(inclusion.collaboratorId);
                      return (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-black shrink-0">{initials(name)}</div>
                          <span className="text-[12px] font-medium text-slate-700 leading-snug">{name}</span>
                        </div>
                      );
                    })() : (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">N/E</div>
                        <span className="text-[12px] italic text-slate-400">Não escalado</span>
                      </div>
                    )}
                    {city && (
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {city}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-[12px] font-semibold text-slate-800 whitespace-nowrap">
                      {formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {formatDiarias(inclusion.dailyRates)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" aria-label="Necessidades da escalação">
                      <NeedIcon label={inclusion.needsTicket ? "Precisa de passagem" : "Não precisa de passagem"} active={!!inclusion.needsTicket}>
                        <Plane className="w-3 h-3" />
                      </NeedIcon>
                      <NeedIcon label={inclusion.needsAccommodation ? "Precisa de hospedagem" : "Não precisa de hospedagem"} active={!!inclusion.needsAccommodation}>
                        <BedDouble className="w-3 h-3" />
                      </NeedIcon>
                      <NeedIcon label={emitsNf ? "Emite nota fiscal" : "Não emite nota fiscal"} active={emitsNf}>
                        <Receipt className="w-3 h-3" />
                      </NeedIcon>
                      {atendimento && (
                        <NeedIcon label={`Tipo de atendimento: ${atendimento.label}`} active>
                          <span className="inline-flex items-center gap-0.5"><Headset className="w-2.5 h-2.5" />{atendimento.short}</span>
                        </NeedIcon>
                      )}
                      {/* Tipo do percurseiro: mostra só quando já definido. A definição
                          (Tipo 1/2) é feita NO PLANEJADO por decisão do usuário — a
                          Escalação não cobra nem bloqueia por isso. */}
                      {isPercurso && percurseiro && (
                        <NeedIcon label={`Tipo do percurseiro: ${percurseiro.label}`} active>
                          <span className="inline-flex items-center gap-0.5"><Bike className="w-2.5 h-2.5" />{percurseiro.short}</span>
                        </NeedIcon>
                      )}
                      {/* Cenotécnica: tipo de freela (empreita). Âmbar enquanto
                          não definido — sinaliza, não bloqueia a confirmação. */}
                      {isCenoEmpreita && (cenoFreela ? (
                        <NeedIcon label={`Tipo de freela: ${cenoFreela.label}`} active>
                          <span className="inline-flex items-center gap-0.5"><Hammer className="w-2.5 h-2.5" />{cenoFreela.short}</span>
                        </NeedIcon>
                      ) : (
                        <span
                          role="img"
                          aria-label="Tipo de freela da cenotécnica não definido — abra os detalhes para definir"
                          title="Cenotécnica sem tipo de freela: abra os detalhes e escolha Freela Viagem, SP, Local (A) ou Local (B). O Planejado precisa do tipo para o valor fechado."
                          data-testid={`badge-ceno-freela-definir-${inclusion.id}`}
                          className="inline-flex items-center justify-center gap-0.5 h-6 px-1.5 rounded-md border text-[10px] font-bold bg-amber-50 border-amber-200 text-amber-700 whitespace-nowrap"
                        >
                          <Hammer className="w-2.5 h-2.5" />definir tipo
                        </span>
                      ))}
                      {percursoDiariasDivergem && (
                        <span
                          role="img"
                          aria-label={`Percurso ${inclusion.needsTicket ? "em viagem" : "local"}: a regra é ${percursoDiariasEsperadas} ${percursoDiariasEsperadas === 1 ? "diária" : "diárias"}, mas a escala está com ${inclusion.dailyRates}. O Planejado usa a regra; corrija a escala.`}
                          title={`Percurso ${inclusion.needsTicket ? "em viagem" : "local (SP/Grande SP)"}: a regra é ${percursoDiariasEsperadas} ${percursoDiariasEsperadas === 1 ? "diária" : "diárias"}, mas a escala está com ${inclusion.dailyRates}. O Planejado já usa a regra — corrija a escala.`}
                          data-testid="badge-percurso-diarias-divergem"
                          className="inline-flex items-center justify-center gap-0.5 h-6 px-1 rounded-md border text-[10px] font-bold bg-red-50 border-red-200 text-red-700"
                        >
                          <Bike className="w-2.5 h-2.5" />{inclusion.dailyRates}≠{percursoDiariasEsperadas} diária{percursoDiariasEsperadas === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <div>{getStatusBadge(inclusion, "sm")}</div>
                      {/* Pedido em análise: a linha avisa antes de o usuário
                          abrir o modal e descobrir que está tudo travado. */}
                      {pendingChangeByInclusion?.get(inclusion.id) && (() => {
                        const p = pendingChangeByInclusion.get(inclusion.id)!;
                        const tipo = p.requestType === "exclusao" ? "exclusão" : "ajuste";
                        return (
                          <span
                            className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                            title={`Pedido de ${tipo} aguardando o aprovador${p.requestedByName ? ` · por ${p.requestedByName}` : ""}${p.reason ? ` · ${p.reason}` : ""}`}
                            data-testid="badge-pedido-em-analise"
                          >
                            <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                            Em aprovação de {tipo}
                          </span>
                        );
                      })()}
                      <div className="flex flex-wrap gap-1">
                        {ticket && (
                          ticket.transportType === "van" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                              🚐 Van
                            </span>
                          ) : ticket.transportType === "rodoviario" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                              <Bus className="w-2.5 h-2.5" />Rodoviária
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                              <Plane className="w-2.5 h-2.5" />Passagem
                            </span>
                          )
                        )}
                        {accommodation && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[10px] font-semibold border border-purple-100">
                            🏨 Hotel{hasAccommodationAttachments && " 📎"}
                          </span>
                        )}
                        {showSwapBadge && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-200">
                            <ArrowLeftRight className="w-2.5 h-2.5" />Troca pendente
                          </span>
                        )}
                        {approvedSwapInclusionIds.has(inclusion.id) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold border border-green-200">
                            <ArrowLeftRight className="w-2.5 h-2.5" />Troca aprovada
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > visibleCount && (
        <div className="flex items-center justify-center gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <span className="text-xs text-slate-500">
            Mostrando {visibleRows.length} de {rows.length} escalações
          </span>
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-brand-soft"
            data-testid="button-load-more-rows"
          >
            Mostrar mais {Math.min(PAGE_SIZE, rows.length - visibleCount)}
          </button>
          <button
            type="button"
            onClick={() => setVisibleCount(rows.length)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-primary"
            data-testid="button-load-all-rows"
          >
            Mostrar todas
          </button>
        </div>
      )}
    </div>
  );
}
