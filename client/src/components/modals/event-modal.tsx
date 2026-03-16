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
import { X, MapPin, Calendar, Check, CalendarCheck, CalendarClock, Trash2, Building2, Pencil, Sparkles, BookMarked, Plus } from "lucide-react";
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

const INPUT_CLS = "h-10 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all";

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
          className="p-0 gap-0 sm:max-w-[520px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[90vh]"
          data-testid="modal-event"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isEditing ? "Editar Evento" : "Novo Evento"}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEditing ? "Atualize os dados do evento" : "Preencha os dados do novo evento"}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 overflow-y-auto flex-1">
            <Form {...form}>
              <form id="event-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                {/* Nome do Evento */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">
                        Nome do Evento <span className="text-red-400">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Rock in Rio 2025"
                          className={INPUT_CLS}
                          data-testid="input-event-name"
                          {...field}
                        />
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
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">
                        Local <span className="text-red-400">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <Input
                            placeholder="Ex: Rio de Janeiro, RJ"
                            className={`${INPUT_CLS} pl-9`}
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
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">
                          Data Início <span className="text-red-400">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <Input
                              type="date"
                              className={`${INPUT_CLS} pl-9`}
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
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">
                          Data Fim <span className="text-red-400">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <Input
                              type="date"
                              className={`${INPUT_CLS} pl-9`}
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
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">
                          Status <span className="text-red-400">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={`${INPUT_CLS}`} data-testid="select-event-status">
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

                {/* Observações */}
                <FormField
                  control={form.control}
                  name="observations"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">
                        Observações <span className="text-slate-400 font-normal">(opcional)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Textarea
                            rows={3}
                            placeholder="Informações adicionais, contexto ou instruções especiais sobre o evento..."
                            maxLength={500}
                            className="text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none pb-6"
                            data-testid="textarea-event-observations"
                            {...field}
                            onChange={e => { field.onChange(e); setObsLength(e.target.value.length); }}
                          />
                          <span className="absolute right-3 bottom-2 text-[10px] text-slate-300 tabular-nums">
                            {obsLength}/500
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                {/* ── Empresa responsável pelo pagamento ── */}
                <div className="border border-dashed border-emerald-200 rounded-xl p-4 bg-emerald-50/40 space-y-3">
                  {/* Header da seção */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-700">Empresa responsável pelo pagamento</span>
                      <span className="text-[10px] text-slate-400 font-normal">(opcional — Notas Fiscais)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowManage(true)}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-600 transition-colors px-1.5 py-0.5 rounded hover:bg-emerald-50"
                      title="Gerenciar empresas salvas"
                    >
                      <Pencil className="w-3 h-3" />
                      Gerenciar{paymentCompanies.length > 0 ? ` (${paymentCompanies.length})` : ""}
                    </button>
                  </div>

                  {/* Nome da empresa com autocomplete */}
                  <FormField
                    control={form.control}
                    name="paymentCompanyName"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2 mb-1">
                          <FormLabel className="text-xs font-medium text-slate-600 mb-0">Nome da empresa</FormLabel>
                          {isSaved && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                              <BookMarked className="w-2.5 h-2.5" />
                              Empresa salva
                            </span>
                          )}
                          {isNew && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                              <Sparkles className="w-2.5 h-2.5" />
                              Nova — será salva
                            </span>
                          )}
                        </div>
                        <FormControl>
                          <div className="relative">
                            <Input
                              ref={nameInputRef}
                              placeholder="Ex.: Produtora Norte Ltda"
                              className={INPUT_CLS}
                              autoComplete="off"
                              {...field}
                              onFocus={() => setShowSuggestions(true)}
                              onChange={e => { field.onChange(e); setShowSuggestions(true); }}
                            />
                            {/* Dropdown de sugestões */}
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
                                    className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors border-b border-slate-100 last:border-0"
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
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">CNPJ</FormLabel>
                        <FormControl>
                          <CnpjInput
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>

              </form>
            </Form>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              data-testid="button-cancel-event"
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="event-form"
              disabled={saveEventMutation.isPending}
              data-testid="button-save-event"
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
            >
              {saveEventMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  {isEditing ? "Atualizar Evento" : "Criar Evento"}
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Mini modal: Gerenciar empresas ── */}
      <Dialog open={showManage} onOpenChange={(v) => { setShowManage(v); if (!v) { setManageNewName(""); setManageNewCnpj(""); } }}>
        <DialogContent className="p-0 gap-0 sm:max-w-[440px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">Empresas salvas</h3>
              {paymentCompanies.length > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-full">{paymentCompanies.length}</span>
              )}
            </div>
            <button onClick={() => setShowManage(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Lista */}
          <div className="overflow-y-auto flex-1">
            {paymentCompanies.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nenhuma empresa cadastrada ainda.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {paymentCompanies.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{c.cnpj}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteCompanyMutation.mutate(c.id)}
                      disabled={deleteCompanyMutation.isPending}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Remover empresa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulário de adicionar empresa */}
          <div className="border-t border-gray-100 bg-emerald-50/60 px-5 py-4 shrink-0 space-y-3">
            <p className="text-xs font-semibold text-emerald-700">Adicionar empresa</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500 mb-1 block">Nome</label>
                <Input
                  value={manageNewName}
                  onChange={e => setManageNewName(e.target.value)}
                  placeholder="Produtora Norte Ltda"
                  className="h-8 text-xs border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 mb-1 block">CNPJ</label>
                <CnpjInput
                  value={manageNewCnpj}
                  onChange={setManageNewCnpj}
                  name="manageNewCnpj"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={!manageNewName.trim() || !validateCnpj(manageNewCnpj) || createCompanyMutation.isPending}
              onClick={handleManageAddCompany}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" />
              Cadastrar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
