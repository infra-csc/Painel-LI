import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn, formatDiarias } from "@/lib/utils";
import type { Event, Function as FunctionType, TeamInclusion } from "@shared/schema";
import {
  diffInclusion, PROPOSED_FIELD_LABELS, TRANSPORT_MODE_LABELS,
  type ProposedChanges, type ProposedField, type TransportMode,
} from "@shared/scaling-validation-rules";
import { TravelFields, EMPTY_TRAVEL, travelFromInclusion, validateTravel, type TravelDraft } from "./travel-fields";
import { WorkDaysPicker } from "./work-days-picker";
import { DiariasDerivadas, VagaCard, pessoasDiaDaVaga } from "./vaga-card";
import { CHANGE_REQUEST_TYPE_LABELS, SUGESTAO_STATUS, type LastDecisionInfo } from "@shared/scaling-validation-rules";
import { formatDateBr } from "@/lib/dates";
import { describeLastDecision, invalidateScalingQueries, workDaysOf, ymd, type ApiError, type SuggestionRow } from "./types";

// ── helpers ──────────────────────────────────────────────────────────────────

const orNull = <T,>(v: T | ""): T | null => (v === "" ? null : v);

// ── Casca dos diálogos ───────────────────────────────────────────────────────
// Mesma estrutura do "Reajustar pedido" da Aprovação: cabeçalho fixo, corpo
// rolável e rodapé preso — o motivo do pedido e os botões nunca somem da vista.

const DIALOG_SHELL = "p-0 gap-0 flex flex-col max-h-[88vh] overflow-hidden rounded-2xl";
/**
 * Diálogo LARGO (pedido de ajuste e de inclusão).
 *
 * Regra do dono (26/08): "scroll em modal dificulta muito" — em vez de rolar,
 * o diálogo cresce para o lado e o conteúdo vira duas colunas em telas grandes
 * (o que é da VAGA à esquerda, a VIAGEM à direita). O `max-h`/overflow continua
 * como rede de segurança para telas baixas, não como layout normal.
 */
const DIALOG_SHELL_WIDE = `${DIALOG_SHELL} max-w-5xl`;
/** Duas colunas a partir de lg: dias/diárias/observações | ida e volta. */
const DIALOG_TWO_COLS = "grid gap-4 lg:grid-cols-2 lg:items-start";
// shrink-0: sem isto o cabeçalho é comprimido pelo corpo num diálogo alto e
// o título e a descrição se sobrepõem (visto ao vivo em 1568×688).
const DIALOG_HEADER = "shrink-0 px-6 pt-6 pb-3 border-b border-slate-100 pr-12";
const DIALOG_BODY = "flex-1 overflow-y-auto px-6 py-4 space-y-4";
const DIALOG_STICKY = "shrink-0 border-t border-slate-200 bg-slate-50/60 px-6 py-3 space-y-2";

/** Motivo do pedido — obrigatório nos três diálogos, sempre no rodapé fixo. */
function ReasonField({ id, value, onChange, disabled, placeholder, label = "Motivo do pedido" }: {
  id: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder: string; label?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-slate-600">{label} <span className="text-red-500" aria-hidden="true">*</span></Label>
      <Textarea id={id} rows={2} maxLength={1000} value={value} disabled={disabled} required aria-required="true"
        placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="rounded-lg text-sm bg-white" />
    </div>
  );
}

/** Callback disparado após o pedido ser aceito pelo servidor (id da vaga; null em inclusão). */
export type OnRequestSent = (inclusionId: string | null) => void;

