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
  Search, Building2, Plus, Trash2, Pencil, Check, X, AlertCircle, RefreshCw
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { isRhOrAdmin } from "@/lib/permissions";
import type { Function as FunctionType, FunctionValue, PaymentCompany } from "@shared/schema";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";

const formSchema = z.object({
  // Casa
  default_daily_value_weekday: z.string().min(1, "Obrigatório"),
  default_daily_value_weekend: z.string().min(1, "Obrigatório"),
  default_mobility_ida: z.string().min(1, "Obrigatório"),
  default_mobility_volta: z.string().min(1, "Obrigatório"),
  default_weekday_lunch: z.string().min(1, "Obrigatório"),
  default_weekday_dinner: z.string().min(1, "Obrigatório"),
  default_weekend_lunch: z.string().min(1, "Obrigatório"),
  default_weekend_dinner: z.string().min(1, "Obrigatório"),
  // Freela
  default_daily_value_weekday_freela: z.string().min(1, "Obrigatório"),
  default_daily_value_weekend_freela: z.string().min(1, "Obrigatório"),
  default_mobility_ida_freela: z.string().min(1, "Obrigatório"),
  default_mobility_volta_freela: z.string().min(1, "Obrigatório"),
  default_weekday_lunch_freela: z.string().min(1, "Obrigatório"),
  default_weekday_dinner_freela: z.string().min(1, "Obrigatório"),
  default_weekend_lunch_freela: z.string().min(1, "Obrigatório"),
  default_weekend_dinner_freela: z.string().min(1, "Obrigatório"),
  // Atendimento
  atendimento_key_account: z.string().min(1, "Obrigatório"),
  atendimento_executivo_contas: z.string().min(1, "Obrigatório"),
  // Diárias Freela (regra por viagem) — monetárias normais (reais<->centavos)
  freela_diaria_local: z.string().min(1, "Obrigatório"),
  freela_diaria_viagem: z.string().min(1, "Obrigatório"),
  freela_diaria_dir_prova: z.string().min(1, "Obrigatório"),
  // Diárias Casa (regra por grupo de função) — monetárias normais (reais<->centavos)
  casa_diaria_dir_prova: z.string().min(1, "Obrigatório"),
  casa_diaria_produtor: z.string().min(1, "Obrigatório"),
  casa_diaria_exec_vendas: z.string().min(1, "Obrigatório"),
  // Regra de deflação (diárias) — percentuais inteiros 0..100, NÃO monetários
  deflacao_fator_ate_4: z.string().min(1, "Obrigatório"),
  deflacao_fator_5_8: z.string().min(1, "Obrigatório"),
  deflacao_fator_9_mais: z.string().min(1, "Obrigatório"),
  // Alimentação por refeição (regra por voo) — monetárias normais (reais<->centavos)
  alimentacao_almoco: z.string().min(1, "Obrigatório"),
  alimentacao_jantar: z.string().min(1, "Obrigatório"),
  alimentacao_almoco_ceno: z.string().min(1, "Obrigatório"),
  alimentacao_jantar_ceno: z.string().min(1, "Obrigatório"),
});

// Chaves percentuais inteiras (0..100). NÃO passam por conversão reais<->centavos.
const PERCENT_KEYS = new Set<string>([
  "deflacao_fator_ate_4",
  "deflacao_fator_5_8",
  "deflacao_fator_9_mais",
]);
type FormValues = z.infer<typeof formSchema>;

