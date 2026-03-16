import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";
import { useEffect, useState } from "react";
import { X, MapPin, Calendar, Check, CalendarCheck, CalendarClock, Trash2, Building2 } from "lucide-react";
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
    if (!v || v.replace(/\D/g, "").length === 0) return true; // vazio = ok
    return validateCnpj(v);
  }, { message: "CNPJ inválido. Verifique os números digitados." }),
}).refine((data) => {
  return new Date(data.endDate) >= new Date(data.startDate);
}, {
  message: "Data de fim deve ser maior ou igual à data de início",
  path: ["endDate"],
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

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: "onBlur",
    defaultValues: { name: "", location: "", startDate: "", endDate: "", status: "planejado", observations: "", paymentCompanyName: "", paymentCompanyCnpj: "" },
  });

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

  const saveEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      if (isEditing && event) {
        return (await apiRequest("PUT", `/api/events/${event.id}`, data)).json();
      }
      return (await apiRequest("POST", "/api/events", data)).json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: isEditing ? "Evento atualizado com sucesso" : "Evento criado com sucesso" });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
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

  const handleClose = () => { form.reset(); setObsLength(0); onClose(); };
  const onSubmit = (data: EventFormData) => saveEventMutation.mutate(data);

  return (
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

              {/* Empresa responsável pelo pagamento */}
              <div className="border border-dashed border-emerald-200 rounded-xl p-4 bg-emerald-50/40 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">Empresa responsável pelo pagamento</span>
                  <span className="text-[10px] text-slate-400 font-normal">(opcional — usado nas Notas Fiscais)</span>
                </div>
                <FormField
                  control={form.control}
                  name="paymentCompanyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">Nome da empresa</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex.: Produtora Norte Ltda"
                          className={INPUT_CLS}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />
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

        {/* Footer — fora do scroll, sempre visível */}
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
  );
}
