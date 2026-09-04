import { useRef } from "react";
import { CheckCircle2, PencilLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHANGE_REQUEST_STATUS, daysPending, type ChangeRequestType } from "@shared/scaling-validation-rules";
import { isPostValidationInclusion } from "@shared/scaling-change-window";
import type { ChangeRequestItem } from "./types";
import { CanDecideBadge, PostScalingBadge, RequestAgeBadge, RequestStatusBadge, RequestTypeBadge, formatDateTimeBr } from "./request-badges";
import { DiffTable, ProposedList, ReasonBlock, VagaCompleta } from "./request-detail";
import type { TeamInclusion } from "@shared/schema";
import { RequestChat } from "./request-chat";
import { targetLabel } from "./request-queue";
import { approveConsequence } from "./decision-dialogs";
import { SECTION } from "./tokens";

interface RequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ChangeRequestItem | null;
  /** A vaga do pedido, completa — para o aprovador ver o todo, não só o delta. */
  inclusion?: TeamInclusion | null;
  /** A busca separada da vaga falhou (só quando ela não veio na lista). */
  vagaFalhou?: boolean;
  /** Período do evento já formatado ("21/10/2026 – 25/10/2026"). */
  eventPeriod?: string | null;
  onApprove: (r: ChangeRequestItem) => void;
  onReajustar: (r: ChangeRequestItem) => void;
  onNegar: (r: ChangeRequestItem) => void;
  busy?: boolean;
}

/**
 * Nível 2 — detalhe do pedido: de/para, motivo, conversa e ações.
 *
 * Modal central e não gaveta lateral (30/08): a gaveta tinha 576px, e o de/para
 * de três colunas mais os chips de logística quebravam em duas linhas o tempo
 * todo. Com 720px cabe na linha, e o que sobra é menos rolagem para decidir.
 * (Renomeado de "Sheet" para "Dialog" em 04/09 — o nome mentia sobre o que era.)
 */
export function RequestDetailDialog({ open, onOpenChange, request, inclusion, vagaFalhou, eventPeriod, onApprove, onReajustar, onNegar, busy }: RequestDetailDialogProps) {
  const r = request;
  const type = (r?.requestType ?? "ajuste") as ChangeRequestType;
  const isPending = r?.status === CHANGE_REQUEST_STATUS.PENDENTE;
  const showActions = !!r && isPending && r.canDecide;
  const days = r ? daysPending(r.createdAt) : 0;
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Vaga já escalada: aprovar aplica direto na escalação, não devolve à fila.
  const postScaling = isPostValidationInclusion(r?.inclusionState);
  // Ajuste e exclusão agem sobre uma vaga que existe — ela precisa aparecer inteira.
  const temVaga = (type === "ajuste" || type === "exclusao") && !!r?.teamInclusionId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[720px] w-[95vw] max-h-[88vh] rounded-2xl !flex !flex-col p-0 gap-0 overflow-hidden"
        onOpenAutoFocus={(e) => {
          // Foco inicial SEMPRE no título (04/09): cair direto no botão "Aprovar"
          // fazia um Enter distraído virar aprovação antes de ler o pedido.
          if (titleRef.current) { e.preventDefault(); titleRef.current.focus(); }
        }}
      >
        {r ? (
          <>
            <DialogHeader className="shrink-0 px-5 pt-5 pb-3 pr-12 border-b border-slate-100 text-left space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <RequestTypeBadge type={type} />
                {/* O aviso de "já escalado" muda o que aprovar faz — não pode
                    aparecer só na fila e sumir no detalhe. */}
                {postScaling && <PostScalingBadge />}
                <RequestStatusBadge status={r.status} />
                {isPending && r.canDecide && <CanDecideBadge />}
              </div>
              <DialogTitle ref={titleRef} tabIndex={-1} className="text-base leading-tight outline-none">
                {r.functionName ?? "Função"}
                <span className="font-mono text-[13px] text-slate-500 font-normal"> · {targetLabel(r)}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {r.eventName ?? "Evento"}{eventPeriod ? <span className="font-mono tabular-nums"> · {eventPeriod}</span> : null}{r.area ? ` · ${r.area}` : ""} · pedido por <span className="font-semibold text-slate-700">{r.requestedByName}</span> em {formatDateTimeBr(r.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-5 py-4 space-y-5">
                <ReasonBlock reason={r.reason} by={r.requestedByName} />

                {temVaga && (
                  <section className="space-y-2" aria-labelledby="det-vaga">
                    {/* Na exclusão a vaga é o objeto inteiro da decisão: sem ela
                        o aprovador tirava da escala algo que nunca viu. */}
                    <h3 id="det-vaga" className={SECTION}>{type === "exclusao" ? "A vaga que sai da escala" : "A vaga hoje"}</h3>
                    <VagaCompleta inclusion={inclusion} falhou={vagaFalhou} />
                  </section>
                )}
                {type === "ajuste" && (
                  <section className="space-y-2" aria-labelledby="det-diff">
                    <h3 id="det-diff" className={SECTION}>O que muda (de → para)</h3>
                    {/* tom "pedido": aqui é o que a área PEDE, ainda não é resultado. */}
                    <DiffTable diff={r.diff} tom="pedido" />
                    {r.diff.length === 0 && r.proposed && (
                      <p className="text-[11px] text-slate-500">O pedido não altera nada em relação ao estado atual da vaga (pode já ter sido aplicado).</p>
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
                    Pedido para <span className="font-semibold">remover a vaga</span> da escala. {approveConsequence(type, 1, postScaling)}
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
              <div className="shrink-0 border-t border-slate-200 bg-white px-5 pt-2.5 pb-3 space-y-2" role="region" aria-label="Decisão do pedido">
                {/* A consequência antes do botão: o mesmo texto do diálogo de
                    confirmação, para a pessoa saber o destino ANTES de clicar. */}
                <p className="text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">Se aprovar como veio:</span> {approveConsequence(type, r.proposed?.quantity ?? 1, postScaling)}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" size="sm" variant="outline" className="rounded-lg text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => onNegar(r)}>
                    <XCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Negar…
                  </Button>
                  <div className="flex items-center gap-2">
                    {/* Reticências = abre outro passo (comentário obrigatório);
                        "como veio" = a única decisão sem edição. */}
                    <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={busy} onClick={() => onReajustar(r)}>
                      <PencilLine className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reajustar…
                    </Button>
                    <Button type="button" size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => onApprove(r)}>
                      <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Aprovar como veio
                    </Button>
                  </div>
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
            <DialogDescription className="text-sm text-slate-500">Nenhum pedido selecionado.</DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RequestDetailDialog;
