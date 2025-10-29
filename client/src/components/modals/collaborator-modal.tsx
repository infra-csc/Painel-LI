import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
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

const collaboratorSchema = z.object({
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  officialDocument: z.string().min(1, "Documento oficial é obrigatório"),
  documentType: z.enum(["cpf", "rg"], { required_error: "Tipo de documento é obrigatório" }),
  secondaryDocument: z.string().optional(),
  secondaryDocumentType: z.enum(["cpf", "rg"]).optional(),
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

  const form = useForm<CollaboratorFormData>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      fullName: "",
      officialDocument: "",
      documentType: "cpf" as const,
      secondaryDocument: "",
      secondaryDocumentType: undefined,
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
      form.reset({
        fullName: collaborator.fullName || "",
        officialDocument: collaborator.officialDocument || "",
        documentType: collaborator.documentType as "cpf" | "rg" || "cpf",
        secondaryDocument: collaborator.secondaryDocument || "",
        secondaryDocumentType: collaborator.secondaryDocumentType as "cpf" | "rg" | undefined,
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
      form.reset({
        fullName: "",
        officialDocument: "",
        documentType: "cpf" as const,
        secondaryDocument: "",
        secondaryDocumentType: undefined,
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
        // Preparar dados do colaborador
        const collaboratorData: any = { ...data };
        
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              
              <div className="flex gap-2">
                <FormField
                  control={form.control}
                  name="documentType"
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormLabel>Tipo *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-document-type">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cpf">CPF</SelectItem>
                          <SelectItem value="rg">RG</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="officialDocument"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Documento Oficial *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder={form.watch("documentType") === "cpf" ? "000.000.000-00" : "00.000.000-0"} 
                          {...field}
                          data-testid="input-collaborator-document"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex gap-2">
                <FormField
                  control={form.control}
                  name="secondaryDocumentType"
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormLabel>Tipo 2</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-secondary-document-type">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cpf">CPF</SelectItem>
                          <SelectItem value="rg">RG</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="secondaryDocument"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Documento Secundário</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder={form.watch("secondaryDocumentType") === "cpf" ? "000.000.000-00" : "00.000.000-0"} 
                          {...field}
                          data-testid="input-secondary-document"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                            {events?.map((event) => (
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
