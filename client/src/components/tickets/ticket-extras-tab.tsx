// Aba "Complementos e Histórico": comentários e log da inclusão, com estado
// de carregamento (antes mostrava "Nenhum..." enquanto ainda buscava).
import { useState } from "react";
import { MessageCircle, History, Loader2 } from "lucide-react";
import type { Comment, TeamInclusionLog } from "@shared/schema";

interface TicketExtrasTabProps {
  comments: Comment[] | undefined;
  commentsLoading: boolean;
  logs: TeamInclusionLog[] | undefined;
  logsLoading: boolean;
  getUserName: (userId: string) => string;
  readOnly: boolean;
  onOpenComments: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  status_changed: "🔄 Status Alterado",
  collaborator_changed: "👤 Colaborador Alterado",
  dates_changed: "📅 Período Alterado",
  travel_dates_changed: "✈️ Datas de Viagem",
  observations_changed: "📝 Observações",
  ticket_created: "🎫 Passagem Criada",
  ticket_updated: "✏️ Passagem Atualizada",
  created: "✨ Criado",
  confirmed: "✅ Confirmado",
  reopened: "🔓 Reaberto",
  work_days_changed: "📅 Diárias Editadas",
  daily_rates_changed: "📊 Diárias Alteradas",
  daily_value_changed: "💰 Valor da Diária Alterado",
  city_changed: "📍 Cidade Alterada",
};

const Loading = ({ label }: { label: string }) => (
  <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8" role="status" aria-live="polite">
    <Loader2 className="w-5 h-5 text-slate-300 mx-auto mb-2 animate-spin" />
    <div className="text-[12px] text-slate-400">{label}</div>
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
      <div className="space-y-4">
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-slate-400" />
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Comentários</span>
              {comments && comments.length > 0 && (
                <span className="bg-[#2563EB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{comments.length}</span>
              )}
            </div>
            <button onClick={onOpenComments} className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />
              {readOnly ? "Ver" : "Ver/Adicionar"}
            </button>
          </div>
          <div className="p-4">
            {commentsLoading && !comments ? (
              <Loading label="Carregando comentários..." />
            ) : comments && comments.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {comments.map((comment) => {
                  const author = getUserName(comment.userId);
                  return (
                    <div key={comment.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[9px] font-black shrink-0">
                            {(author || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="text-[12px] font-bold text-slate-700">{author}</div>
                        </div>
                        <div className="text-[10px] text-slate-400">{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString("pt-BR") : ""}</div>
                      </div>
                      <div className="text-[12px] text-slate-600 leading-relaxed">{comment.content}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                <MessageCircle className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                <div className="text-[12px] text-slate-400">Nenhum comentário registrado.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">Histórico</span>
          {logs && logs.length > 0 && <span className="text-[10px] text-slate-400">{logs.length} entr.</span>}
        </div>
        {logsLoading && !logs ? (
          <Loading label="Carregando histórico..." />
        ) : sortedLogs.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
            <History className="w-6 h-6 text-slate-200 mx-auto mb-2" />
            <div className="text-[12px] text-slate-400">Nenhum histórico encontrado.</div>
          </div>
        ) : (
          <div>
            <div className="border-l-2 border-slate-100 ml-3 pl-4 space-y-2 max-h-72 overflow-y-auto">
              {sortedLogs.slice(0, showAllLogs ? undefined : 5).map((log) => (
                <div key={log.id} className="flex gap-3">
                  <div className="w-2.5 h-2.5 bg-[#2563EB] rounded-full -ml-[1.3rem] mt-2.5 flex-shrink-0 ring-4 ring-white" />
                  <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] font-bold text-slate-700">{ACTION_LABELS[log.action] || log.action}</div>
                      <div className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                        {log.createdAt && new Date(log.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {log.details && <div className="text-[11px] text-slate-500 mt-0.5">{log.details}</div>}
                    <div className="text-[10px] font-semibold mt-1" style={{ color: "#2563EB" }}>↳ {log.userName}</div>
                  </div>
                </div>
              ))}
            </div>
            {!showAllLogs && sortedLogs.length > 5 && (
              <button onClick={() => setShowAllLogs(true)} className="text-xs font-medium mt-2 ml-7 hover:underline" style={{ color: "#2563EB" }}>
                Ver todos ({sortedLogs.length - 5} mais)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
