/**
 * Modal "Detalhes da Escalação" — 4 abas (Resumo, Passagem, Hospedagem,
 * Comentários e Histórico), header com navegação ‹ › pela lista atual e
 * footer com Fechar / Salvar / Salvar e próxima / Confirmar.
 *
 * Desde 25/09 este arquivo só monta o modal: o estado vive em
 * `inclusion-details/use-inclusion-dialog-state.ts` e cada parte (cabeçalho,
 * Resumo em cartões, rodapé, anexos) em `inclusion-details/*`. Tinha 1.270 linhas.
 */
import { RotateCcw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { isReadOnly } from "@/lib/interactions";
import { PastEventBanner } from "@/lib/event-lock";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SwapRequestDialog } from "./swap-request-panel";
import { TransferRequestDialog } from "./swap-transferencia";
import { PassagemTab, HospedagemTab, ComentariosTab } from "./inclusion-details-tabs";
import { useInclusionDialogState } from "./inclusion-details/use-inclusion-dialog-state";
import { DetailsHeader } from "./inclusion-details/details-header";
import { DetailsFooter } from "./inclusion-details/details-footer";
import { ResumoTab } from "./inclusion-details/resumo-tab";
import { AttachmentList } from "./inclusion-details/attachments";
import { conflitosUnicos, doneBadge, pendingBadge, tabTrigger, type InclusionDetailsDialogProps } from "./inclusion-details/details-shared";

export type { DetailsTab, InclusionDetailsDialogProps } from "./inclusion-details/details-shared";
export { cenoDiasTrabalhados } from "./inclusion-details/details-shared";

export default function InclusionDetailsDialog(props: InclusionDetailsDialogProps) {
  const { open, onOpenChange, modal, inclusion, modalData, data, details, mutations, user, openAttachment, navIndex, navTotal, onNavigate, onSave, onConfirm } = props;
  const st = useInclusionDialogState(props);
  const {
    activeTab, setActiveTab, showAllLogs, setShowAllLogs, newComment, setNewComment, showSwapModal, setShowSwapModal,
    transferirColaboradorId, setTransferirColaboradorId, setEscolhendoColaborador, showReactivateConfirm, setShowReactivateConfirm,
    setPedirAjusteAberto, contentRef, hasPrev, hasNext, eventLocked, requestLockReason, mostrarPedirAjusteNoRodape, getUserName,
    selectedTicket, accommodation,
  } = st;
  const { collaborators, getEventName, getFunctionName, getCollaboratorName, canConfirmEscalation, getCollaboratorConflicts } = data;
  const { comments, historico } = details;

  const nome = inclusion?.collaboratorId ? getCollaboratorName(inclusion.collaboratorId) : inclusion?.empreitaEmpresa ? `Empreita · ${inclusion.empreitaEmpresa}` : "Vaga sem nome";
  const renderAttachments = (ids: string[] | null | undefined, label: string) => <AttachmentList ids={ids} label={label} openAttachment={openAttachment} />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      {/* 980px no lugar de 1180: em duas colunas o conteúdo respira, e a
          terceira coluna do layout antigo só existia porque a largura sobrava. */}
      <DialogContent ref={contentRef} className="!max-w-[1120px] w-[95vw] max-h-[calc(100dvh-48px)] !rounded-xl !flex !flex-col p-0 gap-0 overflow-hidden">
        <DetailsHeader inclusion={inclusion} nome={nome} navIndex={navIndex} navTotal={navTotal} hasPrev={hasPrev} hasNext={hasNext} onNavigate={onNavigate} />

        {inclusion && (
          <>
            {eventLocked && <PastEventBanner show className="mx-6 mt-3" />}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="px-6 border-b border-border shrink-0">
                <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
                  <TabsTrigger value="resumo" className={tabTrigger}>Resumo</TabsTrigger>
                  <TabsTrigger value="passagem" className={tabTrigger}>
                    Passagem
                    {selectedTicket ? doneBadge : inclusion.needsTicket ? pendingBadge : null}
                  </TabsTrigger>
                  <TabsTrigger value="hospedagem" className={tabTrigger}>
                    Hospedagem
                    {accommodation ? doneBadge : inclusion.needsAccommodation ? pendingBadge : null}
                  </TabsTrigger>
                  <TabsTrigger value="comentarios" className={tabTrigger}>
                    Histórico
                    {comments && comments.length > 0 && (
                      <span className="ml-1.5 bg-primary text-primary-foreground text-2xs font-semibold px-1.5 py-0.5 rounded-full">{comments.length}</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                <ResumoTab inclusion={inclusion} props={props} st={st} />
                <PassagemTab inclusion={inclusion} ticket={selectedTicket} renderAttachments={renderAttachments} />
                <HospedagemTab inclusion={inclusion} accommodation={accommodation} renderAttachments={renderAttachments} />
                <ComentariosTab
                  comments={comments}
                  historico={historico}
                  getUserName={getUserName}
                  newComment={newComment}
                  setNewComment={setNewComment}
                  showAllLogs={showAllLogs}
                  setShowAllLogs={setShowAllLogs}
                  addComment={mutations.addComment}
                  canComment={!isReadOnly(inclusion, user) && canConfirmEscalation(inclusion)}
                  canSend={!isReadOnly(inclusion, user)}
                  carregando={details.isLoadingHistorico}
                />
              </div>
            </Tabs>

            <DetailsFooter
              inclusion={inclusion} modalData={modalData} data={data} mutations={mutations} user={user}
              eventLocked={eventLocked} requestLockReason={requestLockReason} mostrarPedirAjuste={mostrarPedirAjusteNoRodape}
              onPedirAjuste={() => setPedirAjusteAberto(true)} onReativar={() => setShowReactivateConfirm(true)}
              onClose={() => onOpenChange(false)} onSave={onSave} onConfirm={onConfirm}
            />

            {/* Sub-dialogs */}
            <SwapRequestDialog
              open={showSwapModal}
              onOpenChange={setShowSwapModal}
              inclusion={inclusion}
              collaborators={collaborators}
              getCollaboratorName={getCollaboratorName}
              getEventName={getEventName}
              getFunctionName={getFunctionName}
              getCollaboratorConflicts={getCollaboratorConflicts}
              createSwapRequest={mutations.createSwapRequest}
              inclusions={data.teamInclusions}
            />
            {/* Transferência para esta vaga aberta (14/09) */}
            <TransferRequestDialog
              open={!!transferirColaboradorId}
              onOpenChange={(o) => { if (!o) setTransferirColaboradorId(null); }}
              inclusion={inclusion}
              collaboratorId={transferirColaboradorId}
              origens={transferirColaboradorId ? conflitosUnicos(data, transferirColaboradorId, inclusion) : []}
              collaborators={collaborators}
              getCollaboratorName={getCollaboratorName}
              getEventName={getEventName}
              getFunctionName={getFunctionName}
              createSwapRequest={mutations.createSwapRequest}
              onEnviado={() => setEscolhendoColaborador(false)}
            />
            <ConfirmDialog
              open={showReactivateConfirm}
              onOpenChange={setShowReactivateConfirm}
              icon={RotateCcw}
              tone="default"
              title="Reativar escalação?"
              description={<>A escalação voltará ao status <span className="font-semibold text-slate-700">Pendente</span> e ficará disponível novamente para edição e confirmação.</>}
              confirmLabel="Sim, reativar"
              pending={mutations.reactivate.isPending}
              onConfirm={() => mutations.reactivate.mutate(inclusion.id, { onSuccess: () => setShowReactivateConfirm(false) })}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
