import { useState, useMemo, useEffect, useRef } from "react";
import { fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Hotel, Save, Eye, ChevronDown, ChevronRight, MessageCircle, Edit, Calendar, Clock } from "lucide-react";
import StatusBadge from "@/components/common/status-badge";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
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

// Chips de anexos clicáveis para o modal pós-compra
function AttachmentChips({ attachmentIds }: { attachmentIds: string[] }) {
  const [meta, setMeta] = useState<Record<string, { name: string; downloadUrl: string }>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    attachmentIds.forEach(async (id) => {
      if (fetchedRef.current.has(id)) return;
      fetchedRef.current.add(id);
      try {
        const res = await fetch(`/api/attachments/${id}`);
        if (res.ok) {
          const data = await res.json();
          const rawName: string = data.name || `Anexo_${id.slice(-8)}`;
          const displayName = rawName.includes('/') ? rawName.split('/').pop() || rawName : rawName;
          setMeta(prev => ({ ...prev, [id]: { name: displayName, downloadUrl: data.downloadUrl || '#' } }));
        }
      } catch {
        setMeta(prev => ({ ...prev, [id]: { name: `Anexo_${id.slice(-8)}`, downloadUrl: '#' } }));
      }
    });
  }, [attachmentIds]);

  return (
    <div>
      <div style={{fontSize:13,fontWeight:600,color:'#3B5BDB',marginBottom:10}}>📎 Anexos da Hospedagem</div>
      {attachmentIds.length === 0 ? (
        <div style={{textAlign:'center',color:'#94A3B8',fontSize:13,padding:'16px 0'}}>Nenhum anexo registrado</div>
      ) : (
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {attachmentIds.map(id => (
            <a
              key={id}
              href={meta[id]?.downloadUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{display:'flex',alignItems:'center',gap:8,background:'#EEF2FF',border:'1px solid #C7D2FE',borderRadius:8,padding:'8px 12px',cursor:'pointer',textDecoration:'none',color:'#1E293B',fontSize:13,transition:'background 0.15s'}}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#E0E7FF'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#EEF2FF'; }}
            >
              <span>📄</span>
              <span>{meta[id]?.name || id.slice(-8)}</span>
              <span style={{color:'#6366F1'}}>🔗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

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
    const isPostPurchase = ['hospedagem_comprada', 'hospedagem_passagem_comprada'].includes(selectedInclusion?.status || '');
    const canEditRecord = selectedInclusion && user && canEdit(user) && selectedInclusion.status !== 'cancelado' && !isPostPurchase;
    
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
    
    const NA = () => <span style={{background:'#F1F5F9',color:'#94A3B8',fontSize:12,padding:'2px 8px',borderRadius:20}}>Não informado</span>;

    return (
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Accessibility title (screen reader only) */}
        <DialogHeader className="sr-only">
          <DialogTitle>{isEditing ? 'Editar Hospedagem' : 'Nova Hospedagem'}</DialogTitle>
          <DialogDescription>Modal de hospedagem</DialogDescription>
        </DialogHeader>

        {/* Visual header */}
        <div style={{padding:'24px 24px 16px',borderBottom:'1px solid #E2E8F0'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:12,paddingRight:44}}>
            <span style={{fontSize:22,lineHeight:1}}>🏨</span>
            <div style={{flex:1}}>
              <h2 style={{margin:0,fontSize:20,fontWeight:700,color:'#1E293B',lineHeight:1.2}}>
                {isEditing ? 'Editar Hospedagem' : 'Nova Hospedagem'}
              </h2>
              <p style={{margin:'4px 0 0',fontSize:13,color:'#94A3B8'}}>
                {isEditing ? 'Dados de hospedagem desta inclusão' : 'Preencha os dados de hospedagem para esta inclusão'}
              </p>
            </div>
          </div>

          {/* Badges row */}
          <div style={{display:'flex',gap:6,marginTop:12,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{background:'#EEF2FF',color:'#3B5BDB',fontWeight:700,fontSize:12,padding:'3px 10px',borderRadius:20}}>
              #{selectedInclusion.inclusionNumber || 'N/A'}
            </span>
            {event?.name && (
              <span style={{background:'#F1F5F9',color:'#475569',fontSize:12,padding:'3px 10px',borderRadius:20}}>
                {event.name}
              </span>
            )}
            {func?.name && (
              <span style={{background:'#F1F5F9',color:'#475569',fontSize:12,padding:'3px 10px',borderRadius:20}}>
                {func.name}
              </span>
            )}
            <StatusBadge status={getDisplayStatus(selectedInclusion)} />
          </div>

          {/* Collaborator card */}
          {collaborator && (
            <div style={{background:'#F8FAFC',borderRadius:12,border:'1px solid #E2E8F0',padding:'16px 20px',marginTop:16}}>
              <div style={{fontSize:11,fontWeight:600,color:'#94A3B8',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:12}}>
                Dados do Colaborador
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px'}}>
                <div>
                  <div style={{fontSize:11,color:'#94A3B8',marginBottom:2}}>Nome:</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>{fixEncoding(collaborator.fullName) || <NA />}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#94A3B8',marginBottom:2}}>{collaborator.documentType === 'cpf' ? 'CPF:' : 'RG:'}</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>{collaborator.officialDocument || <NA />}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#94A3B8',marginBottom:2}}>Cidade:</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>{collaborator.city || <NA />}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#94A3B8',marginBottom:2}}>Nascimento:</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>
                    {collaborator.birthDate ? format(new Date(collaborator.birthDate), 'dd/MM/yyyy', { locale: ptBR }) : <NA />}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{padding:'20px 24px 24px'}}>
          {isPostPurchase ? (
            /* ───── Read-only post-purchase view ───── */
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Green locked banner */}
              <div style={{background:'#D1FAE5',borderLeft:'4px solid #10B981',padding:'12px 16px',borderRadius:'0 8px 8px 0'}}>
                <span style={{color:'#065F46',fontWeight:600,fontSize:14}}>✓ Hospedagem registrada — edição bloqueada</span>
              </div>

              {accommodation && (
                <>
                  {/* Hotel summary */}
                  <div style={{background:'#F0FDF4',border:'1px solid #A7F3D0',borderRadius:12,padding:'16px 20px'}}>
                    <div style={{fontSize:18,fontWeight:700,color:'#1E293B'}}>{accommodation.hotelName}</div>
                    {accommodation.hotelLocation && (
                      <div style={{fontSize:13,color:'#64748B',marginTop:4}}>{accommodation.hotelLocation}</div>
                    )}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16,paddingTop:16,borderTop:'1px solid #A7F3D0'}}>
                      <div>
                        <div style={{fontSize:11,color:'#64748B',marginBottom:4}}>Diária (R$)</div>
                        <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>
                          {accommodation.dailyRate != null && accommodation.dailyRate > 0
                            ? `R$ ${(accommodation.dailyRate / 100).toFixed(2).replace('.', ',')}`
                            : <span style={{background:'#F1F5F9',color:'#94A3B8',borderRadius:20,padding:'2px 10px',fontSize:12}}>Não informado</span>}
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:11,color:'#64748B',marginBottom:4}}>Reserva/LOC</div>
                        <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>
                          {accommodation.reservationNumber
                            ? accommodation.reservationNumber
                            : <span style={{background:'#F1F5F9',color:'#94A3B8',borderRadius:20,padding:'2px 10px',fontSize:12}}>Não informado</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CHECK-IN + CHECK-OUT static */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'stretch'}}>
                    <div style={{display:'flex',flexDirection:'column',border:'1px solid #C7D2FE',borderLeft:'3px solid #3B5BDB',background:'#EEF2FF',borderRadius:10,padding:16}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#3B5BDB',marginBottom:12}}>🗓 CHECK-IN</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:500,color:'#64748B',marginBottom:4}}>Data</div>
                          <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>
                            {accommodation.checkInDate ? formatDate(accommodation.checkInDate) : <span style={{background:'#F1F5F9',color:'#94A3B8',borderRadius:20,padding:'2px 10px',fontSize:12}}>Não informado</span>}
                          </div>
                        </div>
                        <div>
                          <div style={{fontSize:12,fontWeight:500,color:'#64748B',marginBottom:4}}>Horário</div>
                          <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>
                            {accommodation.checkInTime || <span style={{background:'#F1F5F9',color:'#94A3B8',borderRadius:20,padding:'2px 10px',fontSize:12}}>Não informado</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',border:'1px solid #FED7AA',borderLeft:'3px solid #F59E0B',background:'#FFF7ED',borderRadius:10,padding:16}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#F59E0B',marginBottom:12}}>🗓 CHECK-OUT</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:500,color:'#64748B',marginBottom:4}}>Data</div>
                          <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>
                            {accommodation.checkOutDate ? formatDate(accommodation.checkOutDate) : <span style={{background:'#F1F5F9',color:'#94A3B8',borderRadius:20,padding:'2px 10px',fontSize:12}}>Não informado</span>}
                          </div>
                        </div>
                        <div>
                          <div style={{fontSize:12,fontWeight:500,color:'#64748B',marginBottom:4}}>Horário</div>
                          <div style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>
                            {accommodation.checkOutTime || <span style={{background:'#F1F5F9',color:'#94A3B8',borderRadius:20,padding:'2px 10px',fontSize:12}}>Não informado</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Observações static */}
                  {accommodation.accommodationObservations && (
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Observações</div>
                      <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#1E293B'}}>
                        {accommodation.accommodationObservations}
                      </div>
                    </div>
                  )}

                  {/* Anexos read-only — chips clicáveis */}
                  <AttachmentChips attachmentIds={accommodation.attachmentIds || []} />
                </>
              )}

              {/* Footer — Fechar only */}
              <div style={{borderTop:'1px solid #E2E8F0',paddingTop:16,display:'flex',justifyContent:'flex-end'}}>
                <Button variant="outline" onClick={() => setShowModal(false)}
                  style={{borderColor:'#E2E8F0',color:'#64748B'}}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            /* ───── Editable form ───── */
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} style={{display:'flex',flexDirection:'column',gap:20}}>

                {/* Seção: Informações Básicas */}
                <div style={{border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden'}}>
                  <div
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',cursor:'pointer',background:'#FFFBEB',borderLeft:'4px solid #F59E0B',borderRadius:formSections.basic ? '8px 8px 0 0' : '8px'}}
                    onClick={() => toggleFormSection('basic')}
                  >
                    <span style={{fontSize:15}}>🏨</span>
                    <span style={{fontWeight:700,fontSize:14,color:'#1E293B',flex:1}}>Informações Básicas</span>
                    <ChevronDown style={{width:16,height:16,color:'#94A3B8',transform:formSections.basic ? 'rotate(0deg)' : 'rotate(-90deg)',transition:'transform 0.2s'}} />
                  </div>

                  {formSections.basic && (
                    <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>
                      {/* Row 1: Hotel Name | Hotel Location */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <FormField control={form.control} name="hotelName" render={({ field }) => (
                          <FormItem>
                            <FormLabel style={{fontSize:11,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Nome do Hotel *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Hotel Copacabana Palace" data-testid="input-hotel-name"
                                disabled={!canEditRecord} {...field}
                                style={{borderRadius:8,height:42,borderColor:'#E2E8F0'}} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="hotelLocation" render={({ field }) => (
                          <FormItem>
                            <FormLabel style={{fontSize:11,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Localização do Hotel *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Copacabana, Rio de Janeiro" data-testid="input-hotel-location"
                                disabled={!canEditRecord} {...field}
                                style={{borderRadius:8,height:42,borderColor:'#E2E8F0'}} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      {/* Row 2: Reserva | Diária */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <FormField control={form.control} name="reservationNumber" render={({ field }) => (
                          <FormItem>
                            <FormLabel style={{fontSize:11,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Número da Reserva</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: RES123456" data-testid="input-reservation"
                                disabled={!canEditRecord} {...field}
                                style={{borderRadius:8,height:42,borderColor:'#E2E8F0'}} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="dailyRate" render={({ field }) => (
                          <FormItem>
                            <FormLabel style={{fontSize:11,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Diária (R$)</FormLabel>
                            <FormControl>
                              <div style={{display:'flex',alignItems:'center',border:'1px solid #E2E8F0',borderRadius:8,height:42,overflow:'hidden',background: canEditRecord ? '#fff' : '#F8FAFC'}}>
                                <span style={{paddingLeft:12,paddingRight:12,color:'#64748B',fontSize:14,fontWeight:500,borderRight:'1px solid #E2E8F0',height:'100%',display:'flex',alignItems:'center',background:'#F8FAFC',flexShrink:0,whiteSpace:'nowrap'}}>R$</span>
                                <input
                                  type="number" step="0.01" min="0" placeholder="0,00"
                                  data-testid="input-daily-rate"
                                  disabled={!canEditRecord}
                                  value={field.value || ''}
                                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                  style={{flex:1,border:'none',outline:'none',paddingLeft:8,paddingRight:12,fontSize:14,color:'#1E293B',background:'transparent',minWidth:0,height:'100%'}}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      {/* Observações */}
                      <FormField control={form.control} name="accommodationObservations" render={({ field }) => (
                        <FormItem>
                          <FormLabel style={{fontSize:11,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Observações</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Observações adicionais sobre a hospedagem..."
                              data-testid="textarea-observations" disabled={!canEditRecord} {...field}
                              style={{borderRadius:8,minHeight:80,borderColor:'#E2E8F0'}} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}
                </div>

                {/* Seção: Datas e Horários — CHECK-IN + CHECK-OUT side by side */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'stretch'}}>
                  {/* CHECK-IN */}
                  <div style={{display:'flex',flexDirection:'column',border:'1px solid #C7D2FE',borderLeft:'3px solid #3B5BDB',background:'#EEF2FF',borderRadius:10,padding:16}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#3B5BDB',marginBottom:12}}>🗓 CHECK-IN</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,alignItems:'end'}}>
                      <FormField control={form.control} name="checkInDate" render={({ field }) => (
                        <FormItem className="flex flex-col" style={{margin:0}}>
                          <FormLabel style={{fontSize:12,color:'#64748B',fontWeight:500,marginBottom:4}}>Data *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" className={cn("w-full pl-3 text-left font-normal",!field.value && "text-muted-foreground")}
                                  disabled={!canEditRecord} data-testid="input-checkin-date"
                                  style={{borderRadius:8,height:42,borderColor:'#CBD5E1',background:'#fff',fontSize:13,width:'100%',boxSizing:'border-box'}}>
                                  {field.value ? format(field.value, "dd/MM/yyyy", { locale: ptBR }) : <span>dd/mm/aaaa</span>}
                                  <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange}
                                disabled={(date) => date < new Date("1900-01-01")} initialFocus />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="checkInTime" render={({ field }) => (
                        <FormItem className="flex flex-col" style={{margin:0}}>
                          <FormLabel style={{fontSize:12,color:'#64748B',fontWeight:500,marginBottom:4}}>Horário *</FormLabel>
                          <FormControl>
                            <Input placeholder="--:--" data-testid="input-checkin-time"
                              disabled={!canEditRecord} {...field}
                              style={{borderRadius:8,height:42,borderColor:'#CBD5E1',background:'#fff',fontSize:13,width:'100%',padding:'0 12px',boxSizing:'border-box'}} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  {/* CHECK-OUT */}
                  <div style={{display:'flex',flexDirection:'column',border:'1px solid #FED7AA',borderLeft:'3px solid #F59E0B',background:'#FFF7ED',borderRadius:10,padding:16}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#F59E0B',marginBottom:12}}>🗓 CHECK-OUT</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,alignItems:'end'}}>
                      <FormField control={form.control} name="checkOutDate" render={({ field }) => (
                        <FormItem className="flex flex-col" style={{margin:0}}>
                          <FormLabel style={{fontSize:12,color:'#64748B',fontWeight:500,marginBottom:4}}>Data *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" className={cn("w-full pl-3 text-left font-normal",!field.value && "text-muted-foreground")}
                                  disabled={!canEditRecord} data-testid="input-checkout-date"
                                  style={{borderRadius:8,height:42,borderColor:'#CBD5E1',background:'#fff',fontSize:13,width:'100%',boxSizing:'border-box'}}>
                                  {field.value ? format(field.value, "dd/MM/yyyy", { locale: ptBR }) : <span>dd/mm/aaaa</span>}
                                  <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange}
                                disabled={(date) => date < new Date("1900-01-01")} initialFocus />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="checkOutTime" render={({ field }) => (
                        <FormItem className="flex flex-col" style={{margin:0}}>
                          <FormLabel style={{fontSize:12,color:'#64748B',fontWeight:500,marginBottom:4}}>Horário *</FormLabel>
                          <FormControl>
                            <Input placeholder="--:--" data-testid="input-checkout-time"
                              disabled={!canEditRecord} {...field}
                              style={{borderRadius:8,height:42,borderColor:'#CBD5E1',background:'#fff',fontSize:13,width:'100%',padding:'0 12px',boxSizing:'border-box'}} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </div>

                {/* Anexos */}
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>
                    📎 Anexos da Hospedagem
                  </div>
                  <AttachmentUpload
                    attachmentIds={modalAttachmentIds}
                    onAttachmentsChange={(newIds) => setModalAttachmentIds(newIds)}
                    disabled={!canEditRecord}
                  />
                </div>

                {/* Footer */}
                <div style={{borderTop:'1px solid #E2E8F0',paddingTop:16,display:'flex',justifyContent:'flex-end',gap:8}}>
                  <Button type="button" variant="outline"
                    onClick={() => { setShowModal(false); form.reset(); }}
                    data-testid="button-cancel"
                    style={{borderColor:'#E2E8F0',color:'#64748B'}}>
                    Cancelar
                  </Button>
                  {canEditRecord && (
                    <>
                      <Button type="submit" variant="outline"
                        disabled={createAccommodationMutation.isPending || updateAccommodationMutation.isPending}
                        data-testid="button-save"
                        style={{background:'#64748B',color:'#fff',border:'none'}}>
                        {(createAccommodationMutation.isPending || updateAccommodationMutation.isPending) && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        )}
                        Salvar
                      </Button>
                      <Button type="submit"
                        disabled={createAccommodationMutation.isPending || updateAccommodationMutation.isPending}
                        data-testid="button-register"
                        style={{background:'#3B5BDB',color:'#fff',border:'none'}}>
                        {(createAccommodationMutation.isPending || updateAccommodationMutation.isPending) && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        )}
                        🏨 Registrar Hospedagem
                      </Button>
                    </>
                  )}
                </div>
              </form>
            </Form>
          )}
        </div>
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
      
      const _q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
      const matchesSearchId = filters.searchId === "" || 
        String(inclusion.inclusionNumber ?? '').toLowerCase().includes(_q);

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

  const totalCount = filteredData.length;
  const purchasedCount = filteredData.filter(inc => accommodationMap.get(inc.id)).length;
  const pendingCount = filteredData.filter(inc => !accommodationMap.get(inc.id)).length;

  const toTitleCase = (str: string | null | undefined): string => {
    if (!str) return '';
    return fixEncoding(str).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  };

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-[#0033CC] rounded-3xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/20">
          <Hotel className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Compra de Hospedagem</h1>
          <p className="text-sm text-slate-500">Gerencie as reservas de hospedagem para os colaboradores escalados.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Hospedagens</p>
            <h3 className="text-4xl font-black text-slate-900">{totalCount}</h3>
          </div>
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-[#0033CC]">
            <span className="material-symbols-outlined" style={{fontSize:28}}>hotel</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Compradas</p>
            <h3 className="text-4xl font-black text-[#22C55E]">{purchasedCount}</h3>
          </div>
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-[#22C55E]">
            <span className="material-symbols-outlined" style={{fontSize:28,fontVariationSettings:"'FILL' 1"}}>check_circle</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Pendentes</p>
            <h3 className="text-4xl font-black text-[#F97316]">{pendingCount}</h3>
          </div>
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-[#F97316]">
            <span className="material-symbols-outlined" style={{fontSize:28,fontVariationSettings:"'FILL' 1"}}>pending</span>
          </div>
        </div>
      </div>

      {/* Aplicar em Lote — discrete card (same as Passagens) */}
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:bg-amber-50/40 transition-colors overflow-hidden"
        style={{borderLeft: '4px solid #F59E0B'}}
        onClick={() => toggleSection('basic')}
        data-testid="button-toggle-quick-register"
      >
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <Hotel className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Aplicar em Lote</p>
            <p className="text-xs text-slate-400 font-medium">Aplicar mesmos dados a múltiplas hospedagens</p>
          </div>
        </div>
        <div className="pr-5">
          {expandedSections.basic
            ? <ChevronDown className="w-5 h-5 text-amber-400" />
            : <ChevronRight className="w-5 h-5 text-slate-300" />}
        </div>
      </div>

      {/* Quick Register Form Panel */}
      {expandedSections.basic && (
        <div className="mb-6 rounded-xl overflow-hidden" style={{border:'1px solid #E2E8F0',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
          <div style={{borderLeft:'4px solid #0033CC',background:'#EEF2FF',padding:'12px 20px'}}>
            <span style={{fontWeight:700,fontSize:13,color:'#0033CC'}}>Preencha os dados comuns e selecione as hospedagens na tabela</span>
          </div>

            <>
              {/* Grade Organizada por Seções */}
              <div className="space-y-4" style={{background:'#fff',padding:'16px 20px'}}>
                {/* Seção de Informações Gerais */}
                <div className="grid grid-cols-3 gap-3 rounded-lg" style={{background:'#F0FDF4',padding:12}}>
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
                  <div className="p-3 rounded-lg" style={{borderLeft:'3px solid #3B5BDB',background:'#EEF2FF'}}>
                    <h5 style={{fontSize:11,fontWeight:700,color:'#3B5BDB',marginBottom:8}}>
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
                  <div className="p-3 rounded-lg" style={{borderLeft:'3px solid #F59E0B',background:'#FFF7ED'}}>
                    <h5 style={{fontSize:11,fontWeight:700,color:'#B45309',marginBottom:8}}>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] font-medium">Reserva/LOC (opcional)</Label>
                    <Input
                      placeholder="Número da reserva"
                      value={accommodationData["quick"]?.reservationNumber || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "reservationNumber", e.target.value)}
                      className="h-7 text-xs px-2 mt-1"
                      data-testid="input-quick-reservation-number"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">Observações sobre a hospedagem (opcional)</Label>
                    <Textarea
                      placeholder="Informações adicionais sobre a hospedagem..."
                      value={accommodationData["quick"]?.accommodationObservations || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "accommodationObservations", e.target.value)}
                      className="h-16 text-xs px-2 py-1 resize-none mt-1"
                      data-testid="textarea-quick-accommodation-observations"
                    />
                  </div>
                </div>

                {/* Seção de Anexos */}
                <div className="rounded-lg" style={{background:'#F8FAFC',border:'1px solid #E2E8F0',padding:12}}>
                  <h5 style={{fontSize:11,fontWeight:700,color:'#64748B',marginBottom:8,letterSpacing:'0.06em',textTransform:'uppercase'}}>
                    📎 Anexos da Hospedagem
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
              {/* Action footer */}
              <div className="flex items-center justify-between" style={{background:'#F8FAFC',borderTop:'1px solid #E2E8F0',borderRadius:'0 0 12px 12px',padding:'12px 20px',margin:'0 -20px -16px'}}>
                <p style={{fontSize:13,color:'#94A3B8',fontStyle:'italic'}}>
                  Preencha os dados comuns e selecione as hospedagens na tabela para aplicar
                  {selectedInclusionsForBatch.length > 0 && (
                    <span style={{color:'#3B5BDB',fontWeight:600,fontStyle:'normal',marginLeft:8}}>
                      ({selectedInclusionsForBatch.length} hospedagens selecionadas)
                    </span>
                  )}
                </p>
                {canEditScreen(user, 'accommodations') && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleApplyToSelected}
                      disabled={selectedInclusionsForBatch.length === 0 || createAccommodationMutation.isPending}
                      data-testid="button-apply-to-selected"
                      style={{
                        background: selectedInclusionsForBatch.length === 0 ? undefined : '#3B5BDB',
                        color: selectedInclusionsForBatch.length === 0 ? undefined : '#fff',
                        opacity: selectedInclusionsForBatch.length === 0 ? 0.5 : 1,
                        cursor: selectedInclusionsForBatch.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {createAccommodationMutation.isPending ? "Aplicando..." : `Aplicar a ${selectedInclusionsForBatch.length} Hospedagens`}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAccommodationData(prev => {
                          const newData = { ...prev };
                          delete newData["quick"];
                          return newData;
                        });
                      }}
                      disabled={!accommodationData["quick"] || Object.keys(accommodationData["quick"]).length === 0}
                      data-testid="button-clear-quick"
                      style={{borderColor:'#E2E8F0',color:'#64748B'}}
                    >
                      Limpar Campos
                    </Button>
                  </div>
                )}
              </div>
            </>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 grid grid-cols-5 gap-4">
        <div className="space-y-1">
          <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'#94A3B8',textTransform:'uppercase',paddingLeft:4,display:'block'}}>ID Reserva</label>
          <input
            className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Ex: 4412"
            value={filters.searchId}
            onChange={e => setFilters(prev => ({ ...prev, searchId: e.target.value }))}
            data-testid="filter-search-id"
          />
        </div>
        <div className="space-y-1">
          <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'#94A3B8',textTransform:'uppercase',paddingLeft:4,display:'block'}}>Evento</label>
          <Select value={filters.eventId} onValueChange={v => setFilters(prev => ({ ...prev, eventId: v }))}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm" data-testid="filter-event">
              <SelectValue placeholder="Todos os Eventos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Eventos</SelectItem>
              {events?.map(ev => <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'#94A3B8',textTransform:'uppercase',paddingLeft:4,display:'block'}}>Função</label>
          <Select
            value={filters.functionId.length === 1 ? filters.functionId[0] : "all"}
            onValueChange={v => setFilters(prev => ({ ...prev, functionId: v === "all" ? [] : [v] }))}
          >
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm" data-testid="filter-function">
              <SelectValue placeholder="Todas as Funções" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Funções</SelectItem>
              {functions?.map(fn => <SelectItem key={fn.id} value={fn.id}>{fn.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'#94A3B8',textTransform:'uppercase',paddingLeft:4,display:'block'}}>Colaborador</label>
          <Select value={filters.collaboratorId} onValueChange={v => setFilters(prev => ({ ...prev, collaboratorId: v }))}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm" data-testid="filter-collaborator">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {collaborators?.map(c => <SelectItem key={c.id} value={c.id}>{fixEncoding(c.fullName)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'#94A3B8',textTransform:'uppercase',paddingLeft:4,display:'block'}}>Status</label>
          <Select value={filters.accommodationStatus} onValueChange={v => setFilters(prev => ({ ...prev, accommodationStatus: v }))}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm" data-testid="filter-status">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="processed">Comprada</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                {(['ID','Evento','Colaborador / Função','Check-in','Check-out','Hotel','Status','Ações'] as const).map(label => (
                  <th key={label} style={{padding:'16px 24px',fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'#94A3B8',textTransform:'uppercase',whiteSpace:'nowrap', textAlign: label === 'Ações' ? 'right' : 'left'}}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredData.map((inclusion, idx) => {
                  const event = events?.find(e => e.id === inclusion.eventId);
                  const func = functions?.find(f => f.id === inclusion.functionId);
                  const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
                  const accommodation = accommodationMap.get(inclusion.id);
                  const hasAccommodation = !!accommodation;
                  const isCanceled = inclusion.status === 'cancelado';
                  const isPostPurchaseRow = ['hospedagem_comprada', 'hospedagem_passagem_comprada'].includes(inclusion.status);
                  const rowBg = '#fff';

                  const displayName = toTitleCase(collaborator?.fullName);
                  const colNameInitials = (displayName || '??').split(' ').slice(0,2).map((n:string) => n[0]).join('').toUpperCase();
                  const borderColor = isCanceled ? '#E2E8F0' : hasAccommodation ? '#22C55E' : '#F97316';

                  return (
                    <tr
                      key={inclusion.id}
                      data-testid={`accommodation-row-${inclusion.inclusionNumber}`}
                      className="transition-colors"
                      style={{
                        borderLeft: `3px solid ${borderColor}`,
                        opacity: isCanceled ? 0.6 : 1,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                    >
                      {/* ID */}
                      <td style={{padding:'20px 24px'}}>
                        <span style={{fontFamily:'monospace',fontSize:12,color:'#94A3B8'}}>#{inclusion.inclusionNumber || 'N/A'}</span>
                      </td>
                      {/* Evento */}
                      <td style={{padding:'20px 24px',fontSize:14,fontWeight:600,color:'#0F172A'}}
                          data-testid={`accommodation-event-${inclusion.inclusionNumber}`}>
                        {event?.name || '—'}
                      </td>
                      {/* Colaborador / Função */}
                      <td style={{padding:'20px 24px'}}
                          data-testid={`accommodation-collaborator-${inclusion.inclusionNumber}`}>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <div style={{width:32,height:32,borderRadius:'50%',background:'#F1F5F9',color:'#475569',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,border:'1px solid #E2E8F0',flexShrink:0}}>
                            {collaborator ? colNameInitials : '?'}
                          </div>
                          <div>
                            <p style={{fontSize:14,fontWeight:700,color:'#0F172A',lineHeight:1.2}}>{displayName || <span style={{color:'#CBD5E1'}}>Sem colaborador</span>}</p>
                            <p style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{func?.name || '—'}</p>
                          </div>
                        </div>
                      </td>
                      {/* Check-in */}
                      <td style={{padding:'20px 24px',fontSize:14,color:'#475569'}}
                          data-testid={`accommodation-checkin-${inclusion.inclusionNumber}`}>
                        {accommodation?.checkInDate ? (
                          <div>
                            <div style={{fontWeight:500}}>{formatDate(accommodation.checkInDate)}</div>
                            {accommodation.checkInTime && <div style={{fontSize:11,color:'#0033CC'}}>{accommodation.checkInTime}</div>}
                          </div>
                        ) : <span style={{color:'#CBD5E1'}}>—</span>}
                      </td>
                      {/* Check-out */}
                      <td style={{padding:'20px 24px',fontSize:14,color:'#475569'}}
                          data-testid={`accommodation-checkout-${inclusion.inclusionNumber}`}>
                        {accommodation?.checkOutDate ? (
                          <div>
                            <div style={{fontWeight:500}}>{formatDate(accommodation.checkOutDate)}</div>
                            {accommodation.checkOutTime && <div style={{fontSize:11,color:'#F59E0B'}}>{accommodation.checkOutTime}</div>}
                          </div>
                        ) : <span style={{color:'#CBD5E1'}}>—</span>}
                      </td>
                      {/* Hotel */}
                      <td style={{padding:'20px 24px'}}
                          data-testid={`accommodation-hotel-${inclusion.inclusionNumber}`}>
                        {accommodation?.hotelName ? (
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span className="material-symbols-outlined" style={{fontSize:16,color:'#94A3B8',flexShrink:0,fontVariationSettings:"'FILL' 1"}}>bed</span>
                            <div>
                              <p style={{fontSize:14,fontWeight:600,color:'#0F172A',lineHeight:1.2}}>{accommodation.hotelName}</p>
                              {accommodation.hotelLocation && <p style={{fontSize:10,color:'#94A3B8',textTransform:'uppercase',marginTop:2}}>{accommodation.hotelLocation}</p>}
                            </div>
                          </div>
                        ) : <span style={{color:'#CBD5E1',fontSize:14}}>—</span>}
                      </td>
                      {/* Status */}
                      <td style={{padding:'20px 24px'}} data-testid={`accommodation-status-${inclusion.inclusionNumber}`}>
                        {isCanceled ? (
                          <span style={{display:'inline-flex',alignItems:'center',padding:'4px 12px',borderRadius:9999,background:'#F1F5F9',color:'#64748B',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>CANCELADO</span>
                        ) : hasAccommodation ? (
                          <span style={{display:'inline-flex',alignItems:'center',padding:'4px 12px',borderRadius:9999,background:'#DCFCE7',color:'#166534',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>COMPRADA</span>
                        ) : (
                          <span style={{display:'inline-flex',alignItems:'center',padding:'4px 12px',borderRadius:9999,background:'#FFEDD5',color:'#7C2D12',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>PENDENTE</span>
                        )}
                      </td>
                      {/* Ações */}
                      <td style={{padding:'20px 24px',textAlign:'right'}}>
                        {!isCanceled && (
                          hasAccommodation ? (
                            <button
                              onClick={() => handleViewAccommodationDetails(inclusion)}
                              data-testid={`view-accommodation-${inclusion.inclusionNumber}`}
                              style={{padding:'6px 8px',color:'#94A3B8',background:'none',border:'none',cursor:'pointer',borderRadius:8,transition:'color 0.15s'}}
                              onMouseEnter={e => (e.currentTarget.style.color = '#0033CC')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}
                            >
                              <span className="material-symbols-outlined" style={{fontSize:20}}>visibility</span>
                            </button>
                          ) : canEditField ? (
                            <button
                              onClick={() => handleViewAccommodationDetails(inclusion)}
                              data-testid={`buy-accommodation-${inclusion.inclusionNumber}`}
                              style={{background:'transparent',color:'#0033CC',fontSize:10,fontWeight:700,padding:'7px 16px',borderRadius:8,border:'1.5px solid #0033CC',cursor:'pointer',letterSpacing:'0.06em',transition:'all 0.15s'}}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#EFF6FF'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                            >
                              COMPRAR
                            </button>
                          ) : null
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredData.length === 0 && (
              <div style={{textAlign:'center',padding:'48px 0',color:'#94A3B8',fontSize:14}} data-testid="no-accommodations">
                Nenhuma inclusão com hospedagem encontrada.
              </div>
            )}
          </div>
          {/* Table footer / count */}
          <div style={{padding:'16px 24px',background:'#F8FAFC',borderTop:'1px solid #E2E8F0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <p style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.08em'}}>
              Exibindo {filteredData.length} {filteredData.length === 1 ? 'resultado' : 'resultados'}
            </p>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'#94A3B8',fontWeight:600}}>
                {purchasedCount} compradas · {pendingCount} pendentes
              </span>
            </div>
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
      </div>
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