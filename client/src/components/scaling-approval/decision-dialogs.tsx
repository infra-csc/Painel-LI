import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, PencilLine } from "lucide-react";
import { formatDateRange } from "@/lib/dates";
import { Button } from "@/components/ui/button";
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
import { isPostValidationInclusion } from "@shared/scaling-change-window";
import type { ChangeRequestItem, ReviewBody } from "./types";
import { PostScalingBadge, RequestTypeBadge } from "./request-badges";
import { DiffTable, ProposedList, VagaCompleta } from "./request-detail";
import { targetLabel } from "./request-queue";
import { ProposedChangesForm, draftFromProposed, draftToProposed, fullFromDraft, validateDraft, type ProposedDraft } from "./proposed-changes-form";

// ── Aprovar (confirmação com resumo) ─────────────────────────────────────────

interface ApproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ChangeRequestItem | null;
  pending: boolean;
  onConfirm: () => void;
}

function approveConsequence(type: ChangeRequestType, qty: number, postScaling = false): string {
  // Vaga já escalada: aprovar NÃO devolve a vaga para a fila — aplica no lugar.
  if (postScaling && type === "ajuste") {
    return "As alterações são aplicadas na escalação atual. A pessoa continua escalada; passagem e hospedagem seguem com a logística.";
  }
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
            {isPostValidationInclusion(request?.inclusionState) && <PostScalingBadge />}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                <span className="font-semibold text-slate-700">{request?.functionName ?? "Função"}</span>
                {request ? <span className="font-mono text-slate-500"> · {targetLabel(request)}</span> : null}
                {request?.eventName ? <span className="text-slate-500"> · {request.eventName}</span> : null}
              </p>
              {request && type === "ajuste" && <DiffTable diff={request.diff} />}
              {request && type === "inclusao" && <ProposedList proposed={request.proposed} />}
              <p className="text-xs text-slate-600">{approveConsequence(type, request?.proposed?.quantity ?? 1, isPostValidationInclusion(request?.inclusionState))}</p>
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
  vagaFalhou?: boolean;
  event?: Event | null;
  pending: boolean;
  onSubmit: (body: ReviewBody) => void;
}

/**
 * Rótulo + explicação de cada destino da vaga, dependentes de kind × tipo do
 * pedido (mesma regra do servidor: reviewHandler em server/scaling-validation.ts).
 */
