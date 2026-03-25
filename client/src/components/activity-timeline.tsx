import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Edit2, Trash2, CheckCircle, RotateCcw, XCircle,
  Clock, Send, ChevronDown, ChevronUp, History, User
} from "lucide-react";

interface ActivityLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  details?: string;
  previous_data?: string | null;
  new_data?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  created_at?: string | null;
}

const ACTION_CONFIG: Record<string, { dotColor: string; bg: string; text: string; Icon: any; label: string }> = {
  create:      { dotColor: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700',    Icon: Plus,         label: 'Criado' },
  update:      { dotColor: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   Icon: Edit2,        label: 'Editado' },
  edit:        { dotColor: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   Icon: Edit2,        label: 'Editado' },
  delete:      { dotColor: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     Icon: Trash2,       label: 'Excluído' },
  approve:     { dotColor: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: CheckCircle,  label: 'Aprovado' },
  aprovado:    { dotColor: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: CheckCircle,  label: 'Aprovado' },
  return:      { dotColor: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700',  Icon: RotateCcw,    label: 'Devolvido' },
  devolvido:   { dotColor: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700',  Icon: RotateCcw,    label: 'Devolvido' },
  reject:      { dotColor: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     Icon: XCircle,      label: 'Recusado' },
  rejeitado:   { dotColor: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     Icon: XCircle,      label: 'Recusado' },
  send_review: { dotColor: 'bg-violet-500',  bg: 'bg-violet-50',  text: 'text-violet-700',  Icon: Send,         label: 'Enviado para revisão' },
};

const FIELD_LABELS: Record<string, string> = {
  dailyValue: 'Valor Diária',
  dailyQuantity: 'Qtd Diárias',
  mobility: 'Mobilidade',
  transport: 'Translado',
  weekdayLunch: 'Almoço (semana)',
  weekdayDinner: 'Jantar (semana)',
  weekendLunch: 'Almoço (fds)',
  weekendDinner: 'Jantar (fds)',
  totalValue: 'Valor Total',
  sentForReview: 'Enviado para revisão',
  rhStatus: 'Status RH',
  rhComment: 'Comentário RH',
  changeReason: 'Justificativa',
  didNotAttend: 'Não participou',
  didNotAttendReason: 'Motivo ausência',
  resubmitted: 'Reenviado',
};

const MONETARY_FIELDS = new Set([
  'dailyValue', 'mobility', 'transport', 'totalValue',
  'weekdayLunch', 'weekdayDinner', 'weekendLunch', 'weekendDinner',
  'costAssistance',
]);

function fmt(field: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (MONETARY_FIELDS.has(field) && typeof value === 'number') {
    return `R$ ${(value / 100).toFixed(2).replace('.', ',')}`;
  }
  return String(value);
}

function parseJson(s: string | null | undefined): Record<string, any> | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  entityType: string;
  entityId: string;
  defaultOpen?: boolean;
}

export function ActivityTimeline({ entityType, entityId, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const { data: logs = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ['/api/activity-logs', entityType, entityId],
    queryFn: async () => {
      const res = await fetch(
        `/api/activity-logs?entityType=${entityType}&entityId=${entityId}`,
        { credentials: 'include' }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entityId && open,
    staleTime: 30_000,
  });

  const count = logs.length;

  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-[13px] font-semibold text-slate-600">Histórico</span>
          {count > 0 && (
            <span className="text-[10px] font-bold text-white bg-slate-400 rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-5 pb-4">
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-[12px] text-slate-400">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              Carregando histórico...
            </div>
          )}

          {!isLoading && logs.length === 0 && (
            <p className="text-[12px] text-slate-400 py-3">Nenhuma alteração registrada.</p>
          )}

          {!isLoading && logs.length > 0 && (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-slate-100" />

              <div className="space-y-4">
                {logs.map((log) => {
                  const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG['update'];
                  const { Icon } = cfg;
                  const prev = parseJson(log.previous_data);
                  const next = parseJson(log.new_data);

                  const changedFields: string[] = prev
                    ? Object.keys({ ...prev, ...(next || {}) })
                    : [];

                  return (
                    <div key={log.id} className="flex gap-3 pl-1">
                      {/* Dot */}
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10 ${cfg.dotColor}`}>
                        <Icon className="w-2.5 h-2.5 text-white" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDate(log.created_at)}
                          </span>
                        </div>

                        {/* Actor */}
                        {log.user_name && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <User className="w-2.5 h-2.5 text-slate-400" />
                            <span className="text-[11px] text-slate-500">{log.user_name}</span>
                          </div>
                        )}

                        {/* Field changes (De → Para) */}
                        {changedFields.length > 0 && prev && next && (
                          <div className="mt-1.5 space-y-1">
                            {changedFields
                              .filter(f => !['id', 'createdAt', 'updatedAt', 'eventId', 'collaboratorId', 'functionId'].includes(f))
                              .map(field => {
                                const oldVal = prev?.[field];
                                const newVal = next?.[field];
                                if (oldVal === newVal) return null;
                                const label = FIELD_LABELS[field] || field;
                                return (
                                  <div key={field} className="text-[11px] flex items-center gap-1.5 flex-wrap bg-slate-50 rounded-md px-2 py-1">
                                    <span className="text-slate-500 font-medium">{label}:</span>
                                    <span className="text-red-500 line-through font-mono">{fmt(field, oldVal)}</span>
                                    <span className="text-slate-400">→</span>
                                    <span className="text-emerald-600 font-mono font-semibold">{fmt(field, newVal)}</span>
                                  </div>
                                );
                              })
                              .filter(Boolean)}
                          </div>
                        )}

                        {/* Details text fallback */}
                        {(!prev || changedFields.length === 0) && log.details && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{log.details}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Badge: indica que o planejado foi editado ──
export function PlannedEditedBadge({
  logs,
  entityId,
}: {
  logs: ActivityLog[];
  entityId: string;
}) {
  const hasEdits = logs.some(l => l.entity_id === entityId && l.action === 'update');
  if (!hasEdits) return null;

  const latest = logs
    .filter(l => l.entity_id === entityId && l.action === 'update')
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

  const title = latest
    ? `Alterado por ${latest.user_name || '?'} em ${formatDate(latest.created_at)}`
    : 'Planejamento alterado pelo RH';

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 cursor-help shrink-0"
    >
      ⚠️ Planejamento Alterado
    </span>
  );
}
