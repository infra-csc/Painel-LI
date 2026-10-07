import { useRef } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Gavel, Info, ListChecks, MessageSquare, PencilLine, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CHANGE_REQUEST_STATUS, type ChangeRequestType } from "@shared/scaling-validation-rules";
import { isPostValidationInclusion } from "@shared/scaling-change-window";
import { Card, Destaque } from "@/components/scaling-validation/suggestion-detail-helpers";
import type { ChangeRequestItem } from "./types";
import { CanDecideBadge, PostScalingBadge, RequestStatusBadge, RequestTypeBadge, formatDateTimeBr } from "./request-badges";
import { DiffTable, ProposedList, ReasonBlock, VagaCompleta } from "./request-detail";
import type { TeamInclusion } from "@shared/schema";
import { RequestChat } from "./request-chat";
import { targetLabel } from "./request-queue";
import { approveConsequence } from "./decision-dialogs";

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

/** Tom do aviso da decisão já tomada, pelo status do pedido. */
const TOM_DA_DECISAO: Record<string, string> = {
  aprovado: "border-success/25 bg-success-soft/60 text-success",
  reajustado: "border-info/30 bg-info-soft text-info",
  negado: "border-danger/25 bg-danger-soft/60 text-danger",
};

/**
 * Nível 2 — detalhe do pedido: o que muda, a vaga, o motivo, a conversa e as ações.
 *
 * Modal central e não gaveta lateral (30/08): a gaveta tinha 576px, e o de/para
 * de três colunas mais os chips de logística quebravam em duas linhas o tempo
 * todo. Com 720px cabe na linha, e o que sobra é menos rolagem para decidir.
 * (Renomeado de "Sheet" para "Dialog" em 04/09 — o nome mentia sobre o que era.)
 *
 * 07/10 (redesenho): o desenho do detalhe da vaga na Validação — cabeçalho com
 * "#vaga" discreto, o nome da função como título e os fatos numa linha; corpo
 * em seções com moldura e título em caixa de frase ("O que muda", "A vaga
 * hoje", "Conversa do pedido"); avisos com filete (motivo, vaga já escalada,
 * decisão tomada) e o rodapé de decisão com uma ação cheia só.
 */
