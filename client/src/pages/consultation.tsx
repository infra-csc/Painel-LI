import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Calendar, User, ChevronDown, ChevronRight,
  Activity, ShieldAlert, Clock, LogIn, LogOut, UserPlus, UserCheck,
  Edit, Trash2, Plus, Send, CheckCircle, XCircle, RotateCcw,
  DollarSign, Users, Settings, FileText, X, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";

/** Classes compartilhadas dos selects de filtro (tokens de marca). */
const SELECT_TRIGGER_CLASS = "w-44 h-9 text-sm border border-input rounded-lg bg-card text-foreground hover:border-primary/40 transition-colors focus:ring-2 focus:ring-ring/25";
const SELECT_ITEM_CLASS = "cursor-pointer hover:bg-brand-soft hover:text-primary focus:bg-brand-soft focus:text-primary data-[state=checked]:bg-brand-soft data-[state=checked]:text-primary data-[state=checked]:font-medium";

// Campos de CSV precisam ser escapados: "details" pode conter ; e aspas,
// o que quebrava as colunas do arquivo exportado.
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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
  id: "ID", name: "Nome", email: "E-mail", role: "Perfil", status: "Status",
  area: "Área", password: "Senha", isActive: "Ativo",
  mustChangePassword: "Forçar troca de senha",
  createdAt: "Criado em", updatedAt: "Atualizado em",
  userId: "ID do usuário", createdBy: "Criado por", updatedBy: "Atualizado por",
  eventName: "Evento", startDate: "Início", endDate: "Fim", location: "Local",
  collaboratorId: "Colaborador", functionId: "Função", dailyValue: "Valor Diária",
  mobility: "Mobilidade", weekdayLunch: "Almoço Útil", weekdayDinner: "Jantar Útil",
  weekendLunch: "Almoço FDS", weekendDinner: "Jantar FDS", totalValue: "Total",
  dailyQuantity: "Qtd Diárias", costAssistance: "Ajuda de Custo",
  default_daily_value_weekday: "Diária Dia Útil", default_daily_value_weekend: "Diária FDS",
  default_mobility: "Mobilidade Padrão", default_weekday_lunch: "Almoço Útil Padrão",
  default_weekday_dinner: "Jantar Útil Padrão", default_weekend_lunch: "Almoço FDS Padrão",
  default_weekend_dinner: "Jantar FDS Padrão",
  sentForReview: "Enviado p/ RH", rhStatus: "Status RH", rhActionAt: "Ação RH em", rhActionBy: "Ação RH por",
  scheduleStartDate: "Início Previsto", scheduleEndDate: "Fim Previsto",
  count: "Qtd. Itens", eventId: "Evento ID", collaboratorType: "Tipo", observations: "Observações",
  plannedId: "ID Planejado",
};

