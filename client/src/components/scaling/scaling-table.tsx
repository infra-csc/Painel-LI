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
 *
 * Redesenho 07/10 — a lista se ajusta à LARGURA QUE TEM, não à da janela:
 * - larga (≥ 1240px): a grade completa, com a coluna de ID;
 * - compacta (900–1240px, o notebook com a barra lateral aberta): o ID entra
 *   na célula da vaga e as colunas fixas encolhem — a grade de 1.300px rolava
 *   de lado em 1366 e a Situação e as ações ficavam fora da tela;
 * - cartões (< 900px, tablet e celular): uma vaga por cartão, com os mesmos
 *   dados e ações, e a ordenação em botões acima da lista.
 * O cabeçalho da tabela gruda no topo da PÁGINA (abaixo da barra de contexto):
 * uma rolagem só, em vez de a tabela rolar dentro da página que também rola.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TeamInclusion, Ticket, Accommodation } from "@shared/schema";
import type { PendingChangeRequest } from "./use-scaling-data";
import type { NormalizedSwap } from "./scaling-utils";
import { CHECKBOX_CLS, ScalingCardRow, ScalingTableRow } from "./scaling-table-row";

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

export type FormaDaLista = "larga" | "compacta" | "cartoes";

/** Forma pela largura disponível (ver o comentário do topo). */
function formaPara(largura: number): FormaDaLista {
  if (largura < 900) return "cartoes";
  if (largura < 1240) return "compacta";
  return "larga";
}

/**
 * Mede a largura do contêiner e só re-renderiza quando a FORMA muda — não a
 * cada pixel do redimensionamento. O chute inicial vem da janela, para a
 * primeira pintura já sair na forma certa (sem piscar a tabela no celular).
 */
function useFormaDaLista(ref: React.RefObject<HTMLElement>): FormaDaLista {
  const [forma, setForma] = useState<FormaDaLista>(() =>
    typeof window === "undefined" ? "larga" : formaPara(window.innerWidth - (window.innerWidth >= 1024 ? 330 : 32)));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setForma(formaPara(el.getBoundingClientRect().width));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return forma;
}

const ROTULO_DA_ORDEM: Record<string, string> = { id: "ID", function: "função", collaborator: "colaborador", period: "período", status: "situação" };
const ORDENS_DO_CARTAO: { field: SortField; label: string }[] = [
  { field: "id", label: "ID" }, { field: "function", label: "Função" }, { field: "collaborator", label: "Colaborador" },
  { field: "period", label: "Período" }, { field: "status", label: "Situação" },
];

function SetaDaOrdem({ dir }: { dir: "asc" | "desc" | null }) {
  return dir === "asc" ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
    : dir === "desc" ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
    : <ChevronsUpDown className="w-3.5 h-3.5 opacity-45" aria-hidden="true" />;
}

/** Botão de ordenar: o mesmo no cabeçalho da tabela e na faixa dos cartões. */
function BotaoDeOrdem({ field, label, sortConfig, onSort, className = "" }: {
  field: SortField; label: string; sortConfig: SortConfig | null; onSort: (f: SortField) => void; className?: string;
}) {
  const ativo = sortConfig?.field === field;
  const dir = ativo ? sortConfig!.direction : null;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ativo ? "text-primary" : ""} ${className}`}
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      <SetaDaOrdem dir={dir} />
    </button>
  );
}

/** Cabeçalho próprio: 36px, 11px/600, e a seta SEMPRE visível (não depende de hover). */
function Th({ field, label, className = "", sortConfig, onSort, children }: {
  field?: SortField; label: string; className?: string;
  sortConfig: SortConfig | null; onSort: (f: SortField) => void;
  children?: React.ReactNode;
}) {
  const ativo = !!field && sortConfig?.field === field;
  const dir = ativo ? sortConfig!.direction : null;
  return (
    <th
      scope="col"
      aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 text-left text-2xs font-semibold ${ativo ? "text-primary" : "text-muted-foreground"} ${className}`}
      data-testid={field ? `header-${field}` : undefined}
    >
      {children ?? (field ? <BotaoDeOrdem field={field} label={label} sortConfig={sortConfig} onSort={onSort} /> : label)}
    </th>
  );
}

