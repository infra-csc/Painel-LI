/**
 * Pedido de EXCLUSÃO de uma vaga (25/09 — extraído de change-request-dialogs.tsx).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { VagaCard, pessoasDiaDaVaga } from "./vaga-card";
import type { SuggestionRow } from "./types";
import {
  ApproverCommentBanner, DIALOG_BODY, DIALOG_HEADER, DIALOG_SHELL, DIALOG_STICKY, ReasonField, useCreateChangeRequest, useFocoNoErro,
  type ErroForm, type OnRequestSent,
} from "./change-request-shared";

interface DeleteRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inclusion: SuggestionRow | null;
  functionName?: string;
  onSent?: OnRequestSent;
}

export function DeleteRequestDialog({ open, onOpenChange, inclusion, functionName: functionNameProp, onSent }: DeleteRequestDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setReason(""); setError(null); } }, [open]);
  const mutation = useCreateChangeRequest(() => onOpenChange(false), onSent);
  // Último alvo válido — evita "#undefined" na animação de fechamento (ver o diálogo de ajuste).
  const lastRef = useRef<{ inclusion: SuggestionRow; functionName?: string } | null>(null);
  if (inclusion) lastRef.current = { inclusion, functionName: functionNameProp };
  const vaga = inclusion ?? lastRef.current?.inclusion ?? null;
  const functionName = inclusion ? functionNameProp : lastRef.current?.functionName;
  // Erro do motivo (o único campo): foco e `aria-invalid` como nos outros
  // diálogos. Memoizado: um objeto novo a cada render faria o efeito de foco
  // rodar (e rolar) a cada tecla enquanto o erro estivesse na tela.
  const erroForm = useMemo<ErroForm | null>(() => (error ? { campo: "reason", msg: error } : null), [error]);
  useFocoNoErro(erroForm, { function: "del-reason", quantity: "del-reason", days: "del-reason", diff: "del-reason", travel: "del-reason", reason: "del-reason" });

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
          <DialogTitle>Pedir exclusão da vaga #{vaga?.inclusionNumber ?? "…"}</DialogTitle>
          <DialogDescription>
            {functionName ?? "Função"} — a vaga fica aguardando o aprovador. Se ele aprovar a exclusão, ela sai da escala e fica registrada como negada; se negar, volta para você validar.
          </DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY}>
          <ApproverCommentBanner info={vaga?.lastDecision} />
          {/* Pedir a saída de uma vaga sem ver qual vaga é foi o que este
              diálogo pediu por muito tempo: só havia o campo de motivo. */}
          {vaga && (
            <>
              <VagaCard row={vaga} functionName={functionName} rotuloLogistica="Logística que deixa de ser necessária" />
              <section className="rounded-xl border border-warning/25 bg-warning-soft/60 p-3 space-y-1.5" aria-labelledby="del-afeta">
                <p id="del-afeta" className="text-2xs font-bold uppercase tracking-wide text-warning">O que isso afeta</p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>
                    Saem <span className="font-semibold tabular-nums">{pessoasDiaDaVaga(vaga)}</span>{" "}
                    {pessoasDiaDaVaga(vaga) === 1 ? "pessoa-dia" : "pessoas-dia"} do total da escala deste evento.
                  </li>
                  <li>
                    {vaga.needsTicket || vaga.needsAccommodation
                      ? <>Compras deixa de comprar {[vaga.needsTicket ? "passagem" : null, vaga.needsAccommodation ? "hospedagem" : null].filter(Boolean).join(" e ")} para esta vaga.</>
                      : <>Nenhuma compra é afetada — a vaga não pedia passagem nem hospedagem.</>}
                  </li>
                  {vaga.status === SUGESTAO_STATUS.VALIDADA && (
                    <li>A vaga já foi validada pela área: este pedido substitui aquela validação na fila do aprovador.</li>
                  )}
                  <li>As outras vagas da mesma função não são afetadas — sai só esta.</li>
                </ul>
              </section>
            </>
          )}
          <p className="text-xs text-muted-foreground">Nada é apagado agora: o pedido vai para o aprovador da função com o motivo abaixo.</p>
        </div>

        <div className={DIALOG_STICKY}>
          <ReasonField id="del-reason" label="Motivo da exclusão" value={reason} disabled={mutation.isPending}
            invalido={!!error} erroId="del-erro"
            onChange={(v) => { setReason(v); if (error && v.trim()) setError(null); }}
            placeholder="Ex.: a área reduziu a equipe de campo e esta vaga não será mais ocupada." />
          <p className="text-2xs text-muted-foreground">O aprovador decide com base neste texto — ele vê o motivo antes de aprovar ou negar.</p>
          {error && <p id="del-erro" role="alert" className="text-xs font-medium text-danger">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg bg-card" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="button" variant="destructive" className="rounded-lg" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? "Enviando…" : "Pedir exclusão"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
