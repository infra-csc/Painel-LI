import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User } from "@shared/schema";

const userEditSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  role: z.enum(["admin", "production", "function_area", "purchasing", "financial"], {
    required_error: "Selecione uma função",
  }),
  area: z.string().optional(),
});

type UserEditFormData = z.infer<typeof userEditSchema>;

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export default function UserEditModal({ isOpen, onClose, user }: UserEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserEditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      role: (user?.role as UserEditFormData["role"]) || "production",
      area: user?.area || "",
    },
  });

  // Reset form when user changes
  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        role: user.role as any,
        area: user.area || "",
      });
    }
  }, [user, form]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserEditFormData) => {
      const response = await apiRequest("PATCH", `/api/users/${user?.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Sucesso",
        description: "Dados do usuário atualizados com sucesso",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar dados do usuário",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UserEditFormData) => {
    updateUserMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>
                Edite as informações do usuário. Todos os campos são obrigatórios exceto a área.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nome completo"
                        data-testid="input-edit-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="email@exemplo.com"
                        data-testid="input-edit-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-role">
                          <SelectValue placeholder="Selecione a função" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="production">Produção</SelectItem>
                        <SelectItem value="function_area">Área de Função</SelectItem>
                        <SelectItem value="purchasing">Compras</SelectItem>
                        <SelectItem value="financial">Financeiro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Área (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Área de responsabilidade"
                        data-testid="input-edit-area"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateUserMutation.isPending}
                data-testid="button-cancel-edit-user"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateUserMutation.isPending}
                data-testid="button-save-edit-user"
              >
                {updateUserMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}