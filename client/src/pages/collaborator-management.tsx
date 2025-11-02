import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";
import { 
  Check, 
  X, 
  User, 
  Search,
  Eye,
  UserPlus,
  Upload,
  FileText,
  Edit
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import BulkUploadModal from "@/components/modals/bulk-upload-modal";
import type { Collaborator } from "@shared/schema";

export default function CollaboratorManagement() {
  const [filters, setFilters] = useState({
    status: "all",
    type: "all",
    search: "",
  });
  
  const [selectedCollaborator, setSelectedCollaborator] = useState<Collaborator | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showBulkUploadModal, setBulkUploadModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editRg, setEditRg] = useState('');
  
  const { toast } = useToast();

  const { data: collaborators, isLoading } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const updateCollaboratorMutation = useMutation({
    mutationFn: async ({ id, status, approvalNotes, cpf, rg }: { id: string; status: string; approvalNotes?: string; cpf?: string; rg?: string }) => {
      const payload: any = { status };
      if (approvalNotes) {
        payload.approvalNotes = approvalNotes;
        payload.approvedAt = new Date().toISOString();
      }
      // Update documents if provided
      if (cpf) {
        payload.officialDocument = cpf;
        payload.documentType = 'cpf';
        if (rg) {
          payload.secondaryDocument = rg;
          payload.secondaryDocumentType = 'rg';
        }
      } else if (rg) {
        payload.officialDocument = rg;
        payload.documentType = 'rg';
      }
      const response = await apiRequest("PATCH", `/api/collaborators/${id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Status do colaborador atualizado",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      setShowDetailsModal(false);
      setShowApprovalModal(false);
      setApprovalNotes('');
      setEditCpf('');
      setEditRg('');
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar colaborador",
        variant: "destructive",
      });
    },
  });

  const filteredCollaborators = collaborators?.filter((collaborator) => {
    const statusMatch = filters.status === "all" || collaborator.status === filters.status;
    const typeMatch = filters.type === "all" || collaborator.type === filters.type;
    const searchMatch = !filters.search || 
      collaborator.fullName.toLowerCase().includes(filters.search.toLowerCase()) ||
      collaborator.officialDocument.includes(filters.search);
    
    return statusMatch && typeMatch && searchMatch;
  }) || [];

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pendente: { color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300", label: "Pendente" },
      aprovado: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", label: "Aprovado" },
      rejeitado: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", label: "Rejeitado" },
      inativo: { color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300", label: "Inativo" },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pendente;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const handleApprove = (collaborator: Collaborator) => {
    setSelectedCollaborator(collaborator);
    setApprovalAction('approve');
    // Pre-populate document fields
    if (collaborator.documentType === 'cpf') {
      setEditCpf(collaborator.officialDocument || '');
      setEditRg(collaborator.secondaryDocument || '');
    } else if (collaborator.documentType === 'rg') {
      setEditRg(collaborator.officialDocument || '');
      setEditCpf(collaborator.secondaryDocument || '');
    } else {
      setEditCpf(collaborator.officialDocument || '');
      setEditRg(collaborator.secondaryDocument || '');
    }
    setShowApprovalModal(true);
  };

  const handleReject = (collaborator: Collaborator) => {
    setSelectedCollaborator(collaborator);
    setApprovalAction('reject');
    setShowApprovalModal(true);
  };

  const handleConfirmApproval = () => {
    if (!selectedCollaborator) return;
    
    const status = approvalAction === 'approve' ? 'aprovado' : 'rejeitado';
    updateCollaboratorMutation.mutate({ 
      id: selectedCollaborator.id, 
      status,
      approvalNotes: approvalNotes.trim() || undefined,
      cpf: editCpf.trim() || undefined,
      rg: editRg.trim() || undefined
    });
  };

  const handleViewDetails = (collaborator: Collaborator) => {
    setSelectedCollaborator(collaborator);
    setShowDetailsModal(true);
  };

  const handleEditCollaborator = (collaborator: Collaborator) => {
    setSelectedCollaborator(collaborator);
    setShowEditModal(true);
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const formatDocument = (document: string, type: string) => {
    if (type === "cpf") {
      return document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return document;
  };

  const pendingCount = collaborators?.filter(c => c.status === "pendente").length || 0;
  const approvedCount = collaborators?.filter(c => c.status === "aprovado").length || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NavigationTabs activeTab="collaborators" />
          <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
            <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="collaborators" />
        
        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Gerenciamento de Colaboradores</h2>
                <p className="text-muted-foreground mt-1">
                  Gerencie aprovações e status dos colaboradores
                </p>
                <div className="flex gap-4 mt-2">
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-yellow-600">{pendingCount}</span> pendentes
                  </span>
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-green-600">{approvedCount}</span> aprovados
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline"
                  onClick={() => setBulkUploadModal(true)}
                  className="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Importar Colaboradores
                </Button>
                <Button 
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Novo Colaborador
                </Button>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-48">
                <Input
                  placeholder="Buscar por nome ou documento"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" style={{ marginTop: -24 }} />
              </div>
              
              <Select 
                value={filters.status} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="rejeitado">Rejeitado</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.type} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="casa">Casa</SelectItem>
                  <SelectItem value="freela">Freela</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lista de Colaboradores */}
          {filteredCollaborators.length === 0 ? (
            <div className="p-12 text-center">
              <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhum colaborador encontrado
              </h3>
              <p className="text-muted-foreground">
                Não há colaboradores que correspondam aos filtros selecionados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Documento
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Cidade
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredCollaborators.map((collaborator) => (
                    <tr key={collaborator.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-foreground">
                          {collaborator.fullName}
                        </div>
                        {collaborator.phone && (
                          <div className="text-xs text-muted-foreground">
                            {collaborator.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-0.5">
                          <div className="text-sm text-foreground font-mono">
                            {collaborator.documentType?.toUpperCase()}: {formatDocument(collaborator.officialDocument, collaborator.documentType)}
                          </div>
                          {collaborator.secondaryDocument && (
                            <div className="text-sm text-foreground font-mono">
                              {collaborator.secondaryDocumentType?.toUpperCase()}: {collaborator.secondaryDocument}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground capitalize">
                          {collaborator.type}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {collaborator.city}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {getStatusBadge(collaborator.status)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDetails(collaborator)}
                            className="p-2"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditCollaborator(collaborator)}
                            className="p-2"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          
                          {collaborator.status === "pendente" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApprove(collaborator)}
                                disabled={updateCollaboratorMutation.isPending}
                                className="bg-green-500 hover:bg-green-600 text-white border-green-500 hover:border-green-600 px-3 py-2 h-8"
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Aprovar
                              </Button>
                              
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(collaborator)}
                                disabled={updateCollaboratorMutation.isPending}
                                className="bg-red-500 hover:bg-red-600 text-white border-red-500 hover:border-red-600 px-3 py-2 h-8"
                              >
                                <X className="w-4 h-4 mr-1" />
                                Rejeitar
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Detalhes */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Colaborador</DialogTitle>
          </DialogHeader>
          
          {selectedCollaborator && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Nome Completo</label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedCollaborator.fullName}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Documentos</label>
                  <div className="space-y-1 mt-1">
                    <div className="text-sm text-muted-foreground font-mono">
                      {selectedCollaborator.documentType.toUpperCase()}: {formatDocument(selectedCollaborator.officialDocument, selectedCollaborator.documentType)}
                    </div>
                    {selectedCollaborator.secondaryDocument && (
                      <div className="text-sm text-muted-foreground font-mono">
                        {selectedCollaborator.secondaryDocumentType?.toUpperCase()}: {selectedCollaborator.secondaryDocument}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Data de Nascimento</label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedCollaborator.birthDate ? formatDate(selectedCollaborator.birthDate) : 'Não informado'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Tipo</label>
                  <div className="text-sm text-muted-foreground mt-1 capitalize">
                    {selectedCollaborator.type}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Cidade</label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedCollaborator.city}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Telefone</label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedCollaborator.phone || "Não informado"}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Status Atual</label>
                  <div className="mt-1">
                    {getStatusBadge(selectedCollaborator.status)}
                  </div>
                </div>
              </div>

              {/* Seção de Documento Anexado */}
              {selectedCollaborator.documentAttachmentId && (
                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-foreground block mb-2">Documento Anexado</label>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <FileText className="w-5 h-5 text-primary" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">CPF/RG - {selectedCollaborator.fullName}</div>
                      <div className="text-xs text-muted-foreground">Documento do colaborador</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/api/attachments/${selectedCollaborator.documentAttachmentId}/view`, '_blank')}
                        data-testid="button-view-document"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Visualizar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {selectedCollaborator.approvalNotes && (
                <div>
                  <label className="text-sm font-medium text-foreground">Observações da Aprovação</label>
                  <div className="text-sm text-muted-foreground mt-1 p-3 bg-muted rounded">
                    {selectedCollaborator.approvalNotes}
                  </div>
                </div>
              )}

              {selectedCollaborator.status === "pendente" && (
                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button
                    variant="destructive"
                    onClick={() => handleReject(selectedCollaborator)}
                    disabled={updateCollaboratorMutation.isPending}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Rejeitar
                  </Button>
                  <Button
                    onClick={() => handleApprove(selectedCollaborator)}
                    disabled={updateCollaboratorMutation.isPending}
                    className="bg-green-500 hover:bg-green-600 text-white"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Aprovar
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Aprovação */}
      <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' ? 'Aprovar' : 'Rejeitar'} Colaborador
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve' 
                ? 'Revise e complete os documentos antes de aprovar' 
                : 'Tem certeza que deseja rejeitar este colaborador?'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCollaborator && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-foreground mb-1">Colaborador</div>
                <div className="text-sm text-muted-foreground">
                  {selectedCollaborator.fullName}
                </div>
              </div>
              
              {approvalAction === 'approve' && (
                <div className="space-y-3 border-t pt-4">
                  <div className="text-sm font-medium text-foreground mb-2">Documentos</div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        CPF
                      </label>
                      <Input
                        value={editCpf}
                        onChange={(e) => setEditCpf(e.target.value)}
                        placeholder="000.000.000-00"
                        className="font-mono"
                        data-testid="input-cpf-approval"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        RG <span className="text-muted-foreground font-normal">(opcional)</span>
                      </label>
                      <Input
                        value={editRg}
                        onChange={(e) => setEditRg(e.target.value)}
                        placeholder="00.000.000-0"
                        className="font-mono"
                        data-testid="input-rg-approval"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Observações {approvalAction === 'approve' ? '(opcional)' : '(recomendado)'}
                </label>
                <Textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder={approvalAction === 'approve' 
                    ? 'Comentários sobre a aprovação...' 
                    : 'Motivo da rejeição...'}
                  rows={3}
                  className="resize-none"
                  data-testid="textarea-approval-notes"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowApprovalModal(false)}
                  disabled={updateCollaboratorMutation.isPending}
                  data-testid="button-cancel-approval"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmApproval}
                  disabled={updateCollaboratorMutation.isPending}
                  className={approvalAction === 'approve' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'}
                  data-testid="button-confirm-approval"
                >
                  {updateCollaboratorMutation.isPending ? 'Processando...' : 
                   (approvalAction === 'approve' ? 'Confirmar Aprovação' : 'Confirmar Rejeição')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Upload em Lote */}
      <BulkUploadModal 
        open={showBulkUploadModal} 
        onClose={() => setBulkUploadModal(false)} 
      />

      {/* Modal de Adicionar Colaborador */}
      <CollaboratorModal 
        open={showAddModal} 
        onClose={() => setShowAddModal(false)}
      />
      
      {/* Modal de Editar Colaborador */}
      <CollaboratorModal 
        open={showEditModal} 
        onClose={() => setShowEditModal(false)}
        collaborator={selectedCollaborator}
        isEdit={true}
      />
    </div>
  );
}