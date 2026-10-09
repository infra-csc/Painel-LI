// Extraído de invoices.tsx em 25/09 (modularização): painel inline que abre
// abaixo da linha na aba Aprovação RH — confirmar aprovação, devolver com
// motivo, recusar em definitivo ou fazer o check-in financeiro. O estado
// (motivo, data) e as mutations continuam na aba; aqui só a apresentação.
//
// 08/10 (redesenho): continua inline (decidir nota por nota sem abrir e
// fechar modal é o ritmo do RH), mas com o desenho de um diálogo do sistema:
// ícone e título que dizem a decisão, uma frase do que acontece depois, o
// campo com rótulo e erro no lugar, e as ações à direita com o verbo da
// decisão ("Confirmar aprovação", não "✓ Confirmar"). Esc cancela; Ctrl+Enter
// confirma o motivo. A recusa ganhou a mesma validação do motivo da devolução.
import type { KeyboardEvent, ReactNode } from "react";
import { CheckCircle2, RotateCcw, CircleDot, Ban, Loader2 } from "lucide-react";
import type { Invoice } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/components/forms/required-mark";
import { MensagemDeErro } from "@/components/forms/mensagem-de-erro";
import { campoComErro } from "@/lib/campo-com-erro";
import type { StatusCfg } from "./invoice-status";
import type { AcaoNfMutation, AprovAction } from "./types";

export interface AprovacaoActionPanelProps {
  inv: Invoice;
  cfg: StatusCfg;
  type: AprovAction;
  comment: string;
  setComment: (v: string) => void;
  tocouMotivo: boolean;
  setTocouMotivo: (v: boolean) => void;
  checkinDate: string;
  setCheckinDate: (v: string) => void;
  closeAction: () => void;
  approveMutation: AcaoNfMutation;
  returnMutation: AcaoNfMutation;
  rejectMutation: AcaoNfMutation;
  checkinMutation: AcaoNfMutation;
  /** Nome do colaborador e valor formatado — só para o texto do painel. */
  nome?: string;
  valor?: string;
  /** Quantas colunas a linha ocupa (6 desde 08/10). */
  colunas?: number;
}

const ROTULO = "block mb-1 text-xs font-medium text-slate-700";
const CANCELAR = "pas-alvo h-8 px-3 rounded-lg text-xs font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CONFIRMAR = "pas-alvo inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-45 disabled:cursor-not-allowed";

/** Cabeçalho do painel: o ícone da decisão, o título e o que acontece depois. */
function Cabecalho({ icone, tom, titulo, children }: { icone: ReactNode; tom: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span aria-hidden="true" className={`mt-px inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${tom}`}>{icone}</span>
      <div className="min-w-0">
        <p className="m-0 text-sm font-semibold leading-5 text-foreground">{titulo}</p>
        {children && <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</p>}
      </div>
    </div>
  );
}

