import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event, Function, Collaborator } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import AttachmentUpload from "@/components/ui/attachment-upload";
import {
  X, Check, Phone, MapPin, Calendar, FileText, Home, User, Briefcase
} from "lucide-react";

// ─── CPF validation ─────────────────────────────────────────────────────────
const validateCPF = (cpf: string): boolean => {
  cpf = cpf.replace(/[^\d]/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0, rem;
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf[i - 1]) * (11 - i);
  rem = (sum * 10) % 11; if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf[i - 1]) * (12 - i);
  rem = (sum * 10) % 11; if (rem === 10 || rem === 11) rem = 0;
  return rem === parseInt(cpf[10]);
};

// ─── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-600", "bg-amber-500", "bg-rose-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Schema ─────────────────────────────────────────────────────────────────
const collaboratorSchema = z.object({
  fullName:            z.string().min(1, "Nome completo é obrigatório"),
  cpf:                 z.string().min(1, "CPF é obrigatório").refine(validateCPF, { message: "CPF inválido" }),
  rg:                  z.string().optional(),
  documentAttachmentId:z.string().min(1, "Documento é obrigatório"),
  birthDate:           z.string().min(1, "Data de nascimento é obrigatória"),
  type:                z.string().min(1, "Tipo é obrigatório"),
  phone:               z.string().optional(),
  city:                z.string().min(1, "Cidade é obrigatória"),
  actualStartDate:     z.string().optional(),
  actualEndDate:       z.string().optional(),
  eventId:             z.string().optional(),
  functionId:          z.string().optional(),
});

type CollaboratorFormData = z.infer<typeof collaboratorSchema>;

interface CollaboratorModalProps {
  open: boolean;
  onClose: () => void;
  defaultArea?: string;
  eventName?: string;
  functionName?: string;
  isEmergency?: boolean;
  collaborator?: Collaborator | null;
  isEdit?: boolean;
}

const INPUT_CLS = "h-10 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all";

const TYPE_OPTIONS = [
  { value: "casa",   label: "Casa",   icon: Home },
  { value: "freela", label: "Freela", icon: User },
  { value: "local",  label: "Local",  icon: Briefcase },
];

