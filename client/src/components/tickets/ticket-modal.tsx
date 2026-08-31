// Modal "Registro de Passagem": header + abas (Resumo / Dados / Complementos)
// + rodapé. Queries e mutations que dependem da inclusão selecionada vivem aqui.
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane, Edit, CheckCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { useVoucherFill } from "./use-voucher-fill";
import CommentsModal from "@/components/modals/comments-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isReadOnly } from "@/lib/interactions";
import { useEventLock, PastEventBanner, PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";
import { canEdit as canEditScreen } from "@/lib/permissions";
import {
  extractTravelSuggestion,
  suggestionToFormPatch,
  periodDays,
  getRequiredFields,
  type TicketFormValues,
  type PlannedImpactContext,
} from "@/lib/ticket-form";
import { refeicaoCents, refeicaoPerfil } from "@shared/alimentacao";
import type { TeamInclusion, Ticket, User, Comment, TeamInclusionLog } from "@shared/schema";
import TicketFormFields, { fieldTestIdSlug } from "./ticket-form-fields";
import TicketSummaryTab from "./ticket-summary-tab";
import TicketViewDetails from "./ticket-view-details";
import TicketExtrasTab from "./ticket-extras-tab";
import SuggestedDates from "./suggested-dates";
import type { TicketsData, SwapRequestRow } from "./use-tickets-data";
import type { FormFieldHelpers, TicketFormHandlers } from "./types";

interface TicketModalProps {
  open: boolean;
  inclusion: TeamInclusion | null;
  data: TicketsData;
  user: User | null;
  form: TicketFormValues;
  helpers: FormFieldHelpers;
  handlers: TicketFormHandlers;
  editingTicketId: string | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  showCommentsModal: boolean;
  onShowCommentsModal: (open: boolean) => void;
  /** Modal principal fica não-modal enquanto o de sucesso está aberto. */
  successOpen: boolean;
  onRequestClose: () => void;
  onStartEdit: (ticket: Ticket) => void;
  /** "Cancelar" em edição: volta ao modo visualização (não fecha o modal). */
  onCancelEdit: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export default function TicketModal({
  open, inclusion, data, user, form, helpers, handlers, editingTicketId, activeTab, onTabChange,
  showCommentsModal, onShowCommentsModal, successOpen, onRequestClose, onStartEdit, onCancelEdit, onSubmit, isSubmitting,
}: TicketModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inclusionId = inclusion?.id;
  // Evento encerrado (regra 19/08): passagem depende da escalação — depois do
  // término só o administrador mexe (o servidor devolve 403).
  const eventLock = useEventLock();

  const { data: comments, isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/comments", inclusionId],
    enabled: !!inclusionId,
  });
  const { data: inclusionLogs, isLoading: logsLoading } = useQuery<TeamInclusionLog[]>({
    queryKey: ["/api/team-inclusions", inclusionId, "logs"],
    enabled: !!inclusionId,
  });
  const { data: swapRequests } = useQuery<SwapRequestRow[]>({
    queryKey: ["/api/swap-requests/inclusion", inclusionId],
    queryFn: async () => {
      if (!inclusionId) return [];
      const r = await fetch(`/api/swap-requests/inclusion/${inclusionId}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!inclusionId,
  });
  const pendingSwap = swapRequests?.find(s => s.status === "pendente");
  const latestSwap = swapRequests?.find(s => ["aprovado", "rejeitado"].includes(s.status));

  const approveSwapMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {})).json(),
    onSuccess: () => {
      toast({ title: "Troca aprovada", description: "O colaborador foi atualizado na escalação." });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", inclusionId] });
      // A lista global alimenta o banner e os selos "Troca pendente" da tabela.
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (err: { body?: { message?: string } }) => {
      toast({ title: "Erro", description: err?.body?.message || "Erro ao aprovar troca", variant: "destructive" });
    },
  });
  const rejectSwapMutation = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) =>
      (await apiRequest("PATCH", `/api/swap-requests/${id}/reject`, { reviewComment: comment || "" })).json(),
    onSuccess: () => {
      toast({ title: "Troca rejeitada" });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", inclusionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
    },
    onError: (err: { body?: { message?: string } }) => {
      toast({ title: "Erro", description: err?.body?.message || "Erro ao rejeitar troca", variant: "destructive" });
    },
  });

  // Contexto do "Impacto no Planejado": período completo início→fim (mesma
  // régua do Planejado) e valores de refeição da função (cenotécnica ou não).
  const impactCtx = useMemo<PlannedImpactContext | undefined>(() => {
    if (!inclusion) return undefined;
    // Perfil (18/08): Key Account / Gerente = 44/44; cenotécnica 35/35; demais 40/40
    const perfil = refeicaoPerfil(data.getFunctionName(inclusion.functionId), inclusion.atendimentoTipo);
    const { almocoCents, jantarCents } = refeicaoCents(perfil, data.systemSettings);
    // Local do evento entra no contexto: em SP a mobilidade é zero, e a prévia
    // precisa dizer o mesmo que o Planejado.
    return {
      workDays: periodDays(inclusion.scheduleStartDate, inclusion.scheduleEndDate),
      eventLocation: data.eventById.get(inclusion.eventId)?.location ?? null,
      almocoCents, jantarCents,
    };
  }, [inclusion, data.systemSettings, data.functionById]);

  if (!inclusion) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onRequestClose(); }} modal={!successOpen}>
        <DialogContent className="!max-w-[1100px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden" />
      </Dialog>
    );
  }

  const sid = inclusion.id;
  const ticket = data.getTicket(sid);
  const collaborator = data.getCollaborator(inclusion.collaboratorId);
  const collaboratorName = data.getCollaboratorName(inclusion.collaboratorId);
  const eventLocked = eventLock.isLockedInclusion(inclusion);
  const roMode = isReadOnly(inclusion, user) || eventLocked;
  const canEditTicket = canEditScreen(user, "tickets");
  const isEditing = editingTicketId === sid;
  const isFormMode = !ticket || isEditing;
  const suggestion = extractTravelSuggestion(inclusion);
  const dis = roMode || !canEditTicket;
  const tabTrigger = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#2563EB] data-[state=active]:text-[#2563EB] text-slate-500 bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";

  const onTransportChange = (value: string) => {
    const eventLocation = data.getEventLocation(inclusion.eventId);
    const hasGoodLocation = eventLocation && eventLocation !== "Destino não informado";
    handlers.onPatch(sid, {
      transportType: value,
      departureCityDestination: form.departureCityDestination || (hasGoodLocation ? eventLocation : ""),
      returnCityOrigin: form.returnCityOrigin || (hasGoodLocation ? eventLocation : ""),
      ...(value === "rodoviario" ? {
        actualDepartureDate: inclusion.scheduleStartDate || form.actualDepartureDate || "",
        actualReturnDate: inclusion.scheduleEndDate || form.actualReturnDate || "",
      } : {}),
    });
  };

  // Um anexo só: o PDF do voucher vira comprovante E preenche os campos
  // (pedido do dono, 28/08 — "não ter dois pra subir").
  const voucher = useVoucherFill({
    colaborador: inclusion.collaboratorId ? data.getCollaboratorName(inclusion.collaboratorId) : undefined,
    trecho: form.isReturnOnly ? "so_volta" : form.isOneWay ? "so_ida" : "ida_volta",
    onPreencher: (campos: Record<string, string>) => handlers.onPatch(sid, campos),
  });

  const useSuggestion = () => {
    const patch = suggestionToFormPatch(suggestion, form);
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      toast({ title: "Nada a preencher", description: "Os campos já estão preenchidos ou a sugestão não tem data/horário reconhecível." });
      return;
    }
    handlers.onPatch(sid, patch);
    const labels = getRequiredFields(form.transportType, !!form.isOneWay).filter(f => keys.includes(f.field)).map(f => f.label);
    toast({ title: "Sugestão aplicada", description: labels.length ? `Preenchido: ${labels.join(", ")}. Confira antes de registrar.` : "Confira os campos antes de registrar." });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onRequestClose(); }} modal={!successOpen}>
        <DialogContent className="!max-w-[1100px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
          {/* HEADER */}
          <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0 flex items-center gap-4 pr-14" style={{ background: "linear-gradient(to right, #f8faff 0%, #ffffff 60%)" }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg, #3b7ef8 0%, #1d4ed8 100%)", boxShadow: "0 4px 16px #2563EB30" }}>
              <Plane style={{ width: 20, height: 20 }} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[17px] font-bold text-slate-900 leading-tight m-0 p-0">Registro de Passagem</DialogTitle>
              <div className="text-[12px] text-slate-400 mt-0.5 truncate">
                <span className="font-mono font-bold text-slate-500">#{inclusion.inclusionNumber || "N/A"}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                {collaboratorName}
              </div>
            </div>
            {roMode ? (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-full shrink-0 border border-amber-200"
                title={eventLocked ? PAST_EVENT_BLOCK_MSG : undefined}
              >Somente Leitura</span>
            ) : ticket && !isEditing ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-[11px] font-bold rounded-full shrink-0 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Comprada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 text-[11px] font-bold rounded-full shrink-0 border border-orange-200">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
              </span>
            )}
          </div>

          <PastEventBanner show={eventLocked} message={eventLock.bannerMessage(inclusion.eventId)} className="mx-6 mt-3" />

          {/* ABAS */}
          <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="px-6 border-b border-slate-100 shrink-0">
              <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
                <TabsTrigger value="resumo" className={tabTrigger}>Resumo</TabsTrigger>
                <TabsTrigger value="dados" className={tabTrigger}>
                  Dados da Passagem
                  {ticket && !isEditing
                    ? <span className="ml-1.5 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">✓</span>
                    : <span className="ml-1.5 bg-amber-100 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</span>}
                </TabsTrigger>
                <TabsTrigger value="complementos" className={tabTrigger}>Complementos e Histórico</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <TabsContent value="resumo" className="m-0 p-6">
                <TicketSummaryTab
                  inclusion={inclusion}
                  ticket={ticket}
                  collaborator={collaborator}
                  eventName={data.getEventName(inclusion.eventId)}
                  functionName={data.getFunctionName(inclusion.functionId)}
                  collaboratorName={collaboratorName}
                  getCollaboratorName={data.getCollaboratorName}
                  pendingSwap={pendingSwap}
                  latestSwap={latestSwap}
                  isPurchasingRole={data.isPurchasingRole && !eventLocked}
                  swapPending={approveSwapMutation.isPending || rejectSwapMutation.isPending}
                  onApproveSwap={(id) => approveSwapMutation.mutate(id)}
                  onRejectSwap={(id, comment) => rejectSwapMutation.mutate({ id, comment })}
                />
              </TabsContent>

              <TabsContent value="dados" className="m-0 p-6">
                {ticket && !isEditing ? (
                  <TicketViewDetails ticket={ticket} inclusion={inclusion} />
                ) : (
                  <div className="space-y-4">
                    {/* Voucher/anexo em primeiro lugar (28/08): é por aqui que a
                        passagem começa — o arquivo é o comprovante e a fonte
                        dos dados ao mesmo tempo. */}
                    <div className="border border-blue-200 bg-blue-50/40 rounded-2xl overflow-hidden">
                      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2.5 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="text-[11px] font-black text-primary uppercase tracking-[0.12em]">
                          Voucher e anexos
                        </span>
                        {voucher.lendo && (
                          <span className="ml-auto text-[11px] font-semibold text-primary">Lendo o voucher…</span>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-[12px] text-slate-600 mb-3">
                          Anexe aqui o <strong>voucher em PDF</strong>: ele fica guardado como comprovante
                          <strong> e preenche os campos da passagem automaticamente</strong>. Outros arquivos
                          (imagem, comprovante extra) também podem ser anexados — esses só são guardados.
                        </p>
                        <AttachmentUpload
                          attachmentIds={form.attachmentIds || []}
                          onAttachmentsChange={(attachmentIds) => handlers.onFieldChange(sid, "attachmentIds", attachmentIds)}
                          onFileSelected={dis ? undefined : voucher.lerArquivo}
                          disabled={isSubmitting || roMode}
                        />
                      </div>
                    </div>

                    {/* Configuração */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 mb-3">Configuração</div>
                      <div className="flex items-end gap-6 flex-wrap">
                        <div className="flex-1 min-w-[180px]">
                          <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Modalidade *</Label>
                          <Select value={form.transportType || "aereo"} onValueChange={onTransportChange}>
                            <SelectTrigger data-testid={`select-transport-type-${sid}`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="aereo">✈️ Aérea</SelectItem>
                              <SelectItem value="rodoviario">🚌 Rodoviária</SelectItem>
                              <SelectItem value="van">🚐 Van</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {form.transportType !== "van" && (
                          <div className="pb-1">
                            <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Trechos deste bilhete</Label>
                            {/* Três recortes (28/08): a volta pode ter sido emitida por OUTRA
                                agência, virando um bilhete só de volta. */}
                            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label="Trechos deste bilhete">
                              {([
                                { chave: "ida_volta", rotulo: "Ida e volta" },
                                { chave: "so_ida", rotulo: "Só ida" },
                                { chave: "so_volta", rotulo: "Só volta" },
                              ] as const).map((op) => {
                                const atual = form.isReturnOnly ? "so_volta" : form.isOneWay ? "so_ida" : "ida_volta";
                                const ativo = atual === op.chave;
                                return (
                                  <button
                                    key={op.chave}
                                    type="button"
                                    role="radio"
                                    aria-checked={ativo}
                                    disabled={dis}
                                    onClick={() => {
                                      if (dis) return;
                                      handlers.onPatch(sid, {
                                        isOneWay: op.chave === "so_ida",
                                        isReturnOnly: op.chave === "so_volta",
                                      });
                                    }}
                                    className={`rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                      ativo ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                    data-testid={`trecho-${op.chave}-${sid}`}
                                  >
                                    {op.rotulo}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <TicketFormFields
                      scope={sid}
                      variant="modal"
                      form={form}
                      disabled={dis}
                      helpers={helpers}
                      handlers={handlers}
                      impactCtx={impactCtx}
                      suggestion={suggestion}
                      testId={(name) => `input-${fieldTestIdSlug(name)}-${sid}`}
                    />

                    <SuggestedDates
                      suggestion={suggestion}
                      hideWhenEmpty
                      compact
                      hint="Referência para preenchimento"
                      onUseSuggestion={form.transportType === "van" ? undefined : useSuggestion}
                      useDisabled={dis}
                    />

                    <div className="bg-white border border-slate-200 rounded-2xl p-4">
                      <Label htmlFor={`ticketObservations-${sid}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Observações sobre a Passagem</Label>
                      <Textarea
                        id={`ticketObservations-${sid}`}
                        placeholder="Informações adicionais sobre a passagem..."
                        value={form.ticketObservations || ""}
                        onChange={(e) => handlers.onFieldChange(sid, "ticketObservations", e.target.value)}
                        className="h-24 resize-none"
                        data-testid={`textarea-ticket-observations-${sid}`}
                        disabled={dis}
                      />
                    </div>

                  </div>
                )}
              </TabsContent>

              <TabsContent value="complementos" className="m-0 p-6">
                <TicketExtrasTab
                  comments={comments}
                  commentsLoading={commentsLoading}
                  logs={inclusionLogs}
                  logsLoading={logsLoading}
                  getUserName={data.getUserName}
                  readOnly={roMode}
                  onOpenComments={() => onShowCommentsModal(true)}
                />
              </TabsContent>
            </div>
          </Tabs>

          {/* FOOTER */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-white">
            {!isFormMode ? (
              <>
                <Button variant="outline" onClick={onRequestClose} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium">Fechar</Button>
                {!roMode && canEditTicket && ticket && (
                  <Button variant="outline" onClick={() => onStartEdit(ticket)} className="flex items-center gap-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl px-5 py-2 text-sm font-medium">
                    <Edit className="w-4 h-4" />Editar Passagem
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* Sem "Salvar rascunho": ou registra completo, ou descarta. Em edição, "Cancelar" volta à visualização. */}
                <Button variant="ghost" onClick={isEditing ? onCancelEdit : onRequestClose} className="text-slate-500 hover:text-slate-700 rounded-xl px-5 py-2 text-sm font-medium">Cancelar</Button>
                {!roMode && canEditTicket && (
                  <Button
                    onClick={onSubmit}
                    disabled={isSubmitting}
                    style={{ background: "#2563EB" }}
                    className="text-white rounded-xl px-5 py-2 text-sm font-bold hover:opacity-90 flex items-center gap-2"
                    data-testid={`button-register-ticket-${sid}`}
                  >
                    {isSubmitting
                      ? (isEditing ? "Atualizando..." : "Registrando...")
                      : <><CheckCircle className="w-4 h-4" /> {isEditing ? "Atualizar Passagem" : "Registrar Passagem"}</>}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CommentsModal open={showCommentsModal} onClose={() => onShowCommentsModal(false)} teamInclusionId={sid} />
    </>
  );
}
