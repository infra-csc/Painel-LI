/**
 * Linha memoizada da tabela de inclusões (25/09 — extraída da tabela).
 * Props PRIMITIVAS (23/09): só a linha cujo dado mudou re-renderiza (marcar um
 * checkbox não repinta as outras 4.499). O `ref` é o medidor da virtualização
 * (altura real da linha); `data-index` é lido por ele.
 *
 * 07/10 (redesenho, família Passagens/Hospedagem): nº como etiqueta da marca
 * com o "copiar" discreto ao lado; evento e local numa linha cada (antes
 * quebravam em quatro e a linha tinha 97px); "Passagem"/"Hospedagem" viram
 * etiquetas em "Precisa de" (antes dois ✓/× sem rótulo, e o selo de status
 * largo invadia a coluna vizinha); ações neutras e discretas até a linha ser
 * apontada, com o vermelho/âmbar só no hover de quem destrói. Cada célula tem
 * `data-col`/`data-rotulo`: abaixo da largura da tabela a MESMA linha vira
 * cartão por CSS (`.inc-cartao` no index.css), sem re-renderizar nada.
 */
import { memo, forwardRef } from "react";
import { Ban, BedDouble, Copy, Lock, MapPin, MessageCircle, Pencil, Plane, Trash2, ArrowLeftRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, StatusPorChaveBadge } from "@/components/common/status-badge";
import { PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";

export interface InclusionRowProps {
  index: number;
  id: string;
  inclusionNumber: number | null;
  eventName: string;
  eventLocation: string;
  functionName: string;
  /** Nome já em Title Case; `null` = vaga sem colaborador. */
  collaboratorName: string | null;
  /** Empresa da empreita quando a vaga não tem colaborador; `null` = não é empreita. */
  empreitaEmpresa: string | null;
  empreitaTitulo: string;
  displayStatus: string;
  isCanceled: boolean;
  periodo: string;
  diarias: string;
  needsTicket: boolean;
  needsAccommodation: boolean;
  selected: boolean;
  locked: boolean;
  lockReason: string | null;
  canEditScreen: boolean;
  readOnly: boolean;
  canDelete: boolean;
  canCancel: boolean;
  cancelByRole: boolean;
  swapApproved: boolean;
  onToggleSelect: (id: string) => void;
  onCopyId: (text: string) => void;
  onComments: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
}

/** "Precisa de": etiqueta com ícone e rótulo — o ✓/× antigo não dizia de quê. */
function Precisa({ on, icone: Icone, rotulo, sim }: { on: boolean; icone: typeof Plane; rotulo: string; sim: string }) {
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-1 h-[22px] px-1.5 rounded-md border border-border bg-card text-2xs font-medium text-slate-700" title={sim}>
      <Icone className="w-3 h-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      {/* Tabela estreita: só o ícone (o rótulo continua para o leitor de tela). */}
      <span className="inc-precisa-rotulo">{rotulo}</span>
    </span>
  );
}

