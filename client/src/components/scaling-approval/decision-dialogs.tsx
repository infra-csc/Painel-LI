import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Info, Loader2, PencilLine, XCircle } from "lucide-react";
import { formatDateRange } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { cn } from "@/lib/utils";
import type { Event, TeamInclusion } from "@shared/schema";
import { CHANGE_REQUEST_TYPE_LABELS, diffInclusion, type ChangeRequestType, type ProposedChanges } from "@shared/scaling-validation-rules";
import { isPostValidationInclusion } from "@shared/scaling-change-window";
import type { ChangeRequestItem, ReviewBody } from "./types";
import { PostScalingBadge, RequestTypeBadge } from "./request-badges";
import { DiffTable, ProposedList, VagaCompleta } from "./request-detail";
import { targetLabel } from "./request-queue";
import { ProposedChangesForm, draftFromProposed, draftToProposed, fullFromDraft, validateDraft, type ProposedDraft } from "./proposed-changes-form";
import { RequiredMark } from "@/components/forms/required-mark";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

// ── Aprovar (confirmação com resumo) ─────────────────────────────────────────

interface ApproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ChangeRequestItem | null;
  pending: boolean;
  onConfirm: () => void;
}

/** Exportada: o detalhe do pedido mostra a MESMA frase acima do botão "Aprovar como veio". */
export function approveConsequence(type: ChangeRequestType, qty: number, postScaling = false): string {
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
    // ConfirmDialog único (23/09): Esc/clique fora cancelam, spinner em pending.
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Aprovar pedido de ${CHANGE_REQUEST_TYPE_LABELS[type].toLowerCase()}?`}
      icon={CheckCircle2}
      cancelLabel="Voltar"
      confirmLabel={pending ? "Aprovando…" : "Aprovar"}
      pending={pending}
      onConfirm={onConfirm}
      className="!max-w-[580px] max-h-[90vh] overflow-y-auto"
    >
              <div className="flex flex-wrap items-center gap-1.5">
                <RequestTypeBadge type={type} />
                {isPostValidationInclusion(request?.inclusionState) && <PostScalingBadge />}
              </div>
              <p className="text-sm">
                <span className="font-semibold text-foreground">{request?.functionName ?? "Função"}</span>
                {request ? <span className="text-xs tabular-nums text-muted-foreground"> · {targetLabel(request)}</span> : null}
                {request?.eventName ? <span className="text-muted-foreground"> · {request.eventName}</span> : null}
              </p>
              {request && type === "ajuste" && <DiffTable diff={request.diff} />}
              {request && type === "inclusao" && <ProposedList proposed={request.proposed} />}
              <div className="relative overflow-hidden rounded-xl border border-success/25 bg-success-soft/60 py-2.5 pl-4 pr-3.5 text-success">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-current opacity-70" aria-hidden="true" />
                <p className="text-[13px] font-semibold leading-5">O que acontece</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{approveConsequence(type, request?.proposed?.quantity ?? 1, isPostValidationInclusion(request?.inclusionState))}</p>
                {/* d0264d41: ajuste em vaga já escalada com passagem/hospedagem gera
                    um aviso para Compras — o aprovador sabe disso ANTES de clicar. */}
                {isPostValidationInclusion(request?.inclusionState) && type === "ajuste" && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">Se a vaga já tiver passagem ou hospedagem, Compras recebe um aviso com o que mudou, para rever.</p>
                )}
              </div>
              {/* O caminho de volta, dito antes do clique (04/09) — a mesma
                  linha do diálogo de aprovar vagas validadas. Na vaga já
                  escalada não existe fila para onde voltar: aplica no lugar. */}
              <p className="text-2xs text-muted-foreground">
                {isPostValidationInclusion(request?.inclusionState)
                  ? "Aplicado direto na escalação — a pessoa continua escalada e a mudança vale na hora."
                  : type === "exclusao"
                    ? "Depois de aprovar, a vaga fica negada — para voltar à escala, a área precisa sugerir de novo."
                    : "Depois de aprovar, a alteração só é possível na Escalação — voltar exige pedido de ajuste da área."}
              </p>
    </ConfirmDialog>
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
      <DialogContent className={cn("flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-xl p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none", canEditFields ? "max-w-3xl" : "max-w-xl")}>
        <DialogHeader className="space-y-1.5 border-b border-border px-5 pb-3.5 pt-4 pr-12 text-left sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
            {kind === "negar"
              ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-soft text-danger" aria-hidden="true"><XCircle className="h-3.5 w-3.5" /></span>
              : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-primary" aria-hidden="true"><PencilLine className="h-3.5 w-3.5" /></span>}
            {title} <RequestTypeBadge type={type} />
            {isPostValidationInclusion(request?.inclusionState) && <PostScalingBadge />}
          </DialogTitle>
          {/* Metadados e explicação em linhas separadas (04/09): antes era uma
              frase só de 200 caracteres misturando evento, período e instrução. */}
          <DialogDescription asChild>
            <div className="space-y-0.5">
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-foreground">{request?.functionName ?? "Função"}</span>
                {request ? <span className="text-xs tabular-nums text-muted-foreground"> · {targetLabel(request)}</span> : null}
              </p>
              {(request?.eventName || event?.startDate) && (
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {request?.eventName ? <span className="font-medium text-slate-700">{request.eventName}</span> : null}
                  {event?.startDate ? <span className="tabular-nums">· {formatDateRange(event.startDate, event.endDate, { withYear: true })}</span> : null}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
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
  /** A área que rola do diálogo — o erro rola SÓ ela (07/10: o scrollIntoView rolava a moldura inteira, que é overflow-hidden, e o rodapé subia deixando um vão branco embaixo). */
  const corpoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error === COMMENT_REQUIRED) {
      const campo = commentRef.current;
      const corpo = corpoRef.current;
      campo?.focus({ preventScroll: true });
      if (campo && corpo) corpo.scrollTo({ top: Math.max(0, campo.offsetTop - corpo.clientHeight / 2), behavior: "smooth" });
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

  const passoCls = "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-bold tabular-nums text-primary-foreground";

  return (
    <>
      {/* O pedido da área fica FORA da área que rola (30/08): ao abrir a edição
          o formulário empurrava o de/para para longe. Recolhível (04/09) para
          não roubar altura em telas baixas — o resumo de uma linha permanece. */}
      {request && (
        <section
          className={cn("shrink-0 border-b border-border bg-surface-muted/70 px-5 sm:px-6 py-2.5 space-y-2", pedidoAberto && "max-h-[32vh] overflow-y-auto")}
          aria-labelledby="rev-pedido"
        >
          <div className="flex items-center justify-between gap-3">
            <p id="rev-pedido" className="min-w-0 truncate text-[13px] font-semibold text-foreground">
              O que a área pediu
              {request.requestedByName ? <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">· {request.requestedByName}</span> : null}
              {!pedidoAberto && <span className="ml-1.5 font-semibold normal-case tracking-normal text-slate-600">· {resumoDoPedido}</span>}
            </p>
            <button
              type="button"
              onClick={() => setPedidoAberto((v) => !v)}
              aria-expanded={pedidoAberto}
              aria-controls="rev-pedido-corpo"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-2xs font-medium text-slate-600 hover:bg-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <p className="rounded-xl border border-dashed border-danger/25 bg-danger-soft/40 px-3 py-2 text-xs text-danger">
                  Pedido para <span className="font-semibold">remover a vaga</span> da escala.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <div ref={corpoRef} className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        <div className="space-y-6">
          {/* 0) A vaga inteira, antes de qualquer decisão: o delta sozinho não
              diz se 07:00 é cedo ou tarde para quem trabalha aqueles dias. */}
          {type === "ajuste" && (
            <section className="space-y-2" aria-labelledby="rev-vaga">
              <h3 id="rev-vaga" className="text-[13px] font-semibold text-foreground">A vaga hoje</h3>
              <VagaCompleta inclusion={inclusion} falhou={vagaFalhou} />
            </section>
          )}

          {/* 1) Ajustar os campos (só reajuste de ajuste/inclusão) — opcional */}
          {canEditFields && (
            <section className="space-y-3" aria-labelledby="rev-passo-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="rev-passo-1" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className={passoCls} aria-hidden="true">1</span>
                  Ajustar os campos <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
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
                <p className="text-xs text-muted-foreground">
                  {awaitingInclusion
                    ? "Aguarde a vaga carregar para editar — sem os dados atuais dela, o envio apagaria voo e observações."
                    : "Sem editar, o pedido segue exatamente como a área mandou."}
                </p>
              )}
              {editFields && !awaitingInclusion && (
                <div id="rev-edicao" className="rounded-xl border border-border bg-card p-4 space-y-4">
                  {type === "ajuste" && (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Começar a edição a partir de">
                      <span className="text-2xs text-muted-foreground">Começar de:</span>
                      <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
                        <MotivoDesabilitado motivo="Volta os campos para o que a área pediu" desabilitado={pending}>
                          <button type="button" disabled={pending}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-card hover:shadow-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                         
                          onClick={() => setDraft(draftFromProposed(request?.proposed ?? null, inclusion))}>
                          Valores do pedido
                        </button>
                        </MotivoDesabilitado>
                        <MotivoDesabilitado motivo="Volta os campos para como a vaga está hoje — enviar assim resolve o pedido sem mudar nada" desabilitado={pending || !inclusion}>
                          <button type="button" disabled={pending || !inclusion}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-card hover:shadow-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                         
                          onClick={() => setDraft(draftFromProposed(null, inclusion))}>
                          Vaga como está hoje
                        </button>
                        </MotivoDesabilitado>
                      </div>
                    </div>
                  )}
                  <ProposedChangesForm type={type} value={draft} onChange={setDraft} event={event} disabled={pending} idPrefix="rev" diasPedidos={diasPedidos} />
                  {type === "ajuste" && inclusion && (() => {
                    const d = diffInclusion(inclusion, fullFromDraft(draft));
                    return (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-foreground">Como fica depois do seu ajuste</p>
                        {d.length > 0
                          ? <DiffTable diff={d} />
                          : <p className="text-xs italic text-muted-foreground">Nenhum campo muda — a vaga segue exatamente como está e o pedido é resolvido.</p>}
                      </div>
                    );
                  })()}
                  {preview && type === "inclusao" && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-foreground">Vaga(s) como ficará(ão)</p>
                      <ProposedList proposed={preview} />
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 2) Destino da vaga */}
          <fieldset className="space-y-2" aria-describedby="rev-passo-2-dica">
            <legend className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
              <span className={passoCls} aria-hidden="true">{canEditFields ? 2 : 1}</span>
              Depois de {verb.toLowerCase()}, o que fazer com {subject}?
            </legend>
            <RadioGroup value={then} onValueChange={(v) => setThen(v as ReviewBody["then"])} disabled={pending} className="gap-2">
              {(postScaling ? (["aprovar_direto"] as ReviewBody["then"][]) : THEN_VALUES).map((value) => {
                const o = thenOption(value, kind, type, postScaling);
                return (
                  <label key={value} htmlFor={`rev-then-${value}`} className={cn("flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ring/40", then === value ? "border-primary bg-brand-soft/40" : "border-border bg-card hover:border-slate-300")}>
                    <RadioGroupItem id={`rev-then-${value}`} value={value} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{o.label}</span>
                      <span className="block text-2xs text-muted-foreground">{o.hint}</span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
            {/* Vaga já escalada (regra do dono): "devolver para validação" não
                existe — o servidor recusa. A tela diz isso em vez de só sumir com a opção. */}
            {postScaling && (
              <p className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-xs leading-relaxed text-info" data-testid="rev-sem-devolver">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span><span className="font-semibold">Sem “devolver para validação”:</span> a pessoa já está escalada e a vaga não está mais na fila da área — este pedido só pode ser decidido aqui.</span>
              </p>
            )}
            <p id="rev-passo-2-dica" className="sr-only">O botão principal repete o destino escolhido.</p>
          </fieldset>

          {/* 3) Comentário — por último (04/09): obrigatório, e o foco vem para
              cá quando falta. */}
          <div className="space-y-1.5">
            <Label htmlFor="rev-comment" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className={passoCls} aria-hidden="true">{canEditFields ? 3 : 2}</span>
              Comentário para a área<RequiredMark />
            </Label>
            <Textarea
              ref={commentRef}
              id="rev-comment" rows={3} maxLength={1000} value={comment} disabled={pending} aria-required="true"
              aria-invalid={error === COMMENT_REQUIRED || undefined}
              aria-describedby={error ? "rev-erro rev-comment-dica" : "rev-comment-dica"}
              placeholder={kind === "reajustar" ? "Explique o que foi ajustado e por quê." : "Explique por que o pedido foi negado."}
              onChange={(e) => { setComment(e.target.value); if (error === COMMENT_REQUIRED && e.target.value.trim()) setError(null); }}
              onKeyDown={onKeyDownComentario}
              className={cn("rounded-lg text-sm bg-card", error === COMMENT_REQUIRED && "border-danger-strong focus-visible:ring-danger/25")}
            />
            <div className="flex items-center justify-between gap-2">
              <p id="rev-comment-dica" className="text-2xs text-muted-foreground">Entra na conversa do pedido e no histórico da vaga · Ctrl+Enter envia.</p>
              {comment.length > 800 && <span className="text-2xs tabular-nums text-muted-foreground" aria-live="polite">{comment.length}/1000</span>}
            </div>
            {error && <p id="rev-erro" role="alert" className="text-xs font-medium text-danger">{error}</p>}
          </div>
        </div>
      </div>

      <DialogFooter className="gap-2 border-t border-border bg-card px-5 py-3 sm:gap-2 sm:justify-end sm:px-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending} className="val-alvo h-9 rounded-lg bg-card">Cancelar</Button>
        <Button
          type="button" onClick={submit} disabled={pending}
          className={cn("val-alvo h-9 min-w-[180px] rounded-lg font-semibold shadow-1", kind === "negar" ? "bg-danger text-white hover:bg-danger/90" : "bg-primary hover:bg-primary-hover")}
          data-testid="rev-submit"
        >
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {rotuloAcao}
        </Button>
      </DialogFooter>
    </>
  );
}
