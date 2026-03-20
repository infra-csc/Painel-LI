import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event, PaymentCompany } from "@shared/schema";
import { useEffect, useRef, useState } from "react";
import { X, Check, Trash2, Plus, Loader2 } from "lucide-react";
import { CnpjInput, validateCnpj } from "@/components/ui/cnpj-input";

const eventSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  location: z.string().min(1, "Local obrigatório"),
  startDate: z.string().min(1, "Data início obrigatória"),
  endDate: z.string().min(1, "Data fim obrigatória"),
  status: z.enum(["planejado", "concluído", "excluído"]).optional(),
  observations: z.string().optional(),
  paymentCompanyName: z.string().optional(),
  paymentCompanyCnpj: z.string().optional().refine(v => {
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

// Shared input class
const IC = "h-[38px] text-[13px] rounded-lg border-slate-200 bg-white focus-visible:ring-1 focus-visible:ring-[#0033CC] focus-visible:border-[#0033CC]";

export default function EventModal({ open, onClose, event }: EventModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEditing = !!event;

  const [obsLen,       setObsLen]       = useState(0);
  const [showSugg,     setShowSugg]     = useState(false);
  const [showManage,   setShowManage]   = useState(false);
  const [manName,      setManName]      = useState("");
  const [manCnpj,      setManCnpj]      = useState("");
  const nameRef  = useRef<HTMLInputElement>(null);
  const suggRef  = useRef<HTMLDivElement>(null);

  const { data: companies = [] } = useQuery<PaymentCompany[]>({ queryKey: ["/api/payment-companies"] });

  const addCompany = useMutation({
    mutationFn: (d: { name: string; cnpj: string }) => apiRequest("POST", "/api/payment-companies", d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/payment-companies"] }),
    onError: () => toast({ title: "Erro ao salvar empresa.", variant: "destructive" }),
  });
  const delCompany = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payment-companies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-companies"] }); toast({ title: "Empresa removida." }); },
    onError: () => toast({ title: "Erro ao remover.", variant: "destructive" }),
  });

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: "onBlur",
    defaultValues: { name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "", paymentCompanyCnpj: "" },
  });

  const cName = form.watch("paymentCompanyName") ?? "";
  const cCnpj = form.watch("paymentCompanyCnpj") ?? "";
  const isSaved = companies.some(c => c.name.trim().toLowerCase() === cName.trim().toLowerCase());
  const isNew   = cName.trim() !== "" && !isSaved && validateCnpj(cCnpj);
  const filtered = cName.trim() ? companies.filter(c => c.name.toLowerCase().includes(cName.toLowerCase())) : companies;

  useEffect(() => {
    if (event) {
      const obs = event.observations || "";
      form.reset({
        name: event.name, location: event.location,
        startDate: event.startDate, endDate: event.endDate,
        status: event.status as any,
        observations: obs,
        paymentCompanyName: (event as any).paymentCompanyName || "",
        paymentCompanyCnpj: (event as any).paymentCompanyCnpj || "",
      });
      setObsLen(obs.length);
    } else {
      form.reset({ name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "", paymentCompanyCnpj: "" });
      setObsLen(0);
    }
  }, [event]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!nameRef.current?.contains(e.target as Node) && !suggRef.current?.contains(e.target as Node))
        setShowSugg(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const saveEvent = useMutation({
    mutationFn: async (data: EventFormData) => {
      if (isEditing && event) return (await apiRequest("PUT", `/api/events/${event.id}`, data)).json();
      return (await apiRequest("POST", "/api/events", data)).json();
    },
    onSuccess: async (_, data) => {
      const cn = data.paymentCompanyName?.trim();
      const cc = data.paymentCompanyCnpj ?? "";
      if (cn && validateCnpj(cc)) {
        const exists = companies.some(c => c.cnpj.replace(/\D/g, "") === cc.replace(/\D/g, ""));
        if (!exists) try { await addCompany.mutateAsync({ name: cn, cnpj: cc }); } catch {}
      }
      toast({ title: isEditing ? "Evento atualizado." : "Evento criado." });
      form.reset();
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      qc.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message || "Tente novamente.", variant: "destructive" }),
  });

  const handleClose = () => { form.reset(); setObsLen(0); setShowSugg(false); setShowManage(false); onClose(); };
  const onSubmit = (d: EventFormData) => saveEvent.mutate(d);
  const pickCompany = (c: PaymentCompany) => { form.setValue("paymentCompanyName", c.name, { shouldDirty: true }); form.setValue("paymentCompanyCnpj", c.cnpj, { shouldDirty: true }); setShowSugg(false); };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="p-0 gap-0 sm:max-w-[560px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh]"
          data-testid="modal-event">

          {/* ── Header ── */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "white" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 10px rgba(0,51,204,0.25)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 19, color: "white", fontVariationSettings: "'FILL' 1" }}>
                {isEditing ? "edit_calendar" : "event_upcoming"}
              </span>
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", margin: 0, letterSpacing: "-0.2px" }}>
                {isEditing ? "Editar Evento" : "Novo Evento"}
              </h2>
              <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
                {isEditing ? "Atualize os dados do evento" : "Preencha os dados para criar"}
              </p>
            </div>
            <button onClick={handleClose} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
              className="hover:bg-slate-100 hover:text-slate-700 transition-colors"><X size={16} /></button>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
            <Form {...form}>
              <form id="event-form" onSubmit={form.handleSubmit(onSubmit)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Nome */}
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4, letterSpacing: "0.03em" }}>
                        Nome do Evento <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1", pointerEvents: "none" }}>label</span>
                        <Input placeholder="Ex: Rock in Rio 2025" data-testid="input-event-name" className={`${IC} pl-9`} {...field} />
                      </div>
                      <FormMessage className="text-[11px] mt-1" />
                    </div>
                  )} />

                  {/* Local */}
                  <FormField control={form.control} name="location" render={({ field }) => (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4, letterSpacing: "0.03em" }}>
                        Local <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "#CBD5E1", pointerEvents: "none" }}>location_on</span>
                        <Input placeholder="Ex: Rio de Janeiro, RJ" data-testid="input-event-location" className={`${IC} pl-9`} {...field} />
                      </div>
                      <FormMessage className="text-[11px] mt-1" />
                    </div>
                  )} />

                  {/* Datas */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <FormField control={form.control} name="startDate" render={({ field }) => (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4, letterSpacing: "0.03em" }}>
                          Início <span style={{ color: "#EF4444" }}>*</span>
                        </label>
                        <div style={{ position: "relative" }}>
                          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#CBD5E1", pointerEvents: "none" }}>calendar_today</span>
                          <Input type="date" data-testid="input-event-start-date" className={`${IC} pl-9`} {...field} />
                        </div>
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />
                    <FormField control={form.control} name="endDate" render={({ field }) => (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4, letterSpacing: "0.03em" }}>
                          Fim <span style={{ color: "#EF4444" }}>*</span>
                        </label>
                        <div style={{ position: "relative" }}>
                          <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#CBD5E1", pointerEvents: "none" }}>event</span>
                          <Input type="date" data-testid="input-event-end-date" className={`${IC} pl-9`} {...field} />
                        </div>
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />
                  </div>

                  {/* Status (só edição) */}
                  {isEditing && (
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4, letterSpacing: "0.03em" }}>Status</label>
                        <select value={field.value} onChange={e => field.onChange(e.target.value)} data-testid="select-event-status"
                          style={{ height: 38, fontSize: 13, width: "100%", padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 8, background: "white", color: "#1E293B", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                          <option value="planejado">Planejado</option>
                          <option value="concluído">Concluído</option>
                          <option value="excluído">Excluído</option>
                        </select>
                      </div>
                    )} />
                  )}

                  {/* ── Divider ── */}
                  <div style={{ height: 1, background: "#F1F5F9", margin: "2px 0" }} />

                  {/* ── Empresa Pagadora ── */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#059669", fontVariationSettings: "'FILL' 1" }}>account_balance</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.03em" }}>Empresa Pagadora</span>
                        <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>opcional</span>
                        {isSaved && <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#ECFDF5", padding: "1px 7px", borderRadius: 10 }}>Salva</span>}
                        {isNew   && <span style={{ fontSize: 10, fontWeight: 700, color: BLUE,     background: "#EEF2FF", padding: "1px 7px", borderRadius: 10 }}>Nova</span>}
                      </div>
                      <button type="button" onClick={() => setShowManage(true)} style={{ fontSize: 11, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}
                        className="hover:text-[#0033CC] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>settings</span>
                        Gerenciar{companies.length > 0 ? ` (${companies.length})` : ""}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "#F8FAFC", borderRadius: 10, padding: "12px 12px" }}>
                      <FormField control={form.control} name="paymentCompanyName" render={({ field }) => (
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nome</label>
                          <FormControl>
                            <div style={{ position: "relative" }}>
                              <input ref={nameRef} placeholder="Nome Fantasia" autoComplete="off"
                                style={{ height: 36, fontSize: 12, width: "100%", padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 7, background: "white", color: "#1E293B", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                                {...field}
                                onFocus={() => setShowSugg(true)}
                                onChange={e => { field.onChange(e); setShowSugg(true); }} />
                              {showSugg && filtered.length > 0 && (
                                <div ref={suggRef} style={{ position: "absolute", zIndex: 60, top: "100%", left: 0, right: 0, marginTop: 4, background: "white", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", overflow: "hidden" }}>
                                  {filtered.map(c => (
                                    <button key={c.id} type="button" onMouseDown={e => { e.preventDefault(); pickCompany(c); }}
                                      style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid #F8FAFC", cursor: "pointer", fontFamily: "inherit" }}
                                      className="hover:bg-blue-50 transition-colors">
                                      <p style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", margin: 0 }}>{c.name}</p>
                                      <p style={{ fontSize: 10, color: "#94A3B8", margin: 0, fontFamily: "monospace" }}>{c.cnpj}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage className="text-[10px] mt-1" />
                        </div>
                      )} />

                      <FormField control={form.control} name="paymentCompanyCnpj" render={({ field }) => (
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>CNPJ</label>
                          <FormControl>
                            <CnpjInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name}
                              className="h-[36px] text-[12px] border-slate-200 rounded-[7px] bg-white" />
                          </FormControl>
                          <FormMessage className="text-[10px] mt-1" />
                        </div>
                      )} />
                    </div>
                  </div>

                  {/* ── Observações ── */}
                  <FormField control={form.control} name="observations" render={({ field }) => (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.03em" }}>
                          Observações <span style={{ color: "#CBD5E1", fontWeight: 400 }}>· opcional</span>
                        </label>
                        <span style={{ fontSize: 10, color: "#D1D5DB" }}>{obsLen}/500</span>
                      </div>
                      <FormControl>
                        <Textarea rows={2} maxLength={500} placeholder="Detalhes adicionais ou notas de logística..."
                          data-testid="textarea-event-observations"
                          className="text-[13px] resize-none rounded-lg border-slate-200 bg-white focus-visible:ring-1 focus-visible:ring-[#0033CC] focus-visible:border-[#0033CC]"
                          {...field} onChange={e => { field.onChange(e); setObsLen(e.target.value.length); }} />
                      </FormControl>
                      <FormMessage className="text-[11px] mt-1" />
                    </div>
                  )} />

                </div>
              </form>
            </Form>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid #F1F5F9", background: "#FAFBFF", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={handleClose} data-testid="button-cancel-event"
              style={{ height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "white", color: "#64748B", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              className="hover:bg-slate-50 hover:border-slate-300 transition-colors">
              Cancelar
            </button>
            <button type="submit" form="event-form" disabled={saveEvent.isPending} data-testid="button-save-event"
              style={{
                height: 36, padding: "0 18px", borderRadius: 8, border: "none",
                background: saveEvent.isPending ? "#6B7280" : BLUE,
                color: "white", fontSize: 13, fontWeight: 700, cursor: saveEvent.isPending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit",
                boxShadow: saveEvent.isPending ? "none" : "0 4px 12px rgba(0,51,204,0.25)",
                transition: "all 0.2s",
              }}>
              {saveEvent.isPending
                ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                : <><Check size={13} strokeWidth={3} /> {isEditing ? "Atualizar" : "Criar Evento"}</>
              }
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Gerenciar empresas ── */}
      <Dialog open={showManage} onOpenChange={v => { setShowManage(v); if (!v) { setManName(""); setManCnpj(""); } }}>
        <DialogContent className="p-0 gap-0 sm:max-w-[420px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[80vh]">

          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#059669", fontVariationSettings: "'FILL' 1" }}>account_balance</span>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: 0 }}>Empresas Salvas</h3>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#F1F5F9", color: "#94A3B8", padding: "1px 7px", borderRadius: 10 }}>{companies.length}</span>
            <button onClick={() => setShowManage(false)} style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
              className="hover:bg-slate-100 transition-colors"><X size={14} /></button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: "10px 18px" }}>
            {companies.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#CBD5E1" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 30, display: "block", marginBottom: 8 }}>account_balance</span>
                <p style={{ fontSize: 12, margin: 0 }}>Nenhuma empresa cadastrada.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {companies.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "9px 12px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #F1F5F9" }} className="group">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                      <p style={{ fontSize: 10, color: "#94A3B8", margin: 0, fontFamily: "monospace" }}>{c.cnpj}</p>
                    </div>
                    <button type="button" onClick={() => delCompany.mutate(c.id)} disabled={delCompany.isPending}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", flexShrink: 0 }}
                      className="hover:bg-red-50 hover:!text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: "12px 18px", borderTop: "1px solid #F1F5F9", background: "#FAFBFF", flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Adicionar empresa</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nome</label>
                <Input value={manName} onChange={e => setManName(e.target.value)} placeholder="Nome Fantasia"
                  className="h-[34px] text-[12px] border-slate-200 rounded-lg bg-white" />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>CNPJ</label>
                <CnpjInput value={manCnpj} onChange={setManCnpj} name="manCnpj" className="h-[34px] text-[12px] border-slate-200 rounded-lg bg-white" />
              </div>
            </div>
            <button type="button" onClick={async () => {
              if (!manName.trim() || !validateCnpj(manCnpj)) return;
              const exists = companies.some(c => c.cnpj.replace(/\D/g, "") === manCnpj.replace(/\D/g, ""));
              if (exists) { toast({ title: "CNPJ já cadastrado.", variant: "destructive" }); return; }
              await addCompany.mutateAsync({ name: manName.trim(), cnpj: manCnpj });
              setManName(""); setManCnpj("");
              toast({ title: "Empresa cadastrada." });
            }} disabled={!manName.trim() || !validateCnpj(manCnpj) || addCompany.isPending}
              style={{
                height: 33, padding: "0 14px", borderRadius: 7, border: "none",
                background: "#059669", color: "white", fontSize: 12, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
                opacity: !manName.trim() || !validateCnpj(manCnpj) ? 0.4 : 1,
              }}>
              <Plus size={12} /> Cadastrar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
