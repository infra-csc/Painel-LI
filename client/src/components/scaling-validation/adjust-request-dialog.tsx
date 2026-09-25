/**
 * Pedido de AJUSTE de uma vaga (25/09 — extraído de change-request-dialogs.tsx).
 * Abre da Validação (linha rica) e do modal de Escalação (vaga já escalada).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Event, TeamInclusion } from "@shared/schema";
import { diffInclusion, PROPOSED_FIELD_LABELS, type ProposedChanges, type LastDecisionInfo } from "@shared/scaling-validation-rules";
import { TravelFields, EMPTY_TRAVEL, travelFromInclusion, validateTravel, type TravelDraft } from "./travel-fields";
import { WorkDaysPicker } from "./work-days-picker";
import { DiariasDerivadas, VagaCard } from "./vaga-card";
import { SECTION_TITLE } from "./logistics-chips";
import { workDaysOf } from "./types";
import {
  ApproverCommentBanner, BLOCO_INVALIDO, DIALOG_BODY, DIALOG_HEADER, DIALOG_SHELL_WIDE, DIALOG_STICKY, DIALOG_TWO_COLS,
  DICA_DIARIAS, DICA_VIAGEM, Passo, ReasonField, fmtValue, orNull, useCreateChangeRequest, useFocoNoErro,
  type ErroForm, type OnRequestSent,
} from "./change-request-shared";

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
  const [error, setError] = useState<ErroForm | null>(null);

  /**
   * Último alvo válido (04/09): a tela zera `inclusion` ao fechar, e durante a
   * animação de saída o título lia "#undefined" e a função virava "Função".
   * O que está na tela continua sendo a vaga que acabou de ser editada.
   */
  const lastRef = useRef<{ inclusion: AdjustableInclusion; functionName?: string } | null>(null);
  if (inclusion) lastRef.current = { inclusion, functionName };
  const vaga = inclusion ?? lastRef.current?.inclusion ?? null;
  const nomeFuncao = inclusion ? functionName : lastRef.current?.functionName;

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

  // Foco no campo com erro — ids dos blocos do formulário (ver `useFocoNoErro`).
  useFocoNoErro(error, { function: "adj-days", quantity: "adj-days", days: "adj-days", diff: "adj-days", travel: "adj-date-ida", reason: "adj-reason" });

  const submit = () => {
    if (!inclusion) return;
    // Na ordem dos passos (1 dias → 2 viagem → 3 motivo): o primeiro erro é o
    // que está mais acima, e é para lá que o foco vai.
    if (workDays.length === 0) { setError({ campo: "days", msg: "Informe ao menos um dia de trabalho." }); return; }
    const travelErr = validateTravel(travel);
    if (travelErr.length) { setError({ campo: "travel", msg: travelErr[0] }); return; }
    if (diff.length === 0) { setError({ campo: "diff", msg: "Nada foi alterado. Mude ao menos um campo ou use “Validar” se a vaga está correta." }); return; }
    if (!reason.trim()) { setError({ campo: "reason", msg: "Informe o motivo do pedido." }); return; }
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
          <DialogTitle>Pedir ajuste da vaga #{vaga?.inclusionNumber ?? "…"}</DialogTitle>
          <DialogDescription>
            {nomeFuncao ?? "Função"}{event ? ` · ${event.name}` : ""}. Altere só o que precisa — o aprovador vê o “de/para”.
            {postScaling && " A vaga continua como está — nada muda até o aprovador aceitar."}
          </DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY}>
          <ApproverCommentBanner info={vaga?.lastDecision} />
          {/* Duas colunas: o que é da VAGA à esquerda, a VIAGEM à direita —
              é o que faz o diálogo caber na tela sem barra de rolagem. */}
          <div className={DIALOG_TWO_COLS}>
          <div className="space-y-4">
          {/* A vaga como está HOJE (04/09), antes de mexer: o formulário já vem
              preenchido, mas o de/para lá embaixo só mostra o que mudou — sem
              o cartão, quem ajusta perde a referência do que era. Fica na
              coluna da vaga (a mais baixa) para não criar rolagem. */}
          {vaga && (
            <section className="space-y-1.5" aria-labelledby="adj-vaga-hoje">
              <h3 id="adj-vaga-hoje" className={SECTION_TITLE}>A vaga hoje</h3>
              <VagaCard row={vaga} functionName={nomeFuncao} className="bg-surface-muted/60 p-3" />
            </section>
          )}
          <section className="space-y-2" aria-labelledby="adj-passo-1">
            <Passo n={1} id="adj-passo-1" obrigatorio dica={DICA_DIARIAS}>Dias trabalhados (diárias)</Passo>
            <div id="adj-days" className={cn(error?.campo === "days" || error?.campo === "diff" ? BLOCO_INVALIDO : undefined)}
              aria-describedby={error?.campo === "days" || error?.campo === "diff" ? "adj-erro" : undefined}>
              <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={workDays} onChange={setWorkDays} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <DiariasDerivadas id="adj-daily" dias={workDays.length} />
              <div className="space-y-1">
                <Label htmlFor="adj-obs" className="text-xs text-slate-600">Observações da vaga</Label>
                <Textarea id="adj-obs" rows={2} maxLength={500} value={observations} disabled={mutation.isPending} onChange={(e) => setObservations(e.target.value)} className="rounded-lg text-sm" />
              </div>
            </div>
          </section>
          </div>

          <section className="space-y-2" aria-labelledby="adj-passo-2">
            <Passo n={2} id="adj-passo-2" dica={DICA_VIAGEM}>Viagem — ida e volta (não é diária)</Passo>
            <div className={cn(error?.campo === "travel" && BLOCO_INVALIDO)} aria-describedby={error?.campo === "travel" ? "adj-erro" : undefined}>
              <TravelFields idPrefix="adj" value={travel} workDays={workDays} disabled={mutation.isPending}
                eventStartDate={event?.startDate} eventEndDate={event?.endDate}
                onChange={(p) => setTravel((t) => ({ ...t, ...p }))} />
            </div>
          </section>
          </div>

          {/* O bloco fica sempre visível: sumir quando nada mudou faz parecer
              que o de/para não existe. Vazio, ele diz o que falta fazer. */}
          <div
            className={cn("rounded-xl border p-3", diff.length ? "border-warning/25 bg-warning-soft/60" : "border-border bg-surface-muted/60")}
            data-testid="adjust-diff"
          >
            <p className={cn("mb-2 text-2xs font-bold uppercase tracking-wide", diff.length ? "text-warning" : "text-muted-foreground")}>
              O que muda ({diff.length})
            </p>
            {diff.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nada mudou ainda — marque ou desmarque um dia para o aprovador ver o de/para.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-700">
                {diff.map((d) => (
                  <li key={d.field} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold min-w-[150px]">{PROPOSED_FIELD_LABELS[d.field]}</span>
                    <span className="text-muted-foreground line-through">{fmtValue(d.field, d.from)}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-medium">{fmtValue(d.field, d.to)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={DIALOG_STICKY}>
          <ReasonField id="adj-reason" passo={3} label="Motivo" value={reason} disabled={mutation.isPending}
            invalido={error?.campo === "reason"} erroId="adj-erro"
            onChange={(v) => { setReason(v); if (error?.campo === "reason" && v.trim()) setError(null); }}
            placeholder="Explique para o aprovador por que a vaga precisa mudar." />
          {error && <p id="adj-erro" role="alert" className="text-xs font-medium text-danger">{error.msg}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg bg-card" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
            {/* O botão diz o que acontece depois: o pedido não muda a vaga, quem decide é o aprovador. */}
            <Button type="button" onClick={submit} disabled={mutation.isPending} className="rounded-lg min-w-[200px] bg-primary hover:bg-primary-hover">
              {mutation.isPending ? "Enviando…" : "Enviar pedido de ajuste · o aprovador decide"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
