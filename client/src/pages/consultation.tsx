/**
 * LOG DE AUDITORIA — quem fez o quê, quando, e o que mudou (revisão 18/09:
 * "os logs de auditoria não estão muito claros, revise para deixar 10/10").
 *
 * Cada registro é lido por shared/log-auditoria.ts: vira uma frase ("Leandro
 * excluiu o evento “Girl Power Brasília”"), o contexto (evento · função ·
 * colaborador), e as mudanças campo a campo com antes → depois — com NOMES no
 * lugar de ids e sem os campos técnicos. Os detalhes técnicos (IP, navegador,
 * nº do registro) ficam recolhidos, para quem precisa investigar.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, User, ChevronDown, ChevronRight, Activity, ShieldAlert, Plus, Edit, Trash2,
  CheckCircle, XCircle, Send, X, Download, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn, fixEncoding } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import {
  ACOES, MODULOS, descreverLog, type LogDescrito, type NomesParaLog, type TomDaAcao,
} from "@shared/log-auditoria";

/** Classes compartilhadas dos selects de filtro (tokens de marca). */
const SELECT_TRIGGER_CLASS = "w-48 h-9 text-sm border border-input rounded-lg bg-card text-foreground hover:border-primary/40 transition-colors focus:ring-2 focus:ring-ring/25";
const SELECT_ITEM_CLASS = "cursor-pointer hover:bg-brand-soft hover:text-primary focus:bg-brand-soft focus:text-primary data-[state=checked]:bg-brand-soft data-[state=checked]:text-primary data-[state=checked]:font-medium";

// Campos de CSV precisam ser escapados: o texto pode conter ; e aspas.
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

/** Cor e ícone por TIPO de ação — a cor diz o peso do que aconteceu. */
const TOM: Record<TomDaAcao, { icon: typeof Plus; chip: string; bolinha: string }> = {
  criar: { icon: Plus, chip: "bg-emerald-50 text-emerald-700", bolinha: "bg-emerald-100 text-emerald-700" },
  alterar: { icon: Edit, chip: "bg-blue-50 text-blue-700", bolinha: "bg-blue-100 text-blue-700" },
  excluir: { icon: Trash2, chip: "bg-red-50 text-red-700", bolinha: "bg-red-100 text-red-700" },
  aprovar: { icon: CheckCircle, chip: "bg-emerald-50 text-emerald-700", bolinha: "bg-emerald-100 text-emerald-700" },
  recusar: { icon: XCircle, chip: "bg-rose-50 text-rose-700", bolinha: "bg-rose-100 text-rose-700" },
  enviar: { icon: Send, chip: "bg-amber-50 text-amber-700", bolinha: "bg-amber-100 text-amber-700" },
  neutro: { icon: Activity, chip: "bg-slate-100 text-slate-600", bolinha: "bg-slate-100 text-slate-600" },
};

const PERIODOS: [string, string][] = [["1", "Últimas 24h"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["365", "Último ano"]];

const horaBr = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "Hoje", "Ontem" ou "segunda-feira, 15/09/2026". */
function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const data = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  if (mesmoDia(d, hoje)) return `Hoje · ${data}`;
  if (mesmoDia(d, ontem)) return `Ontem · ${data}`;
  return data.charAt(0).toUpperCase() + data.slice(1);
}

