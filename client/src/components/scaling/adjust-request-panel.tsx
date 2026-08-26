/**
 * "Precisa mudar algo?" — pedido de ajuste de uma vaga JÁ ESCALADA, dentro do
 * modal de Escalação.
 *
 * Regra do dono (26/08): o pedido de ajuste deixou de morrer no fim da
 * validação. Depois de escalado, a área ainda pede mudança de dias, diárias ou
 * viagem — pelo modal de Escalação — ATÉ A PASSAGEM SER COMPRADA. Sem passagem,
 * pode sempre. Depois da compra, só o administrador (a área é mandada para a
 * logística).
 *
 * Quem manda na resposta é o servidor: `GET /api/team-inclusions/:id/change-window`
 * devolve papel, janela e o pedido pendente. Esta tela não recalcula permissão —
 * só desenha o que a API respondeu, para não prometer um botão que a API recusa.
 * O diálogo é o MESMO da Validação (`AdjustRequestDialog`), então o formulário e
 * o "de/para" que o aprovador vê são idênticos nos dois caminhos.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilLine, Clock, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdjustRequestDialog } from "@/components/scaling-validation/change-request-dialogs";
import { invalidateScalingQueries } from "@/components/scaling-validation/types";
import { formatDateBr } from "@/lib/dates";
import { CHANGE_REQUEST_TYPE_LABELS } from "@shared/scaling-validation-rules";
import type { ChangeWindowBlock } from "@shared/scaling-change-window";
import type { Event, TeamInclusion } from "@shared/schema";

/** Resposta de GET /api/team-inclusions/:id/change-window */
export interface ChangeWindowResponse {
  /** O ator é validador da função (ou admin) — só quem pode pedir vê o cartão. */
  canRequest: boolean;
  /** A janela permite abrir pedido agora (já considerando admin). */
  allowed: boolean;
  /** Código do bloqueio (null = evento encerrado ou nenhum). */
  block?: ChangeWindowBlock | null;
  /** Motivo do bloqueio em pt-BR, quando `allowed` é false. */
  message?: string | null;
  /** Vaga já escalada (muda o texto do diálogo). */
  postScaling: boolean;
  /** Passou só porque é administrador — a área veria bloqueio. */
  adminOverride: boolean;
  /** Existe passagem em preparação (ainda não comprada) para esta vaga. */
  ticketInProgress?: boolean;
  /** Pedido em aberto desta vaga, se houver. */
  pendingRequest: {
    id: string;
    requestType: "ajuste" | "inclusao" | "exclusao";
    reason: string | null;
    requestedByName: string | null;
    createdAt: string | null;
  } | null;
}

/**
 * Janela de pedido de UMA vaga. A chave é a mesma em todos os pontos de uso, e
 * o TanStack faz uma requisição só — o modal inteiro (rodapé, cartões, este
 * painel) enxerga o mesmo estado.
 */
export function useChangeWindow(inclusionId: string | undefined, enabled = true) {
  return useQuery<ChangeWindowResponse>({
    queryKey: [`/api/team-inclusions/${inclusionId}/change-window`],
    enabled: enabled && !!inclusionId,
    // Estado de outra pessoa (a logística pode comprar a passagem, o aprovador
    // pode decidir enquanto o modal está aberto): não guarda resposta velha.
    staleTime: 0,
  });
}

/**
 * Motivo (pt-BR) para travar TODA ação da Escalação — regra do dono (26/08):
 * "enquanto tiver pedido de ajuste, bloquear qualquer ação e detalhar o
 * porquê". Salvar/confirmar/trocar por baixo de um pedido em análise faria o
 * aprovador decidir sobre uma vaga que já mudou.
 */
export function pendingRequestLock(w: ChangeWindowResponse | undefined): string | null {
  const p = w?.pendingRequest;
  if (!p) return null;
  const tipo = (CHANGE_REQUEST_TYPE_LABELS[p.requestType] ?? p.requestType).toLowerCase();
  const quem = p.requestedByName ? ` por ${p.requestedByName}` : "";
  const quando = p.createdAt ? ` em ${formatDateBr(p.createdAt)}` : "";
  const motivo = p.reason?.trim() ? ` Motivo: “${p.reason.trim()}”.` : "";
  return `Pedido de ${tipo} em análise${quem}${quando} — a escalação fica travada até o aprovador decidir.${motivo}`;
}

