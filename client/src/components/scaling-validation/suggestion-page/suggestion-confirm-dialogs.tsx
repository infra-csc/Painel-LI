/**
 * Confirmações da Sugestão de escala (25/09 — extraídas da página):
 * substituir funções (colagem/cópia), dias fora do período, encolher período,
 * remover linha, enviar, cancelar envio e limpar grade.
 */
import type { Event } from "@shared/schema";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateRange } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import { PERIOD_MARGIN_DAYS } from "@/components/scaling-validation/scaling-grid-utils";
import { plural } from "./suggestion-shared";
import type { SuggestionDraft } from "./use-suggestion-draft";
import type { SuggestionGridEdit } from "./use-suggestion-grid-edit";
import type { SuggestionPaste } from "./use-suggestion-paste";
import type { SuggestionSend } from "./use-suggestion-send";

export interface SuggestionConfirmDialogsProps {
  draft: SuggestionDraft;
  edit: SuggestionGridEdit;
  paste: SuggestionPaste;
  send: SuggestionSend;
  selectedEvent: Event | undefined;
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  onClearGrid: () => void;
}

export function SuggestionConfirmDialogs({ draft, edit, paste, send, selectedEvent, confirmClear, setConfirmClear, onClearGrid }: SuggestionConfirmDialogsProps) {
  const { applied, pendingPeriod, cancelPendingPeriod, applyPeriod } = draft;
  const { confirmRemove, setConfirmRemove, rowToRemove, removeRowNow } = edit;
  const { pendingPaste, setPendingPaste, commitPaste, pendingCopy, setPendingCopy, commitCopy, pendingPasteDates, setPendingPasteDates, acceptPasteExpansion, rejectPasteExpansion } = paste;
  const { confirmSend, setConfirmSend, busy, sendMutation, records, pendencias, confirmCancelSend, setConfirmCancelSend, cancelSendMutation, sentSummary } = send;
  return (
    <>
      {/* Colagem: substituir funções já na grade */}
      <ConfirmDialog
        open={!!pendingPaste}
        onOpenChange={(o) => { if (!o) setPendingPaste(null); }}
        title={`Substituir ${pendingPaste?.conflicts.length} ${pendingPaste?.conflicts.length === 1 ? "função" : "funções"} já na grade?`}
        cancelLabel="Voltar"
        confirmLabel="Substituir"
        onConfirm={() => pendingPaste && commitPaste(pendingPaste.rows, pendingPaste.skippedNames, pendingPaste.conflicts.length)}
      >
        <p>
          As linhas de <strong>{pendingPaste?.conflicts.join(", ")}</strong> serão substituídas pelas coladas (quantidades e dados de viagem). As demais linhas da grade ficam como estão.
        </p>
      </ConfirmDialog>

      {/* Copiar de evento: substituir funções já na grade (mesma confirmação da colagem) */}
      <ConfirmDialog
        open={!!pendingCopy}
        onOpenChange={(o) => { if (!o) setPendingCopy(null); }}
        title={`Substituir ${pendingCopy?.conflicts.length} ${pendingCopy?.conflicts.length === 1 ? "função" : "funções"} já na grade?`}
        cancelLabel="Voltar"
        confirmLabel="Substituir"
        onConfirm={() => pendingCopy && commitCopy(pendingCopy.result, pendingCopy.sourceName, pendingCopy.conflicts.length)}
      >
        <p>
          As linhas de <strong>{pendingCopy?.conflicts.join(", ")}</strong> serão substituídas pelas de <strong>{pendingCopy?.sourceName}</strong> (quantidades e dados de viagem)
          — inclusive quando a cópia trouxer a função sem quantidade no período atual. As demais linhas da grade ficam como estão.
        </p>
      </ConfirmDialog>

      {/* Colagem: a planilha tem dias fora do período da grade.
          Três saídas nomeadas pela CONSEQUÊNCIA — antes o "Cancelar" (que o Esc
          também disparava) colava assim mesmo, ignorando dias em silêncio.
          Agora: Voltar (e Esc) não fazem nada; as duas ações são explícitas. */}
      <AlertDialog open={!!pendingPasteDates} onOpenChange={(o) => { if (!o) setPendingPasteDates(null); }}>
        <AlertDialogContent className="rounded-xl w-[calc(100%-2rem)] sm:w-full">
          <AlertDialogHeader>
            <AlertDialogTitle>
              A planilha tem {plural(pendingPasteDates?.dates.length ?? 0, "dia", "dias")} fora do período da grade
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {pendingPasteDates && (
                  <p>
                    A grade cobre {formatDateRange(applied.start, applied.end)} e a planilha traz quantidades em{" "}
                    <strong>{pendingPasteDates.dates.map((d) => formatDayMonthBr(d)).join(", ")}</strong>.{" "}
                    {pendingPasteDates.expansion.changed ? (
                      <>Dá para ampliar o período para {formatDateRange(pendingPasteDates.expansion.start, pendingPasteDates.expansion.end)} e colar tudo.{" "}
                        {pendingPasteDates.expansion.ignored.length > 0 && (
                          <>Mesmo assim, {pendingPasteDates.expansion.ignored.map((d) => formatDayMonthBr(d)).join(", ")} continuam de fora
                            (a grade só vai até {PERIOD_MARGIN_DAYS} dias antes/depois do evento).{" "}</>
                        )}
                      </>
                    ) : (
                      <>Não dá para ampliar a grade até esses dias (limite de {PERIOD_MARGIN_DAYS} dias antes/depois do evento).{" "}</>
                    )}
                    Colando só os dias da grade, as quantidades desses dias são descartadas.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel className="rounded-lg sm:mr-auto">Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); rejectPasteExpansion(); }}
              className="rounded-lg border border-border bg-card text-slate-700 hover:bg-surface-muted"
            >
              Colar só os dias da grade
            </AlertDialogAction>
            {pendingPasteDates?.expansion.changed && (
              <AlertDialogAction onClick={(e) => { e.preventDefault(); acceptPasteExpansion(); }} className="rounded-lg bg-primary hover:bg-primary-hover">
                Ampliar o período e colar tudo
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Encolher período com quantidades fora */}
      <ConfirmDialog
        open={!!pendingPeriod}
        onOpenChange={(o) => { if (!o) cancelPendingPeriod(); }}
        title="Descartar quantidades fora do novo período?"
        cancelLabel="Manter período"
        onCancel={cancelPendingPeriod}
        confirmLabel="Descartar e aplicar"
        tone="danger"
        onConfirm={() => pendingPeriod && applyPeriod(pendingPeriod.start, pendingPeriod.end)}
      >
        {pendingPeriod && (
          <p>
            <strong>{pendingPeriod.pessoasDia} pessoas-dia</strong> em <strong>{pendingPeriod.dias} {pendingPeriod.dias === 1 ? "dia" : "dias"}</strong> fora do novo período
            ({formatDateRange(pendingPeriod.start, pendingPeriod.end)}) serão descartados. As demais quantidades continuam na grade.
          </p>
        )}
      </ConfirmDialog>

      {/* Remover linha com quantidades */}
      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}
        title={`Remover a linha ${rowToRemove?.functionName}?`}
        confirmLabel="Remover"
        tone="danger"
        onConfirm={() => confirmRemove && removeRowNow(confirmRemove)}
      >
        <p>Ela tem quantidades preenchidas — serão descartadas junto com os dados de viagem da linha.</p>
      </ConfirmDialog>

      {/* Enviar */}
      <ConfirmDialog
        open={confirmSend}
        onOpenChange={(o) => { if (!o) setConfirmSend(false); }}
        title="Enviar escala para validação?"
        cancelLabel="Voltar"
        confirmLabel={busy ? "Enviando…" : "Enviar"}
        pending={busy}
        onConfirm={() => sendMutation.mutate()}
      >
        <p>
          {records.length === 1 ? "Será criada " : "Serão criadas "}<strong>{plural(records.length, "vaga sugerida", "vagas sugeridas")}</strong> para <strong>{selectedEvent?.name}</strong> e as áreas responsáveis passam a vê-las na Validação de Escala. A operação é única: ou todas entram, ou nenhuma.
          {pendencias.warnings.length > 0 && <> Há {plural(pendencias.warnings.length, "aviso", "avisos")} na grade (passagem sem datas) — o envio segue mesmo assim.</>}
        </p>
      </ConfirmDialog>

      {/* Cancelar envio (remove TUDO que está na Validação) */}
      <ConfirmDialog
        open={confirmCancelSend}
        onOpenChange={(o) => { if (!o) setConfirmCancelSend(false); }}
        title={`Cancelar o envio e remover ${sentSummary.total} ${sentSummary.total === 1 ? "vaga" : "vagas"} de ${selectedEvent?.name}?`}
        cancelLabel="Voltar"
        confirmLabel={cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio e remover"}
        tone="danger"
        pending={cancelSendMutation.isPending}
        onConfirm={() => cancelSendMutation.mutate()}
        confirmTestId="scaling-suggestion-cancel-send-confirm"
      >
        <p>
          Serão removidas <strong>todas as {sentSummary.total} {sentSummary.total === 1 ? "vaga" : "vagas"}</strong> deste evento que estão na Validação de Escala —
          {" "}<strong>inclusive as {sentSummary.validadas} que a área já validou</strong> e as {sentSummary.comPedido} com pedido em aberto,
          cujos pedidos pendentes são encerrados na fila do aprovador.
        </p>
        <p>
          As vagas já <strong>aprovadas</strong> (que viraram Inclusão de Equipe) e as já negadas <strong>não</strong> são afetadas.
          As áreas deixam de ver as vagas removidas na hora. Não há como desfazer — para voltar, monte a grade e envie de novo.
        </p>
      </ConfirmDialog>

      {/* Limpar */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={(o) => { if (!o) setConfirmClear(false); }}
        title="Limpar a grade?"
        confirmLabel="Limpar"
        tone="danger"
        onConfirm={onClearGrid}
      >
        <p>Todas as linhas, os comentários gerais editados e o rascunho local deste evento serão descartados. Nada é apagado no servidor.</p>
      </ConfirmDialog>
    </>
  );
}