export function RequestDetailDialog({ open, onOpenChange, request, inclusion, vagaFalhou, eventPeriod, onApprove, onReajustar, onNegar, busy }: RequestDetailDialogProps) {
  const r = request;
  const type = (r?.requestType ?? "ajuste") as ChangeRequestType;
  const isPending = r?.status === CHANGE_REQUEST_STATUS.PENDENTE;
  const showActions = !!r && isPending && r.canDecide;
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Vaga já escalada: aprovar aplica direto na escalação, não devolve à fila.
  const postScaling = isPostValidationInclusion(r?.inclusionState);
  // Ajuste e exclusão agem sobre uma vaga que existe — ela precisa aparecer inteira.
  const temVaga = (type === "ajuste" || type === "exclusao") && !!r?.teamInclusionId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!flex w-[95vw] !max-w-[760px] max-h-[90vh] flex-col gap-0 overflow-hidden rounded-xl p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:rounded-none"
        onOpenAutoFocus={(e) => {
          // Foco inicial SEMPRE no título (04/09): cair direto no botão "Aprovar"
          // fazia um Enter distraído virar aprovação antes de ler o pedido.
          if (titleRef.current) { e.preventDefault(); titleRef.current.focus(); }
        }}
      >
        {r ? (
          <>
            <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-5 pb-3.5 pt-4 pr-12 text-left sm:px-6">
              <p className="text-xs font-medium tabular-nums text-muted-foreground">{targetLabel(r)}</p>
              <DialogTitle ref={titleRef} tabIndex={-1} className="text-lg font-semibold leading-tight tracking-[-0.01em] outline-none">
                {r.functionName ?? "Função"}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p className="flex flex-wrap items-center gap-x-1.5">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="font-medium text-slate-700">{r.eventName ?? "Evento"}</span>
                    {eventPeriod ? <span className="tabular-nums">· {eventPeriod}</span> : null}
                  </p>
                  <p>Pedido por <span className="font-semibold text-slate-700">{r.requestedByName}</span> em <span className="tabular-nums">{formatDateTimeBr(r.createdAt)}</span></p>
                </div>
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <RequestTypeBadge type={type} />
                {/* O aviso de "já escalado" muda o que aprovar faz — não pode
                    aparecer só na fila e sumir no detalhe. */}
                {postScaling && <PostScalingBadge />}
                <RequestStatusBadge status={r.status} />
                {isPending && r.canDecide && <CanDecideBadge />}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto bg-surface-muted/50">
              <div className="space-y-3.5 px-4 py-4 sm:px-6">
                {!isPending && (
                  <Destaque
                    id="det-decision"
                    tom={TOM_DA_DECISAO[r.status] ?? "border-border bg-card text-slate-700"}
                    icon={Gavel}
                    title="Decisão do aprovador"
                    meta={r.reviewedByName || r.reviewedAt ? <>
                      {r.reviewedByName ? <>por <span className="font-semibold">{r.reviewedByName}</span></> : null}
                      {r.reviewedAt ? <> em {formatDateTimeBr(r.reviewedAt)}</> : null}
                    </> : undefined}
                  >
                    {r.reviewComment || <span className="text-muted-foreground">Sem comentário do aprovador.</span>}
                  </Destaque>
                )}

                <ReasonBlock reason={r.reason} by={r.requestedByName} />

                {/* Vaga já escalada: o caminho muda, e o aprovador precisa saber
                    ANTES de abrir o diálogo — "devolver para validação" não
                    existe aqui (o servidor recusa: a vaga não está em fila). */}
                {postScaling && isPending && (
                  <Destaque id="det-ja-escalado" tom="border-info/30 bg-info-soft text-info" icon={Info} title="A pessoa já está escalada">
                    <span className="text-sm text-slate-700">
                      Aprovar ou reajustar aplica a mudança direto na escalação. Não há como devolver esta vaga para a validação da área — ela já saiu da fila.
                      {type === "ajuste" ? " Se a vaga já tiver passagem ou hospedagem, Compras recebe um aviso para rever." : ""}
                    </span>
                  </Destaque>
                )}

                {type === "ajuste" && (
                  <Card id="det-diff" title="O que muda (de → para)" icon={ListChecks}
                    acessorio={<span className="text-2xs tabular-nums text-muted-foreground">{r.diff.length} {r.diff.length === 1 ? "campo" : "campos"}</span>}>
                    {/* tom "pedido": aqui é o que a área PEDE, ainda não é resultado. */}
                    <DiffTable diff={r.diff} tom="pedido" />
                    {r.diff.length === 0 && r.proposed && (
                      <p className="text-2xs text-muted-foreground">O pedido não altera nada em relação ao estado atual da vaga (pode já ter sido aplicado).</p>
                    )}
                  </Card>
                )}
                {type === "inclusao" && (
                  <Card id="det-prop" title="Vaga(s) proposta(s)" icon={ClipboardList}>
                    <ProposedList proposed={r.proposed} />
                  </Card>
                )}
                {type === "exclusao" && (
                  <Destaque id="det-exclusao" tom="border-danger/25 bg-danger-soft/60 text-danger" icon={Trash2} title="Pedido para remover a vaga da escala">
                    <span className="text-sm text-slate-700">{approveConsequence(type, 1, postScaling)}</span>
                  </Destaque>
                )}

                {temVaga && (
                  // Na exclusão a vaga é o objeto inteiro da decisão: sem ela
                  // o aprovador tirava da escala algo que nunca viu.
                  <Card id="det-vaga" title={type === "exclusao" ? "A vaga que sai da escala" : "A vaga hoje"} icon={ClipboardList}>
                    <VagaCompleta inclusion={inclusion} falhou={vagaFalhou} />
                  </Card>
                )}

                {/* Conversa — última seção antes do rodapé de decisão. */}
                <Card id="det-conversa" title="Conversa do pedido" icon={MessageSquare}
                  acessorio={<span className="hidden text-2xs text-muted-foreground sm:inline">Ctrl+Enter envia</span>}>
                  <div className="apr-conversa -mx-1">
                    <RequestChat requestId={r.id} eventId={r.eventId} />
                  </div>
                </Card>
              </div>
            </div>

            {showActions && (
              <div className="shrink-0 space-y-2.5 border-t border-border bg-card px-5 pb-4 pt-3 sm:px-6" role="region" aria-label="Decisão do pedido">
                {/* A consequência antes do botão: o mesmo texto do diálogo de
                    confirmação, para a pessoa saber o destino ANTES de clicar. */}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-slate-700">Se aprovar como veio:</span> {approveConsequence(type, r.proposed?.quantity ?? 1, postScaling)}
                </p>
                {/* No celular: "Aprovar como veio" inteiro em cima, os dois
                    caminhos com mais um passo lado a lado embaixo. */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between">
                  <Button type="button" variant="ghost" className="val-alvo order-2 h-9 rounded-lg text-danger hover:bg-danger-soft hover:text-danger sm:order-none" disabled={busy} onClick={() => onNegar(r)}>
                    <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" /> Negar…
                  </Button>
                  <div className="contents sm:flex sm:items-center sm:gap-2">
                    {/* Reticências = abre outro passo (comentário obrigatório);
                        "como veio" = a única decisão sem edição. */}
                    <Button type="button" variant="outline" className="val-alvo order-3 h-9 rounded-lg bg-card sm:order-none" disabled={busy} onClick={() => onReajustar(r)}>
                      <PencilLine className="mr-1.5 h-4 w-4" aria-hidden="true" /> Reajustar…
                    </Button>
                    <Button type="button" className={cn("val-alvo order-1 col-span-2 h-9 rounded-lg bg-success px-4 font-semibold text-white shadow-1 hover:bg-success/90 sm:order-none")} disabled={busy} onClick={() => onApprove(r)}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Aprovar como veio
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {!!r && isPending && !r.canDecide && (
              <p className="shrink-0 border-t border-border bg-card px-5 py-3 text-xs text-muted-foreground sm:px-6">Só o aprovador desta função (ou admin) pode decidir este pedido. Você pode acompanhar e conversar pelo chat.</p>
            )}
          </>
        ) : (
          <div className="p-6">
            <DialogTitle className="sr-only">Detalhe do pedido</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Nenhum pedido selecionado.</DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RequestDetailDialog;
