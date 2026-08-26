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
import { apiErrorMessage, formatDiarias } from "@/lib/utils";
import type { Event, Function as FunctionType, TeamInclusion } from "@shared/schema";
import {
  diffInclusion, PROPOSED_FIELD_LABELS, TRANSPORT_MODE_LABELS,
  type ProposedChanges, type ProposedField, type TransportMode,
} from "@shared/scaling-validation-rules";
import { TravelFields, EMPTY_TRAVEL, travelFromInclusion, validateTravel, type TravelDraft } from "./travel-fields";
import { WorkDaysPicker } from "./work-days-picker";
import { CHANGE_REQUEST_TYPE_LABELS, type LastDecisionInfo } from "@shared/scaling-validation-rules";
import { formatDateBr } from "@/lib/dates";
import { describeLastDecision, invalidateScalingQueries, workDaysOf, ymd, type ApiError, type SuggestionRow } from "./types";

// ── helpers ──────────────────────────────────────────────────────────────────

const orNull = <T,>(v: T | ""): T | null => (v === "" ? null : v);

// ── Casca dos diálogos ───────────────────────────────────────────────────────
// Mesma estrutura do "Reajustar pedido" da Aprovação: cabeçalho fixo, corpo
// rolável e rodapé preso — o motivo do pedido e os botões nunca somem da vista.

