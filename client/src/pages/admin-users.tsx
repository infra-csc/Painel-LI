import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import UserEditModal from "@/components/modals/user-edit-modal";
import type { User } from "@shared/schema";

export default function AdminUsers() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Only allow admin access
  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h2>
          <p className="text-gray-600">Você precisa ser administrador para acessar esta página.</p>
        </div>
      </div>
    );
  }

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const approveUserMutation = useMutation({
    mutationFn: async ({ userId, status, role }: { userId: string; status: 'approved' | 'rejected'; role?: string }) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}/approval`, { status, role });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Status do usuário atualizado com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar status do usuário",
        variant: "destructive",
      });
    },
  });

  const handleApproveUser = (userId: string, status: 'approved' | 'rejected') => {
    const message = status === 'approved' ? 'aprovar' : 'rejeitar';
    if (window.confirm(`Tem certeza que deseja ${message} este usuário?`)) {
      approveUserMutation.mutate({ userId, status });
    }
  };

  // Filter users based on status
  const filteredUsers = users.filter(user => {
    if (statusFilter === "all") return true;
    return user.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800", 
      rejected: "bg-red-100 text-red-800",
    };
    
    const labels = {
      pending: "Pendente",
      approved: "Aprovado",
      rejected: "Rejeitado",
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || "bg-gray-100 text-gray-800"}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Gerenciamento de Usuários</h1>
        
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-sm font-medium text-gray-600">Total</div>
            <div className="text-2xl font-bold text-gray-900">{users.length}</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 shadow-sm">
            <div className="text-sm font-medium text-yellow-600">Pendentes</div>
            <div className="text-2xl font-bold text-yellow-900">
              {users.filter(u => u.status === 'pending').length}
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200 shadow-sm">
            <div className="text-sm font-medium text-green-600">Aprovados</div>
            <div className="text-2xl font-bold text-green-900">
              {users.filter(u => u.status === 'approved').length}
            </div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg border border-red-200 shadow-sm">
            <div className="text-sm font-medium text-red-600">Rejeitados</div>
            <div className="text-2xl font-bold text-red-900">
              {users.filter(u => u.status === 'rejected').length}
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  E-mail
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Função
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data de Cadastro
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      {statusFilter === "all" ? "Nenhum usuário cadastrado" : `Nenhum usuário ${statusFilter === "pending" ? "pendente" : statusFilter === "approved" ? "aprovado" : "rejeitado"} encontrado`}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900" data-testid={`text-user-name-${user.id}`}>
                        {user.name}
                      </div>
                      {user.area && (
                        <div className="text-sm text-gray-500">{user.area}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900" data-testid={`text-user-email-${user.id}`}>
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 capitalize">
                        {user.role === 'admin' ? 'Administrador' :
                         user.role === 'production' ? 'Produção' :
                         user.role === 'function_area' ? 'Área de Função' :
                         user.role === 'purchasing' ? 'Compras' :
                         user.role === 'financial' ? 'Financeiro' : user.role}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(user.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(user.createdAt || '').toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {/* Edit button for all users */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingUser(user)}
                          className="text-blue-600 hover:text-blue-900"
                          data-testid={`button-edit-${user.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        
                        {user.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleApproveUser(user.id, 'approved')}
                              className="text-green-600 hover:text-green-900"
                              data-testid={`button-approve-${user.id}`}
                              disabled={approveUserMutation.isPending}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleApproveUser(user.id, 'rejected')}
                              className="text-red-600 hover:text-red-900"
                              data-testid={`button-reject-${user.id}`}
                              disabled={approveUserMutation.isPending}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* User Edit Modal */}
      <UserEditModal
        isOpen={editingUser !== null}
        onClose={() => setEditingUser(null)}
        user={editingUser}
      />
    </div>
  );
}