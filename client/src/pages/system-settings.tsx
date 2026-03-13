import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  Calculator, Save, DollarSign, Car, Utensils, ShieldAlert,
  Lock, ChevronDown, ChevronUp, Clock, Info, BadgeCheck, ExternalLink, Search
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdmin } from "@/lib/permissions";
import type { Function as FunctionType, FunctionValue } from "@shared/schema";

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
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}h${pad(d.getMinutes())}`;
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
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold select-none">R$</span>
      <Input
        type="number"
        step="0.01"
        min="0"
        {...field}
        className="pl-10 h-11 text-base font-semibold bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-600 focus:bg-white dark:focus:bg-gray-800 rounded-lg"
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

  const saveFunctionValuesMutation = useMutation({
    mutationFn: async () => {
      const promises = allFunctions.map(async fn => {
        const fv = allFunctionValues.find(v => v.functionId === fn.id);
        const newVal = Math.round(parseFloat(functionDailyValues[fn.id] || "0") * 100);
        if (fv) {
          return apiRequest("PATCH", `/api/function-values/${fv.id}`, { dailyValue: newVal });
        } else {
          return apiRequest("POST", "/api/function-values", {
            functionId: fn.id,
            dailyValue: newVal,
            costAssistance: 0,
            mobility: 0,
            transport: 0,
            weekdayLunch: 0,
            weekdayDinner: 0,
            weekendLunch: 0,
            weekendDinner: 0,
          });
        }
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
      toast({ title: "Valores por função salvos", description: "Os valores de diária por função foram atualizados." });
    },
    onError: () => {
      toast({ title: "Erro ao salvar valores por função", variant: "destructive" });
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
            newEntries.push({
              timestamp: now,
              user: userName,
              field: FIELD_LABELS[key] ?? key,
              oldValue: formatCurrency(oldVal),
              newValue: formatCurrency(newVal),
            });
          }
        }
      }

      const updatedHistory = [...newEntries, ...history].slice(0, 20);
      setHistory(updatedHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));

      const savedInfo = { timestamp: now, user: userName };
      setLastSaved(savedInfo);
      localStorage.setItem(LAST_SAVED_KEY, JSON.stringify(savedInfo));

      toast({ title: "Valores padrão salvos", description: "Os novos valores serão aplicados em orçamentos de novos eventos." });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  if (!isAdmin(user)) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Acesso restrito</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-xs">Apenas administradores podem acessar os valores padrão do sistema.</p>
        </div>
      </div>
    );
  }

  const last5 = history.slice(0, 5);

  return (
    <div className="p-6 max-w-6xl space-y-6">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-200 dark:shadow-purple-900/30">
          <Calculator className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Valores Padrão</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Defina os valores base utilizados no cálculo de novos eventos</p>
        </div>
      </div>

      {/* ── Banner informativo azul ── */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', alignItems: 'flex-start' }}>
        <Info style={{ width: 16, height: 16, color: '#3B82F6', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: '#1E40AF', margin: 0, lineHeight: 1.55 }}>
          Estes valores são utilizados como base no momento em que um novo evento é criado.
          <strong> Eventos já cadastrados no sistema não são afetados</strong> por alterações aqui.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-6">

          {/* ── Cards ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5" style={{ alignItems: 'stretch' }}>

            {/* Diárias */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', borderBottom: '1px solid #BFDBFE', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(59,130,246,0.3)' }}>
                  <DollarSign style={{ width: 20, height: 20, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#1E40AF', margin: 0 }}>Diárias</p>
                  <p style={{ fontSize: 11, color: '#3B82F6', margin: 0 }}>Valor pago por dia trabalhado</p>
                </div>
              </div>
              <div className="px-5 py-5 flex flex-col gap-4 flex-1">
                <FormField
                  control={form.control}
                  name="default_daily_value_weekday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Dia Útil</FormLabel>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <p className="text-[10px] text-gray-400 mt-0.5">valor por dia útil trabalhado</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="default_daily_value_weekend"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Fim de Semana</FormLabel>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <p className="text-[10px] text-gray-400 mt-0.5">valor por dia de fim de semana trabalhado</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Mobilidade */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)', borderBottom: '1px solid #FED7AA', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F97316', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(249,115,22,0.3)' }}>
                  <Car style={{ width: 20, height: 20, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#9A3412', margin: 0 }}>Mobilidade</p>
                  <p style={{ fontSize: 11, color: '#F97316', margin: 0 }}>Ajuda de custo de deslocamento (ida e volta)</p>
                </div>
              </div>
              <div className="px-5 py-5 flex flex-col gap-4 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="default_mobility_ida"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Ida</FormLabel>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="default_mobility_volta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Volta</FormLabel>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-800/40 text-[12px]">
                  <span className="text-orange-700 dark:text-orange-400 font-medium">Total mobilidade</span>
                  <span className="font-bold text-orange-800 dark:text-orange-300 tabular-nums">
                    {isNaN(mobilityTotal) ? '—' : `R$ ${mobilityTotal.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Alimentação */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', borderBottom: '1px solid #BBF7D0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(16,185,129,0.3)' }}>
                  <Utensils style={{ width: 20, height: 20, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#065F46', margin: 0 }}>Alimentação</p>
                  <p style={{ fontSize: 11, color: '#10B981', margin: 0 }}>Almoço e jantar por dia</p>
                </div>
              </div>
              <div className="px-5 py-5 flex flex-col gap-5 flex-1">
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Dias Úteis</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="default_weekday_lunch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-500">Almoço</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="default_weekday_dinner"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-500">Jantar</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Fim de Semana</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="default_weekend_lunch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-500">Almoço</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="default_weekend_dinner"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-500">Jantar</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Card: Função ── */}
          {(() => {
            const filteredFunctions = allFunctions.filter(fn =>
              fn.name.toLowerCase().includes(functionSearch.toLowerCase())
            );
            const dirtyCount = allFunctions.filter(fn => {
              const fv = allFunctionValues.find(v => v.functionId === fn.id);
              const savedVal = fv ? centavosToReais(fv.dailyValue) : "0.00";
              return parseFloat(functionDailyValues[fn.id] ?? "0") !== parseFloat(savedVal);
            }).length;

            return (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">

                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', borderBottom: '1px solid #C7D2FE', padding: '14px 20px' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(79,70,229,0.3)', flexShrink: 0 }}>
                        <BadgeCheck style={{ width: 18, height: 18, color: '#fff' }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p style={{ fontWeight: 700, fontSize: 14, color: '#312E81', margin: 0 }}>Função</p>
                          {allFunctions.length > 0 && (
                            <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded-full">
                              {allFunctions.length} {allFunctions.length === 1 ? 'função' : 'funções'} cadastradas
                            </span>
                          )}
                          {dirtyCount > 0 && (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                              {dirtyCount} alterada{dirtyCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: '#6366F1', margin: 0 }}>Valor padrão de diária por função escalada</p>
                      </div>
                    </div>
                    {allFunctions.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={saveFunctionValuesMutation.isPending || dirtyCount === 0}
                        onClick={() => saveFunctionValuesMutation.mutate()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm shrink-0"
                      >
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        {saveFunctionValuesMutation.isPending ? "Salvando..." : "Salvar Funções"}
                      </Button>
                    )}
                  </div>

                  {/* Search bar */}
                  {allFunctions.length > 0 && (
                    <div className="relative mt-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-300 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar função..."
                        value={functionSearch}
                        onChange={e => setFunctionSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600"
                      />
                    </div>
                  )}
                </div>

                {/* Empty state */}
                {allFunctions.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mx-auto mb-4">
                      <BadgeCheck className="w-7 h-7 text-indigo-200 dark:text-indigo-700" />
                    </div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Nenhuma função cadastrada ainda.</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Acesse a página de Funções para adicionar funções ao sistema.</p>
                    <Link href="/functions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline">
                      Ir para Funções
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : filteredFunctions.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-gray-400">
                    Nenhuma função encontrada para "<span className="font-medium">{functionSearch}</span>".
                  </div>
                ) : (
                  <>
                    {/* Column header */}
                    <div className="grid grid-cols-2 px-4 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Função</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right pr-1">Valor / dia</span>
                    </div>
                    <p className="text-[10px] text-gray-400 px-4 pt-2 pb-1">Todos os valores são R$ por dia trabalhado</p>

                    {/* Two-column list */}
                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {filteredFunctions.map((fn, idx) => {
                        const fv = allFunctionValues.find(v => v.functionId === fn.id);
                        const currentVal = functionDailyValues[fn.id] ?? "0.00";
                        const savedVal = fv ? centavosToReais(fv.dailyValue) : "0.00";
                        const isDirty = parseFloat(currentVal) !== parseFloat(savedVal);
                        const isEven = idx % 2 === 0;
                        return (
                          <div
                            key={fn.id}
                            className={`flex items-center gap-3 px-4 transition-colors ${isEven ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/60 dark:bg-gray-800/40'} ${isDirty ? 'ring-1 ring-inset ring-indigo-200 dark:ring-indigo-700' : ''}`}
                            style={{ minHeight: 44 }}
                          >
                            {/* Left: icon + name */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isDirty ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-indigo-50 dark:bg-indigo-950/30'}`}>
                                <BadgeCheck className={`w-3 h-3 ${isDirty ? 'text-indigo-600' : 'text-indigo-300 dark:text-indigo-600'}`} />
                              </div>
                              <span className={`text-sm truncate ${isDirty ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`} title={fn.name}>
                                {toTitleCase(fn.name)}
                              </span>
                              {isDirty && (
                                <span className="shrink-0 text-[9px] font-bold text-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded-full">●</span>
                              )}
                            </div>

                            {/* Right: input */}
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[11px] text-gray-400 font-medium">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={currentVal}
                                onChange={e => setFunctionDailyValues(prev => ({ ...prev, [fn.id]: e.target.value }))}
                                className={`h-8 w-28 text-sm font-semibold text-right tabular-nums px-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 bg-white dark:bg-gray-900 transition-colors ${isDirty ? 'border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* ── Rodapé ── */}
          <div className="flex items-center justify-between gap-4 py-4 border-t border-gray-200 dark:border-gray-700 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>Apenas administradores podem alterar estes valores</span>
            </div>
            {lastSaved && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Última alteração: {formatDateTime(lastSaved.timestamp)} por <span className="font-medium">{lastSaved.user}</span>
              </span>
            )}
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 shadow-md shadow-purple-200 dark:shadow-purple-900/30"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar Valores Padrão"}
            </Button>
          </div>
        </form>
      </Form>

      {/* ── Histórico de Alterações ── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <Clock className="w-4 h-4 text-purple-500" />
            Histórico de alterações
            {last5.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 text-xs font-bold">
                {last5.length}
              </span>
            )}
          </div>
          {historyOpen
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {historyOpen && (
          <div className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
            {last5.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                Nenhuma alteração registrada ainda.
              </div>
            ) : (
              last5.map((entry, i) => {
                const initials = getUserInitials(entry.user);
                return (
                  <div key={i} className="flex items-start gap-4 px-5 py-4">
                    {/* Avatar com iniciais */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#fff',
                    }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{entry.user}</span>
                        <span className="text-xs text-gray-400 font-mono">{formatDateTime(entry.timestamp)}</span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        alterou{" "}
                        <span className="font-semibold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">
                          {entry.field}
                        </span>
                        {": "}
                        <span className="text-red-500 font-medium line-through">{entry.oldValue}</span>
                        <span className="mx-1.5 text-gray-400">→</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{entry.newValue}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
