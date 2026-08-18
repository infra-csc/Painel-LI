import { useEffect, useMemo, useState } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Event, TeamInclusion } from "@shared/schema";
import { CHANGE_REQUEST_TYPE_LABELS, diffInclusion, type ChangeRequestType, type ProposedChanges } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem, ReviewBody } from "./types";
import { RequestTypeBadge } from "./request-badges";
import { DiffTable, ProposedList } from "./request-detail";
import { ProposedChangesForm, draftFromProposed, draftToProposed, fullFromDraft, validateDraft, type ProposedDraft } from "./proposed-changes-form";

// ── Aprovar (confirmação com resumo) ─────────────────────────────────────────

interface ApproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ChangeRequestItem | null;
  pending: boolean;
  onConfirm: () => void;
}

function approveConsequence(type: ChangeRequestType, qty: number): string {
  switch (type) {
    case "ajuste": return "As alterações são aplicadas na vaga, que vira Inclusão de Equipe (aguardando escalação).";
    case "inclusao": return `${qty} ${qty === 1 ? "vaga nova nasce" : "vagas novas nascem"} já como Inclusão de Equipe (aguardando escalação).`;
    case "exclusao": return "A vaga sai da escala e fica registrada como negada.";
  }
}

export function ApproveRequestDialog({ open, onOpenChange, request, pending, onConfirm }: ApproveDialogProps) {
  const type = (request?.requestType ?? "ajuste") as ChangeRequestType;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            Aprovar pedido de {CHANGE_REQUEST_TYPE_LABELS[type].toLowerCase()}?
            <RequestTypeBadge type={type} />
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                <span className="font-semibold text-slate-700">{request?.functionName ?? "Função"}</span>
                {request?.inclusionNumber ? <span className="font-mono text-slate-500"> · vaga #{request.inclusionNumber}</span> : null}
                {request?.eventName ? <span className="text-slate-500"> · {request.eventName}</span> : null}
              </p>
              {request && type === "ajuste" && <DiffTable diff={request.diff} />}
              {request && type === "inclusao" && <ProposedList proposed={request.proposed} />}
              <p className="text-xs text-slate-600">{approveConsequence(type, request?.proposed?.quantity ?? 1)}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); onConfirm(); }} disabled={pending} className="bg-emerald-600 hover:bg-emerald-700">
            {pending ? "Aprovando…" : "Aprovar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Reajustar / Negar (comentário obrigatório + escolha secundária) ──────────

type ReviewKind = "reajustar" | "negar";

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ReviewKind;
  request: ChangeRequestItem | null;
  /** Vaga atual (só para AJUSTE) — preenche o formulário editável e calcula o diff. */
  inclusion?: TeamInclusion | null;
  event?: Event | null;
  pending: boolean;
  onSubmit: (body: ReviewBody) => void;
}

/**
 * Rótulo + explicação de cada destino da vaga, dependentes de kind × tipo do
 * pedido (mesma regra do servidor: reviewHandler em server/scaling-validation.ts).
 */
export function thenOption(value: ReviewBody["then"], kind: ReviewKind, type: ChangeRequestType): { label: string; hint: string } {
  if (value === "reenviar_validacao") {
    if (kind === "reajustar") {
      return {
        label: "Reenviar para validação da área",
        hint: type === "inclusao"
          ? "As vagas nascem como sugestão pendente, já com os seus ajustes, e a área valida como qualquer outra."
          : "A vaga volta para “aguardando validação” já com as suas alterações.",
      };
    }
    return {
      label: type === "inclusao" ? "Devolver o pedido para a área (reenviar para validação)" : "Devolver a vaga para a área (reenviar para validação)",
      hint: type === "inclusao"
        ? "As vagas nascem como sugestão pendente e a área valida como qualquer outra."
        : "A vaga volta para “aguardando validação” como estava, sem o pedido.",
    };
  }
  // aprovar_direto
  if (kind === "reajustar") {
    return {
      label: "Aprovar direto com os ajustes",
      hint: type === "inclusao"
        ? "As vagas nascem já como Inclusão de Equipe com as suas alterações."
        : "A vaga vira Inclusão de Equipe já com as suas alterações, sem nova validação.",
    };
  }
  if (type === "inclusao") return { label: "Manter negado — nada é criado", hint: "Só o pedido fica negado; nenhuma vaga é criada." };
  return {
    label: "Manter a vaga como estava e aprovar",
    hint: "A vaga vira Inclusão de Equipe como estava (sem o pedido), sem nova validação.",
  };
}

