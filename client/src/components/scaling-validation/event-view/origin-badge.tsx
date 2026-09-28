/**
 * Badge da coluna Origem/Status do Histórico (25/09 — extraído da página):
 * sugestão (SUGESTAO_STATUS_LABELS), "Em Inclusão de Equipe" ou "Excluída em dd/mm".
 */
import { isSuggestionInclusion } from "@shared/scaling-validation-rules";
import { formatDayMonthBr } from "@/lib/dates";
import { StatusBadge } from "@/components/common/status-badge";
import { SuggestionStatusBadge } from "@/components/scaling-validation/suggestions-list";
import { ORIGIN_LABEL_EXCLUIDA, ORIGIN_LABEL_INCLUSAO, isDeleted, toDate, type EventViewRow } from "./event-view-shared";

export function OriginBadge({ row }: { row: EventViewRow }) {
  if (isDeleted(row)) {
    // Só a palavra fica riscada: a data "em dd/mm" é informação viva (quando foi
    // excluída) e riscada parecia um erro de digitação.
    // Excluída = neutral (23/09): é registro encerrado, não erro — vermelho
    // aqui competia com as vagas negadas.
    return (
      <StatusBadge tone="neutral">
        <span className="line-through">{ORIGIN_LABEL_EXCLUIDA}</span>&nbsp;em {formatDayMonthBr(toDate(row.deletedAt))}
      </StatusBadge>
    );
  }
  if (isSuggestionInclusion(row)) return <SuggestionStatusBadge status={row.status} />;
  return <StatusBadge tone="primary">{ORIGIN_LABEL_INCLUSAO}</StatusBadge>;
}
