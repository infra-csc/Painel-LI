import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Calendar, User, ChevronDown, ChevronRight, Filter,
  Activity, ShieldAlert, Clock, LogIn, LogOut, UserPlus, UserCheck,
  Edit, Trash2, Plus, Send, CheckCircle, XCircle, RotateCcw,
  DollarSign, Users, Settings, FileText, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

interface SystemLog {
  id: string;
  logNumber: number;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: string;
  previousData: string | null;
  newData: string | null;
  userId: string | null;
  userName: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface LogsResponse {
  logs: SystemLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

// ─── Config maps ─────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  create:       { label: "Criação",       icon: Plus,        color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
  update:       { label: "Alteração",     icon: Edit,        color: "text-blue-700 dark:text-blue-300",       bg: "bg-blue-100 dark:bg-blue-900/40" },
  delete:       { label: "Exclusão",      icon: Trash2,      color: "text-red-700 dark:text-red-300",         bg: "bg-red-100 dark:bg-red-900/40" },
  login:        { label: "Login",         icon: LogIn,       color: "text-purple-700 dark:text-purple-300",   bg: "bg-purple-100 dark:bg-purple-900/40" },
  logout:       { label: "Logout",        icon: LogOut,      color: "text-gray-700 dark:text-gray-300",       bg: "bg-gray-100 dark:bg-gray-900/40" },
  approve:      { label: "Aprovação",     icon: CheckCircle, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
  reject:       { label: "Rejeição",      icon: XCircle,     color: "text-red-700 dark:text-red-300",         bg: "bg-red-100 dark:bg-red-900/40" },
  send_review:  { label: "Envio p/ RH",   icon: Send,        color: "text-amber-700 dark:text-amber-300",     bg: "bg-amber-100 dark:bg-amber-900/40" },
  reset_password:{ label: "Reset Senha",  icon: RotateCcw,   color: "text-orange-700 dark:text-orange-300",   bg: "bg-orange-100 dark:bg-orange-900/40" },
  activate:     { label: "Ativação",      icon: UserCheck,   color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
  deactivate:   { label: "Desativação",   icon: UserPlus,    color: "text-gray-700 dark:text-gray-300",       bg: "bg-gray-100 dark:bg-gray-900/40" },
};

const ENTITY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  user:           { label: "Usuário",         icon: User,       color: "text-violet-600" },
  event:          { label: "Evento",          icon: Calendar,   color: "text-blue-600" },
  team_inclusion: { label: "Inclusão Equipe", icon: Users,      color: "text-cyan-600" },
  budget_planned: { label: "Orçamento Plan.", icon: DollarSign, color: "text-green-600" },
  budget_actual:  { label: "Prestação Contas",icon: FileText,   color: "text-amber-600" },
  system_settings:{ label: "Configurações",   icon: Settings,   color: "text-purple-600" },
  function:       { label: "Função",          icon: Activity,   color: "text-indigo-600" },
  collaborator:   { label: "Colaborador",     icon: UserCheck,  color: "text-teal-600" },
  ticket:            { label: "Passagem",          icon: FileText,   color: "text-orange-600" },
  accommodation:     { label: "Hospedagem",         icon: FileText,   color: "text-sky-600" },
  budget_comparison: { label: "Comparativo",        icon: FileText,   color: "text-rose-600" },
  financial:         { label: "Financeiro",          icon: DollarSign, color: "text-emerald-600" },
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nome", email: "E-mail", role: "Perfil", status: "Status",
  area: "Área", password: "Senha",
  eventName: "Evento", startDate: "Início", endDate: "Fim", location: "Local",
  collaboratorId: "Colaborador", functionId: "Função", dailyValue: "Valor Diária",
  mobility: "Mobilidade", weekdayLunch: "Almoço Útil", weekdayDinner: "Jantar Útil",
  weekendLunch: "Almoço FDS", weekendDinner: "Jantar FDS", totalValue: "Total",
  dailyQuantity: "Qtd Diárias", costAssistance: "Ajuda de Custo",
  default_daily_value_weekday: "Diária Dia Útil", default_daily_value_weekend: "Diária FDS",
  default_mobility: "Mobilidade Padrão", default_weekday_lunch: "Almoço Útil Padrão",
  default_weekday_dinner: "Jantar Útil Padrão", default_weekend_lunch: "Almoço FDS Padrão",
  default_weekend_dinner: "Jantar FDS Padrão",
  sentForReview: "Enviado p/ RH", rhStatus: "Status RH",
  scheduleStartDate: "Início Previsto", scheduleEndDate: "Fim Previsto",
  count: "Qtd. Itens", eventId: "Evento ID",
};

const CURRENCY_FIELDS = new Set([
  "dailyValue", "mobility", "weekdayLunch", "weekdayDinner", "weekendLunch", "weekendDinner",
  "totalValue", "costAssistance",
  "default_daily_value_weekday", "default_daily_value_weekend",
  "default_mobility", "default_weekday_lunch", "default_weekday_dinner",
  "default_weekend_lunch", "default_weekend_dinner",
]);

function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (CURRENCY_FIELDS.has(key) && typeof value === "number") {
    return `R$ ${(value / 100).toFixed(2).replace(".", ",")}`;
  }
  return String(value);
}

// ─── Diff renderer ────────────────────────────────────────────────────────────

function DiffBlock({ log }: { log: SystemLog }) {
  if (!log.previousData && !log.newData) return null;
  try {
    const prev = log.previousData ? JSON.parse(log.previousData) : null;
    const curr = log.newData ? JSON.parse(log.newData) : null;
    const sensitiveKeys = new Set(["password", "resetToken", "resetTokenExpiry"]);

    if (prev && curr) {
      const changedKeys = Object.keys({ ...prev, ...curr }).filter(
        (k) => !sensitiveKeys.has(k) && JSON.stringify(prev[k]) !== JSON.stringify(curr[k])
      );
      if (changedKeys.length === 0) return null;
      return (
        <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Campos alterados
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {changedKeys.map((key) => (
              <div key={key} className="grid grid-cols-3 gap-2 px-3 py-2 text-xs">
                <span className="font-medium text-gray-600 dark:text-gray-400">{FIELD_LABELS[key] || key}</span>
                <span className="text-red-600 dark:text-red-400 line-through">{formatFieldValue(key, prev[key])}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">{formatFieldValue(key, curr[key])}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const data = curr || prev;
    const isCreation = !prev && !!curr;
    return (
      <div className={`mt-3 rounded-lg border overflow-hidden ${isCreation ? "border-emerald-200 dark:border-emerald-800" : "border-red-200 dark:border-red-800"}`}>
        <div className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${isCreation ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"}`}>
          {isCreation ? "Dados criados" : "Dados removidos"}
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Object.entries(data || {})
            .filter(([k]) => !sensitiveKeys.has(k) && data[k] !== null && data[k] !== undefined)
            .map(([key, val]) => (
              <div key={key} className="flex gap-3 px-3 py-1.5 text-xs">
                <span className="font-medium text-gray-500 dark:text-gray-400 w-32 shrink-0">{FIELD_LABELS[key] || key}</span>
                <span className="text-gray-700 dark:text-gray-300">{formatFieldValue(key, val)}</span>
              </div>
            ))}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}

// ─── Log Card ────────────────────────────────────────────────────────────────

function LogCard({ log }: { log: SystemLog }) {
  const [open, setOpen] = useState(false);
  const hasDiff = !!(log.previousData || log.newData);

  const actionCfg = ACTION_CONFIG[log.action] || { label: log.action, icon: Activity, color: "text-gray-600", bg: "bg-gray-100" };
  const entityCfg = ENTITY_CONFIG[log.entityType] || { label: log.entityType, icon: FileText, color: "text-gray-500" };
  const ActionIcon = actionCfg.icon;
  const EntityIcon = entityCfg.icon;

  const dt = new Date(log.createdAt);
  const dateStr = dt.toLocaleDateString("pt-BR");
  const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`bg-white dark:bg-gray-800 border rounded-xl overflow-hidden transition-all ${open ? "border-gray-300 dark:border-gray-600 shadow-sm" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}>
      <div
        className={`flex items-start gap-3 px-4 py-3 ${hasDiff ? "cursor-pointer" : ""}`}
        onClick={() => hasDiff && setOpen(!open)}
      >
        {/* Action icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${actionCfg.bg}`}>
          <ActionIcon className={`w-4 h-4 ${actionCfg.color}`} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${actionCfg.color} ${actionCfg.bg} px-2 py-0.5 rounded-full`}>
              {actionCfg.label}
            </span>
            <span className={`text-xs font-medium flex items-center gap-1 ${entityCfg.color}`}>
              <EntityIcon className="w-3 h-3" />
              {entityCfg.label}
            </span>
            <span className="text-xs text-gray-400">#{log.logNumber}</span>
          </div>

          <div className="mt-1.5 flex items-center gap-4 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {log.userName || "Sistema"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {dateStr} às {timeStr}
            </span>
            {log.entityName && (
              <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-xs">
                {log.entityName}
              </span>
            )}
          </div>

          {log.details && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{log.details}</p>
          )}
        </div>

        {/* Expand */}
        {hasDiff && (
          <div className="shrink-0 text-gray-400">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {open && hasDiff && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          <DiffBlock log={log} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({ entityType: "all", action: "all", days: "30" });
  const [page, setPage] = useState(1);

  const debounceSearch = useCallback((val: string) => {
    setSearch(val);
    const t = setTimeout(() => setDebouncedSearch(val), 400);
    return () => clearTimeout(t);
  }, []);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ page: page.toString(), limit: "25" });
    if (filters.entityType !== "all") params.set("entityType", filters.entityType);
    if (filters.action !== "all") params.set("action", filters.action);
    if (filters.days) params.set("days", filters.days);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return `/api/system-logs?${params}`;
  }, [filters, page, debouncedSearch]);

  const { data: logsResponse, isLoading } = useQuery<LogsResponse>({
    queryKey: [queryUrl],
    enabled: !authLoading && !!user,
  });

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFilters({ entityType: "all", action: "all", days: "30" });
    setPage(1);
  };

  const hasActiveFilters = filters.entityType !== "all" || filters.action !== "all" || filters.days !== "30" || debouncedSearch;

  if (!hasPermission(user, "canAccessScreen6")) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Acesso restrito</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-xs">Apenas administradores podem acessar os logs do sistema.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center">
          <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Consulta Geral</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Histórico completo de atividades do sistema</p>
        </div>
        {logsResponse && (
          <div className="ml-auto text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
            {logsResponse.pagination.total.toLocaleString("pt-BR")} registros
          </div>
        )}
      </div>

      {/* Search + Filters bar */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar por usuário, entidade, ação..."
              value={search}
              onChange={(e) => debounceSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button onClick={() => { setSearch(""); setDebouncedSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Entity type */}
          <Select value={filters.entityType} onValueChange={(v) => { setFilters(f => ({ ...f, entityType: v })); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os módulos</SelectItem>
              <SelectItem value="user">Usuários</SelectItem>
              <SelectItem value="event">Eventos</SelectItem>
              <SelectItem value="team_inclusion">Inclusão de Equipe</SelectItem>
              <SelectItem value="budget_planned">Orçamento Planejado</SelectItem>
              <SelectItem value="budget_actual">Prestação de Contas</SelectItem>
              <SelectItem value="system_settings">Configurações</SelectItem>
              <SelectItem value="function">Funções</SelectItem>
              <SelectItem value="collaborator">Colaboradores</SelectItem>
              <SelectItem value="ticket">Passagens</SelectItem>
              <SelectItem value="accommodation">Hospedagens</SelectItem>
              <SelectItem value="budget_comparison">Comparativo</SelectItem>
              <SelectItem value="financial">Financeiro</SelectItem>
            </SelectContent>
          </Select>

          {/* Action */}
          <Select value={filters.action} onValueChange={(v) => { setFilters(f => ({ ...f, action: v })); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              <SelectItem value="create">Criação</SelectItem>
              <SelectItem value="update">Alteração</SelectItem>
              <SelectItem value="delete">Exclusão</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="logout">Logout</SelectItem>
              <SelectItem value="send_review">Envio p/ RH</SelectItem>
              <SelectItem value="approve">Aprovação</SelectItem>
              <SelectItem value="reject">Rejeição</SelectItem>
              <SelectItem value="reset_password">Reset de Senha</SelectItem>
            </SelectContent>
          </Select>

          {/* Period */}
          <Select value={filters.days} onValueChange={(v) => { setFilters(f => ({ ...f, days: v })); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Últimas 24h</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="text-gray-500 hover:text-gray-700 gap-1.5">
              <X className="w-4 h-4" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex gap-3">
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))}
        </div>
      ) : logsResponse?.logs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center py-16 gap-3">
          <Search className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum registro encontrado</p>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {logsResponse?.logs.map((log) => (
            <LogCard key={log.id} log={log} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {logsResponse && logsResponse.pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Página {logsResponse.pagination.page} de {logsResponse.pagination.pages}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1}>«</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>‹ Anterior</Button>
            {Array.from({ length: Math.min(5, logsResponse.pagination.pages) }).map((_, i) => {
              const n = Math.max(1, Math.min(page - 2, logsResponse.pagination.pages - 4)) + i;
              if (n > logsResponse.pagination.pages) return null;
              return (
                <Button key={n} variant={n === page ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="w-9 h-9 p-0">
                  {n}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= logsResponse.pagination.pages}>Próxima ›</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(logsResponse.pagination.pages)} disabled={page >= logsResponse.pagination.pages}>»</Button>
          </div>
        </div>
      )}
    </div>
  );
}
