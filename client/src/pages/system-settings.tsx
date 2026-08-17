import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { Control, ControllerRenderProps, FieldPath } from "react-hook-form";
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
  Search, Building2, Users, Plus, Trash2, Pencil, X, RefreshCw
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { isAdmin, isRhOrAdmin } from "@/lib/permissions";
import type { Function as FunctionType, FunctionValue, PaymentCompany } from "@shared/schema";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";

// Validação numérica no client: o input normaliza vírgula→ponto, então aqui
// basta aceitar dígitos com decimal opcional. Sem isso, "12abc" ou "" viravam
// NaN no PUT e o erro só aparecia (genérico) depois da ida ao servidor.
const isNumericString = (v: string) => /^\d+(\.\d+)?$/.test(v.trim());

// Campo monetário (reais<->centavos): número >= 0.
const moneyField = () =>
  z.string()
    .min(1, "Obrigatório")
    .refine(isNumericString, "Informe um valor numérico válido (ex.: 40,00)");

// Campo percentual inteiro: número entre 0 e 100, com mensagem própria.
const percentField = () =>
  z.string()
    .min(1, "Obrigatório")
    .refine(isNumericString, "Informe um percentual numérico válido (ex.: 90)")
    .refine(v => {
      const n = parseFloat(v);
      return n >= 0 && n <= 100;
    }, "O percentual deve estar entre 0 e 100");

const formSchema = z.object({
  // Casa
  default_daily_value_weekday: moneyField(),
  default_daily_value_weekend: moneyField(),
  default_mobility_ida: moneyField(),
  default_mobility_volta: moneyField(),
  default_weekday_lunch: moneyField(),
  default_weekday_dinner: moneyField(),
  default_weekend_lunch: moneyField(),
  default_weekend_dinner: moneyField(),
  // Freela
  default_daily_value_weekday_freela: moneyField(),
  default_daily_value_weekend_freela: moneyField(),
  default_mobility_ida_freela: moneyField(),
  default_mobility_volta_freela: moneyField(),
  default_weekday_lunch_freela: moneyField(),
  default_weekday_dinner_freela: moneyField(),
  default_weekend_lunch_freela: moneyField(),
  default_weekend_dinner_freela: moneyField(),
  // Atendimento
  atendimento_key_account: moneyField(),
  atendimento_executivo_contas: moneyField(),
  // Diárias Freela (regra por viagem) — monetárias normais (reais<->centavos)
  freela_diaria_local: moneyField(),
  freela_diaria_viagem: moneyField(),
  freela_diaria_dir_prova: moneyField(),
  // Diárias Casa (regra por grupo de função) — monetárias normais (reais<->centavos)
  casa_diaria_dir_prova: moneyField(),
  casa_diaria_produtor: moneyField(),
  casa_diaria_exec_vendas: moneyField(),
  // Regra de deflação (diárias) — percentuais inteiros 0..100, NÃO monetários
  deflacao_fator_ate_4: percentField(),
  deflacao_fator_5_8: percentField(),
  deflacao_fator_9_mais: percentField(),
  // Alimentação por refeição (regra por voo) — monetárias normais (reais<->centavos)
  alimentacao_almoco: moneyField(),
  alimentacao_jantar: moneyField(),
  alimentacao_almoco_ceno: moneyField(),
  alimentacao_jantar_ceno: moneyField(),
});

// Chaves percentuais inteiras (0..100). NÃO passam por conversão reais<->centavos.
const PERCENT_KEYS = new Set<string>([
  "deflacao_fator_ate_4",
  "deflacao_fator_5_8",
  "deflacao_fator_9_mais",
]);

