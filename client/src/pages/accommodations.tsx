import { useState, useMemo, useEffect } from "react";
import { fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Hotel, Save, Eye, ChevronDown, ChevronRight, MessageCircle, Edit, Calendar, Clock } from "lucide-react";
import SimpleFilters from "@/components/common/simple-filters";
import StatusBadge from "@/components/common/status-badge";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import CommentsModal from "@/components/modals/comments-modal";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isReadOnly, canEdit, canPerformActions } from "@/lib/interactions";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation, Comment, insertAccommodationSchema } from "@shared/schema";

// Helper: Mostrar "Escalado" apenas quando não precisa passagem nem hospedagem
const getDisplayStatus = (inclusion: TeamInclusion) => {
  if (inclusion.status === "escalado" && (inclusion.needsTicket || inclusion.needsAccommodation)) {
    // Se está escalado mas precisa de passagem ou hospedagem, mostrar "Aguardando Passagem" ou similar
    if (inclusion.needsTicket) return "aguardando_passagem";
    if (inclusion.needsAccommodation) return "aguardando_hospedagem";
  }
  return inclusion.status;
};

// Schema de validação estendido
const accommodationFormSchema = z.object({
  teamInclusionId: z.string(),
  hotelName: z.string().min(1, "Nome do hotel é obrigatório"),
  hotelLocation: z.string().min(1, "Localização do hotel é obrigatória"),
  checkInDate: z.date({
    required_error: "Data de check-in é obrigatória",
  }),
  checkInTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)"),
  checkOutDate: z.date({
    required_error: "Data de check-out é obrigatória",
  }),
  checkOutTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)"),
  dailyRate: z.number().min(0.01, "Diária deve ser maior que zero").optional(),
  reservationNumber: z.string().optional(),
  accommodationObservations: z.string().optional(),
}).refine(data => {
  return data.checkInDate < data.checkOutDate;
}, {
  message: "Data de check-out deve ser posterior à data de check-in",
  path: ["checkOutDate"],
});

type AccommodationFormData = z.infer<typeof accommodationFormSchema>;

