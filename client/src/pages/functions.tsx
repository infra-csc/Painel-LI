import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings, Plus, Edit, Trash2, User, Users, UserCheck, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import type { Function, User as UserType, FunctionUser, FunctionManager } from "@shared/schema";

const functionFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

type FunctionFormData = z.infer<typeof functionFormSchema>;

export default function Functions() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFunction, setEditingFunction] = useState<Function | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();


  const form = useForm<FunctionFormData>({
    resolver: zodResolver(functionFormSchema),
    defaultValues: {
      name: "",
    },
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  // Sort functions alphabetically by name
  const sortedFunctions = useMemo(() => {
    if (!functions) return functions;
    return [...functions].sort((a, b) => a.name.localeCompare(b.name));
  }, [functions]);

  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const createFunctionMutation = useMutation({
    mutationFn: async (data: FunctionFormData) => {
      const response = await apiRequest("POST", "/api/functions", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({
        title: "Sucesso",
        description: editingFunction ? "Função atualizada com sucesso!" : "Função criada com sucesso!",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao salvar função",
        variant: "destructive",
      });
    },
  });

  const updateFunctionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FunctionFormData }) => {
      const response = await apiRequest("PATCH", `/api/functions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({
        title: "Sucesso",
        description: "Função atualizada com sucesso!",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar função",
        variant: "destructive",
      });
    },
  });

  const deleteFunctionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/functions/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
      toast({
        title: "Sucesso",
        description: "Função removida com sucesso!",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao remover função. Pode haver escalações vinculadas a esta função.",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (functionToEdit?: Function) => {
    if (functionToEdit) {
      setEditingFunction(functionToEdit);
      form.reset({
        name: functionToEdit.name,
      });
    } else {
      setEditingFunction(null);
      form.reset({
        name: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingFunction(null);
    form.reset();
  };

  const handleSubmit = (data: FunctionFormData) => {
    if (editingFunction) {
      updateFunctionMutation.mutate({ id: editingFunction.id, data });
    } else {
      createFunctionMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja remover esta função? Esta ação não pode ser desfeita.")) {
      deleteFunctionMutation.mutate(id);
    }
  };


  return (
    <div className="space-y-6">
      <Card className="border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Gerenciamento de Funções
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Gerencie as funções do sistema e atribua usuários responsáveis
                  </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog()} data-testid="button-add-function">
                      <Plus className="w-4 h-4 mr-2" />
                      Nova Função
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>
                        {editingFunction ? "Editar Função" : "Nova Função"}
                      </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nome *</FormLabel>
                              <FormControl>
                                <Input placeholder="Ex: Atendimento" {...field} data-testid="input-function-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />



                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={handleCloseDialog} className="flex-1">
                            Cancelar
                          </Button>
                          <Button 
                            type="submit" 
                            disabled={createFunctionMutation.isPending || updateFunctionMutation.isPending}
                            className="flex-1"
                            data-testid="button-save-function"
                          >
                            {editingFunction ? "Atualizar" : "Criar"} Função
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Responsáveis</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFunctions?.map((func) => (
                      <TableRow key={func.id}>
                        <TableCell className="font-medium">{func.name}</TableCell>
                        <TableCell>
                          <FunctionManagersCell functionId={func.id} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDialog(func)}
                              data-testid={`button-edit-function-${func.id}`}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(func.id)}
                              className="text-destructive hover:text-destructive"
                              data-testid={`button-delete-function-${func.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!sortedFunctions || sortedFunctions.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Nenhuma função cadastrada. Clique em "Nova Função" para criar a primeira.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
    </div>
  );
}

// Component to manage function users
function FunctionUsersCell({ functionId }: { functionId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: functionUsers } = useQuery<(FunctionUser & { user?: UserType })[]>({
    queryKey: [`/api/functions/${functionId}/users`],
    enabled: !!functionId,
  });

  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const addUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/functions/${functionId}/users`, { userId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/users`] });
      setSelectedUserId("");
      toast({ title: "Usuário adicionado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar usuário", variant: "destructive" });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/functions/${functionId}/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/users`] });
      toast({ title: "Usuário removido com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover usuário", variant: "destructive" });
    },
  });

  const availableUsers = users?.filter(user => 
    !functionUsers?.some(fu => fu.userId === user.id)
  ) || [];

  const handleAddUser = () => {
    if (selectedUserId) {
      addUserMutation.mutate(selectedUserId);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {functionUsers?.map((fu) => {
          const user = users?.find(u => u.id === fu.userId);
          return (
            <div key={fu.id} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs">
              <Users className="w-3 h-3" />
              <span>{user?.name || user?.email || "Usuário"}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-4 w-4 p-0 hover:bg-blue-200"
                onClick={() => removeUserMutation.mutate(fu.userId)}
                data-testid={`button-remove-function-user-${fu.userId}`}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          );
        })}
      </div>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="text-xs" data-testid={`button-add-function-user-${functionId}`}>
            <Plus className="w-3 h-3 mr-1" />
            Adicionar
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adicionar Usuário à Função</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleAddUser} 
                disabled={!selectedUserId || addUserMutation.isPending}
                className="flex-1"
                data-testid={`button-submit-add-user-${functionId}`}
              >
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Component to manage function managers
function FunctionManagersCell({ functionId }: { functionId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: functionManagers } = useQuery<(FunctionManager & { user?: UserType })[]>({
    queryKey: [`/api/functions/${functionId}/managers`],
    enabled: !!functionId,
  });

  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const addManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/functions/${functionId}/managers`, { userId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/managers`] });
      setSelectedUserId("");
      toast({ title: "Responsável adicionado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar responsável", variant: "destructive" });
    },
  });

  const removeManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/functions/${functionId}/managers/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/functions/${functionId}/managers`] });
      toast({ title: "Responsável removido com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover responsável", variant: "destructive" });
    },
  });

  const availableUsers = users?.filter(user => 
    !functionManagers?.some(fm => fm.userId === user.id)
  ) || [];

  const handleAddManager = () => {
    if (selectedUserId) {
      addManagerMutation.mutate(selectedUserId);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {functionManagers?.map((fm) => {
          const user = users?.find(u => u.id === fm.userId);
          return (
            <div key={fm.id} className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-md text-xs">
              <UserCheck className="w-3 h-3" />
              <span>{user?.name || user?.email || "Usuário"}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-4 w-4 p-0 hover:bg-green-200"
                onClick={() => removeManagerMutation.mutate(fm.userId)}
                data-testid={`button-remove-function-manager-${fm.userId}`}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          );
        })}
      </div>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="text-xs" data-testid={`button-add-function-manager-${functionId}`}>
            <Plus className="w-3 h-3 mr-1" />
            Adicionar
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adicionar Responsável à Função</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger data-testid={`select-function-manager-${functionId}`}>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleAddManager} 
                disabled={!selectedUserId || addManagerMutation.isPending}
                className="flex-1"
                data-testid={`button-submit-add-manager-${functionId}`}
              >
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}