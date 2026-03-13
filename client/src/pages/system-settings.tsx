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
import { Settings, Save, DollarSign, Car, Utensils, ShieldAlert, Lock, ChevronDown, ChevronUp, History, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdmin } from "@/lib/permissions";

const formSchema = z.object({
  default_daily_value_weekday: z.string().min(1, "Obrigatório"),
  default_daily_value_weekend: z.string().min(1, "Obrigatório"),
  default_mobility: z.string().min(1, "Obrigatório"),
  default_weekday_lunch: z.string().min(1, "Obrigatório"),
  default_weekday_dinner: z.string().min(1, "Obrigatório"),
  default_weekend_lunch: z.string().min(1, "Obrigatório"),
  default_weekend_dinner: z.string().min(1, "Obrigatório"),
});

type FormValues = z.infer<typeof formSchema>;

const FIELD_LABELS: Record<string, string> = {
  default_daily_value_weekday: "Diária — Dia Útil",
  default_daily_value_weekend: "Diária — Fim de Semana",
  default_mobility: "Mobilidade",
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

function CurrencyInput({ field }: { field: any }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 font-medium select-none">R$</span>
      <Input type="number" step="0.01" min="0" {...field} className="pl-9 h-10" />
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_daily_value_weekday: "50.00",
      default_daily_value_weekend: "50.00",
      default_mobility: "25.00",
      default_weekday_lunch: "35.00",
      default_weekday_dinner: "40.00",
      default_weekend_lunch: "40.00",
      default_weekend_dinner: "45.00",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        default_daily_value_weekday: centavosToReais(settings.default_daily_value_weekday ?? settings.default_daily_value ?? 5000),
        default_daily_value_weekend: centavosToReais(settings.default_daily_value_weekend ?? settings.default_daily_value ?? 5000),
        default_mobility: centavosToReais(settings.default_mobility ?? 2500),
        default_weekday_lunch: centavosToReais(settings.default_weekday_lunch ?? 3500),
        default_weekday_dinner: centavosToReais(settings.default_weekday_dinner ?? 4000),
        default_weekend_lunch: centavosToReais(settings.default_weekend_lunch ?? 4000),
        default_weekend_dinner: centavosToReais(settings.default_weekend_dinner ?? 4500),
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body: Record<string, number> = {};
      for (const [key, val] of Object.entries(values)) {
        body[key] = parseFloat(val);
      }
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

      const updatedHistory = [...newEntries, ...history].slice(0, 20);
      setHistory(updatedHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));

      const savedInfo = { timestamp: now, user: userName };
      setLastSaved(savedInfo);
      localStorage.setItem(LAST_SAVED_KEY, JSON.stringify(savedInfo));

      toast({ title: "Configurações salvas", description: "Os novos valores padrão serão aplicados em orçamentos futuros." });
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
          <p className="text-gray-500 dark:text-gray-400 max-w-xs">Apenas administradores podem acessar as configurações do sistema.</p>
        </div>
      </div>
    );
  }

  const last5 = history.slice(0, 5);

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
          <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configurações</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Valores padrão para cálculo de orçamentos</p>
        </div>
      </div>

      {/* Alert */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', marginBottom: 24, borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A', alignItems: 'flex-start' }}>
        <AlertTriangle style={{ width: 16, height: 16, color: '#D97706', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
          <strong>Atenção:</strong> Estes valores são utilizados como base no momento em que um novo evento é criado. Eventos já cadastrados no sistema não são afetados por alterações aqui.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>

          {/* Cards */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6" style={{ alignItems: 'stretch' }}>

            {/* Diárias */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Diárias</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Valor por dia de trabalho</p>
                </div>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <div className="px-5 py-4 flex flex-col gap-4 flex-1">
                <FormField
                  control={form.control}
                  name="default_daily_value_weekday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Dia Útil</FormLabel>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="default_daily_value_weekend"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Fim de Semana</FormLabel>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Mobilidade */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-950 flex items-center justify-center flex-shrink-0">
                  <Car className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Mobilidade</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ajuda de custo de deslocamento</p>
                </div>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <div className="px-5 py-4 flex flex-col gap-4 flex-1">
                <FormField
                  control={form.control}
                  name="default_mobility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Valor por Evento</FormLabel>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Alimentação */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0">
                  <Utensils className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Alimentação</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Almoço e jantar por dia</p>
                </div>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <div className="px-5 py-4 flex flex-col gap-5 flex-1">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Dias Úteis</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="default_weekday_lunch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Almoço</FormLabel>
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
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Jantar</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Fim de Semana</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="default_weekend_lunch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Almoço</FormLabel>
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
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Jantar</FormLabel>
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

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 py-4 border-t border-gray-200 dark:border-gray-700 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>Apenas administradores podem alterar estes valores</span>
            </div>
            {lastSaved && (
              <span className="text-xs text-gray-400 dark:text-gray-500 hidden md:block">
                Última alteração: {formatDateTime(lastSaved.timestamp)} por {lastSaved.user}
              </span>
            )}
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </form>
      </Form>

      {/* Histórico de Alterações */}
      <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <History className="w-4 h-4 text-gray-400" />
            Histórico de alterações
            {last5.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 text-xs font-semibold">
                {last5.length}
              </span>
            )}
          </div>
          {historyOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {historyOpen && (
          <div className="bg-white dark:bg-gray-800 px-5 py-4">
            {last5.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhuma alteração registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {last5.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0 mt-1.5" />
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-mono mr-2">{formatDateTime(entry.timestamp)}</span>
                      <span className="font-medium">{entry.user}</span>
                      {" alterou "}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{entry.field}</span>
                      {": "}
                      <span className="text-red-500 line-through">{entry.oldValue}</span>
                      {" → "}
                      <span className="text-green-600 font-semibold">{entry.newValue}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