// Campos que vivem dentro da zona legada (Collapsible fechado por padrão).
// Quando a validação falha num deles, a seção precisa ser aberta e o campo
// levado à vista — senão o erro fica invisível e o Salvar parece quebrado.
const LEGACY_ZONE_FIELDS = new Set<string>([
  "default_daily_value_weekday",
  "default_daily_value_weekend",
  "default_daily_value_weekday_freela",
  "default_daily_value_weekend_freela",
  "default_weekday_lunch",
  "default_weekday_dinner",
  "default_weekend_lunch",
  "default_weekend_dinner",
  "default_weekday_lunch_freela",
  "default_weekday_dinner_freela",
  "default_weekend_lunch_freela",
  "default_weekend_dinner_freela",
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

// Histórico gravado APENAS no localStorage deste navegador — em ambiente
// multiusuário cada pessoa vê só o que ela mesma salvou nesta máquina.
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

// Fallback único "freela zerado → usa o valor casa correspondente".
// Antes esta regra estava duplicada em 3 pontos (reset dos mapas, isFunctionDirty
// e a renderização da tabela por função) e as cópias podiam divergir.
function freelaOuCasa(freelaCentavos: number | null | undefined, casaCentavos: number | null | undefined): number {
  const f = freelaCentavos ?? 0;
  return f !== 0 ? f : (casaCentavos ?? 0);
}

// Normaliza dígito decimal pt-BR: aceita vírgula no teclado, mas o valor
// guardado no form continua com ponto (formato salvo/PUT idêntico ao anterior).
function normalizeDecimal(raw: string): string {
  return raw.replace(",", ".");
}

type AnyFieldProps = ControllerRenderProps<FormValues, FieldPath<FormValues>>;

function CurrencyInput({ field, id }: { field: AnyFieldProps; id?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none text-[13px] font-semibold text-gray-400">R$</span>
      <input
        type="text"
        inputMode="decimal"
        id={id}
        name={field.name}
        ref={field.ref}
        value={field.value}
        onBlur={field.onBlur}
        onChange={e => field.onChange(normalizeDecimal(e.target.value))}
        className="h-[38px] w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-2.5 text-sm font-semibold text-gray-800 outline-none transition-colors focus:border-indigo-500 focus:bg-white"
      />
    </div>
  );
}

// Input de percentual inteiro (0..100) com sufixo "%". NÃO é monetário.
function PercentInput({ field, id }: { field: AnyFieldProps; id?: string }) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        id={id}
        name={field.name}
        ref={field.ref}
        value={field.value}
        onBlur={field.onBlur}
        onChange={e => field.onChange(normalizeDecimal(e.target.value))}
        className="h-[38px] w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 pl-3 pr-8 text-sm font-semibold text-gray-800 outline-none transition-colors focus:border-indigo-500 focus:bg-white"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-[13px] font-semibold text-gray-400">%</span>
    </div>
  );
}

// Campo monetário com <label htmlFor> apontando para o input (a11y).
function MoneyField({
  control, name, label, labelClass = "text-gray-500",
}: {
  control: Control<FormValues>;
  name: FieldPath<FormValues>;
  label: string;
  labelClass?: string;
}) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <label htmlFor={name} className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${labelClass}`}>{label}</label>
        <FormControl><CurrencyInput field={field} id={name} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

function PercentField({
  control, name, label, labelClass = "text-gray-500",
}: {
  control: Control<FormValues>;
  name: FieldPath<FormValues>;
  label: string;
  labelClass?: string;
}) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <label htmlFor={name} className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${labelClass}`}>{label}</label>
        <FormControl><PercentInput field={field} id={name} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