export function AprovacaoActionPanel({
  inv, cfg, type, comment, setComment, tocouMotivo, setTocouMotivo, checkinDate, setCheckinDate, closeAction,
  approveMutation, returnMutation, rejectMutation, checkinMutation, nome, valor, colunas = 6,
}: AprovacaoActionPanelProps) {
  const quem = nome ? <>a nota de <strong className="font-semibold text-slate-700">{nome}</strong>{valor ? <> ({valor})</> : null}</> : "a nota";
  const faltaMotivo = tocouMotivo && !comment.trim();

  // Esc cancela de qualquer ponto do painel (o foco nasce no campo).
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAction(); }
  };
  // Ctrl/⌘ + Enter confirma o motivo sem tirar a mão do teclado.
  const confirmarMotivo = (mutation: AcaoNfMutation) => {
    setTocouMotivo(true);
    if (comment.trim() && !mutation.isPending) mutation.mutate(inv.id);
  };
  const atalhoDoMotivo = (mutation: AcaoNfMutation) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmarMotivo(mutation); }
  };

  return (
    <tr className={`nf-painel-linha border-l-[3px] border-b border-border ${cfg.borderCls}`}>
      <td colSpan={colunas} className="p-0">
        <div
          className="nf-painel nf-abre"
          onKeyDown={aoTeclar}
          role="group"
          aria-label={
            type === "approve" ? "Confirmar aprovação da nota" :
            type === "return" ? "Devolver a nota para ajuste" :
            type === "reject" ? "Recusar a nota fiscal" : "Check-in financeiro"
          }
        >

          {/* ── Aprovar ── */}
          {type === "approve" && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex-1 min-w-[240px]">
                <Cabecalho icone={<CheckCircle2 className="w-4 h-4" />} tom="bg-success-soft text-success" titulo="Confirmar aprovação">
                  Aprovar {quem}? Em seguida o RH faz o check-in financeiro e define a data de pagamento.
                </Cabecalho>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button type="button" onClick={closeAction} className={CANCELAR}>Cancelar</button>
                <button
                  type="button"
                  onClick={() => approveMutation.mutate(inv.id)}
                  disabled={approveMutation.isPending}
                  aria-busy={approveMutation.isPending || undefined}
                  autoFocus
                  className={`${CONFIRMAR} bg-success text-white hover:bg-success-strong`}
                >
                  {approveMutation.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Aprovando…</>
                    : <><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />Confirmar aprovação</>}
                </button>
              </div>
            </div>
          )}

          {/* ── Devolver ── */}
          {type === "return" && (
            <div className="space-y-3">
              <Cabecalho icone={<RotateCcw className="w-4 h-4" />} tom="bg-warning-soft text-warning" titulo="Devolver para ajuste">
                O motivo aparece no lançamento; depois de corrigida e reenviada, {quem} volta para esta fila.
              </Cabecalho>
              <div className="max-w-[760px] sm:pl-[38px]">
                <label htmlFor={`nf-return-${inv.id}`} className={ROTULO}>
                  Motivo da devolução<RequiredMark />
                </label>
                <Textarea
                  id={`nf-return-${inv.id}`}
                  rows={3}
                  value={comment}
                  aria-required="true"
                  {...campoComErro(`nf-return-${inv.id}`, faltaMotivo ? "Informe o motivo da devolução." : undefined)}
                  onChange={e => setComment(e.target.value)}
                  onBlur={() => setTocouMotivo(true)}
                  onKeyDown={atalhoDoMotivo(returnMutation)}
                  placeholder="Descreva o que precisa ser corrigido (nota fiscal ou número OC)…"
                  className="text-sm rounded-lg border-border resize-none w-full focus-visible:ring-primary/30 focus-visible:ring-offset-0 aria-[invalid=true]:border-danger"
                  autoFocus
                />
                <MensagemDeErro id={`nf-return-${inv.id}`} erro={faltaMotivo ? "Informe o motivo da devolução." : undefined} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="hidden md:inline mr-auto sm:pl-[38px] text-2xs text-muted-foreground">Ctrl + Enter confirma · Esc cancela</span>
                <button type="button" onClick={closeAction} className={CANCELAR}>Cancelar</button>
                <button
                  type="button"
                  onClick={() => confirmarMotivo(returnMutation)}
                  disabled={!comment.trim() || returnMutation.isPending}
                  aria-busy={returnMutation.isPending}
                  className={`${CONFIRMAR} bg-warning-strong text-white hover:bg-warning`}
                >
                  {returnMutation.isPending ? "Devolvendo…" : "Confirmar devolução"}
                </button>
              </div>
            </div>
          )}

          {/* ── Recusar (terminal) ── */}
          {type === "reject" && (
            <div className="space-y-3">
              <Cabecalho icone={<Ban className="w-4 h-4" />} tom="bg-danger-soft text-danger" titulo="Recusar nota fiscal">
                <span className="text-danger">A recusa é definitiva: a nota não poderá ser corrigida nem reenviada.</span> Para pedir ajustes, use <strong className="font-semibold text-slate-700">Devolver</strong>.
              </Cabecalho>
              <div className="max-w-[760px] sm:pl-[38px]">
                <label htmlFor={`nf-reject-${inv.id}`} className={ROTULO}>
                  Motivo da recusa<RequiredMark />
                </label>
                <Textarea
                  id={`nf-reject-${inv.id}`}
                  rows={3}
                  value={comment}
                  aria-required="true"
                  {...campoComErro(`nf-reject-${inv.id}`, faltaMotivo ? "Informe o motivo da recusa." : undefined)}
                  onChange={e => setComment(e.target.value)}
                  onBlur={() => setTocouMotivo(true)}
                  onKeyDown={atalhoDoMotivo(rejectMutation)}
                  placeholder="Explique por que esta nota está sendo recusada em definitivo…"
                  className="text-sm rounded-lg border-border resize-none w-full focus-visible:ring-primary/30 focus-visible:ring-offset-0 aria-[invalid=true]:border-danger"
                  autoFocus
                />
                <MensagemDeErro id={`nf-reject-${inv.id}`} erro={faltaMotivo ? "Informe o motivo da recusa." : undefined} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="hidden md:inline mr-auto sm:pl-[38px] text-2xs text-muted-foreground">Ctrl + Enter confirma · Esc cancela</span>
                <button type="button" onClick={closeAction} className={CANCELAR}>Cancelar</button>
                <button
                  type="button"
                  onClick={() => confirmarMotivo(rejectMutation)}
                  disabled={!comment.trim() || rejectMutation.isPending}
                  aria-busy={rejectMutation.isPending}
                  className={`${CONFIRMAR} bg-danger text-white hover:bg-danger-strong`}
                >
                  {rejectMutation.isPending ? "Recusando…" : "Confirmar recusa"}
                </button>
              </div>
            </div>
          )}

          {/* ── Check-in ── */}
          {type === "checkin" && (
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="flex-1 min-w-[240px] self-center">
                <Cabecalho icone={<CircleDot className="w-4 h-4" />} tom="bg-brand-soft text-primary" titulo="Check-in financeiro">
                  Informe a data de pagamento d{nome ? <>a nota de <strong className="font-semibold text-slate-700">{nome}</strong></> : "esta nota"}.
                </Cabecalho>
              </div>
              <div className="flex flex-wrap items-end gap-2 ml-auto">
                <div>
                  <label htmlFor={`nf-checkin-${inv.id}`} className={ROTULO}>
                    Data de pagamento<RequiredMark />
                  </label>
                  <input
                    id={`nf-checkin-${inv.id}`}
                    type="date"
                    value={checkinDate}
                    aria-required="true"
                    onChange={e => setCheckinDate(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && checkinDate && !checkinMutation.isPending) { e.preventDefault(); checkinMutation.mutate(inv.id); } }}
                    autoFocus
                    className="pas-alvo h-8 w-[168px] rounded-lg border border-border bg-card px-2.5 text-sm tabular-nums text-foreground outline-none transition-[border-color,box-shadow] hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12"
                  />
                </div>
                <button type="button" onClick={closeAction} className={CANCELAR}>Cancelar</button>
                <button
                  type="button"
                  onClick={() => checkinMutation.mutate(inv.id)}
                  disabled={!checkinDate || checkinMutation.isPending}
                  aria-busy={checkinMutation.isPending || undefined}
                  title={!checkinDate ? "Informe a data de pagamento" : undefined}
                  className={`${CONFIRMAR} bg-primary text-primary-foreground hover:bg-primary-hover`}
                >
                  {checkinMutation.isPending ? "Salvando…" : "Confirmar check-in"}
                </button>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