const THEN_VALUES: ReviewBody["then"][] = ["reenviar_validacao", "aprovar_direto"];

export function ReviewRequestDialog({ open, onOpenChange, kind, request, inclusion, event, pending, onSubmit }: ReviewDialogProps) {
  const type = (request?.requestType ?? "ajuste") as ChangeRequestType;
  const canEditFields = kind === "reajustar" && type !== "exclusao";
  const title = kind === "reajustar" ? "Reajustar pedido" : "Negar pedido";

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className={cn("p-0 gap-0 flex flex-col max-h-[92vh] overflow-hidden", canEditFields ? "max-w-3xl" : "max-w-lg")}>
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 pr-12">
          <DialogTitle className="flex items-center gap-2">
            {title} <RequestTypeBadge type={type} />
          </DialogTitle>
          <DialogDescription>
            {request?.functionName ?? "Função"}
            {request?.inclusionNumber ? ` · vaga #${request.inclusionNumber}` : ""}
            {request?.eventName ? ` · ${request.eventName}` : ""}
            {kind === "reajustar"
              ? " — você altera o pedido (ou mantém como veio) e decide o que acontece com a vaga."
              : " — o pedido é recusado e você decide o que acontece com a vaga."}
          </DialogDescription>
        </DialogHeader>
        {/* key: trocar de pedido (ou de tipo de decisão) remonta o formulário — sem refs de reset. */}
        <ReviewForm
          key={`${request?.id ?? "none"}:${kind}`}
          kind={kind}
          type={type}
          request={request}
          inclusion={inclusion}
          event={event}
          pending={pending}
          canEditFields={canEditFields}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ReviewFormProps {
  kind: ReviewKind;
  type: ChangeRequestType;
  request: ChangeRequestItem | null;
  inclusion?: TeamInclusion | null;
  event?: Event | null;
  pending: boolean;
  canEditFields: boolean;
  onCancel: () => void;
  onSubmit: (body: ReviewBody) => void;
}

const COMMENT_REQUIRED = "O comentário para a área é obrigatório.";

function ReviewForm({ kind, type, request, inclusion, event, pending, canEditFields, onCancel, onSubmit }: ReviewFormProps) {
  const [comment, setComment] = useState("");
  const [then, setThen] = useState<ReviewBody["then"]>("reenviar_validacao");
  const [editFields, setEditFields] = useState(false);
  const [draft, setDraft] = useState<ProposedDraft>(() => draftFromProposed(request?.proposed ?? null, inclusion));
  const [error, setError] = useState<string | null>(null);

  // Se a vaga chegou depois de o diálogo abrir (ajuste), recarrega o rascunho ainda intocado.
  const inclusionId = inclusion?.id ?? null;
  useEffect(() => {
    if (!editFields) setDraft(draftFromProposed(request?.proposed ?? null, inclusion));
  }, [inclusionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview: ProposedChanges | null = useMemo(
    () => (canEditFields && editFields && type === "inclusao" ? draftToProposed(draft, type, inclusion) : null),
    [canEditFields, editFields, draft, type, inclusion],
  );

  const submit = () => {
    if (!comment.trim()) { setError(COMMENT_REQUIRED); return; }
    let editedChanges: ProposedChanges | undefined;
    if (canEditFields && editFields) {
      const errs = validateDraft(draft, type);
      if (errs.length) { setError(errs[0]); return; }
      const p = draftToProposed(draft, type, inclusion);
      if (!p) { setError("Nada foi alterado em relação à vaga atual. Desmarque “Editar campos” para reajustar sem mudar valores, ou altere algum campo."); return; }
      editedChanges = p;
    }
    setError(null);
    onSubmit({ comment: comment.trim(), then, ...(editedChanges ? { editedChanges } : {}) });
  };

  const verb = kind === "reajustar" ? "Reajustar" : "Negar";
  const subject = type === "inclusao" ? "o pedido" : "a vaga";

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-5">
          {/* 1) Comentário */}
          <div className="space-y-1">
            <Label htmlFor="rev-comment" className="text-xs text-slate-600">Comentário para a área <span className="text-red-500" aria-hidden="true">*</span></Label>
            <Textarea id="rev-comment" rows={3} maxLength={1000} value={comment} disabled={pending} required aria-required="true"
              aria-invalid={error === COMMENT_REQUIRED || undefined}
              placeholder={kind === "reajustar" ? "Explique o que foi ajustado e por quê." : "Explique por que o pedido foi negado."}
              onChange={(e) => setComment(e.target.value)} className="rounded-lg text-sm" />
            <p className="text-[11px] text-slate-400">Entra na conversa do pedido e no histórico da vaga.</p>
          </div>

          {/* 2) Editar campos (só reajuste de ajuste/inclusão) */}
          {canEditFields && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <Checkbox checked={editFields} disabled={pending} onCheckedChange={(c) => setEditFields(c === true)} />
                <PencilLine className="w-4 h-4 text-slate-400" aria-hidden="true" /> Editar os campos propostos antes de decidir
              </label>
              {editFields && (
                <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                  {type === "ajuste" && !inclusion && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      A vaga atual não foi carregada; o formulário parte só do pedido. Os campos preenchidos serão enviados como estão.
                    </p>
                  )}
                  <ProposedChangesForm type={type} value={draft} onChange={setDraft} event={event} disabled={pending} idPrefix="rev" />
                  {type === "ajuste" && inclusion && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Como fica o de/para</p>
                      <DiffTable diff={diffInclusion(inclusion, fullFromDraft(draft))} />
                    </div>
                  )}
                  {preview && type === "inclusao" && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Vaga(s) como ficará(ão)</p>
                      <ProposedList proposed={preview} />
                    </div>
                  )}
                </div>
              )}
              {!editFields && request && type === "ajuste" && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Pedido como veio</p>
                  <DiffTable diff={request.diff} />
                </div>
              )}
            </div>
          )}

          {/* 3) Destino da vaga */}
          <fieldset className="space-y-2">
            <legend className="text-xs text-slate-600 mb-1">Depois de {verb.toLowerCase()}, o que fazer com {subject}? <span className="text-red-500" aria-hidden="true">*</span></legend>
            <RadioGroup value={then} onValueChange={(v) => setThen(v as ReviewBody["then"])} disabled={pending} className="gap-2">
              {THEN_VALUES.map((value) => {
                const o = thenOption(value, kind, type);
                return (
                  <label key={value} htmlFor={`rev-then-${value}`} className={cn("flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors", then === value ? "border-primary bg-brand-soft/40" : "border-slate-200 hover:border-slate-300")}>
                    <RadioGroupItem id={`rev-then-${value}`} value={value} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{o.label}</span>
                      <span className="block text-[11px] text-slate-500">{o.hint}</span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </fieldset>

          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        </div>
      </div>

      <DialogFooter className="border-t border-slate-100 bg-white px-6 py-3 gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={pending} className={kind === "negar" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-primary hover:bg-primary-hover"}>
          {pending ? `${verb.replace(/r$/, "ndo")}…` : verb}
        </Button>
      </DialogFooter>
    </>
  );
}