export default function ScalingTable(props: ScalingTableProps) {
  const { rows, sortConfig, onSort, onConfirmarRapido, selectedIds, getSelectBlockReason, onToggleAllVisible, ...resto } = props;
  const caixaRef = useRef<HTMLDivElement>(null);
  const forma = useFormaDaLista(caixaRef);
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

  const ordemLabel = sortConfig ? ROTULO_DA_ORDEM[sortConfig.field] ?? sortConfig.field : "evento e função";
  const rowProps = { ...resto, sortConfig, onSort, onConfirmarRapido, selectedIds, getSelectBlockReason, onToggleAllVisible };
  const larga = forma === "larga";

  const selecionarTodas = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="esc-alvo inline-flex items-center justify-center">
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
  );

  return (
    // `overflow-clip` (não `hidden`): recorta os cantos sem virar contêiner de
    // rolagem — é o que deixa o cabeçalho grudar no topo da página.
    <div ref={caixaRef} className="bg-card rounded-xl border border-border overflow-clip" data-forma={forma} data-testid="lista-escalacao">
      {forma === "cartoes" ? (
        <>
          {/* Faixa de ordenação: no cartão não há cabeçalho de coluna. */}
          <div className="esc-faixa-ordem flex items-center gap-3 border-b border-border bg-surface-muted pl-[15px] pr-3 py-1.5">
            {selecionarTodas}
            <span className="text-2xs font-semibold text-muted-foreground shrink-0">Ordenar</span>
            <div className="esc-rolagem-x flex min-w-0 items-center gap-3.5 text-2xs font-semibold text-slate-600" role="group" aria-label="Ordenar a lista">
              {ORDENS_DO_CARTAO.map(({ field, label }) => (
                <BotaoDeOrdem key={field} field={field} label={label} sortConfig={sortConfig} onSort={onSort} className="esc-alvo whitespace-nowrap" />
              ))}
            </div>
          </div>
          <ul aria-label="Escalação: vagas do evento com colaborador, função, dias e status">
            {visibleRows.map((inclusion) => <ScalingCardRow key={inclusion.id} inclusion={inclusion} p={rowProps} />)}
          </ul>
        </>
      ) : (
        <table className="table-fixed w-full">
          <caption className="sr-only">Escalação: vagas do evento com colaborador, função, dias e status</caption>
          <colgroup>
            <col style={{ width: larga ? "46px" : "40px" }} />
            {larga && <col style={{ width: "76px" }} />}
            <col />
            <col />
            <col style={{ width: larga ? "148px" : "112px" }} />
            <col style={{ width: larga ? "280px" : "196px" }} />
            {/* O "Confirmar" rápido mora na Situação desde 07/10 (no lugar do
                "Falta confirmar"): a coluna de ações tem só os dois ícones. */}
            <col style={{ width: larga ? "196px" : "164px" }} />
            <col style={{ width: "80px" }} />
          </colgroup>
          <thead className="esc-cabecalho sticky z-10 bg-surface-muted shadow-[inset_0_-1px_0_0_var(--border)]">
            <tr className="h-9">
              <th scope="col" className="px-3 text-center">{selecionarTodas}</th>
              {larga && <Th field="id" label="ID" className="!pl-0" sortConfig={sortConfig} onSort={onSort} />}
              {larga ? (
                <Th field="function" label="Função / Evento" sortConfig={sortConfig} onSort={onSort} />
              ) : (
                // Compacta: o ID mora na célula da vaga — as duas ordens continuam aqui.
                <Th field={sortConfig?.field === "id" ? "id" : "function"} label="Vaga" sortConfig={sortConfig} onSort={onSort}>
                  <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
                    <BotaoDeOrdem field="function" label="Função" sortConfig={sortConfig} onSort={onSort} />
                    <span aria-hidden="true" className="h-3 w-px bg-border" />
                    <BotaoDeOrdem field="id" label="ID" sortConfig={sortConfig} onSort={onSort} />
                  </span>
                </Th>
              )}
              <Th field="collaborator" label="Colaborador" sortConfig={sortConfig} onSort={onSort} />
              <Th field="period" label={larga ? "Período / diárias" : "Período"} className="whitespace-nowrap" sortConfig={sortConfig} onSort={onSort} />
              <Th label="Precisa de" sortConfig={sortConfig} onSort={onSort} />
              <Th field="status" label="Situação" sortConfig={sortConfig} onSort={onSort} />
              <th scope="col"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((inclusion) => <ScalingTableRow key={inclusion.id} inclusion={inclusion} p={rowProps} compacta={!larga} />)}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-h-10 px-4 py-2 bg-surface-muted border-t border-border">
        <span className="text-xs text-slate-600 tabular-nums">
          Mostrando <b className="font-semibold text-foreground">{visibleRows.length}</b> de {rows.length} · ordenado por {ordemLabel}
        </span>
        {rows.length > visibleCount && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="esc-alvo h-[26px] px-2.5 rounded-md border border-border bg-card text-xs font-medium text-primary hover:border-primary hover:bg-brand-soft whitespace-nowrap"
              data-testid="button-load-more-rows"
            >
              Mostrar mais {Math.min(PAGE_SIZE, rows.length - visibleCount)}
            </button>
            <button
              type="button"
              onClick={() => setVisibleCount(rows.length)}
              className="esc-alvo h-[26px] px-2 rounded-md text-xs font-medium text-muted-foreground hover:text-primary whitespace-nowrap"
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