const FIELD_LABELS: Record<string, string> = {
  default_daily_value_weekday: "Diária Casa — Dia Útil",
  default_daily_value_weekend: "Diária Casa — Fim de Semana",
  default_mobility_ida: "Mobilidade Casa — Ida",
  default_mobility_volta: "Mobilidade Casa — Volta",
  default_weekday_lunch: "Almoço Casa — Dia Útil",
  default_weekday_dinner: "Jantar Casa — Dia Útil",
  default_weekend_lunch: "Almoço Casa — Fim de Semana",
  default_weekend_dinner: "Jantar Casa — Fim de Semana",
  default_daily_value_weekday_freela: "Diária Freela — Dia Útil",
  default_daily_value_weekend_freela: "Diária Freela — Fim de Semana",
  default_mobility_ida_freela: "Mobilidade Freela — Ida",
  default_mobility_volta_freela: "Mobilidade Freela — Volta",
  default_weekday_lunch_freela: "Almoço Freela — Dia Útil",
  default_weekday_dinner_freela: "Jantar Freela — Dia Útil",
  default_weekend_lunch_freela: "Almoço Freela — Fim de Semana",
  default_weekend_dinner_freela: "Jantar Freela — Fim de Semana",
  atendimento_key_account: "Atendimento — Key Account",
  atendimento_executivo_contas: "Atendimento — Executivo de Contas",
  freela_diaria_local: "Diária Freela — Local (sem viagem)",
  freela_diaria_viagem: "Diária Freela — Em viagem",
  freela_diaria_dir_prova: "Diária Freela — Dir de Prova",
  casa_diaria_dir_prova: "Diária Casa — Dir. de Prova",
  casa_diaria_produtor: "Diária Casa — Produtor",
  casa_diaria_exec_vendas: "Diária Casa — Exec. Vendas O2 Prime",
  deflacao_fator_ate_4: "Deflação — Até 4 dias (%)",
  deflacao_fator_5_8: "Deflação — Do 5º ao 8º dia (%)",
  deflacao_fator_9_mais: "Deflação — A partir do 9º dia (%)",
  alimentacao_almoco: "Alimentação por Refeição — Almoço (Demais)",
  alimentacao_jantar: "Alimentação por Refeição — Jantar (Demais)",
  alimentacao_almoco_ceno: "Alimentação por Refeição — Almoço (Cenotécnica)",
  alimentacao_jantar_ceno: "Alimentação por Refeição — Jantar (Cenotécnica)",
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

// Input de percentual inteiro (0..100) com sufixo "%". NÃO é monetário.
function PercentInput({ field }: { field: any }) {
  return (
    <div className="relative">
      <input
        type="number"
        step="1"
        min="0"
        max="100"
        {...field}
        style={{ height: 38, fontSize: 14, fontWeight: 600, paddingLeft: 12, paddingRight: 34, border: '1px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB', width: '100%', outline: 'none', appearance: 'none' }}
        onFocus={e => { e.target.style.background = '#fff'; e.target.style.borderColor = '#6366F1'; }}
        onBlur={e => { e.target.style.background = '#F9FAFB'; e.target.style.borderColor = '#E5E7EB'; }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400 font-semibold select-none pointer-events-none">%</span>
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
  const [activeTab, setActiveTab] = useState<'casa' | 'freela'>('casa');
  // functionDailyValues: casaWeekday value per function (legacy, kept for compatibility)
  const [functionDailyValues, setFunctionDailyValues] = useState<Record<string, string>>({});
  // Extended function values: weekend + freela variants
  const [fnWeekendValues, setFnWeekendValues] = useState<Record<string, string>>({});
  const [fnFreelaValues, setFnFreelaValues] = useState<Record<string, string>>({});
  const [fnFreelaWeekendValues, setFnFreelaWeekendValues] = useState<Record<string, string>>({});
  const [functionSearch, setFunctionSearch] = useState("");
  const [editingFunctionId, setEditingFunctionId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'wd' | 'we'>('wd');
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

  // Sem permissão, nada é baixado — o gate de render sozinho ainda deixava
  // as 5 queries rodarem e entregarem os dados ao navegador
  const allowed = isRhOrAdmin(user);

  const { data: settings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings", { credentials: "include" });
      return res.json();
    },
    enabled: allowed,
  });

  const { data: allFunctions = [] } = useQuery<FunctionType[]>({
    queryKey: ["/api/functions"],
    queryFn: async () => {
      const res = await fetch("/api/functions", { credentials: "include" });
      return res.json();
    },
    enabled: allowed,
  });

  const { data: fnCollaboratorTypes = {} } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/function-collaborator-types"],
    queryFn: async () => {
      const res = await fetch("/api/function-collaborator-types", { credentials: "include" });
      return res.json();
    },
    staleTime: 0,
    enabled: allowed,
  });

  const { data: allFunctionValues = [] } = useQuery<FunctionValue[]>({
    queryKey: ["/api/function-values"],
    queryFn: async () => {
      const res = await fetch("/api/function-values", { credentials: "include" });
      return res.json();
    },
    enabled: allowed,
  });

  const { data: paymentCompanies = [] } = useQuery<PaymentCompany[]>({
    queryKey: ["/api/payment-companies"],
    enabled: allowed,
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

  // Reconstrói os 4 mapas de valores por função a partir do que está salvo.
  // Usado no carregamento e também pelo "Descartar" do rodapé.
  const resetFunctionValueStates = () => {
    if (allFunctions.length === 0) return;
    const mapCasaWd: Record<string, string> = {};
    const mapCasaWe: Record<string, string> = {};
    const mapFreelaWd: Record<string, string> = {};
    const mapFreelaWe: Record<string, string> = {};
    for (const fn of allFunctions) {
      const fv = allFunctionValues.find(v => v.functionId === fn.id) as any;
      mapCasaWd[fn.id] = fv ? centavosToReais(fv.dailyValue) : "0.00";
      mapCasaWe[fn.id] = fv ? centavosToReais(fv.dailyValueWeekend ?? 0) : "0.00";
      const freelaWd = fv?.dailyValueFreela ?? 0;
      const freelaWe = fv?.dailyValueFreelaWeekend ?? 0;
      mapFreelaWd[fn.id] = fv ? centavosToReais(freelaWd !== 0 ? freelaWd : (fv.dailyValue ?? 0)) : "0.00";
      mapFreelaWe[fn.id] = fv ? centavosToReais(freelaWe !== 0 ? freelaWe : (fv.dailyValueWeekend ?? 0)) : "0.00";
    }
    setFunctionDailyValues(mapCasaWd);
    setFnWeekendValues(mapCasaWe);
    setFnFreelaValues(mapFreelaWd);
    setFnFreelaWeekendValues(mapFreelaWe);
  };

  useEffect(() => {
    resetFunctionValueStates();
  }, [allFunctions, allFunctionValues]);

  useEffect(() => {
    if (editingFunctionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingFunctionId]);

  // Predicado único de "função com valor alterado" — antes estava duplicado
  // verbatim aqui e no contador do rodapé, e as cópias já tinham divergido
  const isFunctionDirty = (fn: FunctionType): boolean => {
    const fv = allFunctionValues.find(v => v.functionId === fn.id) as any;
    const savedCasaWd = fv ? centavosToReais(fv.dailyValue) : "0.00";
    const savedCasaWe = fv ? centavosToReais(fv.dailyValueWeekend ?? 0) : "0.00";
    const freeWdDb = fv?.dailyValueFreela ?? 0;
    const freeWeDb = fv?.dailyValueFreelaWeekend ?? 0;
    const savedFreelaWd = fv ? centavosToReais(freeWdDb !== 0 ? freeWdDb : (fv.dailyValue ?? 0)) : "0.00";
    const savedFreelaWe = fv ? centavosToReais(freeWeDb !== 0 ? freeWeDb : (fv.dailyValueWeekend ?? 0)) : "0.00";
    return (
      parseFloat(functionDailyValues[fn.id] ?? "0") !== parseFloat(savedCasaWd) ||
      parseFloat(fnWeekendValues[fn.id] ?? "0") !== parseFloat(savedCasaWe) ||
      parseFloat(fnFreelaValues[fn.id] ?? "0") !== parseFloat(savedFreelaWd) ||
      parseFloat(fnFreelaWeekendValues[fn.id] ?? "0") !== parseFloat(savedFreelaWe)
    );
  };

  const saveFunctionValuesMutation = useMutation({
    mutationFn: async () => {
      const dirtyFns = allFunctions.filter(isFunctionDirty);
      const promises = dirtyFns.map(async fn => {
        const fv = allFunctionValues.find(v => v.functionId === fn.id);
        const casaWd = Math.round(parseFloat(functionDailyValues[fn.id] || "0") * 100);
        const casaWe = Math.round(parseFloat(fnWeekendValues[fn.id] || "0") * 100);
        const freelaWd = Math.round(parseFloat(fnFreelaValues[fn.id] || "0") * 100);
        const freelaWe = Math.round(parseFloat(fnFreelaWeekendValues[fn.id] || "0") * 100);
        if (fv) {
          return apiRequest("PATCH", `/api/function-values/${fv.id}`, {
            dailyValue: casaWd,
            dailyValueWeekend: casaWe,
            dailyValueFreela: freelaWd,
            dailyValueFreelaWeekend: freelaWe,
          });
        } else {
          return apiRequest("POST", "/api/function-values", {
            functionId: fn.id,
            dailyValue: casaWd,
            dailyValueWeekend: casaWe,
            dailyValueFreela: freelaWd,
            dailyValueFreelaWeekend: freelaWe,
            costAssistance: 0, mobility: 0,
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
      default_daily_value_weekday_freela: "50.00",
      default_daily_value_weekend_freela: "50.00",
      default_mobility_ida_freela: "0.00",
      default_mobility_volta_freela: "0.00",
      default_weekday_lunch_freela: "35.00",
      default_weekday_dinner_freela: "40.00",
      default_weekend_lunch_freela: "40.00",
      default_weekend_dinner_freela: "45.00",
      atendimento_key_account: "580.00",
      atendimento_executivo_contas: "465.00",
      freela_diaria_local: "465.00",
      freela_diaria_viagem: "540.00",
      freela_diaria_dir_prova: "820.00",
      casa_diaria_dir_prova: "750.00",
      casa_diaria_produtor: "465.00",
      casa_diaria_exec_vendas: "260.00",
      deflacao_fator_ate_4: "100",
      deflacao_fator_5_8: "90",
      deflacao_fator_9_mais: "80",
      alimentacao_almoco: "40.00",
      alimentacao_jantar: "40.00",
      alimentacao_almoco_ceno: "35.00",
      alimentacao_jantar_ceno: "35.00",
    },
  });

  useEffect(() => {
    if (settings) {
      const legacyTotal = settings.default_mobility ?? 2500;
      const half = Math.round(legacyTotal / 2);
      const s = settings as Record<string, number>;
      form.reset({
        default_daily_value_weekday: centavosToReais(s.default_daily_value_weekday ?? s.default_daily_value ?? 5000),
        default_daily_value_weekend: centavosToReais(s.default_daily_value_weekend ?? s.default_daily_value ?? 5000),
        default_mobility_ida: centavosToReais(s.default_mobility_ida ?? Math.ceil(half)),
        default_mobility_volta: centavosToReais(s.default_mobility_volta ?? Math.floor(half)),
        default_weekday_lunch: centavosToReais(s.default_weekday_lunch ?? 3500),
        default_weekday_dinner: centavosToReais(s.default_weekday_dinner ?? 4000),
        default_weekend_lunch: centavosToReais(s.default_weekend_lunch ?? 4000),
        default_weekend_dinner: centavosToReais(s.default_weekend_dinner ?? 4500),
        default_daily_value_weekday_freela: centavosToReais(s.default_daily_value_weekday_freela ?? s.default_daily_value_weekday ?? s.default_daily_value ?? 5000),
        default_daily_value_weekend_freela: centavosToReais(s.default_daily_value_weekend_freela ?? s.default_daily_value_weekend ?? s.default_daily_value ?? 5000),
        default_mobility_ida_freela: centavosToReais(s.default_mobility_ida_freela ?? 0),
        default_mobility_volta_freela: centavosToReais(s.default_mobility_volta_freela ?? 0),
        default_weekday_lunch_freela: centavosToReais(s.default_weekday_lunch_freela ?? s.default_weekday_lunch ?? 3500),
        default_weekday_dinner_freela: centavosToReais(s.default_weekday_dinner_freela ?? s.default_weekday_dinner ?? 4000),
        default_weekend_lunch_freela: centavosToReais(s.default_weekend_lunch_freela ?? s.default_weekend_lunch ?? 4000),
        default_weekend_dinner_freela: centavosToReais(s.default_weekend_dinner_freela ?? s.default_weekend_dinner ?? 4500),
        atendimento_key_account: centavosToReais(s.atendimento_key_account ?? 58000),
        atendimento_executivo_contas: centavosToReais(s.atendimento_executivo_contas ?? 46500),
        freela_diaria_local: centavosToReais(s.freela_diaria_local ?? 46500),
        freela_diaria_viagem: centavosToReais(s.freela_diaria_viagem ?? 54000),
        freela_diaria_dir_prova: centavosToReais(s.freela_diaria_dir_prova ?? 82000),
        casa_diaria_dir_prova: centavosToReais(s.casa_diaria_dir_prova ?? 75000),
        casa_diaria_produtor: centavosToReais(s.casa_diaria_produtor ?? 46500),
        casa_diaria_exec_vendas: centavosToReais(s.casa_diaria_exec_vendas ?? 26000),
        // Percentuais inteiros — usar o valor cru do GET, SEM centavosToReais
        deflacao_fator_ate_4: String(s.deflacao_fator_ate_4 ?? 100),
        deflacao_fator_5_8: String(s.deflacao_fator_5_8 ?? 90),
        deflacao_fator_9_mais: String(s.deflacao_fator_9_mais ?? 80),
        alimentacao_almoco: centavosToReais(s.alimentacao_almoco ?? 4000),
        alimentacao_jantar: centavosToReais(s.alimentacao_jantar ?? 4000),
        alimentacao_almoco_ceno: centavosToReais(s.alimentacao_almoco_ceno ?? 3500),
        alimentacao_jantar_ceno: centavosToReais(s.alimentacao_jantar_ceno ?? 3500),
      });
    }
  }, [settings]);

  const mobilityIda = parseFloat(form.watch("default_mobility_ida") || "0");
  const mobilityVolta = parseFloat(form.watch("default_mobility_volta") || "0");
  const mobilityTotal = isNaN(mobilityIda + mobilityVolta) ? 0 : mobilityIda + mobilityVolta;

  const mobilityIdaFreela = parseFloat(form.watch("default_mobility_ida_freela") || "0");
  const mobilityVoltaFreela = parseFloat(form.watch("default_mobility_volta_freela") || "0");
  const mobilityTotalFreela = isNaN(mobilityIdaFreela + mobilityVoltaFreela) ? 0 : mobilityIdaFreela + mobilityVoltaFreela;

  const dirtyFormFields = Object.keys(form.formState.dirtyFields).length;
  const dirtyFunctionCount = allFunctions.filter(isFunctionDirty).length;
  const totalUnsaved = dirtyFormFields + dirtyFunctionCount;
  const hasAnyChanges = totalUnsaved > 0;
  const isSavingAny = saveFunctionValuesMutation.isPending;

  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);

  const handleApplyDefaults = async () => {
    setIsApplyingDefaults(true);
    try {
      // 1. Salvar valores do formulário se houver alterações
      if (hasAnyChanges) {
        const values = form.getValues();
        const isValid = await form.trigger();
        if (!isValid) {
          toast({ title: "Corrija os valores antes de aplicar", variant: "destructive" });
          setIsApplyingDefaults(false);
          return;
        }
        await saveMutation.mutateAsync(values);
        if (dirtyFunctionCount > 0) {
          await saveFunctionValuesMutation.mutateAsync();
          queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
        }
      }
      // 2. Aplicar padrões a todos os orçamentos pendentes
      const res = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
      const data = await res.json();
      const count = data.updated ?? 0;
      queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      toast({
        title: count > 0 ? `${count} planejamento${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}` : "Valores salvos",
        description: count > 0
          ? "Valores salvos e aplicados aos orçamentos pendentes."
          : hasAnyChanges ? "Valores salvos. Nenhum orçamento pendente encontrado." : "Nenhum orçamento pendente encontrado.",
      });
    } catch {
      toast({ title: "Erro ao salvar ou aplicar valores", variant: "destructive" });
    } finally {
      setIsApplyingDefaults(false);
    }
  };

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
          const newVal = values[key];
          if (PERCENT_KEYS.has(key)) {
            // Percentuais inteiros — o valor salvo já é inteiro cru (sem ×100)
            const oldRaw = String((settings as any)[key] ?? "");
            if (parseFloat(oldRaw || "NaN") !== parseFloat(newVal)) {
              newEntries.push({ timestamp: now, user: userName, field: FIELD_LABELS[key] ?? key, oldValue: `${oldRaw || "—"}%`, newValue: `${newVal}%` });
            }
            continue;
          }
          const oldVal = centavosToReais((settings as any)[key] ?? (settings as any)["default_daily_value"] ?? 0);
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

  function getCurrentValue(fnId: string, field: 'wd' | 'we'): string {
    if (activeTab === 'casa') {
      return field === 'wd' ? (functionDailyValues[fnId] ?? "0.00") : (fnWeekendValues[fnId] ?? "0.00");
    } else {
      return field === 'wd' ? (fnFreelaValues[fnId] ?? "0.00") : (fnFreelaWeekendValues[fnId] ?? "0.00");
    }
  }
  function startEditFunction(fn: FunctionType, field: 'wd' | 'we' = 'wd') {
    setEditingFunctionId(fn.id);
    setEditingField(field);
    setEditingFunctionValue(getCurrentValue(fn.id, field));
  }
  function confirmEditFunction(fnId: string) {
    const val = editingFunctionValue;
    if (activeTab === 'casa') {
      if (editingField === 'wd') setFunctionDailyValues(prev => ({ ...prev, [fnId]: val }));
      else setFnWeekendValues(prev => ({ ...prev, [fnId]: val }));
    } else {
      if (editingField === 'wd') setFnFreelaValues(prev => ({ ...prev, [fnId]: val }));
      else setFnFreelaWeekendValues(prev => ({ ...prev, [fnId]: val }));
    }
    setEditingFunctionId(null);
  }
  function cancelEditFunction() {
    setEditingFunctionId(null);
  }

  if (!isRhOrAdmin(user)) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Acesso restrito</h2>
          <p className="text-gray-500 max-w-xs">Apenas administradores e RH podem acessar os valores padrão do sistema.</p>
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
            onClick={() => { form.reset(); resetFunctionValueStates(); }}
            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontSize: 12 }}
            title="Descartar alterações"
            aria-label="Descartar alterações"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-200">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Valores Padrão</h1>
            <p className="text-xs text-gray-500">Defina os valores base utilizados no cálculo de novos eventos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Casa / Freela toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('casa')}
              style={{
                padding: '7px 18px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all .18s',
                background: activeTab === 'casa' ? '#fff' : 'transparent',
                color: activeTab === 'casa' ? '#1E40AF' : '#94A3B8',
                boxShadow: activeTab === 'casa' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              }}
            >
              🏢 Casa
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('freela')}
              style={{
                padding: '7px 18px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all .18s',
                background: activeTab === 'freela' ? '#fff' : 'transparent',
                color: activeTab === 'freela' ? '#7C3AED' : '#94A3B8',
                boxShadow: activeTab === 'freela' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              }}
            >
              🧑‍💻 Freela
            </button>
          </div>

          {/* Botão: Aplicar valores padrão ao Planejado */}
          <button
            type="button"
            onClick={handleApplyDefaults}
            disabled={isApplyingDefaults}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              border: '1.5px solid #D1D5DB',
              background: '#fff',
              color: isApplyingDefaults ? '#9CA3AF' : '#374151',
              cursor: isApplyingDefaults ? 'not-allowed' : 'pointer',
              transition: 'all .15s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (!isApplyingDefaults) { (e.currentTarget as HTMLElement).style.borderColor = '#3B4FE4'; (e.currentTarget as HTMLElement).style.color = '#3B4FE4'; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#D1D5DB'; (e.currentTarget as HTMLElement).style.color = isApplyingDefaults ? '#9CA3AF' : '#374151'; }}
            title={hasAnyChanges ? "Salva os novos valores e aplica a todos os orçamentos ainda não enviados" : "Aplica os valores padrão atuais a todos os orçamentos planejados ainda não enviados"}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: isApplyingDefaults ? 'spin 1s linear infinite' : 'none' }} />
            {isApplyingDefaults ? 'Salvando...' : hasAnyChanges ? 'Salvar e Aplicar' : 'Atualizar Planejado'}
          </button>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={e => { e.preventDefault(); handleSaveAll(); }} className="space-y-6">

          {/* ── Cards superiores ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5" style={{ alignItems: 'flex-start' }}>

            {/* Diárias */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div style={{ background: activeTab === 'casa' ? 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' : 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)', borderBottom: activeTab === 'casa' ? '1px solid #BFDBFE' : '1px solid #DDD6FE', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: activeTab === 'casa' ? '#3B82F6' : '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <DollarSign style={{ width: 18, height: 18, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: activeTab === 'casa' ? '#1E40AF' : '#5B21B6', margin: 0 }}>Diárias {activeTab === 'casa' ? 'Casa' : 'Freela'}</p>
                  <p style={{ fontSize: 11, color: activeTab === 'casa' ? '#3B82F6' : '#7C3AED', margin: 0 }}>Valor pago por dia trabalhado</p>
                </div>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {activeTab === 'casa' ? (<>
                  <FormField control={form.control} name="default_daily_value_weekday" render={({ field }) => (
                    <FormItem>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Dia Útil</p>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="default_daily_value_weekend" render={({ field }) => (
                    <FormItem>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#F97316', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Fim de Semana</p>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>) : (<>
                  <FormField control={form.control} name="default_daily_value_weekday_freela" render={({ field }) => (
                    <FormItem>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Dia Útil</p>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="default_daily_value_weekend_freela" render={({ field }) => (
                    <FormItem>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#F97316', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Fim de Semana</p>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>)}
              </div>
            </div>

            {/* Mobilidade */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)', borderBottom: '1px solid #FED7AA', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#F97316', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(249,115,22,0.3)', flexShrink: 0 }}>
                  <Car style={{ width: 18, height: 18, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#9A3412', margin: 0 }}>Mobilidade {activeTab === 'casa' ? 'Casa' : 'Freela'}</p>
                  <p style={{ fontSize: 11, color: '#F97316', margin: 0 }}>Ajuda de custo de deslocamento</p>
                </div>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {activeTab === 'casa' ? (
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
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="default_mobility_ida_freela" render={({ field }) => (
                      <FormItem>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Ida</p>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="default_mobility_volta_freela" render={({ field }) => (
                      <FormItem>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Volta</p>
                        <FormControl><CurrencyInput field={field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                )}
                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>Total mobilidade</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#F97316' }}>
                    {`R$ ${(activeTab === 'casa' ? mobilityTotal : mobilityTotalFreela).toFixed(2).replace('.', ',')}`}
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
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#065F46', margin: 0 }}>Alimentação {activeTab === 'casa' ? 'Casa' : 'Freela'}</p>
                  <p style={{ fontSize: 11, color: '#10B981', margin: 0 }}>Almoço e jantar por dia</p>
                </div>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Dias Úteis</p>
                  <div className="grid grid-cols-2 gap-3">
                    {activeTab === 'casa' ? (<>
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
                    </>) : (<>
                      <FormField control={form.control} name="default_weekday_lunch_freela" render={({ field }) => (
                        <FormItem>
                          <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Almoço</p>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="default_weekday_dinner_freela" render={({ field }) => (
                        <FormItem>
                          <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Jantar</p>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </>)}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#F97316', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Fim de Semana</p>
                  <div className="grid grid-cols-2 gap-3">
                    {activeTab === 'casa' ? (<>
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
                    </>) : (<>
                      <FormField control={form.control} name="default_weekend_lunch_freela" render={({ field }) => (
                        <FormItem>
                          <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Almoço</p>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="default_weekend_dinner_freela" render={({ field }) => (
                        <FormItem>
                          <p style={{ fontSize: 10, fontWeight: 600, color: '#aaa', marginBottom: 4 }}>Jantar</p>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </>)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Atendimento (valores fixos, não dependem de Casa/Freela) ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', borderBottom: '1px solid #C7D2FE', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(99,102,241,0.3)', flexShrink: 0 }}>
                <Building2 style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#3730A3', margin: 0 }}>Atendimento</p>
                <p style={{ fontSize: 11, color: '#6366F1', margin: 0 }}>Tarifas fixas de atendimento</p>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="atendimento_key_account" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Key Account</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="atendimento_executivo_contas" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Executivo de Contas</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          </div>

          {/* ── Diárias Freela (regra por viagem) — chaves MONETÁRIAS ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)', borderBottom: '1px solid #DDD6FE', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(124,58,237,0.3)', flexShrink: 0 }}>
                <DollarSign style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#5B21B6', margin: 0 }}>Diárias Freela (regra por viagem)</p>
                <p style={{ fontSize: 11, color: '#7C3AED', margin: 0 }}>Três tarifas conforme a função e se há viagem</p>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="freela_diaria_local" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Local (sem viagem)</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="freela_diaria_viagem" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Em viagem</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="freela_diaria_dir_prova" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Dir de Prova</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 12, marginBottom: 0 }}>
                Tarifas do time freela definidas pela regra do slide — a diária é escolhida automaticamente conforme a função e se a escalação tem passagem. Os valores freela antigos por função deixaram de ser usados no cálculo.
              </p>
            </div>
          </div>

          {/* ── Diárias Casa (regra por grupo de função) — chaves MONETÁRIAS ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', borderBottom: '1px solid #BFDBFE', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(37,99,235,0.3)', flexShrink: 0 }}>
                <DollarSign style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#1E40AF', margin: 0 }}>Diárias Casa (regra por grupo de função)</p>
                <p style={{ fontSize: 11, color: '#2563EB', margin: 0 }}>Três tarifas conforme o grupo de função</p>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="casa_diaria_dir_prova" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Dir. de Prova</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="casa_diaria_produtor" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Produtor (produção/ativação/kit/sup ceno)</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="casa_diaria_exec_vendas" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Exec. Vendas O2 Prime</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 12, marginBottom: 0 }}>
                Tarifas do time da casa por grupo de função (slide). Atendimento tem tarifa própria (Key Account/Exec. de Contas); cenotécnica, percurso e montagem seguem seus regimes específicos.
              </p>
            </div>
          </div>

          {/* ── Regra de deflação (diárias) ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div style={{ background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)', borderBottom: '1px solid #FECACA', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(239,68,68,0.3)', flexShrink: 0 }}>
                <ChevronDown style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#991B1B', margin: 0 }}>Regra de deflação (diárias)</p>
                <p style={{ fontSize: 11, color: '#EF4444', margin: 0 }}>Fatores aplicados à diária conforme o período trabalhado</p>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="deflacao_fator_ate_4" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Até 4 dias (%)</p>
                    <FormControl><PercentInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="deflacao_fator_5_8" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Do 5º ao 8º dia (%)</p>
                    <FormControl><PercentInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="deflacao_fator_9_mais" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>A partir do 9º dia (%)</p>
                    <FormControl><PercentInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 12, marginBottom: 0 }}>
                Percentual da diária pago em cada faixa de dias. Ex.: 100% nos primeiros dias, reduzindo conforme a permanência.
              </p>
            </div>
          </div>

          {/* ── Alimentação por refeição (regra por voo) — chaves MONETÁRIAS ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', borderBottom: '1px solid #A7F3D0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(5,150,105,0.3)', flexShrink: 0 }}>
                <Utensils style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#065F46', margin: 0 }}>Alimentação por refeição (regra por voo)</p>
                <p style={{ fontSize: 11, color: '#059669', margin: 0 }}>Valores flat por refeição, sem distinção útil/fim de semana</p>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="alimentacao_almoco" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Almoço — Demais</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="alimentacao_jantar" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Jantar — Demais</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="alimentacao_almoco_ceno" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Almoço — Cenotécnica</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="alimentacao_jantar_ceno" render={({ field }) => (
                  <FormItem>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Jantar — Cenotécnica</p>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 12, marginBottom: 0 }}>
                Valores por refeição usados no cálculo automático de alimentação (regra por horário de voo). Os campos antigos de alimentação útil/fds continuam valendo apenas para overrides manuais.
              </p>
            </div>
          </div>

          {/* ── Tabela: Diária por Função ── */}
          {(() => {
            const isCasaType = (types: string[]) => types.some(t => t === 'casa' || t === 'local');
            const isFreelaType = (types: string[]) => types.some(t => t === 'freela');

            const coordinator = allFunctions.find(fn => fn.responsibleArea === '__system__');
            const regularFns = allFunctions
              .filter(fn => fn.responsibleArea !== '__system__')
              .filter(fn => {
                const types = fnCollaboratorTypes[fn.id] ?? [];
                if (types.length === 0) return true; // sem dados ainda → mostrar em ambas as abas
                return activeTab === 'casa' ? isCasaType(types) : isFreelaType(types);
              })
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Função</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-right" style={{color:'#2563EB'}}>Dia Útil</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-right" style={{color:'#F97316'}}>Fim de Semana</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {visibleFns.map((fn) => {
                        const isCoord = fn.responsibleArea === '__system__';
                        const fv = allFunctionValues.find(v => v.functionId === fn.id) as any;
                        const wdVal = getCurrentValue(fn.id, 'wd');
                        const weVal = getCurrentValue(fn.id, 'we');
                        const freeWdRow = fv?.dailyValueFreela ?? 0;
                        const freeWeRow = fv?.dailyValueFreelaWeekend ?? 0;
                        const savedWd = activeTab === 'casa'
                          ? (fv ? centavosToReais(fv.dailyValue) : "0.00")
                          : (fv ? centavosToReais(freeWdRow !== 0 ? freeWdRow : (fv.dailyValue ?? 0)) : "0.00");
                        const savedWe = activeTab === 'casa'
                          ? (fv ? centavosToReais(fv.dailyValueWeekend ?? 0) : "0.00")
                          : (fv ? centavosToReais(freeWeRow !== 0 ? freeWeRow : (fv.dailyValueWeekend ?? 0)) : "0.00");
                        const isDirtyWd = parseFloat(wdVal) !== parseFloat(savedWd);
                        const isDirtyWe = parseFloat(weVal) !== parseFloat(savedWe);
                        const isDirty = isDirtyWd || isDirtyWe;
                        const isEditingWd = editingFunctionId === fn.id && editingField === 'wd';
                        const isEditingWe = editingFunctionId === fn.id && editingField === 'we';
                        const hasWd = fv && (activeTab === 'casa' ? fv.dailyValue > 0 : (freeWdRow !== 0 ? freeWdRow : (fv.dailyValue ?? 0)) > 0);
                        const hasWe = fv && (activeTab === 'casa' ? (fv.dailyValueWeekend ?? 0) > 0 : (freeWeRow !== 0 ? freeWeRow : (fv.dailyValueWeekend ?? 0)) > 0);

                        const renderCell = (field: 'wd' | 'we', isEditing: boolean, currentVal: string, hasCustom: boolean, fallbackVal?: string) => {
                          const isZero = parseFloat(currentVal) === 0;
                          const hasFallback = isZero && fallbackVal && parseFloat(fallbackVal) > 0;
                          return (
                            <div className="flex items-center justify-end gap-1.5 group/cell" onClick={e => { e.stopPropagation(); if (!isEditing) startEditFunction(fn, field); }}>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center gap-0.5 border border-slate-300 rounded px-1.5 py-0.5 bg-white shadow-sm">
                                    <span className="text-[10px] text-slate-400 font-medium select-none">R$</span>
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
                                      onBlur={() => confirmEditFunction(fn.id)}
                                      className="w-16 text-sm font-mono text-right bg-transparent border-none outline-none focus:outline-none tabular-nums text-slate-700 font-semibold"
                                    />
                                  </div>
                                  <button type="button" onClick={cancelEditFunction} className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center justify-center text-slate-400 hover:text-slate-600">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 cursor-pointer">
                                  {isZero ? (
                                    hasFallback ? (
                                      <TooltipProvider delayDuration={200}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="text-sm tabular-nums font-medium" style={{color:'#F97316'}}>
                                              R$ {parseFloat(fallbackVal!).toFixed(2).replace('.', ',')}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs">
                                            Usa o valor do Dia Útil (sem FDS específico)
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : (
                                      <span className="text-sm text-slate-300 italic">—</span>
                                    )
                                  ) : (
                                    <span className={`text-sm font-semibold tabular-nums ${hasCustom ? '' : 'text-slate-400'}`} style={hasCustom ? { color: field === 'we' ? '#F97316' : (activeTab === 'casa' ? '#3B4FE4' : '#7C3AED') } : {}}>
                                      {`R$ ${parseFloat(currentVal).toFixed(2).replace('.', ',')}`}
                                    </span>
                                  )}
                                  <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </div>
                          );
                        };

                        return (
                          <div
                            key={fn.id}
                            style={{ minHeight: 44, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', padding: '6px 20px', gap: 8 }}
                            className={`transition-colors group
                              ${isCoord ? 'bg-blue-50/40' : 'bg-white hover:bg-slate-50/70'}
                              ${isDirty ? 'ring-1 ring-inset ring-amber-200' : ''}
                            `}
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
                              <span
                                className={`text-sm font-medium truncate ${isCoord ? 'text-blue-700' : isDirty ? 'font-semibold' : ''}`}
                                style={isCoord ? {} : isDirty
                                  ? { color: '#B45309' }
                                  : { color: activeTab === 'freela' ? '#D97706' : '#374151' }
                                }
                              >
                                {toTitleCase(fn.name)}
                              </span>
                            </div>

                            {/* Dia Útil */}
                            {renderCell('wd', isEditingWd, wdVal, !!hasWd)}
                            {/* Fim de Semana — passa wdVal como fallback quando FDS não está configurado */}
                            {renderCell('we', isEditingWe, weVal, !!hasWe, wdVal)}
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
