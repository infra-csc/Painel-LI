import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event, PaymentCompany } from "@shared/schema";
import { useEffect, useRef, useState } from "react";
import { X, Check, Trash2, Plus } from "lucide-react";
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
  }, { message: "CNPJ inválido." }),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
}

const BLUE = "#0033CC";

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#64748B",
  textTransform: "uppercase", letterSpacing: "0.06em",
  marginBottom: 3, display: "block",
};

const inp: React.CSSProperties = {
  height: 38, fontSize: 13, fontFamily: "inherit",
  border: "1px solid #E2E8F0", borderRadius: 8,
  background: "white", outline: "none", color: "#1E293B",
  transition: "border-color 0.15s",
};

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
    if (alreadyExists) { toast({ title: "CNPJ já cadastrado.", variant: "destructive" }); return; }
    await createCompanyMutation.mutateAsync({ name: manageNewName.trim(), cnpj: manageNewCnpj });
    setManageNewName(""); setManageNewCnpj("");
    toast({ title: "Empresa cadastrada com sucesso." });
  };

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: "onBlur",
    defaultValues: { name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "", paymentCompanyCnpj: "" },
  });

  const watchedCompanyName = form.watch("paymentCompanyName") ?? "";
  const watchedCompanyCnpj = form.watch("paymentCompanyCnpj") ?? "";
  const isSaved = paymentCompanies.some(c => c.name.trim().toLowerCase() === watchedCompanyName.trim().toLowerCase());
  const isNew = watchedCompanyName.trim() !== "" && !isSaved && validateCnpj(watchedCompanyCnpj);
  const filteredSuggestions = watchedCompanyName.trim().length > 0
    ? paymentCompanies.filter(c => c.name.toLowerCase().includes(watchedCompanyName.toLowerCase()))
    : paymentCompanies;

  useEffect(() => {
    if (event) {
      const obs = event.observations || "";
      form.reset({
        name: event.name, location: event.location,
        startDate: event.startDate, endDate: event.endDate,
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        nameInputRef.current && !nameInputRef.current.contains(e.target as Node) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)
      ) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      if (isEditing && event) return (await apiRequest("PUT", `/api/events/${event.id}`, data)).json();
      return (await apiRequest("POST", "/api/events", data)).json();
    },
    onSuccess: async (_result, data) => {
      const companyName = data.paymentCompanyName?.trim();
      const companyCnpj = data.paymentCompanyCnpj ?? "";
      if (companyName && validateCnpj(companyCnpj)) {
        const alreadyExists = paymentCompanies.some(c => c.cnpj.replace(/\D/g, "") === companyCnpj.replace(/\D/g, ""));
        if (!alreadyExists) {
          try { await createCompanyMutation.mutateAsync({ name: companyName, cnpj: companyCnpj }); } catch {}
        }
      }
      toast({ title: "Sucesso", description: isEditing ? "Evento atualizado." : "Evento criado." });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message || `Erro ao ${isEditing ? "atualizar" : "criar"} evento.`, variant: "destructive" });
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
          className="p-0 gap-0 sm:max-w-xl rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh]"
          data-testid="modal-event"
        >
          {/* ── Header ── */}
          <div style={{ padding: "13px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "white", fontVariationSettings: "'FILL' 1" }}>
                {isEditing ? "edit_calendar" : "event_upcoming"}
              </span>
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0, lineHeight: 1.2 }}>
                {isEditing ? "Editar Evento" : "Novo Evento"}
              </h2>
              <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
                {isEditing ? "Atualize os dados do evento" : "Preencha os dados para criar um novo evento"}
              </p>
            </div>
            <button onClick={handleClose}
              style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
              className="hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: "12px 16px", overflowY: "auto", flex: 1 }}>
            <Form {...form}>
              <form id="event-form" onSubmit={form.handleSubmit(onSubmit)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* Nome */}
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <div>
                      <label style={lbl}>Nome do Evento <span style={{ color: "#EF4444" }}>*</span></label>
                      <div style={{ position: "relative" }}>
                        <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1" }}>label</span>
                        <Input placeholder="Ex: Rock in Rio 2025" data-testid="input-event-name"
                          className="pl-8 text-[13px] h-[38px] rounded-lg border-slate-200 bg-white focus:border-[#0033CC] focus:ring-1 focus:ring-[#0033CC]/20"
                          {...field} />
                      </div>
                      <FormMessage style={{ fontSize: 11 }} />
                    </div>
                  )} />

                  {/* Local */}
                  <FormField control={form.control} name="location" render={({ field }) => (
                    <div>
                      <label style={lbl}>Local <span style={{ color: "#EF4444" }}>*</span></label>
                      <div style={{ position: "relative" }}>
                        <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1" }}>location_on</span>
                        <Input placeholder="Ex: Rio de Janeiro, RJ" data-testid="input-event-location"
                          className="pl-8 text-[13px] h-[38px] rounded-lg border-slate-200 bg-white focus:border-[#0033CC] focus:ring-1 focus:ring-[#0033CC]/20"
                          {...field} />
                      </div>
                      <FormMessage style={{ fontSize: 11 }} />
                    </div>
                  )} />

                  {/* Datas */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FormField control={form.control} name="startDate" render={({ field }) => (
                      <div>
                        <label style={lbl}>Data Início <span style={{ color: "#EF4444" }}>*</span></label>
                        <div style={{ position: "relative" }}>
                          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1" }}>calendar_today</span>
                          <Input type="date" data-testid="input-event-start-date"
                            className="pl-8 text-[13px] h-[38px] rounded-lg border-slate-200 bg-white focus:border-[#0033CC] focus:ring-1 focus:ring-[#0033CC]/20"
                            {...field} />
                        </div>
                        <FormMessage style={{ fontSize: 11 }} />
                      </div>
                    )} />
                    <FormField control={form.control} name="endDate" render={({ field }) => (
                      <div>
                        <label style={lbl}>Data Fim <span style={{ color: "#EF4444" }}>*</span></label>
                        <div style={{ position: "relative" }}>
                          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1" }}>event_busy</span>
                          <Input type="date" data-testid="input-event-end-date"
                            className="pl-8 text-[13px] h-[38px] rounded-lg border-slate-200 bg-white focus:border-[#0033CC] focus:ring-1 focus:ring-[#0033CC]/20"
                            {...field} />
                        </div>
                        <FormMessage style={{ fontSize: 11 }} />
                      </div>
                    )} />
                  </div>

                  {/* Status — só ao editar */}
                  {isEditing && (
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <div>
                        <label style={lbl}>Status</label>
                        <select
                          value={field.value}
                          onChange={e => field.onChange(e.target.value)}
                          data-testid="select-event-status"
                          style={{ ...inp, width: "100%", padding: "0 10px", cursor: "pointer" }}
                        >
                          <option value="planejado">Planejado</option>
                          <option value="concluído">Concluído</option>
                          <option value="excluído">Excluído</option>
                        </select>
                        <FormMessage style={{ fontSize: 11 }} />
                      </div>
                    )} />
                  )}

                  {/* ── Empresa pagadora ── */}
                  <div style={{ background: "#F8FAFC", borderRadius: 10, border: "1px solid #F1F5F9", padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#059669", fontVariationSettings: "'FILL' 1" }}>account_balance</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>Empresa Pagadora</span>
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>· opcional</span>
                      </div>
                      <button type="button" onClick={() => setShowManage(true)}
                        style={{ fontSize: 11, color: "#64748B", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}
                        className="hover:text-[#0033CC] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                        Gerenciar{paymentCompanies.length > 0 ? ` (${paymentCompanies.length})` : ""}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {/* Nome empresa */}
                      <FormField control={form.control} name="paymentCompanyName" render={({ field }) => (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <label style={{ ...lbl, margin: 0 }}>Nome</label>
                            {isSaved && <span style={{ fontSize: 10, fontWeight: 600, color: "#059669", background: "#ECFDF5", padding: "1px 6px", borderRadius: 10 }}>Salva</span>}
                            {isNew  && <span style={{ fontSize: 10, fontWeight: 600, color: BLUE,     background: "#EEF2FF", padding: "1px 6px", borderRadius: 10 }}>Nova</span>}
                          </div>
                          <FormControl>
                            <div style={{ position: "relative" }}>
                              <input
                                ref={nameInputRef}
                                placeholder="Nome Fantasia"
                                autoComplete="off"
                                style={{ ...inp, width: "100%", padding: "0 10px", boxSizing: "border-box" }}
                                {...field}
                                onFocus={() => setShowSuggestions(true)}
                                onChange={e => { field.onChange(e); setShowSuggestions(true); }}
                              />
                              {showSuggestions && filteredSuggestions.length > 0 && (
                                <div ref={suggestionsRef}
                                  style={{ position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0, marginTop: 4, background: "white", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                                  {filteredSuggestions.map(c => (
                                    <button key={c.id} type="button" onMouseDown={e => { e.preventDefault(); selectCompany(c); }}
                                      style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid #F8FAFC", cursor: "pointer", fontFamily: "inherit" }}
                                      className="hover:bg-slate-50 transition-colors">
                                      <p style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", margin: 0 }}>{c.name}</p>
                                      <p style={{ fontSize: 11, color: "#94A3B8", margin: 0, fontFamily: "monospace" }}>{c.cnpj}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage style={{ fontSize: 11 }} />
                        </div>
                      )} />

                      {/* CNPJ */}
                      <FormField control={form.control} name="paymentCompanyCnpj" render={({ field }) => (
                        <div>
                          <label style={{ ...lbl, marginBottom: 4 }}>CNPJ</label>
                          <FormControl>
                            <CnpjInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name}
                              className="h-[38px] text-[13px] border-slate-200 rounded-lg bg-white focus:border-[#0033CC] focus:ring-1 focus:ring-[#0033CC]/20" />
                          </FormControl>
                          <FormMessage style={{ fontSize: 11 }} />
                        </div>
                      )} />
                    </div>
                  </div>

                  {/* Observações */}
                  <FormField control={form.control} name="observations" render={({ field }) => (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <label style={lbl}>Observações <span style={{ color: "#CBD5E1", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· opcional</span></label>
                        <span style={{ fontSize: 10, color: "#CBD5E1" }}>{obsLength}/500</span>
                      </div>
                      <FormControl>
                        <Textarea rows={2} maxLength={500}
                          placeholder="Detalhes adicionais, requisitos especiais..."
                          data-testid="textarea-event-observations"
                          className="text-[13px] resize-none rounded-lg border-slate-200 bg-white focus:border-[#0033CC] focus:ring-1 focus:ring-[#0033CC]/20"
                          {...field}
                          onChange={e => { field.onChange(e); setObsLength(e.target.value.length); }}
                        />
                      </FormControl>
                      <FormMessage style={{ fontSize: 11 }} />
                    </div>
                  )} />

                </div>
              </form>
            </Form>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: "10px 16px", borderTop: "1px solid #F1F5F9", background: "#FAFBFF", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={handleClose} data-testid="button-cancel-event"
              style={{ height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "white", color: "#64748B", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Cancelar
            </button>
            <button type="submit" form="event-form" disabled={saveEventMutation.isPending} data-testid="button-save-event"
              style={{
                height: 36, padding: "0 18px", borderRadius: 8, border: "none",
                background: BLUE, color: "white", fontSize: 13, fontWeight: 600,
                cursor: saveEventMutation.isPending ? "not-allowed" : "pointer",
                opacity: saveEventMutation.isPending ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit",
              }}>
              {saveEventMutation.isPending ? (
                <>
                  <span style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={3} />
                  {isEditing ? "Atualizar" : "Criar Evento"}
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Mini modal: Gerenciar empresas ── */}
      <Dialog open={showManage} onOpenChange={v => { setShowManage(v); if (!v) { setManageNewName(""); setManageNewCnpj(""); } }}>
        <DialogContent className="p-0 gap-0 sm:max-w-[440px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[80vh]">

          <div style={{ padding: "16px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#059669", fontVariationSettings: "'FILL' 1" }}>account_balance</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Empresas Salvas</h3>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", background: "#F1F5F9", padding: "1px 7px", borderRadius: 10 }}>{paymentCompanies.length}</span>
            <button onClick={() => setShowManage(false)}
              style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
              className="hover:bg-slate-100 transition-colors">
              <X size={14} />
            </button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: "10px 18px" }}>
            {paymentCompanies.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#CBD5E1" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, display: "block", marginBottom: 8 }}>account_balance</span>
                <p style={{ fontSize: 12, margin: 0 }}>Nenhuma empresa cadastrada.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {paymentCompanies.map(c => (
                  <div key={c.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #F1F5F9" }}
                    className="group">
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", margin: 0 }}>{c.name}</p>
                      <p style={{ fontSize: 11, color: "#94A3B8", margin: 0, fontFamily: "monospace" }}>{c.cnpj}</p>
                    </div>
                    <button type="button" onClick={() => deleteCompanyMutation.mutate(c.id)} disabled={deleteCompanyMutation.isPending}
                      style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1" }}
                      className="hover:bg-red-50 hover:!text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: "14px 18px", borderTop: "1px solid #F1F5F9", background: "#FAFBFF", flexShrink: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Adicionar empresa</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div>
                <label style={lbl}>Nome</label>
                <Input value={manageNewName} onChange={e => setManageNewName(e.target.value)} placeholder="Nome Fantasia"
                  className="h-[36px] text-[13px] border-slate-200 rounded-lg bg-white" />
              </div>
              <div>
                <label style={lbl}>CNPJ</label>
                <CnpjInput value={manageNewCnpj} onChange={setManageNewCnpj} name="manageNewCnpj"
                  className="h-[36px] text-[13px] border-slate-200 rounded-lg bg-white" />
              </div>
            </div>
            <button type="button" disabled={!manageNewName.trim() || !validateCnpj(manageNewCnpj) || createCompanyMutation.isPending}
              onClick={handleManageAddCompany}
              style={{ height: 34, padding: "0 14px", borderRadius: 7, border: "none", background: "#059669", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", opacity: (!manageNewName.trim() || !validateCnpj(manageNewCnpj)) ? 0.4 : 1 }}>
              <Plus size={13} />
              Cadastrar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
