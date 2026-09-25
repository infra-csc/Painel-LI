/**
 * Aba Resumo do modal da vaga (25/09 — extraída do dialog): os três cartões
 * (informações, colaborador, período), o pedido de ajuste, o tipo de freela da
 * cenotécnica, observações, aprovação da produção e os anexos.
 */
import { MessageSquare } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { TabsContent } from "@/components/ui/tabs";
import { isReadOnly } from "@/lib/interactions";
import { AdjustRequestPanel } from "../adjust-request-panel";
import { ProductionApprovalCard } from "../production-approval-card";
import { ResumoInfoCard } from "./resumo-info-card";
import { ResumoColaboradorCard } from "./resumo-colaborador-card";
import { ResumoPeriodoCard } from "./resumo-periodo-card";
import { CenoFreelaTipoCard } from "./ceno-freela-tipo-card";
import { AttachmentsSummary } from "./attachments";
import type { InclusionDetailsDialogProps } from "./details-shared";
import type { InclusionDialogState } from "./use-inclusion-dialog-state";

export function ResumoTab({ inclusion, props, st }: { inclusion: TeamInclusion; props: InclusionDetailsDialogProps; st: InclusionDialogState }) {
  const { modalData, data, details, mutations, user, openAttachment } = props;
  const { events, getFunctionName, canConfirmEscalation, canApproveProduction, collaborators } = data;
  const { eventLocked, actionLockReason, isCenoEmpreitaInclusion, systemSettings, pedirAjusteAberto, setPedirAjusteAberto, selectedTicket, accommodation, setActiveTab } = st;
  return (
    <TabsContent value="resumo" className="m-0 p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <ResumoInfoCard inclusion={inclusion} data={data} details={details} mutations={mutations} st={st} />
        <ResumoColaboradorCard inclusion={inclusion} props={props} st={st} />
        <ResumoPeriodoCard inclusion={inclusion} />
      </div>

      {/* Pedido de ajuste da vaga já escalada (regra do dono, 26/08):
          dias, diárias e viagem ainda podem mudar por pedido ao
          aprovador enquanto a passagem não for comprada. Quem decide
          se aparece é o servidor (papel + janela). */}
      <AdjustRequestPanel
        inclusion={inclusion}
        event={events?.find(e => e.id === inclusion.eventId)}
        functionName={getFunctionName(inclusion.functionId)}
        aberto={pedirAjusteAberto}
        onAberto={setPedirAjusteAberto}
      />

      {/* Tipo de freela da cenotécnica (empreita) — definido AQUI, na
          Escalação, por pedido do usuário (19/08). Aparece também
          depois de confirmada (só leitura quando sem permissão). */}
      {/* Com empreita por empresa o valor é o da empreita — o tipo de freela não se aplica. */}
      {isCenoEmpreitaInclusion && !modalData.empreitaModo && !inclusion.empreitaEmpresa && (
        <CenoFreelaTipoCard
          inclusion={inclusion}
          systemSettings={systemSettings}
          canEdit={!eventLocked && !isReadOnly(inclusion, user) && canConfirmEscalation(inclusion)}
          disabledReason={actionLockReason}
          isCasa={collaborators?.find(c => c.id === (modalData.collaboratorId || inclusion.collaboratorId))?.type === "casa"}
          mutation={mutations.setCenoFreelaTipo}
        />
      )}

      {inclusion.observations && (
        <div className="mt-5">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-surface-muted border-b border-border px-4 py-2.5 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-2xs font-black text-muted-foreground uppercase tracking-[0.12em]">Observações</span>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{inclusion.observations}</p>
            </div>
          </div>
        </div>
      )}

      <ProductionApprovalCard inclusion={inclusion} canApprove={canApproveProduction} mutations={mutations} blockReason={actionLockReason} />

      {/* Anexos no Resumo */}
      <AttachmentsSummary
        ticketIds={selectedTicket?.attachmentIds}
        accommodationIds={accommodation?.attachmentIds}
        openAttachment={openAttachment}
        onVerTodos={() => setActiveTab("passagem")}
      />
    </TabsContent>
  );
}
