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
  cpf: z.string().min(11, "CPF é obrigatório").max(14, "CPF deve ter no máximo 14 caracteres"),
  rg: z.string().min(1, "RG é obrigatório"),
  birthDate: z.string().min(1, "Data de nascimento é obrigatória"),
  area: z.string().min(1, "Área é obrigatória"),
  type: z.string().min(1, "Tipo é obrigatório"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
});

type CollaboratorFormData = z.infer<typeof collaboratorSchema>;

interface CollaboratorModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CollaboratorModal({ open, onClose }: CollaboratorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CollaboratorFormData>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      fullName: "",
      cpf: "",
      rg: "",
      birthDate: "",
      area: "",
      type: "",
      phone: "",
      city: "",
    },
  });

  const createCollaboratorMutation = useMutation({
    mutationFn: async (data: CollaboratorFormData) => {
      const response = await apiRequest("POST", "/api/collaborators", data);
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
                    <FormLabel>RG *</FormLabel>
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
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Área *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-collaborator-area">
                          <SelectValue placeholder="Selecione uma área" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="tecnica">Área Técnica</SelectItem>
                        <SelectItem value="seguranca">Área de Segurança</SelectItem>
                        <SelectItem value="producao">Área de Produção</SelectItem>
                        <SelectItem value="financeiro">Área Financeira</SelectItem>
                        <SelectItem value="compras">Área de Compras/Viagem</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <FormLabel>Telefone *</FormLabel>
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
