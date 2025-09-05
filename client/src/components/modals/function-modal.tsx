import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import type { User } from "@shared/schema";

const functionSchema = z.object({
  name: z.string().min(1, "Nome da função é obrigatório"),
  description: z.string().optional(),
  userId: z.string().optional(),
});

type FunctionFormData = z.infer<typeof functionSchema>;

interface FunctionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FunctionModal({ open, onClose }: FunctionModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // Only admin can create functions
  if (!user || !hasPermission(user, 'canEditScreen1')) {
    return null;
  }

  const form = useForm<FunctionFormData>({
    resolver: zodResolver(functionSchema),
    defaultValues: {
      name: "",
      description: "",
      userId: "",
    },
  });
  
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  
  const approvedUsers = users.filter(user => user.status === 'approved');

  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => {
      const response = await apiRequest("POST", "/api/functions", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Função criada com sucesso",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar função",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FunctionFormData) => {
    createFunctionMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="modal-function">
        <DialogHeader>
          <DialogTitle>Adicionar Função</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Função *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Digite o nome da função"
                      {...field}
                      data-testid="input-function-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usuário Responsável (Opcional)</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-function-user">
                        <SelectValue placeholder="Selecione um usuário" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum usuário específico</SelectItem>
                        {approvedUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} - {user.area}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea 
                      rows={3}
                      placeholder="Descrição das responsabilidades da função..."
                      {...field}
                      data-testid="textarea-function-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                data-testid="button-cancel-function"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createFunctionMutation.isPending}
                data-testid="button-save-function"
              >
                {createFunctionMutation.isPending ? "Salvando..." : "Salvar Função"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
