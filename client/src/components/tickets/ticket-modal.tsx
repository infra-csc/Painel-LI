// Modal "Registro de passagem": header + abas (Resumo / Dados / Complementos)
// + rodapé. Queries e mutations que dependem da inclusão selecionada vivem aqui.
import { useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane, Edit, CheckCircle, FileText, Bus, Truck, Lock, Loader2, Settings2 } from "lucide-react";
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
import { apiErrorMessage } from "@/lib/api-error";
import { avisoDepoisDaTroca } from "@/hooks/use-vaga-acoes";
import { isReadOnly } from "@/lib/interactions";
import { useEventLock, PastEventBanner, PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";
import { hasPermission } from "@/lib/role-utils";
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
import { PassagensDeHistorico } from "./passagens-de-historico";
import TicketViewDetails from "./ticket-view-details";
import TicketExtrasTab from "./ticket-extras-tab";
import SuggestedDates from "./suggested-dates";
import type { TicketsData, SwapRequestRow } from "./use-tickets-data";
import type { FormFieldHelpers, TicketFormHandlers } from "./types";
import { RequiredMark } from "@/components/forms/required-mark";
import { AvisoDaVaga } from "@/components/avisos-de-alteracao/aviso-da-vaga";
import { SECAO } from "./ticket-summary-tab";
import type { SinalDeViagem } from "./use-sinais-de-viagem";
import { TrechoDiretoCampo, BloqueioDeViagemAviso, SegueDiretoAviso, type BloqueioDeViagem } from "./trecho-direto-campo";
import { TrechoDiretoDaVaga } from "./sinais-da-vaga";

/**
 * Moldura do modal (07/10): 1100px no computador; no celular ocupa a tela
 * inteira (um modal de 95vw × 88vh com rodapé fixo sobrava 20px de cada lado
 * e cortava o formulário no meio).
 */
const MOLDURA = "!max-w-[1100px] w-[95vw] max-h-[88vh] sm:h-[min(88vh,820px)] !flex !flex-col p-0 gap-0 overflow-hidden max-sm:w-full max-sm:!max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0";

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
  onRequestClose: () => void;
  onStartEdit: (ticket: Ticket) => void;
  /** "Cancelar" em edição: volta ao modo visualização (não fecha o modal). */
  onCancelEdit: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  /** Sinais de viagem desta vaga (09/10): vizinhas para o trecho direto, sugestão, encadeamento. */
  sinal?: SinalDeViagem;
  /** 409 do servidor: a viagem cruza outra viagem do colaborador. */
  bloqueioDeViagem?: BloqueioDeViagem | null;
  /** Aviso no topo da aba Dados (09/10 — "Preenchido com o voo da busca"). */
  avisoDosDados?: ReactNode;
  /** "Buscar preços" desta vaga (09/10): leva à tela Busca de passagens. */
  onBuscarPrecos?: () => void;
}

