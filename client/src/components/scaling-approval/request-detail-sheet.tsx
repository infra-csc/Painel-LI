import { CheckCircle2, PencilLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateBr } from "@/lib/dates";
import { CHANGE_REQUEST_STATUS, daysPending, type ChangeRequestType } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem } from "./types";
import { RequestAgeBadge, RequestStatusBadge, RequestTypeBadge } from "./request-badges";
import { DiffTable, ProposedList, ReasonBlock } from "./request-detail";
import { RequestChat } from "./request-chat";

interface RequestDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ChangeRequestItem | null;
  onApprove: (r: ChangeRequestItem) => void;
  onReajustar: (r: ChangeRequestItem) => void;
  onNegar: (r: ChangeRequestItem) => void;
  busy?: boolean;
}

function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const SECTION = "text-[11px] font-bold uppercase tracking-wide text-slate-500";

/** Nível 2 — detalhe do pedido (drawer lateral): de/para, motivo, chat e ações. */
export function RequestDetailSheet({ open, onOpenChange, request, onApprove, onReajustar, onNegar, busy }: RequestDetailSheetProps) {
  const r = request;
  const type = (r?.requestType ?? "ajuste") as ChangeRequestType;
  const isPending = r?.status === CHANGE_REQUEST_STATUS.PENDENTE;
  const showActions = !!r && isPending && r.canDecide;
  const days = r ? daysPending(r.createdAt) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden">
        {r ? (
          <>
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-100 text-left space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <RequestTypeBadge type={type} />
                <RequestStatusBadge status={r.status} />
                {isPending && <RequestAgeBadge days={days} />}
              </div>
              <SheetTitle className="text-base leading-tight">
                {r.functionName ?? "Função"}
                {r.inclusionNumber ? <span className="font-mono text-sm text-slate-400 font-normal"> · vaga #{r.inclusionNumber}</span> : null}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {r.eventName ?? "Evento"}{r.area ? ` · ${r.area}` : ""} · pedido por <span className="font-semibold text-slate-700">{r.requestedByName}</span> em {fmtDateTime(r.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
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
                  <p className="text-xs text-slate-500 rounded-xl border border-dashed border-red-200 bg-red-50/40 px-3 py-3">
                    Pedido para <span className="font-semibold text-red-700">remover a vaga</span> da escala. Se aprovado, a vaga fica registrada como negada.
                  </p>
                )}

                {!isPending && (
                  <section className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3" aria-labelledby="det-decision">
                    <h3 id="det-decision" className={SECTION}>Decisão</h3>
                    <p className="text-sm text-slate-800">
                      <RequestStatusBadge status={r.status} className="mr-1.5" />
                      {r.reviewedByName ? <>por <span className="font-semibold">{r.reviewedByName}</span></> : null}
                      {r.reviewedAt ? <span className="text-slate-500"> em {fmtDateTime(r.reviewedAt)}</span> : null}
                    </p>
                    {r.reviewComment && <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">{r.reviewComment}</p>}
                  </section>
                )}
              </div>

              <RequestChat requestId={r.id} eventId={r.eventId} />
            </div>

            {showActions && (
              <div className="border-t border-slate-200 bg-white px-5 py-3 flex flex-wrap items-center gap-2" role="region" aria-label="Decisão do pedido">
                <Button type="button" size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => onApprove(r)}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Aprovar
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={busy} onClick={() => onReajustar(r)}>
                  <PencilLine className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reajustar
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => onNegar(r)}>
                  <XCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Negar
                </Button>
              </div>
            )}
            {!!r && isPending && !r.canDecide && (
              <p className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-400">Só o aprovador desta função (ou admin) pode decidir este pedido.</p>
            )}
          </>
        ) : (
          <div className="p-6 text-sm text-slate-400">Nenhum pedido selecionado.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default RequestDetailSheet;