export default function Accommodations() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: [] as string[], 
    collaboratorId: "all",
    searchId: "",
    accommodationStatus: "all", // all, pending, processed
    inclusionStatus: "active", // all, active (excludes cancelado)
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAccommodationId, setEditingAccommodationId] = useState<string | null>(null); // ID da accommodation sendo editado
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: false,
    dates: true,
    additional: false
  });
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [accommodationData, setAccommodationData] = useState<Record<string, any>>({});
  const [selectedInclusionsForBatch, setSelectedInclusionsForBatch] = useState<string[]>([]);
  
  // Estado para gerenciar anexos no modal - movido para o componente pai para evitar reset
  const [modalAttachmentIds, setModalAttachmentIds] = useState<string[]>([]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Handle column sorting
  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current?.field === field) {
        return current.direction === 'asc' 
          ? { field, direction: 'desc' }
          : null; // Remove sorting on third click
      } else {
        return { field, direction: 'asc' };
      }
    });
  };

  // Função para alterar dados de hospedagem
  const handleAccommodationDataChange = (inclusionId: string, field: string, value: any) => {
    setAccommodationData(prev => ({
      ...prev,
      [inclusionId]: {
        ...prev[inclusionId],
        [field]: value
      }
    }));
  };

  // Toggle seleção de inclusão para lote
  const toggleInclusionSelection = (inclusionId: string) => {
    setSelectedInclusionsForBatch(prev => {
      if (prev.includes(inclusionId)) {
        return prev.filter(id => id !== inclusionId);
      } else {
        return [...prev, inclusionId];
      }
    });
  };

  // Selecionar/deselecionar todos os pendentes
  const toggleAllInclusions = () => {
    const pendingInclusions = filteredData.filter(inclusion => 
      !accommodationMap.get(inclusion.id)
    );
    const allPendingIds = pendingInclusions.map(inclusion => inclusion.id);
    
    if (selectedInclusionsForBatch.length === allPendingIds.length) {
      setSelectedInclusionsForBatch([]); // Deselecionar todos
    } else {
      setSelectedInclusionsForBatch(allPendingIds); // Selecionar todos pendentes
    }
  };

  // Toggle seções expansíveis
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Função para visualizar detalhes da hospedagem (similar à handleViewTicketDetails)
  const handleViewAccommodationDetails = (inclusion: TeamInclusion) => {
    if (inclusion.status === 'cancelado') return;
    
    // Limpar anexos apenas quando muda de inclusão
    if (selectedInclusion?.id !== inclusion.id) {
      setModalAttachmentIds([]);
    }
    
    setSelectedInclusion(inclusion);
    setShowModal(true);
  };

  // Componente do Modal de Hospedagem
  const AccommodationModal = () => {
    const accommodation = selectedInclusion ? accommodationMap.get(selectedInclusion.id) : null;
    // Considera que está editando se existe um registro de accommodation
    const isEditing = !!accommodation;
    const canEditRecord = selectedInclusion && user && canEdit(user) && selectedInclusion.status !== 'cancelado';
    
    // Usar estado do componente pai para anexos (evita reset por re-mount)
    
    // Configurar valores padrão do formulário
    const defaultValues: Partial<AccommodationFormData> = {
      teamInclusionId: selectedInclusion?.id || '',
      hotelName: accommodation?.hotelName || '',
      hotelLocation: accommodation?.hotelLocation || '',
      checkInDate: accommodation?.checkInDate ? new Date(accommodation.checkInDate) : undefined,
      checkInTime: accommodation?.checkInTime || '',
      checkOutDate: accommodation?.checkOutDate ? new Date(accommodation.checkOutDate) : undefined,
      checkOutTime: accommodation?.checkOutTime || '',
      dailyRate: accommodation?.dailyRate ? accommodation.dailyRate / 100 : undefined, // Converter de centavos
      reservationNumber: accommodation?.reservationNumber || '',
      accommodationObservations: accommodation?.accommodationObservations || '',
    };

    const form = useForm<AccommodationFormData>({
      resolver: zodResolver(accommodationFormSchema),
      defaultValues,
    });
    

    const onSubmit = async (data: AccommodationFormData) => {
      if (!selectedInclusion) return;
      
      try {
        const submitData = {
          ...data,
          dailyRate: data.dailyRate ? Math.round(data.dailyRate * 100) : undefined, // Converter para centavos
          checkInDate: format(data.checkInDate, 'yyyy-MM-dd'),
          checkOutDate: format(data.checkOutDate, 'yyyy-MM-dd'),
          attachmentIds: modalAttachmentIds && modalAttachmentIds.length > 0 ? modalAttachmentIds : null,
        };
        
        if (accommodation) {
          // Se existe registro de accommodation (mesmo vazio), atualiza
          await updateAccommodationMutation.mutateAsync({
            id: accommodation.id,
            data: submitData,
          });
        } else {
          // Se não existe registro, cria novo
          await createAccommodationMutation.mutateAsync(submitData);
        }
        
        setShowModal(false);
        form.reset();
      } catch (error) {
        console.error('Erro ao salvar hospedagem:', error);
      }
    };
    
    const [formSections, setFormSections] = useState({
      basic: true,
      dates: true,
    });
    
    const toggleFormSection = (section: 'basic' | 'dates') => {
      setFormSections(prev => ({
        ...prev,
        [section]: !prev[section]
      }));
    };
    
    if (!selectedInclusion) return null;
    
    const event = events?.find(e => e.id === selectedInclusion.eventId);
    const func = functions?.find(f => f.id === selectedInclusion.functionId);
    const collaborator = collaborators?.find(c => c.id === selectedInclusion.collaboratorId);
    
    return (
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Hotel className="w-5 h-5" />
            {isEditing ? 'Editar Hospedagem' : 'Nova Hospedagem'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Edite os dados de hospedagem' : 'Preencha os dados de hospedagem'}
          </DialogDescription>
          
          {/* Informações do colaborador e evento */}
          <div className="space-y-3 mt-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
                ID: {selectedInclusion.inclusionNumber || 'N/A'}
              </Badge>
              <Badge variant="outline">{event?.name}</Badge>
              <Badge variant="outline">{func?.name}</Badge>
              <StatusBadge status={getDisplayStatus(selectedInclusion)} />
            </div>
            
            {/* Dados do Colaborador */}
            {collaborator && (
              <div className="bg-muted/30 rounded-lg p-4 border">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Dados do Colaborador
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-foreground">Nome:</span>
                    <div className="text-muted-foreground">{fixEncoding(collaborator.fullName)}</div>
                  </div>
                  {collaborator.officialDocument && (
                    <div>
                      <span className="font-medium text-foreground">
                        {collaborator.documentType === 'cpf' ? 'CPF:' : 'RG:'}
                      </span>
                      <div className="text-muted-foreground">{collaborator.officialDocument}</div>
                    </div>
                  )}
                  {collaborator.phone && (
                    <div>
                      <span className="font-medium text-foreground">Telefone:</span>
                      <div className="text-muted-foreground">{collaborator.phone}</div>
                    </div>
                  )}
                  {collaborator.city && (
                    <div>
                      <span className="font-medium text-foreground">Cidade:</span>
                      <div className="text-muted-foreground">{collaborator.city}</div>
                    </div>
                  )}
                  {collaborator.birthDate && (
                    <div>
                      <span className="font-medium text-foreground">Nascimento:</span>
                      <div className="text-muted-foreground">{format(new Date(collaborator.birthDate), 'dd/MM/yyyy', { locale: ptBR })}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Seção: Informações Básicas */}
            <div className="border rounded-lg">
              <div 
                className="flex items-center gap-2 p-4 cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors"
                onClick={() => toggleFormSection('basic')}
              >
                {formSections.basic ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <h3 className="text-lg font-semibold">Informações Básicas</h3>
              </div>
              
              {formSections.basic && (
                <div className="p-4 pt-0 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="hotelName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do Hotel *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ex: Hotel Copacabana Palace"
                              data-testid="input-hotel-name"
                              disabled={!canEditRecord}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="hotelLocation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Localização do Hotel *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ex: Copacabana, Rio de Janeiro - RJ"
                              data-testid="input-hotel-location"
                              disabled={!canEditRecord}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="reservationNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número da Reserva</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ex: RES123456"
                              data-testid="input-reservation"
                              disabled={!canEditRecord}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="dailyRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Diária (R$)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Ex: 350.00"
                              data-testid="input-daily-rate"
                              disabled={!canEditRecord}
                              {...field}
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="accommodationObservations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Observações adicionais sobre a hospedagem..."
                            data-testid="textarea-observations"
                            disabled={!canEditRecord}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
            
            {/* Seção: Datas e Horários */}
            <div className="border rounded-lg">
              <div 
                className="flex items-center gap-2 p-4 cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors"
                onClick={() => toggleFormSection('dates')}
              >
                {formSections.dates ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <h3 className="text-lg font-semibold">Datas e Horários</h3>
              </div>
              
              {formSections.dates && (
                <div className="p-4 pt-0 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="checkInDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Data Check-in *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  disabled={!canEditRecord}
                                  data-testid="input-checkin-date"
                                >
                                  {field.value ? (
                                    format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                  ) : (
                                    <span>dd/mm/aaaa</span>
                                  )}
                                  <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="checkInTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hora Check-in *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="--:--"
                              data-testid="input-checkin-time"
                              disabled={!canEditRecord}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="checkOutDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Data Check-out *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  disabled={!canEditRecord}
                                  data-testid="input-checkout-date"
                                >
                                  {field.value ? (
                                    format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                  ) : (
                                    <span>dd/mm/aaaa</span>
                                  )}
                                  <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="checkOutTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hora Check-out *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="--:--"
                              data-testid="input-checkout-time"
                              disabled={!canEditRecord}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Seção de Anexos */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <div 
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => toggleFormSection('attachments' as any)}
                >
                  <h4 className="text-base font-semibold text-foreground">📎 Anexos da Hospedagem</h4>
                </div>
              </div>
              
              <AttachmentUpload
                attachmentIds={modalAttachmentIds}
                onAttachmentsChange={(newIds) => {
                  setModalAttachmentIds(newIds);
                }}
                disabled={!canEditRecord}
                title="📎 Anexos da Hospedagem"
              />
              
            </div>
            
            {/* Ações */}
            {canEditRecord && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowModal(false);
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  variant="outline"
                  disabled={createAccommodationMutation.isPending || updateAccommodationMutation.isPending}
                  data-testid="button-save"
                >
                  {(createAccommodationMutation.isPending || updateAccommodationMutation.isPending) && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                  )}
                  Salvar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createAccommodationMutation.isPending || updateAccommodationMutation.isPending}
                  data-testid="button-register"
                >
                  {(createAccommodationMutation.isPending || updateAccommodationMutation.isPending) && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                  )}
                  Registrar Hospedagem
                </Button>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    );
  };

  // Formatação de data no padrão brasileiro
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    const [year, month, day] = dateStr.split('-');
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  };

  // Aplicar dados do registro rápido às hospedagens selecionadas
  const handleApplyToSelected = async () => {
    const quickData = accommodationData["quick"];
    if (!quickData || selectedInclusionsForBatch.length === 0) return;

    // Validar campos obrigatórios
    const requiredFields = [
      { field: 'hotelName', label: 'Nome do Hotel' },
      { field: 'hotelLocation', label: 'Localização' },
      { field: 'dailyRate', label: 'Valor da Diária' },
      { field: 'checkInDate', label: 'Data de Check-in' },
      { field: 'checkOutDate', label: 'Data de Check-out' }
    ];
    
    const missingFields = requiredFields.filter(({ field }) => {
      let value = quickData[field];
      return !value || value === '';
    });
    
    if (missingFields.length > 0) {
      toast({
        title: "Erro",
        description: `Preencha os campos obrigatórios: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    // Validar se valor da diária é numérico
    const dailyRateValue = parseFloat(quickData.dailyRate);
    if (isNaN(dailyRateValue) || dailyRateValue <= 0) {
      toast({
        title: "Erro",
        description: "O valor da diária deve ser um número válido maior que zero",
        variant: "destructive",
      });
      return;
    }

    try {
      let successCount = 0;
      const errors: string[] = [];

      for (const inclusionId of selectedInclusionsForBatch) {
        const inclusion = filteredData.find(inc => inc.id === inclusionId);
        if (!inclusion) continue;

        // Verificar se não tem accommodation já
        if (accommodationMap.get(inclusion.id)) {
          errors.push(`Hospedagem #${inclusion.inclusionNumber} já foi processada`);
          continue;
        }

        try {
          // Criar accommodation com os dados comuns completos
          await createAccommodationMutation.mutateAsync({
            teamInclusionId: inclusion.id,
            hotelName: quickData.hotelName,
            hotelLocation: quickData.hotelLocation,
            checkInDate: quickData.checkInDate,
            checkInTime: quickData.checkInTime || '14:00',
            checkOutDate: quickData.checkOutDate,
            checkOutTime: quickData.checkOutTime || '12:00',
            dailyRate: Math.round(parseFloat(quickData.dailyRate) * 100),
            reservationNumber: quickData.reservationNumber || null,
            accommodationObservations: quickData.accommodationObservations || null,
            attachmentIds: quickData.attachmentIds && quickData.attachmentIds.length > 0 ? quickData.attachmentIds : null
          });

          successCount++;
        } catch (error) {
          errors.push(`Erro na hospedagem #${inclusion.inclusionNumber}`);
        }
      }

      if (successCount > 0) {
        const hasAttachments = quickData.attachmentIds && quickData.attachmentIds.length > 0;
        toast({
          title: "Sucesso",
          description: `${successCount} hospedagem(ns) registrada(s) com os mesmos dados${hasAttachments ? ' e anexos' : ''}!`,
        });
        // Limpar seleções após sucesso
        setSelectedInclusionsForBatch([]);
      }

      if (errors.length > 0) {
        toast({
          title: "Alguns erros ocorreram",
          description: errors.join(", "),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro inesperado ao processar hospedagens em lote",
        variant: "destructive",
      });
    }
  };

  const { data: teamInclusions, isLoading } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const { data: accommodations } = useQuery<Accommodation[]>({
    queryKey: ["/api/accommodations"],
  });

  const { data: tickets } = useQuery<any[]>({
    queryKey: ["/api/tickets"],
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Filtrar team inclusions que precisam de hospedagem (independente de passagem ou nome)
  const teamInclusionsWithAccommodation = useMemo(() => {
    if (!teamInclusions) return [];
    
    const filtered = teamInclusions.filter(inclusion => {
      // Deve precisar de hospedagem
      if (inclusion.needsAccommodation !== true) return false;
      
      // Não pode estar cancelado
      if (inclusion.status === "cancelado") return false;
      
      // Se tem colaborador escalado, aparece INDEPENDENTE do status (workflow flexível)
      if (inclusion.collaboratorId) {
        // OK - Colaborador já foi atribuído, pode registrar hospedagem
        return true;
      }
      
      // Se NÃO tem colaborador, só mostra se estiver nos status específicos
      const validStatusesWithoutCollaborator = [
        "reaberto", "escalado",
        "aguardando_passagem", "aguardando_hospedagem", 
        "passagem", "passagem_comprada",
        "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada",
        "aprovado"
      ];
      
      return validStatusesWithoutCollaborator.includes(inclusion.status);
    });
    return filtered;
  }, [teamInclusions]);

  // Criar map de accommodations por teamInclusionId
  const accommodationMap = useMemo(() => {
    if (!accommodations) return new Map();
    return new Map(accommodations.map(acc => [acc.teamInclusionId, acc]));
  }, [accommodations]);


  // Filtrar e ordenar dados
  const filteredData = useMemo(() => {
    let data = teamInclusionsWithAccommodation.filter(inclusion => {
      const matchesEvent = filters.eventId === "all" || inclusion.eventId === filters.eventId;
      const matchesFunction = filters.functionId.length === 0 || filters.functionId.includes(inclusion.functionId);
      const matchesCollaborator = filters.collaboratorId === "all" || inclusion.collaboratorId === filters.collaboratorId;
      
      const matchesSearchId = filters.searchId === "" || 
        inclusion.inclusionNumber?.toString().toLowerCase().includes(filters.searchId.toLowerCase());

      const accommodation = accommodationMap.get(inclusion.id);
      const accommodationStatus = accommodation ? "processed" : "pending";
      const matchesAccommodationStatus = filters.accommodationStatus === "all" || 
        filters.accommodationStatus === accommodationStatus;

      const matchesInclusionStatus = filters.inclusionStatus === "all" || 
        (filters.inclusionStatus === "active" && inclusion.status !== "cancelado");

      return matchesEvent && matchesFunction && matchesCollaborator && matchesSearchId && 
             matchesAccommodationStatus && matchesInclusionStatus;
    });

    // Aplicar ordenação
    if (sortConfig) {
      data = data.sort((a, b) => {
        const aValue = getFieldValue(a, sortConfig.field);
        const bValue = getFieldValue(b, sortConfig.field);
        
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [teamInclusionsWithAccommodation, accommodationMap, filters, sortConfig]);

  // Função auxiliar para obter valor de campo para ordenação
  const getFieldValue = (inclusion: TeamInclusion, field: string) => {
    const event = events?.find(e => e.id === inclusion.eventId);
    const func = functions?.find(f => f.id === inclusion.functionId);
    const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
    const accommodation = accommodationMap.get(inclusion.id);

    switch (field) {
      case 'eventName': return event?.name || '';
      case 'functionName': return func?.name || '';
      case 'collaboratorName': return fixEncoding(collaborator?.fullName) || '';
      case 'inclusionNumber': return inclusion.inclusionNumber || '';
      case 'checkInDate': return accommodation?.checkInDate || null;
      case 'checkOutDate': return accommodation?.checkOutDate || null;
      case 'hotelName': return accommodation?.hotelName || '';
      case 'hotelLocation': return accommodation?.hotelLocation || '';
      default: return '';
    }
  };

  // Mutations
  const createAccommodationMutation = useMutation({
    mutationFn: async (accommodationData: any) => {
      // 1. Criar accommodation
      const accommodation = await apiRequest("POST", "/api/accommodations", accommodationData);
      
      // 2. Atualizar status do teamInclusion - hospedagem agora é independente de passagem
      const inclusion = teamInclusions?.find(inc => inc.id === accommodationData.teamInclusionId);
      const needsTicket = inclusion?.needsTicket;
      const ticket = tickets?.find(t => t.teamInclusionId === accommodationData.teamInclusionId);
      const ticketPurchased = ticket && (ticket.purchaseDate || ticket.actualDepartureDate);
      
      let newStatus = "hospedagem_comprada";
      let newPhase = "hospedagem";
      
      // Se precisa de passagem E passagem já foi comprada, marcar como ambos comprados
      if (needsTicket && ticketPurchased) {
        newStatus = "hospedagem_passagem_comprada";
        newPhase = "hospedagem";
      }
      // Senão, apenas marcar hospedagem como comprada (independente se precisa ou não de passagem)
      
      await apiRequest("PATCH", `/api/team-inclusions/${accommodationData.teamInclusionId}`, {
        status: newStatus,
        phase: newPhase,
        updatedBy: user?.id
      });
      
      return accommodation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      toast({
        title: "✅ Sucesso",
        description: "Hospedagem registrada com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error("Erro ao criar hospedagem:", error);
      toast({
        variant: "destructive",
        title: "❌ Erro",
        description: error?.message || "Erro ao registrar hospedagem",
      });
    },
  });

  const updateAccommodationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiRequest("PATCH", `/api/accommodations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      setEditingAccommodationId(null);
      toast({
        title: "✅ Sucesso",
        description: "Hospedagem atualizada com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error("Erro ao atualizar hospedagem:", error);
      toast({
        variant: "destructive",
        title: "❌ Erro",
        description: error?.message || "Erro ao atualizar hospedagem",
      });
    },
  });

  const updateTeamInclusionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiRequest("PATCH", `/api/team-inclusions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (error: any) => {
      console.error("Erro ao atualizar inclusão de equipe:", error);
    },
  });

  // Funções auxiliares
  const handleCreateAccommodation = (inclusion: TeamInclusion) => {
    if (!canPerformActions(inclusion)) {
      toast({
        variant: "destructive",
        title: "❌ Acesso Negado",
        description: "Você não tem permissão para criar hospedagem.",
      });
      return;
    }

    const accommodationData = {
      teamInclusionId: inclusion.id,
      updatedBy: user?.id,
    };

    createAccommodationMutation.mutate(accommodationData);
  };

  const handleUpdateAccommodation = (accommodationId: string, formData: FormData) => {
    const accommodation = accommodations?.find(acc => acc.id === accommodationId);
    const inclusion = accommodation ? teamInclusions?.find(inc => inc.id === accommodation.teamInclusionId) : null;
    
    if (!inclusion || !canPerformActions(inclusion)) {
      toast({
        variant: "destructive",
        title: "❌ Acesso Negado",  
        description: "Você não tem permissão para atualizar hospedagem.",
      });
      return;
    }

    const data = Object.fromEntries(formData.entries());
    
    // Converter campos de data vazios para null
    const cleanedData = {
      ...data,
      checkInDate: data.checkInDate || null,
      checkInTime: data.checkInTime || null,
      checkOutDate: data.checkOutDate || null,
      checkOutTime: data.checkOutTime || null,
      hotelLocation: data.hotelLocation || null,
      hotelName: data.hotelName || null,
      accommodationObservations: data.accommodationObservations || null,
      updatedBy: user?.id,
    };

    updateAccommodationMutation.mutate({
      id: accommodationId,
      data: cleanedData
    });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  if (!canView(user, "accommodations")) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  const canEditField = canEditScreen(user, "accommodations");

  return (
    <>
      <div className="bg-card rounded-lg shadow-sm border border-border mb-6">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">🏨 Hospedagem</h2>
                <p className="text-muted-foreground">Gerencie as reservas de hospedagem para os colaboradores escalados.</p>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{filteredData.length}</div>
                  <div className="text-xs text-muted-foreground">hospedagens</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{filteredData.filter(inc => accommodationMap.get(inc.id)).length}</div>
                  <div className="text-xs text-muted-foreground">compradas</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{filteredData.filter(inc => !accommodationMap.get(inc.id)).length}</div>
                  <div className="text-xs text-muted-foreground">pendentes</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SimpleFilters filters={filters} onFiltersChange={setFilters} />

        <div className="bg-card rounded-lg shadow-sm border border-border p-4 mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <Label className="text-sm font-medium text-foreground">Status da Hospedagem:</Label>
            <Select
              value={filters.accommodationStatus}
              onValueChange={(value) => setFilters({ ...filters, accommodationStatus: value })}
            >
              <SelectTrigger className="mt-1" data-testid="select-accommodation-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="processed">Processado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-sm font-medium text-foreground">Status da Inclusão:</Label>
            <Select
              value={filters.inclusionStatus}
              onValueChange={(value) => setFilters({ ...filters, inclusionStatus: value })}
            >
              <SelectTrigger className="mt-1" data-testid="select-inclusion-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="cancelado">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => setFilters({
              eventId: "all",
              functionId: [], 
              collaboratorId: "all",
              searchId: "",
              accommodationStatus: "all",
              inclusionStatus: "active",
            })}
            data-testid="clear-filters"
          >
            Limpar Filtros
          </Button>
        </div>

        {/* Seção de Registro Rápido */}
        <div className="px-6 py-4 border-b border-border bg-accent/20 rounded-lg border">
          <div 
            className="flex items-center gap-2 cursor-pointer mb-4"
            onClick={() => toggleSection('basic')}
          >
            {expandedSections.basic ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <h3 className="text-lg font-semibold text-foreground">🏨 Registro Rápido em Lote</h3>
            <span className="text-sm text-muted-foreground">(Aplicar mesmos dados a múltiplas hospedagens)</span>
          </div>

          {expandedSections.basic && (
            <>
              {/* Grade Organizada por Seções */}
              <div className="space-y-4">
                {/* Seção de Informações Gerais */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-md">
                  <div>
                    <Label className="text-[10px] font-medium">Nome do Hotel *</Label>
                    <Input
                      placeholder="Hotel Copacabana"
                      value={accommodationData["quick"]?.hotelName || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "hotelName", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-hotel-name"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">Localização *</Label>
                    <Input
                      placeholder="Rio de Janeiro, RJ"
                      value={accommodationData["quick"]?.hotelLocation || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "hotelLocation", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-hotel-location"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">Valor da Diária *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="250.00"
                      value={accommodationData["quick"]?.dailyRate || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "dailyRate", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-daily-rate"
                    />
                  </div>
                </div>

                {/* Seção de Datas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Check-in */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                    <h5 className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1">
                      📅 CHECK-IN
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] font-medium">Data *</Label>
                        <Input
                          type="date"
                          value={accommodationData["quick"]?.checkInDate || ""}
                          onChange={(e) => handleAccommodationDataChange("quick", "checkInDate", e.target.value)}
                          className="h-6 text-xs px-1"
                          data-testid="input-quick-checkin-date"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-medium">Horário</Label>
                        <Input
                          type="time"
                          value={accommodationData["quick"]?.checkInTime || "14:00"}
                          onChange={(e) => handleAccommodationDataChange("quick", "checkInTime", e.target.value)}
                          className="h-6 text-xs px-1"
                          data-testid="input-quick-checkin-time"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Check-out */}
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-md">
                    <h5 className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-2 flex items-center gap-1">
                      📅 CHECK-OUT
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] font-medium">Data *</Label>
                        <Input
                          type="date"
                          value={accommodationData["quick"]?.checkOutDate || ""}
                          onChange={(e) => handleAccommodationDataChange("quick", "checkOutDate", e.target.value)}
                          className="h-6 text-xs px-1"
                          data-testid="input-quick-checkout-date"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-medium">Horário</Label>
                        <Input
                          type="time"
                          value={accommodationData["quick"]?.checkOutTime || "12:00"}
                          onChange={(e) => handleAccommodationDataChange("quick", "checkOutTime", e.target.value)}
                          className="h-6 text-xs px-1"
                          data-testid="input-quick-checkout-time"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção de Informações Adicionais */}
                <div className="grid grid-cols-1 gap-2 p-3 bg-gray-50 dark:bg-gray-950/30 rounded-md">
                  <div>
                    <Label className="text-[10px] font-medium">Reserva/LOC (opcional)</Label>
                    <Input
                      placeholder="Número da reserva"
                      value={accommodationData["quick"]?.reservationNumber || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "reservationNumber", e.target.value)}
                      className="h-6 text-xs px-1 max-w-48"
                      data-testid="input-quick-reservation-number"
                    />
                  </div>
                  <div className="mt-2">
                    <Label className="text-[10px] font-medium">Observações sobre a hospedagem (opcional)</Label>
                    <Textarea
                      placeholder="Informações adicionais sobre a hospedagem..."
                      value={accommodationData["quick"]?.accommodationObservations || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "accommodationObservations", e.target.value)}
                      className="h-16 text-xs px-2 py-1 resize-none"
                      data-testid="textarea-quick-accommodation-observations"
                    />
                  </div>
                </div>

                {/* Seção de Anexos */}
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-md">
                  <h5 className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                    📎 ANEXOS DA HOSPEDAGEM
                  </h5>
                  <AttachmentUpload
                    attachmentIds={accommodationData["quick"]?.attachmentIds || []}
                    onAttachmentsChange={(attachmentIds) => 
                      handleAccommodationDataChange("quick", "attachmentIds", attachmentIds)
                    }
                    disabled={!canEditScreen(user, 'accommodations')}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Preencha os dados comuns e selecione as hospedagens na tabela para aplicar
                  {selectedInclusionsForBatch.length > 0 && (
                    <span className="text-blue-600 font-medium ml-2">
                      ({selectedInclusionsForBatch.length} hospedagens selecionadas)
                    </span>
                  )}
                </div>
                {canEditScreen(user, 'accommodations') && (
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleApplyToSelected}
                      disabled={
                        selectedInclusionsForBatch.length === 0 || 
                        createAccommodationMutation.isPending
                      }
                      data-testid="button-apply-to-selected"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {createAccommodationMutation.isPending ? "Aplicando..." : `Aplicar a ${selectedInclusionsForBatch.length} Hospedagens`}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Limpar campos do registro rápido
                        setAccommodationData(prev => {
                          const newData = { ...prev };
                          delete newData["quick"];
                          return newData;
                        });
                      }}
                      disabled={!accommodationData["quick"] || Object.keys(accommodationData["quick"]).length === 0}
                      data-testid="button-clear-quick"
                    >
                      Limpar Campos
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedInclusionsForBatch.length > 0}
                      onChange={toggleAllInclusions}
                      className="rounded border-gray-300 mr-2"
                      data-testid="checkbox-select-all"
                    />
                    Seleção
                  </th>
                  <SortableHeader 
                    field="id" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    ID
                  </SortableHeader>
                  <SortableHeader 
                    field="event" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Evento
                  </SortableHeader>
                  <SortableHeader 
                    field="function" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Função
                  </SortableHeader>
                  <SortableHeader 
                    field="collaborator" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Colaborador
                  </SortableHeader>
                  <SortableHeader 
                    field="date" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Check-in
                  </SortableHeader>
                  <SortableHeader 
                    field="status" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Check-out
                  </SortableHeader>
                  <SortableHeader 
                    field="status" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Hotel
                  </SortableHeader>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.map((inclusion) => {
                  const event = events?.find(e => e.id === inclusion.eventId);
                  const func = functions?.find(f => f.id === inclusion.functionId);
                  const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
                  const accommodation = accommodationMap.get(inclusion.id);
                  const hasAccommodation = !!accommodation;

                  return (
                    <tr 
                      key={inclusion.id} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      data-testid={`accommodation-row-${inclusion.inclusionNumber}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {!accommodation && inclusion.status !== 'cancelado' ? (
                          <input
                            type="checkbox"
                            checked={selectedInclusionsForBatch.includes(inclusion.id)}
                            onChange={() => toggleInclusionSelection(inclusion.id)}
                            className="rounded border-gray-300"
                            data-testid={`checkbox-inclusion-${inclusion.id}`}
                          />
                        ) : (
                          <div className="w-4 h-4"></div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-gray-900 dark:text-white ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} 
                          data-testid={`accommodation-id-${inclusion.inclusionNumber}`}
                          onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewAccommodationDetails(inclusion)}>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-mono text-foreground">
                            <span>#{inclusion.inclusionNumber || 'N/A'}</span>
                          </div>
                          <div title={inclusion.status === 'cancelado' ? 'Não é possível interagir com registros cancelados' : ''}>
                            <Eye 
                              className={`w-4 h-4 transition-colors ${inclusion.status === 'cancelado' ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800 cursor-pointer'}`}
                            />
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} 
                          data-testid={`accommodation-event-${inclusion.inclusionNumber}`}
                          onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewAccommodationDetails(inclusion)}>
                        {event?.name}
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} 
                          data-testid={`accommodation-function-${inclusion.inclusionNumber}`}
                          onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewAccommodationDetails(inclusion)}>
                        {func?.name}
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} 
                          data-testid={`accommodation-collaborator-${inclusion.inclusionNumber}`}
                          onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewAccommodationDetails(inclusion)}>
                        {fixEncoding(collaborator?.fullName)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} 
                          data-testid={`accommodation-checkin-${inclusion.inclusionNumber}`}
                          onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewAccommodationDetails(inclusion)}>
                        {accommodation?.checkInDate ? (
                          <div className="text-sm font-medium text-foreground">
                            <div>{formatDate(accommodation.checkInDate)}</div>
                            {accommodation.checkInTime && (
                              <div className="text-xs text-blue-600">{accommodation.checkInTime}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">-</div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} 
                          data-testid={`accommodation-checkout-${inclusion.inclusionNumber}`}
                          onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewAccommodationDetails(inclusion)}>
                        {accommodation?.checkOutDate ? (
                          <div className="text-sm font-medium text-foreground">
                            <div>{formatDate(accommodation.checkOutDate)}</div>
                            {accommodation.checkOutTime && (
                              <div className="text-xs text-blue-600">{accommodation.checkOutTime}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">-</div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} 
                          data-testid={`accommodation-hotel-${inclusion.inclusionNumber}`}
                          onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewAccommodationDetails(inclusion)}>
                        {accommodation?.hotelName && (
                          <div>
                            <div>{accommodation.hotelName}</div>
                            {accommodation.hotelLocation && (
                              <div className="text-xs text-gray-500">{accommodation.hotelLocation}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" data-testid={`accommodation-status-${inclusion.inclusionNumber}`}>
                        <StatusBadge 
                          status={inclusion.status} 
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {hasAccommodation && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedInclusion(inclusion);
                                setShowCommentsModal(true);
                              }}
                              data-testid={`comments-accommodation-${inclusion.inclusionNumber}`}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {filteredData.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400" data-testid="no-accommodations">
                Nenhuma inclusão com hospedagem encontrada.
              </div>
            )}
          </div>
        </div>

      {/* Modal de Hospedagem */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <AccommodationModal />
      </Dialog>

      {/* Modal de Comentários */}
      {showCommentsModal && selectedInclusion && (
        <CommentsModal
          open={showCommentsModal}
          onClose={() => setShowCommentsModal(false)}
          teamInclusionId={selectedInclusion.id}
        />
      )}
    </>
  );
}

// Componente separado para o formulário de detalhes
function AccommodationDetailForm({
  inclusion,
  accommodation,
  events,
  functions,
  collaborators,
  users,
  canEditField,
  editingAccommodationId,
  setEditingAccommodationId,
  onSubmit,
  expandedSections,
  setExpandedSections,
  isUpdating
}: {
  inclusion: TeamInclusion;
  accommodation?: Accommodation;
  events?: Event[];
  functions?: Function[];
  collaborators?: Collaborator[];
  users?: any[];
  canEditField: boolean;
  editingAccommodationId: string | null;
  setEditingAccommodationId: (id: string | null) => void;
  onSubmit: (accommodationId: string, formData: FormData) => void;
  expandedSections: Record<string, boolean>;
  setExpandedSections: (sections: Record<string, boolean>) => void;
  isUpdating: boolean;
}) {
  const event = events?.find(e => e.id === inclusion.eventId);
  const func = functions?.find(f => f.id === inclusion.functionId);
  const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
  const isEditing = accommodation && editingAccommodationId === accommodation.id;
  const isReadOnlyMode = isReadOnly(inclusion);

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section]
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!accommodation) return;
    
    const formData = new FormData(e.currentTarget);
    onSubmit(accommodation.id, formData);
  };

  if (!accommodation) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Nenhuma hospedagem encontrada para esta inclusão.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Informações da Inclusão */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Informações da Inclusão</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><strong>ID:</strong> {inclusion.inclusionNumber}</div>
          <div><strong>Evento:</strong> {event?.name}</div>
          <div><strong>Função:</strong> {func?.name}</div>
          <div><strong>Colaborador:</strong> {fixEncoding(collaborator?.fullName)}</div>
        </div>
      </div>

      {/* Formulário de Hospedagem */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Seção Básica */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => toggleSection('basic')}
            className="flex items-center justify-between w-full p-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-t-lg"
          >
            <span className="font-medium">Informações Básicas</span>
            {expandedSections.basic ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {expandedSections.basic && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hotelName">Nome do Hotel</Label>
                  <Input
                    id="hotelName"
                    name="hotelName"
                    defaultValue={accommodation.hotelName || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-hotel-name"
                  />
                </div>
                <div>
                  <Label htmlFor="hotelLocation">Localização do Hotel</Label>
                  <Input
                    id="hotelLocation"
                    name="hotelLocation"
                    defaultValue={accommodation.hotelLocation || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-hotel-location"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Seção Datas */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => toggleSection('dates')}
            className="flex items-center justify-between w-full p-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-t-lg"
          >
            <span className="font-medium">Datas e Horários</span>
            {expandedSections.dates ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {expandedSections.dates && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="checkInDate">Data Check-in</Label>
                  <Input
                    id="checkInDate"
                    name="checkInDate"
                    type="date"
                    defaultValue={accommodation.checkInDate || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkin-date"
                  />
                </div>
                <div>
                  <Label htmlFor="checkInTime">Hora Check-in</Label>
                  <Input
                    id="checkInTime"
                    name="checkInTime"
                    type="time"
                    defaultValue={accommodation.checkInTime || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkin-time"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="checkOutDate">Data Check-out</Label>
                  <Input
                    id="checkOutDate"
                    name="checkOutDate"
                    type="date"
                    defaultValue={accommodation.checkOutDate || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkout-date"
                  />
                </div>
                <div>
                  <Label htmlFor="checkOutTime">Hora Check-out</Label>
                  <Input
                    id="checkOutTime"
                    name="checkOutTime"
                    type="time"
                    defaultValue={accommodation.checkOutTime || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkout-time"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Seção Adicional */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => toggleSection('additional')}
            className="flex items-center justify-between w-full p-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-t-lg"
          >
            <span className="font-medium">Informações Adicionais</span>
            {expandedSections.additional ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {expandedSections.additional && (
            <div className="p-4 space-y-4">
              <div>
                <Label htmlFor="accommodationObservations">Observações</Label>
                <Textarea
                  id="accommodationObservations"
                  name="accommodationObservations"
                  rows={3}
                  defaultValue={accommodation.accommodationObservations || ""}
                  disabled={!canEdit || (!isEditing && !isReadOnlyMode)}
                  data-testid="textarea-observations"
                />
              </div>
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          {canEditField && !isReadOnlyMode && (
            <>
              {!isEditing ? (
                <Button
                  type="button"
                  onClick={() => setEditingAccommodationId(accommodation.id)}
                  data-testid="button-edit-accommodation"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingAccommodationId(null)}
                    disabled={isUpdating}
                    data-testid="button-cancel-edit"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isUpdating}
                    data-testid="button-save-accommodation"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isUpdating ? "Salvando..." : "Salvar"}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}