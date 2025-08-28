import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const functionSchema = z.object({
  name: z.string().min(1, "Nome da função é obrigatório"),
  responsibleArea: z.string().min(1, "Área responsável é obrigatória"),
  quantity: z.number().min(1, "Quantidade deve ser pelo menos 1"),
  description: z.string().optional(),
});

type FunctionFormData = z.infer<typeof functionSchema>;

interface FunctionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FunctionModal({ open, onClose }: FunctionModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FunctionFormData>({
    resolver: zodResolver(functionSchema),
    defaultValues: {
      name: "",
      responsibleArea: "",
      quantity: 1,
      description: "",
    },
  });

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
          <DialogTitle>Adicionar Nova Função</DialogTitle>
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
                      placeholder="Ex: Técnico de Som" 
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
              name="responsibleArea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Área Responsável *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-function-area">
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade *</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      placeholder="1"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      data-testid="input-function-quantity"
                    />
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
