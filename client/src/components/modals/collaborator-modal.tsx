import { useForm } from "react-hook-form";
import { formatarCep } from "@shared/endereco";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { hasRole } from "@/lib/role-utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { avisarAgenda } from "@/hooks/use-vaga-acoes";
import type { Event, Function, Collaborator } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import AttachmentUpload from "@/components/ui/attachment-upload";
import {
  X, Check, Phone, MapPin, Calendar, FileText, Home, User, Briefcase, Loader2, UserPlus, Edit, AlertTriangle
} from "lucide-react";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { OptionalMark, RequiredMark } from "@/components/forms/required-mark";

// ─── CPF validation ─────────────────────────────────────────────────────────
// Exportado para a tela de Colaboradores reutilizar na aprovação (mesma regra).
export const validateCPF = (cpf: string): boolean => {
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
function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Schema ─────────────────────────────────────────────────────────────────
// `comDadosPessoais = false` é a EDIÇÃO por quem não recebe documento, nascimento,
// telefone e endereço do servidor (Logística / Área de Função — projeção do GET
// /api/collaborators, 23/09): esses campos nem aparecem na tela, então não podem
// ser obrigatórios — senão o formulário trava num CPF que a pessoa não vê.
// Cadastro NOVO continua exigindo tudo, para qualquer papel (o servidor exige).
function criarSchema(comDadosPessoais: boolean) {
  return z.object({
    fullName:            z.string().min(1, "Nome completo é obrigatório"),
    cpf:                 comDadosPessoais
      ? z.string().min(1, "CPF é obrigatório").refine(validateCPF, { message: "CPF inválido" })
      : z.string().optional(),
    rg:                  z.string().optional(),
    documentAttachmentId: comDadosPessoais ? z.string().min(1, "Documento é obrigatório") : z.string().optional(),
    birthDate:           comDadosPessoais ? z.string().min(1, "Data de nascimento é obrigatória") : z.string().optional(),
    type:                z.string().min(1, "Tipo é obrigatório"),
    phone:               z.string().optional(),
    city:                z.string().min(1, "Cidade é obrigatória"),
    // Endereço (22/09) — tudo opcional; CEP, quando preenchido, com 8 números.
    addressStreet:       z.string().optional(),
    addressNumber:       z.string().optional(),
    addressComplement:   z.string().optional(),
    addressZip:          z.string().optional().refine((v) => !v || formatarCep(v) !== null, { message: "CEP inválido — informe os 8 números" }),
    actualStartDate:     z.string().optional(),
    actualEndDate:       z.string().optional(),
    eventId:             z.string().optional(),
    functionId:          z.string().optional(),
  });
}

type CollaboratorFormData = z.infer<ReturnType<typeof criarSchema>>;

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

const INPUT_CLS = "h-10 text-sm border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-ring/20 transition-all";
const LBL = "text-2xs font-bold text-muted-foreground uppercase tracking-wide";
// Um padrão só de obrigatório/opcional em todos os formulários (23/09).
const REQ = <RequiredMark />;
const OPT = <OptionalMark />;

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

  // Quem vê dados pessoais (mesma lista do servidor): admin, Compras e RH.
  const podeVerDadosPessoais = hasRole(user, "admin", "purchasing", "financial");
  // Na edição, quem não recebeu documento/nascimento/telefone/endereço não pode
  // vê-los nem reenviá-los — o PATCH sobrescreveria o CPF com "". Cadastro novo
  // mostra tudo para todos (o servidor exige os campos).
  const mostrarDadosPessoais = !isEdit || podeVerDadosPessoais;
  const collaboratorSchema = useMemo(() => criarSchema(mostrarDadosPessoais), [mostrarDadosPessoais]);

  const form = useForm<CollaboratorFormData>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      fullName: "", cpf: "", rg: "", documentAttachmentId: "",
      birthDate: "", type: "", phone: "", city: "",
      addressStreet: "", addressNumber: "", addressComplement: "", addressZip: "",
      actualStartDate: "", actualEndDate: "", eventId: "", functionId: "",
    },
  });

  useEffect(() => {
    if (open && isEdit && collaborator) {
      // Os campos pessoais podem nem existir no objeto (projeção por papel):
      // `?.`/`||` cobrem os dois casos, e sem permissão ficam vazios na tela.
      let cpfValue = "", rgValue = "";
      if (mostrarDadosPessoais) {
        if (collaborator.documentType === "cpf") { cpfValue = collaborator.officialDocument || ""; rgValue = collaborator.secondaryDocument || ""; }
        else if (collaborator.documentType === "rg") { rgValue = collaborator.officialDocument || ""; cpfValue = collaborator.secondaryDocument || ""; }
      }
      const attachmentIds = mostrarDadosPessoais && collaborator.documentAttachmentId ? [collaborator.documentAttachmentId] : [];
      setDocumentAttachments(attachmentIds);
      form.reset({
        fullName: collaborator.fullName || "", cpf: cpfValue, rg: rgValue,
        documentAttachmentId: attachmentIds[0] || "",
        birthDate: mostrarDadosPessoais ? (collaborator.birthDate || "") : "",
        type: collaborator.type || "",
        phone: mostrarDadosPessoais ? (collaborator.phone || "") : "",
        city: collaborator.city || "",
        addressStreet: mostrarDadosPessoais ? (collaborator.addressStreet || "") : "",
        addressNumber: mostrarDadosPessoais ? (collaborator.addressNumber || "") : "",
        addressComplement: mostrarDadosPessoais ? (collaborator.addressComplement || "") : "",
        addressZip: mostrarDadosPessoais ? (collaborator.addressZip || "") : "",
        actualStartDate: "", actualEndDate: "", eventId: "", functionId: "",
      });
    } else if (open && !isEdit) {
      setDocumentAttachments([]);
      form.reset({ fullName: "", cpf: "", rg: "", documentAttachmentId: "", birthDate: "", type: "", phone: "", city: "", addressStreet: "", addressNumber: "", addressComplement: "", addressZip: "", actualStartDate: "", actualEndDate: "", eventId: "", functionId: "" });
    }
  }, [open, isEdit, collaborator, form, mostrarDadosPessoais]);

  const collaboratorMutation = useMutation({
    mutationFn: async (data: CollaboratorFormData) => {
      // Só vai no payload o que está na tela: sem a seção de dados pessoais,
      // nenhum campo dela é enviado (o PATCH manteria o CPF gravado).
      const collaboratorData: Record<string, unknown> = {
        fullName: data.fullName,
        type: data.type,
        city: data.city,
      };
      if (mostrarDadosPessoais) {
        Object.assign(collaboratorData, {
          officialDocument: data.cpf,
          documentType: "cpf",
          secondaryDocument: data.rg || null,
          secondaryDocumentType: data.rg ? "rg" : null,
          documentAttachmentId: data.documentAttachmentId,
          birthDate: data.birthDate,
          phone: data.phone,
          // Endereço (22/09): o servidor limpa, padroniza o CEP e guarda vazio como null.
          addressStreet: data.addressStreet ?? "",
          addressNumber: data.addressNumber ?? "",
          addressComplement: data.addressComplement ?? "",
          addressZip: data.addressZip ?? "",
        });
      }

      // apiRequest já lança em resposta não-ok (com .status e .body no erro).
      const response = isEdit && collaborator
        ? await apiRequest("PATCH", `/api/collaborators/${collaborator.id}`, collaboratorData)
        : await apiRequest("POST", "/api/collaborators", collaboratorData);

      const result = await response.json();

      if (isEmergency && data.actualStartDate && data.actualEndDate && data.eventId && data.functionId) {
        const diffMs = Math.abs(new Date(data.actualEndDate).getTime() - new Date(data.actualStartDate).getTime());
        const dailyRates = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
        // Status/fase são decididos pelo servidor (24/09): a vaga nasce
        // planejado/inclusao e o restante do fluxo vem das rotas dedicadas.
        const vaga = await (await apiRequest("POST", "/api/team-inclusions", {
          eventId: data.eventId, functionId: data.functionId, collaboratorId: result.id,
          area: defaultArea || user?.area || "Emergencial",
          scheduleStartDate: data.actualStartDate, scheduleEndDate: data.actualEndDate,
          actualStartDate: data.actualStartDate, actualEndDate: data.actualEndDate,
          dailyRates, actualDailyRates: dailyRates, dailyValue: 0,
          needsTicket: false, needsAccommodation: false,
          emergencyRecord: true,
          observations: "Colaborador emergencial adicionado durante a hospedagem",
        })).json() as { avisosDeAgenda?: unknown };
        // Duas viagens no mesmo dia: aviso, não erro — a vaga foi criada.
        avisarAgenda(toast, vaga?.avisosDeAgenda);
      }

      return result;
    },
    onSuccess: () => {
      toast({ variant: "success", title: isEdit ? "Colaborador atualizado" : isEmergency ? "Colaborador emergencial criado" : "Colaborador criado" });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      onClose();
    },
    onError: (err: unknown) => {
      // 409 (24/09) = documento já cadastrado: a mensagem do servidor diz de
      // quem é; 401/403 têm texto próprio em apiErrorMessage.
      const status = (err as { status?: number } | null)?.status;
      toast({
        title: status === 409 ? "Colaborador já cadastrado" : "Erro",
        description: status === 403 ? "Você não tem permissão para salvar colaboradores." : apiErrorMessage(err, "Erro ao salvar colaborador"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CollaboratorFormData) => collaboratorMutation.mutate(data);
  // "Descartar alterações?" (23/09): Esc e clique fora chamavam `form.reset()` e
  // jogavam fora o que foi digitado, sem perguntar. `isDirty` cobre também o
  // anexo (o id do documento é um campo do formulário).
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(form.formState.isDirty, { salvando: collaboratorMutation.isPending });
  const handleClose = () => pedirParaFechar(() => { form.reset(); onClose(); });


  const modalTitle = isEdit ? "Editar colaborador" : isEmergency ? "Colaborador emergencial" : "Novo colaborador";

  // Cidade muda de linha conforme a seção de dados pessoais existe ou não.
  const cidadeField = (
    <FormField control={form.control} name="city" render={({ field }) => (
      <FormItem>
        <FormLabel className={LBL}>Cidade{REQ}</FormLabel>
        <FormControl>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <Input placeholder="São Paulo – SP" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-city" {...field} />
          </div>
        </FormControl>
        <FormMessage className="text-2xs" />
      </FormItem>
    )} />
  );

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent
        className="p-0 gap-0 sm:max-w-[600px] rounded-xl border-0 shadow-3 overflow-hidden [&>button:last-child]:hidden max-h-[90vh] flex flex-col"
        data-testid="modal-collaborator"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary text-primary-foreground shadow-2">
            {isEdit
              ? <Edit className="w-4 h-4" aria-hidden="true" />
              : <UserPlus className="w-4 h-4" aria-hidden="true" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground">{modalTitle}</h2>
            {isEdit && collaborator && (
              <p className="text-2xs text-muted-foreground mt-0.5 truncate">Editando: {toTitleCase(collaborator.fullName)}</p>
            )}
            {(eventName || functionName || defaultArea) && (
              <div className="text-2xs text-muted-foreground mt-0.5 space-x-2 truncate">
                {eventName    && <span><span className="font-medium">Evento:</span> {eventName}</span>}
                {functionName && <span><span className="font-medium">Função:</span> {functionName}</span>}
                {defaultArea  && <span><span className="font-medium">Área:</span> {defaultArea}</span>}
              </div>
            )}
          </div>
          <button type="button" onClick={handleClose} aria-label="Fechar" className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-slate-600 hover:bg-muted transition-colors">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                const msgs = Object.values(errors).map(e => e?.message).filter(Boolean).join(", ");
                toast({ title: "Campos obrigatórios", description: msgs || "Verifique os campos do formulário", variant: "destructive" });
              })}
              className="space-y-4"
              id="collaborator-form"
            >
              {/* Row 1: Nome (2/3) + CPF (1/3) — sem dados pessoais, o nome ocupa a linha */}
              <div className="grid grid-cols-3 gap-3">
                <div className={mostrarDadosPessoais ? "col-span-2" : "col-span-3"}>
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LBL}>Nome completo{REQ}</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo do colaborador" className={INPUT_CLS} data-testid="input-collaborator-name" {...field} />
                      </FormControl>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>
                {mostrarDadosPessoais && <div>
                  <FormField control={form.control} name="cpf" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LBL}>CPF{REQ}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                          <Input placeholder="000.000.000-00" className={`${INPUT_CLS} pl-9 font-mono`} data-testid="input-collaborator-cpf" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>}
              </div>

              {/* Row 2: RG (1/3) + Data Nasc (1/3) + Tipo (1/3) — sem dados pessoais: Tipo + Cidade */}
              <div className={mostrarDadosPessoais ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
                {mostrarDadosPessoais && <div>
                  <FormField control={form.control} name="rg" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LBL}>RG{OPT}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                          <Input placeholder="00.000.000-0" className={`${INPUT_CLS} pl-9 font-mono`} data-testid="input-collaborator-rg" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>}
                {mostrarDadosPessoais && <div>
                  <FormField control={form.control} name="birthDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LBL}>Nascimento{REQ}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                          <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-birth-date" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>}
                <div>
                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LBL}>Tipo{REQ}</FormLabel>
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
                                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span>{opt.label}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>
                {!mostrarDadosPessoais && cidadeField}
              </div>

              {/* Row 3: Telefone (1/2) + Cidade (1/2) — só com dados pessoais (a cidade já subiu) */}
              {mostrarDadosPessoais && <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LBL}>Telefone{OPT}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                        <Input placeholder="(11) 99999-9999" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-phone" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-2xs" />
                  </FormItem>
                )} />
                {cidadeField}
              </div>}

              {/* Endereço (22/09) — opcional. Rótulos VISÍVEIS (23/09): só o
                  placeholder dizia o que era cada campo e ele some ao digitar. */}
              {mostrarDadosPessoais && <div className="space-y-3">
                <p className={LBL}>Endereço{OPT}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <FormField control={form.control} name="addressStreet" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LBL}>Rua</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                            <Input placeholder="Rua / avenida" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-address-street" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="addressNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LBL}>Número</FormLabel>
                      <FormControl>
                        <Input placeholder="Número" className={INPUT_CLS} data-testid="input-collaborator-address-number" {...field} />
                      </FormControl>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <FormField control={form.control} name="addressComplement" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LBL}>Complemento</FormLabel>
                        <FormControl>
                          <Input placeholder="Complemento (apto, bloco, fundos…)" className={INPUT_CLS} data-testid="input-collaborator-address-complement" {...field} />
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="addressZip" render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LBL}>CEP</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="CEP"
                          inputMode="numeric"
                          className={`${INPUT_CLS} font-mono`}
                          data-testid="input-collaborator-address-zip"
                          {...field}
                          // Sai do campo já no formato 00000-000 quando tem os 8 números.
                          onBlur={(e) => { const f = formatarCep(e.target.value); if (f) field.onChange(f); field.onBlur(); }}
                        />
                      </FormControl>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>
              </div>}

              {/* Document upload — junto com os demais dados pessoais */}
              {mostrarDadosPessoais && <div className="border-t border-border pt-4">
                <FormField control={form.control} name="documentAttachmentId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LBL}>Documento (CPF/RG){REQ}</FormLabel>
                    <FormControl>
                      <AttachmentUpload
                        attachmentIds={documentAttachments}
                        onAttachmentsChange={(ids) => { setDocumentAttachments(ids); field.onChange(ids[0] || ""); }}
                        title="Anexar documento"
                      />
                    </FormControl>
                    <FormMessage className="text-2xs" />
                  </FormItem>
                )} />
              </div>}

              {/* Emergency section */}
              {isEmergency && (
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-warning-soft flex items-center justify-center">
                      <AlertTriangle className="w-3 h-3 text-warning-strong" aria-hidden="true" />
                    </div>
                    <p className={LBL}>Informações do trabalho emergencial</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="eventId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LBL}>Evento{REQ}</FormLabel>
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
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="functionId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LBL}>Função{REQ}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={INPUT_CLS} data-testid="select-emergency-function"><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {functions?.map(fn => <SelectItem key={fn.id} value={fn.id}>{fn.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="actualStartDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LBL}>Início{REQ}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                            <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-emergency-start-date" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="actualEndDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LBL}>Fim{REQ}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                            <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-emergency-end-date" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}
            </form>
          </Form>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border bg-surface-muted/50 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-2xs text-muted-foreground">Campos marcados com<RequiredMark /> são obrigatórios</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleClose} data-testid="button-cancel-collaborator"
                className="h-9 px-4 text-xs font-medium text-slate-600 border border-border rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                form="collaborator-form"
                disabled={collaboratorMutation.isPending}
                data-testid="button-save-collaborator"
                className="flex items-center gap-1.5 h-9 px-5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-lg shadow-1 transition-all disabled:opacity-60"
              >
                {collaboratorMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Salvando…</>
                  : <><Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> {isEdit ? "Atualizar" : "Salvar colaborador"}</>
                }
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {DialogoDescarte}
    </>
  );
}