/** "Chrome 153 · Windows" em vez da string inteira do navegador. */
function navegadorCurto(ua: string | null): string {
  if (!ua) return "—";
  const nav = ua.match(/Edg\/(\d+)/) ? `Edge ${ua.match(/Edg\/(\d+)/)![1]}`
    : ua.match(/Chrome\/(\d+)/) ? `Chrome ${ua.match(/Chrome\/(\d+)/)![1]}`
    : ua.match(/Firefox\/(\d+)/) ? `Firefox ${ua.match(/Firefox\/(\d+)/)![1]}`
    : ua.match(/Safari\//) ? "Safari" : "Outro navegador";
  const so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return so ? `${nav} · ${so}` : nav;
}

// ─── Um registro ─────────────────────────────────────────────────────────────

function LogCard({ log, d }: { log: SystemLog; d: LogDescrito }) {
  const [open, setOpen] = useState(false);
  const tom = TOM[d.tom];
  const Icone = tom.icon;
  const temDetalhe = d.mudancas.length > 0 || d.dados.length > 0;

  return (
    <div className={cn("bg-card border rounded-xl overflow-hidden transition-colors", open ? "border-slate-300 shadow-sm" : "border-slate-200 hover:border-slate-300")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
        data-testid={`log-${log.logNumber}`}
      >
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tom.bolinha)}>
          <Icone className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug text-slate-800">
            <span className="font-semibold text-slate-900">{fixEncoding(log.userName) || "Sistema"}</span>{" "}
            {d.frase}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", tom.chip)}>{d.acao}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{d.modulo}</span>
            {d.contexto.length > 0 && <span className="text-slate-500 break-words">{d.contexto.join(" · ")}</span>}
          </span>
          {d.resumo && <span className="mt-1 block text-[12px] text-slate-500 break-words">{d.resumo}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[12px] text-slate-400">
          <span className="tabular-nums">{horaBr(log.createdAt)}</span>
          {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          {d.mudancas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-semibold">O que mudou</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Antes</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Depois</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.mudancas.map((m) => (
                    <tr key={m.campo}>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{m.campo}</td>
                      <td className="px-3 py-1.5 text-slate-500 break-words">{m.antes}</td>
                      <td className="px-3 py-1.5 font-semibold text-slate-800 break-words">{m.depois}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.mudancas.length === 0 && d.dados.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                {log.action === "delete" ? "Como estava antes de excluir" : "Dados registrados"}
              </p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 px-3 py-2 text-[12px] sm:grid-cols-2">
                {d.dados.map((x) => (
                  <div key={x.campo} className="flex gap-2 min-w-0">
                    <dt className="shrink-0 text-slate-500">{x.campo}:</dt>
                    <dd className="min-w-0 font-medium text-slate-700 break-words">{x.valor}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {!temDetalhe && (
            <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <Info className="h-3.5 w-3.5" aria-hidden="true" /> Este registro não guarda detalhes de campos.
            </p>
          )}
          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-700">Detalhes técnicos</summary>
            <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
              <div><dt className="inline">Registro nº </dt><dd className="inline font-mono">{log.logNumber}</dd></div>
              <div><dt className="inline">Data e hora: </dt><dd className="inline">{new Date(log.createdAt).toLocaleString("pt-BR")}</dd></div>
              <div><dt className="inline">IP: </dt><dd className="inline font-mono">{log.ipAddress || "—"}</dd></div>
              <div><dt className="inline">Navegador: </dt><dd className="inline">{navegadorCurto(log.userAgent)}</dd></div>
              <div className="sm:col-span-2"><dt className="inline">Código do registro alterado: </dt><dd className="inline font-mono break-all">{log.entityId || "—"}</dd></div>
            </dl>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
  usePageTitle("Log de auditoria");
  const { user, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({ entityType: "all", action: "all", days: "30", userId: "all" });
  const [page, setPage] = useState(1);

  // O timer precisa viver fora do callback: cada tecla cancela a busca anterior.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const applySearch = useCallback((val: string) => { setDebouncedSearch(val); setPage(1); }, []);
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
    const params = new URLSearchParams({ page: page.toString(), limit: "30" });
    if (filters.entityType !== "all") params.set("entityType", filters.entityType);
    if (filters.action !== "all") params.set("action", filters.action);
    if (filters.userId !== "all") params.set("userId", filters.userId);
    if (filters.days) params.set("days", filters.days);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return `/api/system-logs?${params}`;
  }, [filters, page, debouncedSearch]);

  const podeVer = !authLoading && hasPermission(user, "canAccessScreen6");
  const { data: logsResponse, isLoading, isError, error, refetch, isFetching } = useQuery<LogsResponse>({
    queryKey: [queryUrl],
    enabled: podeVer,
  });

  // Nomes no lugar de ids (mesmas chaves das outras telas → cache compartilhado).
  const { data: events } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/events"], enabled: podeVer, staleTime: 300_000 });
  const { data: functions } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/functions"], enabled: podeVer, staleTime: 300_000 });
  const { data: collaborators } = useQuery<{ id: string; fullName: string }[]>({ queryKey: ["/api/collaborators"], enabled: podeVer });
  const { data: users } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/users"], enabled: podeVer, staleTime: 300_000 });

  const nomes = useMemo<NomesParaLog>(() => {
    const ev = new Map((events ?? []).map((e) => [e.id, fixEncoding(e.name)]));
    const fn = new Map((functions ?? []).map((f) => [f.id, fixEncoding(f.name)]));
    const co = new Map((collaborators ?? []).map((c) => [c.id, fixEncoding(c.fullName)]));
    const us = new Map((users ?? []).map((u) => [u.id, fixEncoding(u.name)]));
    return { evento: (id) => ev.get(id), funcao: (id) => fn.get(id), colaborador: (id) => co.get(id), usuario: (id) => us.get(id) };
  }, [events, functions, collaborators, users]);

  const descritos = useMemo(
    () => (logsResponse?.logs ?? []).map((log) => ({ log, d: descreverLog(log, nomes) })),
    [logsResponse, nomes],
  );

  /** Agrupados por dia, na ordem em que vieram (mais recentes primeiro). */
  const porDia = useMemo(() => {
    const grupos: { dia: string; itens: typeof descritos }[] = [];
    for (const item of descritos) {
      const dia = rotuloDoDia(item.log.createdAt);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === dia) ultimo.itens.push(item); else grupos.push({ dia, itens: [item] });
    }
    return grupos;
  }, [descritos]);

  const usuariosOrdenados = useMemo(
    () => (users ?? []).map((u) => ({ id: u.id, name: fixEncoding(u.name) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [users],
  );
  const modulosOrdenados = useMemo(() => Object.entries(MODULOS).sort((a, b) => a[1].rotulo.localeCompare(b[1].rotulo, "pt-BR")), []);
  const acoesOrdenadas = useMemo(() => Object.entries(ACOES).sort((a, b) => a[1].rotulo.localeCompare(b[1].rotulo, "pt-BR")), []);

  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    setDebouncedSearch("");
    setFilters({ entityType: "all", action: "all", days: "30", userId: "all" });
    setPage(1);
  };
  const setFiltro = (k: keyof typeof filters, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const hasActiveFilters = filters.entityType !== "all" || filters.action !== "all" || filters.userId !== "all" || filters.days !== "30" || !!debouncedSearch;

  const exportar = () => {
    const header = "Nº;Data;Pessoa;Ação;Módulo;O que aconteceu;Contexto;Mudanças\r\n";
    const rows = descritos.map(({ log, d }) => [
      log.logNumber, new Date(log.createdAt).toLocaleString("pt-BR"), fixEncoding(log.userName) || "Sistema",
      d.acao, d.modulo, `${fixEncoding(log.userName) || "Sistema"} ${d.frase}`, d.contexto.join(" · "),
      d.mudancas.map((m) => `${m.campo}: ${m.antes} → ${m.depois}`).join(" | "),
    ].map(csvCell).join(";")).join("\r\n");
    // BOM para o Excel pt-BR abrir os acentos corretamente
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `log-de-auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Enquanto a sessão está sendo verificada não dá para saber o perfil.
  if (authLoading) {
    return (
      <PageContainer>
        <LoadingState count={6} label="Carregando…" />
      </PageContainer>
    );
  }

  if (!hasPermission(user, "canAccessScreen6")) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">Acesso restrito</h2>
        <p className="max-w-xs text-slate-500">Apenas administradores podem acessar o log de auditoria.</p>
      </div>
    );
  }

  const pill = "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";

  return (
    <PageContainer>
      <PageHeader
        icon={Activity}
        title="Log de auditoria"
        subtitle="Quem fez o quê, quando — e o que mudou"
        actions={logsResponse && (
          <>
            <div className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              {logsResponse.pagination.total.toLocaleString("pt-BR")} registros
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={descritos.length === 0}
              title="Exporta os registros desta página, já em frases" onClick={exportar}>
              <Download className="h-3.5 w-3.5" /> Exportar página
            </Button>
          </>
        )}
      />

      {/* Busca + filtros */}
      <div className="rounded-xl border border-slate-200 bg-card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por pessoa, evento, nº da vaga, LOC…"
              value={search}
              onChange={(e) => debounceSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button type="button" aria-label="Limpar busca" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={filters.userId} onValueChange={(v) => setFiltro("userId", v)}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Pessoa"><SelectValue placeholder="Pessoa" /></SelectTrigger>
            <SelectContent className="max-h-[320px] min-w-[220px] rounded-xl shadow-lg">
              <SelectItem value="all" className={SELECT_ITEM_CLASS}>Todas as pessoas</SelectItem>
              {usuariosOrdenados.map((u) => <SelectItem key={u.id} value={u.id} className={SELECT_ITEM_CLASS}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.entityType} onValueChange={(v) => setFiltro("entityType", v)}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Módulo"><SelectValue placeholder="Módulo" /></SelectTrigger>
            <SelectContent className="max-h-[320px] min-w-[220px] rounded-xl shadow-lg">
              <SelectItem value="all" className={SELECT_ITEM_CLASS}>Todos os módulos</SelectItem>
              {modulosOrdenados.map(([k, m]) => <SelectItem key={k} value={k} className={SELECT_ITEM_CLASS}>{m.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.action} onValueChange={(v) => setFiltro("action", v)}>
            <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Ação"><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent className="max-h-[320px] min-w-[240px] rounded-xl shadow-lg">
              <SelectItem value="all" className={SELECT_ITEM_CLASS}>Todas as ações</SelectItem>
              {acoesOrdenadas.map(([k, a]) => <SelectItem key={k} value={k} className={SELECT_ITEM_CLASS}>{a.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.days} onValueChange={(v) => setFiltro("days", v)}>
            <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-40")} aria-label="Período"><SelectValue /></SelectTrigger>
            <SelectContent className="min-w-[180px] rounded-xl shadow-lg">
              {PERIODOS.map(([v, r]) => <SelectItem key={v} value={v} className={SELECT_ITEM_CLASS}>{r}</SelectItem>)}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="gap-1.5 text-slate-500 hover:text-slate-700">
              <X className="h-4 w-4" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Filtros ativos */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">Filtros ativos:</span>
          {debouncedSearch && (
            <span className={cn(pill, "border-indigo-200 bg-indigo-50 text-indigo-700")}>
              <Search className="h-2.5 w-2.5" /> "{debouncedSearch}"
              <button type="button" aria-label="Remover filtro de busca" onClick={clearSearch} className="ml-0.5"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {filters.userId !== "all" && (
            <span className={cn(pill, "border-violet-200 bg-violet-50 text-violet-700")}>
              <User className="h-2.5 w-2.5" /> {usuariosOrdenados.find((u) => u.id === filters.userId)?.name ?? "Pessoa"}
              <button type="button" aria-label="Remover filtro de pessoa" onClick={() => setFiltro("userId", "all")} className="ml-0.5"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {filters.entityType !== "all" && (
            <span className={cn(pill, "border-primary/20 bg-brand-soft text-primary")}>
              {MODULOS[filters.entityType]?.rotulo ?? filters.entityType}
              <button type="button" aria-label="Remover filtro de módulo" onClick={() => setFiltro("entityType", "all")} className="ml-0.5"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {filters.action !== "all" && (
            <span className={cn(pill, "border-purple-200 bg-purple-50 text-purple-700")}>
              {ACOES[filters.action]?.rotulo ?? filters.action}
              <button type="button" aria-label="Remover filtro de ação" onClick={() => setFiltro("action", "all")} className="ml-0.5"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {filters.days !== "30" && (
            <span className={cn(pill, "border-amber-200 bg-amber-50 text-amber-700")}>
              {PERIODOS.find(([v]) => v === filters.days)?.[1]}
              <button type="button" aria-label="Remover filtro de período" onClick={() => setFiltro("days", "30")} className="ml-0.5"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
        </div>
      )}

      {/* Registros */}
      {isLoading ? (
        <LoadingState count={8} label="Carregando registros…" />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-card px-6 py-16 text-center">
          <ShieldAlert className="h-10 w-10 text-red-400" />
          <p className="font-medium text-slate-700">
            {(error as any)?.status === 401
              ? "Sua sessão expirou. Entre novamente para consultar o log."
              : (error as any)?.status === 403
              ? "Você não tem permissão para consultar o log de auditoria."
              : "Não foi possível carregar os registros."}
          </p>
          <p className="max-w-md text-sm text-slate-500">
            {(error as any)?.body?.message || "Verifique sua conexão e tente novamente. Isto não significa que não existam registros."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Tentando..." : "Tentar novamente"}
          </Button>
        </div>
      ) : descritos.length === 0 ? (
        <EmptyState
          variant={hasActiveFilters ? "filtered" : "default"}
          title="Nenhum registro encontrado"
          description={hasActiveFilters ? "Nenhuma atividade corresponde aos filtros aplicados." : "Ainda não há atividades registradas."}
          onClearFilters={hasActiveFilters ? clearFilters : undefined}
        />
      ) : (
        <div className="space-y-5">
          {porDia.map((g) => (
            <section key={g.dia} aria-label={g.dia}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                {g.dia} <span className="font-normal normal-case tracking-normal text-slate-400">· {g.itens.length}</span>
              </h2>
              <div className="space-y-2">
                {g.itens.map(({ log, d }) => <LogCard key={log.id} log={log} d={d} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Paginação */}
      {logsResponse && logsResponse.pagination.pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="text-sm text-slate-500">
            Página {logsResponse.pagination.page} de {logsResponse.pagination.pages}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1} aria-label="Primeira página">«</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>‹ Anterior</Button>
            {Array.from({ length: Math.min(5, logsResponse.pagination.pages) }).map((_, i) => {
              const n = Math.max(1, Math.min(page - 2, logsResponse.pagination.pages - 4)) + i;
              if (n > logsResponse.pagination.pages) return null;
              return (
                <Button key={n} variant={n === page ? "default" : "outline"} size="sm" onClick={() => setPage(n)} className="h-9 w-9 p-0">
                  {n}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= logsResponse.pagination.pages}>Próxima ›</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(logsResponse.pagination.pages)} disabled={page >= logsResponse.pagination.pages} aria-label="Última página">»</Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
