/**
 * "Validar N vagas?" (25/09 — extraído da página): a lista COMPLETA do lote
 * (agrupada por evento em "Todos os eventos"), a consequência dita antes do
 * clique e a observação opcional para o aprovador.
 */
import { TriangleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OptionalMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { idDoErro } from "@/lib/campo-com-erro";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EventLine, periodLabel } from "@/components/scaling-validation/suggestions-list";
import { VALIDATION_NOTE_MAX, normalizeValidationNote } from "@/components/scaling-validation/validation-note";
import { AFTER_VALIDATE_MSG, eventos, vagas } from "./validation-shared";
import type { ValidationSelection } from "./use-validation-selection";
import type { ValidationActions } from "./use-validation-actions";

export interface ValidateDialogProps {
  sel: ValidationSelection;
  act: ValidationActions;
  eventId: string;
  functionNameById: Map<string, string>;
}

export function ValidateDialog({ sel, act, eventId, functionNameById }: ValidateDialogProps) {
  const { validateIds, validateRows, validateGroups, validateTargetIds } = sel;
  const { confirmValidate, onValidateDialogChange, validationNote, changeNote, validationNoteError, validateMutation } = act;
  /** Números do diálogo de confirmação: o alvo corrente (linha ou lote). */
  const nConfirm = validateIds.length;
  return (
    <ConfirmDialog
      open={confirmValidate}
      onOpenChange={onValidateDialogChange}
      title={`Validar ${vagas(nConfirm)}?`}
      cancelLabel="Voltar"
      // O botão declara a consequência — o mesmo padrão dos diálogos de decisão da Aprovação.
      confirmLabel={`Validar ${vagas(nConfirm)} · enviar para aprovação`}
      pending={validateMutation.isPending}
      confirmDisabled={nConfirm === 0}
      onConfirm={() => validateMutation.mutate({ ids: validateIds, fromRow: validateTargetIds !== null, validationNote: normalizeValidationNote(validationNote) })}
    >
      <p>
        Você confirma que a escala sugerida está correta para {nConfirm === 1 ? "esta vaga" : "estas vagas"}.
        {" "}{nConfirm === 1 ? "Ela segue" : "Elas seguem"} para o aprovador e {nConfirm === 1 ? "fica" : "ficam"} na lista como
        “Validada pela área — aguardando aprovação”.
      </p>
      {/* A consequência dita ANTES do clique (04/09) — o texto antigo
          prometia "ainda dá para pedir ajuste", o que a regra de
          26/08 não permite. */}
      <p className="text-xs">{AFTER_VALIDATE_MSG}</p>
      {/* Lote de vários eventos (só em "Todos os eventos"): dito em
          destaque, porque o número no título não conta isso. */}
      {!eventId && validateGroups.length > 1 && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Este lote tem vagas de {eventos(validateGroups.length)}.
        </p>
      )}
      {/* Lista COMPLETA e rolável (04/09): antes eram 5 e "… e mais
          N" — a pessoa confirmava um lote sem poder conferir o que
          havia nele. Em "Todos os eventos", agrupada por evento. */}
      <ul className="max-h-[220px] overflow-y-auto rounded-lg border border-border bg-card text-xs text-slate-700" aria-label="Vagas deste lote">
        {(eventId ? [{ key: "__evento__", name: "", period: "", rows: validateRows }] : validateGroups).map((g) => (
          <li key={g.key}>
            {!eventId && (
              <div className="sticky top-0 border-b border-border bg-surface-muted px-3 py-1">
                <EventLine row={g.rows[0]} />
              </div>
            )}
            <ul className="divide-y divide-border">
              {g.rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary">#{r.inclusionNumber}</span>
                  <span className="truncate font-semibold">{functionNameById.get(r.functionId) ?? "Sem função"}</span>
                  <span className="ml-auto font-mono text-muted-foreground whitespace-nowrap">{periodLabel(r)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {/* Observação para o aprovador (dono, 24/09): opcional, vale
          para o lote inteiro. O erro do servidor (400) marca o campo
          e o diálogo continua aberto com o texto preservado. */}
      <div className="space-y-1 text-left">
        <Label htmlFor="validation-note" className="text-xs text-slate-600">
          Observação para o aprovador<OptionalMark />
        </Label>
        <Textarea
          id="validation-note" rows={3} maxLength={VALIDATION_NOTE_MAX} value={validationNote}
          onChange={(e) => changeNote(e.target.value)}
          disabled={validateMutation.isPending}
          className="rounded-lg bg-card text-sm"
          placeholder="Algo que o aprovador precisa saber antes de decidir — fica no histórico da vaga."
          aria-invalid={validationNoteError ? true : undefined}
          aria-describedby={[
            "validation-note-contador",
            nConfirm > 1 ? "validation-note-lote" : null,
            validationNoteError ? idDoErro("validation-note") : null,
          ].filter(Boolean).join(" ")}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
          {nConfirm > 1
            ? <span id="validation-note-lote">Vai junto com todas as vagas deste lote.</span>
            : <span>Vai junto com a vaga para o aprovador.</span>}
          <span id="validation-note-contador" className="tabular-nums" aria-live="polite">{validationNote.length}/{VALIDATION_NOTE_MAX}</span>
        </div>
        <MensagemDeErro id="validation-note" erro={validationNoteError} />
      </div>
    </ConfirmDialog>
  );
}
