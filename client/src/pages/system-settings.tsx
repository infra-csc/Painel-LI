import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  Calculator, Save, DollarSign, Car, Utensils, ShieldAlert,
  Lock, ChevronDown, ChevronUp, Clock, BadgeCheck, ExternalLink,
  Search, Building2, Plus, Trash2, Pencil, Check, X, AlertCircle
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { isAdmin } from "@/lib/permissions";
import type { Function as FunctionType, FunctionValue, PaymentCompany } from "@shared/schema";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";

const formSchema = z.object({
  default_daily_value_weekday: z.string().min(1, "Obrigatório"),
  default_daily_value_weekend: z.string().min(1, "Obrigatório"),
  default_mobility_ida: z.string().min(1, "Obrigatório"),
  default_mobility_volta: z.string().min(1, "Obrigatório"),
  default_weekday_lunch: z.string().min(1, "Obrigatório"),
  default_weekday_dinner: z.string().min(1, "Obrigatório"),
  default_weekend_lunch: z.string().min(1, "Obrigatório"),
  default_weekend_dinner: z.string().min(1, "Obrigatório"),
});
type FormValues = z.infer<typeof formSchema>;

const FIELD_LABELS: Record<string, string> = {
  default_daily_value_weekday: "Diária — Dia Útil",
  default_daily_value_weekend: "Diária — Fim de Semana",
  default_mobility_ida: "Mobilidade — Ida",
  default_mobility_volta: "Mobilidade — Volta",
  default_weekday_lunch: "Almoço — Dia Útil",
  default_weekday_dinner: "Jantar — Dia Útil",
  default_weekend_lunch: "Almoço — Fim de Semana",
  default_weekend_dinner: "Jantar — Fim de Semana",
};

const HISTORY_KEY = "system_settings_history";
const LAST_SAVED_KEY = "system_settings_last_saved";

interface HistoryEntry {
  timestamp: string;
  user: string;
  field: string;
  oldValue: string;
  newValue: string;
}