const ACAO = "inc-acao pas-alvo inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const InclusionRow = memo(forwardRef<HTMLTableRowElement, InclusionRowProps>(function InclusionRow({
  index, id, inclusionNumber, eventName, eventLocation, functionName, collaboratorName,
  empreitaEmpresa, empreitaTitulo, displayStatus, isCanceled, periodo, diarias,
  needsTicket, needsAccommodation, selected, locked, lockReason, canEditScreen, readOnly,
  canDelete, canCancel, cancelByRole, swapApproved,
  onToggleSelect, onCopyId, onComments, onEdit, onDelete, onCancel,
}, ref) {
  const numero = inclusionNumber ?? '';
  const deleteButton = (
    <button
      type="button"
      onClick={() => onDelete(id)}
      className={`${ACAO} hover:bg-danger-soft hover:text-danger`}
      data-testid={`button-delete-${id}`}
      title="Excluir registro"
      aria-label={`Excluir inclusão #${numero}`}
    >
      <Trash2 className="w-4 h-4" aria-hidden="true" />
    </button>
  );
  const cancelButton = (
    <button
      type="button"
      onClick={() => onCancel(id)}
      className={`${ACAO} hover:bg-warning-soft hover:text-warning`}
      data-testid={`button-cancel-${id}`}
      title="Cancelar escalação"
      aria-label={`Cancelar escalação da inclusão #${numero}`}
    >
      <Ban className="w-4 h-4" aria-hidden="true" />
    </button>
  );
  return (
    <tr
      ref={ref}
      data-index={index}
      aria-rowindex={index + 2}
      className={`inc-linha border-b border-border ${isCanceled ? 'inc-cancelada' : ''} ${selected ? 'inc-marcada' : ''}`}
      data-testid={`row-inclusion-${id}`}
    >
      <td data-col="sel" className="pl-3 pr-1 py-2.5 align-middle">
        {/* Quem só consulta não monta lote: a caixa seria um controle sem saída. */}
        {canEditScreen && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(id)}
            disabled={locked}
            title={lockReason ?? undefined}
            aria-label={`Selecionar inclusão #${numero}`}
            data-testid={`checkbox-row-${id}`}
          />
        )}
      </td>
      <td data-col="id" className="px-1.5 py-2.5 whitespace-nowrap align-middle">
        <div className="flex items-center gap-0.5">
          <span className="inline-flex items-center h-[22px] px-1.5 rounded-md bg-brand-soft font-mono text-2xs font-semibold text-primary tabular-nums">
            #{inclusionNumber || 'N/A'}
          </span>
          <button
            type="button"
            className="inc-acao inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Copiar ID"
            aria-label={`Copiar ID da inclusão #${numero}`}
            onClick={() => onCopyId(inclusionNumber?.toString() || id)}
            data-testid={`button-copy-id-${id}`}
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </td>
      {/* A vaga: a função em cima, o evento e o local embaixo (como na Escalação). */}
      <td data-col="vaga" data-rotulo="Vaga" className="inc-esmaece px-2.5 py-2.5 min-w-0 align-middle">
        <div className="text-sm font-semibold text-foreground leading-snug truncate" title={functionName}>{functionName}</div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground min-w-0" title={eventLocation ? `${eventName} — ${eventLocation}` : eventName}>
          <span className="truncate shrink min-w-0">{eventName}</span>
          {eventLocation && (
            <>
              <MapPin className="inc-local w-3 h-3 shrink-0 ml-1" aria-hidden="true" />
              <span className="inc-local truncate shrink-[2] min-w-0">{eventLocation}</span>
            </>
          )}
        </div>
      </td>
      <td data-col="colab" className="inc-esmaece px-2.5 py-2.5 align-middle">
        {collaboratorName !== null ? (
          <div className="text-sm text-foreground font-medium leading-snug break-words" title={collaboratorName}>
            {collaboratorName}
          </div>
        ) : empreitaEmpresa !== null ? (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-foreground font-medium leading-snug break-words" title={empreitaTitulo}>
            <StatusBadge tone="info" className="uppercase tracking-wide">Empreita</StatusBadge>
            {empreitaEmpresa}
          </div>
        ) : (
          <StatusBadge tone="neutral">Não escalado</StatusBadge>
        )}
      </td>
      <td data-col="periodo" data-rotulo="Período" className="inc-esmaece px-2.5 py-2.5 whitespace-nowrap align-middle">
        <div className="text-sm text-foreground tabular-nums">{periodo}</div>
        <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{diarias}</div>
      </td>
      <td data-col="precisa" data-rotulo="Precisa de" className={`inc-esmaece px-2.5 py-2.5 align-middle ${needsTicket || needsAccommodation ? "" : "inc-precisa-vazio"}`}>
        {needsTicket || needsAccommodation ? (
          <div className="flex flex-wrap gap-1" title={`${needsTicket ? "Precisa" : "Não precisa"} de passagem · ${needsAccommodation ? "precisa" : "não precisa"} de hospedagem`}>
            <Precisa on={needsTicket} icone={Plane} rotulo="Passagem" sim="Precisa de passagem" />
            <Precisa on={needsAccommodation} icone={BedDouble} rotulo="Hospedagem" sim="Precisa de hospedagem" />
          </div>
        ) : (
          <span className="text-sm text-muted-foreground" title="Não precisa de passagem nem de hospedagem">—</span>
        )}
      </td>
      <td data-col="status" className="px-2.5 py-2.5 align-middle">
        <div className="flex flex-col items-start gap-1">
          <StatusPorChaveBadge status={displayStatus} className="!whitespace-normal !rounded-md text-left" />
          {swapApproved && (
            <StatusBadge tone="success" icon={ArrowLeftRight}>Troca aprovada</StatusBadge>
          )}
        </div>
      </td>
      <td data-col="acoes" className="pl-1 pr-2 py-2 whitespace-nowrap text-right align-middle">
        <div className="flex items-center justify-end gap-0.5">
          {/* Para registros cancelados, permitir apenas comentários se não for edição */}
          <button
            type="button"
            onClick={() => onComments(id)}
            className={`${ACAO} hover:bg-brand-soft hover:text-primary`}
            title="Comentários"
            aria-label={`Ver comentários da inclusão #${numero}`}
            data-testid={`button-comments-${id}`}
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
          </button>
          {canEditScreen && locked && (
            <span
              className="inline-flex items-center justify-center h-8 w-8 text-warning-strong shrink-0"
              title={lockReason ?? PAST_EVENT_BLOCK_MSG}
              aria-label={lockReason ?? PAST_EVENT_BLOCK_MSG}
              data-testid={`lock-past-event-${id}`}
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
            </span>
          )}
          {canEditScreen && !locked && (
            readOnly ? (
              // Para cancelados ou comprados, só mostrar botão de excluir se permitido.
              // Compras e Produção podem cancelar mesmo após compra de passagem/hospedagem.
              <>
                {canDelete && deleteButton}
                {canCancel && cancelByRole && cancelButton}
              </>
            ) : (
              // Para status editáveis, mostrar botões de editar, excluir e cancelar
              <>
                <button
                  type="button"
                  onClick={() => onEdit(id)}
                  className={`${ACAO} hover:bg-brand-soft hover:text-primary`}
                  data-testid={`button-edit-${id}`}
                  title="Editar inclusão"
                  aria-label={`Editar inclusão #${numero}`}
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </button>
                {canDelete && deleteButton}
                {canCancel && cancelButton}
              </>
            )
          )}
        </div>
      </td>
    </tr>
  );
}));