const DIALOG_SHELL = "p-0 gap-0 flex flex-col max-h-[92vh] overflow-hidden rounded-2xl";
const DIALOG_SHELL_WIDE = `${DIALOG_SHELL} max-w-3xl`;
const DIALOG_HEADER = "px-6 pt-6 pb-3 border-b border-slate-100 pr-12";
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
  if (v === null || v === undefined || v === "") return "—";
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
  const [dailyRates, setDailyRates] = useState<string>("");
  const [dailyRatesTouched, setDailyRatesTouched] = useState(false);
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
    setDailyRates(String(inc.dailyRates ?? ""));
    // Se a vaga já veio com diárias ≠ nº de dias, o valor foi definido à mão: não sobrescrever.
    setDailyRatesTouched(inc.dailyRates != null && inc.dailyRates !== days.length);
    setTravel(travelFromInclusion(inc));
    setObservations(inc.observations ?? "");
    setReason("");
    setError(null);
  }, [open, inclusionId]);

  // Diárias acompanham os dias enquanto o usuário não editar o campo à mão (só ao mudar os dias).
  const handleWorkDaysChange = (days: string[]) => {
    setWorkDays(days);
    if (!dailyRatesTouched && days.length > 0) setDailyRates(String(days.length));
  };

  const mutation = useCreateChangeRequest(() => onOpenChange(false), onSent);

  // proposedChanges completo a partir do rascunho; o diff decide o que vai.
  const full: ProposedChanges = useMemo(() => ({
    v: 1,
    workDays: workDays.length ? workDays : undefined,
    dailyRates: dailyRates.trim() === "" ? undefined : Number(dailyRates),
    flightDepartureDate: orNull(travel.flightDepartureDate),
    flightDepartureSuggestedTime: orNull(travel.flightDepartureSuggestedTime),
    flightArrivalSuggestedTime: orNull(travel.flightArrivalSuggestedTime),
    flightReturnDate: orNull(travel.flightReturnDate),
    flightReturnSuggestedTime: orNull(travel.flightReturnSuggestedTime),
    transportModeIda: orNull(travel.transportModeIda),
    transportModeVolta: orNull(travel.transportModeVolta),
    needsTicket: travel.needsTicket,
    needsAccommodation: travel.needsAccommodation,
    observations: observations.trim() === "" ? null : observations.trim(),
  }), [workDays, dailyRates, travel, observations]);

  const diff = useMemo(() => (inclusion ? diffInclusion(inclusion, full) : []), [inclusion, full]);

  const submit = () => {
    if (!inclusion) return;
    if (!reason.trim()) { setError("Informe o motivo do pedido."); return; }
    if (workDays.length === 0) { setError("Informe ao menos um dia de trabalho."); return; }
    const n = Number(dailyRates);
    if (!Number.isInteger(n) || n < 0) { setError("Diárias devem ser um número inteiro (0 ou mais)."); return; }
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
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Dias de trabalho <span className="text-red-400">*</span></Label>
            <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={workDays} onChange={handleWorkDaysChange} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div className="space-y-1">
              <Label htmlFor="adj-daily" className="text-xs text-slate-600">Diárias</Label>
              <Input id="adj-daily" type="number" min={0} step={1} value={dailyRates} disabled={mutation.isPending}
                onChange={(e) => { setDailyRatesTouched(true); setDailyRates(e.target.value); }} className="h-9 rounded-lg" />
              <p className="text-[11px] text-slate-500">Padrão: {formatDiarias(workDays.length)} (1 por dia).</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-obs" className="text-xs text-slate-600">Observações da vaga</Label>
              <Textarea id="adj-obs" rows={2} maxLength={500} value={observations} disabled={mutation.isPending} onChange={(e) => setObservations(e.target.value)} className="rounded-lg text-sm" />
            </div>
          </div>

          <TravelFields idPrefix="adj" value={travel} disabled={mutation.isPending} onChange={(p) => setTravel((t) => ({ ...t, ...p }))} />

          {diff.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3" data-testid="adjust-diff">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-2">O que muda ({diff.length})</p>
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
            </div>
          )}
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
      <DialogContent className={`${DIALOG_SHELL} max-w-md`}>
        <DialogHeader className={DIALOG_HEADER}>
          <DialogTitle>Pedir exclusão da vaga #{inclusion?.inclusionNumber}</DialogTitle>
          <DialogDescription>
            {functionName ?? "Função"} — a vaga fica aguardando o aprovador. Se ele aprovar a exclusão, ela sai da escala e fica registrada como negada; se negar, volta para você validar.
          </DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY}>
          <ApproverCommentBanner info={inclusion?.lastDecision} />
          <p className="text-xs text-slate-500">Nada é apagado agora: o pedido vai para o aprovador da função com o motivo abaixo.</p>
        </div>

        <div className={DIALOG_STICKY}>
          <ReasonField id="del-reason" label="Motivo da exclusão" value={reason} disabled={mutation.isPending} onChange={setReason}
            placeholder="Por que esta vaga não deve existir?" />
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
  const [dailyRates, setDailyRates] = useState("");
  const [dailyRatesTouched, setDailyRatesTouched] = useState(false);
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
    setDailyRates("");
    setDailyRatesTouched(false);
    setTravel(EMPTY_TRAVEL);
    setObservations("");
    setReason("");
    setError(null);
  }, [open]);

  // Diárias acompanham os dias (1 por dia) até o usuário editar o campo à mão — igual ao Ajuste.
  const handleWorkDaysChange = (days: string[]) => {
    setWorkDays(days);
    if (!dailyRatesTouched) setDailyRates(days.length ? String(days.length) : "");
  };

  const mutation = useCreateChangeRequest(() => onOpenChange(false), onSent);
  const sorted = useMemo(() => [...functions].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })), [functions]);
  const selectedFunction = sorted.find((f) => f.id === functionId);

  const submit = () => {
    if (!event) return;
    if (!functionId) { setError("Escolha a função."); return; }
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) { setError("Quantidade deve ser um inteiro ≥ 1."); return; }
    if (workDays.length === 0) { setError("Informe ao menos um dia de trabalho."); return; }
    const dr = dailyRates.trim() === "" ? workDays.length : Number(dailyRates);
    if (!Number.isInteger(dr) || dr < 0) { setError("Diárias devem ser um número inteiro (0 ou mais)."); return; }
    const travelErr = validateTravel(travel);
    if (travelErr.length) { setError(travelErr[0]); return; }
    if (!reason.trim()) { setError("Informe o motivo do pedido."); return; }
    setError(null);
    const proposed: ProposedChanges = {
      v: 1,
      quantity: q,
      workDays,
      dailyRates: dr,
      needsTicket: travel.needsTicket,
      needsAccommodation: travel.needsAccommodation,
      ...(travel.transportModeIda ? { transportModeIda: travel.transportModeIda } : {}),
      ...(travel.transportModeVolta ? { transportModeVolta: travel.transportModeVolta } : {}),
      ...(travel.flightDepartureDate ? { flightDepartureDate: travel.flightDepartureDate } : {}),
      ...(travel.flightDepartureSuggestedTime ? { flightDepartureSuggestedTime: travel.flightDepartureSuggestedTime } : {}),
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
            <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={workDays} onChange={handleWorkDaysChange} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div className="space-y-1">
              <Label htmlFor="inc-daily" className="text-xs text-slate-600">Diárias (por pessoa)</Label>
              <Input id="inc-daily" type="number" min={0} step={1} value={dailyRates} disabled={mutation.isPending} placeholder={String(workDays.length)}
                onChange={(e) => { setDailyRatesTouched(true); setDailyRates(e.target.value); }} className="h-9 rounded-lg" />
              <p className="text-[11px] text-slate-500">Padrão: {formatDiarias(workDays.length)} (1 por dia).</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inc-obs" className="text-xs text-slate-600">Observações da vaga</Label>
              <Textarea id="inc-obs" rows={2} maxLength={500} value={observations} disabled={mutation.isPending} onChange={(e) => setObservations(e.target.value)} className="rounded-lg text-sm" />
            </div>
          </div>

          <TravelFields idPrefix="inc" value={travel} disabled={mutation.isPending} onChange={(p) => setTravel((t) => ({ ...t, ...p }))} />
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