export default function CollaboratorModal({
  open, onClose, defaultArea, eventName, functionName,
  isEmergency = false, collaborator = null, isEdit = false
}: CollaboratorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"], enabled: isEmergency });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"], enabled: isEmergency });
  const [documentAttachments, setDocumentAttachments] = useState<string[]>([]);

  const form = useForm<CollaboratorFormData>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      fullName: "", cpf: "", rg: "", documentAttachmentId: "",
      birthDate: "", type: "", phone: "", city: "",
      actualStartDate: "", actualEndDate: "", eventId: "", functionId: "",
    },
  });

  useEffect(() => {
    if (open && isEdit && collaborator) {
      let cpfValue = "", rgValue = "";
      if (collaborator.documentType === "cpf") { cpfValue = collaborator.officialDocument || ""; rgValue = collaborator.secondaryDocument || ""; }
      else if (collaborator.documentType === "rg") { rgValue = collaborator.officialDocument || ""; cpfValue = collaborator.secondaryDocument || ""; }
      const attachmentIds = collaborator.documentAttachmentId ? [collaborator.documentAttachmentId] : [];
      setDocumentAttachments(attachmentIds);
      form.reset({ fullName: collaborator.fullName || "", cpf: cpfValue, rg: rgValue, documentAttachmentId: collaborator.documentAttachmentId || "", birthDate: collaborator.birthDate || "", type: collaborator.type || "", phone: collaborator.phone || "", city: collaborator.city || "", actualStartDate: "", actualEndDate: "", eventId: "", functionId: "" });
    } else if (open && !isEdit) {
      setDocumentAttachments([]);
      form.reset({ fullName: "", cpf: "", rg: "", documentAttachmentId: "", birthDate: "", type: "", phone: "", city: "", actualStartDate: "", actualEndDate: "", eventId: "", functionId: "" });
    }
  }, [open, isEdit, collaborator, form]);

  const collaboratorMutation = useMutation({
    mutationFn: async (data: CollaboratorFormData) => {
      const collaboratorData: any = {
        fullName: data.fullName,
        officialDocument: data.cpf,
        documentType: "cpf",
        secondaryDocument: data.rg || null,
        secondaryDocumentType: data.rg ? "rg" : null,
        documentAttachmentId: data.documentAttachmentId,
        birthDate: data.birthDate,
        type: data.type,
        phone: data.phone,
        city: data.city,
        _userId: user?.id,
        _userRole: user?.role,
      };

      const response = isEdit && collaborator
        ? await apiRequest("PATCH", `/api/collaborators/${collaborator.id}`, collaboratorData)
        : await apiRequest("POST", "/api/collaborators", collaboratorData);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Erro desconhecido" }));
        throw new Error(err.message || "Erro ao salvar colaborador");
      }

      const result = await response.json();

      if (isEmergency && data.actualStartDate && data.actualEndDate && data.eventId && data.functionId) {
        const diffMs = Math.abs(new Date(data.actualEndDate).getTime() - new Date(data.actualStartDate).getTime());
        const dailyRates = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
        await apiRequest("POST", "/api/team-inclusions", {
          eventId: data.eventId, functionId: data.functionId, collaboratorId: result.id,
          area: defaultArea || user?.area || "Emergencial",
          scheduleStartDate: data.actualStartDate, scheduleEndDate: data.actualEndDate,
          actualStartDate: data.actualStartDate, actualEndDate: data.actualEndDate,
          dailyRates, actualDailyRates: dailyRates, dailyValue: 0,
          needsTicket: false, needsAccommodation: false,
          emergencyRecord: true, status: "hospedagem", phase: "hospedagem",
          observations: "Colaborador emergencial adicionado durante a hospedagem",
        });
      }

      return result;
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: isEdit ? "Colaborador atualizado com sucesso!" : isEmergency ? "Colaborador emergencial criado com sucesso" : "Colaborador criado com sucesso" });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message || "Erro ao salvar colaborador", variant: "destructive" });
    },
  });

  const onSubmit = (data: CollaboratorFormData) => collaboratorMutation.mutate(data);
  const handleClose = () => { form.reset(); onClose(); };

  const nameValue = form.watch("fullName");
  const showAvatar = isEdit && collaborator;

  const modalTitle = isEdit ? "Editar Colaborador" : isEmergency ? "Colaborador Emergencial" : "Novo Colaborador";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="p-0 gap-0 sm:max-w-[600px] rounded-2xl border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden max-h-[90vh] flex flex-col"
        data-testid="modal-collaborator"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            {showAvatar && (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatarColor(collaborator!.fullName)}`}>
                {initials(collaborator!.fullName)}
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-800">{modalTitle}</h2>
              {isEdit && collaborator && (
                <p className="text-[11px] text-slate-400 mt-0.5">Editando: {toTitleCase(collaborator.fullName)}</p>
              )}
              {(eventName || functionName || defaultArea) && (
                <div className="text-[11px] text-slate-400 mt-0.5 space-x-2">
                  {eventName   && <span><span className="font-medium">Evento:</span> {eventName}</span>}
                  {functionName && <span><span className="font-medium">Função:</span> {functionName}</span>}
                  {defaultArea && <span><span className="font-medium">Área:</span> {defaultArea}</span>}
                </div>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                const msgs = Object.values(errors).map(e => e?.message).filter(Boolean).join(", ");
                toast({ title: "Campos obrigatórios", description: msgs || "Verifique os campos do formulário", variant: "destructive" });
              })}
              className="space-y-4"
              id="collaborator-form"
            >
              {/* Row 1: Nome (2/3) + CPF (1/3) */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">Nome Completo <span className="text-red-400">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo do colaborador" className={INPUT_CLS} data-testid="input-collaborator-name" {...field} />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>
                <div>
                  <FormField control={form.control} name="cpf" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">CPF <span className="text-red-400">*</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <Input placeholder="000.000.000-00" className={`${INPUT_CLS} pl-9 font-mono`} data-testid="input-collaborator-cpf" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Row 2: RG (1/3) + Data Nasc (1/3) + Tipo (1/3) */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FormField control={form.control} name="rg" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">RG <span className="text-slate-400 font-normal">(opcional)</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <Input placeholder="00.000.000-0" className={`${INPUT_CLS} pl-9 font-mono`} data-testid="input-collaborator-rg" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>
                <div>
                  <FormField control={form.control} name="birthDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">Nascimento <span className="text-red-400">*</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                          <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-birth-date" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )} />
                </div>
                <div>
                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600">Tipo <span className="text-red-400">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className={INPUT_CLS} data-testid="select-collaborator-type">
                            <SelectValue placeholder="Selecionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {TYPE_OPTIONS.map(opt => {
                            const Icon = opt.icon;
                            return (
                              <SelectItem key={opt.value} value={opt.value} className="py-2">
                                <div className="flex items-center gap-2">
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
                  )} />
                </div>
              </div>

              {/* Row 3: Telefone (1/2) + Cidade (1/2) */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-600">Telefone <span className="text-slate-400 font-normal">(opcional)</span></FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <Input placeholder="(11) 99999-9999" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-phone" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )} />

                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-600">Cidade <span className="text-red-400">*</span></FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <Input placeholder="São Paulo – SP" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-city" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )} />
              </div>

              {/* Document upload */}
              <div className="border-t border-gray-100 pt-4">
                <FormField control={form.control} name="documentAttachmentId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-600">Documento (CPF/RG) <span className="text-red-400">*</span></FormLabel>
                    <FormControl>
                      <AttachmentUpload
                        attachmentIds={documentAttachments}
                        onAttachmentsChange={(ids) => { setDocumentAttachments(ids); field.onChange(ids[0] || ""); }}
                        title="Anexar Documento"
                      />
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )} />
              </div>

              {/* Emergency section */}
              {isEmergency && (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-600">Informações do Trabalho Emergencial</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="eventId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">Evento <span className="text-red-400">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={INPUT_CLS} data-testid="select-emergency-event"><SelectValue placeholder="Selecione o evento" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {events?.filter(e => e.status !== "excluido" && e.status !== "excluído").map(ev => (
                              <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="functionId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">Função <span className="text-red-400">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={INPUT_CLS} data-testid="select-emergency-function"><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {functions?.map(fn => <SelectItem key={fn.id} value={fn.id}>{fn.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="actualStartDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">Início <span className="text-red-400">*</span></FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-emergency-start-date" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="actualEndDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-slate-600">Fim <span className="text-red-400">*</span></FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-emergency-end-date" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}
            </form>
          </Form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400">Campos marcados com <span className="text-red-400">*</span> são obrigatórios</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleClose} data-testid="button-cancel-collaborator"
                className="px-4 py-2 text-xs font-medium text-slate-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                form="collaborator-form"
                disabled={collaboratorMutation.isPending}
                data-testid="button-save-collaborator"
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
              >
                {collaboratorMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Salvando...
                  </span>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    {isEdit ? "Atualizar Colaborador" : "Salvar Colaborador"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
