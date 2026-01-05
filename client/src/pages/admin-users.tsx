import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Edit, UserCheck, UserMinus, Key, Search, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import UserEditModal from "@/components/modals/user-edit-modal";
import type { User } from "@shared/schema";

export default function AdminUsers() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const toggleActiveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}/toggle-active`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Status da conta atualizado",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string, newPassword: string }) => {
      const response = await apiRequest("POST", `/api/users/${userId}/reset-password`, { newPassword });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Senha resetada com sucesso. O usuário precisará trocar a senha no próximo login.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const handleResetPassword = (userId: string) => {
    const newPassword = window.prompt("Digite a nova senha (mínimo 6 caracteres):");
    if (newPassword && newPassword.length >= 6) {
      resetPasswordMutation.mutate({ userId, newPassword });
    } else if (newPassword) {
      toast({ title: "Erro", description: "Senha muito curta", variant: "destructive" });
    }
  };

  // Only allow admin access
  const isAdmin = user?.role === 'admin' || user?.role === 'administrador' || user?.role === 'administrator';
  if (!user || !isAdmin) {
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

  // Filter and sort users
  const filteredUsers = users
    .filter(user => {
      // Status filter
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return user.name.toLowerCase().includes(query) || 
               user.email.toLowerCase().includes(query);
      }
      return true;
    })
    .sort((a, b) => {
      // Pending first, then by date (newest first)
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const getStatusBadge = (status: string, isActive: boolean | null) => {
    const variants = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: isActive === false ? "bg-gray-100 text-gray-800" : "bg-green-100 text-green-800", 
      rejected: "bg-red-100 text-red-800",
    };
    
    const labels = {
      pending: "Pendente",
      approved: isActive === false ? "Inativo" : "Ativo",
      rejected: "Rejeitado",
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || "bg-gray-100 text-gray-800"}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const getRoleBadge = (role: string) => {
    const config = {
      admin: { bg: "bg-purple-100 text-purple-800", label: "Administrador" },
      production: { bg: "bg-blue-100 text-blue-800", label: "Produção" },
      function_area: { bg: "bg-teal-100 text-teal-800", label: "Área de Função" },
      purchasing: { bg: "bg-orange-100 text-orange-800", label: "Compras" },
      financial: { bg: "bg-emerald-100 text-emerald-800", label: "Financeiro" },
    };
    const roleConfig = config[role as keyof typeof config] || { bg: "bg-gray-100 text-gray-800", label: role };
    return <Badge className={roleConfig.bg}>{roleConfig.label}</Badge>;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", 
      "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500"
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
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
        
        {/* Search */}
        <div className="flex gap-4 mb-4 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-users"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {(searchQuery || statusFilter !== 'all') && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              className="text-gray-500 hover:text-gray-700"
            >
              Limpar filtros
            </Button>
          )}
          <div className="text-sm text-gray-500 ml-auto">
            {filteredUsers.length} de {users.length} usuários
          </div>
        </div>

        {/* Summary Cards - Clickable */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div 
            className={`p-4 rounded-lg border shadow-sm cursor-pointer transition-all hover:shadow-md ${statusFilter === 'all' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'bg-white border-gray-200'}`}
            onClick={() => setStatusFilter('all')}
          >
            <div className="text-sm font-medium text-gray-600">Total</div>
            <div className="text-2xl font-bold text-gray-900">{users.length}</div>
          </div>
          <div 
            className={`p-4 rounded-lg border shadow-sm cursor-pointer transition-all hover:shadow-md ${statusFilter === 'pending' ? 'ring-2 ring-yellow-300' : ''} bg-yellow-50 border-yellow-200`}
            onClick={() => setStatusFilter('pending')}
          >
            <div className="text-sm font-medium text-yellow-600">Pendentes</div>
            <div className="text-2xl font-bold text-yellow-900">
              {users.filter(u => u.status === 'pending').length}
            </div>
          </div>
          <div 
            className={`p-4 rounded-lg border shadow-sm cursor-pointer transition-all hover:shadow-md ${statusFilter === 'approved' ? 'ring-2 ring-green-300' : ''} bg-green-50 border-green-200`}
            onClick={() => setStatusFilter('approved')}
          >
            <div className="text-sm font-medium text-green-600">Aprovados</div>
            <div className="text-2xl font-bold text-gray-900">
              {users.filter(u => u.status === 'approved' && u.isActive !== false).length}
            </div>
          </div>
          <div 
            className={`p-4 rounded-lg border shadow-sm cursor-pointer transition-all hover:shadow-md ${statusFilter === 'rejected' ? 'ring-2 ring-red-300' : ''} bg-red-50 border-red-200`}
            onClick={() => setStatusFilter('rejected')}
          >
            <div className="text-sm font-medium text-red-600">Inativos/Rejeitados</div>
            <div className="text-2xl font-bold text-red-900">
              {users.filter(u => u.status === 'rejected' || u.isActive === false).length}
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
                  <tr 
                    key={user.id} 
                    className={`hover:bg-gray-50 ${user.isActive === false ? 'bg-gray-100' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${getAvatarColor(user.name)} flex items-center justify-center text-white text-sm font-medium`}>
                          {getInitials(user.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900" data-testid={`text-user-name-${user.id}`}>
                              {user.name}
                            </div>
                            {user.mustChangePassword && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Senha foi resetada pelo admin. Usuário deve trocar no próximo login.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {user.area && (
                            <div className="text-xs text-gray-500">{user.area}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900" data-testid={`text-user-email-${user.id}`}>
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(user.status, user.isActive)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(user.createdAt || '').toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {/* Edit button for all users */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingUser(user)}
                                className="text-gray-600 hover:text-gray-900"
                                data-testid={`button-edit-${user.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Editar Usuário</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {/* Pending users: approve/reject */}
                        {user.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleApproveUser(user.id, 'approved')}
                              className="text-green-600 hover:text-green-900"
                              data-testid={`button-approve-${user.id}`}
                              disabled={approveUserMutation.isPending}
                              title="Aprovar Usuário"
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
                              title="Rejeitar Usuário"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}

                        {/* Rejected users: reactivate */}
                        {user.status === 'rejected' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleApproveUser(user.id, 'approved')}
                            className="text-green-600 hover:text-green-900"
                            data-testid={`button-reactivate-${user.id}`}
                            disabled={approveUserMutation.isPending}
                            title="Reativar Usuário"
                          >
                            <UserCheck className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Approved users: reset password and toggle active */}
                        {user.status === 'approved' && (
                          <>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleResetPassword(user.id)}
                                    className="text-blue-600 hover:text-blue-900"
                                    data-testid={`button-reset-pwd-${user.id}`}
                                  >
                                    <Key className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Resetar Senha</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => toggleActiveMutation.mutate(user.id)}
                                    className={user.isActive !== false ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900 ring-2 ring-green-500"}
                                    data-testid={`button-toggle-active-${user.id}`}
                                  >
                                    {user.isActive !== false ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{user.isActive !== false ? "Desativar Usuário" : "Reativar Usuário"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
