/**
 * Pedido de INCLUSÃO (vaga nova) — 25/09, extraído de change-request-dialogs.tsx.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Event, Function as FunctionType } from "@shared/schema";
import type { ProposedChanges } from "@shared/scaling-validation-rules";
import { TravelFields, EMPTY_TRAVEL, validateTravel, type TravelDraft } from "./travel-fields";
import { WorkDaysPicker } from "./work-days-picker";
import { DiariasDerivadas } from "./vaga-card";
import {
  BLOCO_INVALIDO, DIALOG_BODY, DIALOG_HEADER, DIALOG_SHELL_WIDE, DIALOG_STICKY, DICA_DIARIAS, DICA_VIAGEM,
  Passo, ReasonField, useCreateChangeRequest, useFocoNoErro, type ErroForm, type OnRequestSent,
} from "./change-request-shared";

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
  const [error, setError] = useState<ErroForm | null>(null);

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

  useFocoNoErro(error, { function: "inc-function", quantity: "inc-qty", days: "inc-days", diff: "inc-days", travel: "inc-date-ida", reason: "inc-reason" });

  /**
   * Teto de vagas por pedido (04/09). Não é regra do servidor — é proteção
   * contra o dedo: "100" no lugar de "10" criava cem vagas de uma vez se o
   * aprovador não reparasse. Quem precisa de mais abre outro pedido.
   */
  const MAX_VAGAS = 50;
  const qtd = Number(quantity);
  const qtdValida = Number.isInteger(qtd) && qtd >= 1 && qtd <= MAX_VAGAS;
  /** "Pedir 3 vagas de Kit" — o botão diz o que vai sair daqui. */
  const rotuloEnviar = `Pedir ${qtdValida ? qtd : ""} ${qtdValida && qtd === 1 ? "vaga" : "vagas"}${selectedFunction ? ` de ${selectedFunction.name}` : ""}`.replace(/\s+/g, " ");

  const submit = () => {
    if (!event) return;
    // Na ordem dos passos: o primeiro erro é o mais acima, e é para lá que o foco vai.
    if (!functionId) { setError({ campo: "function", msg: "Escolha a função." }); return; }
    if (!Number.isInteger(qtd) || qtd < 1) { setError({ campo: "quantity", msg: "Quantidade deve ser um inteiro ≥ 1." }); return; }
    if (qtd > MAX_VAGAS) { setError({ campo: "quantity", msg: `No máximo ${MAX_VAGAS} vagas por pedido.` }); return; }
    if (workDays.length === 0) { setError({ campo: "days", msg: "Informe ao menos um dia de trabalho." }); return; }
    const travelErr = validateTravel(travel);
    if (travelErr.length) { setError({ campo: "travel", msg: travelErr[0] }); return; }
    if (!reason.trim()) { setError({ campo: "reason", msg: "Informe o motivo do pedido." }); return; }
    setError(null);
    const q = qtd;
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
          {/* "Inclusão de Equipe" é o nome da fase (o mesmo do Histórico e da Aprovação); "Inclusão" solta parecia outra coisa. */}
          <DialogDescription>Pedido de vaga nova para o aprovador da função. Se aprovado, as vagas nascem já como Inclusão de Equipe (aguardando escalação).</DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY}>
          <section className="space-y-2" aria-labelledby="inc-passo-1">
            <Passo n={1} id="inc-passo-1" obrigatorio>Função</Passo>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div className="space-y-1">
                <Label htmlFor="inc-function" className="text-xs text-slate-600">Função</Label>
                <Select value={functionId} onValueChange={(v) => { setFunctionId(v); if (error?.campo === "function") setError(null); }} disabled={mutation.isPending || sorted.length === 0}>
                  <SelectTrigger id="inc-function" aria-invalid={error?.campo === "function" || undefined} aria-describedby={error?.campo === "function" ? "inc-erro" : undefined}
                    className={cn("h-9 rounded-lg", error?.campo === "function" && "border-danger-strong focus:ring-danger/25")}>
                    <SelectValue placeholder={sorted.length === 0 ? "Você não gerencia nenhuma função" : "Selecione a função"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sorted.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}{f.responsibleArea ? ` · ${f.responsibleArea}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Sem campo de quantidade (dono, 04/09): o pedido é sempre de UMA
                  vaga — a quantidade fica fixa em 1 (estado mantido). */}
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="inc-passo-2">
            <Passo n={2} id="inc-passo-2" obrigatorio dica={DICA_DIARIAS}>Dias trabalhados (diárias)</Passo>
            <div id="inc-days" className={cn(error?.campo === "days" && BLOCO_INVALIDO)} aria-describedby={error?.campo === "days" ? "inc-erro" : undefined}>
              <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={workDays}
                onChange={(d) => { setWorkDays(d); if (error?.campo === "days" && d.length) setError(null); }} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <DiariasDerivadas id="inc-daily" dias={workDays.length} />
              <div className="space-y-1">
                <Label htmlFor="inc-obs" className="text-xs text-slate-600">Observações da vaga</Label>
                <Textarea id="inc-obs" rows={2} maxLength={500} value={observations} disabled={mutation.isPending} onChange={(e) => setObservations(e.target.value)} className="rounded-lg text-sm" />
              </div>
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="inc-passo-3">
            <Passo n={3} id="inc-passo-3" dica={DICA_VIAGEM}>Viagem — ida e volta (não é diária)</Passo>
            <div className={cn(error?.campo === "travel" && BLOCO_INVALIDO)} aria-describedby={error?.campo === "travel" ? "inc-erro" : undefined}>
              <TravelFields idPrefix="inc" layout="linha" value={travel} workDays={workDays} disabled={mutation.isPending}
                eventStartDate={event?.startDate} eventEndDate={event?.endDate}
                onChange={(p) => { setTravel((t) => ({ ...t, ...p })); if (error?.campo === "travel") setError(null); }} />
            </div>
          </section>
        </div>

        <div className={DIALOG_STICKY}>
          <ReasonField id="inc-reason" passo={4} label="Motivo" value={reason} disabled={mutation.isPending}
            invalido={error?.campo === "reason"} erroId="inc-erro"
            onChange={(v) => { setReason(v); if (error?.campo === "reason" && v.trim()) setError(null); }}
            placeholder="Por que a escala precisa desta(s) vaga(s) a mais?" />
          {error && <p id="inc-erro" role="alert" className="text-xs font-medium text-danger">{error.msg}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg bg-card" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={mutation.isPending || !event} className="rounded-lg min-w-[200px] bg-primary hover:bg-primary-hover">
              {mutation.isPending ? "Enviando…" : rotuloEnviar}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
