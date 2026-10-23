/**
 * O modal da vaga da Escalação dentro da Aprovação de escala (23/10).
 *
 * Monta o MESMO `InclusionDetailsDialog` da Escalação (Resumo, Passagem,
 * Hospedagem, Honorário, Histórico, ‹ › e "N / total") com o estado de
 * `useVagaNaAprovacao`, mais os diálogos que a Escalação monta ao lado dele
 * (descartar alterações, enviado ao gestor, anexo em tela cheia).
 *
 * `acoes` desenha, no rodapé, o que a ABA da Aprovação permite decidir sobre a
 * vaga aberta — em "Vagas aguardando aprovação", os mesmos Devolver / Reprovar
 * / Aprovar da linha, que abrem os mesmos diálogos.
 */
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Undo2, XCircle } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import InclusionDetailsDialog from "@/components/scaling/inclusion-details-dialog";
import { SentToProductionDialog } from "@/components/scaling/production-approval-card";
import AttachmentLightbox from "@/components/scaling/attachment-lightbox";
import type { VagaNaAprovacao } from "./use-vaga-na-aprovacao";

export function ModalDaVagaNaAprovacao({ vm, acoes }: {
  vm: VagaNaAprovacao;
  /** Ações da aba sobre a vaga aberta (rodapé, à direita do Fechar). */
  acoes?: (vaga: TeamInclusion) => ReactNode;
}) {
  // Nada montado até a primeira abertura: nem o modal, nem as consultas dele.
  if (!vm.montado) return null;
  const { modal } = vm;
  return (
    <>
      <InclusionDetailsDialog
        open={modal.showModal}
        onOpenChange={modal.setShowModal}
        modal
        inclusion={modal.selectedInclusion}
        initialTab={modal.modalInitialTab}
        abrirEscolhaDeColaborador={modal.abrirEscolhaDeColaborador}
        modalData={modal.modalData}
        setModalData={modal.setModalData}
        data={vm.data}
        details={modal.details}
        mutations={modal.mutations}
        user={vm.user}
        openAttachment={modal.openAttachment}
        navIndex={vm.navIndex}
        navTotal={vm.lista.length}
        onNavigate={vm.navegar}
        onSave={modal.handleSave}
        onConfirm={modal.handleConfirm}
        acoesDaVaga={vm.aberta && acoes ? acoes(vm.aberta) : undefined}
      />
      <SentToProductionDialog info={modal.sentToProductionInfo} onClose={() => modal.setSentToProductionInfo(null)} />
      <AttachmentLightbox item={modal.lightbox} onClose={() => modal.setLightbox(null)} />
      <ConfirmDialog
        open={vm.descartePendente !== null}
        onOpenChange={(o) => { if (!o) vm.setDescartePendente(null); }}
        icon={(props) => <AlertTriangle {...props} aria-hidden="true" />}
        tone="danger"
        title="Descartar alterações?"
        description="Você mudou esta escalação e ainda não salvou. Ir para a próxima descarta o que foi digitado."
        cancelLabel="Continuar editando"
        confirmLabel="Descartar e sair"
        pending={false}
        onConfirm={vm.confirmarDescarte}
        testId="dialog-descartar-alteracoes"
      />
    </>
  );
}

/**
 * Devolver / Reprovar / Aprovar no rodapé do modal — os da linha, no mesmo
 * peso: Aprovar é o único cheio (verde), os outros em contorno. No celular
 * Aprovar ocupa a linha de baixo, como o "Confirmar escalação".
 */
export function DecisaoDaVagaNoModal({ numero, busy, onDevolver, onReprovar, onAprovar }: {
  numero: number | null | undefined;
  busy?: boolean;
  onDevolver: () => void;
  onReprovar: () => void;
  onAprovar: () => void;
}) {
  const n = numero ?? "—";
  return (
    <div role="group" aria-label={`Decidir a vaga #${n}`} className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto" data-testid="decisao-no-modal">
      <span aria-hidden="true" className="mr-1 hidden h-6 w-px bg-border sm:block" />
      <Button type="button" variant="outline" disabled={busy} onClick={onDevolver}
        className="h-9 flex-1 gap-1.5 rounded-lg border-border bg-card px-3.5 text-sm font-medium text-slate-700 hover:border-warning/50 hover:bg-warning-soft hover:text-warning sm:flex-none">
        <Undo2 className="h-4 w-4" aria-hidden="true" /> Devolver
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onReprovar}
        className="h-9 flex-1 gap-1.5 rounded-lg border-danger/30 bg-card px-3.5 text-sm font-medium text-danger hover:bg-danger-soft hover:text-danger sm:flex-none">
        <XCircle className="h-4 w-4" aria-hidden="true" /> Reprovar
      </Button>
      <Button type="button" disabled={busy} onClick={onAprovar}
        className="h-10 basis-full gap-1.5 rounded-lg bg-success px-5 text-sm font-semibold text-white shadow-1 hover:bg-success/90 sm:h-9 sm:basis-auto"
        data-testid="button-aprovar-no-modal">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Aprovar
      </Button>
    </div>
  );
}

/** Vaga aguardando outro aprovador: o rodapé diz quem decide (sem botão que vá falhar). */
export function QuemDecideNoModal({ texto }: { texto: string }) {
  return <span className="mr-auto order-first max-w-[320px] text-2xs leading-4 text-muted-foreground" data-testid="quem-decide-no-modal">{texto}</span>;
}
