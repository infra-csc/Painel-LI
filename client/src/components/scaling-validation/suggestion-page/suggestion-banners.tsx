/**
 * Faixas de estado da Sugestão de escala (25/09 — extraídas da página).
 * UMA por vez, nunca três empilhadas — a ordem de prioridade é a do `banner`.
 *
 * 07/10 (redesenho): mesmas frases e ações; os links viraram botões de texto
 * com área de clique de verdade (eram palavras soltas de 12px) e os botões em
 * contorno ganharam o mesmo desenho em todas as faixas.
 */
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, Plus, RotateCw, Undo2 } from "lucide-react";
import { StateBanner } from "@/components/scaling-validation/state-banner";
import { apiErrorMessage, cn } from "@/lib/utils";
import { scalingHref } from "@/lib/use-scaling-event";
import type { ApiError } from "@/components/scaling-validation/types";
import { BANNER_BUTTON, BANNER_DANGER_LINK, BANNER_LINK } from "./suggestion-shared";
import type { SuggestionSend } from "./use-suggestion-send";

export type BannerKind = "sentCheckFailed" | "functionsError" | "sent" | "jaEnviado" | "leitura";

export interface SuggestionBannersProps {
  banner: BannerKind | null;
  send: SuggestionSend;
  eventId: string;
  readOnly: boolean;
  functionsError: unknown;
  refetchFunctions: () => void;
}

export function SuggestionBanners({ banner, send, eventId, readOnly, functionsError, refetchFunctions }: SuggestionBannersProps) {
  const { sentQuery, sentSummary, sent, setSent, cancelSendMutation, setConfirmCancelSend } = send;
  /** Envio somado ao que o evento já tinha: a faixa verde mostra o total real da Validação. */
  const sentTotalExtra = !!sent && sent.eventId === eventId && sentSummary.total > sent.created;
  if (banner === "sentCheckFailed") {
    return (
      <StateBanner
        tone="red" icon={AlertTriangle} role="alert"
        title="Não foi possível verificar se este evento já tem vagas enviadas"
        detail={<>{apiErrorMessage(sentQuery.error as ApiError, "Verifique sua conexão.")} O envio fica bloqueado até essa verificação funcionar — enviar às cegas poderia duplicar a escala. O rascunho local está intacto.</>}
        actions={
          <button
            type="button" className={BANNER_BUTTON}
            disabled={sentQuery.isFetching}
            onClick={() => sentQuery.refetch()}
            data-testid="scaling-suggestion-sent-retry"
          >
            <RotateCw className={cn("h-3.5 w-3.5", sentQuery.isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
            {sentQuery.isFetching ? "Verificando…" : "Tentar novamente"}
          </button>
        }
      />
    );
  }
  if (banner === "functionsError") {
    return (
      <StateBanner
        tone="red" icon={AlertTriangle} role="alert"
        title="Não foi possível carregar as funções"
        detail={<>{apiErrorMessage(functionsError as ApiError, "Sem a lista de funções, não dá para adicionar linhas nem colar da planilha.")} O rascunho local está intacto.</>}
        actions={
          <button type="button" className={BANNER_BUTTON} onClick={() => refetchFunctions()}>
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Tentar novamente
          </button>
        }
      />
    );
  }
  if (banner === "sent" && sent) {
    return (
      <StateBanner
        tone="emerald" icon={CheckCircle2} role="status" testId="sug-faixa-enviado"
        title={`${sent.created} ${sent.created === 1 ? "vaga enviada" : "vagas enviadas"} — as áreas já veem tudo na Validação`}
        detail={
          sent.byFunction.length > 0 || sentTotalExtra ? (
            <span className="tabular-nums">
              {sent.byFunction.map((b) => `${b.name} ×${b.count}`).join(" · ")}
              {/* O evento já tinha vagas: sem isto, o total real na Validação sumia da tela. */}
              {sentTotalExtra && `${sent.byFunction.length > 0 ? " · " : ""}${sentSummary.total} no total na Validação`}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Link href={scalingHref("/scaling-validation", sent.eventId)} className={BANNER_LINK}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ver na Validação
            </Link>
            {/* Desfazer aqui mesmo: é neste instante que o usuário percebe o evento/quantidade errados. */}
            {!readOnly && sentSummary.total > 0 && (
              <button
                type="button"
                onClick={() => setConfirmCancelSend(true)}
                disabled={cancelSendMutation.isPending}
                className={BANNER_DANGER_LINK}
                data-testid="scaling-suggestion-cancel-send-after"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                {cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio"}
              </button>
            )}
            <button type="button" className={cn(BANNER_BUTTON, "ml-1")} onClick={() => setSent(null)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nova sugestão
            </button>
          </>
        }
      />
    );
  }
  if (banner === "jaEnviado") {
    return (
      <StateBanner
        tone="amber" icon={AlertTriangle} role="note" testId="sug-faixa-ja-enviado"
        title={`Este evento já tem ${sentSummary.total} ${sentSummary.total === 1 ? "vaga" : "vagas"} na Validação — enviar de novo soma às que já estão lá`}
        detail={
          <span className="tabular-nums">
            {sentSummary.aguardando} aguardando · {sentSummary.validadas} {sentSummary.validadas === 1 ? "validada" : "validadas"} · {sentSummary.comPedido} com pedido.{" "}
            {/* Em modo leitura a faixa "já enviado" substitui a de leitura — sem este sufixo o usuário não sabia por que nada era editável. */}
            {readOnly
              ? "Você está em modo leitura — só Produção e Admin montam e enviam."
              : "Se a grade subiu errada, cancele o envio e monte de novo."}
          </span>
        }
        actions={
          <>
            <Link href={scalingHref("/scaling-validation", eventId)} className={BANNER_LINK}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Acompanhar
            </Link>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setConfirmCancelSend(true)}
                disabled={cancelSendMutation.isPending}
                className={BANNER_DANGER_LINK}
                data-testid="scaling-suggestion-cancel-send"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                {cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio"}
              </button>
            )}
          </>
        }
      />
    );
  }
  if (banner === "leitura") {
    return (
      <StateBanner
        tone="slate" icon={Eye} role="note"
        title="Modo leitura — só Produção e Admin montam e enviam"
        detail="Você pode consultar o evento e seguir para as outras telas do módulo."
        actions={
          <Link href={scalingHref("/scaling-validation", eventId)} className={BANNER_LINK}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Abrir na Validação
          </Link>
        }
      />
    );
  }
  return null;
}
