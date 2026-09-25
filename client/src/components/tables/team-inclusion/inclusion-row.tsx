/**
 * Linha memoizada da tabela de inclusões (25/09 — extraída da tabela).
 * Props PRIMITIVAS (23/09): só a linha cujo dado mudou re-renderiza (marcar um
 * checkbox não repinta as outras 4.499). O `ref` é o medidor da virtualização
 * (altura real da linha); `data-index` é lido por ele.
 */
import { memo, forwardRef } from "react";
import { Edit, MessageCircle, Check, X, Trash2, Copy, Ban, ArrowLeftRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function NeedIcon({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return on ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success-soft" title={yes}>
      <Check className="w-3 h-3 text-success shrink-0" aria-hidden="true" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted" title={no}>
      <X className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
    </span>
  );
}

export const InclusionRow = memo(forwardRef<HTMLTableRowElement, InclusionRowProps>(function InclusionRow({
  index, id, inclusionNumber, eventName, eventLocation, functionName, collaboratorName,
  empreitaEmpresa, empreitaTitulo, displayStatus, isCanceled, periodo, diarias,
  needsTicket, needsAccommodation, selected, locked, lockReason, canEditScreen, readOnly,
  canDelete, canCancel, cancelByRole, swapApproved,
  onToggleSelect, onCopyId, onComments, onEdit, onDelete, onCancel,
}, ref) {
  const numero = inclusionNumber ?? '';
  const deleteButton = (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => onDelete(id)}
      className="text-danger hover:text-danger h-8 w-8 p-0 shrink-0"
      data-testid={`button-delete-${id}`}
      title="Excluir registro"
      aria-label={`Excluir inclusão #${numero}`}
    >
      <Trash2 className="w-4 h-4" aria-hidden="true" />
    </Button>
  );
  const cancelButton = (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => onCancel(id)}
      className="text-warning hover:text-warning h-8 w-8 p-0 shrink-0"
      data-testid={`button-cancel-${id}`}
      title="Cancelar Escalação"
      aria-label={`Cancelar escalação da inclusão #${numero}`}
    >
      <Ban className="w-4 h-4" aria-hidden="true" />
    </Button>
  );
  return (
    <tr
      ref={ref}
      data-index={index}
      aria-rowindex={index + 2}
      className={`border-b border-border transition-colors ${isCanceled ? 'opacity-40' : ''} ${index % 2 === 1 ? 'bg-surface-muted/40' : 'bg-card'} hover:bg-brand-soft/40`}
      data-testid={`row-inclusion-${id}`}
    >
      <td className="px-2 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(id)}
          disabled={locked}
          title={lockReason ?? undefined}
          aria-label={`Selecionar inclusão #${numero}`}
          data-testid={`checkbox-row-${id}`}
        />
      </td>
      <td className="px-2 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <div className="text-sm font-mono text-foreground font-medium truncate">
            #{inclusionNumber || 'N/A'}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="p-1 h-7 w-7 flex-shrink-0"
            title="Copiar ID"
            aria-label={`Copiar ID da inclusão #${numero}`}
            onClick={() => onCopyId(inclusionNumber?.toString() || id)}
            data-testid={`button-copy-id-${id}`}
          >
            <Copy className="w-3 h-3" aria-hidden="true" />
          </Button>
        </div>
      </td>
      <td className="px-2 py-3">
        <div className="text-sm font-medium text-foreground whitespace-normal break-words">
          {eventName}
        </div>
        <div className="text-xs text-muted-foreground">
          {eventLocation}
        </div>
      </td>
      <td className="px-2 py-3 whitespace-nowrap">
        <div className="text-sm text-slate-700 truncate">
          {functionName}
        </div>
      </td>
      <td className="px-2 py-3">
        {collaboratorName !== null ? (
          <div
            className="text-sm text-foreground font-medium whitespace-normal break-words leading-snug"
            title={collaboratorName}
          >
            {collaboratorName}
          </div>
        ) : empreitaEmpresa !== null ? (
          <div className="text-sm text-foreground font-medium whitespace-normal break-words leading-snug" title={empreitaTitulo}>
            <StatusBadge tone="info" className="mr-1.5 uppercase tracking-wide">Empreita</StatusBadge>
            {empreitaEmpresa}
          </div>
        ) : (
          <StatusBadge tone="neutral">Não escalado</StatusBadge>
        )}
      </td>
      <td className="px-2 py-3 whitespace-nowrap">
        <div className="text-xs text-foreground">{periodo}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{diarias}</div>
      </td>
      <td className="px-2 py-3">
        <StatusPorChaveBadge status={displayStatus} />
        {swapApproved && (
          <StatusBadge tone="success" icon={ArrowLeftRight} className="mt-1">Troca aprovada</StatusBadge>
        )}
      </td>
      <td className="px-2 py-3 text-center">
        <NeedIcon on={needsTicket} yes="Precisa de passagem" no="Não precisa de passagem" />
      </td>
      <td className="px-2 py-3 text-center">
        <NeedIcon on={needsAccommodation} yes="Precisa de hospedagem" no="Não precisa de hospedagem" />
      </td>
      <td className="w-[100px] whitespace-nowrap pl-4 pr-2 py-3 text-right text-sm font-medium">
        <div className={`flex items-center justify-end gap-1 ${isCanceled ? 'opacity-50' : ''} [&>button]:hover:scale-110 [&>button]:transition-transform`}>
          {/* Para registros cancelados, permitir apenas comentários se não for edição */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onComments(id)}
            className="text-primary hover:text-primary-hover h-8 w-8 p-0 shrink-0"
            title="Comentários"
            aria-label={`Ver comentários da inclusão #${numero}`}
            data-testid={`button-comments-${id}`}
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
          </Button>
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit(id)}
                  className="text-success hover:text-success h-8 w-8 p-0 shrink-0"
                  data-testid={`button-edit-${id}`}
                  title="Editar inclusão"
                  aria-label={`Editar inclusão #${numero}`}
                >
                  <Edit className="w-4 h-4" aria-hidden="true" />
                </Button>
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
