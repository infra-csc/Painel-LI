/**
 * Uma vaga na lista (25/09 — extraído de suggestions-list.tsx): as ações da
 * linha/do card, os blocos compartilhados (nome, observação) e a linha da
 * tabela memoizada.
 *
 * 07/10 (redesenho): a linha lê como a da Escalação — nome em cima, "#número ·
 * observação" embaixo, período em coluna própria, situação com o motivo da
 * trava logo abaixo da pílula e as ações discretas à direita. "Validar" deixou
 * de ser um botão verde cheio repetido em cada linha (vinte botões fortes
 * competindo) e virou o contorno verde que a Escalação usa no "Confirmar".
 */
import { memo } from "react";
import { CheckCheck, ChevronRight, PencilLine, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { canRequestChange, canValidate, lockReason, type SuggestionRow } from "../types";
import { railClass, StatusCell } from "./suggestion-badges";
import { IdChip, LockedHint, LogisticsChips, PeriodCell } from "./suggestion-cells";

/** Ações por vaga (uma linha da tabela / um card). */
export interface SuggestionRowActions {
  onValidate?: (row: SuggestionRow) => void;
  onAdjust?: (row: SuggestionRow) => void;
  onDelete?: (row: SuggestionRow) => void;
}

/** Botão-ícone da linha: sem borda até o hover, para a coluna não virar uma grade de caixinhas. */
const ICON_BTN = "val-alvo inline-flex h-8 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** "Validar" da linha — o contorno verde do "Confirmar" da Escalação; cheio só no hover. */
export const VALIDAR_BTN = "val-alvo inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-success/35 bg-success-soft px-2.5 text-xs font-semibold text-success transition-colors hover:border-success hover:bg-success hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/**
 * Por que a vaga não aceita ação — só o que a coluna Situação NÃO conta (a
 * função não é sua). "Com pedido…" e "Validada…" já estão na pílula; repetir
 * o motivo aqui fazia a linha dizer três vezes a mesma coisa.
 */
export function motivoDaTrava(row: SuggestionRow, podeAgir: boolean): string | null {
  if (podeAgir) return null;
  const lock = lockReason(row);
  return lock && !row.pendingRequest && row.status !== SUGESTAO_STATUS.VALIDADA ? lock : null;
}

/**
 * Ações da vaga na própria linha: validar em destaque, pedir ajuste e pedir
 * exclusão como ícones, detalhe no fim. Quais aparecem sai de
 * `canValidate`/`canRequestChange` (availableSuggestionActions); travada mostra
 * o motivo — nunca `title` em elemento desabilitado.
 *
 * Na tabela (04/09) cada botão tem um LUGAR reservado: quando a ação não
 * existe, entra um espaço invisível do mesmo tamanho, e a coluna "Ações" sai
 * alinhada de cima a baixo. Nos cards (`compact`) não há coluna a alinhar.
 *
 * Os ícones usam `title` + `aria-label` em vez de Tooltip (04/09): três
 * tooltips Radix por linha eram ~600 nós a mais numa lista de 200 vagas.
 *
 * `semMotivo` (07/10): na tabela o motivo da trava mora na coluna Situação,
 * embaixo da pílula — aqui ele empurrava os botões para o meio da linha.
 */
export function RowActions({ row, onValidate, onAdjust, onDelete, onOpenDetail, compact, semMotivo }: SuggestionRowActions & {
  row: SuggestionRow; onOpenDetail?: (row: SuggestionRow) => void; compact?: boolean; semMotivo?: boolean;
}) {
  const mayValidate = onValidate && canValidate(row);
  const mayRequest = canRequestChange(row);
  const reason = semMotivo ? null : motivoDaTrava(row, !!(mayValidate || mayRequest));
  /** Espaço do tamanho do botão ausente (só na tabela). */
  const vazio = (w: string) => (compact ? null : <span className={cn("inline-block h-8", w)} aria-hidden="true" />);
  const n = row.inclusionNumber;
  return (
    <div className={cn("inline-flex items-center gap-0.5", compact && "flex-wrap justify-end gap-1")}>
      {reason && <span className="mr-auto pr-2 text-2xs text-muted-foreground">{reason}</span>}
      {mayValidate ? (
        <button type="button" onClick={() => onValidate!(row)} className={cn(VALIDAR_BTN, !compact && "mr-1 w-[80px]")}>
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Validar
        </button>
      ) : vazio("w-[80px] mr-1")}
      {mayRequest && onAdjust ? (
        <button type="button" onClick={() => onAdjust(row)} aria-label={`Pedir ajuste da vaga #${n}`} title="Pedir ajuste"
          className={cn(ICON_BTN, "hover:bg-brand-soft hover:text-primary")}>
          <PencilLine className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : vazio("w-7")}
      {mayRequest && onDelete ? (
        <button type="button" onClick={() => onDelete(row)} aria-label={`Pedir exclusão da vaga #${n}`} title="Pedir exclusão"
          className={cn(ICON_BTN, "hover:bg-danger-soft hover:text-danger")}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : vazio("w-7")}
      {onOpenDetail && (
        <button type="button" onClick={() => onOpenDetail(row)} aria-label={`Ver detalhe da vaga #${n}`} title="Ver detalhe"
          className={cn(ICON_BTN, "val-abrir hover:bg-muted hover:text-foreground")}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Blocos compartilhados entre a linha da tabela e o card ──────────────────

/** Nome da função — botão que abre o detalhe quando a lista permite. */
export function NameButton({ name, onOpen }: { name: string; onOpen?: () => void }) {
  return onOpen ? (
    <button type="button" onClick={onOpen} title={name}
      className="block max-w-full break-words rounded-sm text-left text-sm font-semibold leading-5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {name}
    </button>
  ) : (
    <span className="block break-words text-sm font-semibold leading-5" title={name}>{name}</span>
  );
}

/**
 * "#número · observação" — a segunda linha do bloco "Vaga". A observação ganha
 * duas linhas antes de cortar (04/09) — numa linha só, "Levar rádio e colete;
 * chegar às 6h para a montagem" virava "Levar rádio e col…", e o corte comia
 * justamente a instrução. Área saiu da tela (dono, 11/09) — a função basta.
 * `numero` (07/10): o "#" veio da coluna própria para esta linha.
 */
export function AreaLine({ row, numero }: { row: SuggestionRow; numero?: React.ReactNode }) {
  const obs = row.observations?.trim();
  return (
    <span className="flex min-w-0 items-start gap-1.5 text-2xs leading-4">
      {numero && <>{numero}<span className="text-muted-foreground/60" aria-hidden="true">·</span></>}
      {obs
        ? <span className="line-clamp-2 min-w-0 text-slate-600" title={obs}>{obs}</span>
        : <span className="text-muted-foreground">Sem observações</span>}
    </span>
  );
}

/** Realce da linha que acabou de receber um pedido — some sozinho; parado para quem pediu menos movimento. */
export const PULSE = "val-realce";

interface TableRowProps extends SuggestionRowActions {
  row: SuggestionRow;
  name: string;
  zebra: boolean;
  selectable: boolean;
  selected: boolean;
  showSelection: boolean;
  highlighted: boolean;
  approverNames?: string[];
  onToggle: (id: string) => void;
  onOpenDetail?: (row: SuggestionRow) => void;
}

/**
 * Uma linha da tabela — `memo` (04/09): digitar na busca ou marcar uma vaga
 * re-renderizava a tela inteira, e com ela as 200 linhas. Com props primitivas
 * e callbacks estáveis (a tela usa `useCallback`), só a linha que mudou volta
 * a renderizar.
 *
 * Tudo alinhado pelo TOPO (07/10): nome, período, primeiro chip, pílula e
 * botões começam na mesma altura — com alturas diferentes por célula, o
 * alinhamento ao centro deixava a linha "dançando".
 */
export const SuggestionTableRow = memo(function SuggestionTableRow({
  row, name, selectable, selected, showSelection, highlighted, approverNames,
  onToggle, onOpenDetail, onValidate, onAdjust, onDelete,
}: TableRowProps) {
  const reason = selectable ? null : lockReason(row);
  const open = onOpenDetail ? () => onOpenDetail(row) : undefined;
  const motivo = motivoDaTrava(row, !!((onValidate && canValidate(row)) || canRequestChange(row)));
  return (
    <tr data-testid={`suggestion-row-${row.inclusionNumber}`}
      className={cn("val-linha border-b border-border last:border-b-0 align-top",
        selected ? "bg-brand-soft/50" : "bg-card hover:bg-surface-muted/60",
        row.canEdit ? "text-foreground" : "text-slate-600", highlighted && PULSE)}>
      {/* Filete na altura toda da linha: a situação lida antes do texto. */}
      <td className="relative w-2 p-0">
        <span className={cn("absolute inset-y-2.5 left-0 w-[3px] rounded-r-full", railClass(row.status))} aria-hidden="true" />
      </td>
      {showSelection && (
        <td className="w-10 py-3 pl-2 pr-1 text-center">
          <span className="inline-flex h-5 items-center">
            {selectable ? (
              <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
            ) : (
              <LockedHint reason={reason ?? "Sem ações disponíveis"} />
            )}
          </span>
        </td>
      )}
      <td className="px-3 py-3">
        <div className="min-w-0 space-y-0.5">
          <NameButton name={name} onOpen={open} />
          <AreaLine row={row} numero={<IdChip row={row} onClick={open} />} />
          {/* Abaixo de 2xl o período é a 3ª linha do bloco "Vaga". */}
          <span className="block pt-0.5 text-xs 2xl:hidden"><PeriodCell row={row} /></span>
        </div>
      </td>
      <td className="hidden whitespace-nowrap px-3 py-3 2xl:table-cell"><PeriodCell row={row} stacked /></td>
      <td className="px-3 py-3"><LogisticsChips row={row} responsive /></td>
      <td className="px-3 py-3">
        <StatusCell row={row} approverNames={approverNames} />
        {motivo && <p className="mt-1 text-2xs text-muted-foreground">{motivo}</p>}
      </td>
      <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right">
        <RowActions row={row} onValidate={onValidate} onAdjust={onAdjust} onDelete={onDelete} onOpenDetail={onOpenDetail} semMotivo />
      </td>
    </tr>
  );
});
