import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
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
}).superRefine((d, ctx) => {
  // Datas chegam como "YYYY-MM-DD": a comparação lexicográfica já é cronológica
  // e não sofre com o deslocamento de fuso de new Date("YYYY-MM-DD").
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "A data fim não pode ser anterior à data início." });
  }
});
type EventFormData = z.infer<typeof eventSchema>;

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
}

// Shared input class — borderless, brand-soft bg, ring on focus
const IC = "h-11 text-[13px] rounded-lg border-0 bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0 px-4";
// Label padrão dos campos do modal
const LABEL = "block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]";
const LABEL_SM = "block mb-[5px] text-[10px] font-bold text-slate-400 uppercase tracking-[0.07em]";
const REQ = <span className="text-destructive">*</span>;

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

  const errMsg = (err: any, fallback: string) =>
    err?.status === 401 ? "Sua sessão expirou. Entre novamente para continuar."
    : err?.status === 403 ? "Você não tem permissão para esta ação."
    : err?.body?.message || fallback;

  const addCompany = useMutation({
    mutationFn: (d: { name: string; cnpj: string }) => apiRequest("POST", "/api/payment-companies", d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/payment-companies"] }),
    onError: (err: any) => toast({ title: "Erro ao salvar empresa", description: errMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const delCompany = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payment-companies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-companies"] }); toast({ title: "Empresa removida." }); },
    onError: (err: any) => toast({ title: "Erro ao remover empresa", description: errMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: "onBlur",
    defaultValues: { name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "TATICA MARKETING ESPORTIVO LTDA", paymentCompanyCnpj: "06.103.531/0001-96" },
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
      form.reset({ name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "TATICA MARKETING ESPORTIVO LTDA", paymentCompanyCnpj: "06.103.531/0001-96" });
      setObsLen(0);
    }
    // `open` na lista: garante que reabrir o modal para o MESMO evento recarregue
    // os valores salvos em vez de manter uma edição abandonada.
  }, [event, open]);

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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/events"] }),
        qc.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] }),
      ]);
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro ao salvar evento", description: errMsg(e, "Tente novamente."), variant: "destructive" }),
  });

  const handleClose = () => { form.reset(); setObsLen(0); setShowSugg(false); setShowManage(false); onClose(); };
  const onSubmit = (d: EventFormData) => saveEvent.mutate(d);
  // Sem isto, um erro de validação em campo sem <FormMessage> (ex.: status legado)
  // fazia o botão "Salvar" não responder, sem nenhum aviso ao usuário.
  const onInvalid = () => toast({ title: "Verifique os campos destacados.", description: "Há informações obrigatórias ou inválidas no formulário.", variant: "destructive" });
  const pickCompany = (c: PaymentCompany) => { form.setValue("paymentCompanyName", c.name, { shouldDirty: true }); form.setValue("paymentCompanyCnpj", c.cnpj, { shouldDirty: true }); setShowSugg(false); };

  const canAddCompany = !!manName.trim() && validateCnpj(manCnpj) && !addCompany.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
        <DialogContent className="p-0 gap-0 sm:max-w-[560px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[92vh]"
          data-testid="modal-event">

          {/* ── Header ── */}
          <div className="flex items-center justify-between shrink-0 px-5 sm:px-7 py-5 border-b border-border bg-card">
            <div className="flex items-center gap-3.5">
              <div className="flex items-center justify-center w-[42px] h-[42px] rounded-xl bg-primary text-primary-foreground shrink-0 shadow-md shadow-primary/30">
                <span className="material-symbols-outlined text-[21px] [font-variation-settings:'FILL'_1]">
                  {isEditing ? "edit_calendar" : "event_upcoming"}
                </span>
              </div>
              <DialogTitle className="text-lg font-extrabold text-foreground tracking-tight m-0">
                {isEditing ? "Editar Evento" : "Novo Evento"}
              </DialogTitle>
            </div>
            <button type="button" onClick={handleClose} aria-label="Fechar"
              className="flex items-center justify-center w-[34px] h-[34px] rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6">
            <Form {...form}>
              <form id="event-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
                <div className="flex flex-col gap-5">

                  {/* Nome + Local (2 cols) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <div>
                        <label htmlFor="event-name" className={LABEL}>Nome do Evento {REQ}</label>
                        <Input id="event-name" placeholder="Ex: Rock in Rio 2025" data-testid="input-event-name" className={IC} {...field} />
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />
                    <FormField control={form.control} name="location" render={({ field }) => (
                      <div>
                        <label htmlFor="event-location" className={LABEL}>Local {REQ}</label>
                        <Input id="event-location" placeholder="Ex: Rio de Janeiro, RJ" data-testid="input-event-location" className={IC} {...field} />
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />
                  </div>

                  {/* Datas (2 cols) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="startDate" render={({ field }) => (
                      <div>
                        <label htmlFor="event-start-date" className={LABEL}>Início {REQ}</label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-300 pointer-events-none">calendar_today</span>
                          <Input id="event-start-date" type="date" data-testid="input-event-start-date" className={IC} {...field} />
                        </div>
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />
                    <FormField control={form.control} name="endDate" render={({ field }) => (
                      <div>
                        <label htmlFor="event-end-date" className={LABEL}>Fim {REQ}</label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-300 pointer-events-none">calendar_today</span>
                          <Input id="event-end-date" type="date" min={form.watch("startDate") || undefined} data-testid="input-event-end-date" className={IC} {...field} />
                        </div>
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />
                  </div>

                  {/* Status (só edição) */}
                  {isEditing && (
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <div>
                        <label htmlFor="event-status" className={LABEL}>Status</label>
                        <select id="event-status" value={field.value ?? ""} onChange={e => field.onChange(e.target.value)} data-testid="select-event-status"
                          className="h-11 w-full text-[13px] px-3.5 border-0 rounded-lg bg-brand-soft text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/25">
                          <option value="planejado">Planejado</option>
                          <option value="concluído">Concluído</option>
                          <option value="excluído">Excluído</option>
                        </select>
                        <FormMessage className="text-[11px] mt-1" />
                      </div>
                    )} />
                  )}

                  {/* Espelho Operacional (só edição) */}
                  {isEditing && event && (
                    <a
                      href={`/operational-mirror?eventId=${event.id}`}
                      data-testid="link-operational-mirror"
                      className="flex items-center justify-center gap-2 h-11 text-[13px] font-bold text-primary bg-brand-soft border border-primary/15 rounded-lg no-underline hover:bg-primary/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">table_view</span>
                      Abrir Espelho Operacional
                    </a>
                  )}

                  {/* ── Empresa Pagadora ── */}
                  <div className="bg-muted/40 rounded-xl px-4 sm:px-[18px] py-4 border border-border/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100">
                          <span className="material-symbols-outlined text-lg text-emerald-600 [font-variation-settings:'FILL'_1]">account_balance</span>
                        </div>
                        <span className="text-[13px] font-bold text-slate-700">Empresa Pagadora</span>
                        {isSaved && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-[0.05em]">Salva</span>}
                        {isNew   && <span className="text-[10px] font-bold text-primary bg-brand-soft px-2 py-0.5 rounded-full uppercase tracking-[0.05em]">Nova</span>}
                        {!isSaved && !isNew && <span className="text-[10px] text-slate-400 italic">opcional</span>}
                      </div>
                      <button type="button" onClick={() => setShowManage(true)}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary bg-card border border-primary/15 rounded-md px-3 py-[5px] hover:bg-brand-soft transition-colors">
                        Gerenciar{companies.length > 0 ? ` (${companies.length})` : ""}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2.5">
                      <FormField control={form.control} name="paymentCompanyName" render={({ field }) => (
                        <div>
                          <label htmlFor="event-company-name" className={LABEL_SM}>Nome da Empresa</label>
                          <FormControl>
                            <div className="relative">
                              <input id="event-company-name" placeholder="Digite para buscar..." autoComplete="off"
                                role="combobox" aria-expanded={showSugg && filtered.length > 0} aria-autocomplete="list"
                                className="h-[38px] w-full text-[13px] px-3 border border-input rounded-lg bg-card text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/25 placeholder:text-muted-foreground"
                                {...field}
                                ref={nameRef}
                                onFocus={() => setShowSugg(true)}
                                onChange={e => { field.onChange(e); setShowSugg(true); }} />
                              {showSugg && filtered.length > 0 && (
                                <div ref={suggRef} className="absolute z-[60] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-[10px] shadow-lg overflow-hidden">
                                  {filtered.map(c => (
                                    <button key={c.id} type="button" onMouseDown={e => { e.preventDefault(); pickCompany(c); }}
                                      className="w-full text-left px-3.5 py-[9px] border-b border-border/50 last:border-b-0 hover:bg-brand-soft transition-colors">
                                      <p className="text-xs font-semibold text-foreground m-0">{c.name}</p>
                                      <p className="text-[10px] text-slate-400 m-0 font-mono">{c.cnpj}</p>
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
                          <label htmlFor="event-company-cnpj" className={LABEL_SM}>CNPJ</label>
                          <FormControl>
                            <CnpjInput id="event-company-cnpj" value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name}
                              className="h-[38px] text-[13px] border-input rounded-lg bg-card" />
                          </FormControl>
                          <FormMessage className="text-[10px] mt-1" />
                        </div>
                      )} />
                    </div>
                  </div>

                  {/* ── Observações ── */}
                  <FormField control={form.control} name="observations" render={({ field }) => (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="event-observations" className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">
                          Observações <span className="text-slate-300 font-normal normal-case">· opcional</span>
                        </label>
                        <span className="text-[10px] text-slate-300">{obsLen}/500</span>
                      </div>
                      <FormControl>
                        <Textarea id="event-observations" rows={3} maxLength={500} placeholder="Notas adicionais, requisitos específicos..."
                          data-testid="textarea-event-observations"
                          className="text-[13px] resize-none rounded-lg border-0 bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0 px-4 py-3"
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
          <div className="flex items-center justify-end gap-2.5 shrink-0 px-5 sm:px-7 py-4 border-t border-border bg-muted/30">
            <Button type="button" variant="ghost" onClick={handleClose} data-testid="button-cancel-event" className="h-[38px] px-[18px] text-[13px] font-bold text-slate-500 hover:text-foreground">
              Cancelar
            </Button>
            <Button type="submit" form="event-form" disabled={saveEvent.isPending} data-testid="button-save-event"
              className="h-[38px] px-[22px] text-[13px] font-bold shadow-md shadow-primary/30 hover:bg-primary-hover disabled:shadow-none">
              {saveEvent.isPending
                ? <><Loader2 size={13} className="animate-spin" /> Salvando...</>
                : <><Check size={13} strokeWidth={3} /> {isEditing ? "Salvar Alterações" : "Criar Evento"}</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Gerenciar empresas ── */}
      <Dialog open={showManage} onOpenChange={v => { setShowManage(v); if (!v) { setManName(""); setManCnpj(""); } }}>
        <DialogContent className="p-0 gap-0 sm:max-w-[420px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden flex flex-col max-h-[80vh]">

          <div className="flex items-center gap-2.5 shrink-0 px-[18px] py-3.5 border-b border-border">
            <span className="material-symbols-outlined text-[15px] text-emerald-600 [font-variation-settings:'FILL'_1]">account_balance</span>
            <DialogTitle className="text-sm font-extrabold text-foreground m-0">Empresas Salvas</DialogTitle>
            <span className="text-[11px] font-bold bg-muted text-slate-400 px-[7px] py-px rounded-[10px]">{companies.length}</span>
            <button type="button" onClick={() => setShowManage(false)} aria-label="Fechar empresas salvas"
              className="ml-auto flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 transition-colors"><X size={14} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-[18px] py-2.5">
            {companies.length === 0 ? (
              <div className="text-center py-7 text-slate-300">
                <span className="material-symbols-outlined text-[30px] block mb-2">account_balance</span>
                <p className="text-xs m-0">Nenhuma empresa cadastrada.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-[5px]">
                {companies.map(c => (
                  <div key={c.id} className="group flex items-center px-3 py-[9px] rounded-lg bg-muted/40 border border-border/60">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground m-0 truncate">{c.name}</p>
                      <p className="text-[10px] text-slate-400 m-0 font-mono">{c.cnpj}</p>
                    </div>
                    <button type="button" onClick={() => delCompany.mutate(c.id)} disabled={delCompany.isPending}
                      aria-label={`Remover empresa ${c.name}`}
                      className="flex items-center justify-center w-[26px] h-[26px] rounded-md text-slate-300 shrink-0 hover:bg-red-50 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-40">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 px-[18px] py-3 border-t border-border bg-muted/30">
            <p className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.07em] mb-2">Adicionar empresa</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <div>
                <label htmlFor="manage-company-name" className="block mb-[3px] text-[10px] font-bold text-slate-400 uppercase tracking-[0.06em]">Nome</label>
                <Input id="manage-company-name" value={manName} onChange={e => setManName(e.target.value)} placeholder="Nome Fantasia"
                  className="h-[34px] text-xs border-input rounded-lg bg-card" />
              </div>
              <div>
                <label htmlFor="manage-company-cnpj" className="block mb-[3px] text-[10px] font-bold text-slate-400 uppercase tracking-[0.06em]">CNPJ</label>
                <CnpjInput id="manage-company-cnpj" value={manCnpj} onChange={setManCnpj} name="manCnpj" className="h-[34px] text-xs border-input rounded-lg bg-card" />
              </div>
            </div>
            <button type="button" onClick={async () => {
              if (!canAddCompany) return;
              const exists = companies.some(c => c.cnpj.replace(/\D/g, "") === manCnpj.replace(/\D/g, ""));
              if (exists) { toast({ title: "CNPJ já cadastrado.", variant: "destructive" }); return; }
              // Sem o try/catch a falha virava unhandled rejection (o toast de erro
              // vem do onError da mutação) e o "Empresa cadastrada." nunca aparecia.
              try {
                await addCompany.mutateAsync({ name: manName.trim(), cnpj: manCnpj });
                setManName(""); setManCnpj("");
                toast({ title: "Empresa cadastrada." });
              } catch { /* onError da mutação já notifica */ }
            }} disabled={!canAddCompany}
              className={cn(
                "flex items-center gap-[5px] h-[33px] px-3.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}>
              {addCompany.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Cadastrar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
