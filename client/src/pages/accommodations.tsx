import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hotel, Save, Eye, ChevronDown, ChevronRight, MessageCircle, FileText, History, AlertCircle, CheckCheck, XCircle, ArrowLeftRight, ArrowRight } from "lucide-react";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import EventCombobox from "@/components/ui/event-combobox";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { canEdit } from "@/lib/interactions";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation, Comment, TeamInclusionLog, SwapRequest } from "@shared/schema";

export default function Accommodations() {
  const { user } = useAuth();
  const [showOnlyPendingSwaps, setShowOnlyPendingSwaps] = useState(false);
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: [] as string[], 
    collaboratorId: "all",
    searchId: "",
    accommodationStatus: "all", // all, pending, processed
    inclusionStatus: "active", // all, active (excludes cancelado)
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: 'id', direction: 'desc' });
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{message:string;inclusionNumber:number|null;eventName:string;collaboratorName:string;functionName:string}|null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: false,
    dates: true,
    additional: false
  });
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<string>('resumo');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [swapConfirmAction, setSwapConfirmAction] = useState<null | 'approve' | 'reject'>(null);
  const [swapRejectReason, setSwapRejectReason] = useState('');
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

  // Selecionar/deselecionar todos os pendentes.
  // Antes marcava também inclusões canceladas (que nem têm checkbox na linha) e
  // comparava só o tamanho da seleção, o que travava o "marcar todos".
  const toggleAllInclusions = () => {
    if (allSelectableSelected) {
      setSelectedInclusionsForBatch([]); // Deselecionar todos
    } else {
      setSelectedInclusionsForBatch(Array.from(selectableInclusionIds)); // Selecionar todos pendentes
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

  const { data: swapRequests } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id],
    queryFn: async () => {
      if (!selectedInclusion?.id) return [];
      const r = await fetch(`/api/swap-requests/inclusion/${selectedInclusion.id}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedInclusion?.id,
  });

  const pendingSwap = swapRequests?.find(s => s.status === 'pendente');
  const latestSwap = swapRequests?.find(s => ['aprovado', 'rejeitado'].includes(s.status));

  // Query global — para badges nas linhas da tabela (sem depender de inclusão selecionada)
  const { data: allSwapRequests } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const pendingSwapByInclusion = useMemo(() => {
    const map = new Map<string, boolean>();
    allSwapRequests?.filter(s => s.status === 'pendente').forEach(s => {
      const id = (s as any).team_inclusion_id || s.teamInclusionId;
      if (id) map.set(id, true);
    });
    return map;
  }, [allSwapRequests]);

  const isPurchasingRole = user?.role && ['admin', 'administrator', 'administrador', 'purchasing'].includes(user.role);

  const { data: teamInclusions, isLoading: isLoadingInclusions, error: inclusionsError } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
  });

  const approveSwapMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {});
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Troca aprovada", description: "O colaborador foi atualizado na escalação." });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id] });
      // A lista global alimenta o banner e o selo "Troca pendente" das linhas;
      // sem invalidar, a troca continuava aparecendo como pendente.
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err?.body?.message || "Erro ao aprovar troca", variant: "destructive" });
    },
  });

  const rejectSwapMutation = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${id}/reject`, { reviewComment: comment || "" });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Troca rejeitada" });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err?.body?.message || "Erro ao rejeitar troca", variant: "destructive" });
    },
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
    const event = eventById.get(selectedInclusion.eventId);
    const func = functionById.get(selectedInclusion.functionId);
    const collaborator = selectedInclusion.collaboratorId ? collaboratorById.get(selectedInclusion.collaboratorId) : undefined;

    const lbl = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-0.5";
    const val = "text-[13px] font-semibold text-slate-700";
    const tabTrigger = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#2563EB] data-[state=active]:text-[#2563EB] text-slate-500 bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";

    const handleSave = async () => {
      if (!selectedInclusion) return;
      // Guarda contra duplo clique enquanto a requisição está em voo.
      if (createAccommodationMutation.isPending || updateAccommodationMutation.isPending) return;
      if (!data.hotelName?.trim() || !data.hotelLocation?.trim()) {
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
          await updateAccommodationMutation.mutateAsync({ id: accommodation.id, data: payload });
        } else {
          await createAccommodationMutation.mutateAsync(payload);
        }
        setSuccessInfo({
          message: msg,
          inclusionNumber: selectedInclusion?.inclusionNumber ?? null,
          eventName: event?.name ?? "—",
          collaboratorName: collaborator ? (fixEncoding(collaborator.fullName) || "—") : "—",
          functionName: func?.name ?? "—",
        });
        setShowModal(false);
        setShowSuccessModal(true);
      } catch (error) {
        // O toast destrutivo já vem do onError da mutação; aqui só evitamos que
        // o modal feche e o "Sucesso" apareça sem nada ter sido gravado.
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
                      <div className={lbl}>Cidade do colaborador</div>
                      <div className={val}>{collaborator.city || '—'}</div>
                    </div>
                    <div>
                      <div className={lbl}>Tipo</div>
                      <div className={val}>{collaborator.type || '—'}</div>
                    </div>
                  </>)}
                  {selectedInclusion.city && (
                    <div className="mt-1 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
                      <span className="text-blue-500 text-base">📍</span>
                      <div>
                        <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Sai de</div>
                        <div className="text-[13px] font-bold text-blue-700">{selectedInclusion.city}</div>
                      </div>
                    </div>
                  )}
                  {/* Card de troca — só aparece quando hospedagem está comprada sem passagem */}
                  {selectedInclusion.status === 'hospedagem_comprada' && (pendingSwap || latestSwap) && (() => {
                    const swap = pendingSwap || latestSwap!;
                    const swapStatus = (swap as any).status || swap.status;
                    const currentCollabName = toTitleCase(fixEncoding((selectedInclusion.collaboratorId ? collaboratorById.get(selectedInclusion.collaboratorId) : undefined)?.fullName) || '—');
                    const requestedCollabId = (swap as any).new_collaborator_id;
                    const requestedCollabName = toTitleCase(fixEncoding((requestedCollabId ? collaboratorById.get(requestedCollabId) : undefined)?.fullName) || '—');
                    const requestedByName = (swap as any).requested_by_name || '—';
                    const reviewComment = (swap as any).review_comment || swap.reviewComment;

                    if (swapStatus === 'pendente') {
                      const swapCreatedAt = (swap as any).created_at || swap.createdAt;
                      const formatSwapDT = (dt: any) => {
                        if (!dt) return '—';
                        const d = new Date(dt);
                        const day = String(d.getDate()).padStart(2,'0');
                        const mon = String(d.getMonth()+1).padStart(2,'0');
                        const hrs = String(d.getHours()).padStart(2,'0');
                        const min = String(d.getMinutes()).padStart(2,'0');
                        return `${day}/${mon}/${d.getFullYear()} às ${hrs}:${min}`;
                      };
                      return (
                        <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-2">
                                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[12px] font-bold text-slate-700">Troca de colaborador solicitada</span>
                              </div>
                              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 whitespace-nowrap">Aguardando análise</span>
                            </div>
                            <p className="text-[10px] text-slate-400 pl-[22px]">
                              Solicitado por <span className="font-medium text-slate-500">{requestedByName}</span> em {formatSwapDT(swapCreatedAt)}
                            </p>
                          </div>
                          <div className="p-3 space-y-2">
                            <div className="flex items-stretch gap-1.5">
                              <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 min-w-0">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">Colaborador atual</p>
                                <p className="text-[12px] font-semibold text-slate-700 leading-snug break-words">{currentCollabName}</p>
                              </div>
                              <div className="flex items-center justify-center shrink-0 w-6">
                                <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                              </div>
                              <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 min-w-0">
                                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.08em] mb-1">Colaborador solicitado</p>
                                <p className="text-[12px] font-semibold text-blue-700 leading-snug break-words">{requestedCollabName}</p>
                              </div>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-0.5">Motivo da solicitação</p>
                              <p className="text-[11px] text-slate-600 leading-snug">{swap.reason || '—'}</p>
                            </div>
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                              <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                              <p className="text-[10px] text-amber-700 leading-snug">Esta escala possui hospedagem comprada. Revise os impactos antes de aprovar a troca.</p>
                            </div>
                            {isPurchasingRole && (
                              <div className="space-y-1.5 pt-0.5">
                                <p className="text-[10px] text-slate-400 text-center">A aprovação libera a alteração do colaborador nesta escala.</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setSwapConfirmAction('approve')}
                                    disabled={approveSwapMutation.isPending || rejectSwapMutation.isPending}
                                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <CheckCheck className="w-3.5 h-3.5" />Aprovar troca
                                  </button>
                                  <button
                                    onClick={() => { setSwapConfirmAction('reject'); setSwapRejectReason(''); }}
                                    disabled={approveSwapMutation.isPending || rejectSwapMutation.isPending}
                                    className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />Rejeitar troca
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    if (swapStatus === 'aprovado') return (
                      <div className="mt-2 border border-green-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-green-50 border-b border-green-200">
                          <div className="flex items-center gap-1.5">
                            <CheckCheck className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-[11px] font-bold text-green-800">Troca aprovada</span>
                          </div>
                          <span className="text-[10px] font-semibold bg-green-200 text-green-800 px-2 py-0.5 rounded-full">Aprovada por Compras</span>
                        </div>
                        <div className="px-3 py-2 bg-green-50/30">
                          <p className="text-[11px] text-green-700">A alteração do colaborador foi liberada para esta escala.</p>
                        </div>
                      </div>
                    );
                    if (swapStatus === 'rejeitado') return (
                      <div className="mt-2 border border-red-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-red-50 border-b border-red-200">
                          <div className="flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-[11px] font-bold text-red-800">Troca rejeitada</span>
                          </div>
                          <span className="text-[10px] font-semibold bg-red-200 text-red-800 px-2 py-0.5 rounded-full">Rejeitada por Compras</span>
                        </div>
                        <div className="px-3 py-2 space-y-1 bg-red-50/30">
                          <p className="text-[11px] text-red-700">A escala permanece com o colaborador atual.</p>
                          {reviewComment && <p className="text-[11px] text-slate-500">Motivo: <span className="font-medium text-slate-600">{reviewComment}</span></p>}
                        </div>
                      </div>
                    );
                    return null;
                  })()}
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
                      <Label htmlFor={`hotelName-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Nome do Hotel *</Label>
                      <Input
                        id={`hotelName-${selectedInclusion.id}`}
                        placeholder="Ex: Hotel Copacabana Palace"
                        value={data.hotelName || ""}
                        onChange={(e) => handleAccommodationDataChange(selectedInclusion.id, "hotelName", e.target.value)}
                        data-testid="input-hotel-name"
                        disabled={roMode}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`hotelLocation-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Localização *</Label>
                      <Input
                        id={`hotelLocation-${selectedInclusion.id}`}
                        placeholder="Ex: Copacabana, Rio de Janeiro"
                        value={data.hotelLocation || ""}
                        onChange={(e) => handleAccommodationDataChange(selectedInclusion.id, "hotelLocation", e.target.value)}
                        data-testid="input-hotel-location"
                        disabled={roMode}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`reservationNumber-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Número da Reserva</Label>
                    <Input
                      id={`reservationNumber-${selectedInclusion.id}`}
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
                  <Label htmlFor={`accommodationObservations-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Observações</Label>
                  <Textarea
                    id={`accommodationObservations-${selectedInclusion.id}`}
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

  // Formatação de data no padrão brasileiro.
  // Sem passar por new Date(): "YYYY-MM-DD" no construtor é lido como UTC e
  // volta um dia atrás em Brasília. O slice(0,10) protege contra ISO completo.
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    const [year, month, day] = String(dateStr).slice(0, 10).split('-');
    if (!year || !month || !day) return String(dateStr);
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  };

  // Aplicar dados do registro rápido às hospedagens selecionadas
  const handleApplyToSelected = async () => {
    const quickData = accommodationData["quick"];
    // Guarda contra duplo clique: sem o isPending o mesmo lote podia ser
    // disparado duas vezes e criar hospedagens repetidas.
    if (!quickData || effectiveSelectedForBatch.length === 0 || createAccommodationMutation.isPending) return;

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
      const processedIds: string[] = [];

      for (const inclusionId of effectiveSelectedForBatch) {
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
            updatedBy: user?.id,
          });
          successCount++;
          processedIds.push(inclusion.id);
        } catch (error: any) {
          errors.push(`#${inclusion.inclusionNumber}: ${error?.body?.message || 'falha ao registrar'}`);
        }
      }

      if (successCount > 0) {
        toast({
          title: "Sucesso",
          description: `${successCount} hospedagem(ns) registrada(s) com sucesso!`,
        });
      }

      if (errors.length > 0) {
        toast({
          title: "Alguns erros ocorreram",
          description: errors.join(" · "),
          variant: "destructive",
        });
      }

      // Tira da fila só o que realmente foi registrado — limpar tudo apagava a
      // seleção do usuário mesmo quando nenhuma hospedagem tinha sido criada.
      if (processedIds.length > 0) {
        setSelectedInclusionsForBatch(prev => prev.filter(id => !processedIds.includes(id)));
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro inesperado ao processar hospedagens em lote",
        variant: "destructive",
      });
    }
  };

  const { data: events, isLoading: isLoadingEvents, error: eventsError } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions, isLoading: isLoadingFunctions, error: functionsError } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const { data: collaborators, isLoading: isLoadingCollaborators, error: collaboratorsError } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const { data: accommodations, isLoading: isLoadingAccommodations, error: accommodationsError } = useQuery<Accommodation[]>({
    queryKey: ["/api/accommodations"],
  });

  // Esqueleto espera o conteúdo principal da tabela — inclusões, evento,
  // função, colaborador e a própria hospedagem. Antes saía só com as inclusões
  // e as demais colunas iam se preenchendo com a tabela já na tela.
  const isLoading =
    isLoadingInclusions ||
    isLoadingEvents ||
    isLoadingFunctions ||
    isLoadingCollaborators ||
    isLoadingAccommodations;

  // Falha de carregamento NÃO pode virar "nenhuma inclusão encontrada": uma
  // sessão expirada (401) aparecia como lista vazia.
  // Só bloqueia a tela quando ainda não há dados: com refetchOnWindowFocus
  // ligado, um refetch falho em segundo plano não pode apagar a lista que o
  // usuário está usando.
  const loadError: any = teamInclusions
    ? null
    : (inclusionsError || eventsError || functionsError || collaboratorsError || accommodationsError);

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

      // Canceladas: quem decide é o filtro "Status Inclusão" (abaixo, em
      // filteredData). Descartar aqui tornava as opções "Todas" e "Canceladas"
      // do seletor sempre vazias, e a linha "Cancelado" da tabela inalcançável.

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
        "aprovado", "cancelado"
      ];

      return validStatusesWithoutCollaborator.includes(inclusion.status);
    });
    return filtered;
  }, [teamInclusions]);

  // Criar map de accommodations por teamInclusionId.
  // Havendo mais de um registro para a mesma inclusão, o ÚLTIMO vence — é a
  // semântica original (new Map(entries)) e representa a hospedagem mais
  // recente. Trocar para "primeiro vence" mudaria o registro exibido.
  const accommodationMap = useMemo(() => {
    const map = new Map<string, Accommodation>();
    accommodations?.forEach(acc => {
      if (acc.teamInclusionId) map.set(acc.teamInclusionId, acc);
    });
    return map;
  }, [accommodations]);

  // Índices O(1): antes cada linha da tabela e cada comparação da ordenação
  // faziam .find() nas listas completas de eventos, funções e colaboradores.
  const eventById = useMemo(() => {
    const map = new Map<string, Event>();
    events?.forEach(e => { if (!map.has(e.id)) map.set(e.id, e); });
    return map;
  }, [events]);

  const functionById = useMemo(() => {
    const map = new Map<string, Function>();
    functions?.forEach(f => { if (!map.has(f.id)) map.set(f.id, f); });
    return map;
  }, [functions]);

  const collaboratorById = useMemo(() => {
    const map = new Map<string, Collaborator>();
    collaborators?.forEach(c => { if (!map.has(c.id)) map.set(c.id, c); });
    return map;
  }, [collaborators]);

  // Função auxiliar para obter valor de campo para ordenação
  const getFieldValue = (inclusion: TeamInclusion, field: string) => {
    const event = eventById.get(inclusion.eventId);
    const func = functionById.get(inclusion.functionId);
    const collaborator = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
    const accommodation = accommodationMap.get(inclusion.id);

    switch (field) {
      case 'id': return inclusion.inclusionNumber || 0;
      case 'event': return event?.name || '';
      case 'function': return func?.name || '';
      case 'collaborator': return fixEncoding(collaborator?.fullName) || '';
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

  // Filtrar e ordenar dados
  const filteredData = useMemo(() => {
    let data = teamInclusionsWithAccommodation.filter(inclusion => {
      if (showOnlyPendingSwaps && !pendingSwapByInclusion.has(inclusion.id)) return false;
      const matchesEvent = filters.eventId === "all" || inclusion.eventId === filters.eventId;
      const matchesFunction = filters.functionId.length === 0 || filters.functionId.includes(inclusion.functionId);
      const matchesCollaborator = filters.collaboratorId === "all" || inclusion.collaboratorId === filters.collaboratorId;
      
      const _q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
      const _colName = (inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId)?.fullName ?? '' : '').toLowerCase();
      const matchesSearchId = filters.searchId === "" ||
        String(inclusion.inclusionNumber ?? '').toLowerCase().includes(_q) ||
        _colName.includes(_q);

      const accommodation = accommodationMap.get(inclusion.id);
      const accommodationStatus = accommodation ? "processed" : "pending";
      const matchesAccommodationStatus = filters.accommodationStatus === "all" ||
        filters.accommodationStatus === accommodationStatus;

      // "Canceladas" só canceladas; "Todas" mostra tudo; "ativas" esconde as
      // canceladas. Antes a opção "Canceladas" caía no else e devolvia false
      // para todo mundo — a lista ficava sempre vazia.
      const matchesInclusionStatus =
        filters.inclusionStatus === "all" ? true
        : filters.inclusionStatus === "cancelado" ? inclusion.status === "cancelado"
        : inclusion.status !== "cancelado";

      return matchesEvent && matchesFunction && matchesCollaborator && matchesSearchId &&
             matchesAccommodationStatus && matchesInclusionStatus;
    });

    // Aplicar ordenação
    if (sortConfig) {
      data = data.sort((a, b) => {
        const aValue = getFieldValue(a, sortConfig.field);
        const bValue = getFieldValue(b, sortConfig.field);

        // Vazios sempre por último — antes, com os dois nulos, o comparador
        // devolvia 1 nos dois sentidos (comparador inconsistente).
        const aEmpty = aValue === null || aValue === undefined || aValue === '';
        const bEmpty = bValue === null || bValue === undefined || bValue === '';
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        // Texto em pt-BR: sem localeCompare, nomes acentuados iam para o fim.
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const cmp = aValue.localeCompare(bValue, 'pt-BR');
          return sortConfig.direction === 'asc' ? cmp : -cmp;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [teamInclusionsWithAccommodation, accommodationMap, eventById, functionById, collaboratorById,
      filters, sortConfig, showOnlyPendingSwaps, pendingSwapByInclusion]);

  // Banner: trocas pendentes que exigem análise de Compras. Derivado da MESMA
  // lista renderizada — com o filtro ligado, toda linha visível tem troca
  // pendente, então o contador nunca diverge do que está na tabela.
  const pendingAccommodationSwapsCount = useMemo(() => {
    if (!isPurchasingRole) return 0;
    if (showOnlyPendingSwaps) return filteredData.length;
    return filteredData.filter(inc => pendingSwapByInclusion.has(inc.id)).length;
  }, [isPurchasingRole, showOnlyPendingSwaps, filteredData, pendingSwapByInclusion]);

  // Linhas elegíveis ao lote: pendentes, não canceladas e visíveis agora.
  const selectableInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    filteredData.forEach(inc => {
      if (!accommodationMap.get(inc.id) && inc.status !== 'cancelado') ids.add(inc.id);
    });
    return ids;
  }, [filteredData, accommodationMap]);

  // A seleção sobrevive à troca de filtros e a registros feitos em outra aba; o
  // contador e o botão de lote usam só o que ainda é aplicável, senão o número
  // prometido no rodapé não batia com o que era processado.
  const effectiveSelectedForBatch = useMemo(
    () => selectedInclusionsForBatch.filter(id => selectableInclusionIds.has(id)),
    [selectedInclusionsForBatch, selectableInclusionIds]
  );

  const allSelectableSelected =
    selectableInclusionIds.size > 0 &&
    Array.from(selectableInclusionIds).every(id => selectedInclusionsForBatch.includes(id));

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
      
      try {
        await apiRequest("PATCH", `/api/team-inclusions/${accommodationData.teamInclusionId}`, {
          status: newStatus,
          phase: newPhase,
          updatedBy: user?.id
        });
      } catch (err: any) {
        // A hospedagem JÁ foi criada aqui: o toast genérico "Erro ao registrar
        // hospedagem" fazia o usuário tentar de novo e duplicar o registro.
        err.body = {
          message: err?.body?.message
            ? `Hospedagem registrada, mas o status da inclusão não foi atualizado: ${err.body.message}`
            : "Hospedagem registrada, mas não foi possível atualizar o status da inclusão.",
        };
        throw err;
      }

      return accommodation;
    },
    // onSettled: mesmo quando o PATCH de status falha a hospedagem já existe no
    // servidor, então a tela precisa recarregar de qualquer forma.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error?.body?.message || "Erro ao registrar hospedagem",
      });
    },
  });

  const updateAccommodationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiRequest("PATCH", `/api/accommodations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error?.body?.message || "Erro ao atualizar hospedagem",
      });
    },
  });

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

  // Sessão expirada ou rede fora: mostrar o motivo em vez de "nenhuma inclusão
  // com hospedagem encontrada", que sugeria que simplesmente não há trabalho.
  if (loadError) {
    const isAuthError = loadError?.status === 401 || loadError?.status === 403;
    return (
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-[15px] font-bold text-slate-700 mb-1">
          {isAuthError ? "Sessão expirada ou sem permissão" : "Não foi possível carregar as hospedagens"}
        </h3>
        <p className="text-[13px] text-slate-400 mb-4">
          {isAuthError
            ? "Entre novamente para continuar. Nenhum dado foi perdido."
            : (loadError?.body?.message || "Verifique sua conexão e tente novamente.")}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
            queryClient.invalidateQueries({ queryKey: ["/api/events"] });
            queryClient.invalidateQueries({ queryKey: ["/api/functions"] });
            queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
            queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
          }}
          className="rounded-lg"
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  const canEditField = canEditScreen(user, "accommodations");

  const totalCount = filteredData.length;
  const purchasedCount = filteredData.filter(inc => accommodationMap.get(inc.id)).length;
  // Inclusão cancelada não é "pendente" — contá-la inflava a fila de trabalho
  // quando o filtro mostrava canceladas.
  const pendingCount = filteredData.filter(inc => !accommodationMap.get(inc.id) && inc.status !== 'cancelado').length;

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

      {/* Banner: trocas pendentes aguardando análise de Compras.
          Com o filtro ligado o banner continua visível mesmo sem resultados —
          ele é o único controle do toggle e sumir deixaria o filtro travado. */}
      {isPurchasingRole && (pendingAccommodationSwapsCount > 0 || showOnlyPendingSwaps) && (
        <button
          onClick={() => setShowOnlyPendingSwaps(v => !v)}
          className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-colors ${showOnlyPendingSwaps ? 'bg-amber-100 border-amber-400' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
        >
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-800 leading-snug">
              {pendingAccommodationSwapsCount === 0
                ? 'Nenhuma troca pendente nos filtros atuais'
                : pendingAccommodationSwapsCount === 1
                  ? '1 solicitação de troca de colaborador aguarda sua análise'
                  : `${pendingAccommodationSwapsCount} solicitações de troca de colaborador aguardam sua análise`}
            </p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              {showOnlyPendingSwaps
                ? 'Mostrando apenas linhas com troca pendente — clique para ver todas'
                : 'Clique aqui para filtrar e ver apenas as linhas com troca pendente'}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded-full">
            {showOnlyPendingSwaps ? 'Filtro ativo' : `${pendingAccommodationSwapsCount} pendente${pendingAccommodationSwapsCount !== 1 ? 's' : ''}`}
          </span>
        </button>
      )}

      {/* Aplicar em Lote — discrete card */}
      <div
        className="bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden"
        onClick={() => toggleSection('basic')}
        role="button"
        tabIndex={0}
        aria-expanded={expandedSections.basic}
        aria-label="Aplicar em lote — expandir ou recolher"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('basic'); }
        }}
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
                      <Label htmlFor="quick-hotel-name" className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Nome do Hotel *</Label>
                      <Input
                        id="quick-hotel-name"
                        placeholder="Hotel Copacabana"
                        value={accommodationData["quick"]?.hotelName || ""}
                        onChange={(e) => handleAccommodationDataChange("quick", "hotelName", e.target.value)}
                        className="h-[38px] bg-slate-50 border-slate-200 rounded-xl text-sm"
                        data-testid="input-quick-hotel-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="quick-hotel-location" className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Localização *</Label>
                      <Input
                        id="quick-hotel-location"
                        placeholder="Rio de Janeiro, RJ"
                        value={accommodationData["quick"]?.hotelLocation || ""}
                        onChange={(e) => handleAccommodationDataChange("quick", "hotelLocation", e.target.value)}
                        className="h-[38px] bg-slate-50 border-slate-200 rounded-xl text-sm"
                        data-testid="input-quick-hotel-location"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-accommodation-observations" className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Observações <span className="text-slate-300 normal-case">(opcional)</span></Label>
                    <Textarea
                      id="quick-accommodation-observations"
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
                const selectionStatus = effectiveSelectedForBatch.length > 0 ? 'done' : 'empty';

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
                          <p className="text-[11px] text-slate-400">{effectiveSelectedForBatch.length > 0 ? `${effectiveSelectedForBatch.length} na fila` : 'Selecione na tabela'}</p>
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
              <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl transition-all ${effectiveSelectedForBatch.length > 0 ? 'bg-[#0033CC] text-white shadow-lg shadow-blue-200' : 'bg-slate-200 text-slate-400'}`}>
                <span className="material-symbols-outlined" style={{fontSize:18}}>bed</span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 leading-none mb-0.5">Hospedagens</p>
                  <p className="text-lg font-black leading-none">{effectiveSelectedForBatch.length}</p>
                </div>
              </div>
              {(() => {
                const q = accommodationData["quick"];
                const ready = effectiveSelectedForBatch.length > 0 && !!(q?.hotelName) && !!(q?.hotelLocation);
                const partial = !ready && (effectiveSelectedForBatch.length > 0 || !!(q?.hotelName));
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
                  disabled={effectiveSelectedForBatch.length === 0 || createAccommodationMutation.isPending}
                  data-testid="button-apply-to-selected"
                  className="h-[38px] px-6 font-bold rounded-xl flex items-center gap-2 transition-all"
                  style={{
                    background: effectiveSelectedForBatch.length === 0 ? '#E2E8F0' : '#0033CC',
                    color: effectiveSelectedForBatch.length === 0 ? '#94A3B8' : 'white',
                    boxShadow: effectiveSelectedForBatch.length > 0 ? '0 4px 14px rgba(0,51,204,0.3)' : 'none',
                    cursor: effectiveSelectedForBatch.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Save className="w-4 h-4" />
                  {createAccommodationMutation.isPending ? "Aplicando..." : `Aplicar a ${effectiveSelectedForBatch.length} Hospedagens`}
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
                      aria-label="Selecionar todas as hospedagens pendentes"
                      style={{width:16,height:16,cursor:'pointer',accentColor:'#0033CC'}}
                      checked={allSelectableSelected}
                      disabled={selectableInclusionIds.size === 0}
                      onChange={toggleAllInclusions}
                    />
                  </th>
                )}
                <SortableHeader field="id" sortConfig={sortConfig} onSort={handleSort} className="!px-3 !py-3">ID</SortableHeader>
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
                  const event = eventById.get(inclusion.eventId);
                  const func = functionById.get(inclusion.functionId);
                  const collaborator = (inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined);
                  const accommodation = accommodationMap.get(inclusion.id);
                  const hasAccommodation = !!accommodation;
                  const isCanceled = inclusion.status === 'cancelado';
                  const isPostPurchaseRow = ['hospedagem_comprada', 'hospedagem_passagem_comprada'].includes(inclusion.status);
                  const displayName = toTitleCase(collaborator?.fullName);
                  const colNameInitials = (displayName || '??').split(' ').slice(0,2).map((n:string) => n[0]).join('').toUpperCase();
                  const hasPendingSwap = pendingSwapByInclusion.has(inclusion.id);
                  const borderColor = hasPendingSwap ? '#F59E0B' : isCanceled ? '#E2E8F0' : hasAccommodation ? '#22C55E' : '#F97316';
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
                              aria-label={`Selecionar hospedagem da inclusão #${inclusion.inclusionNumber ?? ''}`}
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
                            {inclusion.status === 'hospedagem_comprada' && pendingSwapByInclusion.has(inclusion.id) && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                                <span className="text-[10px] font-medium text-amber-600">Troca pendente</span>
                              </span>
                            )}
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
                              aria-label={`Visualizar hospedagem da inclusão #${inclusion.inclusionNumber ?? ''}`}
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
                              aria-label={`Registrar hospedagem da inclusão #${inclusion.inclusionNumber ?? ''}`}
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

      {/* Modal confirmação — Aprovar troca */}
      {swapConfirmAction === 'approve' && pendingSwap && (
        <Dialog open onOpenChange={() => setSwapConfirmAction(null)}>
          <DialogContent className="max-w-[400px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold text-slate-800">Aprovar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-slate-600">Ao confirmar, a alteração do colaborador será liberada para esta escala.</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[12px]">
              <div className="flex items-start gap-2">
                <span className="text-slate-400 font-medium shrink-0">Colaborador atual:</span>
                <span className="font-semibold text-slate-700">{toTitleCase(fixEncoding((selectedInclusion?.collaboratorId ? collaboratorById.get(selectedInclusion.collaboratorId) : undefined)?.fullName) || '—')}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-400 font-medium shrink-0">Colaborador solicitado:</span>
                <span className="font-semibold text-blue-700">{toTitleCase(fixEncoding(collaboratorById.get((pendingSwap as any).new_collaborator_id)?.fullName) || '—')}</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSwapConfirmAction(null)} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={() => { approveSwapMutation.mutate((pendingSwap as any).id); setSwapConfirmAction(null); }}
                disabled={approveSwapMutation.isPending}
                className="px-4 py-2 text-[12px] font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar aprovação</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal confirmação — Rejeitar troca */}
      {swapConfirmAction === 'reject' && pendingSwap && (
        <Dialog open onOpenChange={() => { setSwapConfirmAction(null); setSwapRejectReason(''); }}>
          <DialogContent className="max-w-[400px] gap-4">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold text-slate-800">Rejeitar troca de colaborador?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-slate-600">A solicitação será recusada e a escala continuará com o colaborador atual.</p>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Motivo da rejeição <span className="text-red-400">*</span></label>
              <textarea
                value={swapRejectReason}
                onChange={e => setSwapRejectReason(e.target.value)}
                className="mt-1.5 w-full border border-slate-200 rounded-xl p-2.5 text-[13px] text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
                rows={3}
                placeholder="Descreva o motivo da rejeição..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setSwapConfirmAction(null); setSwapRejectReason(''); }} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={() => {
                  if (!swapRejectReason.trim()) return;
                  rejectSwapMutation.mutate({ id: (pendingSwap as any).id, comment: swapRejectReason });
                  setSwapConfirmAction(null);
                  setSwapRejectReason('');
                }}
                disabled={rejectSwapMutation.isPending || !swapRejectReason.trim()}
                className="px-4 py-2 text-[12px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >Confirmar rejeição</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
              onClick={() => { setShowSuccessModal(false); setSuccessInfo(null); }}
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