export default function TicketModal({
  open, inclusion, data, user, form, helpers, handlers, editingTicketId, activeTab, onTabChange,
  showCommentsModal, onShowCommentsModal, onRequestClose, onStartEdit, onCancelEdit, onSubmit, isSubmitting, sinal, bloqueioDeViagem,
  avisoDosDados, onBuscarPrecos,
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
    mutationFn: async (id: string) =>
      (await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {})).json() as Promise<{ logisticaParaRevisar?: boolean; passagensParaHistorico?: number }>,
    onSuccess: (resposta) => {
      toast({ title: "Troca aprovada", description: "O colaborador foi atualizado na escalação." });
      // Passagem/hospedagem já registradas para o colaborador antigo (24/09).
      { const aviso = avisoDepoisDaTroca(resposta); if (aviso) toast({ title: "Compras precisa revisar", description: aviso }); }
      // A passagem de quem saiu virou histórico: a lista de passagens muda.
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", inclusionId] });
      // A lista global alimenta o banner e os selos "Troca pendente" da tabela.
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    // 409 = pedido já decidido; a mensagem do servidor explica.
    onError: (err: unknown) => {
      toast({ title: "Não foi possível aprovar a troca", description: apiErrorMessage(err, "Tente de novo em instantes."), variant: "destructive" });
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
    onError: (err: unknown) => {
      toast({ title: "Não foi possível rejeitar a troca", description: apiErrorMessage(err, "Tente de novo em instantes."), variant: "destructive" });
    },
  });

  // Contexto do "Impacto no Planejado": período completo início→fim (mesma
  // régua do Planejado) e valores de refeição da função (cenotécnica ou não).
  const { getFunctionName, systemSettings, eventById } = data;
  const impactCtx = useMemo<PlannedImpactContext | undefined>(() => {
    if (!inclusion) return undefined;
    // Perfil (18/08): Key Account / Gerente = 44/44; cenotécnica 35/35; demais 40/40
    const perfil = refeicaoPerfil(getFunctionName(inclusion.functionId), inclusion.atendimentoTipo);
    const { almocoCents, jantarCents } = refeicaoCents(perfil, systemSettings);
    // Local do evento entra no contexto: em SP a mobilidade é zero, e a prévia
    // precisa dizer o mesmo que o Planejado.
    return {
      workDays: periodDays(inclusion.scheduleStartDate, inclusion.scheduleEndDate),
      eventLocation: eventById.get(inclusion.eventId)?.location ?? null,
      almocoCents, jantarCents,
    };
  }, [inclusion, systemSettings, eventById, getFunctionName]);

  // Um anexo só: o PDF do voucher vira comprovante E preenche os campos
  // (pedido do dono, 28/08 — "não ter dois pra subir").
  //
  // Precisa ficar ANTES do early return abaixo. É um hook: chamado só depois
  // que a inclusão chega, o React vê no segundo render uma lista de hooks
  // maior que a do primeiro ("Rendered more hooks than during the previous
  // render") e a tela inteira cai no ErrorBoundary ao abrir a passagem.
  const voucher = useVoucherFill({
    colaborador: inclusion?.collaboratorId ? data.getCollaboratorName(inclusion.collaboratorId) : undefined,
    trecho: form.isReturnOnly ? "so_volta" : form.isOneWay ? "so_ida" : "ida_volta",
    atual: form,
    onPreencher: (campos) => {
      if (inclusion) handlers.onPatch(inclusion.id, campos);
    },
  });

  if (!inclusion) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onRequestClose(); }}>
        <DialogContent aria-describedby={undefined} className={MOLDURA} />
      </Dialog>
    );
  }

  const sid = inclusion.id;
  const ticket = data.getTicket(sid);
  const collaborator = data.getCollaborator(inclusion.collaboratorId);
  const collaboratorName = data.getCollaboratorName(inclusion.collaboratorId);
  const eventLocked = eventLock.isLockedInclusion(inclusion);
  const roMode = isReadOnly(inclusion, user) || eventLocked;
  const canEditTicket = hasPermission(user, "canRegisterTickets");
  const isEditing = editingTicketId === sid;
  const isFormMode = !ticket || isEditing;
  const suggestion = extractTravelSuggestion(inclusion);
  const dis = roMode || !canEditTicket;
  const tabTrigger = "relative shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 sm:px-4 pb-2.5 pt-2.5 text-sm font-medium shadow-none hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const ModoIcone = ticket?.transportType === "van" ? Truck : ticket?.transportType === "rodoviario" ? Bus : Plane;
  const contexto = [data.getFunctionName(inclusion.functionId), data.getEventName(inclusion.eventId)].filter(Boolean);

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

  /**
   * Trecho direto (09/10): encadeia a ida desta vaga à vaga anterior do mesmo
   * colaborador — a origem da ida passa a ser a cidade do evento de lá. Sem
   * vaga (null) volta a sair da cidade de origem ("Sai de").
   */
  const escolherTrechoDireto = (anteriorId: string | null, cidade?: string) => {
    if (!anteriorId) {
      handlers.onPatch(sid, { idaVemDeInclusionId: "", departureCityOrigin: inclusion.city || collaborator?.city || "" });
      return;
    }
    const daLista = sinal?.vizinhasAnteriores?.find((v) => v.inclusionId === anteriorId)?.cidade;
    const doBloqueio = bloqueioDeViagem?.conflito?.inclusionId === anteriorId ? bloqueioDeViagem.conflito.cidade : undefined;
    const origem = cidade || daLista || doBloqueio || "";
    handlers.onPatch(sid, { idaVemDeInclusionId: anteriorId, isReturnOnly: false, ...(origem ? { departureCityOrigin: origem } : {}) });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onRequestClose(); }}>
        <DialogContent aria-describedby={undefined} className={MOLDURA}>
          {/* CABEÇALHO: o que é, de quem, em qual prova — e a situação. */}
          <div className="px-5 sm:px-6 pt-4 pb-3.5 border-b border-border shrink-0 flex items-start gap-3.5 pr-14 bg-card">
            <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-brand-soft text-primary">
              <ModoIcone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              {/* Título e situação na mesma linha: a pílula não disputa espaço com o X. */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0">Registro de passagem</DialogTitle>
                {roMode ? (
                  <span
                    className="inline-flex items-center gap-1.5 h-[22px] px-2 bg-warning-soft text-warning text-2xs font-medium rounded-md"
                    title={eventLocked ? PAST_EVENT_BLOCK_MSG : undefined}
                  ><Lock className="w-3 h-3" aria-hidden="true" />Somente leitura</span>
                ) : ticket && !isEditing ? (
                  <span className="inline-flex items-center gap-1.5 h-[22px] px-2 bg-success-soft text-success text-2xs font-medium rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-strong" aria-hidden="true" />Comprada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 h-[22px] px-2 bg-warning-soft text-warning text-2xs font-medium rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />{isEditing ? "Editando" : "Pendente"}
                  </span>
                )}
                {ticket?.emittedAt && (
                  <span className="inline-flex items-center gap-1 h-[22px] px-2 bg-brand-soft text-primary text-2xs font-medium rounded-md" title="Passagem emitida — o bilhete saiu">
                    <Lock className="w-3 h-3" aria-hidden="true" />Emitida
                  </span>
                )}
              </div>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground leading-5">
                <span className="font-mono font-semibold text-primary">#{inclusion.inclusionNumber || "N/A"}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span className="font-medium text-foreground">{collaboratorName}</span>
                {contexto.map((c, i) => (
                  <span key={i}><span className="mx-1.5" aria-hidden="true">·</span>{c}</span>
                ))}
              </p>
            </div>
          </div>

          {/* Alteração aprovada depois do registro (07/10): o que mudou + "Já atuei". */}
          <AvisoDaVaga tipo="passagem" teamInclusionId={inclusion.id} className="shrink-0 max-h-[34vh] overflow-y-auto" />

          <PastEventBanner show={eventLocked} message={eventLock.bannerMessage(inclusion.eventId)} className="mx-5 sm:mx-6 mt-3 shrink-0" />

          {/* ABAS */}
          <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="px-3 sm:px-4 border-b border-border shrink-0 overflow-x-auto [scrollbar-width:none]">
              <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
                <TabsTrigger value="resumo" className={tabTrigger}>Resumo</TabsTrigger>
                <TabsTrigger value="dados" className={tabTrigger}>
                  Dados da passagem
                  {ticket && !isEditing
                    ? <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-success-soft text-success text-2xs font-bold leading-none" title="Registrada">✓</span>
                    : <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-warning-soft text-warning text-2xs font-bold leading-none" title="A preencher">!</span>}
                </TabsTrigger>
                <TabsTrigger value="complementos" className={tabTrigger}>
                  <span className="sm:hidden">Complementos</span><span className="hidden sm:inline">Complementos e histórico</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <TabsContent value="resumo" className="m-0 p-4 sm:p-6 pas-entra">
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
                {/* Passagens de quem saiu numa troca aprovada + total da vaga (01/10). */}
                <PassagensDeHistorico teamInclusionId={inclusion.id} passagemAtualCentavos={ticket?.value ?? null} />
              </TabsContent>

              <TabsContent value="dados" className="m-0 p-4 sm:p-6 pas-entra">
                {/* Vaga anterior de um trecho direto: sem volta própria (09/10). */}
                <SegueDiretoAviso sinal={sinal} sid={sid} />
                {ticket && !isEditing ? (
                  <>
                    {sinal?.vemDiretoDe?.confirmado && <div className="mb-3"><TrechoDiretoDaVaga sinal={sinal} inclusionId={sid} /></div>}
                    <TicketViewDetails ticket={ticket} inclusion={inclusion} />
                  </>
                ) : (
                  <div className="space-y-4 [&:not(:first-child)]:mt-4">
                    {avisoDosDados}
                    {/* Preços na internet (09/10): só antes de registrar, no aéreo. */}
                    {onBuscarPrecos && !ticket && !dis && form.transportType !== "van" && form.transportType !== "rodoviario" && !avisoDosDados && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface-muted/60 px-4 py-2.5" data-testid={`buscar-precos-modal-${sid}`}>
                        <p className="m-0 min-w-0 flex-1 text-xs leading-relaxed text-slate-600">
                          <span className="font-semibold text-foreground">Ainda vai comprar?</span> Veja os preços de hoje na LATAM, GOL e Azul para esta vaga — antes de gastar, a tela mostra quantas consultas usa.
                        </p>
                        <Button type="button" variant="outline" onClick={onBuscarPrecos} className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold">
                          <Plane className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Buscar preços
                        </Button>
                      </div>
                    )}
                    {bloqueioDeViagem && (
                      <BloqueioDeViagemAviso
                        bloqueio={bloqueioDeViagem}
                        sid={sid}
                        disabled={dis}
                        onEncadear={bloqueioDeViagem.conflito?.podeEncadear ? () => escolherTrechoDireto(bloqueioDeViagem.conflito!.inclusionId) : undefined}
                      />
                    )}
                    {/* Voucher/anexo em primeiro lugar (28/08): é por aqui que a
                        passagem começa — o arquivo é o comprovante e a fonte
                        dos dados ao mesmo tempo. */}
                    <div className="border border-primary/25 bg-card rounded-xl overflow-hidden">
                      <div className="bg-brand-soft/60 border-b border-primary/20 px-4 py-2.5 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                        <span className="text-xs font-semibold text-foreground">
                          Voucher e anexos
                        </span>
                        {voucher.lendo && (
                          <span className="ml-auto inline-flex items-center gap-1.5 text-2xs font-medium text-primary" role="status">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Lendo o voucher…
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-xs leading-relaxed text-slate-600 mb-3">
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
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h3 className={`${SECAO} flex items-center gap-1.5`}><Settings2 className="w-3.5 h-3.5" aria-hidden="true" />Configuração</h3>
                      <div className="flex items-end gap-6 flex-wrap">
                        <div className="flex-1 min-w-[180px]">
                          <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Modalidade<RequiredMark /></Label>
                          <Select value={form.transportType || "aereo"} onValueChange={onTransportChange}>
                            <SelectTrigger data-testid={`select-transport-type-${sid}`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="aereo"><span className="inline-flex items-center gap-2"><Plane className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />Aérea</span></SelectItem>
                              <SelectItem value="rodoviario"><span className="inline-flex items-center gap-2"><Bus className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />Rodoviária</span></SelectItem>
                              <SelectItem value="van"><span className="inline-flex items-center gap-2"><Truck className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />Van</span></SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {form.transportType !== "van" && (
                          <div className="pb-1">
                            <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Trechos deste bilhete</Label>
                            {/* Três recortes (28/08): a volta pode ter sido emitida por OUTRA
                                agência, virando um bilhete só de volta. */}
                            <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5" role="radiogroup" aria-label="Trechos deste bilhete">
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
                                    className={`rounded-md px-3 h-8 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                      ativo ? "bg-card text-primary shadow-1" : "text-muted-foreground hover:text-slate-700"}`}
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
                      {/* Trecho direto (09/10): só quando o bilhete tem a ida. */}
                      {form.transportType !== "van" && !form.isReturnOnly && (
                        <TrechoDiretoCampo
                          sid={sid}
                          sinal={sinal}
                          valor={form.idaVemDeInclusionId || ""}
                          disabled={dis}
                          indicacao={inclusion.idaVemDoEventoId ? `vem direto de ${data.getEventName(inclusion.idaVemDoEventoId)}` : null}
                          vagaIndicadaId={sinal?.vizinhasAnteriores?.find((v) => v.eventId === inclusion.idaVemDoEventoId)?.inclusionId ?? null}
                          onEscolher={(a) => escolherTrechoDireto(a?.inclusionId ?? null, a?.cidade)}
                        />
                      )}
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

                    <div className="bg-card border border-border rounded-xl p-4">
                      <Label htmlFor={`ticketObservations-${sid}`} className="text-xs font-medium text-slate-600 mb-1.5 block">Observações sobre a Passagem</Label>
                      <Textarea
                        id={`ticketObservations-${sid}`}
                        placeholder="Informações adicionais sobre a passagem…"
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

              <TabsContent value="complementos" className="m-0 p-4 sm:p-6 pas-entra">
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
          <div className="px-5 sm:px-6 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0 bg-surface-muted">
            {!isFormMode ? (
              <>
                <Button variant="outline" onClick={onRequestClose} className="h-9 rounded-lg px-4 text-sm font-medium">Fechar</Button>
                {!roMode && canEditTicket && ticket && (
                  <Button onClick={() => onStartEdit(ticket)} className="h-9 flex items-center gap-2 rounded-lg px-4 text-sm font-medium bg-primary hover:bg-primary-hover text-primary-foreground">
                    <Edit className="w-4 h-4" aria-hidden="true" />Editar Passagem
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* Sem "Salvar rascunho": ou registra completo, ou descarta. Em edição, "Cancelar" volta à visualização. */}
                <Button variant="ghost" onClick={isEditing ? onCancelEdit : onRequestClose} className="h-9 text-slate-600 hover:text-foreground rounded-lg px-4 text-sm font-medium">Cancelar</Button>
                {!roMode && canEditTicket && (
                  <Button
                    onClick={onSubmit}
                    disabled={isSubmitting}
                    className="h-9 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg px-4 text-sm font-semibold flex items-center gap-2"
                    data-testid={`button-register-ticket-${sid}`}
                  >
                    {isSubmitting
                      ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{isEditing ? "Atualizando…" : "Registrando…"}</>
                      : <><CheckCircle className="w-4 h-4" aria-hidden="true" /> {isEditing ? "Atualizar passagem" : "Registrar passagem"}</>}
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