function useCreateChangeRequest(onDone: () => void, onSent?: OnRequestSent) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      teamInclusionId?: string | null;
      eventId: string;
      functionId: string;
      area?: string | null;
      requestType: "ajuste" | "inclusao" | "exclusao";
      proposedChanges: ProposedChanges;
      reason: string;
    }) => {
      const res = await apiRequest("POST", "/api/scaling-change-requests", {
        ...body,
        proposedChanges: JSON.stringify(body.proposedChanges),
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      invalidateScalingQueries(queryClient);
      const label = vars.requestType === "ajuste" ? "Pedido de ajuste enviado" : vars.requestType === "exclusao" ? "Pedido de exclusão enviado" : "Pedido de inclusão enviado";
      toast({ title: label, description: "O aprovador da função vai analisar o pedido." });
      onDone();
      onSent?.(vars.teamInclusionId ?? null);
    },
    onError: (err: ApiError) => {
      toast({ title: "Não foi possível enviar o pedido", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });
}

function fmtValue(field: ProposedField, v: unknown): string {
  // No de/para, campo vazio precisa se dizer: um travessão no lugar do "de"
  // some no meio da frase e o aprovador não sabe se havia valor antes.
  if (v === null || v === undefined || v === "") return "não definido";
  if (field === "workDays" && Array.isArray(v)) return v.map((d) => ymd(d as string).split("-").reverse().slice(0, 2).join("/")).join(", ");
  if (field === "needsTicket" || field === "needsAccommodation") return v ? "Sim" : "Não";
  if (field === "transportModeIda" || field === "transportModeVolta") return TRANSPORT_MODE_LABELS[v as TransportMode] ?? String(v);
  if (field === "flightDepartureDate" || field === "flightReturnDate") return ymd(v as string).split("-").reverse().join("/");
  return String(v);
}

/** Comentário do aprovador na última decisão — em destaque no topo do diálogo (a vaga voltou por isso). */
export function ApproverCommentBanner({ info }: { info: LastDecisionInfo | null | undefined }) {
  const d = describeLastDecision(info);
  if (!info || !d) return null;
  const when = info.at ? formatDateBr(info.at) : "";
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
  return (
    <div role="note" className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">{d.title} · pedido de {typeLabel.toLowerCase()}</p>
      <p className="text-sm text-slate-800 whitespace-pre-wrap">{info.comment?.trim() ? info.comment : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}</p>
      <p className="text-[11px] text-slate-600">{info.byName ?? "Aprovador"}{when ? ` · ${when}` : ""}</p>
    </div>
  );
}

// ── Pedido de AJUSTE ─────────────────────────────────────────────────────────

/**
 * Vaga que este diálogo consegue ajustar.
 *
 * Estruturalmente menor que `SuggestionRow` porque o mesmo diálogo agora abre
 * de DOIS lugares (regra do dono, 26/08): da Validação, com a linha rica da API
 * de sugestões, e do modal de Escalação, com a `TeamInclusion` crua de uma vaga
 * JÁ ESCALADA. Os dois formatos entram aqui sem conversão.
 */
export type AdjustableInclusion = Omit<TeamInclusion, "workDays"> & {
  workDays: string[] | null;
  /** Só a Validação traz (banner do último comentário do aprovador). */
  lastDecision?: LastDecisionInfo | null;
};

interface AdjustRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inclusion: AdjustableInclusion | null;
  event?: Event;
  functionName?: string;
  onSent?: OnRequestSent;
  /**
   * Vaga já escalada (pedido aberto pelo modal de Escalação). Muda só o texto:
   * a pessoa continua escalada e nada muda até o aprovador decidir.
   */
  postScaling?: boolean;
}

export function AdjustRequestDialog({ open, onOpenChange, inclusion, event, functionName, onSent, postScaling }: AdjustRequestDialogProps) {
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [travel, setTravel] = useState<TravelDraft>(EMPTY_TRAVEL);
  const [observations, setObservations] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Snapshot da vaga carregada: o formulário só é (re)iniciado ao abrir ou ao trocar de vaga (id),
  // nunca por refetch em background (o objeto `inclusion` muda de referência a cada refetch).
  const inclusionRef = useRef(inclusion);
  inclusionRef.current = inclusion;
  const loadedIdRef = useRef<string | null>(null);
  const inclusionId = inclusion?.id ?? null;
  useEffect(() => {
    if (!open) { loadedIdRef.current = null; return; }
    const inc = inclusionRef.current;
    if (!inc || loadedIdRef.current === inc.id) return;
    loadedIdRef.current = inc.id;
    const days = workDaysOf(inc);
    setWorkDays(days);
    setTravel(travelFromInclusion(inc));
    setObservations(inc.observations ?? "");
    setReason("");
    setError(null);
  }, [open, inclusionId]);

  const mutation = useCreateChangeRequest(() => onOpenChange(false), onSent);

  // proposedChanges completo a partir do rascunho; o diff decide o que vai.
  const full: ProposedChanges = useMemo(() => ({
    v: 1,
    workDays: workDays.length ? workDays : undefined,
    // Sempre 1 por dia: o número deixou de ser digitável.
    dailyRates: workDays.length || undefined,
    flightDepartureDate: orNull(travel.flightDepartureDate),
    // `flightDepartureSuggestedTime` (saída da origem) NÃO entra: o campo saiu
    // do formulário (a Sugestão nunca teve), então o pedido não pode mexer nele.
    flightArrivalSuggestedTime: orNull(travel.flightArrivalSuggestedTime),
    flightReturnDate: orNull(travel.flightReturnDate),
    flightReturnSuggestedTime: orNull(travel.flightReturnSuggestedTime),
    transportModeIda: orNull(travel.transportModeIda),
    transportModeVolta: orNull(travel.transportModeVolta),
    needsTicket: travel.needsTicket,
    needsAccommodation: travel.needsAccommodation,
    observations: observations.trim() === "" ? null : observations.trim(),
  }), [workDays, travel, observations]);

  const diff = useMemo(() => (inclusion ? diffInclusion(inclusion, full) : []), [inclusion, full]);

  const submit = () => {
    if (!inclusion) return;
    if (!reason.trim()) { setError("Informe o motivo do pedido."); return; }
    if (workDays.length === 0) { setError("Informe ao menos um dia de trabalho."); return; }
    const travelErr = validateTravel(travel);
    if (travelErr.length) { setError(travelErr[0]); return; }
    if (diff.length === 0) { setError("Nada foi alterado. Mude ao menos um campo ou use “Validar” se a vaga está correta."); return; }
    setError(null);
    // Só os campos que mudaram (v:1 sempre)
    const proposed: ProposedChanges = { v: 1 };
    for (const d of diff) (proposed as Record<string, unknown>)[d.field] = full[d.field];
    mutation.mutate({
      teamInclusionId: inclusion.id,
      eventId: inclusion.eventId,
      functionId: inclusion.functionId,
      area: inclusion.area ?? null,
      requestType: "ajuste",
      proposedChanges: proposed,
      reason: reason.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent className={DIALOG_SHELL_WIDE}>
        <DialogHeader className={DIALOG_HEADER}>
          <DialogTitle>Pedir ajuste da vaga #{inclusion?.inclusionNumber}</DialogTitle>
          <DialogDescription>
            {functionName ?? "Função"}{event ? ` · ${event.name}` : ""}. Altere só o que precisa — o aprovador vê o “de/para”.
            {postScaling && " A vaga continua como está — nada muda até o aprovador aceitar."}
          </DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY}>
          <ApproverCommentBanner info={inclusion?.lastDecision} />
          {/* Duas colunas: o que é da VAGA à esquerda, a VIAGEM à direita —
              é o que faz o diálogo caber na tela sem barra de rolagem. */}
          <div className={DIALOG_TWO_COLS}>
          <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Dias de trabalho <span className="text-red-400">*</span></Label>
            <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={workDays} onChange={setWorkDays} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <DiariasDerivadas id="adj-daily" dias={workDays.length} />
            <div className="space-y-1">
              <Label htmlFor="adj-obs" className="text-xs text-slate-600">Observações da vaga</Label>
              <Textarea id="adj-obs" rows={2} maxLength={500} value={observations} disabled={mutation.isPending} onChange={(e) => setObservations(e.target.value)} className="rounded-lg text-sm" />
            </div>
          </div>
          </div>

          <TravelFields idPrefix="adj" value={travel} disabled={mutation.isPending} onChange={(p) => setTravel((t) => ({ ...t, ...p }))} />
          </div>

          {/* O bloco fica sempre visível: sumir quando nada mudou faz parecer
              que o de/para não existe. Vazio, ele diz o que falta fazer. */}
          <div
            className={cn("rounded-2xl border p-3", diff.length ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50/60")}
            data-testid="adjust-diff"
          >
            <p className={cn("mb-2 text-[11px] font-bold uppercase tracking-wide", diff.length ? "text-amber-700" : "text-slate-400")}>
              O que muda ({diff.length})
            </p>
            {diff.length === 0 ? (
              <p className="text-xs text-slate-500">Nada mudou ainda — marque ou desmarque um dia para o aprovador ver o de/para.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-700">
                {diff.map((d) => (
                  <li key={d.field} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold min-w-[150px]">{PROPOSED_FIELD_LABELS[d.field]}</span>
                    <span className="text-slate-400 line-through">{fmtValue(d.field, d.from)}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-medium">{fmtValue(d.field, d.to)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={DIALOG_STICKY}>
          <ReasonField id="adj-reason" value={reason} disabled={mutation.isPending} onChange={setReason}
            placeholder="Explique para o aprovador por que a vaga precisa mudar." />
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg bg-white" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={mutation.isPending} className="rounded-lg bg-primary hover:bg-primary-hover">
              {mutation.isPending ? "Enviando…" : "Enviar pedido de ajuste"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pedido de EXCLUSÃO ───────────────────────────────────────────────────────

interface DeleteRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inclusion: SuggestionRow | null;
  functionName?: string;
  onSent?: OnRequestSent;
}

export function DeleteRequestDialog({ open, onOpenChange, inclusion, functionName, onSent }: DeleteRequestDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setReason(""); setError(null); } }, [open]);
  const mutation = useCreateChangeRequest(() => onOpenChange(false), onSent);

  const submit = () => {
    if (!inclusion) return;
    if (!reason.trim()) { setError("Informe o motivo da exclusão."); return; }
    setError(null);
    mutation.mutate({
      teamInclusionId: inclusion.id,
      eventId: inclusion.eventId,
      functionId: inclusion.functionId,
      area: inclusion.area ?? null,
      requestType: "exclusao",
      proposedChanges: { v: 1 },
      reason: reason.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent className={`${DIALOG_SHELL} !max-w-[560px]`}>
        <DialogHeader className={DIALOG_HEADER}>
          <DialogTitle>Pedir exclusão da vaga #{inclusion?.inclusionNumber}</DialogTitle>
          <DialogDescription>
            {functionName ?? "Função"} — a vaga fica aguardando o aprovador. Se ele aprovar a exclusão, ela sai da escala e fica registrada como negada; se negar, volta para você validar.
          </DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY}>
          <ApproverCommentBanner info={inclusion?.lastDecision} />
          {/* Pedir a saída de uma vaga sem ver qual vaga é foi o que este
              diálogo pediu por muito tempo: só havia o campo de motivo. */}
          {inclusion && (
            <>
              <VagaCard row={inclusion} functionName={functionName} rotuloLogistica="Logística que deixa de ser necessária" />
              <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 space-y-1.5" aria-labelledby="del-afeta">
                <p id="del-afeta" className="text-[11px] font-bold uppercase tracking-wide text-amber-700">O que isso afeta</p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    Saem <span className="font-semibold tabular-nums">{pessoasDiaDaVaga(inclusion)}</span>{" "}
                    {pessoasDiaDaVaga(inclusion) === 1 ? "pessoa-dia" : "pessoas-dia"} do total da escala deste evento.
                  </li>
                  <li>
                    {inclusion.needsTicket || inclusion.needsAccommodation
                      ? <>Compras deixa de comprar {[inclusion.needsTicket ? "passagem" : null, inclusion.needsAccommodation ? "hospedagem" : null].filter(Boolean).join(" e ")} para esta vaga.</>
                      : <>Nenhuma compra é afetada — a vaga não pedia passagem nem hospedagem.</>}
                  </li>
                  {inclusion.status === SUGESTAO_STATUS.VALIDADA && (
                    <li>A vaga já foi validada pela área: este pedido substitui aquela validação na fila do aprovador.</li>
                  )}
                  <li>As outras vagas da mesma função não são afetadas — sai só esta.</li>
                </ul>
              </section>
            </>
          )}
          <p className="text-xs text-slate-500">Nada é apagado agora: o pedido vai para o aprovador da função com o motivo abaixo.</p>
        </div>

        <div className={DIALOG_STICKY}>
          <ReasonField id="del-reason" label="Motivo da exclusão" value={reason} disabled={mutation.isPending} onChange={setReason}
            placeholder="Ex.: a área reduziu a equipe de campo e esta vaga não será mais ocupada." />
          <p className="text-[11px] text-slate-500">O aprovador decide com base neste texto — ele vê o motivo antes de aprovar ou negar.</p>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg bg-white" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="button" variant="destructive" className="rounded-lg" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? "Enviando…" : "Pedir exclusão"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pedido de INCLUSÃO (vaga nova) ───────────────────────────────────────────

interface IncludeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: Event;
  /** Funções que o usuário pode pedir (já filtradas: gerenciadas, ou todas se admin). */
  functions: FunctionType[];
  onSent?: OnRequestSent;
}

export function IncludeRequestDialog({ open, onOpenChange, event, functions, onSent }: IncludeRequestDialogProps) {
  const [functionId, setFunctionId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [travel, setTravel] = useState<TravelDraft>(EMPTY_TRAVEL);
  const [observations, setObservations] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reinicia só ao abrir; `functions` muda de referência a cada refetch e não pode apagar o rascunho.
  const functionsRef = useRef(functions);
  functionsRef.current = functions;
  useEffect(() => {
    if (!open) return;
    const fns = functionsRef.current;
    setFunctionId(fns.length === 1 ? fns[0].id : "");
    setQuantity("1");
    setWorkDays([]);
    setTravel(EMPTY_TRAVEL);
    setObservations("");
    setReason("");
    setError(null);
  }, [open]);

  const mutation = useCreateChangeRequest(() => onOpenChange(false), onSent);
  const sorted = useMemo(() => [...functions].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })), [functions]);
  const selectedFunction = sorted.find((f) => f.id === functionId);

  const submit = () => {
    if (!event) return;
    if (!functionId) { setError("Escolha a função."); return; }
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) { setError("Quantidade deve ser um inteiro ≥ 1."); return; }
    if (workDays.length === 0) { setError("Informe ao menos um dia de trabalho."); return; }
    const travelErr = validateTravel(travel);
    if (travelErr.length) { setError(travelErr[0]); return; }
    if (!reason.trim()) { setError("Informe o motivo do pedido."); return; }
    setError(null);
    const proposed: ProposedChanges = {
      v: 1,
      quantity: q,
      workDays,
      // 1 por dia de trabalho: o número deixou de ser digitável.
      dailyRates: workDays.length,
      needsTicket: travel.needsTicket,
      needsAccommodation: travel.needsAccommodation,
      ...(travel.transportModeIda ? { transportModeIda: travel.transportModeIda } : {}),
      ...(travel.transportModeVolta ? { transportModeVolta: travel.transportModeVolta } : {}),
      ...(travel.flightDepartureDate ? { flightDepartureDate: travel.flightDepartureDate } : {}),
      // Sem saída da origem: o formulário não pede esse horário (ver TravelFields).
      ...(travel.flightArrivalSuggestedTime ? { flightArrivalSuggestedTime: travel.flightArrivalSuggestedTime } : {}),
      ...(travel.flightReturnDate ? { flightReturnDate: travel.flightReturnDate } : {}),
      ...(travel.flightReturnSuggestedTime ? { flightReturnSuggestedTime: travel.flightReturnSuggestedTime } : {}),
      ...(observations.trim() ? { observations: observations.trim() } : {}),
    };
    mutation.mutate({
      teamInclusionId: null,
      eventId: event.id,
      functionId,
      area: selectedFunction?.responsibleArea ?? null,
      requestType: "inclusao",
      proposedChanges: proposed,
      reason: reason.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent className={DIALOG_SHELL_WIDE}>
        <DialogHeader className={DIALOG_HEADER}>
          <DialogTitle>Incluir escalação{event ? ` — ${event.name}` : ""}</DialogTitle>
          <DialogDescription>Pedido de vaga nova para o aprovador da função. Se aprovado, as vagas nascem já como Inclusão (aguardando escalação).</DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY}>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1">
              <Label htmlFor="inc-function" className="text-xs text-slate-600">Função <span className="text-red-400">*</span></Label>
              <Select value={functionId} onValueChange={setFunctionId} disabled={mutation.isPending || sorted.length === 0}>
                <SelectTrigger id="inc-function" className="h-9 rounded-lg"><SelectValue placeholder={sorted.length === 0 ? "Você não gerencia nenhuma função" : "Selecione a função"} /></SelectTrigger>
                <SelectContent>
                  {sorted.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}{f.responsibleArea ? ` · ${f.responsibleArea}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inc-qty" className="text-xs text-slate-600">Quantidade <span className="text-red-400">*</span></Label>
              <Input id="inc-qty" type="number" min={1} step={1} value={quantity} disabled={mutation.isPending} onChange={(e) => setQuantity(e.target.value)} className="h-9 rounded-lg" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Dias de trabalho <span className="text-red-400">*</span></Label>
            <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={workDays} onChange={setWorkDays} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <DiariasDerivadas id="inc-daily" dias={workDays.length} />
            <div className="space-y-1">
              <Label htmlFor="inc-obs" className="text-xs text-slate-600">Observações da vaga</Label>
              <Textarea id="inc-obs" rows={2} maxLength={500} value={observations} disabled={mutation.isPending} onChange={(e) => setObservations(e.target.value)} className="rounded-lg text-sm" />
            </div>
          </div>

          <TravelFields idPrefix="inc" titulo="Logística sugerida" layout="linha" value={travel} disabled={mutation.isPending} onChange={(p) => setTravel((t) => ({ ...t, ...p }))} />
        </div>

        <div className={DIALOG_STICKY}>
          <ReasonField id="inc-reason" value={reason} disabled={mutation.isPending} onChange={setReason}
            placeholder="Por que a escala precisa desta(s) vaga(s) a mais?" />
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg bg-white" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={mutation.isPending || !event} className="rounded-lg bg-primary hover:bg-primary-hover">
              {mutation.isPending ? "Enviando…" : "Enviar pedido de inclusão"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
