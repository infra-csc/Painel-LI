import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event, Function, Collaborator } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import AttachmentUpload from "@/components/ui/attachment-upload";

// Função de validação de CPF
const validateCPF = (cpf: string): boolean => {
  cpf = cpf.replace(/[^\d]/g, '');
  
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  
  let sum = 0;
  let remainder;
  
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;
  
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(10, 11))) return false;
  
  return true;
};

const collaboratorSchema = z.object({
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  cpf: z.string()
    .min(1, "CPF é obrigatório")
    .refine((val) => validateCPF(val), { message: "CPF inválido" }),
  rg: z.string().optional(),
  documentAttachmentId: z.string().min(1, "Documento é obrigatório"),
  birthDate: z.string().min(1, "Data de nascimento é obrigatória"),
  type: z.string().min(1, "Tipo é obrigatório"),
  phone: z.string().optional(),
  city: z.string().min(1, "Cidade é obrigatória"),
  actualStartDate: z.string().optional(),
  actualEndDate: z.string().optional(),
  eventId: z.string().optional(),
  functionId: z.string().optional(),
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

export default function CollaboratorModal({ open, onClose, defaultArea, eventName, functionName, isEmergency = false, collaborator = null, isEdit = false }: CollaboratorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Buscar eventos e funções para seleção (apenas para colaboradores emergenciais)
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
    enabled: isEmergency,
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
    enabled: isEmergency,
  });

  const [documentAttachments, setDocumentAttachments] = useState<string[]>([]);

  const form = useForm<CollaboratorFormData>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      fullName: "",
      cpf: "",
      rg: "",
      documentAttachmentId: "",
      birthDate: "",
      type: "",
      phone: "",
      city: "",
      actualStartDate: "",
      actualEndDate: "",
      eventId: "",
      functionId: "",
    },
  });

  // Reset form with collaborator data when editing
  useEffect(() => {
    if (open && isEdit && collaborator) {
      // Determinar CPF e RG baseado nos documentos existentes
      let cpfValue = "";
      let rgValue = "";
      
      if (collaborator.documentType === "cpf") {
        cpfValue = collaborator.officialDocument || "";
        rgValue = collaborator.secondaryDocument || "";
      } else if (collaborator.documentType === "rg") {
        rgValue = collaborator.officialDocument || "";
        cpfValue = collaborator.secondaryDocument || "";
      }
      
      const attachmentIds = collaborator.documentAttachmentId ? [collaborator.documentAttachmentId] : [];
      setDocumentAttachments(attachmentIds);
      
      form.reset({
        fullName: collaborator.fullName || "",
        cpf: cpfValue,
        rg: rgValue,
        documentAttachmentId: collaborator.documentAttachmentId || "",
        birthDate: collaborator.birthDate || "",
        type: collaborator.type || "",
        phone: collaborator.phone || "",
        city: collaborator.city || "",
        actualStartDate: "",
        actualEndDate: "",
        eventId: "",
        functionId: "",
      });
    } else if (open && !isEdit) {
      setDocumentAttachments([]);
      form.reset({
        fullName: "",
        cpf: "",
        rg: "",
        documentAttachmentId: "",
        birthDate: "",
        type: "",
        phone: "",
        city: "",
        actualStartDate: "",
        actualEndDate: "",
        eventId: "",
        functionId: "",
      });
    }
  }, [open, isEdit, collaborator, form]);

  const collaboratorMutation = useMutation({
    mutationFn: async (data: CollaboratorFormData) => {
      try {
        // Preparar dados do colaborador convertendo CPF e RG para o formato do banco
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
        };
        
        // Adicionar informações do usuário para processamento no servidor
        collaboratorData._userId = user?.id;
        collaboratorData._userRole = user?.role;
        
        console.log("Dados do colaborador sendo enviados:", collaboratorData);
        
        const response = isEdit && collaborator
          ? await apiRequest("PATCH", `/api/collaborators/${collaborator.id}`, collaboratorData)
          : await apiRequest("POST", "/api/collaborators", collaboratorData);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Erro desconhecido" }));
          console.error("Erro do servidor:", errorData);
          throw new Error(errorData.message || "Erro ao salvar colaborador");
        }
        
        const result = await response.json();
        
        // Se for colaborador emergencial, criar também um registro de inclusão de equipe
        if (isEmergency && data.actualStartDate && data.actualEndDate && data.eventId && data.functionId) {
          const startDate = new Date(data.actualStartDate);
          const endDate = new Date(data.actualEndDate);
          const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
          const dailyRates = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          
          const teamInclusionData = {
            eventId: data.eventId,
            functionId: data.functionId,
            collaboratorId: result.id,
            area: defaultArea || user?.area || "Emergencial",
            scheduleStartDate: data.actualStartDate,
            scheduleEndDate: data.actualEndDate,
            actualStartDate: data.actualStartDate,
            actualEndDate: data.actualEndDate,
            dailyRates: dailyRates,
            actualDailyRates: dailyRates,
            dailyValue: 0, // Valor padrão, pode ser editado depois
            needsTicket: false,
            needsAccommodation: false,
            emergencyRecord: true,
            status: "hospedagem",
            phase: "hospedagem",
            observations: "Colaborador emergencial adicionado durante a hospedagem"
          };
          
          await apiRequest("POST", "/api/team-inclusions", teamInclusionData);
        }
        
        return result;
      } catch (error) {
        console.error("Erro ao processar colaborador:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: isEdit 
          ? "Colaborador atualizado com sucesso!"
          : isEmergency 
          ? "Colaborador emergencial criado e adicionado à hospedagem com sucesso"
          : "Colaborador criado com sucesso",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || (isEdit ? "Erro ao atualizar colaborador" : "Erro ao criar colaborador"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CollaboratorFormData) => {
    console.log("Form submitted with data:", data);
    console.log("Form errors:", JSON.stringify(form.formState.errors, null, 2));
    
    // Check for validation errors
    const errors = form.formState.errors;
    if (Object.keys(errors).length > 0) {
      console.error("Validation errors found:", errors);
      Object.keys(errors).forEach(key => {
        console.error(`Field '${key}':`, errors[key as keyof typeof errors]?.message);
      });
      return; // Don't submit if there are errors
    }
    
    collaboratorMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="modal-collaborator">
        <DialogHeader>
          <DialogTitle>
            {isEdit 
              ? 'Editar Colaborador'
              : isEmergency 
              ? 'Adicionar Colaborador Emergencial' 
              : 'Adicionar Novo Colaborador'
            }
          </DialogTitle>
          {(eventName || functionName || defaultArea) && (
            <div className="text-sm text-muted-foreground space-y-1">
              {eventName && <p><strong>Evento:</strong> {eventName}</p>}
              {functionName && <p><strong>Função:</strong> {functionName}</p>}
              {defaultArea && <p><strong>Área:</strong> {defaultArea}</p>}
            </div>
          )}
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
            const errorMessages = Object.values(errors).map(e => e?.message).filter(Boolean).join(', ');
            toast({
              title: "Campos obrigatórios",
              description: errorMessages || "Verifique os campos do formulário",
              variant: "destructive",
            });
          })} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Nome completo" 
                        {...field}
                        data-testid="input-collaborator-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="000.000.000-00" 
                        {...field}
                        data-testid="input-collaborator-cpf"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="rg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RG</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="00.000.000-0" 
                        {...field}
                        data-testid="input-collaborator-rg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Seção de Upload de Documento */}
            <div className="border-t pt-4">
              <FormField
                control={form.control}
                name="documentAttachmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Documento (CPF/RG) *</FormLabel>
                    <FormControl>
                      <AttachmentUpload
                        attachmentIds={documentAttachments}
                        onAttachmentsChange={(ids) => {
                          setDocumentAttachments(ids);
                          field.onChange(ids[0] || "");
                        }}
                        title="📄 Anexar Documento"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Nascimento *</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field}
                        data-testid="input-collaborator-birth-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-collaborator-type">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="casa">Casa</SelectItem>
                        <SelectItem value="freela">Freela</SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="(11) 99999-9999" 
                        {...field}
                        data-testid="input-collaborator-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="São Paulo - SP" 
                        {...field}
                        data-testid="input-collaborator-city"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {isEmergency && (
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium text-foreground mb-3">Informações do Trabalho Emergencial</h4>
                
                {/* Seleção de Evento e Função */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <FormField
                    control={form.control}
                    name="eventId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Evento *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-emergency-event">
                              <SelectValue placeholder="Selecione o evento" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído').map((event) => (
                              <SelectItem key={event.id} value={event.id}>
                                {event.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="functionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Função *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-emergency-function">
                              <SelectValue placeholder="Selecione a função" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {functions?.map((func) => (
                              <SelectItem key={func.id} value={func.id}>
                                {func.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Período de Trabalho */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="actualStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início do Trabalho *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date"
                            {...field}
                            data-testid="input-emergency-start-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="actualEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Final do Trabalho *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date"
                            {...field}
                            data-testid="input-emergency-end-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                data-testid="button-cancel-collaborator"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={collaboratorMutation.isPending}
                data-testid="button-save-collaborator"
              >
                {collaboratorMutation.isPending ? "Salvando..." : isEdit ? "Atualizar Colaborador" : "Salvar Colaborador"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
