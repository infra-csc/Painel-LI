/**
 * Uma vaga na lista (25/09 — extraído de suggestions-list.tsx): as ações da
 * linha/do card, os blocos compartilhados (nome, observação) e a linha da
 * tabela memoizada.
 */
import { memo } from "react";
import { CheckCheck, ChevronRight, PencilLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const ICON_BTN = "inline-flex items-center justify-center w-7 h-7 rounded-lg border bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Ações da vaga na própria linha (mockup): validar em destaque, pedir ajuste e
 * pedir exclusão como ícones, detalhe no fim. Quais aparecem sai de
 * `canValidate`/`canRequestChange` (availableSuggestionActions); travada mostra
 * o motivo — nunca `title` em elemento desabilitado.
 *
 * Na tabela (04/09) cada botão tem um LUGAR reservado: quando a ação não
 * existe, entra um espaço invisível do mesmo tamanho, e a coluna "Ações" sai
 * alinhada de cima a baixo — antes o botão "Ver detalhe" pulava para a
 * esquerda nas linhas sem "Validar". Nos cards (`compact`) não há coluna a
 * alinhar, então os espaços não entram.
 *
 * Os ícones usam `title` + `aria-label` em vez de Tooltip (04/09): três
 * tooltips Radix por linha eram ~600 nós a mais numa lista de 200 vagas, para
 * dizer o mesmo que o `title` nativo diz.
 */
export function RowActions({ row, onValidate, onAdjust, onDelete, onOpenDetail, compact }: SuggestionRowActions & {
  row: SuggestionRow; onOpenDetail?: (row: SuggestionRow) => void; compact?: boolean;
}) {
  const mayValidate = onValidate && canValidate(row);
  const mayRequest = canRequestChange(row);
  // A coluna Status já diz "Com pedido de exclusão" e "Validada — aguardando
  // aprovação". Repetir o mesmo motivo aqui em texto fazia a linha dizer três
  // vezes a mesma coisa: aqui fica só o que o Status NÃO conta (a função não é
  // sua). O cadeado da primeira coluna continua explicando no tooltip.
  const lock = mayValidate || mayRequest ? null : lockReason(row);
  const reason = lock && !row.pendingRequest && row.status !== SUGESTAO_STATUS.VALIDADA ? lock : null;
  /** Espaço do tamanho do botão ausente (só na tabela). */
  const vazio = (w: string) => (compact ? null : <span className={cn("inline-block h-7", w)} aria-hidden="true" />);
  const n = row.inclusionNumber;
  return (
    <div className={cn("inline-flex items-center gap-1.5", compact && "flex-wrap")}>
      {reason && <span className="mr-1 text-2xs text-muted-foreground">{reason}</span>}
      {mayValidate ? (
        <Button type="button" size="sm" onClick={() => onValidate!(row)}
          className="h-7 w-[76px] rounded-lg bg-success px-2 text-xs font-semibold text-white hover:bg-success/90">
          <CheckCheck className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Validar
        </Button>
      ) : vazio("w-[76px]")}
      {mayRequest && onAdjust ? (
        <button type="button" onClick={() => onAdjust(row)} aria-label={`Pedir ajuste da vaga #${n}`} title="Pedir ajuste"
          className={cn(ICON_BTN, "border-border text-slate-600 hover:border-primary/30 hover:text-primary")}>
          <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ) : vazio("w-7")}
      {mayRequest && onDelete ? (
        <button type="button" onClick={() => onDelete(row)} aria-label={`Pedir exclusão da vaga #${n}`} title="Pedir exclusão"
          className={cn(ICON_BTN, "border-danger/25 text-danger hover:bg-danger-soft")}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ) : vazio("w-7")}
      {onOpenDetail && (
        <button type="button" onClick={() => onOpenDetail(row)} aria-label={`Ver detalhe da vaga #${n}`} title="Ver detalhe"
          className={cn(ICON_BTN, "border-border text-slate-600 hover:border-primary/30 hover:text-primary")}>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
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
      className="block max-w-full break-words text-left text-sm font-semibold hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
      {name}
    </button>
  ) : (
    <span className="block break-words text-sm font-semibold" title={name}>{name}</span>
  );
}

/**
 * "Área · observação" — a segunda linha do bloco "Vaga" (04/09): a área vira um
 * chip neutro (é um rótulo, não uma frase) e a observação ganha duas linhas
 * antes de cortar — numa linha só, "Levar rádio e colete; chegar às 6h para a
 * montagem" virava "Levar rádio e col…", e o corte comia justamente a instrução.
 */
export function AreaLine({ row }: { row: SuggestionRow }) {
  const obs = row.observations?.trim();
  return (
    <span className="flex items-start gap-1.5 min-w-0">
      {/* Área saiu da tela (dono, 11/09) — a função basta. */}
      {obs ? <span className="line-clamp-2 text-2xs leading-4 text-muted-foreground" title={obs}>{obs}</span> : <span className="text-2xs leading-4 text-muted-foreground">Sem observações</span>}
    </span>
  );
}

/** Pulso da linha que acabou de receber um pedido — sem animação para quem pediu menos movimento. */
export const PULSE = "animate-pulse motion-reduce:animate-none motion-reduce:animate-none ring-2 ring-inset ring-primary/40";

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
 */
export const SuggestionTableRow = memo(function SuggestionTableRow({
  row, name, zebra, selectable, selected, showSelection, highlighted, approverNames,
  onToggle, onOpenDetail, onValidate, onAdjust, onDelete,
}: TableRowProps) {
  const reason = selectable ? null : lockReason(row);
  const open = onOpenDetail ? () => onOpenDetail(row) : undefined;
  return (
    <tr data-testid={`suggestion-row-${row.inclusionNumber}`}
      className={cn("border-b border-border transition-colors", selected ? "bg-brand-soft/50" : zebra ? "bg-surface-muted/40" : "bg-card",
        row.canEdit ? "text-foreground" : "text-slate-600", highlighted && PULSE)}>
      {/* Filete na altura toda da linha (absoluto dentro da célula): com 36px
          fixos ele parecia um traço solto nas linhas de duas ou três alturas. */}
      <td className="relative w-9 p-0">
        <span className={cn("absolute inset-y-1.5 left-2 w-1 rounded-full", railClass(row.status))} aria-hidden="true" />
      </td>
      {showSelection && (
        <td className="px-1 py-2 text-center">
          {selectable ? (
            <Checkbox checked={selected} onCheckedChange={() => onToggle(row.id)} aria-label={`Selecionar vaga #${row.inclusionNumber}`} />
          ) : (
            <LockedHint reason={reason ?? "Sem ações disponíveis"} />
          )}
        </td>
      )}
      {/* `align-top` nas duas: o chip "#" fica na linha do NOME, não flutuando
          no meio de um bloco de três linhas. */}
      <td className="px-3 py-2.5 align-top"><IdChip row={row} onClick={open} /></td>
      <td className="px-3 py-2 align-top max-w-[300px]">
        <div className="min-w-0 space-y-0.5">
          <NameButton name={name} onOpen={open} />
          <AreaLine row={row} />
          {/* Abaixo de 2xl o período mora aqui, como 3ª linha do bloco "Vaga" —
              a coluna própria só existe quando a tabela cabe inteira. */}
          <span className="block text-xs 2xl:hidden"><PeriodCell row={row} /></span>
        </div>
      </td>
      <td className="hidden px-3 py-2 text-xs whitespace-nowrap 2xl:table-cell"><PeriodCell row={row} /></td>
      <td className="px-3 py-2"><LogisticsChips row={row} responsive /></td>
      <td className="px-3 py-2 min-w-[220px]"><StatusCell row={row} approverNames={approverNames} /></td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <RowActions row={row} onValidate={onValidate} onAdjust={onAdjust} onDelete={onDelete} onOpenDetail={onOpenDetail} />
      </td>
    </tr>
  );
});