const CARD = "mt-5 border rounded-2xl overflow-hidden";
const HEAD = "border-b px-4 py-2.5 flex items-center gap-2 flex-wrap";
const HEAD_LABEL = "text-[11px] font-black uppercase tracking-[0.12em]";

export function AdjustRequestPanel({ inclusion, event, functionName }: {
  inclusion: TeamInclusion;
  event?: Event;
  functionName?: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading } = useChangeWindow(inclusion.id);

  // Enquanto carrega, nada — piscar um botão que pode não existir é pior que esperar.
  if (isLoading || !data || !data.canRequest) return null;

  const pending = data.pendingRequest;

  if (pending) {
    const tipo = CHANGE_REQUEST_TYPE_LABELS[pending.requestType] ?? pending.requestType;
    return (
      <div className={`${CARD} border-amber-200`} data-testid="card-pedido-ajuste-pendente">
        <div className={`${HEAD} bg-amber-50 border-amber-100`}>
          <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
          <span className={`${HEAD_LABEL} text-amber-700`}>Pedido de {tipo.toLowerCase()} em análise</span>
        </div>
        <div className="px-4 py-3 space-y-1">
          <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
            {pending.reason?.trim() || "Sem motivo informado."}
          </p>
          <p className="text-[11px] text-slate-500">
            {pending.requestedByName ?? "Área"}
            {pending.createdAt ? ` · ${formatDateBr(pending.createdAt)}` : ""}
            {" · aguardando o aprovador. A escalação continua como está até a decisão."}
          </p>
        </div>
      </div>
    );
  }

  if (!data.allowed) {
    // Vaga cancelada ou excluída não ganha cartão: a tela já mostra isso no
    // status, e um aviso de "ajuste indisponível" só ocuparia espaço.
    if (data.block === "vaga_cancelada" || data.block === "vaga_excluida") return null;
    return (
      <div className={`${CARD} border-slate-200`} data-testid="card-pedido-ajuste-bloqueado">
        <div className={`${HEAD} bg-slate-50 border-slate-100`}>
          <Lock className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className={`${HEAD_LABEL} text-slate-500`}>Ajuste indisponível</span>
        </div>
        <div className="px-4 py-3">
          <p className="text-[13px] text-slate-600 leading-relaxed">{data.message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`${CARD} border-slate-200`} data-testid="card-pedir-ajuste">
        <div className={`${HEAD} bg-slate-50 border-slate-100`}>
          <PencilLine className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className={`${HEAD_LABEL} text-slate-500`}>Precisa mudar algo?</span>
        </div>
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-slate-600 leading-snug max-w-xl">
            Dias, diárias ou viagem desta vaga podem ser ajustados por pedido ao aprovador
            {data.adminOverride
              ? " — a passagem já foi comprada, e só o administrador consegue abrir este pedido."
              : ", enquanto a passagem não for comprada."}
            {data.ticketInProgress && (
              <span className="block mt-1 text-amber-700">
                A logística já está preparando a passagem desta vaga — mudar datas agora significa refazer a cotação.
              </span>
            )}
          </p>
          <Button
            type="button" variant="outline" onClick={() => setOpen(true)}
            className="rounded-lg bg-white border-slate-200 hover:bg-brand-soft hover:text-primary"
            data-testid="button-pedir-ajuste-escalacao"
          >
            <PencilLine className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Pedir ajuste
          </Button>
        </div>
      </div>

      <AdjustRequestDialog
        open={open}
        onOpenChange={setOpen}
        inclusion={inclusion}
        event={event}
        functionName={functionName}
        postScaling={data.postScaling}
        onSent={() => {
          invalidateScalingQueries(queryClient);
          queryClient.invalidateQueries({ queryKey: [`/api/team-inclusions/${inclusion.id}/change-window`] });
        }}
      />
    </>
  );
}