function centavosToReais(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

function formatCurrency(val: string): string {
  const n = parseFloat(val);
  return isNaN(n) ? val : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

function getUserInitials(name: string): string {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function CurrencyInput({ field }: { field: any }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400 font-semibold select-none">R$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        {...field}
        style={{ height: 38, fontSize: 14, fontWeight: 600, paddingLeft: 36, paddingRight: 10, border: '1px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB', width: '100%', outline: 'none', appearance: 'none' }}
        onFocus={e => { e.target.style.background = '#fff'; e.target.style.borderColor = '#6366F1'; }}
        onBlur={e => { e.target.style.background = '#F9FAFB'; e.target.style.borderColor = '#E5E7EB'; }}
      />
    </div>
  );
}

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastSaved, setLastSaved] = useState<{ timestamp: string; user: string } | null>(null);
  const [functionDailyValues, setFunctionDailyValues] = useState<Record<string, string>>({});
  const [functionSearch, setFunctionSearch] = useState("");
  const [editingFunctionId, setEditingFunctionId] = useState<string | null>(null);
  const [editingFunctionValue, setEditingFunctionValue] = useState<string>("");
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyCnpj, setNewCompanyCnpj] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setHistory(JSON.parse(h));
      const ls = localStorage.getItem(LAST_SAVED_KEY);
      if (ls) setLastSaved(JSON.parse(ls));
    } catch {}
  }, []);

  const { data: settings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings", { credentials: "include" });
      return res.json();
    },
  });

  const { data: allFunctions = [] } = useQuery<FunctionType[]>({
    queryKey: ["/api/functions"],
    queryFn: async () => {
      const res = await fetch("/api/functions", { credentials: "include" });
      return res.json();
    },
  });

  const { data: allFunctionValues = [] } = useQuery<FunctionValue[]>({
    queryKey: ["/api/function-values"],
    queryFn: async () => {
      const res = await fetch("/api/function-values", { credentials: "include" });
      return res.json();
    },
  });

  const { data: paymentCompanies = [] } = useQuery<PaymentCompany[]>({
    queryKey: ["/api/payment-companies"],
  });

  const createCompanyMutation = useMutation({
    mutationFn: (data: { name: string; cnpj: string }) =>
      apiRequest("POST", "/api/payment-companies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-companies"] });
      setNewCompanyName("");
      setNewCompanyCnpj("");
      setShowAddCompany(false);
      toast({ title: "Empresa cadastrada com sucesso." });
    },
    onError: () => toast({ title: "Erro ao cadastrar empresa.", variant: "destructive" }),
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payment-companies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-companies"] });
      toast({ title: "Empresa removida." });
    },
    onError: () => toast({ title: "Erro ao remover empresa.", variant: "destructive" }),
  });

  useEffect(() => {
    if (allFunctions.length > 0) {
      const map: Record<string, string> = {};
      for (const fn of allFunctions) {
        const fv = allFunctionValues.find(v => v.functionId === fn.id);
        map[fn.id] = fv ? centavosToReais(fv.dailyValue) : "0.00";
      }
      setFunctionDailyValues(map);
    }
  }, [allFunctions, allFunctionValues]);

  useEffect(() => {
    if (editingFunctionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingFunctionId]);

  const saveFunctionValuesMutation = useMutation({
    mutationFn: async () => {
      const dirtyFns = allFunctions.filter(fn => {
        const fv = allFunctionValues.find(v => v.functionId === fn.id);
        const savedVal = fv ? centavosToReais(fv.dailyValue) : "0.00";
        return parseFloat(functionDailyValues[fn.id] ?? "0") !== parseFloat(savedVal);
      });
      const promises = dirtyFns.map(async fn => {
        const fv = allFunctionValues.find(v => v.functionId === fn.id);
        const newVal = Math.round(parseFloat(functionDailyValues[fn.id] || "0") * 100);
        if (fv) {
          return apiRequest("PATCH", `/api/function-values/${fv.id}`, { dailyValue: newVal });
        } else {
          return apiRequest("POST", "/api/function-values", {
            functionId: fn.id, dailyValue: newVal, costAssistance: 0, mobility: 0,
            transport: 0, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
          });
        }
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_daily_value_weekday: "50.00",
      default_daily_value_weekend: "50.00",
      default_mobility_ida: "12.50",
      default_mobility_volta: "12.50",
      default_weekday_lunch: "35.00",
      default_weekday_dinner: "40.00",
      default_weekend_lunch: "40.00",
      default_weekend_dinner: "45.00",
    },
  });

  useEffect(() => {
    if (settings) {
      const legacyTotal = settings.default_mobility ?? 2500;
      const half = Math.round(legacyTotal / 2);
      form.reset({
        default_daily_value_weekday: centavosToReais(settings.default_daily_value_weekday ?? settings.default_daily_value ?? 5000),
        default_daily_value_weekend: centavosToReais(settings.default_daily_value_weekend ?? settings.default_daily_value ?? 5000),
        default_mobility_ida: centavosToReais(settings.default_mobility_ida ?? Math.ceil(half)),
        default_mobility_volta: centavosToReais(settings.default_mobility_volta ?? Math.floor(half)),
        default_weekday_lunch: centavosToReais(settings.default_weekday_lunch ?? 3500),
        default_weekday_dinner: centavosToReais(settings.default_weekday_dinner ?? 4000),
        default_weekend_lunch: centavosToReais(settings.default_weekend_lunch ?? 4000),
        default_weekend_dinner: centavosToReais(settings.default_weekend_dinner ?? 4500),
      });
    }
  }, [settings]);

  const mobilityIda = parseFloat(form.watch("default_mobility_ida") || "0");
  const mobilityVolta = parseFloat(form.watch("default_mobility_volta") || "0");
  const mobilityTotal = isNaN(mobilityIda + mobilityVolta) ? 0 : mobilityIda + mobilityVolta;

  const dirtyFormFields = Object.keys(form.formState.dirtyFields).length;
  const dirtyFunctionCount = allFunctions.filter(fn => {
    const fv = allFunctionValues.find(v => v.functionId === fn.id);
    const savedVal = fv ? centavosToReais(fv.dailyValue) : "0.00";
    return parseFloat(functionDailyValues[fn.id] ?? "0") !== parseFloat(savedVal);
  }).length;
  const totalUnsaved = dirtyFormFields + dirtyFunctionCount;
  const hasAnyChanges = totalUnsaved > 0;
  const isSavingAny = saveFunctionValuesMutation.isPending;

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body: Record<string, number> = {};
      for (const [key, val] of Object.entries(values)) {
        body[key] = parseFloat(val);
      }
      body["default_mobility"] = (parseFloat(values.default_mobility_ida) || 0) + (parseFloat(values.default_mobility_volta) || 0);
      return apiRequest("PUT", "/api/system-settings", body);
    },
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      const now = new Date().toISOString();
      const userName = (user as any)?.name || (user as any)?.username || "Admin";
      const newEntries: HistoryEntry[] = [];
      if (settings) {
        for (const key of Object.keys(values) as (keyof FormValues)[]) {
          const oldVal = centavosToReais((settings as any)[key] ?? (settings as any)["default_daily_value"] ?? 0);
          const newVal = values[key];
          if (parseFloat(oldVal) !== parseFloat(newVal)) {
            newEntries.push({ timestamp: now, user: userName, field: FIELD_LABELS[key] ?? key, oldValue: formatCurrency(oldVal), newValue: formatCurrency(newVal) });
          }
        }
      }
      const updatedHistory = [...newEntries, ...history].slice(0, 40);
      setHistory(updatedHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
      const savedInfo = { timestamp: now, user: userName };
      setLastSaved(savedInfo);
      localStorage.setItem(LAST_SAVED_KEY, JSON.stringify(savedInfo));
    },
    onError: () => { toast({ title: "Erro ao salvar", variant: "destructive" }); },
  });

  const handleSaveAll = form.handleSubmit(async (values) => {
    try {
      await saveMutation.mutateAsync(values);
      if (dirtyFunctionCount > 0) {
        await saveFunctionValuesMutation.mutateAsync();
        queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
      }
      // Apply new defaults to all pending (not-yet-sent) budget_planned records
      let updatedCount = 0;
      try {
        const applyRes = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
        const applyData = await applyRes.json();
        updatedCount = applyData.updated ?? 0;
        if (updatedCount > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
        }
      } catch { /* non-critical */ }
      toast({
        title: "Valores padrão salvos",
        description: updatedCount > 0
          ? `${updatedCount} planejamento${updatedCount > 1 ? 's' : ''} pendente${updatedCount > 1 ? 's' : ''} atualizado${updatedCount > 1 ? 's' : ''} com os novos valores.`
          : "Os novos valores serão aplicados em orçamentos de novos eventos.",
      });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  });

  function startEditFunction(fn: FunctionType) {
    setEditingFunctionId(fn.id);
    setEditingFunctionValue(functionDailyValues[fn.id] ?? "0.00");
  }
  function confirmEditFunction(fnId: string) {
    setFunctionDailyValues(prev => ({ ...prev, [fnId]: editingFunctionValue }));
    setEditingFunctionId(null);
  }
  function cancelEditFunction() {
    setEditingFunctionId(null);
  }

  if (!isAdmin(user)) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Acesso restrito</h2>
          <p className="text-gray-500 max-w-xs">Apenas administradores podem acessar os valores padrão do sistema.</p>
        </div>
      </div>
    );
  }

  /* ── Group history by save event (same timestamp) ── */
  const groupedHistory = history.reduce<{ timestamp: string; user: string; entries: HistoryEntry[] }[]>((acc, e) => {
    const existing = acc.find(g => g.timestamp === e.timestamp && g.user === e.user);
    if (existing) { existing.entries.push(e); }
    else { acc.push({ timestamp: e.timestamp, user: e.user, entries: [e] }); }
    return acc;
  }, []).slice(0, 10);

  return (
    <TooltipProvider>
    <div className="p-6 max-w-6xl space-y-6">

      {/* ── Barra flutuante de salvamento ── */}
      {hasAnyChanges && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: '#1E293B',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '10px 16px 10px 20px',
            minWidth: 340,
            animation: 'fadeIn 0.18s ease',
          }}
        >
          <span style={{ fontSize: 13, color: '#CBD5E1', flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#F8FAFC' }}>{totalUnsaved}</span>{' '}
            alteraç{totalUnsaved === 1 ? 'ão' : 'ões'} não salva{totalUnsaved === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => handleSaveAll()}
            disabled={isSavingAny || saveMutation.isPending}
            style={{
              background: (isSavingAny || saveMutation.isPending) ? '#475569' : '#3B4FE4',
              color: '#fff',
              border: 'none',
              borderRadius: 9,
              padding: '7px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: '0 2px 10px rgba(59,79,228,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            <Save style={{ width: 14, height: 14 }} />
            {(isSavingAny || saveMutation.isPending) ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => { form.reset(); }}
            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontSize: 12 }}
            title="Descartar alterações"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}

      {/* ── Cabeçalho ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-200">
          <Calculator className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Valores Padrão</h1>
          <p className="text-xs text-gray-500">Defina os valores base utilizados no cálculo de novos eventos</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={e => { e.preventDefault(); handleSaveAll(); }} className="space-y-6">

          {/* ── Cards superiores ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5" style={{ alignItems: 'flex-start' }}>

            {/* Diárias */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', borderBottom: '1px solid #BFDBFE', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(59,130,246,0.3)', flexShrink: 0 }}>
                  <DollarSign style={{ width: 18, height: 18, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#1E40AF', margin: 0 }}>Diárias</p>
                  <p style={{ fontSize: 11, color: '#3B82F6', margin: 0 }}>Valor pago por dia trabalhado</p>
                </div>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <FormField control={form.control} name="default_daily_value_weekday" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Dia Útil</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="default_daily_value_weekend" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Fim de Semana</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Mobilidade */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)', borderBottom: '1px solid #FED7AA', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#F97316', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(249,115,22,0.3)', flexShrink: 0 }}>
                  <Car style={{ width: 18, height: 18, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#9A3412', margin: 0 }}>Mobilidade</p>
                  <p style={{ fontSize: 11, color: '#F97316', margin: 0 }}>Ajuda de custo de deslocamento</p>
                </div>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="default_mobility_ida" render={({ field }) => (
                    <FormItem>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Ida</p>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="default_mobility_volta" render={({ field }) => (
                    <FormItem>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Volta</p>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>Total mobilidade</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#F97316' }}>
                    {isNaN(mobilityTotal) ? '—' : `R$ ${mobilityTotal.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Alimentação */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', borderBottom: '1px solid #BBF7D0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(16,185,129,0.3)', flexShrink: 0 }}>
                  <Utensils style={{ width: 18, height: 18, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#065F46', margin: 0 }}>Alimentação</p>
                  <p style={{ fontSize: 11, color: '#10B981', margin: 0 }}>Almoço e jantar por dia</p>
                </div>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Dias Úteis</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="default_weekday_lunch" render={({ field }) => (
                      <FormItem>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Almoço</p>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="default_weekday_dinner" render={({ field }) => (
                      <FormItem>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Jantar</p>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Fim de Semana</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="default_weekend_lunch" render={({ field }) => (
                      <FormItem>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Almoço</p>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="default_weekend_dinner" render={({ field }) => (
                      <FormItem>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Jantar</p>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabela: Diária por Função ── */}
          {(() => {
            const coordinator = allFunctions.find(fn => fn.responsibleArea === '__system__');
            const regularFns = allFunctions
              .filter(fn => fn.responsibleArea !== '__system__')
              .filter(fn => fn.name.toLowerCase().includes(functionSearch.toLowerCase()))
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            const visibleFns = coordinator && !functionSearch
              ? [coordinator, ...regularFns]
              : coordinator && coordinator.name.toLowerCase().includes(functionSearch.toLowerCase())
              ? [coordinator, ...regularFns]
              : regularFns;

            return (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <BadgeCheck className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 leading-tight">Diária por Função</p>
                      <p className="text-[11px] text-slate-400 font-light">Valor padrão usado ao criar escalações</p>
                    </div>
                    {dirtyFunctionCount > 0 && (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        {dirtyFunctionCount} alterada{dirtyFunctionCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {allFunctions.length > 0 && (
                  <div className="px-5 py-3 border-b border-slate-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar função..."
                        value={functionSearch}
                        onChange={e => setFunctionSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-full bg-slate-100 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 border-none"
                      />
                    </div>
                  </div>
                )}

                {allFunctions.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <BadgeCheck className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500 mb-1">Nenhuma função cadastrada.</p>
                    <p className="text-xs text-slate-400 mb-4">Acesse a página de Funções para adicionar.</p>
                    <Link href="/functions" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline">
                      Ir para Funções <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ) : visibleFns.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-slate-400">
                    Nenhuma função encontrada para "<span className="font-medium">{functionSearch}</span>".
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 px-5 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Função</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Valor (Diária)</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {visibleFns.map((fn) => {
                        const isCoord = fn.responsibleArea === '__system__';
                        const fv = allFunctionValues.find(v => v.functionId === fn.id);
                        const currentVal = functionDailyValues[fn.id] ?? "0.00";
                        const savedVal = fv ? centavosToReais(fv.dailyValue) : "0.00";
                        const isDirty = parseFloat(currentVal) !== parseFloat(savedVal);
                        const isEditing = editingFunctionId === fn.id;
                        const hasCustomValue = fv && fv.dailyValue > 0;
                        const isZero = parseFloat(currentVal) === 0;

                        return (
                          <div
                            key={fn.id}
                            style={{ height: 44, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0 20px' }}
                            className={`transition-colors group cursor-pointer
                              ${isCoord ? 'bg-blue-50/40' : 'bg-white hover:bg-slate-50/70'}
                              ${isDirty ? 'ring-1 ring-inset ring-amber-200' : ''}
                            `}
                            onClick={() => { if (!isEditing) startEditFunction(fn); }}
                          >
                            {/* Nome + badges */}
                            <div className="flex items-center gap-2 min-w-0">
                              {isCoord ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[9px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full shrink-0 cursor-help">Base</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[220px] text-center text-xs leading-snug">
                                    Função base: valor usado como referência quando a função do colaborador não possui valor personalizado cadastrado
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                              <span className={`text-sm font-medium truncate ${isCoord ? 'text-blue-700' : isDirty ? 'text-amber-700 font-semibold' : 'text-slate-700'}`}>
                                {toTitleCase(fn.name)}
                              </span>
                            </div>

                            {/* Valor / input inline */}
                            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="flex items-center gap-1 bg-indigo-50 ring-1 ring-indigo-300 rounded-md px-2 py-1">
                                    <span className="text-[11px] text-slate-400 font-medium select-none">R$</span>
                                    <input
                                      ref={editInputRef}
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={editingFunctionValue}
                                      onChange={e => setEditingFunctionValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); confirmEditFunction(fn.id); }
                                        if (e.key === 'Escape') cancelEditFunction();
                                      }}
                                      className="w-20 text-sm font-mono text-right bg-transparent border-none outline-none focus:outline-none tabular-nums text-indigo-600 font-semibold"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => confirmEditFunction(fn.id)}
                                    className="w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditFunction}
                                    className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-600"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {isZero ? (
                                    <span className="text-sm text-slate-300 italic">Não definido</span>
                                  ) : hasCustomValue ? (
                                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#3B4FE4' }}>
                                      {`R$ ${parseFloat(currentVal).toFixed(2).replace('.', ',')}`}
                                    </span>
                                  ) : (
                                    <span className="text-sm tabular-nums" style={{ color: '#888' }}>
                                      {`R$ ${parseFloat(currentVal).toFixed(2).replace('.', ',')}`}
                                    </span>
                                  )}
                                  {!isZero && (
                                    hasCustomValue ? (
                                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#EEF0FF', color: '#3B4FE4' }}>✎ Personalizado</span>
                                    ) : (
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">Padrão</span>
                                    )
                                  )}
                                  {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                                  <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">{allFunctions.length} {allFunctions.length === 1 ? 'função' : 'funções'} cadastradas</span>
                      <Link href="/functions" className="inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 font-medium hover:underline">
                        Gerenciar funções <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* ── Rodapé com botão único ── */}
          <div className="flex items-center justify-between gap-4 py-4 border-t border-gray-200 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <span>Apenas administradores podem alterar estes valores</span>
              </div>
              {hasAnyChanges && (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  {totalUnsaved} alteraç{totalUnsaved === 1 ? 'ão' : 'ões'} não salva{totalUnsaved === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {lastSaved && (
                <span className="text-xs text-gray-400 hidden sm:block">
                  Salvo em {formatDateTime(lastSaved.timestamp)} · <span className="font-medium">{lastSaved.user}</span>
                </span>
              )}
              <Button
                type="submit"
                disabled={!hasAnyChanges || isSavingAny || saveMutation.isPending}
                style={{ background: hasAnyChanges ? '#3B4FE4' : undefined, boxShadow: hasAnyChanges ? '0 4px 14px rgba(59,79,228,0.3)' : undefined }}
                className="px-6 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <Save className="w-4 h-4 mr-2" />
                {(isSavingAny || saveMutation.isPending) ? "Salvando..." : "Salvar Valores Padrão"}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      {/* ── Empresas Pagadoras ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2.5 px-5 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-gray-700">Empresas Pagadoras</span>
            <span className="text-xs text-gray-400 font-normal">(usadas nas Notas Fiscais)</span>
          </div>
          {!showAddCompany && (
            <button
              type="button"
              onClick={() => setShowAddCompany(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar empresa
            </button>
          )}
        </div>
        <div className="bg-white p-5 space-y-4">
          {paymentCompanies.length === 0 && !showAddCompany ? (
            <p className="text-sm text-gray-400 text-center py-3">Nenhuma empresa cadastrada.</p>
          ) : paymentCompanies.length > 0 ? (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
              {paymentCompanies.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{c.cnpj}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteCompanyMutation.mutate(c.id)}
                    disabled={deleteCompanyMutation.isPending}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Remover empresa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Formulário expansível */}
          {showAddCompany ? (
            <div className="border border-dashed border-emerald-200 rounded-xl p-4 bg-emerald-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700">Nova empresa</p>
                <button type="button" onClick={() => { setShowAddCompany(false); setNewCompanyName(""); setNewCompanyCnpj(""); }} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Nome da empresa</label>
                  <Input
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    placeholder="Ex.: Produtora Norte Ltda"
                    className="h-9 text-sm border-gray-200 rounded-lg"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">CNPJ</label>
                  <CnpjInput value={newCompanyCnpj} onChange={setNewCompanyCnpj} name="newCompanyCnpj" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={!newCompanyName.trim() || !validateCnpj(newCompanyCnpj) || createCompanyMutation.isPending}
                  onClick={() => createCompanyMutation.mutate({ name: newCompanyName.trim(), cnpj: newCompanyCnpj })}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-4"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Cadastrar empresa
                </Button>
                <button type="button" onClick={() => { setShowAddCompany(false); setNewCompanyName(""); setNewCompanyCnpj(""); }} className="text-xs text-slate-400 hover:text-slate-600">
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Histórico de Alterações ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {groupedHistory.length === 0 ? (
          <div className="flex items-center gap-2.5 px-5 py-4 text-sm text-gray-400">
            <Clock className="w-4 h-4 text-gray-300" />
            <span>Histórico de alterações</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 font-normal">Nenhuma alteração registrada</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
                <Clock className="w-4 h-4 text-indigo-500" />
                Histórico de alterações
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold">
                  {groupedHistory.length}
                </span>
              </div>
              {historyOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {historyOpen && (
              <div className="bg-white divide-y divide-gray-100">
                {groupedHistory.map((group, gi) => (
                  <div key={gi} className="flex items-start gap-4 px-5 py-4">
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #3B4FE4, #6366F1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff',
                    }}>
                      {getUserInitials(group.user)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-sm font-semibold text-gray-800">{group.user}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(group.timestamp)}</span>
                        <span className="text-xs text-gray-400">· alterou:</span>
                      </div>
                      <div className="space-y-0.5">
                        {group.entries.map((e, ei) => (
                          <div key={ei} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <span className="text-gray-300">·</span>
                            <span className="font-medium text-gray-700">{e.field}:</span>
                            <span className="text-red-400 line-through">{e.oldValue}</span>
                            <span className="text-gray-300">→</span>
                            <span className="text-emerald-600 font-semibold">{e.newValue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