// Cabeçalho padrão dos cards (sem gradiente, seguindo o padrão do app).
function SectionHeader({ icon: Icon, iconBg, title, subtitle }: { icon: LucideIcon; iconBg: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50/60 px-4 py-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className="h-[18px] w-[18px] text-white" />
      </div>
      <div>
        <p className="text-[13px] font-bold text-gray-800">{title}</p>
        <p className="text-[11px] text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  // Zona legada controlada: aberta programaticamente quando um erro de
  // validação está num campo escondido dentro dela (ver handleSaveAll).
  const [legacyOpen, setLegacyOpen] = useState(false);
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
  const [companyToDelete, setCompanyToDelete] = useState<PaymentCompany | null>(null);
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
    onError: (e: any) => toast({
      title: "Erro ao remover empresa.",
      description: e?.body?.message,
      variant: "destructive",
    }),
  });

  // Reconstrói os 4 mapas de valores por função a partir do que está salvo.
  // Usado no carregamento e também pelo "Descartar" da barra flutuante.
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
      mapFreelaWd[fn.id] = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreela, fv.dailyValue)) : "0.00";
      mapFreelaWe[fn.id] = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend)) : "0.00";
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
    const savedFreelaWd = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreela, fv.dailyValue)) : "0.00";
    const savedFreelaWe = fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend)) : "0.00";
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
    // Sem onError aqui: o único toast de falha do fluxo é o do catch de
    // handleSaveAll (que exibe a mensagem do servidor) — antes eram dois.
  });

  // ÚNICO fluxo de salvamento da página (barra flutuante): valida, salva as
  // tarifas + valores por função e aplica os padrões aos planejamentos
  // pendentes, com um único toast ao final.
  // Monta as entradas de histórico local para as Diárias por Função alteradas.
  // Precisa rodar ANTES do PATCH/POST, enquanto allFunctionValues ainda tem os
  // valores antigos (a invalidation do save recarrega a query).
  const buildFunctionHistoryEntries = (): HistoryEntry[] => {
    const now = new Date().toISOString();
    const userName = (user as any)?.name || (user as any)?.username || "Admin";
    const entries: HistoryEntry[] = [];
    for (const fn of allFunctions.filter(isFunctionDirty)) {
      const fv = allFunctionValues.find(v => v.functionId === fn.id) as any;
      const cells: { label: string; saved: string; current: string }[] = [
        { label: "Casa · Dia Útil", saved: fv ? centavosToReais(fv.dailyValue) : "0.00", current: functionDailyValues[fn.id] ?? "0" },
        { label: "Casa · Fim de Semana", saved: fv ? centavosToReais(fv.dailyValueWeekend ?? 0) : "0.00", current: fnWeekendValues[fn.id] ?? "0" },
        { label: "Freela · Dia Útil", saved: fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreela, fv.dailyValue)) : "0.00", current: fnFreelaValues[fn.id] ?? "0" },
        { label: "Freela · Fim de Semana", saved: fv ? centavosToReais(freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend)) : "0.00", current: fnFreelaWeekendValues[fn.id] ?? "0" },
      ];
      for (const c of cells) {
        if (parseFloat(c.current) !== parseFloat(c.saved)) {
          entries.push({
            timestamp: now,
            user: userName,
            field: `Diária por Função — ${toTitleCase(fn.name)} (${c.label})`,
            oldValue: formatCurrency(c.saved),
            newValue: formatCurrency(c.current),
          });
        }
      }
    }
    return entries;
  };

  const handleSaveAll = form.handleSubmit(
    async (values) => {
      try {
        await saveMutation.mutateAsync(values);
        if (dirtyFunctionCount > 0) {
          // Histórico local também cobre as Diárias por Função salvas neste fluxo
          const fnEntries = buildFunctionHistoryEntries();
          await saveFunctionValuesMutation.mutateAsync();
          queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
          if (fnEntries.length > 0) {
            setHistory(prev => {
              const updated = [...fnEntries, ...prev].slice(0, 40);
              localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
              return updated;
            });
          }
        }
        // Apply new defaults to all pending (not-yet-sent) budget_planned records
        let updatedCount = 0;
        let applyFailed = false;
        try {
          const applyRes = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
          const applyData = await applyRes.json();
          updatedCount = applyData.updated ?? 0;
          if (updatedCount > 0) {
            queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
          }
        } catch {
          // Falha não pode ser engolida: os valores foram salvos, mas o
          // Planejado pendente ficou desatualizado — avisar com o caminho manual.
          applyFailed = true;
        }
        if (applyFailed) {
          toast({
            title: "Valores salvos, mas não foi possível atualizar os planejamentos pendentes",
            description: "Use o botão \"Atualizar Planejado\" para aplicá-los aos orçamentos pendentes.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Valores padrão salvos",
            description: updatedCount > 0
              ? `${updatedCount} planejamento${updatedCount > 1 ? 's' : ''} pendente${updatedCount > 1 ? 's' : ''} atualizado${updatedCount > 1 ? 's' : ''} com os novos valores.`
              : "Os novos valores serão aplicados em orçamentos de novos eventos.",
          });
        }
      } catch (e: any) {
        // Mensagem do servidor (e.body.message) em vez do genérico
        toast({
          title: "Erro ao salvar",
          description: e?.body?.message || "Não foi possível salvar as alterações. Tente novamente.",
          variant: "destructive",
        });
      }
    },
    (errors) => {
      toast({ title: "Corrija os valores destacados antes de salvar", variant: "destructive" });
      // Se o primeiro campo inválido estiver na zona legada (colapsada), abre a
      // seção e leva o foco até ele — senão o erro fica invisível.
      const firstErrorField = Object.keys(errors)[0];
      if (firstErrorField && LEGACY_ZONE_FIELDS.has(firstErrorField)) {
        setLegacyOpen(true);
        // Os campos legados só montam na aba correspondente (Casa/Freela)
        setActiveTab(firstErrorField.endsWith("_freela") ? "freela" : "casa");
        // Espera o CollapsibleContent montar antes de rolar/focar
        setTimeout(() => {
          const el = document.getElementById(firstErrorField);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            (el as HTMLElement).focus({ preventScroll: true });
          }
        }, 150);
      }
    },
  );

  // Ação secundária (não salva nada): reaplica os valores padrão JÁ SALVOS a
  // todos os orçamentos planejados ainda não enviados.
  const [isApplyingPending, setIsApplyingPending] = useState(false);
  const handleApplyToPending = async () => {
    setIsApplyingPending(true);
    try {
      const res = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
      const data = await res.json();
      const count = data.updated ?? 0;
      if (count > 0) queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      toast({
        title: count > 0
          ? `${count} planejamento${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}`
          : "Nenhum orçamento pendente encontrado",
        description: count > 0 ? "Valores padrão aplicados aos orçamentos pendentes." : undefined,
      });
    } catch {
      toast({ title: "Erro ao atualizar o Planejado", variant: "destructive" });
    } finally {
      setIsApplyingPending(false);
    }
  };

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
    <div className="min-h-screen bg-[#F8FAFC]">
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      {/* ── Barra flutuante: ÚNICO ponto de salvamento da página ── */}
      {hasAnyChanges && (
        <div className="fixed bottom-6 left-1/2 z-50 flex min-w-[340px] -translate-x-1/2 items-center gap-4 rounded-2xl bg-slate-800 py-2.5 pl-5 pr-4 shadow-2xl">
          <span className="flex-1 text-[13px] text-slate-300">
            <span className="font-bold text-slate-50">{totalUnsaved}</span>{' '}
            alteraç{totalUnsaved === 1 ? 'ão' : 'ões'} não salva{totalUnsaved === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => handleSaveAll()}
            disabled={isSavingAny || saveMutation.isPending}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-bold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            <Save className="h-3.5 w-3.5" />
            {(isSavingAny || saveMutation.isPending) ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => { form.reset(); resetFunctionValueStates(); }}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-200"
            title="Descartar alterações"
            aria-label="Descartar alterações"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Cabeçalho (padrão pastel das páginas irmãs — flash/regras) ── */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <Calculator className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Valores Padrão</h1>
          <p className="text-xs text-gray-400">Defina os valores base utilizados no cálculo de novos eventos</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={e => { e.preventDefault(); handleSaveAll(); }} className="space-y-6">

          {/* ════════════════════════════════════════════════════════════════
              ZONA 1 — VALORES APLICADOS NO CÁLCULO (regras vigentes)
             ════════════════════════════════════════════════════════════════ */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">Valores aplicados no cálculo</h2>
              <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Aplicado no cálculo
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Estas são as regras e tarifas efetivamente usadas ao calcular o orçamento dos eventos.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">

            {/* Diárias Casa (regra por grupo de função) */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <SectionHeader icon={DollarSign} iconBg="bg-blue-600" title="Diárias Casa (regra por grupo)" subtitle="Três tarifas conforme o grupo de função" />
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MoneyField control={form.control} name="casa_diaria_dir_prova" label="Dir. de Prova" labelClass="text-blue-700" />
                  <MoneyField control={form.control} name="casa_diaria_produtor" label="Produtor (produção/ativação/kit/sup ceno)" labelClass="text-blue-700" />
                  <MoneyField control={form.control} name="casa_diaria_exec_vendas" label="Exec. Vendas O2 Prime" labelClass="text-blue-700" />
                </div>
                <p className="mb-0 mt-3 text-[11px] text-gray-400">
                  Tarifas do time da casa por grupo de função (slide). Atendimento tem tarifa própria (Key Account/Exec. de Contas); cenotécnica, percurso e montagem seguem seus regimes específicos.
                </p>
              </div>
            </div>

            {/* Diárias Freela (regra por viagem) */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <SectionHeader icon={DollarSign} iconBg="bg-violet-600" title="Diárias Freela (regra por viagem)" subtitle="Três tarifas conforme a função e se há viagem" />
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MoneyField control={form.control} name="freela_diaria_local" label="Local (sem viagem)" labelClass="text-violet-700" />
                  <MoneyField control={form.control} name="freela_diaria_viagem" label="Em viagem" labelClass="text-violet-700" />
                  <MoneyField control={form.control} name="freela_diaria_dir_prova" label="Dir de Prova" labelClass="text-violet-700" />
                </div>
                <p className="mb-0 mt-3 text-[11px] text-gray-400">
                  A diária é escolhida automaticamente conforme a função e se a escalação tem passagem. Os valores freela antigos por função deixaram de ser usados no cálculo.
                </p>
              </div>
            </div>

            {/* Atendimento (valores fixos, não dependem de Casa/Freela) */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <SectionHeader icon={Building2} iconBg="bg-indigo-600" title="Atendimento" subtitle="Tarifas fixas de atendimento" />
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MoneyField control={form.control} name="atendimento_key_account" label="Key Account" labelClass="text-indigo-700" />
                  <MoneyField control={form.control} name="atendimento_executivo_contas" label="Executivo de Contas" labelClass="text-indigo-700" />
                </div>
              </div>
            </div>

            {/* Regra de deflação (diárias) */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <SectionHeader icon={ChevronDown} iconBg="bg-red-500" title="Regra de deflação (diárias)" subtitle="Fatores aplicados à diária conforme o período trabalhado" />
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <PercentField control={form.control} name="deflacao_fator_ate_4" label="Até 4 dias (%)" labelClass="text-red-700" />
                  <PercentField control={form.control} name="deflacao_fator_5_8" label="Do 5º ao 8º dia (%)" labelClass="text-red-700" />
                  <PercentField control={form.control} name="deflacao_fator_9_mais" label="A partir do 9º dia (%)" labelClass="text-red-700" />
                </div>
                <p className="mb-0 mt-3 text-[11px] text-gray-400">
                  Percentual da diária pago em cada faixa de dias. Ex.: 100% nos primeiros dias, reduzindo conforme a permanência.
                </p>
              </div>
            </div>

            {/* Alimentação por refeição (regra por voo) */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <SectionHeader icon={Utensils} iconBg="bg-emerald-600" title="Alimentação por refeição (regra por voo)" subtitle="Valores flat por refeição, sem distinção útil/fim de semana" />
              <div className="p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MoneyField control={form.control} name="alimentacao_almoco" label="Almoço — Demais" labelClass="text-emerald-700" />
                  <MoneyField control={form.control} name="alimentacao_jantar" label="Jantar — Demais" labelClass="text-emerald-700" />
                  <MoneyField control={form.control} name="alimentacao_almoco_ceno" label="Almoço — Cenotécnica" labelClass="text-emerald-700" />
                  <MoneyField control={form.control} name="alimentacao_jantar_ceno" label="Jantar — Cenotécnica" labelClass="text-emerald-700" />
                </div>
                <p className="mb-0 mt-3 text-[11px] text-gray-400">
                  Valores por refeição usados no cálculo automático de alimentação (regra por horário de voo). Os campos antigos de alimentação útil/fds continuam valendo apenas para overrides manuais.
                </p>
              </div>
            </div>

            {/* Mobilidade (Casa e Freela, sem depender do toggle) */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <SectionHeader icon={Car} iconBg="bg-orange-500" title="Mobilidade" subtitle="Ajuda de custo de deslocamento (ida e volta)" />
              <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    <Building2 className="h-3 w-3" /> Casa
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyField control={form.control} name="default_mobility_ida" label="Ida" />
                    <MoneyField control={form.control} name="default_mobility_volta" label="Volta" />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                    <span className="text-[11px] text-gray-400">Total mobilidade</span>
                    <span className="text-sm font-bold text-orange-500">{`R$ ${mobilityTotal.toFixed(2).replace('.', ',')}`}</span>
                  </div>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700">
                    <Users className="h-3 w-3" /> Freela
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyField control={form.control} name="default_mobility_ida_freela" label="Ida" />
                    <MoneyField control={form.control} name="default_mobility_volta_freela" label="Volta" />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                    <span className="text-[11px] text-gray-400">Total mobilidade</span>
                    <span className="text-sm font-bold text-orange-500">{`R$ ${mobilityTotalFreela.toFixed(2).replace('.', ',')}`}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Empresas Pagadoras (aplicadas nas Notas Fiscais) */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2.5 border-b border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-gray-700">Empresas Pagadoras</span>
                <span className="text-xs text-gray-400 font-normal">(usadas nas Notas Fiscais)</span>
              </div>
              {!showAddCompany && (
                <button
                  type="button"
                  onClick={() => setShowAddCompany(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar empresa
                </button>
              )}
            </div>
            <div className="space-y-4 bg-white p-5">
              {paymentCompanies.length === 0 && !showAddCompany ? (
                <p className="py-3 text-center text-sm text-gray-400">Nenhuma empresa cadastrada.</p>
              ) : paymentCompanies.length > 0 ? (
                <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                  {paymentCompanies.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white px-4 py-3 transition-colors hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                        <p className="font-mono text-xs text-gray-400">{c.cnpj}</p>
                      </div>
                      {/* O DELETE do servidor exige admin — para os demais papéis
                          o botão nem aparece (antes: clique → 403 silencioso) */}
                      {isAdmin(user) && (
                        <button
                          type="button"
                          onClick={() => setCompanyToDelete(c)}
                          disabled={deleteCompanyMutation.isPending}
                          className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Remover empresa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Formulário expansível */}
              {showAddCompany ? (
                <div className="space-y-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-emerald-700">Nova empresa</p>
                    <button type="button" onClick={() => { setShowAddCompany(false); setNewCompanyName(""); setNewCompanyCnpj(""); }} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Enter aqui não deve submeter o formulário de tarifas da página */}
                  <div className="grid grid-cols-2 gap-3" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
                    <div>
                      <label htmlFor="new-company-name" className="mb-1 block text-xs font-medium text-slate-600">Nome da empresa</label>
                      <Input
                        id="new-company-name"
                        value={newCompanyName}
                        onChange={e => setNewCompanyName(e.target.value)}
                        placeholder="Ex.: Produtora Norte Ltda"
                        className="h-9 rounded-lg border-gray-200 text-sm"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label htmlFor="new-company-cnpj" className="mb-1 block text-xs font-medium text-slate-600">CNPJ</label>
                      <CnpjInput id="new-company-cnpj" value={newCompanyCnpj} onChange={setNewCompanyCnpj} name="newCompanyCnpj" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newCompanyName.trim() || !validateCnpj(newCompanyCnpj) || createCompanyMutation.isPending}
                      onClick={() => createCompanyMutation.mutate({ name: newCompanyName.trim(), cnpj: newCompanyCnpj })}
                      className="h-8 bg-emerald-600 px-4 text-xs text-white hover:bg-emerald-700"
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

          {/* ════════════════════════════════════════════════════════════════
              ZONA 2 — VALORES LEGADOS E OVERRIDES (colapsada por padrão)
             ════════════════════════════════════════════════════════════════ */}
          <Collapsible open={legacyOpen} onOpenChange={setLegacyOpen} className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/60">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-100/70"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-bold text-gray-700">Valores legados e overrides</span>
                  <span className="rounded-full border border-gray-300 bg-gray-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                    Legado — usado só como fallback/override
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-5 border-t border-gray-200 p-5">
                <p className="text-xs text-gray-500">
                  Os valores desta seção <span className="font-semibold">não entram no cálculo automático</span> — servem apenas de fallback quando um orçamento tem valor preenchido manualmente (override) ou quando a função não é coberta pelas regras acima.
                </p>

                {/* Toggle Casa/Freela — afeta APENAS os valores legados abaixo */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('casa')}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all ${activeTab === 'casa' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
                    >
                      <Building2 className="h-3.5 w-3.5" /> Casa
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('freela')}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all ${activeTab === 'freela' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
                    >
                      <Users className="h-3.5 w-3.5" /> Freela
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Afeta apenas os valores legados abaixo — as regras aplicadas no cálculo não mudam.
                  </span>
                </div>

                <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">

                  {/* Diárias legadas útil/fds */}
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <SectionHeader
                      icon={DollarSign}
                      iconBg={activeTab === 'casa' ? 'bg-blue-500' : 'bg-violet-500'}
                      title={`Diárias ${activeTab === 'casa' ? 'Casa' : 'Freela'} (legado útil/fds)`}
                      subtitle="Valor por dia trabalhado — modelo antigo"
                    />
                    <div className="flex flex-col gap-3.5 p-4">
                      {activeTab === 'casa' ? (<>
                        <MoneyField control={form.control} name="default_daily_value_weekday" label="Dia Útil" labelClass="text-blue-600" />
                        <MoneyField control={form.control} name="default_daily_value_weekend" label="Fim de Semana" labelClass="text-orange-500" />
                      </>) : (<>
                        <MoneyField control={form.control} name="default_daily_value_weekday_freela" label="Dia Útil" labelClass="text-blue-600" />
                        <MoneyField control={form.control} name="default_daily_value_weekend_freela" label="Fim de Semana" labelClass="text-orange-500" />
                      </>)}
                      <p className="mb-0 text-[11px] text-gray-400">
                        Onde ainda é usado: apenas como fallback/override manual de diária em orçamentos — o cálculo automático usa as regras de "Diárias Casa/Freela" da seção aplicada.
                      </p>
                    </div>
                  </div>

                  {/* Alimentação legada útil/fds */}
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <SectionHeader
                      icon={Utensils}
                      iconBg="bg-emerald-500"
                      title={`Alimentação ${activeTab === 'casa' ? 'Casa' : 'Freela'} (legado útil/fds)`}
                      subtitle="Almoço e jantar por dia — modelo antigo"
                    />
                    <div className="flex flex-col gap-3.5 p-4">
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-blue-600">Dias Úteis</p>
                        <div className="grid grid-cols-2 gap-3">
                          {activeTab === 'casa' ? (<>
                            <MoneyField control={form.control} name="default_weekday_lunch" label="Almoço" labelClass="text-gray-400" />
                            <MoneyField control={form.control} name="default_weekday_dinner" label="Jantar" labelClass="text-gray-400" />
                          </>) : (<>
                            <MoneyField control={form.control} name="default_weekday_lunch_freela" label="Almoço" labelClass="text-gray-400" />
                            <MoneyField control={form.control} name="default_weekday_dinner_freela" label="Jantar" labelClass="text-gray-400" />
                          </>)}
                        </div>
                      </div>
                      <div className="border-t border-gray-100 pt-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-500">Fim de Semana</p>
                        <div className="grid grid-cols-2 gap-3">
                          {activeTab === 'casa' ? (<>
                            <MoneyField control={form.control} name="default_weekend_lunch" label="Almoço" labelClass="text-gray-400" />
                            <MoneyField control={form.control} name="default_weekend_dinner" label="Jantar" labelClass="text-gray-400" />
                          </>) : (<>
                            <MoneyField control={form.control} name="default_weekend_lunch_freela" label="Almoço" labelClass="text-gray-400" />
                            <MoneyField control={form.control} name="default_weekend_dinner_freela" label="Jantar" labelClass="text-gray-400" />
                          </>)}
                        </div>
                      </div>
                      <p className="mb-0 text-[11px] text-gray-400">
                        Onde ainda é usado: apenas em overrides manuais de alimentação — o cálculo automático usa "Alimentação por refeição (regra por voo)" da seção aplicada.
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Tabela: Diária por Função (legado) ── */}
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
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                            <BadgeCheck className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold leading-tight text-slate-800">Diária por Função (legado)</p>
                            <p className="text-[11px] font-light text-slate-400">
                              Onde ainda vale: só para funções fora das regras acima — para o time casa/freela coberto pelas regras, estes valores deixaram de ser usados no cálculo.
                            </p>
                          </div>
                          {dirtyFunctionCount > 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                              {dirtyFunctionCount} alterada{dirtyFunctionCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {allFunctions.length > 0 && (
                        <div className="border-b border-slate-100 px-5 py-3">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              aria-label="Buscar função"
                              placeholder="Buscar função..."
                              value={functionSearch}
                              onChange={e => setFunctionSearch(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                              className="w-full rounded-full border-none bg-slate-100 py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          </div>
                        </div>
                      )}

                      {allFunctions.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                          <BadgeCheck className="mx-auto mb-3 h-8 w-8 text-slate-200" />
                          <p className="mb-1 text-sm font-medium text-slate-500">Nenhuma função cadastrada.</p>
                          <p className="mb-4 text-xs text-slate-400">Acesse a página de Funções para adicionar.</p>
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
                          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-5 py-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Função</span>
                            <span className="text-right text-[10px] font-bold uppercase tracking-wider text-blue-600">Dia Útil</span>
                            <span className="text-right text-[10px] font-bold uppercase tracking-wider text-orange-500">Fim de Semana</span>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {visibleFns.map((fn) => {
                              const isCoord = fn.responsibleArea === '__system__';
                              const fv = allFunctionValues.find(v => v.functionId === fn.id) as any;
                              const wdVal = getCurrentValue(fn.id, 'wd');
                              const weVal = getCurrentValue(fn.id, 'we');
                              const savedWdCent = !fv ? 0 : activeTab === 'casa' ? (fv.dailyValue ?? 0) : freelaOuCasa(fv.dailyValueFreela, fv.dailyValue);
                              const savedWeCent = !fv ? 0 : activeTab === 'casa' ? (fv.dailyValueWeekend ?? 0) : freelaOuCasa(fv.dailyValueFreelaWeekend, fv.dailyValueWeekend);
                              const savedWd = centavosToReais(savedWdCent);
                              const savedWe = centavosToReais(savedWeCent);
                              const isDirtyWd = parseFloat(wdVal) !== parseFloat(savedWd);
                              const isDirtyWe = parseFloat(weVal) !== parseFloat(savedWe);
                              const isDirty = isDirtyWd || isDirtyWe;
                              const isEditingWd = editingFunctionId === fn.id && editingField === 'wd';
                              const isEditingWe = editingFunctionId === fn.id && editingField === 'we';
                              const hasWd = !!fv && savedWdCent > 0;
                              const hasWe = !!fv && savedWeCent > 0;

                              const renderCell = (field: 'wd' | 'we', isEditing: boolean, currentVal: string, hasCustom: boolean, fallbackVal?: string) => {
                                const isZero = parseFloat(currentVal) === 0;
                                const hasFallback = isZero && fallbackVal && parseFloat(fallbackVal) > 0;
                                const valueColor = hasCustom
                                  ? (field === 'we' ? 'text-orange-500' : activeTab === 'casa' ? 'text-indigo-700' : 'text-violet-700')
                                  : 'text-slate-400';
                                return (
                                  <div
                                    role={isEditing ? undefined : "button"}
                                    tabIndex={isEditing ? -1 : 0}
                                    aria-label={`Editar ${field === 'wd' ? 'dia útil' : 'fim de semana'} de ${toTitleCase(fn.name)}`}
                                    className="group/cell flex items-center justify-end gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                                    onClick={e => { e.stopPropagation(); if (!isEditing) startEditFunction(fn, field); }}
                                    onKeyDown={e => {
                                      if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault();
                                        startEditFunction(fn, field);
                                      }
                                    }}
                                  >
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        <div className="flex items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 shadow-sm">
                                          <span className="select-none text-[10px] font-medium text-slate-400">R$</span>
                                          <input
                                            ref={editInputRef}
                                            type="text"
                                            inputMode="decimal"
                                            aria-label="Novo valor da diária"
                                            value={editingFunctionValue}
                                            onChange={e => setEditingFunctionValue(normalizeDecimal(e.target.value))}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') { e.preventDefault(); confirmEditFunction(fn.id); }
                                              if (e.key === 'Escape') cancelEditFunction();
                                            }}
                                            onBlur={() => confirmEditFunction(fn.id)}
                                            className="w-16 border-none bg-transparent text-right font-mono text-sm font-semibold tabular-nums text-slate-700 outline-none focus:outline-none"
                                          />
                                        </div>
                                        <button type="button" onClick={cancelEditFunction} className="flex items-center justify-center text-slate-400 opacity-0 transition-opacity hover:text-slate-600 group-hover/cell:opacity-100">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex cursor-pointer items-center gap-1.5">
                                        {isZero ? (
                                          hasFallback ? (
                                            <Tooltip delayDuration={200}>
                                              <TooltipTrigger asChild>
                                                <span className="text-sm font-medium tabular-nums text-orange-500">
                                                  R$ {parseFloat(fallbackVal!).toFixed(2).replace('.', ',')}
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="text-xs">
                                                Usa o valor do Dia Útil (sem FDS específico)
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            <span className="text-sm italic text-slate-300">—</span>
                                          )
                                        ) : (
                                          <span className={`text-sm font-semibold tabular-nums ${valueColor}`}>
                                            {`R$ ${parseFloat(currentVal).toFixed(2).replace('.', ',')}`}
                                          </span>
                                        )}
                                        <Pencil className="h-3 w-3 text-slate-300 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100" />
                                      </div>
                                    )}
                                  </div>
                                );
                              };

                              return (
                                <div
                                  key={fn.id}
                                  className={`group grid min-h-[44px] grid-cols-3 items-center gap-2 px-5 py-1.5 transition-colors
                                    ${isCoord ? 'bg-blue-50/40' : 'bg-white hover:bg-slate-50/70'}
                                    ${isDirty ? 'ring-1 ring-inset ring-amber-200' : ''}
                                  `}
                                >
                                  {/* Nome + badges */}
                                  <div className="flex min-w-0 items-center gap-2">
                                    {isCoord ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="shrink-0 cursor-help rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600">Base</span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[220px] text-center text-xs leading-snug">
                                          Função base: valor usado como referência quando a função do colaborador não possui valor personalizado cadastrado
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : null}
                                    <span
                                      className={`truncate text-sm font-medium ${
                                        isCoord ? 'text-blue-700'
                                        : isDirty ? 'font-semibold text-amber-700'
                                        : activeTab === 'freela' ? 'text-amber-600'
                                        : 'text-gray-700'
                                      }`}
                                    >
                                      {toTitleCase(fn.name)}
                                    </span>
                                  </div>

                                  {/* Dia Útil */}
                                  {renderCell('wd', isEditingWd, wdVal, hasWd)}
                                  {/* Fim de Semana — passa wdVal como fallback quando FDS não está configurado */}
                                  {renderCell('we', isEditingWe, weVal, hasWe, wdVal)}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                            <span className="text-[11px] text-slate-400">{allFunctions.length} {allFunctions.length === 1 ? 'função' : 'funções'} cadastradas</span>
                            <Link href="/functions" className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-500 hover:text-indigo-700 hover:underline">
                              Gerenciar funções <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ── Rodapé informativo (o salvamento acontece na barra flutuante) ── */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 py-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>Administradores e Financeiro/RH podem alterar estes valores</span>
            </div>
            <div className="flex items-center gap-3">
              {lastSaved && (
                <span className="hidden text-xs text-gray-400 sm:block">
                  Salvo em {formatDateTime(lastSaved.timestamp)} · <span className="font-medium">{lastSaved.user}</span>
                </span>
              )}
              {/* Ação secundária: reaplica os valores JÁ SALVOS ao Planejado pendente
                  (ao salvar pela barra flutuante isso já acontece automaticamente) */}
              <button
                type="button"
                onClick={handleApplyToPending}
                disabled={isApplyingPending}
                title="Aplica os valores padrão já salvos a todos os orçamentos planejados ainda não enviados. Ao salvar alterações, isso já é feito automaticamente."
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-indigo-500 hover:text-indigo-600 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isApplyingPending ? 'animate-spin' : ''}`} />
                {isApplyingPending ? 'Aplicando...' : 'Atualizar Planejado'}
              </button>
            </div>
          </div>
        </form>
      </Form>

      {/* Confirmação de exclusão de empresa pagadora (padrão do app) */}
      <AlertDialog open={!!companyToDelete} onOpenChange={open => { if (!open) setCompanyToDelete(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover empresa pagadora?</AlertDialogTitle>
            <AlertDialogDescription>
              {companyToDelete && (
                <>
                  A empresa <span className="font-semibold">{companyToDelete.name}</span> (CNPJ {companyToDelete.cnpj}) deixará de aparecer como opção nas Notas Fiscais.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 hover:bg-red-700"
              onClick={() => { if (companyToDelete) deleteCompanyMutation.mutate(companyToDelete.id); setCompanyToDelete(null); }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Histórico deste navegador (localStorage — não compartilhado) ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200">
        {groupedHistory.length === 0 ? (
          <div className="flex items-center gap-2.5 px-5 py-4 text-sm text-gray-400">
            <Clock className="w-4 h-4 text-gray-300" />
            <span>Histórico deste navegador</span>
            <span className="text-gray-300">·</span>
            <span className="font-normal text-gray-400">Nenhuma alteração registrada neste navegador</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className="flex w-full items-center justify-between bg-gray-50 px-5 py-4 transition-colors hover:bg-gray-100"
            >
              <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-gray-700">
                <Clock className="w-4 h-4 text-indigo-500" />
                Histórico deste navegador
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600">
                  {groupedHistory.length}
                </span>
                <span className="text-[11px] font-normal text-gray-400">
                  registrado localmente — outros usuários não veem estas entradas
                </span>
              </div>
              {historyOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {historyOpen && (
              <div className="divide-y divide-gray-100 bg-white">
                {groupedHistory.map((group, gi) => (
                  <div key={gi} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                      {getUserInitials(group.user)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
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
                            <span className="font-semibold text-emerald-600">{e.newValue}</span>
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
    </div>
    </TooltipProvider>
  );
}
