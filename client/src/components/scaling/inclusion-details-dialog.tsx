/**
 * Modal "Detalhes da escalação" — 4 abas (Resumo, Passagem, Hospedagem,
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
  const { collaborators, getEventName, getFunctionName, getCollaboratorName, getCollaboratorConflicts } = data;
  const { comments, historico } = details;

  const nome = inclusion?.collaboratorId ? getCollaboratorName(inclusion.collaboratorId) : inclusion?.empreitaEmpresa ? `Empreita · ${inclusion.empreitaEmpresa}` : "Vaga sem nome";
  const renderAttachments = (ids: string[] | null | undefined, label: string) => <AttachmentList ids={ids} label={label} openAttachment={openAttachment} />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      {/* 980px no lugar de 1180: em duas colunas o conteúdo respira, e a
          terceira coluna do layout antigo só existia porque a largura sobrava. */}
      {/* Foco inicial (07/10): no próprio modal, não no primeiro botão — o
          "‹" ganhava foco e abria o tooltip "Anterior (←)" por cima do título.
          Quando a lista de nomes já abre (vaga sem nome), a busca dela fica
          com o foco, como antes. */}
      <DialogContent
        aria-describedby={undefined}
        ref={contentRef}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const el = contentRef.current;
          if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
        }}
        className="!max-w-[1120px] w-[calc(100vw-1rem)] sm:w-[95vw] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-48px)] lg:h-[min(760px,calc(100dvh-48px))] !rounded-xl !flex !flex-col p-0 gap-0 overflow-hidden focus:outline-none"
      >
        <DetailsHeader
          inclusion={inclusion} nome={nome}
          contexto={inclusion ? `${getFunctionName(inclusion.functionId)} · ${getEventName(inclusion.eventId)}` : undefined}
          navIndex={navIndex} navTotal={navTotal} hasPrev={hasPrev} hasNext={hasNext} onNavigate={onNavigate}
        />

        {inclusion && (
          <>
            {eventLocked && <PastEventBanner show className="mx-4 mt-3 sm:mx-6" />}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="esc-rolagem-x px-2 sm:px-4 border-b border-border bg-card shrink-0">
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
                      <span className="ml-1.5 min-w-[18px] rounded-full bg-muted px-1.5 py-px text-center text-2xs font-semibold tabular-nums text-slate-600 group-data-[state=active]/aba:bg-brand-soft group-data-[state=active]/aba:text-primary" aria-label={`${comments.length} ${comments.length === 1 ? "comentário" : "comentários"}`}>{comments.length}</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Altura FIXA no desktop (07/10): trocar de aba não faz o modal pular
                  de tamanho e de lugar; o que for maior rola aqui dentro. */}
              <div className="flex-1 overflow-y-auto min-h-0 bg-background">
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
                  // Regra do dono (07/10): comentário "para todos que têm acesso,
                  // independente da escalação" — comentar não é editar a vaga,
                  // então não depende de passagem comprada, cancelamento nem de
                  // responder pela função. O servidor sempre aceitou.
                  canComment
                  canSend
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
              onPedirTransferencia={(id) => setTransferirColaboradorId(id)}
            />
            {/* Transferência para esta vaga (14/09 aberta; 05/10 também com alguém, que sai) */}
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
