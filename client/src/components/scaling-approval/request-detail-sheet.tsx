import { useRef } from "react";
import { CheckCircle2, PencilLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHANGE_REQUEST_STATUS, daysPending, type ChangeRequestType } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem } from "./types";
import { CanDecideBadge, RequestAgeBadge, RequestStatusBadge, RequestTypeBadge, formatDateTimeBr } from "./request-badges";
import { DiffTable, ProposedList, ReasonBlock } from "./request-detail";
import { RequestChat } from "./request-chat";
import { targetLabel } from "./request-queue";

interface RequestDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ChangeRequestItem | null;
  onApprove: (r: ChangeRequestItem) => void;
  onReajustar: (r: ChangeRequestItem) => void;
  onNegar: (r: ChangeRequestItem) => void;
  busy?: boolean;
}

const SECTION = "text-[11px] font-bold uppercase tracking-wide text-slate-500";

/**
 * Nível 2 — detalhe do pedido: de/para, motivo, conversa e ações.
 *
 * Modal central e não gaveta lateral (30/08): a gaveta tinha 576px, e o de/para
 * de três colunas mais os chips de logística quebravam em duas linhas o tempo
 * todo. Com 720px cabe na linha, e o que sobra é menos rolagem para decidir.
 */
export function RequestDetailSheet({ open, onOpenChange, request, onApprove, onReajustar, onNegar, busy }: RequestDetailSheetProps) {
  const r = request;
  const type = (r?.requestType ?? "ajuste") as ChangeRequestType;
  const isPending = r?.status === CHANGE_REQUEST_STATUS.PENDENTE;
  const showActions = !!r && isPending && r.canDecide;
  const days = r ? daysPending(r.createdAt) : 0;
  const approveRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[720px] w-[95vw] max-h-[88vh] rounded-2xl !flex !flex-col p-0 gap-0 overflow-hidden"
        onOpenAutoFocus={(e) => {
          // Foco inicial: no botão principal quando há decisão a tomar; senão no título.
          const target = showActions ? approveRef.current : titleRef.current;
          if (target) { e.preventDefault(); target.focus(); }
        }}
      >
        {r ? (
          <>
            <DialogHeader className="shrink-0 px-5 pt-5 pb-3 pr-12 border-b border-slate-100 text-left space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <RequestTypeBadge type={type} />
                <RequestStatusBadge status={r.status} />
                {isPending && <RequestAgeBadge days={days} />}
                {isPending && r.canDecide && <CanDecideBadge />}
              </div>
              <DialogTitle ref={titleRef} tabIndex={-1} className="text-base leading-tight outline-none">
                {r.functionName ?? "Função"}
                <span className="font-mono text-[13px] text-slate-400 font-normal"> · {targetLabel(r)}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {r.eventName ?? "Evento"}{r.area ? ` · ${r.area}` : ""} · pedido por <span className="font-semibold text-slate-700">{r.requestedByName}</span> em {formatDateTimeBr(r.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-5 py-4 space-y-5">
                <ReasonBlock reason={r.reason} by={r.requestedByName} />

                {type === "ajuste" && (
                  <section className="space-y-2" aria-labelledby="det-diff">
                    <h3 id="det-diff" className={SECTION}>O que muda (de → para)</h3>
                    <DiffTable diff={r.diff} />
                    {r.diff.length === 0 && r.proposed && (
                      <p className="text-[11px] text-slate-400">O pedido não altera nada em relação ao estado atual da vaga (pode já ter sido aplicado).</p>
                    )}
                  </section>
                )}
                {type === "inclusao" && (
                  <section className="space-y-2" aria-labelledby="det-prop">
                    <h3 id="det-prop" className={SECTION}>Vaga(s) proposta(s)</h3>
                    <ProposedList proposed={r.proposed} />
                  </section>
                )}
                {type === "exclusao" && (
                  <p className="text-xs text-red-800 rounded-xl border border-dashed border-red-200 bg-red-50/40 px-3 py-3">
                    Pedido para <span className="font-semibold">remover a vaga</span> da escala. Se aprovado, a vaga fica registrada como negada.
                  </p>
                )}

                {!isPending && (
                  <section className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3" aria-labelledby="det-decision">
                    <h3 id="det-decision" className={SECTION}>Decisão</h3>
                    <p className="text-sm text-slate-800">
                      <RequestStatusBadge status={r.status} className="mr-1.5" />
                      {r.reviewedByName ? <>por <span className="font-semibold">{r.reviewedByName}</span></> : null}
                      {r.reviewedAt ? <span className="text-slate-500"> em {formatDateTimeBr(r.reviewedAt)}</span> : null}
                    </p>
                    {r.reviewComment && <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">{r.reviewComment}</p>}
                  </section>
                )}
              </div>

              {/* Conversa — última seção antes do rodapé de decisão. */}
              <RequestChat requestId={r.id} eventId={r.eventId} />
            </div>

            {showActions && (
              <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 flex flex-wrap items-center justify-between gap-2" role="region" aria-label="Decisão do pedido">
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => onNegar(r)}>
                  <XCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Negar
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={busy} onClick={() => onReajustar(r)}>
                    <PencilLine className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reajustar
                  </Button>
                  <Button ref={approveRef} type="button" size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => onApprove(r)}>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Aprovar
                  </Button>
                </div>
              </div>
            )}
            {!!r && isPending && !r.canDecide && (
              <p className="shrink-0 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500">Só o aprovador desta função (ou admin) pode decidir este pedido. Você pode acompanhar e conversar pelo chat.</p>
            )}
          </>
        ) : (
          <div className="p-6">
            <DialogTitle className="sr-only">Detalhe do pedido</DialogTitle>
            <DialogDescription className="text-sm text-slate-400">Nenhum pedido selecionado.</DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RequestDetailSheet;
