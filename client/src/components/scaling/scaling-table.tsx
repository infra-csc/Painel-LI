/**
 * Tabela da Escalação — redesenho de 01/09.
 *
 * A tela é uma FILA DE TRABALHO, não um relatório. O que mudou, e por quê:
 *
 * - **A coluna Status era um depósito**: até seis pílulas em 220px, três
 *   linhas, quatro famílias de cor. Virou "Situação": UMA pílula e uma linha
 *   de detalhe em texto ("Enviada ao gestor em 22/07").
 * - **Necessidades desenhava ausência como falta**: o ícone cinza significava
 *   "não precisa" mas lia como "desabilitado". Virou "Precisa de", onde só o
 *   que é verdade aparece, escrito por extenso.
 * - **A ação principal não existia**: a vaga vazia dizia "Não escalado" em
 *   itálico cinza. Agora tem o botão "Escalar alguém" — mas só na função pela
 *   qual a pessoa responde; nas outras, cadeado e o motivo no título.
 * - **Cor = estado**: a pílula diz o estado e o marcador de 3px da borda diz
 *   se a linha espera VOCÊ. Nada mais colore.
 * - **Zebra removida.** Além de ruído, ela escondia um bug: nas linhas ímpares
 *   a coluna congelada ficava sem fundo próprio.
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import {
  MessageSquare, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Lock, UserPlus,
  Plane, Bus, BedDouble, Receipt, Headset, Bike, Hammer,
} from "lucide-react";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDiarias, formatDateRange } from "@/lib/utils";
import type { TeamInclusion, Ticket, Accommodation } from "@shared/schema";
import type { PendingChangeRequest } from "./use-scaling-data";
import { isPercursoFunction } from "@shared/calculation-rules";
import { isCenotecnicaFunction as isCenoEmpreitaFunction } from "@shared/alimentacao";
import { ATENDIMENTO_SHORT, PERCURSEIRO_SHORT, CENO_FREELA_SHORT, type NormalizedSwap } from "./scaling-utils";
import { STATUS_META, getScalingStatusKey } from "./scaling-status";

// O vocabulário de status mora em scaling-status.ts (módulo sem JSX, para a
// fila e as Análises poderem usá-lo). Reexportado aqui porque a tela e o modal
// sempre o importaram deste arquivo.
export { getScalingStatusKey, getScalingStatusLabel, STATUS_META } from "./scaling-status";
export type { ScalingStatusKey } from "./scaling-status";

const SIZE_CLS = {
  sm: "gap-1.5 h-[22px] px-2 text-[11px]",
  md: "gap-1.5 h-[24px] px-2.5 text-[11px]",
  lg: "gap-2 h-[28px] px-3 text-[12px]",
} as const;

/** A pílula de situação — a mesma na linha, no modal e no resumo. */
export function getStatusBadge(
  inclusion: Pick<TeamInclusion, "status" | "collaboratorId">,
  size: keyof typeof SIZE_CLS = "sm",
): ReactNode {
  const key = getScalingStatusKey(inclusion);
  const meta = STATUS_META[key];
  return (
    <span
      className={`inline-flex w-fit items-center rounded-md font-semibold shrink-0 ${SIZE_CLS[size]} ${meta.wrap}`}
      data-testid={`scaling-status-${key}`}
    >
      <span className={`w-[5px] h-[5px] rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export interface ScalingTableProps {
  rows: TeamInclusion[];
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
  onRowClick: (inclusion: TeamInclusion) => void;
  /** Abre o modal direto na aba Comentários e Histórico */
  onViewComments: (e: React.MouseEvent, inclusion: TeamInclusion) => void;
  /** Abre o modal já no modo de escolher colaborador — a ação principal da tela. */
  onEscalar: (e: React.MouseEvent, inclusion: TeamInclusion) => void;
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
  /** Trocas pendentes que o solicitante já visualizou (não repete o aviso) */
  seenSwapIds: Set<string>;
  currentUserId?: string;
  /** admin/purchasing: pode analisar trocas de escalações sem logística */
  isAdminOrPurchasing: boolean;
  /**
   * Quem pode ESCALAR nesta linha: administrador ou o responsável pela função.
   * Mais estrito que a permissão de editar — é o gatilho do botão da lista.
   */
  canManageFunction: (functionId: string) => boolean;
  /** Quem aprova cenotécnica vê "aguardando gestor" como coisa sua. */
  canApproveProduction: boolean;
  /** Quantos comentários cada vaga tem — o botão mostra o número. */
  commentCountByInclusion?: Map<string, number>;
  /** Nome de quem responde pela função, para o título da linha travada. */
  getResponsavelDaFuncao?: (functionId: string) => string | null;
  /** Passagem efetivamente comprada — decide se o chip está resolvido. */
  temPassagemComprada?: (inclusion: TeamInclusion) => boolean;
  /** Evento encerrado / somente leitura: nada de botão que a API vai negar. */
  readOnly?: boolean;
  /**
   * Esta LINHA está travada por evento encerrado. Precisa ser por linha, e não
   * da tela inteira: sem filtro de evento a lista mistura eventos abertos e
   * encerrados, e o botão de escalar aparecia nos dois — o servidor respondia
   * 403 depois que a pessoa já tinha escolhido o nome.
   */
  isEventLocked?: (inclusion: TeamInclusion) => boolean;
  // ── Seleção múltipla (ações em massa) ──
  selectedIds: Set<string>;
  /** Motivo pelo qual a linha NÃO pode ser selecionada (null = pode) */
  getSelectBlockReason: (inclusion: TeamInclusion) => string | null;
  onToggleSelect: (inclusionId: string) => void;
  onToggleAllVisible: (ids: string[], select: boolean) => void;
}

/**
 * Regra ÚNICA do aviso de troca pendente (antes cada aba tinha a sua):
 * - o solicitante vê a própria troca até abrir o registro;
 * - Compras/admin vê em escalações SEM passagem/hospedagem (as demais são
 *   analisadas nas telas de Passagem/Hospedagem);
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

/** "2026-07-22T…" → "22/07". Data curta, para caber na linha de detalhe. */
function diaMes(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A linha de detalhe abaixo da pílula: quem está esperando o quê, em texto.
 * É a informação que antes exigia abrir o registro para descobrir.
 */
export function detalheDaSituacao(
  inclusion: TeamInclusion,
  opts: { swap?: NormalizedSwap; pedido?: PendingChangeRequest },
): { texto: string; titulo: string; tom: "troca" | "pedido" | "neutro" } | null {
  if (opts.swap) {
    const nome = opts.swap.newCollaboratorName?.trim();
    const texto = nome ? `Troca para ${nome} em análise` : "Troca em análise";
    // O título carrega quem pediu e por quê: a linha tem espaço para a frase
    // curta, mas essa informação não pode sumir da lista — era o que o antigo
    // badge "Troca pendente" guardava no hover.
    const porQuem = opts.swap.requestedByName?.trim();
    return {
      texto,
      titulo: [texto, porQuem ? `pedida por ${porQuem}` : null, opts.swap.reason?.trim() || null]
        .filter(Boolean).join(" · "),
      tom: "troca",
    };
  }
  if (opts.pedido) {
    const tipo = opts.pedido.requestType === "exclusao" ? "exclusão" : "ajuste";
    const quando = diaMes(opts.pedido.createdAt);
    const texto = `Pedido de ${tipo} com o aprovador${quando ? ` desde ${quando}` : ""}`;
    return {
      texto,
      titulo: [texto, opts.pedido.requestedByName ? `por ${opts.pedido.requestedByName}` : null, opts.pedido.reason || null]
        .filter(Boolean).join(" · "),
      tom: "pedido",
    };
  }
  if (inclusion.status === "aguardando_producao") {
    // `updatedAt` é a melhor aproximação da transição: quando o status é este,
    // a última gravação foi justamente o envio ao gestor.
    const quando = diaMes(inclusion.updatedAt);
    const texto = quando ? `Enviada ao gestor em ${quando}` : "Enviada ao gestor";
    return { texto, titulo: texto, tom: "neutro" };
  }
  const aprovado = diaMes(inclusion.approvedByProductionAt);
  if (aprovado && getScalingStatusKey(inclusion) === "aprovado") {
    const texto = `Aprovada pelo gestor em ${aprovado}`;
    return { texto, titulo: texto, tom: "neutro" };
  }
  return null;
}

/** Um chip de "Precisa de" — só o que é verdade é desenhado. */
interface Need { key: string; icon: ReactNode; label: string; title: string; cls: string }

const NEED_INFO = "bg-brand-soft text-[#3730A3]";
const NEED_NEUTRO = "bg-slate-100 text-[#475569]";
const NEED_FALTA = "bg-[#FEF3C7] text-[#92400E]";

export function needsDaLinha(
  inclusion: TeamInclusion,
  opts: {
    ticket?: Ticket;
    funcao: string;
    /** Passagem efetivamente COMPRADA (não só registrada). */
    passagemComprada?: boolean;
    /** Reserva de hotel já existente. */
    hospedagem?: Accommodation;
  },
): Need[] {
  const needs: Need[] = [];
  // O chip diz do que a vaga precisa E se aquilo já está resolvido: azul
  // quando está, âmbar enquanto falta. A lista antiga trazia essa informação
  // numa pílula roxa separada ("Hotel"), que dizia "reservada" com a mesma
  // palavra que a coluna ao lado usava para dizer "precisa" — duas leituras
  // possíveis para o mesmo rótulo.
  if (inclusion.needsTicket) {
    const tipo = opts.ticket?.transportType;
    const comprada = !!opts.passagemComprada;
    const nome = tipo === "van" ? "Van" : tipo === "rodoviario" ? "Rodoviária" : "Passagem";
    const anexos = opts.ticket?.attachmentIds?.length ?? 0;
    needs.push({
      key: "transporte",
      icon: tipo === "rodoviario" ? <Bus className="w-3.5 h-3.5" aria-hidden="true" /> : <Plane className="w-3.5 h-3.5" aria-hidden="true" />,
      label: nome,
      title: comprada
        ? `${nome} comprada${anexos ? ` · ${anexos} ${anexos === 1 ? "anexo" : "anexos"}` : ""}`
        : `Precisa de transporte — ainda não comprada`,
      cls: comprada ? NEED_INFO : NEED_FALTA,
    });
  }
  if (inclusion.needsAccommodation) {
    const reservada = !!opts.hospedagem;
    // O clipe colado em "Hotel 📎" escondia um dado real num caractere; a
    // contagem de anexos passa para o título, onde dá para ler.
    const anexos = opts.hospedagem?.attachmentIds?.length ?? 0;
    needs.push({
      key: "hotel",
      icon: <BedDouble className="w-3.5 h-3.5" aria-hidden="true" />,
      label: "Hotel",
      title: reservada
        ? `Hospedagem reservada${opts.hospedagem?.hotelName ? ` · ${opts.hospedagem.hotelName}` : ""}${anexos ? ` · ${anexos} ${anexos === 1 ? "anexo" : "anexos"}` : ""}`
        : "Precisa de hospedagem — ainda não reservada",
      cls: reservada ? NEED_INFO : NEED_FALTA,
    });
  }
  if (inclusion.emitsNf === false) {
    needs.push({ key: "nf", icon: <Receipt className="w-3.5 h-3.5" aria-hidden="true" />, label: "Sem NF", title: "Não emite nota fiscal", cls: NEED_NEUTRO });
  }
  const at = ATENDIMENTO_SHORT[inclusion.atendimentoTipo ?? ""];
  if (at) {
    needs.push({ key: "atendimento", icon: <Headset className="w-3.5 h-3.5" aria-hidden="true" />, label: at.label, title: `Tipo de atendimento: ${at.label}`, cls: NEED_NEUTRO });
  }
  if (isPercursoFunction(opts.funcao)) {
    const p = PERCURSEIRO_SHORT[inclusion.percurseiroTipo ?? ""];
    // O tipo do percurseiro é definido NO PLANEJADO (decisão de 17/08): a
    // Escalação mostra quando já existe e não cobra quando falta.
    if (p) needs.push({ key: "percurseiro", icon: <Bike className="w-3.5 h-3.5" aria-hidden="true" />, label: p.short, title: `Tipo do percurseiro: ${p.label}`, cls: NEED_NEUTRO });
  }
  if (isCenoEmpreitaFunction(opts.funcao)) {
    const c = CENO_FREELA_SHORT[inclusion.cenoFreelaTipo ?? ""];
    needs.push(c
      ? { key: "freela", icon: <Hammer className="w-3.5 h-3.5" aria-hidden="true" />, label: c.short, title: `Tipo de freela: ${c.label}`, cls: NEED_NEUTRO }
      // Âmbar porque falta algo, não porque está errado: sinaliza, não bloqueia.
      : { key: "freela", icon: <Hammer className="w-3.5 h-3.5" aria-hidden="true" />, label: "definir freela", title: "Cenotécnica sem tipo de freela — o Planejado precisa do tipo para o valor fechado", cls: NEED_FALTA });
  }
  return needs;
}

const PAGE_SIZE = 150;

const CHECKBOX_CLS = "border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary";

/** Cabeçalho próprio: 34px, 11px/500, e a seta SEMPRE visível (não depende de hover). */
function Th({ field, label, className = "", sortConfig, onSort }: {
  field?: SortField; label: string; className?: string;
  sortConfig: SortConfig | null; onSort: (f: SortField) => void;
}) {
  const ativo = !!field && sortConfig?.field === field;
  const dir = ativo ? sortConfig!.direction : null;
  return (
    <th
      scope="col"
      aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3.5 text-left text-[11px] font-medium ${ativo ? "text-primary" : "text-muted-foreground"} ${className}`}
      data-testid={field ? `header-${field}` : undefined}
    >
      {field ? (
        <button
          type="button"
          onClick={() => onSort(field)}
          className="inline-flex items-center gap-1 rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Ordenar por ${label}`}
        >
          {label}
          {dir === "asc" ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            : dir === "desc" ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            : <ChevronsUpDown className="w-3.5 h-3.5 opacity-45" aria-hidden="true" />}
        </button>
      ) : label}
    </th>
  );
}

