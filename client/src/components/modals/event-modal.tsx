import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event, PaymentCompany } from "@shared/schema";
import { useEffect, useRef, useState } from "react";
import { X, Check, CalendarCheck, CalendarClock, Trash2, Building2, Pencil, Sparkles, BookMarked, Plus } from "lucide-react";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";

const eventSchema = z.object({
  name: z.string().min(1, "Nome do evento é obrigatório"),
  location: z.string().min(1, "Local é obrigatório"),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  endDate: z.string().min(1, "Data de fim é obrigatória"),
  status: z.enum(["planejado", "concluído", "excluído"]).optional(),
  observations: z.string().optional(),
  paymentCompanyName: z.string().optional(),
  paymentCompanyCnpj: z.string().optional().refine((v) => {
    if (!v || v.replace(/\D/g, "").length === 0) return true;
    return validateCnpj(v);
  }, { message: "CNPJ inválido. Verifique os números digitados." }),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
}

const STATUS_OPTIONS = [
  { value: "planejado",  label: "Planejado",    icon: CalendarClock, dot: "bg-blue-400" },
  { value: "concluído",  label: "Concluído",    icon: CalendarCheck, dot: "bg-emerald-400" },
  { value: "excluído",   label: "Excluído",     icon: Trash2,        dot: "bg-gray-300" },
];

const INPUT_CLS = "h-12 text-sm bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400";

export default function EventModal({ open, onClose, event }: EventModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!event;
  const [obsLength, setObsLength] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [manageNewName, setManageNewName] = useState("");
  const [manageNewCnpj, setManageNewCnpj] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { data: paymentCompanies = [] } = useQuery<PaymentCompany[]>({
    queryKey: ["/api/payment-companies"],
  });

  const createCompanyMutation = useMutation({
    mutationFn: (data: { name: string; cnpj: string }) =>
      apiRequest("POST", "/api/payment-companies", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/payment-companies"] }),
    onError: () => toast({ title: "Erro ao salvar empresa.", variant: "destructive" }),
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payment-companies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-companies"] });
      toast({ title: "Empresa removida." });
    },
    onError: () => toast({ title: "Erro ao remover empresa.", variant: "destructive" }),
  });

  const handleManageAddCompany = async () => {
    if (!manageNewName.trim() || !validateCnpj(manageNewCnpj)) return;
    const alreadyExists = paymentCompanies.some(
      c => c.cnpj.replace(/\D/g, "") === manageNewCnpj.replace(/\D/g, "")
    );
    if (alreadyExists) {
      toast({ title: "CNPJ já cadastrado.", variant: "destructive" });
      return;
    }
    await createCompanyMutation.mutateAsync({ name: manageNewName.trim(), cnpj: manageNewCnpj });
    setManageNewName("");
    setManageNewCnpj("");
    toast({ title: "Empresa cadastrada com sucesso." });
  };

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: "onBlur",
    defaultValues: { name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "", paymentCompanyCnpj: "" },
  });

  const watchedCompanyName = form.watch("paymentCompanyName") ?? "";
  const watchedCompanyCnpj = form.watch("paymentCompanyCnpj") ?? "";

  const savedMatch = paymentCompanies.find(c =>
    c.name.trim().toLowerCase() === watchedCompanyName.trim().toLowerCase()
  );
  const isSaved = !!savedMatch;
  const cnpjValid = validateCnpj(watchedCompanyCnpj);
  const isNew = watchedCompanyName.trim() !== "" && !isSaved && cnpjValid;

  const filteredSuggestions = watchedCompanyName.trim().length > 0
    ? paymentCompanies.filter(c =>
        c.name.toLowerCase().includes(watchedCompanyName.toLowerCase())
      )
    : paymentCompanies;

  useEffect(() => {
    if (event) {
      const obs = event.observations || "";
      form.reset({
        name: event.name,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status as "planejado" | "concluído" | "excluído",
        observations: obs,
        paymentCompanyName: (event as any).paymentCompanyName || "",
        paymentCompanyCnpj: (event as any).paymentCompanyCnpj || "",
      });
      setObsLength(obs.length);
    } else {
      form.reset({ name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "", paymentCompanyCnpj: "" });
      setObsLength(0);
    }
  }, [event, form]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        nameInputRef.current && !nameInputRef.current.contains(e.target as Node) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      if (isEditing && event) {
        return (await apiRequest("PUT", `/api/events/${event.id}`, data)).json();
      }
      return (await apiRequest("POST", "/api/events", data)).json();
    },
    onSuccess: async (_result, data) => {
      // Auto-save new company if name + valid CNPJ and not already saved
      const companyName = data.paymentCompanyName?.trim();
      const companyCnpj = data.paymentCompanyCnpj ?? "";
      if (companyName && validateCnpj(companyCnpj)) {
        const alreadyExists = paymentCompanies.some(
          c => c.cnpj.replace(/\D/g, "") === companyCnpj.replace(/\D/g, "")
        );
        if (!alreadyExists) {
          try {
            await createCompanyMutation.mutateAsync({ name: companyName, cnpj: companyCnpj });
            toast({ title: `Empresa "${companyName}" salva na lista.` });
          } catch {}
        }
      }
      toast({ title: "Sucesso", description: isEditing ? "Evento atualizado com sucesso" : "Evento criado com sucesso" });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || `Erro ao ${isEditing ? 'atualizar' : 'criar'} evento.`,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => { form.reset(); setObsLength(0); setShowSuggestions(false); setShowManage(false); onClose(); };
  const onSubmit = (data: EventFormData) => saveEventMutation.mutate(data);

  const selectCompany = (company: PaymentCompany) => {
    form.setValue("paymentCompanyName", company.name, { shouldDirty: true });
    form.setValue("paymentCompanyCnpj", company.cnpj, { shouldDirty: true });
    setShowSuggestions(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="p-0 gap-0 sm:max-w-2xl rounded-xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[90vh]"
          data-testid="modal-event"
        >
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-50 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(0,51,204,0.05)" }}>
                <CalendarCheck className="w-7 h-7" style={{ color: "#0033CC" }} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {isEditing ? "Editar Evento" : "Novo Evento"}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {isEditing ? "Atualize os dados do evento" : "Preencha os dados do novo evento"}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-6 overflow-y-auto flex-1 space-y-6">
            <Form {...form}>
              <form id="event-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* Nome do Evento */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-semibold text-slate-700">Nome do Evento</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">label</span>
                          <Input
                            placeholder="Ex: Rock in Rio 2025"
                            className={`${INPUT_CLS} pl-12`}
                            data-testid="input-event-name"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                {/* Local */}
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-semibold text-slate-700">Local</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">location_on</span>
                          <Input
                            placeholder="Ex: Rio de Janeiro, RJ"
                            className={`${INPUT_CLS} pl-12`}
                            data-testid="input-event-location"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                {/* Datas lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-semibold text-slate-700">Data Início</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">calendar_today</span>
                            <Input
                              type="date"
                              className={`${INPUT_CLS} pl-12`}
                              data-testid="input-event-start-date"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-semibold text-slate-700">Data Fim</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">event_busy</span>
                            <Input
                              type="date"
                              className={`${INPUT_CLS} pl-12`}
                              data-testid="input-event-end-date"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Status — só ao editar */}
                {isEditing && (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-semibold text-slate-700">Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={INPUT_CLS} data-testid="select-event-status">
                              <SelectValue placeholder="Selecione o status">
                                {field.value && (() => {
                                  const opt = STATUS_OPTIONS.find(o => o.value === field.value);
                                  return opt ? (
                                    <span className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                                      {opt.label}
                                    </span>
                                  ) : null;
                                })()}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-xl">
                            {STATUS_OPTIONS.map(opt => {
                              const Icon = opt.icon;
                              return (
                                <SelectItem key={opt.value} value={opt.value} className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${opt.dot} shrink-0`} />
                                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{opt.label}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                )}

                {/* ── Empresa responsável pelo pagamento ── */}
                <div className="bg-green-50/40 border-2 border-dashed border-green-200 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-green-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-green-800">Empresa responsável pelo pagamento</span>
                      <span className="text-[10px] text-slate-400 font-normal normal-case">(opcional)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowManage(true)}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-green-700 transition-colors px-2 py-1 rounded hover:bg-green-100"
                    >
                      <Pencil className="w-3 h-3" />
                      Gerenciar{paymentCompanies.length > 0 ? ` (${paymentCompanies.length})` : ""}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-end">
                    {/* Nome da empresa com autocomplete */}
                    <FormField
                      control={form.control}
                      name="paymentCompanyName"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <div className="flex items-center gap-1.5 h-5">
                            <FormLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0 leading-none">Nome da Empresa</FormLabel>
                            {isSaved && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full leading-none">
                                <BookMarked className="w-2.5 h-2.5" /> Salva
                              </span>
                            )}
                            {isNew && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full leading-none">
                                <Sparkles className="w-2.5 h-2.5" /> Nova
                              </span>
                            )}
                          </div>
                          <FormControl>
                            <div className="relative">
                              <Input
                                ref={nameInputRef}
                                placeholder="Nome Fantasia"
                                className="h-10 text-sm bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-green-200 transition-all placeholder:text-slate-400"
                                autoComplete="off"
                                {...field}
                                onFocus={() => setShowSuggestions(true)}
                                onChange={e => { field.onChange(e); setShowSuggestions(true); }}
                              />
                              {showSuggestions && filteredSuggestions.length > 0 && (
                                <div
                                  ref={suggestionsRef}
                                  className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                                >
                                  {filteredSuggestions.map(c => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onMouseDown={e => { e.preventDefault(); selectCompany(c); }}
                                      className="w-full text-left px-3 py-2.5 hover:bg-green-50 transition-colors border-b border-slate-100 last:border-0"
                                    >
                                      <p className="text-sm font-medium text-slate-800">{c.name}</p>
                                      <p className="text-xs text-slate-400 font-mono">{c.cnpj}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )}
                    />

                    {/* CNPJ */}
                    <FormField
                      control={form.control}
                      name="paymentCompanyCnpj"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <div className="h-5 flex items-center">
                            <FormLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0 leading-none">CNPJ</FormLabel>
                          </div>
                          <FormControl>
                            <CnpjInput
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              className="h-10 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-green-200"
                            />
                          </FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Observações */}
                <FormField
                  control={form.control}
                  name="observations"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-semibold text-slate-700">
                        Observações <span className="text-slate-400 font-normal text-xs">(opcional)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-4 text-slate-400 text-xl pointer-events-none">notes</span>
                          <Textarea
                            rows={3}
                            placeholder="Detalhes adicionais, requisitos especiais ou notas de logística..."
                            maxLength={500}
                            className="text-sm bg-slate-50 border-slate-200 rounded-xl pl-12 pr-4 focus:ring-4 focus:ring-blue-500/10 transition-all resize-none pb-6 placeholder:text-slate-400"
                            data-testid="textarea-event-observations"
                            {...field}
                            onChange={e => { field.onChange(e); setObsLength(e.target.value.length); }}
                          />
                          <span className="absolute right-3 bottom-2 text-[10px] text-slate-300 tabular-nums">{obsLength}/500</span>
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

              </form>
            </Form>
          </div>

          {/* Footer */}
          <div className="px-8 py-6 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              data-testid="button-cancel-event"
              className="px-6 h-12 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-white hover:text-slate-900 transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="event-form"
              disabled={saveEventMutation.isPending}
              data-testid="button-save-event"
              className="flex items-center gap-2 px-8 h-12 text-white font-bold rounded-xl text-sm shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
              style={{ background: "#0033CC", boxShadow: "0 10px 25px rgba(0,51,204,0.2)" }}
            >
              {saveEventMutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" strokeWidth={3} />
                  {isEditing ? "Atualizar Evento" : "Criar Evento"}
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Mini modal: Gerenciar empresas ── */}
      <Dialog open={showManage} onOpenChange={(v) => { setShowManage(v); if (!v) { setManageNewName(""); setManageNewCnpj(""); } }}>
        <DialogContent className="p-0 gap-0 sm:max-w-[460px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[80vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-slate-600" />
              <h3 className="text-base font-bold text-slate-800">Empresas salvas</h3>
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full tabular-nums">
                {paymentCompanies.length}
              </span>
            </div>
            <button
              onClick={() => setShowManage(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Lista */}
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
            {paymentCompanies.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Nenhuma empresa cadastrada ainda.</p>
              </div>
            ) : (
              paymentCompanies.map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 group transition-colors"
                  style={{ background: "#F9FAFB" }}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{c.cnpj}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteCompanyMutation.mutate(c.id)}
                    disabled={deleteCompanyMutation.isPending}
                    className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    title="Remover empresa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Separador */}
          <hr className="border-slate-100 mx-6" />

          {/* Seção adicionar */}
          <div className="px-6 py-5 shrink-0 space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Adicionar empresa</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Nome</label>
                <Input
                  value={manageNewName}
                  onChange={e => setManageNewName(e.target.value)}
                  placeholder="Produtora Norte Ltda"
                  className="h-10 text-sm border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">CNPJ</label>
                <CnpjInput
                  value={manageNewCnpj}
                  onChange={setManageNewCnpj}
                  name="manageNewCnpj"
                  className="h-10 text-sm border-slate-200 rounded-lg bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!manageNewName.trim() || !validateCnpj(manageNewCnpj) || createCompanyMutation.isPending}
                onClick={handleManageAddCompany}
                className="flex items-center gap-2 px-5 h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm shadow-emerald-200"
              >
                <Plus className="w-4 h-4" />
                Cadastrar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
