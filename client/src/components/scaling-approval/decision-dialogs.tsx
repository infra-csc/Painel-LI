import { useEffect, useMemo, useRef, useState } from "react";
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

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "reajustar" | "negar";
  request: ChangeRequestItem | null;
  /** Vaga atual (só para AJUSTE) — preenche o formulário editável e calcula o diff. */
  inclusion?: TeamInclusion | null;
  event?: Event | null;
  pending: boolean;
  onSubmit: (body: ReviewBody) => void;
}

const THEN_OPTIONS: { value: ReviewBody["then"]; label: string; hint: (kind: "reajustar" | "negar", type: ChangeRequestType) => string }[] = [
  {
    value: "reenviar_validacao",
    label: "Reenviar para validação da área",
    hint: (kind, type) => type === "inclusao"
      ? "As vagas nascem como sugestão pendente e a área valida como qualquer outra."
      : kind === "reajustar" ? "A vaga volta para “aguardando validação” já com as suas alterações." : "A vaga volta para “aguardando validação” como estava, sem o pedido.",
  },
  {
    value: "aprovar_direto",
    label: "Aprovar direto",
    hint: (kind, type) => type === "inclusao"
      ? (kind === "reajustar" ? "As vagas nascem já como Inclusão de Equipe com as suas alterações." : "Nada é criado — só o pedido fica negado.")
      : kind === "reajustar" ? "A vaga vira Inclusão de Equipe já com as suas alterações, sem nova validação." : "A vaga vira Inclusão de Equipe como estava, sem nova validação.",
  },
];

export function ReviewRequestDialog({ open, onOpenChange, kind, request, inclusion, event, pending, onSubmit }: ReviewDialogProps) {
  const type = (request?.requestType ?? "ajuste") as ChangeRequestType;
  const canEditFields = kind === "reajustar" && type !== "exclusao";

  const [comment, setComment] = useState("");
  const [then, setThen] = useState<ReviewBody["then"]>("reenviar_validacao");
  const [editFields, setEditFields] = useState(false);
  const [draft, setDraft] = useState<ProposedDraft>(() => draftFromProposed(null));
  const [error, setError] = useState<string | null>(null);

  // (Re)inicia só ao abrir ou trocar de pedido — nunca por refetch em background.
  const requestRef = useRef(request); requestRef.current = request;
  const inclusionRef = useRef(inclusion); inclusionRef.current = inclusion;
  const loadedRef = useRef<string | null>(null);
  const requestId = request?.id ?? null;
  useEffect(() => {
    if (!open) { loadedRef.current = null; return; }
    if (!requestId || loadedRef.current === requestId) return;
    loadedRef.current = requestId;
    setComment(""); setThen("reenviar_validacao"); setEditFields(false); setError(null);
    setDraft(draftFromProposed(requestRef.current?.proposed ?? null, inclusionRef.current));
  }, [open, requestId]);
  // Se a vaga chegou depois de o diálogo abrir (ajuste), recarrega o rascunho ainda intocado.
  const inclusionId = inclusion?.id ?? null;
  const editFieldsRef = useRef(editFields); editFieldsRef.current = editFields;
  useEffect(() => {
    if (!open || editFieldsRef.current) return;
    setDraft(draftFromProposed(requestRef.current?.proposed ?? null, inclusionRef.current));
  }, [open, inclusionId]);

  const preview: ProposedChanges | null = useMemo(
    () => (canEditFields && editFields && type === "inclusao" ? draftToProposed(draft, type, inclusion) : null),
    [canEditFields, editFields, draft, type, inclusion],
  );

  const submit = () => {
    if (!comment.trim()) { setError("O comentário para a área é obrigatório."); return; }
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

  const title = kind === "reajustar" ? "Reajustar pedido" : "Negar pedido";
  const verb = kind === "reajustar" ? "Reajustar" : "Negar";

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto", canEditFields ? "max-w-3xl" : "max-w-lg")}>
        <DialogHeader>
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

        <div className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="rev-comment" className="text-xs text-slate-600">Comentário para a área <span className="text-red-400">*</span></Label>
            <Textarea id="rev-comment" rows={3} maxLength={1000} value={comment} disabled={pending} required aria-required="true"
              placeholder={kind === "reajustar" ? "Explique o que foi ajustado e por quê." : "Explique por que o pedido foi negado."}
              onChange={(e) => setComment(e.target.value)} className="rounded-lg text-sm" />
            <p className="text-[11px] text-slate-400">Entra no chat do pedido e no histórico da vaga.</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs text-slate-600 mb-1">Depois de {verb.toLowerCase()}, o que fazer com a vaga? <span className="text-red-400">*</span></legend>
            <RadioGroup value={then} onValueChange={(v) => setThen(v as ReviewBody["then"])} disabled={pending} className="gap-2">
              {THEN_OPTIONS.map((o) => (
                <label key={o.value} htmlFor={`rev-then-${o.value}`} className={cn("flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors", then === o.value ? "border-primary bg-brand-soft/40" : "border-slate-200 hover:border-slate-300")}>
                  <RadioGroupItem id={`rev-then-${o.value}`} value={o.value} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{o.label}</span>
                    <span className="block text-[11px] text-slate-500">{o.hint(kind, type)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          {canEditFields && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <Checkbox checked={editFields} disabled={pending} onCheckedChange={(c) => setEditFields(c === true)} />
                <PencilLine className="w-4 h-4 text-slate-400" aria-hidden="true" /> Editar os campos propostos antes de decidir
              </label>
              {editFields && (
                <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                  {type === "ajuste" && !inclusion && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
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

          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={pending} className={kind === "negar" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-primary hover:bg-primary-hover"}>
            {pending ? `${verb.replace(/r$/, "ndo")}…` : verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
