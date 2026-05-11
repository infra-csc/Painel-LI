import { useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Hotel, Save, Eye, ChevronDown, ChevronRight, MessageCircle, Edit, FileText, History } from "lucide-react";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "@/components/common/status-badge";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import EventCombobox from "@/components/ui/event-combobox";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
import type { TeamInclusion, Event, Function, Collaborator, Accommodation, Comment, TeamInclusionLog } from "@shared/schema";

// Helper: Mostrar "Escalado" apenas quando não precisa passagem nem hospedagem
const getDisplayStatus = (inclusion: TeamInclusion) => {
  if (inclusion.status === "escalado" && (inclusion.needsTicket || inclusion.needsAccommodation)) {
    // Se está escalado mas precisa de passagem ou hospedagem, mostrar "Aguardando Passagem" ou similar
    if (inclusion.needsTicket) return "aguardando_passagem";
    if (inclusion.needsAccommodation) return "aguardando_hospedagem";
  }
  return inclusion.status;
};


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
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{message:string;inclusionNumber:number|null;eventName:string;collaboratorName:string;functionName:string}|null>(null);
  const pendingAccomAction = useRef<'create'|'update'>('create');
  const [editingAccommodationId, setEditingAccommodationId] = useState<string | null>(null); // ID da accommodation sendo editado
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: false,
    dates: true,
    additional: false
  });
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<string>('resumo');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [accommodationData, setAccommodationData] = useState<Record<string, any>>({});
  const [selectedInclusionsForBatch, setSelectedInclusionsForBatch] = useState<string[]>([]);
  
  
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

  // Buscar comentários da inclusão selecionada
  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["/api/comments", selectedInclusion?.id],
    enabled: !!selectedInclusion?.id,
  });

  const { data: inclusionLogs } = useQuery<TeamInclusionLog[]>({
    queryKey: ["/api/team-inclusions", selectedInclusion?.id, "logs"],
    enabled: !!selectedInclusion?.id,
  });

  // Função para visualizar detalhes da hospedagem
  const handleViewAccommodationDetails = (inclusion: TeamInclusion) => {
    if (inclusion.status === 'cancelado') return;
    const acc = accommodationMap.get(inclusion.id);
    if (acc) {
      setAccommodationData(prev => ({
        ...prev,
        [inclusion.id]: {
          hotelName: acc.hotelName || '',
          hotelLocation: acc.hotelLocation || '',
          reservationNumber: acc.reservationNumber || '',
          accommodationObservations: acc.accommodationObservations || '',
          attachmentIds: acc.attachmentIds || [],
          ...prev[inclusion.id],
        }
      }));
    }
    setSelectedInclusion(inclusion);
    setShowModal(true);
    setModalActiveTab('resumo');
    setShowAllLogs(false);
  };

  // Componente do Modal de Hospedagem — design com abas
  const AccommodationModal = () => {
    const accommodation = selectedInclusion ? accommodationMap.get(selectedInclusion.id) : null;
    const isPostPurchase = ['hospedagem_comprada', 'hospedagem_passagem_comprada'].includes(selectedInclusion?.status || '');
    const canEditRecord = selectedInclusion && user && canEdit(user) && selectedInclusion.status !== 'cancelado' && !isPostPurchase;
    const roMode = !canEditRecord;

    if (!selectedInclusion) return null;

    const data = accommodationData[selectedInclusion.id] || {};
    const event = events?.find(e => e.id === selectedInclusion.eventId);
    const func = functions?.find(f => f.id === selectedInclusion.functionId);
    const collaborator = collaborators?.find(c => c.id === selectedInclusion.collaboratorId);

    const lbl = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-0.5";
    const val = "text-[13px] font-semibold text-slate-700";
    const tabTrigger = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#2563EB] data-[state=active]:text-[#2563EB] text-slate-500 bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";

    const handleSave = async () => {
      if (!selectedInclusion) return;
      if (!data.hotelName || !data.hotelLocation) {
        toast({ title: "Campos obrigatórios", description: "Nome do hotel e localização são obrigatórios", variant: "destructive" });
        return;
      }
      try {
        const payload = {
          teamInclusionId: selectedInclusion.id,
          hotelName: data.hotelName || null,
          hotelLocation: data.hotelLocation || null,
          reservationNumber: data.reservationNumber || null,
          accommodationObservations: data.accommodationObservations || null,
          attachmentIds: data.attachmentIds || [],
          updatedBy: user?.id,
        };
        const msg = accommodation ? "Hospedagem atualizada com sucesso!" : "Hospedagem registrada com sucesso!";
        if (accommodation) {
          pendingAccomAction.current = 'update';
          await updateAccommodationMutation.mutateAsync({ id: accommodation.id, data: payload });
        } else {
          pendingAccomAction.current = 'create';
          await createAccommodationMutation.mutateAsync(payload);
        }
        setSuccessInfo({
          message: msg,
          inclusionNumber: selectedInclusion?.inclusionNumber ?? null,
          eventName: events?.find(e => e.id === selectedInclusion?.eventId)?.name ?? "—",
          collaboratorName: collaborator ? (fixEncoding(collaborator.fullName) || "—") : "—",
          functionName: func?.name ?? "—",
        });
        setShowModal(false);
        setShowSuccessModal(true);
      } catch (error) {
        console.error('Erro ao salvar hospedagem:', error);
      }
    };

    return (
      <DialogContent className="!max-w-[1100px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Registro de Hospedagem</DialogTitle>
          <DialogDescription>Modal de hospedagem</DialogDescription>
        </DialogHeader>

        {/* ─── HEADER ─── */}
        <div className="shrink-0 px-6 py-4 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4ff 50%, #f5f5ff 100%)', borderBottom: '1px solid #e0eaf8' }}>
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm shrink-0" style={{ background: 'linear-gradient(135deg, #2563EB, #1d4ed8)' }}>
            <Hotel className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-black text-slate-800 leading-tight">Registro de Hospedagem</h2>
            <p className="text-[12px] text-slate-500 mt-0.5 truncate">
              #{selectedInclusion.inclusionNumber || 'N/A'} · {event?.name || '—'} · {func?.name || '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {accommodation ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-[11px] font-bold rounded-full border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Registrada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 text-[11px] font-bold rounded-full border border-orange-200">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
              </span>
            )}
          </div>
        </div>

        {/* ─── ABAS ─── */}
        <Tabs value={modalActiveTab} onValueChange={setModalActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-6 border-b border-slate-100 shrink-0">
            <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
              <TabsTrigger value="resumo" className={tabTrigger}>Resumo</TabsTrigger>
              <TabsTrigger value="dados" className={tabTrigger}>
                Dados da Hospedagem
                {accommodation
                  ? <span className="ml-1.5 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">✓</span>
                  : <span className="ml-1.5 bg-amber-100 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</span>
                }
              </TabsTrigger>
              <TabsTrigger value="complementos" className={tabTrigger}>Complementos e Histórico</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ══ ABA: RESUMO ══ */}
            <TabsContent value="resumo" className="m-0 p-6">
              <div className="grid grid-cols-3 gap-5">

                {/* Col 1: Evento + Função */}
                <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                  <div>
                    <div className={lbl}>Evento</div>
                    <div className="text-[13px] font-semibold text-[#2563EB] leading-snug">{event?.name || '—'}</div>
                  </div>
                  <div>
                    <div className={lbl}>ID</div>
                    <div className="text-[13px] font-bold text-slate-700 font-mono">#{selectedInclusion.inclusionNumber || 'N/A'}</div>
                  </div>
                  <div>
                    <div className={lbl}>Função</div>
                    <div className={val}>{func?.name || '—'}</div>
                  </div>
                  <div>
                    <div className={lbl}>Hospedagem</div>
                    {accommodation ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded-lg border border-green-100">
                        <Hotel style={{ width: 9, height: 9 }} />Registrada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                        <Hotel style={{ width: 9, height: 9 }} />Pendente
                      </span>
                    )}
                  </div>
                </div>

                {/* Col 2: Colaborador */}
                <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                  <div>
                    <div className={lbl}>Colaborador</div>
                    <div className={val}>{collaborator ? fixEncoding(collaborator.fullName) : '—'}</div>
                  </div>
                  {collaborator && (<>
                    <div>
                      <div className={lbl}>Documento</div>
                      <div className="text-[13px] font-semibold text-slate-700 font-mono">{collaborator.documentType?.toUpperCase() || 'N/A'}: {collaborator.officialDocument || 'N/A'}</div>
                    </div>
                    <div>
                      <div className={lbl}>Data de Nascimento</div>
                      <div className={val}>{collaborator.birthDate ? formatDate(collaborator.birthDate) : 'N/A'}</div>
                    </div>
                    <div>
                      <div className={lbl}>Cidade</div>
                      <div className={val}>{collaborator.city || '—'}</div>
                    </div>
                    <div>
                      <div className={lbl}>Tipo</div>
                      <div className={val}>{collaborator.type || '—'}</div>
                    </div>
                  </>)}
                </div>

                {/* Col 3: Período + Hotel (se registrado) */}
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-[#2563EB]/5 border-b border-slate-200 px-4 py-2.5">
                      <span className="text-[11px] font-black text-[#2563EB] uppercase tracking-[0.12em]">Período de Trabalho</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <div>
                        <div className={lbl}>Início</div>
                        <div className={val}>{selectedInclusion.scheduleStartDate ? formatDate(selectedInclusion.scheduleStartDate) : '—'}</div>
                      </div>
                      <div>
                        <div className={lbl}>Término</div>
                        <div className={val}>{selectedInclusion.scheduleEndDate ? formatDate(selectedInclusion.scheduleEndDate) : '—'}</div>
                      </div>
                    </div>
                  </div>

                  {accommodation && (
                    <div className="border border-green-200 rounded-2xl overflow-hidden">
                      <div className="bg-green-50 border-b border-green-200 px-4 py-2.5 flex items-center gap-2">
                        <Hotel className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-[11px] font-black text-green-700 uppercase tracking-[0.12em]">Hotel</span>
                      </div>
                      <div className="p-4 space-y-2">
                        <div>
                          <div className={lbl}>Nome</div>
                          <div className={val}>{accommodation.hotelName || '—'}</div>
                        </div>
                        <div>
                          <div className={lbl}>Localização</div>
                          <div className={val}>{accommodation.hotelLocation || '—'}</div>
                        </div>
                        {accommodation.reservationNumber && (
                          <div>
                            <div className={lbl}>Reserva</div>
                            <div className="text-[13px] font-bold text-slate-700 font-mono">{accommodation.reservationNumber}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ══ ABA: DADOS DA HOSPEDAGEM ══ */}
            <TabsContent value="dados" className="m-0 p-6">
              <div className="space-y-4">
                {isPostPurchase && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <span className="text-amber-700 font-semibold text-[13px]">⚠ Hospedagem confirmada — campos em modo somente leitura</span>
                  </div>
                )}

                {/* Dados do Hotel */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 mb-3">Dados do Hotel</div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Nome do Hotel *</Label>
                      <Input
                        placeholder="Ex: Hotel Copacabana Palace"
                        value={data.hotelName || ""}
                        onChange={(e) => handleAccommodationDataChange(selectedInclusion.id, "hotelName", e.target.value)}
                        data-testid="input-hotel-name"
                        disabled={roMode}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Localização *</Label>
                      <Input
                        placeholder="Ex: Copacabana, Rio de Janeiro"
                        value={data.hotelLocation || ""}
                        onChange={(e) => handleAccommodationDataChange(selectedInclusion.id, "hotelLocation", e.target.value)}
                        data-testid="input-hotel-location"
                        disabled={roMode}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Número da Reserva</Label>
                    <Input
                      placeholder="Ex: RES-123456"
                      value={data.reservationNumber || ""}
                      onChange={(e) => handleAccommodationDataChange(selectedInclusion.id, "reservationNumber", e.target.value)}
                      className="max-w-[280px]"
                      disabled={roMode}
                    />
                  </div>
                </div>

                {/* Observações */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Observações</Label>
                  <Textarea
                    placeholder="Informações adicionais sobre a hospedagem..."
                    value={data.accommodationObservations || ""}
                    onChange={(e) => handleAccommodationDataChange(selectedInclusion.id, "accommodationObservations", e.target.value)}
                    className="h-24 resize-none"
                    data-testid="textarea-observations"
                    disabled={roMode}
                  />
                </div>

                {/* Anexos */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Anexos</span>
                  </div>
                  <div className="p-4">
                    <AttachmentUpload
                      attachmentIds={data.attachmentIds || []}
                      onAttachmentsChange={(attachmentIds) => handleAccommodationDataChange(selectedInclusion.id, "attachmentIds", attachmentIds)}
                      disabled={roMode}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ══ ABA: COMPLEMENTOS ══ */}
            <TabsContent value="complementos" className="m-0 p-6">
              <div className="grid grid-cols-2 gap-6">

                {/* Comentários */}
                <div className="space-y-4">
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Comentários</span>
                        {comments && comments.length > 0 && (
                          <span className="bg-[#2563EB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{comments.length}</span>
                        )}
                      </div>
                      <button onClick={() => setShowCommentsModal(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {roMode ? "Ver" : "Ver/Adicionar"}
                      </button>
                    </div>
                    <div className="p-4">
                      {comments && comments.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {comments.map((comment) => (
                            <div key={comment.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                              <div className="flex justify-between items-center mb-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[9px] font-black shrink-0">
                                    {(users?.find((u: any) => u.id === comment.userId)?.name || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="text-[12px] font-bold text-slate-700">{users?.find((u: any) => u.id === comment.userId)?.name || 'Usuário'}</div>
                                </div>
                                <div className="text-[10px] text-slate-400">{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString('pt-BR') : ''}</div>
                              </div>
                              <div className="text-[12px] text-slate-600 leading-relaxed">{comment.content}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                          <MessageCircle className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                          <div className="text-[12px] text-slate-400">Nenhum comentário registrado.</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Histórico */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-slate-400" />
                    <span className="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">Histórico</span>
                    {inclusionLogs && inclusionLogs.length > 0 && (
                      <span className="text-[10px] text-slate-400">{inclusionLogs.length} entr.</span>
                    )}
                  </div>
                  {!inclusionLogs || inclusionLogs.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                      <History className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                      <div className="text-[12px] text-slate-400">Nenhum histórico encontrado.</div>
                    </div>
                  ) : (
                    <div>
                      <div className="border-l-2 border-slate-100 ml-3 pl-4 space-y-2 max-h-72 overflow-y-auto">
                        {inclusionLogs
                          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                          .slice(0, showAllLogs ? undefined : 5)
                          .map((log) => {
                            const actionLabels: Record<string, string> = {
                              'status_changed': '🔄 Status Alterado',
                              'collaborator_changed': '👤 Colaborador Alterado',
                              'dates_changed': '📅 Período Alterado',
                              'accommodation_created': '🏨 Hospedagem Criada',
                              'accommodation_updated': '✏️ Hospedagem Atualizada',
                              'created': '✨ Criado',
                              'confirmed': '✅ Confirmado',
                              'reopened': '🔓 Reaberto',
                            };
                            return (
                              <div key={log.id} className="flex gap-3">
                                <div className="w-2.5 h-2.5 bg-[#2563EB] rounded-full -ml-[1.3rem] mt-2.5 flex-shrink-0 ring-4 ring-white" />
                                <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="text-[11px] font-bold text-slate-700">{actionLabels[log.action] || log.action}</div>
                                    <div className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                                      {log.createdAt && new Date(log.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </div>
                                  {log.details && <div className="text-[11px] text-slate-500 mt-0.5">{log.details}</div>}
                                  <div className="text-[10px] font-semibold mt-1" style={{ color: '#2563EB' }}>↳ {log.userName}</div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {!showAllLogs && inclusionLogs.length > 5 && (
                        <button
                          onClick={() => setShowAllLogs(true)}
                          className="text-xs font-medium mt-2 ml-7 hover:underline"
                          style={{ color: '#2563EB' }}
                        >
                          Ver todos ({inclusionLogs.length - 5} mais)
                        </button>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </TabsContent>

          </div>
        </Tabs>

        {/* ─── FOOTER ─── */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-white">
          <Button
            variant="outline"
            onClick={() => setShowModal(false)}
            className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium"
          >
            Fechar
          </Button>
          {!roMode && (
            <Button
              onClick={handleSave}
              disabled={createAccommodationMutation.isPending || updateAccommodationMutation.isPending}
              className="flex items-center gap-2 text-white rounded-xl px-5 py-2 text-sm font-bold hover:opacity-90"
              style={{ background: '#059672' }}
              data-testid="button-register"
            >
              {(createAccommodationMutation.isPending || updateAccommodationMutation.isPending) ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Hotel className="w-4 h-4" />
              )}
              {accommodation ? "Atualizar Hospedagem" : "🏨 Confirmar Hospedagem"}
            </Button>
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

    if (!quickData.hotelName || !quickData.hotelLocation) {
      toast({
        title: "Erro",
        description: "Preencha os campos obrigatórios: Nome do Hotel e Localização",
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

        if (accommodationMap.get(inclusion.id)) {
          errors.push(`Hospedagem #${inclusion.inclusionNumber} já foi processada`);
          continue;
        }

        try {
          await createAccommodationMutation.mutateAsync({
            teamInclusionId: inclusion.id,
            hotelName: quickData.hotelName,
            hotelLocation: quickData.hotelLocation,
            accommodationObservations: quickData.accommodationObservations || null,
          });
          successCount++;
        } catch (error) {
          errors.push(`Erro na hospedagem #${inclusion.inclusionNumber}`);
        }
      }

      if (successCount > 0) {
        toast({
          title: "Sucesso",
          description: `${successCount} hospedagem(ns) registrada(s) com sucesso!`,
        });
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
      const _colName = (collaborators?.find(c => c.id === inclusion.collaboratorId)?.fullName ?? '').toLowerCase();
      const matchesSearchId = filters.searchId === "" ||
        String(inclusion.inclusionNumber ?? '').toLowerCase().includes(_q) ||
        _colName.includes(_q);

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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-[#0033CC] flex items-center justify-center shrink-0" style={{boxShadow:'0 4px 14px #0033CC50'}}>
          <Hotel className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold tracking-tight text-slate-900">Compra de Hospedagem</h1>
          <p className="text-xs text-slate-400">Gerencie as reservas de hospedagem para os colaboradores escalados.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: totalCount,    stripe: "bg-slate-700",   iconBg: "bg-slate-100",  iconTx: "text-slate-600",  valTx: "#374151",  icon: "hotel" },
          { label: "Compradas",  value: purchasedCount, stripe: "bg-emerald-500", iconBg: "bg-emerald-50", iconTx: "text-emerald-600", valTx: "#059669", icon: "check_circle" },
          { label: "Pendentes",  value: pendingCount,   stripe: "bg-amber-400",   iconBg: "bg-amber-50",   iconTx: "text-amber-500",  valTx: "#D97706",  icon: "pending" },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className={`h-0.5 w-full ${card.stripe}`} />
            <div className="px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconTx}`}>
                <span className="material-symbols-outlined" style={{fontSize:16,fontVariationSettings:"'FILL' 1"}}>{card.icon}</span>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase leading-none mb-1">{card.label}</p>
                <p className="text-[22px] font-bold leading-none" style={{color: card.valTx}}>{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Aplicar em Lote — discrete card */}
      <div
        className="bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden"
        onClick={() => toggleSection('basic')}
        data-testid="button-toggle-quick-register"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
            <Hotel className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Aplicar em Lote</p>
            <p className="text-xs text-slate-400 font-medium">Aplicar mesmos dados a múltiplas hospedagens</p>
          </div>
        </div>
        <div className="pr-4">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
            {expandedSections.basic
              ? <ChevronDown className="w-4 h-4 text-amber-500" />
              : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
      </div>

      {/* Quick Register Form Panel */}
      {expandedSections.basic && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Cabeçalho */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-6">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-slate-900">Aplicar em Lote</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Insira os dados comuns para múltiplas hospedagens simultaneamente.</p>
            </div>
          </div>

          {/* Grid principal: 8 cols + 4 cols */}
          <div className="grid grid-cols-12 gap-3 p-3">

            {/* Coluna esquerda (8 cols) */}
            <div className="col-span-12 lg:col-span-8 space-y-2">

              {/* Card: Dados do Hotel */}
              <section className="rounded-xl overflow-hidden border border-slate-200">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0">
                    <Hotel className="w-3 h-3 text-white" />
                  </div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Dados do Hotel</h4>
                </div>
                <div className="p-4 bg-white space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Nome do Hotel *</Label>
                      <Input
                        placeholder="Hotel Copacabana"
                        value={accommodationData["quick"]?.hotelName || ""}
                        onChange={(e) => handleAccommodationDataChange("quick", "hotelName", e.target.value)}
                        className="h-[38px] bg-slate-50 border-slate-200 rounded-xl text-sm"
                        data-testid="input-quick-hotel-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Localização *</Label>
                      <Input
                        placeholder="Rio de Janeiro, RJ"
                        value={accommodationData["quick"]?.hotelLocation || ""}
                        onChange={(e) => handleAccommodationDataChange("quick", "hotelLocation", e.target.value)}
                        className="h-[38px] bg-slate-50 border-slate-200 rounded-xl text-sm"
                        data-testid="input-quick-hotel-location"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Observações <span className="text-slate-300 normal-case">(opcional)</span></Label>
                    <Textarea
                      placeholder="Informações adicionais..."
                      value={accommodationData["quick"]?.accommodationObservations || ""}
                      onChange={(e) => handleAccommodationDataChange("quick", "accommodationObservations", e.target.value)}
                      className="text-sm resize-none bg-slate-50 border-slate-200 rounded-xl"
                      style={{height:72}}
                      data-testid="textarea-quick-accommodation-observations"
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Coluna direita (4 cols) */}
            <div className="col-span-12 lg:col-span-4 space-y-3">

              {/* Status da operação */}
              {(() => {
                const q = accommodationData["quick"];
                const hotelStatus = !!(q?.hotelName) && !!(q?.hotelLocation) ? 'done' : !!(q?.hotelName || q?.hotelLocation) ? 'partial' : 'empty';
                const selectionStatus = selectedInclusionsForBatch.length > 0 ? 'done' : 'empty';

                const dot = (status: 'done'|'partial'|'empty') => {
                  const map = { done: 'bg-green-500', partial: 'bg-yellow-400', empty: 'bg-red-400' };
                  const pulse = status === 'partial' ? 'animate-pulse' : '';
                  return <div className={`w-2 h-2 rounded-full shrink-0 ${map[status]} ${pulse}`} />;
                };
                const textColor = (s: 'done'|'partial'|'empty') =>
                  s === 'done' ? 'text-slate-700' : s === 'partial' ? 'text-yellow-700' : 'text-slate-400';

                return (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                      <div className="w-5 h-5 rounded-md bg-slate-500 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white" style={{fontSize:12}}>checklist</span>
                      </div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Status da Operação</h4>
                    </div>
                    <ul className="p-3 space-y-2.5 bg-white">
                      <li className="flex items-center gap-2.5">
                        {dot(hotelStatus)}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] font-semibold ${textColor(hotelStatus)}`}>Dados do hotel</p>
                          <p className="text-[11px] text-slate-400">{hotelStatus === 'done' ? 'Nome e localização OK' : hotelStatus === 'partial' ? 'Dados incompletos' : 'Nenhum campo preenchido'}</p>
                        </div>
                      </li>
                      <li className="flex items-center gap-2.5">
                        {dot(selectionStatus)}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] font-semibold ${textColor(selectionStatus)}`}>Hospedagens selecionadas</p>
                          <p className="text-[11px] text-slate-400">{selectedInclusionsForBatch.length > 0 ? `${selectedInclusionsForBatch.length} na fila` : 'Selecione na tabela'}</p>
                        </div>
                      </li>
                    </ul>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Rodapé de ação */}
          <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl transition-all ${selectedInclusionsForBatch.length > 0 ? 'bg-[#0033CC] text-white shadow-lg shadow-blue-200' : 'bg-slate-200 text-slate-400'}`}>
                <span className="material-symbols-outlined" style={{fontSize:18}}>bed</span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 leading-none mb-0.5">Hospedagens</p>
                  <p className="text-lg font-black leading-none">{selectedInclusionsForBatch.length}</p>
                </div>
              </div>
              {(() => {
                const q = accommodationData["quick"];
                const ready = selectedInclusionsForBatch.length > 0 && !!(q?.hotelName) && !!(q?.hotelLocation);
                const partial = !ready && (selectedInclusionsForBatch.length > 0 || !!(q?.hotelName));
                if (ready) return (
                  <span className="flex items-center gap-1.5 px-4 py-1.5 bg-green-100 text-green-700 rounded-full text-[11px] font-bold uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Pronto para aplicar
                  </span>
                );
                if (partial) return (
                  <span className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-[11px] font-bold uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    Em andamento
                  </span>
                );
                return (
                  <span className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-100 text-slate-400 rounded-full text-[11px] font-bold uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    Aguardando dados
                  </span>
                );
              })()}
            </div>
            {canEditScreen(user, 'accommodations') && (
              <div className="flex items-center gap-3">
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
                  className="rounded-xl border-slate-200 text-slate-500 hover:text-slate-700"
                >
                  Limpar Campos
                </Button>
                <Button
                  onClick={handleApplyToSelected}
                  disabled={selectedInclusionsForBatch.length === 0 || createAccommodationMutation.isPending}
                  data-testid="button-apply-to-selected"
                  className="h-[38px] px-6 font-bold rounded-xl flex items-center gap-2 transition-all"
                  style={{
                    background: selectedInclusionsForBatch.length === 0 ? '#E2E8F0' : '#0033CC',
                    color: selectedInclusionsForBatch.length === 0 ? '#94A3B8' : 'white',
                    boxShadow: selectedInclusionsForBatch.length > 0 ? '0 4px 14px rgba(0,51,204,0.3)' : 'none',
                    cursor: selectedInclusionsForBatch.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Save className="w-4 h-4" />
                  {createAccommodationMutation.isPending ? "Aplicando..." : `Aplicar a ${selectedInclusionsForBatch.length} Hospedagens`}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Filter bar inline */}
        <div className="px-5 py-3 border-b border-gray-100 bg-[#FAFBFF] flex flex-wrap items-center gap-2.5">
          {/* Buscar por ID */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize:14}}>search</span>
            <input
              type="text"
              placeholder="Nome ou número..."
              value={filters.searchId ?? ""}
              onChange={e => setFilters(prev => ({ ...prev, searchId: e.target.value }))}
              className="h-8 pl-8 pr-3 w-44 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
              data-testid="input-search-id"
            />
          </div>

          {/* Evento */}
          <div className="w-44">
            <EventCombobox
              events={events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído')}
              value={filters.eventId}
              onValueChange={v => setFilters(prev => ({ ...prev, eventId: v }))}
              placeholder="Evento"
              testId="filter-event"
            />
          </div>

          {/* Funções */}
          <div className="w-44">
            <FunctionMultiSelect
              functions={functions}
              selectedIds={Array.isArray(filters.functionId) ? filters.functionId : []}
              onSelectedChange={v => setFilters(prev => ({ ...prev, functionId: v }))}
              placeholder="Funções"
              testId="filter-function"
            />
          </div>

          {/* Colaborador */}
          <div className="w-44">
            <CollaboratorCombobox
              collaborators={collaborators}
              value={filters.collaboratorId}
              onValueChange={v => setFilters(prev => ({ ...prev, collaboratorId: v }))}
              placeholder="Colaborador"
              testId="filter-collaborator"
            />
          </div>

          {/* Status Hospedagem */}
          <select
            value={filters.accommodationStatus}
            onChange={e => setFilters(prev => ({ ...prev, accommodationStatus: e.target.value }))}
            className="h-8 px-2 pr-7 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
            data-testid="filter-status"
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="processed">Compradas</option>
          </select>

          {/* Status Inclusão */}
          <select
            value={filters.inclusionStatus}
            onChange={e => setFilters(prev => ({ ...prev, inclusionStatus: e.target.value }))}
            className="h-8 px-2 pr-7 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
            data-testid="filter-inclusion-status"
          >
            <option value="active">Inclusões ativas</option>
            <option value="all">Todas</option>
            <option value="cancelado">Canceladas</option>
          </select>

          <div className="flex-1" />

          {/* Contagem + Limpar */}
          <span className="text-[11px] text-slate-400 font-medium bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
            {filteredData.length} registro{filteredData.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setFilters({ eventId: "all", functionId: [], collaboratorId: "all", searchId: "", accommodationStatus: "all", inclusionStatus: "active" })}
            className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-gray-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 rounded-lg bg-white transition-colors"
            data-testid="button-clear-filters"
          >
            <span className="material-symbols-outlined" style={{fontSize:13}}>close</span>
            Limpar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead style={{background:"#F8FAFC",borderBottom:"2px solid #E2E8F0"}}>
              <tr>
                {expandedSections.basic && (
                  <th style={{padding:'12px 12px',width:44,textAlign:'center'}}>
                    <input
                      type="checkbox"
                      title="Selecionar todos pendentes"
                      style={{width:16,height:16,cursor:'pointer',accentColor:'#0033CC'}}
                      checked={(() => {
                        const pendingIds = filteredData.filter(i => !accommodationMap.get(i.id) && i.status !== 'cancelado').map(i => i.id);
                        return pendingIds.length > 0 && pendingIds.every(id => selectedInclusionsForBatch.includes(id));
                      })()}
                      onChange={toggleAllInclusions}
                    />
                  </th>
                )}
                <th style={{padding:'12px 12px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase',width:64}}>ID</th>
                <th style={{padding:'12px 16px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase'}}>Evento</th>
                <th style={{padding:'12px 16px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase'}}>Colaborador / Função</th>
                <th style={{padding:'12px 12px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase',width:110}}>Check-in</th>
                <th style={{padding:'12px 12px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase',width:110}}>Check-out</th>
                <th style={{padding:'12px 14px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase',width:180}}>Hotel</th>
                <th style={{padding:'12px 16px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase'}}>Status</th>
                <th style={{padding:'12px 8px',fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:'#94A3B8',textTransform:'uppercase',textAlign:'center',width:72}}>Ações</th>
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
                  const displayName = toTitleCase(collaborator?.fullName);
                  const colNameInitials = (displayName || '??').split(' ').slice(0,2).map((n:string) => n[0]).join('').toUpperCase();
                  const borderColor = isCanceled ? '#E2E8F0' : hasAccommodation ? '#22C55E' : '#F97316';
                  const rowBase = idx % 2 === 1 ? '#F8FAFC80' : '#ffffff';

                  const isSelectedForBatch = selectedInclusionsForBatch.includes(inclusion.id);
                  const canSelectForBatch = !isCanceled && !hasAccommodation;

                  return (
                    <tr
                      key={inclusion.id}
                      data-testid={`accommodation-row-${inclusion.inclusionNumber}`}
                      className="transition-colors"
                      style={{
                        borderLeft: `3px solid ${isSelectedForBatch ? '#0033CC' : borderColor}`,
                        opacity: isCanceled ? 0.6 : 1,
                        backgroundColor: isSelectedForBatch ? '#EEF2FF80' : rowBase,
                      }}
                      onMouseEnter={e => { if (!isSelectedForBatch) (e.currentTarget as HTMLElement).style.backgroundColor = '#EEF2FF33'; }}
                      onMouseLeave={e => { if (!isSelectedForBatch) (e.currentTarget as HTMLElement).style.backgroundColor = rowBase; }}
                    >
                      {/* Checkbox seleção lote */}
                      {expandedSections.basic && (
                        <td style={{padding:'12px 12px',width:44,textAlign:'center'}}>
                          {canSelectForBatch && (
                            <input
                              type="checkbox"
                              checked={isSelectedForBatch}
                              onChange={() => toggleInclusionSelection(inclusion.id)}
                              style={{width:16,height:16,cursor:'pointer',accentColor:'#0033CC'}}
                              data-testid={`checkbox-batch-${inclusion.inclusionNumber}`}
                            />
                          )}
                        </td>
                      )}
                      {/* ID */}
                      <td style={{padding:'12px 12px',width:64}}>
                        <span style={{display:'inline-block',background:'#EEF2FF',color:'#3B4FE4',fontSize:13,fontWeight:600,borderRadius:6,padding:'4px 8px',whiteSpace:'nowrap'}}>
                          #{inclusion.inclusionNumber || 'N/A'}
                        </span>
                      </td>
                      {/* Evento */}
                      <td style={{padding:'12px 16px',maxWidth:180}}
                          data-testid={`accommodation-event-${inclusion.inclusionNumber}`}>
                        <p style={{fontSize:14,fontWeight:600,color:'#1a1a2e',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:172}}>{event?.name || '—'}</p>
                      </td>
                      {/* Colaborador / Função */}
                      <td style={{padding:'12px 16px'}}
                          data-testid={`accommodation-collaborator-${inclusion.inclusionNumber}`}>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <div style={{width:36,height:36,borderRadius:'50%',background:'#E8EFFE',color:'#3B4FE4',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>
                            {collaborator ? colNameInitials : '?'}
                          </div>
                          <div>
                            <p style={{fontSize:14,fontWeight:500,color:'#1a1a2e',lineHeight:1.2}}>{displayName || <span style={{color:'#CBD5E1'}}>Sem colaborador</span>}</p>
                            <p style={{fontSize:12,color:'#999',marginTop:2}}>{func?.name || '—'}</p>
                          </div>
                        </div>
                      </td>
                      {/* Check-in */}
                      <td style={{padding:'12px 12px',width:110}}
                          data-testid={`accommodation-checkin-${inclusion.inclusionNumber}`}>
                        {accommodation?.checkInDate ? (
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:'#16A34A',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>↓ IN</div>
                            <div style={{fontSize:13,fontWeight:500,color:'#1a1a2e'}}>{formatDate(accommodation.checkInDate)}</div>
                            {accommodation.checkInTime && (
                              <div style={{fontSize:13,fontWeight:700,color:'#3B4FE4',marginTop:2}}>{accommodation.checkInTime}</div>
                            )}
                          </div>
                        ) : <span style={{color:'#CBD5E1'}}>—</span>}
                      </td>
                      {/* Check-out */}
                      <td style={{padding:'12px 12px',width:110}}
                          data-testid={`accommodation-checkout-${inclusion.inclusionNumber}`}>
                        {accommodation?.checkOutDate ? (
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:'#D97706',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>↑ OUT</div>
                            <div style={{fontSize:13,fontWeight:500,color:'#1a1a2e'}}>{formatDate(accommodation.checkOutDate)}</div>
                            {accommodation.checkOutTime && (
                              <div style={{fontSize:13,fontWeight:700,color:'#3B4FE4',marginTop:2}}>{accommodation.checkOutTime}</div>
                            )}
                          </div>
                        ) : <span style={{color:'#CBD5E1'}}>—</span>}
                      </td>
                      {/* Hotel */}
                      <td style={{padding:'12px 14px',width:180}}
                          data-testid={`accommodation-hotel-${inclusion.inclusionNumber}`}>
                        {accommodation?.hotelName ? (
                          <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                            <span className="material-symbols-outlined" style={{fontSize:16,color:'#3B4FE4',flexShrink:0,marginTop:2,fontVariationSettings:"'FILL' 1"}}>bed</span>
                            <div style={{overflow:'hidden'}}>
                              <p style={{fontSize:14,fontWeight:600,color:'#1a1a2e',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:148}}>{accommodation.hotelName}</p>
                              {accommodation.hotelLocation
                                ? <p style={{fontSize:11,color:'#94A3B8',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:148}}>{accommodation.hotelLocation}</p>
                                : null}
                            </div>
                          </div>
                        ) : <span style={{color:'#CBD5E1',fontSize:13,fontStyle:'italic'}}>Não informado</span>}
                      </td>
                      {/* Status */}
                      <td style={{padding:'12px 16px'}} data-testid={`accommodation-status-${inclusion.inclusionNumber}`}>
                        {isCanceled ? (
                          <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:6,background:'#F1F5F9',color:'#94A3B8',fontSize:10,fontWeight:700,letterSpacing:'0.06em'}}>Cancelado</span>
                        ) : hasAccommodation ? (
                          <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:6,background:'#DCFCE7',color:'#15803D',fontSize:10,fontWeight:700,letterSpacing:'0.06em'}}>
                            <span style={{width:6,height:6,borderRadius:'50%',background:'#22C55E',flexShrink:0}} />
                            Comprada
                          </span>
                        ) : (
                          <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:6,background:'#FEF9C3',color:'#B45309',fontSize:10,fontWeight:700,letterSpacing:'0.06em'}}>
                            <span style={{width:6,height:6,borderRadius:'50%',background:'#FBBF24',flexShrink:0}} />
                            Pendente
                          </span>
                        )}
                      </td>
                      {/* Ações — ícone-apenas, largura 72px centrado */}
                      <td style={{padding:'12px 8px',textAlign:'center',width:72}}>
                        {!isCanceled && (
                          hasAccommodation ? (
                            <button
                              onClick={() => handleViewAccommodationDetails(inclusion)}
                              data-testid={`view-accommodation-${inclusion.inclusionNumber}`}
                              title="Visualizar hospedagem"
                              style={{width:32,height:32,borderRadius:'50%',background:'#F1F5F9',color:'#94A3B8',display:'inline-flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer',transition:'all 0.15s'}}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='#EEF2FF'; (e.currentTarget as HTMLButtonElement).style.color='#3B4FE4'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='#F1F5F9'; (e.currentTarget as HTMLButtonElement).style.color='#94A3B8'; }}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          ) : canEditField ? (
                            <button
                              onClick={() => handleViewAccommodationDetails(inclusion)}
                              data-testid={`buy-accommodation-${inclusion.inclusionNumber}`}
                              title="Registrar hospedagem"
                              style={{width:32,height:32,borderRadius:8,background:'#EEF2FF',color:'#3B4FE4',border:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all 0.15s'}}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='#3B4FE4'; (e.currentTarget as HTMLButtonElement).style.color='#fff'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='#EEF2FF'; (e.currentTarget as HTMLButtonElement).style.color='#3B4FE4'; }}
                            >
                              <span className="material-symbols-outlined" style={{fontSize:16,fontVariationSettings:"'FILL' 1"}}>bed</span>
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
      <Dialog open={showModal} onOpenChange={setShowModal} modal={!showSuccessModal}>
        {AccommodationModal()}
      </Dialog>

      {/* Modal de sucesso — portal no body para escapar do transform do Dialog */}
      {showSuccessModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{background:'rgba(0,0,0,0.45)'}}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col items-center px-8 py-7 w-full mx-4" style={{boxShadow:'0 8px 40px rgba(0,0,0,0.18)', maxWidth: 440}}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{background:'#DCFCE7'}}>
              <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="18" fill="#16A34A" fillOpacity="0.12"/>
                <path d="M10 18.5L15.5 24L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Sucesso</h3>
            <p className="text-sm text-slate-500 text-center mb-3">{successInfo?.message}</p>
            {successInfo?.inclusionNumber != null && (
              <span className="mb-4 px-3 py-0.5 rounded-full text-sm font-bold" style={{background:'#EEF2FF', color:'#4F46E5'}}>#{successInfo.inclusionNumber}</span>
            )}
            <div className="w-full border-t border-slate-100 mb-4"/>
            <div className="w-full space-y-2 mb-5">
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">Evento</span>
                <span className="text-slate-700 font-semibold text-right">{successInfo?.eventName}</span>
              </div>
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">Colaborador</span>
                <span className="text-slate-700 font-semibold text-right">{successInfo?.collaboratorName}</span>
              </div>
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">Função</span>
                <span className="text-slate-700 font-semibold text-right">{successInfo?.functionName}</span>
              </div>
            </div>
            <button
              onClick={() => { setShowSuccessModal(false); setSuccessInfo(null); setEditingAccommodationId(null); }}
              className="w-full py-2.5 rounded-xl font-semibold text-white text-sm"
              style={{background:'#2563EB'}}
            >
              OK
            </button>
          </div>
        </div>,
        document.body
      )}

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