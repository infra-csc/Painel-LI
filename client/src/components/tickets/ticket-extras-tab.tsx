// Aba "Complementos e histórico": comentários e log da inclusão, com estado
// de carregamento (antes mostrava "Nenhum…" enquanto ainda buscava).
//
// 07/10: as duas colunas com o mesmo desenho de seção do resto do modal; a
// linha do tempo sem cartão com sombra em cada evento (era um empilhado de
// caixas) — ponto, ação, quando, detalhe e quem.
import { useState } from "react";
import { MessageCircle, History, Loader2, Plus } from "lucide-react";
import type { Comment, TeamInclusionLog } from "@shared/schema";
import { rotuloDaAcao } from "@shared/inclusion-timeline";
import { SECAO } from "./ticket-summary-tab";

interface TicketExtrasTabProps {
  comments: Comment[] | undefined;
  commentsLoading: boolean;
  logs: TeamInclusionLog[] | undefined;
  logsLoading: boolean;
  getUserName: (userId: string) => string;
  readOnly: boolean;
  onOpenComments: () => void;
}

// 28/09: os rótulos das ações vêm do mapa único em shared/inclusion-timeline
// (`rotuloDaAcao`). O mapa local cobria 14 ações e as outras apareciam cruas
// ("suggestion_approved") no histórico da passagem.

const Loading = ({ label }: { label: string }) => (
  <div className="rounded-xl border border-dashed border-border text-center py-8" role="status" aria-live="polite">
    <Loader2 className="w-5 h-5 text-muted-foreground mx-auto mb-2 animate-spin" aria-hidden="true" />
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const Vazio = ({ icone: Icone, texto }: { icone: typeof History; texto: string }) => (
  <div className="rounded-xl border border-dashed border-border text-center py-8">
    <Icone className="w-5 h-5 text-muted-foreground/60 mx-auto mb-2" aria-hidden="true" />
    <div className="text-xs text-muted-foreground">{texto}</div>
  </div>
);

export default function TicketExtrasTab({ comments, commentsLoading, logs, logsLoading, getUserName, readOnly, onOpenComments }: TicketExtrasTabProps) {
  const [showAllLogs, setShowAllLogs] = useState(false);
  const sortedLogs = logs
    ? [...logs].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Comentários */}
      <section aria-labelledby="extras-comentarios">
        <div className="flex items-center gap-2 mb-3 min-h-7">
          <h3 id="extras-comentarios" className={`${SECAO} !mb-0 flex items-center gap-1.5`}>
            <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />Comentários
          </h3>
          {comments && comments.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-2xs font-semibold tabular-nums text-foreground">{comments.length}</span>
          )}
          <button
            type="button"
            onClick={onOpenComments}
            className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {readOnly ? <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
            {readOnly ? "Ver" : "Ver/Adicionar"}
          </button>
        </div>
        {commentsLoading && !comments ? (
          <Loading label="Carregando comentários…" />
        ) : comments && comments.length > 0 ? (
          <ul className="m-0 p-0 list-none space-y-2 max-h-72 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {comments.map((comment) => {
              const author = getUserName(comment.userId);
              return (
                <li key={comment.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <div className="flex justify-between items-center gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-brand-soft text-primary flex items-center justify-center text-2xs font-semibold shrink-0" aria-hidden="true">
                        {(author || "U").charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-foreground truncate">{author}</span>
                    </div>
                    <span className="text-2xs text-muted-foreground shrink-0">{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString("pt-BR") : ""}</span>
                  </div>
                  <p className="m-0 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vazio icone={MessageCircle} texto="Nenhum comentário registrado." />
        )}
      </section>

      {/* Histórico */}
      <section aria-labelledby="extras-historico">
        <div className="flex items-center gap-2 mb-3 min-h-7">
          <h3 id="extras-historico" className={`${SECAO} !mb-0 flex items-center gap-1.5`}>
            <History className="w-3.5 h-3.5" aria-hidden="true" />Histórico
          </h3>
          {logs && logs.length > 0 && <span className="text-2xs text-muted-foreground tabular-nums">{logs.length} {logs.length === 1 ? "registro" : "registros"}</span>}
        </div>
        {logsLoading && !logs ? (
          <Loading label="Carregando histórico…" />
        ) : sortedLogs.length === 0 ? (
          <Vazio icone={History} texto="Nenhum histórico encontrado." />
        ) : (
          <div>
            <ol className="m-0 p-0 list-none relative max-h-80 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {sortedLogs.slice(0, showAllLogs ? undefined : 5).map((log, i, arr) => (
                <li key={log.id} className="relative flex gap-3 pb-3 last:pb-0">
                  {/* Fio da linha do tempo entre os pontos */}
                  {i < arr.length - 1 && <span aria-hidden="true" className="absolute left-[4px] top-3 bottom-0 w-px bg-border" />}
                  <span aria-hidden="true" className={`relative mt-1.5 w-[9px] h-[9px] rounded-full shrink-0 ring-4 ring-card ${i === 0 ? "bg-primary" : "bg-slate-300"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-foreground">{rotuloDaAcao(log.action)}</div>
                      <time className="text-2xs text-muted-foreground whitespace-nowrap flex-shrink-0 tabular-nums">
                        {log.createdAt && new Date(log.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </div>
                    {log.details && <div className="text-xs text-slate-600 mt-0.5 leading-snug">{log.details}</div>}
                    <div className="text-2xs mt-0.5 text-muted-foreground">por <span className="font-medium text-slate-700">{log.userName}</span></div>
                  </div>
                </li>
              ))}
            </ol>
            {!showAllLogs && sortedLogs.length > 5 && (
              <button type="button" onClick={() => setShowAllLogs(true)} className="mt-2 ml-5 h-7 px-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft">
                Ver todos ({sortedLogs.length - 5} mais)
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