export function thenOption(
  value: ReviewBody["then"], kind: ReviewKind, type: ChangeRequestType,
  /** Vaga já escalada: não existe "voltar para a fila" e a vaga não vira Inclusão de novo. */
  postScaling = false,
): { label: string; hint: string } {
  if (postScaling) {
    // Só "aprovar_direto" chega aqui (a outra opção nem é oferecida).
    return kind === "reajustar"
      ? { label: "Aplicar os ajustes na escalação", hint: "A pessoa continua escalada, com as suas alterações. Passagem e hospedagem seguem com a logística." }
      : { label: "Manter a escalação como está", hint: "O pedido é negado e nada muda na vaga — a pessoa continua escalada como estava." };
  }
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

export function ReviewRequestDialog({ open, onOpenChange, kind, request, inclusion, vagaFalhou, event, pending, onSubmit }: ReviewDialogProps) {
  const type = (request?.requestType ?? "ajuste") as ChangeRequestType;
  const canEditFields = kind === "reajustar" && type !== "exclusao";
  const title = kind === "reajustar" ? "Reajustar pedido" : "Negar pedido";

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className={cn("p-0 gap-0 flex flex-col max-h-[88vh] overflow-hidden rounded-2xl", canEditFields ? "max-w-3xl" : "max-w-lg")}>
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 pr-12 text-left space-y-1">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            {title} <RequestTypeBadge type={type} />
            {isPostValidationInclusion(request?.inclusionState) && <PostScalingBadge />}
          </DialogTitle>
          {/* Metadados e explicação em linhas separadas (04/09): antes era uma
              frase só de 200 caracteres misturando evento, período e instrução. */}
          <DialogDescription asChild>
            <div className="space-y-0.5">
              <p className="text-[13px] text-slate-700">
                <span className="font-semibold">{request?.functionName ?? "Função"}</span>
                {request ? <span className="font-mono text-slate-500"> · {targetLabel(request)}</span> : null}
                {request?.eventName ? <span className="text-slate-500"> · {request.eventName}</span> : null}
                {event?.startDate ? <span className="font-mono tabular-nums text-slate-500"> · {formatDateRange(event.startDate, event.endDate, { withYear: true })}</span> : null}
              </p>
              <p className="text-xs text-slate-500">
                {kind === "reajustar"
                  ? "Ajuste o pedido se precisar, escolha o destino da vaga e explique para a área."
                  : "O pedido é recusado. Escolha o destino da vaga e explique para a área."}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        {/* key: trocar de pedido (ou de tipo de decisão) remonta o formulário — sem refs de reset. */}
        <ReviewForm
          key={`${request?.id ?? "none"}:${kind}`}
          kind={kind}
          type={type}
          request={request}
          inclusion={inclusion}
          vagaFalhou={vagaFalhou}
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
  vagaFalhou?: boolean;
  event?: Event | null;
  pending: boolean;
  canEditFields: boolean;
  onCancel: () => void;
  onSubmit: (body: ReviewBody) => void;
}

const COMMENT_REQUIRED = "O comentário para a área é obrigatório.";

function ReviewForm({ kind, type, request, inclusion, vagaFalhou, event, pending, canEditFields, onCancel, onSubmit }: ReviewFormProps) {
  // Pedido sobre vaga JÁ ESCALADA (modal de Escalação): o servidor recusa
  // "reenviar_validacao" — a vaga não está em fila nenhuma para voltar. Aqui a
  // opção nem aparece, e o destino já nasce em "aprovar_direto".
  const postScaling = isPostValidationInclusion(request?.inclusionState);
  const [comment, setComment] = useState("");
  const [then, setThen] = useState<ReviewBody["then"]>(postScaling ? "aprovar_direto" : "reenviar_validacao");
  const [editFields, setEditFields] = useState(false);
  const [draft, setDraft] = useState<ProposedDraft>(() => draftFromProposed(request?.proposed ?? null, inclusion));
  const [error, setError] = useState<string | null>(null);

  /** Dias que a área pediu — referência dentro do seletor de dias. */
  const diasPedidos = useMemo(
    () => (request?.proposed?.workDays ?? []).map((d) => String(d).slice(0, 10)).filter(Boolean).sort(),
    [request?.proposed],
  );

  // Reajuste de AJUSTE sem a vaga carregada: o formulário partiria só do pedido e o
  // envio mandaria os demais campos vazios — apagando voo/observações da vaga real.
  // Enquanto a inclusão não chega, editar campos fica bloqueado.
  const awaitingInclusion = kind === "reajustar" && type === "ajuste" && !inclusion;

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
    if (canEditFields && editFields && !awaitingInclusion) {
      const errs = validateDraft(draft, type);
      if (errs.length) { setError(errs[0]); return; }
      // Reajustar DE VOLTA para como a vaga está é decisão válida (27/08): o
      // pedido é resolvido e nenhum campo muda — { v: 1 } diz isso ao servidor.
      // (Só o ajuste tem esse caso; inclusão nunca devolve null aqui.)
      editedChanges = draftToProposed(draft, type, inclusion) ?? { v: 1 };
    }
    setError(null);
    onSubmit({ comment: comment.trim(), then, ...(editedChanges ? { editedChanges } : {}) });
  };

  const verb = kind === "reajustar" ? "Reajustar" : "Negar";
  const subject = type === "inclusao" ? "o pedido" : "a vaga";

  // ── Foco e rolagem no erro (04/09): a mensagem aparecia embaixo e o campo
  // obrigatório ficava fora da vista; agora o campo recebe o foco.
  const commentRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (error === COMMENT_REQUIRED) {
      commentRef.current?.focus();
      commentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [error]);

  // O pedido da área fica visível por padrão; recolher devolve espaço quando
  // a pessoa abre o formulário de edição (um resumo de uma linha fica no lugar).
  const [pedidoAberto, setPedidoAberto] = useState(true);
  const resumoDoPedido = (() => {
    if (!request) return "";
    if (type === "ajuste") return `${request.diff.length} ${request.diff.length === 1 ? "campo alterado" : "campos alterados"}`;
    if (type === "inclusao") { const q = request.proposed?.quantity ?? 1; return `${q} ${q === 1 ? "vaga nova" : "vagas novas"}`; }
    return "remover a vaga";
  })();

  /** O que o botão principal vai fazer — em duas palavras, para o rótulo. */
  const destinoCurto = (() => {
    if (postScaling) return kind === "reajustar" ? "aplicar na escalação" : "manter a escalação";
    if (then === "reenviar_validacao") return "reenviar à área";
    if (kind === "reajustar") return "aprovar direto";
    return type === "inclusao" ? "manter negado" : "aprovar como estava";
  })();
  const rotuloAcao = pending ? `${verb.replace(/r$/, "ndo")}…` : `${verb} · ${destinoCurto}`;

  const onKeyDownComentario = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter envia — a mesma convenção da conversa do pedido.
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !pending) { e.preventDefault(); submit(); }
  };

  const passoCls = "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white";

  return (
    <>
      {/* O pedido da área fica FORA da área que rola (30/08): ao abrir a edição
          o formulário empurrava o de/para para longe. Recolhível (04/09) para
          não roubar altura em telas baixas — o resumo de uma linha permanece. */}
      {request && (
        <section
          className={cn("shrink-0 border-b border-slate-100 bg-slate-50/70 px-5 sm:px-6 py-2.5 space-y-2", pedidoAberto && "max-h-[32vh] overflow-y-auto")}
          aria-labelledby="rev-pedido"
        >
          <div className="flex items-center justify-between gap-3">
            <p id="rev-pedido" className="text-[11px] font-bold uppercase tracking-wide text-slate-500 min-w-0 truncate">
              O que a área pediu
              {request.requestedByName ? <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">· {request.requestedByName}</span> : null}
              {!pedidoAberto && <span className="ml-1.5 font-semibold normal-case tracking-normal text-slate-600">· {resumoDoPedido}</span>}
            </p>
            <button
              type="button"
              onClick={() => setPedidoAberto((v) => !v)}
              aria-expanded={pedidoAberto}
              aria-controls="rev-pedido-corpo"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="rev-pedido-toggle"
            >
              {pedidoAberto ? <><ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> Recolher</> : <><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> Mostrar</>}
            </button>
          </div>
          {pedidoAberto && (
            <div id="rev-pedido-corpo" className="space-y-2">
              {request.reason ? (
                <blockquote className="border-l-2 border-primary/35 pl-2.5 text-xs text-slate-700 whitespace-pre-wrap break-words">{request.reason}</blockquote>
              ) : null}
              {type === "ajuste" && <DiffTable diff={request.diff} tom="pedido" />}
              {type === "inclusao" && <ProposedList proposed={request.proposed} />}
              {type === "exclusao" && (
                <p className="rounded-xl border border-dashed border-red-200 bg-red-50/40 px-3 py-2 text-xs text-red-800">
                  Pedido para <span className="font-semibold">remover a vaga</span> da escala.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
        <div className="space-y-6">
          {/* 0) A vaga inteira, antes de qualquer decisão: o delta sozinho não
              diz se 07:00 é cedo ou tarde para quem trabalha aqueles dias. */}
          {type === "ajuste" && (
            <section className="space-y-2" aria-labelledby="rev-vaga">
              <h3 id="rev-vaga" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">A vaga hoje</h3>
              <VagaCompleta inclusion={inclusion} falhou={vagaFalhou} />
            </section>
          )}

          {/* 1) Ajustar os campos (só reajuste de ajuste/inclusão) — opcional */}
          {canEditFields && (
            <section className="space-y-3" aria-labelledby="rev-passo-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="rev-passo-1" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className={passoCls} aria-hidden="true">1</span>
                  Ajustar os campos <span className="text-xs font-normal text-slate-500">(opcional)</span>
                </h3>
                <Button
                  type="button" size="sm" variant={editFields ? "secondary" : "outline"}
                  className="h-8 rounded-lg text-xs"
                  disabled={pending || awaitingInclusion}
                  aria-pressed={editFields && !awaitingInclusion}
                  aria-controls="rev-edicao"
                  onClick={() => setEditFields((v) => !v)}
                  data-testid="rev-editar-toggle"
                >
                  <PencilLine className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {editFields && !awaitingInclusion ? "Fechar edição" : "Editar campos"}
                </Button>
              </div>
              {!editFields && (
                <p className="text-xs text-slate-500">
                  {awaitingInclusion
                    ? "Aguarde a vaga carregar para editar — sem os dados atuais dela, o envio apagaria voo e observações."
                    : "Sem editar, o pedido segue exatamente como a área mandou."}
                </p>
              )}
              {editFields && !awaitingInclusion && (
                <div id="rev-edicao" className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                  {type === "ajuste" && (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Começar a edição a partir de">
                      <span className="text-[11px] text-slate-500">Começar de:</span>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        <button type="button" disabled={pending}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title="Volta os campos para o que a área pediu"
                          onClick={() => setDraft(draftFromProposed(request?.proposed ?? null, inclusion))}>
                          Valores do pedido
                        </button>
                        <button type="button" disabled={pending || !inclusion}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          title="Volta os campos para como a vaga está hoje — enviar assim resolve o pedido sem mudar nada"
                          onClick={() => setDraft(draftFromProposed(null, inclusion))}>
                          Vaga como está hoje
                        </button>
                      </div>
                    </div>
                  )}
                  <ProposedChangesForm type={type} value={draft} onChange={setDraft} event={event} disabled={pending} idPrefix="rev" diasPedidos={diasPedidos} />
                  {type === "ajuste" && inclusion && (() => {
                    const d = diffInclusion(inclusion, fullFromDraft(draft));
                    return (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Como fica depois do seu ajuste</p>
                        {d.length > 0
                          ? <DiffTable diff={d} />
                          : <p className="text-xs italic text-slate-500">Nenhum campo muda — a vaga segue exatamente como está e o pedido é resolvido.</p>}
                      </div>
                    );
                  })()}
                  {preview && type === "inclusao" && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Vaga(s) como ficará(ão)</p>
                      <ProposedList proposed={preview} />
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 2) Destino da vaga */}
          <fieldset className="space-y-2" aria-describedby="rev-passo-2-dica">
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-1">
              <span className={passoCls} aria-hidden="true">{canEditFields ? 2 : 1}</span>
              Depois de {verb.toLowerCase()}, o que fazer com {subject}?
            </legend>
            <RadioGroup value={then} onValueChange={(v) => setThen(v as ReviewBody["then"])} disabled={pending} className="gap-2">
              {(postScaling ? (["aprovar_direto"] as ReviewBody["then"][]) : THEN_VALUES).map((value) => {
                const o = thenOption(value, kind, type, postScaling);
                return (
                  <label key={value} htmlFor={`rev-then-${value}`} className={cn("flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ring/40", then === value ? "border-primary bg-brand-soft/40" : "border-slate-200 bg-white hover:border-slate-300")}>
                    <RadioGroupItem id={`rev-then-${value}`} value={value} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{o.label}</span>
                      <span className="block text-[11px] text-slate-500">{o.hint}</span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
            <p id="rev-passo-2-dica" className="sr-only">O botão principal repete o destino escolhido.</p>
          </fieldset>

          {/* 3) Comentário — por último (04/09): obrigatório, e o foco vem para
              cá quando falta. */}
          <div className="space-y-1.5">
            <Label htmlFor="rev-comment" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className={passoCls} aria-hidden="true">{canEditFields ? 3 : 2}</span>
              Comentário para a área <span className="text-red-500" aria-hidden="true">*</span>
            </Label>
            <Textarea
              ref={commentRef}
              id="rev-comment" rows={3} maxLength={1000} value={comment} disabled={pending} aria-required="true"
              aria-invalid={error === COMMENT_REQUIRED || undefined}
              aria-describedby={error ? "rev-erro rev-comment-dica" : "rev-comment-dica"}
              placeholder={kind === "reajustar" ? "Explique o que foi ajustado e por quê." : "Explique por que o pedido foi negado."}
              onChange={(e) => { setComment(e.target.value); if (error === COMMENT_REQUIRED && e.target.value.trim()) setError(null); }}
              onKeyDown={onKeyDownComentario}
              className={cn("rounded-lg text-sm bg-white", error === COMMENT_REQUIRED && "border-red-400 focus-visible:ring-red-300")}
            />
            <div className="flex items-center justify-between gap-2">
              <p id="rev-comment-dica" className="text-[11px] text-slate-400">Entra na conversa do pedido e no histórico da vaga · Ctrl+Enter envia.</p>
              {comment.length > 800 && <span className="text-[11px] tabular-nums text-slate-400" aria-live="polite">{comment.length}/1000</span>}
            </div>
            {error && <p id="rev-erro" role="alert" className="text-xs font-medium text-red-700">{error}</p>}
          </div>
        </div>
      </div>

      <DialogFooter className="border-t border-slate-200 bg-slate-50/60 px-5 sm:px-6 py-3 gap-2 sm:gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending} className="rounded-lg bg-white">Cancelar</Button>
        <Button
          type="button" onClick={submit} disabled={pending}
          className={cn("rounded-lg min-w-[180px]", kind === "negar" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-primary hover:bg-primary-hover")}
          data-testid="rev-submit"
        >
          {rotuloAcao}
        </Button>
      </DialogFooter>
    </>
  );
}
