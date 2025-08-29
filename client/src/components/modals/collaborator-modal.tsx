import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const collaboratorSchema = z.object({
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  officialDocument: z.string().min(1, "Documento oficial é obrigatório"),
  documentType: z.enum(["cpf", "rg"], { required_error: "Tipo de documento é obrigatório" }),
  birthDate: z.string().min(1, "Data de nascimento é obrigatória"),
  type: z.string().min(1, "Tipo é obrigatório"),
  phone: z.string().optional(),
  city: z.string().min(1, "Cidade é obrigatória"),
  actualStartDate: z.string().optional(),
  actualEndDate: z.string().optional(),
});

type CollaboratorFormData = z.infer<typeof collaboratorSchema>;

interface CollaboratorModalProps {
  open: boolean;
  onClose: () => void;
  defaultArea?: string;
  eventName?: string;
  functionName?: string;
  isEmergency?: boolean;
}

export default function CollaboratorModal({ open, onClose, defaultArea, eventName, functionName, isEmergency = false }: CollaboratorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CollaboratorFormData>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      fullName: "",
      officialDocument: "",
      documentType: "cpf" as const,
      birthDate: "",
      type: "",
      phone: "",
      city: "",
      actualStartDate: "",
      actualEndDate: "",
    },
  });

  const createCollaboratorMutation = useMutation({
    mutationFn: async (data: CollaboratorFormData) => {
      // Ensure area is set from defaultArea
      const collaboratorData = {
        ...data,
        area: defaultArea || ""
      };
      const response = await apiRequest("POST", "/api/collaborators", collaboratorData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Colaborador criado com sucesso",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar colaborador",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CollaboratorFormData) => {
    createCollaboratorMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" data-testid="modal-collaborator">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Colaborador</DialogTitle>
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
                <h4 className="font-medium text-foreground mb-3">Período de Trabalho Emergencial</h4>
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
                disabled={createCollaboratorMutation.isPending}
                data-testid="button-save-collaborator"
              >
                {createCollaboratorMutation.isPending ? "Salvando..." : "Salvar Colaborador"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
