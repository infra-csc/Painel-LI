import { useForm } from "react-hook-form";
import { formatarCep } from "@shared/endereco";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { hasRole } from "@/lib/role-utils";
import { ROLE_GROUPS } from "@shared/roles";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import {
  Check, Phone, MapPin, Calendar, FileText, Home, User, Briefcase, Loader2, UserPlus, PencilLine, AlertTriangle, IdCard, Paperclip,
} from "lucide-react";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { OptionalMark, RequiredMark } from "@/components/forms/required-mark";
import { toTitleCase as nomeFormatado } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Cadastro / edição de colaborador.
 *
 * 07/10 (redesenho): o formulário em três grupos com nome — Identificação,
 * Documentos (com o anexo junto, onde ele faz sentido) e Endereço — em
 * cartões sobre o fundo do modal, o desenho do registro de hospedagem.
 * Rótulos em caixa de frase, campo com erro em vermelho e o grupo com
 * pendência contado no título; no celular o modal ocupa a tela e os campos
 * empilham. Regras, validações e o que vai no payload: os mesmos de antes.
 */

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

// ─── Nome ───────────────────────────────────────────────────────────────────
// A regra única do app (`@/lib/format`): "MARIA DAS GRAÇAS" → "Maria das Graças".
function toTitleCase(str: string) {
  return nomeFormatado(str);
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

const INPUT_CLS = "h-10 text-sm bg-card border-input rounded-lg hover:border-slate-300 focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary transition-[border-color,box-shadow] aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/15";
const LBL = "text-xs font-medium text-slate-600";
/** Grupo do formulário: cartão sobre o fundo do modal; borda vermelha se tem pendência. */
const GRUPO = "col-secao rounded-xl border border-border bg-card p-4 data-[erro=true]:border-danger/40";
const TITULO_GRUPO = "m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5";
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
  const podeVerDadosPessoais = hasRole(user, ...ROLE_GROUPS.dadosPessoais);
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

  // Quantas pendências cada grupo tem — o título do grupo conta e a borda acende.
  const erros = form.formState.errors;
  const pendencias = (campos: (keyof CollaboratorFormData)[]) => campos.filter(k => !!erros[k]).length;
  const nIdent = pendencias(["fullName", "type", "city", "phone"]);
  const nDocs = pendencias(["cpf", "rg", "birthDate", "documentAttachmentId"]);
  const nEnd = pendencias(["addressStreet", "addressNumber", "addressComplement", "addressZip"]);
  const nEmerg = pendencias(["eventId", "functionId", "actualStartDate", "actualEndDate"]);
  const contagem = (n: number) => n > 0 && (
    <span className="col-entra ml-auto normal-case tracking-normal text-2xs font-medium text-danger">
      {n} {n === 1 ? "pendência" : "pendências"}
    </span>
  );

  /** Campo de texto com ícone à esquerda: o ícone fica FORA do FormControl, para o id, o aria-invalid e o rótulo irem para o input. */
  const comIcone = (Icone: typeof Phone, input: React.ReactNode) => (
    <div className="relative">
      <Icone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
      {input}
    </div>
  );

  const cidadeField = (
    <FormField control={form.control} name="city" render={({ field }) => (
      <FormItem className="space-y-1.5">
        <FormLabel className={LBL}>Cidade{REQ}</FormLabel>
        {comIcone(MapPin, (
          <FormControl>
            <Input placeholder="São Paulo - SP" autoComplete="off" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-city" {...field} />
          </FormControl>
        ))}
        <FormMessage className="text-2xs" />
      </FormItem>
    )} />
  );

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent aria-describedby={undefined}
        className="p-0 gap-0 sm:max-w-[680px] rounded-xl overflow-hidden max-h-[92vh] flex flex-col [&>button:last-child]:top-[18px] [&>button:last-child]:right-4 max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0"
        data-testid="modal-collaborator"
      >
        {/* Cabeçalho: o que é e de quem. */}
        <div className="flex items-start gap-3.5 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card shrink-0">
          <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-brand-soft text-primary">
            {isEdit
              ? <PencilLine className="w-5 h-5" aria-hidden="true" />
              : <UserPlus className="w-5 h-5" aria-hidden="true" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0">{modalTitle}</DialogTitle>
            {isEdit && collaborator ? (
              <p className="m-0 mt-0.5 text-xs text-muted-foreground leading-5 truncate">
                <span className="font-medium text-foreground">{toTitleCase(collaborator.fullName)}</span>
                {collaborator.city ? <><span className="mx-1.5" aria-hidden="true">·</span>{collaborator.city}</> : null}
              </p>
            ) : !(eventName || functionName || defaultArea) && (
              <p className="m-0 mt-0.5 text-xs text-muted-foreground leading-5">Identificação, documentos e endereço da pessoa.</p>
            )}
            {(eventName || functionName || defaultArea) && (
              <div className="text-xs text-muted-foreground mt-0.5 leading-5 truncate">
                {eventName    && <span><span className="font-medium text-slate-700">Evento:</span> {eventName}</span>}
                {functionName && <span><span className="mx-1.5" aria-hidden="true">·</span><span className="font-medium text-slate-700">Função:</span> {functionName}</span>}
                {defaultArea  && <span><span className="mx-1.5" aria-hidden="true">·</span><span className="font-medium text-slate-700">Área:</span> {defaultArea}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Corpo: grupos em cartões sobre o fundo do modal; rola sozinho. */}
        <div className="overflow-y-auto flex-1 min-h-0 bg-surface-muted px-4 sm:px-6 py-4">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                // Cada campo já diz o que falta, e o grupo conta as pendências —
                // o aviso só resume (antes repetia todas as mensagens num bloco).
                const n = Object.keys(errors).length;
                const msgs = Object.values(errors).map(e => e?.message).filter(Boolean);
                toast({
                  title: n === 1 ? "Falta 1 campo para salvar" : `Faltam ${n} campos para salvar`,
                  description: n === 1 ? String(msgs[0] ?? "Verifique o campo destacado.") : "Os campos estão destacados em vermelho no formulário.",
                  variant: "destructive",
                });
              })}
              className="space-y-3"
              id="collaborator-form"
              noValidate
            >
              {/* ── Identificação ── */}
              <section className={GRUPO} data-erro={nIdent > 0} aria-labelledby="col-grupo-ident">
                <h3 id="col-grupo-ident" className={`${TITULO_GRUPO} mb-3`}>
                  <User className="w-3.5 h-3.5" aria-hidden="true" />Identificação{contagem(nIdent)}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-3 gap-y-3 items-start">
                  <div className="sm:col-span-6">
                    <FormField control={form.control} name="fullName" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>Nome completo{REQ}</FormLabel>
                        <FormControl>
                          <Input placeholder="Como está no documento" autoComplete="off" className={INPUT_CLS} data-testid="input-collaborator-name" {...field} />
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                  <div className={mostrarDadosPessoais ? "sm:col-span-2" : "sm:col-span-3"}>
                    <FormField control={form.control} name="type" render={({ field }) => (
                      <FormItem className="space-y-1.5">
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
                                    <Icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
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
                  <div className={mostrarDadosPessoais ? "sm:col-span-2" : "sm:col-span-3"}>{cidadeField}</div>
                  {mostrarDadosPessoais && <div className="sm:col-span-2">
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>Telefone{OPT}</FormLabel>
                        {comIcone(Phone, (
                          <FormControl>
                            <Input placeholder="(11) 99999-9999" inputMode="tel" autoComplete="off" className={`${INPUT_CLS} pl-9 tabular-nums`} data-testid="input-collaborator-phone" {...field} />
                          </FormControl>
                        ))}
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>}
                </div>
              </section>

              {/* ── Documentos (com o anexo junto) — dados pessoais ── */}
              {mostrarDadosPessoais && <section className={GRUPO} data-erro={nDocs > 0} aria-labelledby="col-grupo-docs">
                <h3 id="col-grupo-docs" className={`${TITULO_GRUPO} mb-3`}>
                  <IdCard className="w-3.5 h-3.5" aria-hidden="true" />Documentos{contagem(nDocs)}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-3 items-start">
                  <FormField control={form.control} name="cpf" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className={LBL}>CPF{REQ}</FormLabel>
                      {comIcone(FileText, (
                        <FormControl>
                          <Input placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" className={`${INPUT_CLS} pl-9 font-mono tabular-nums placeholder:font-sans`} data-testid="input-collaborator-cpf" {...field} />
                        </FormControl>
                      ))}
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="rg" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className={LBL}>RG{OPT}</FormLabel>
                      {comIcone(FileText, (
                        <FormControl>
                          <Input placeholder="00.000.000-0" autoComplete="off" className={`${INPUT_CLS} pl-9 font-mono tabular-nums placeholder:font-sans`} data-testid="input-collaborator-rg" {...field} />
                        </FormControl>
                      ))}
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="birthDate" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className={LBL}>Nascimento{REQ}</FormLabel>
                      {comIcone(Calendar, (
                        <FormControl>
                          <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-collaborator-birth-date" {...field} />
                        </FormControl>
                      ))}
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <FormField control={form.control} name="documentAttachmentId" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className={`${LBL} flex items-center gap-1.5`}>
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />Foto ou PDF do documento (CPF/RG){REQ}
                      </FormLabel>
                      <FormControl>
                        <div>
                          <AttachmentUpload
                            attachmentIds={documentAttachments}
                            onAttachmentsChange={(ids) => { setDocumentAttachments(ids); field.onChange(ids[0] || ""); }}
                            title="Anexar documento"
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-2xs" />
                    </FormItem>
                  )} />
                </div>
              </section>}

              {/* ── Endereço (22/09) — opcional. Rótulos VISÍVEIS (23/09): só o
                  placeholder dizia o que era cada campo e ele some ao digitar. ── */}
              {mostrarDadosPessoais && <section className={GRUPO} data-erro={nEnd > 0} aria-labelledby="col-grupo-end">
                <h3 id="col-grupo-end" className={`${TITULO_GRUPO} mb-3`}>
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" />Endereço<span className="normal-case tracking-normal font-normal">{OPT}</span>{contagem(nEnd)}
                </h3>
                <div className="grid grid-cols-6 gap-x-3 gap-y-3 items-start">
                  <div className="col-span-6 sm:col-span-4">
                    <FormField control={form.control} name="addressStreet" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>Rua</FormLabel>
                        <FormControl>
                          <Input placeholder="Rua / avenida" autoComplete="off" className={INPUT_CLS} data-testid="input-collaborator-address-street" {...field} />
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <FormField control={form.control} name="addressNumber" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>Número</FormLabel>
                        <FormControl>
                          <Input placeholder="Nº" autoComplete="off" className={`${INPUT_CLS} tabular-nums`} data-testid="input-collaborator-address-number" {...field} />
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-4 sm:col-span-4 max-sm:order-last max-sm:col-span-6">
                    <FormField control={form.control} name="addressComplement" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>Complemento</FormLabel>
                        <FormControl>
                          <Input placeholder="Apto, bloco, fundos…" autoComplete="off" className={INPUT_CLS} data-testid="input-collaborator-address-complement" {...field} />
                        </FormControl>
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormField control={form.control} name="addressZip" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>CEP</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="00000-000"
                            inputMode="numeric"
                            autoComplete="off"
                            className={`${INPUT_CLS} font-mono tabular-nums placeholder:font-sans`}
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
                </div>
              </section>}

              {/* ── Trabalho emergencial ── */}
              {isEmergency && (
                <section className={`${GRUPO} border-warning/30`} data-erro={nEmerg > 0} aria-labelledby="col-grupo-emerg">
                  <h3 id="col-grupo-emerg" className={`${TITULO_GRUPO} mb-3 text-warning`}>
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />Informações do trabalho emergencial{contagem(nEmerg)}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3 items-start">
                    <FormField control={form.control} name="eventId" render={({ field }) => (
                      <FormItem className="space-y-1.5">
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
                      <FormItem className="space-y-1.5">
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
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>Início{REQ}</FormLabel>
                        {comIcone(Calendar, (
                          <FormControl>
                            <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-emergency-start-date" {...field} />
                          </FormControl>
                        ))}
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="actualEndDate" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={LBL}>Fim{REQ}</FormLabel>
                        {comIcone(Calendar, (
                          <FormControl>
                            <Input type="date" className={`${INPUT_CLS} pl-9`} data-testid="input-emergency-end-date" {...field} />
                          </FormControl>
                        ))}
                        <FormMessage className="text-2xs" />
                      </FormItem>
                    )} />
                  </div>
                </section>
              )}
            </form>
          </Form>
        </div>

        {/* Rodapé */}
        <div className="px-5 sm:px-6 py-3 border-t border-border bg-card shrink-0 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <p className="mr-auto text-2xs text-muted-foreground max-sm:hidden">Campos com<RequiredMark /> são obrigatórios</p>
          <div className="flex items-center gap-2 max-sm:w-full">
            <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel-collaborator"
              className="h-9 rounded-lg px-4 text-sm font-medium max-sm:flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              form="collaborator-form"
              disabled={collaboratorMutation.isPending}
              data-testid="button-save-collaborator"
              className={cn("h-9 min-w-[168px] rounded-lg px-4 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground max-sm:flex-1")}
            >
              {collaboratorMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> Salvando…</>
                : <><Check className="w-4 h-4 mr-1.5" strokeWidth={2.5} aria-hidden="true" /> {isEdit ? "Salvar alterações" : "Salvar colaborador"}</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {DialogoDescarte}
    </>
  );
}