const CURRENCY_FIELDS = new Set([
  "dailyValue", "mobility", "weekdayLunch", "weekdayDinner", "weekendLunch", "weekendDinner",
  "totalValue", "costAssistance",
  "default_daily_value_weekday", "default_daily_value_weekend",
  "default_mobility", "default_weekday_lunch", "default_weekday_dinner",
  "default_weekend_lunch", "default_weekend_dinner",
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (CURRENCY_FIELDS.has(key) && typeof value === "number") {
    return `R$ ${(value / 100).toFixed(2).replace(".", ",")}`;
  }
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    try {
      const d = new Date(value);
      return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch { /* fall through */ }
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
          <div className="bg-slate-50 dark:bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 tracking-wide border-b border-gray-100 dark:border-gray-700">
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
        {...(hasDiff
          ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-expanded": open,
              onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              },
            }
          : {})}
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
  usePageTitle("Log de auditoria");
  const { user, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({ entityType: "all", action: "all", days: "30" });
  const [page, setPage] = useState(1);

  // O timer precisa viver fora do callback: antes, cada tecla agendava um
  // timeout novo sem cancelar o anterior (o "cleanup" retornado nunca era
  // chamado), disparando uma requisição por caractere digitado.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const applySearch = useCallback((val: string) => {
    setDebouncedSearch(val);
    setPage(1); // busca nova sempre volta para a primeira página
  }, []);

  const debounceSearch = useCallback((val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => applySearch(val), 400);
  }, [applySearch]);

  const clearSearch = useCallback(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    applySearch("");
  }, [applySearch]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ page: page.toString(), limit: "25" });
    if (filters.entityType !== "all") params.set("entityType", filters.entityType);
    if (filters.action !== "all") params.set("action", filters.action);
    if (filters.days) params.set("days", filters.days);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return `/api/system-logs?${params}`;
  }, [filters, page, debouncedSearch]);

  const { data: logsResponse, isLoading, isError, error, refetch, isFetching } = useQuery<LogsResponse>({
    queryKey: [queryUrl],
    enabled: !authLoading && !!user,
  });

  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    setDebouncedSearch("");
    setFilters({ entityType: "all", action: "all", days: "30" });
    setPage(1);
  };

  const hasActiveFilters = filters.entityType !== "all" || filters.action !== "all" || filters.days !== "30" || !!debouncedSearch;

  // Enquanto a sessão está sendo verificada não dá para saber o perfil —
  // mostrar "Acesso restrito" aqui piscava a tela de erro para o admin.
  if (authLoading) {
    return (
      <PageContainer>
        <LoadingState count={6} label="Carregando…" />
      </PageContainer>
    );
  }

  if (!hasPermission(user, "canAccessScreen6")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Acesso restrito</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-xs">Apenas administradores podem acessar os logs do sistema.</p>
      </div>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        icon={Activity}
        title="Log de auditoria"
        subtitle="Histórico completo de atividades do sistema"
        actions={logsResponse && (
          <>
            <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              {logsResponse.pagination.total.toLocaleString("pt-BR")} registros
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={logsResponse.logs.length === 0}
              title="Exporta os registros exibidos nesta página"
              onClick={() => {
                const rows = logsResponse.logs.map(l => [
                  l.logNumber, l.action, l.entityType, l.entityName, l.userName,
                  new Date(l.createdAt).toLocaleString("pt-BR"), l.details || ""
                ].map(csvCell).join(";")).join("\r\n");
                const header = "Nº;Ação;Módulo;Entidade;Usuário;Data;Detalhes\r\n";
                // BOM para o Excel pt-BR abrir os acentos corretamente
                const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `logs-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download className="w-3.5 h-3.5" /> Exportar página
            </Button>
          </>
        )}
      />

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
              <button type="button" aria-label="Limpar busca" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Entity type */}
          <Select value={filters.entityType} onValueChange={(v) => { setFilters(f => ({ ...f, entityType: v })); setPage(1); }}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-lg min-w-[200px]">
              <SelectItem value="all" className={SELECT_ITEM_CLASS}>Todos os módulos</SelectItem>
              <SelectItem value="user" className={SELECT_ITEM_CLASS}>Usuários</SelectItem>
              <SelectItem value="event" className={SELECT_ITEM_CLASS}>Eventos</SelectItem>
              <SelectItem value="team_inclusion" className={SELECT_ITEM_CLASS}>Inclusão de Equipe</SelectItem>
              <SelectItem value="budget_planned" className={SELECT_ITEM_CLASS}>Orçamento Planejado</SelectItem>
              <SelectItem value="budget_actual" className={SELECT_ITEM_CLASS}>Prestação de Contas</SelectItem>
              <SelectItem value="function" className={SELECT_ITEM_CLASS}>Funções</SelectItem>
              <SelectItem value="collaborator" className={SELECT_ITEM_CLASS}>Colaboradores</SelectItem>
              <SelectItem value="ticket" className={SELECT_ITEM_CLASS}>Passagens</SelectItem>
              <SelectItem value="accommodation" className={SELECT_ITEM_CLASS}>Hospedagens</SelectItem>
              <SelectItem value="budget_comparison" className={SELECT_ITEM_CLASS}>Comparativo</SelectItem>
              <SelectItem value="system_settings" className={SELECT_ITEM_CLASS}>Configurações</SelectItem>
              <SelectItem value="financial" className={SELECT_ITEM_CLASS}>Financeiro</SelectItem>
            </SelectContent>
          </Select>

          {/* Action */}
          <Select value={filters.action} onValueChange={(v) => { setFilters(f => ({ ...f, action: v })); setPage(1); }}>
            <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-40")}>
              <SelectValue placeholder="Ação" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
              <SelectItem value="all" className={SELECT_ITEM_CLASS}>Todas as ações</SelectItem>
              <SelectItem value="create" className={SELECT_ITEM_CLASS}>Criação</SelectItem>
              <SelectItem value="update" className={SELECT_ITEM_CLASS}>Alteração</SelectItem>
              <SelectItem value="delete" className={SELECT_ITEM_CLASS}>Exclusão</SelectItem>
              <SelectItem value="login" className={SELECT_ITEM_CLASS}>Login</SelectItem>
              <SelectItem value="logout" className={SELECT_ITEM_CLASS}>Logout</SelectItem>
              <SelectItem value="send_review" className={SELECT_ITEM_CLASS}>Envio p/ RH</SelectItem>
              <SelectItem value="approve" className={SELECT_ITEM_CLASS}>Aprovação</SelectItem>
              <SelectItem value="reject" className={SELECT_ITEM_CLASS}>Rejeição</SelectItem>
              <SelectItem value="reset_password" className={SELECT_ITEM_CLASS}>Reset de Senha</SelectItem>
            </SelectContent>
          </Select>

          {/* Period */}
          <Select value={filters.days} onValueChange={(v) => { setFilters(f => ({ ...f, days: v })); setPage(1); }}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
              <SelectItem value="1" className={SELECT_ITEM_CLASS}>Últimas 24h</SelectItem>
              <SelectItem value="7" className={SELECT_ITEM_CLASS}>Últimos 7 dias</SelectItem>
              <SelectItem value="30" className={SELECT_ITEM_CLASS}>Últimos 30 dias</SelectItem>
              <SelectItem value="90" className={SELECT_ITEM_CLASS}>Últimos 90 dias</SelectItem>
              <SelectItem value="365" className={SELECT_ITEM_CLASS}>Último ano</SelectItem>
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

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-400 font-medium">Filtros ativos:</span>
          {debouncedSearch && (
            <span className="flex items-center gap-1 text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
              <Search className="w-2.5 h-2.5" /> "{debouncedSearch}"
              <button type="button" aria-label="Remover filtro de busca" onClick={clearSearch} className="ml-0.5 hover:text-indigo-900"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {filters.entityType !== "all" && (
            <span className="flex items-center gap-1 text-[11px] font-medium bg-brand-soft text-primary border border-primary/20 px-2 py-0.5 rounded-full">
              {ENTITY_CONFIG[filters.entityType]?.label || filters.entityType}
              <button type="button" aria-label="Remover filtro de módulo" onClick={() => { setFilters(f => ({ ...f, entityType: "all" })); setPage(1); }} className="ml-0.5 hover:text-primary-hover"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {filters.action !== "all" && (
            <span className="flex items-center gap-1 text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
              {ACTION_CONFIG[filters.action]?.label || filters.action}
              <button type="button" aria-label="Remover filtro de ação" onClick={() => { setFilters(f => ({ ...f, action: "all" })); setPage(1); }} className="ml-0.5 hover:text-purple-900"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {filters.days !== "30" && (
            <span className="flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              {filters.days === "1" ? "Últimas 24h" : filters.days === "7" ? "Últimos 7 dias" : filters.days === "90" ? "Últimos 90 dias" : "Último ano"}
              <button type="button" aria-label="Remover filtro de período" onClick={() => { setFilters(f => ({ ...f, days: "30" })); setPage(1); }} className="ml-0.5 hover:text-amber-900"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <LoadingState count={8} label="Carregando registros…" />
      ) : isError ? (
        <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900 rounded-xl flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
          <ShieldAlert className="w-10 h-10 text-red-400" />
          <p className="text-gray-700 dark:text-gray-200 font-medium">
            {(error as any)?.status === 401
              ? "Sua sessão expirou. Entre novamente para consultar os logs."
              : (error as any)?.status === 403
              ? "Você não tem permissão para consultar os logs do sistema."
              : "Não foi possível carregar os registros."}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
            {(error as any)?.body?.message || "Verifique sua conexão e tente novamente. Isto não significa que não existam registros."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Tentando..." : "Tentar novamente"}
          </Button>
        </div>
      ) : logsResponse?.logs.length === 0 ? (
        <EmptyState
          variant={hasActiveFilters ? "filtered" : "default"}
          title="Nenhum registro encontrado"
          description={hasActiveFilters ? "Nenhuma atividade corresponde aos filtros aplicados." : "Ainda não há atividades registradas."}
          onClearFilters={hasActiveFilters ? clearFilters : undefined}
        />
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
    </PageContainer>
  );
}