export default function ScalingTable({
  rows, sortConfig, onSort, onRowClick, onViewComments, onEscalar,
  getFunctionName, getEventName, getCollaboratorName, getCollaboratorCity,
  getTicket, getAccommodation,
  pendingSwapByInclusion, pendingChangeByInclusion, approvedSwapInclusionIds, seenSwapIds,
  currentUserId, isAdminOrPurchasing, canManageFunction, canApproveProduction, readOnly = false,
  commentCountByInclusion, getResponsavelDaFuncao, temPassagemComprada, isEventLocked,
  selectedIds, getSelectBlockReason, onToggleSelect, onToggleAllVisible,
}: ScalingTableProps) {
  // Corte de renderização (auditoria 28/08): sem filtro, a tela montava TODAS
  // as linhas de uma vez e cada tecla na busca repintava tudo. O dado continua
  // inteiro em memória — só o DOM é servido em blocos.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [rows.length]);
  const visibleRows = rows.length > visibleCount ? rows.slice(0, visibleCount) : rows;
  const selectableIds = visibleRows.filter(r => !getSelectBlockReason(r)).map(r => r.id);
  const selectedVisible = selectableIds.filter(id => selectedIds.has(id)).length;
  const allVisibleSelected = selectableIds.length > 0 && selectedVisible === selectableIds.length;
  const someVisibleSelected = selectedVisible > 0 && !allVisibleSelected;

  const ordemLabel = sortConfig
    ? ({ id: "ID", function: "função", collaborator: "colaborador", period: "período", status: "situação" } as Record<string, string>)[sortConfig.field] ?? sortConfig.field
    : "evento e função";

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-fixed w-full min-w-[1180px]">
          <colgroup>
            <col style={{ width: "44px" }} />
            <col style={{ width: "84px" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "148px" }} />
            <col style={{ width: "250px" }} />
            <col style={{ width: "168px" }} />
            <col style={{ width: "86px" }} />
          </colgroup>
          <thead>
            <tr className="h-[34px] bg-background border-b border-border">
              <th scope="col" className="px-3 text-center">
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
              <Th field="id" label="ID" sortConfig={sortConfig} onSort={onSort} />
              <Th field="function" label="Função / Evento" sortConfig={sortConfig} onSort={onSort} />
              <Th field="collaborator" label="Colaborador" sortConfig={sortConfig} onSort={onSort} />
              <Th field="period" label="Período / diárias" className="whitespace-nowrap" sortConfig={sortConfig} onSort={onSort} />
              <Th label="Precisa de" sortConfig={sortConfig} onSort={onSort} />
              <Th field="status" label="Situação" sortConfig={sortConfig} onSort={onSort} />
              <Th label="" sortConfig={sortConfig} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((inclusion) => {
              const ticket = getTicket(inclusion.id);
              const funcao = getFunctionName(inclusion.functionId);
              const swap = pendingSwapByInclusion.get(inclusion.id);
              const mostraSwap = shouldShowPendingSwapBadge(swap, inclusion, { currentUserId, isAdminOrPurchasing, seenSwapIds });
              const pedido = pendingChangeByInclusion?.get(inclusion.id);
              const city = inclusion.city || getCollaboratorCity(inclusion.collaboratorId);
              const selectBlock = getSelectBlockReason(inclusion);
              const isSelected = selectedIds.has(inclusion.id);
              const idLabel = `#${inclusion.inclusionNumber ?? ""}`;
              // Guardados porque agora aparecem duas vezes: no texto e no title.
              const nomeDoEvento = getEventName(inclusion.eventId);
              const nomeDoColaborador = getCollaboratorName(inclusion.collaboratorId);
              const cancelada = inclusion.status === "cancelado";
              const eventoTravado = isEventLocked?.(inclusion) ?? false;
              const podeGerir = canManageFunction(inclusion.functionId) && !readOnly && !eventoTravado;
              const vazia = !inclusion.collaboratorId && !cancelada;
              const needs = needsDaLinha(inclusion, {
                ticket, funcao,
                passagemComprada: temPassagemComprada?.(inclusion) ?? !!ticket?.purchaseDate,
                hospedagem: getAccommodation(inclusion.id),
              });
              const detalhe = detalheDaSituacao(inclusion, { swap: mostraSwap ? swap : undefined, pedido });

              // O marcador de 3px responde a uma pergunta só: isto espera
              // alguém? Âmbar quando espera VOCÊ (vaga sua por preencher, ou
              // aprovação que é sua), roxo quando está com outra pessoa.
              const esperaVoce = (vazia && podeGerir) || (inclusion.status === "aguardando_producao" && canApproveProduction);
              // Só pinta de roxo o que a linha CONSEGUE explicar: a troca que
              // este usuário não deve ver não tem detalhe embaixo, e uma borda
              // colorida sem legenda é charada, não sinal.
              const emAnalise = (!!swap && mostraSwap) || !!pedido;
              const marker = cancelada ? "transparent" : esperaVoce ? "#FBBF24" : emAnalise ? "#A855F7" : "transparent";

              return (
                <tr
                  key={inclusion.id}
                  className={`group/row h-[52px] border-b border-slate-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${isSelected ? "bg-[#F5F7FF] hover:bg-brand-soft" : "bg-card hover:bg-[#FBFCFE]"} ${cancelada ? "opacity-55" : ""}`}
                  onClick={() => onRowClick(inclusion)}
                  tabIndex={0}
                  aria-label={`Abrir detalhes da escalação ${idLabel}`}
                  aria-selected={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(inclusion); }
                  }}
                  data-testid={`row-inclusion-${inclusion.id}`}
                >
                  <td
                    className="px-3 text-center"
                    style={{ borderLeft: `3px solid ${marker}` }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {/* `title` nativo em vez do Tooltip do Radix: eram 150
                        instâncias por página, cada uma com contexto e portal
                        próprios, e a lista congelava perto de um segundo a cada
                        reordenação. O motivo continua legível — no title e no
                        aria-label — e o cabeçalho, que é UM, mantém o Tooltip. */}
                    <span className="inline-flex" title={selectBlock ?? undefined}>
                      <Checkbox
                        checked={isSelected}
                        disabled={!!selectBlock}
                        onCheckedChange={() => onToggleSelect(inclusion.id)}
                        aria-label={selectBlock ? `Não selecionável: ${selectBlock}` : `Selecionar escalação ${idLabel}`}
                        data-testid={`checkbox-select-${inclusion.id}`}
                        className={CHECKBOX_CLS}
                      />
                    </span>
                  </td>

                  <td className="pr-3.5 whitespace-nowrap">
                    <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{idLabel}</span>
                  </td>

                  <td className="px-3.5 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate" title={funcao}>{funcao}</div>
                    <div className="text-[12px] text-muted-foreground truncate" title={nomeDoEvento}>{nomeDoEvento}</div>
                  </td>

                  <td className="px-3.5 min-w-0">
                    {inclusion.collaboratorId ? (
                      <>
                        <div className="text-[13px] font-medium text-slate-900 truncate" title={nomeDoColaborador}>{nomeDoColaborador}</div>
                        {city && <div className="text-[12px] text-muted-foreground truncate" title={city}>{city}</div>}
                      </>
                    ) : vazia && podeGerir ? (
                      <button
                        type="button"
                        onClick={(e) => onEscalar(e, inclusion)}
                        className="inline-flex items-center gap-1.5 h-[30px] pl-2.5 pr-3 rounded-lg border border-dashed border-[#93A9E8] bg-[#F5F7FF] text-[13px] font-semibold text-primary whitespace-nowrap hover:bg-brand-soft hover:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        data-testid={`button-escalar-${inclusion.id}`}
                      >
                        <UserPlus className="w-4 h-4" aria-hidden="true" /> Escalar alguém
                      </button>
                    ) : (
                      <span
                        title={(() => {
                          if (eventoTravado) return "Evento encerrado — a partir do dia seguinte ao término, só o administrador altera.";
                          if (readOnly) return "Esta lista está em modo consulta.";
                          const quem = getResponsavelDaFuncao?.(inclusion.functionId);
                          // Com o nome, a linha travada vira um encaminhamento:
                          // a pessoa sabe a quem pedir em vez de só descobrir
                          // que não pode.
                          return quem
                            ? `Quem escala esta vaga é ${quem}, responsável por ${funcao}. Você pode consultar.`
                            : `Quem responde por ${funcao} escala esta vaga. Você pode consultar.`;
                        })()}
                        className="inline-flex items-center gap-1.5 text-[13px] text-slate-400"
                      >
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />Não escalado
                      </span>
                    )}
                  </td>

                  <td className="px-3.5 whitespace-nowrap">
                    <div className="text-[13px] text-slate-700 tabular-nums">
                      {formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)}
                    </div>
                    <div className="text-[12px] text-muted-foreground">{formatDiarias(inclusion.dailyRates)}</div>
                  </td>

                  <td className="px-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap" aria-label="Do que esta escalação precisa">
                      {needs.map((n) => (
                        <span
                          key={n.key}
                          title={n.title}
                          className={`inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-[11px] font-medium whitespace-nowrap ${n.cls}`}
                        >
                          {n.icon}{n.label}
                        </span>
                      ))}
                      {needs.length === 0 && <span className="text-[12px] text-slate-400">Sem logística</span>}
                    </div>
                  </td>

                  <td className="px-3.5">
                    <div className="flex flex-col gap-[3px] min-w-0">
                      {getStatusBadge(inclusion, "sm")}
                      {/* Pedido de ajuste/exclusão em aberto TRAVA a vaga (regra do
                          dono, 26/08): não dá para escalar, comprar nem confirmar até o
                          aprovador decidir. Um texto de 11px cortado em "Pedido de
                          ajuste com o …" não avisava isso a ninguém — virou chip
                          âmbar, com ícone, que quebra linha em vez de cortar. */}
                      {detalhe && detalhe.tom === "pedido" ? (
                        <span
                          className="inline-flex max-w-full items-start gap-1 rounded-md border px-[7px] py-[3px] text-[11px] font-semibold leading-tight"
                          style={{ background: "#FEF3C7", color: "#92400E", borderColor: "#FDE68A" }}
                          title={detalhe.titulo}
                          data-testid={`detalhe-situacao-${inclusion.id}`}
                        >
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{detalhe.texto}</span>
                        </span>
                      ) : detalhe && (
                        <span
                          className={`text-[11px] truncate ${detalhe.tom === "troca" ? "text-[#7E22CE]" : "text-muted-foreground"}`}
                          title={detalhe.titulo}
                          data-testid={`detalhe-situacao-${inclusion.id}`}
                        >
                          {detalhe.texto}
                        </span>
                      )}
                      {!detalhe && approvedSwapInclusionIds.has(inclusion.id) && (
                        <span className="text-[11px] text-[#047857] truncate">Troca aprovada</span>
                      )}
                    </div>
                  </td>

                  <td className="px-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      {(() => {
                        const nComments = commentCountByInclusion?.get(inclusion.id) ?? 0;
                        return (
                          <button
                            type="button"
                            className="relative inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg text-slate-400 hover:bg-brand-soft hover:text-primary transition-colors"
                            onClick={(e) => onViewComments(e, inclusion)}
                            title={nComments === 0
                              ? "Comentários e histórico"
                              : `${nComments} ${nComments === 1 ? "comentário" : "comentários"} · abrir histórico`}
                            aria-label={`Abrir comentários e histórico da escalação ${idLabel}${nComments ? ` (${nComments})` : ""}`}
                            data-testid={`button-comments-${inclusion.id}`}
                          >
                            <MessageSquare className="w-[17px] h-[17px]" aria-hidden="true" />
                            {nComments > 0 && (
                              <span
                                aria-hidden="true"
                                className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-white text-[9px] font-bold leading-none tabular-nums"
                                data-testid={`badge-comments-${inclusion.id}`}
                              >
                                {nComments > 9 ? "9+" : nComments}
                              </span>
                            )}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg text-slate-400 hover:bg-brand-soft hover:text-primary transition-colors"
                        onClick={() => onRowClick(inclusion)}
                        title="Abrir detalhes"
                        aria-label={`Abrir detalhes de ${idLabel}`}
                        data-testid={`button-open-${inclusion.id}`}
                      >
                        <ChevronRight className="w-[18px] h-[18px]" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 h-10 px-4 bg-background border-t border-border">
        <span className="text-[12px] text-[#475569] tabular-nums whitespace-nowrap">
          Mostrando {visibleRows.length} de {rows.length} · ordenado por {ordemLabel}
        </span>
        {rows.length > visibleCount && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="h-[26px] px-2.5 rounded-[7px] border border-border bg-card text-[12px] font-medium text-primary hover:border-primary hover:bg-brand-soft whitespace-nowrap"
              data-testid="button-load-more-rows"
            >
              Mostrar mais {Math.min(PAGE_SIZE, rows.length - visibleCount)}
            </button>
            <button
              type="button"
              onClick={() => setVisibleCount(rows.length)}
              className="h-[26px] px-2 rounded-[7px] text-[12px] font-medium text-muted-foreground hover:text-primary whitespace-nowrap"
              data-testid="button-load-all-rows"
            >
              Mostrar todas
            </button>
          </span>
        )}
        {/* Legenda dos marcadores: a cor da borda só significa alguma coisa se
            estiver escrito em algum lugar o que ela quer dizer. */}
        <span className="flex items-center gap-3 ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-[#FBBF24]" />espera você
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-[#A855F7]" />troca em análise
          </span>
        </span>
      </div>
    </div>
  );
}
