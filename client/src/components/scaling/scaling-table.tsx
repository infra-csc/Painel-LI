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
 *
 * Desde 25/09 as regras das células moram em `scaling-table-cells.tsx` e a
 * linha em `scaling-table-row.tsx`; este arquivo continua o ponto de importação
 * público (tinha 714 linhas).
 */
import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TeamInclusion, Ticket, Accommodation } from "@shared/schema";
import type { PendingChangeRequest } from "./use-scaling-data";
import type { NormalizedSwap } from "./scaling-utils";
import { CHECKBOX_CLS, ScalingTableRow } from "./scaling-table-row";

// O vocabulário de status mora em scaling-status.ts (módulo sem JSX, para a
// fila e as Análises poderem usá-lo). Reexportado aqui porque a tela e o modal
// sempre o importaram deste arquivo.
export { getScalingStatusKey, getScalingStatusLabel, STATUS_META } from "./scaling-status";
export type { ScalingStatusKey } from "./scaling-status";
export { getStatusBadge, shouldShowPendingSwapBadge, detalheDaSituacao, needsDaLinha } from "./scaling-table-cells";

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
  /**
   * Confirmar direto da linha (04/09): a fila "Prontas" listava 121 vagas com
   * nome esperando um clique, e o único caminho era abrir o modal (ou marcar
   * e usar o lote). Mesmo POST /confirm — o servidor decide status/gestor.
   */
  podeConfirmarRapido?: (inclusion: TeamInclusion) => boolean;
  onConfirmarRapido?: (e: React.MouseEvent, inclusion: TeamInclusion) => void;
  /** Linha cuja confirmação está em andamento (botão trava e mostra "Confirmando…"). */
  confirmandoId?: string | null;
  // ── Seleção múltipla (ações em massa) ──
  selectedIds: Set<string>;
  /** Motivo pelo qual a linha NÃO pode ser selecionada (null = pode) */
  getSelectBlockReason: (inclusion: TeamInclusion) => string | null;
  onToggleSelect: (inclusionId: string) => void;
  onToggleAllVisible: (ids: string[], select: boolean) => void;
}

const PAGE_SIZE = 150;

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
      className={`px-3.5 text-left text-2xs font-medium ${ativo ? "text-primary" : "text-muted-foreground"} ${className}`}
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

export default function ScalingTable(props: ScalingTableProps) {
  const { rows, sortConfig, onSort, onConfirmarRapido, selectedIds, getSelectBlockReason, onToggleAllVisible, ...resto } = props;
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

  const rowProps = { ...resto, sortConfig, onSort, onConfirmarRapido, selectedIds, getSelectBlockReason, onToggleAllVisible };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`table-fixed w-full ${onConfirmarRapido ? "min-w-[1300px]" : "min-w-[1180px]"}`}>
          <caption className="sr-only">Escalação: vagas do evento com colaborador, função, dias e status</caption>
          <colgroup>
            <col style={{ width: "44px" }} />
            <col style={{ width: "84px" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "148px" }} />
            <col style={{ width: "250px" }} />
            <col style={{ width: "168px" }} />
            {/* Com o "Confirmar" rápido a coluna de ações precisa de ~200px:
                86px cabia só os dois ícones e o botão invadia o vizinho (04/09). */}
            <col style={{ width: onConfirmarRapido ? "200px" : "86px" }} />
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
                  <TooltipContent side="top" className="text-2xs">
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
            {visibleRows.map((inclusion) => <ScalingTableRow key={inclusion.id} inclusion={inclusion} p={rowProps} />)}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 h-10 px-4 bg-background border-t border-border">
        <span className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
          Mostrando {visibleRows.length} de {rows.length} · ordenado por {ordemLabel}
        </span>
        {rows.length > visibleCount && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="h-[26px] px-2.5 rounded-md border border-border bg-card text-xs font-medium text-primary hover:border-primary hover:bg-brand-soft whitespace-nowrap"
              data-testid="button-load-more-rows"
            >
              Mostrar mais {Math.min(PAGE_SIZE, rows.length - visibleCount)}
            </button>
            <button
              type="button"
              onClick={() => setVisibleCount(rows.length)}
              className="h-[26px] px-2 rounded-md text-xs font-medium text-muted-foreground hover:text-primary whitespace-nowrap"
              data-testid="button-load-all-rows"
            >
              Mostrar todas
            </button>
          </span>
        )}
        {/* Legenda dos marcadores: a cor da borda só significa alguma coisa se
            estiver escrito em algum lugar o que ela quer dizer. */}
        <span className="flex items-center gap-3 ml-auto text-2xs text-muted-foreground whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-warning-strong" />espera você
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[3px] h-[11px] rounded-full bg-info-strong" />troca em análise
          </span>
        </span>
      </div>
    </div>
  );
}
