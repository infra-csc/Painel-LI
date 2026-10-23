/**
 * Aba Resumo do modal da vaga (25/09 — extraída do dialog): colaborador, a
 * vaga (informações + período + observações), o pedido de ajuste, o tipo de
 * freela da cenotécnica, a aprovação do gestor e os anexos.
 *
 * 07/10 — duas colunas com papéis fixos:
 *  - à esquerda, QUEM VAI (o trabalho da tela: escolher, trocar, transferir)
 *    e o tipo de freela, que é sobre como essa pessoa é paga;
 *  - à direita, A VAGA (o que, onde, quando), o pedido de ajuste e os anexos.
 * A aprovação do gestor, quando existe, vem ANTES de tudo: era o último
 * cartão do Resumo e ficava abaixo da dobra justamente para quem precisava
 * decidir. Antes, três cartões soltos deixavam um buraco de 300px embaixo do
 * colaborador.
 */
import type { TeamInclusion } from "@shared/schema";
import { TabsContent } from "@/components/ui/tabs";
import { isReadOnly } from "@/lib/interactions";
import { isEscalationConfirmed } from "../scaling-utils";
import { AdjustRequestPanel } from "../adjust-request-panel";
import { TrechoDiretoPedido } from "../trecho-direto-pedido";
import { ProductionApprovalCard } from "../production-approval-card";
import { ResumoInfoCard } from "./resumo-info-card";
import { ResumoColaboradorCard } from "./resumo-colaborador-card";
import { CenoFreelaTipoCard } from "./ceno-freela-tipo-card";
import { AttachmentsSummary } from "./attachments";
import { useTelaLarga, type InclusionDetailsDialogProps } from "./details-shared";
import type { InclusionDialogState } from "./use-inclusion-dialog-state";

export function ResumoTab({ inclusion, props, st }: { inclusion: TeamInclusion; props: InclusionDetailsDialogProps; st: InclusionDialogState }) {
  const { modalData, data, details, mutations, user, openAttachment } = props;
  const { events, getFunctionName, canConfirmEscalation, canApproveProduction, collaborators } = data;
  const { eventLocked, actionLockReason, isCenoEmpreitaInclusion, systemSettings, pedirAjusteAberto, setPedirAjusteAberto, selectedTicket, accommodation, setActiveTab } = st;
  // O pedido de ajuste vai para a coluna mais curta (07/10): com o colaborador
  // só para leitura, a esquerda sobrava vazia embaixo; com a lista de nomes
  // aberta, é a direita que sobra.
  const telaLarga = useTelaLarga();
  const ajusteNaEsquerda = telaLarga && (!data.canEditCollaborator(inclusion) || isEscalationConfirmed(inclusion));
  // Pedido de ajuste da vaga já escalada (regra do dono, 26/08): dias,
  // diárias e viagem ainda podem mudar por pedido ao aprovador enquanto a
  // passagem não for comprada. Quem decide se aparece é o servidor.
  const ajuste = (
    <>
      <AdjustRequestPanel
        inclusion={inclusion}
        event={events?.find(e => e.id === inclusion.eventId)}
        functionName={getFunctionName(inclusion.functionId)}
        aberto={pedirAjusteAberto}
        onAberto={setPedirAjusteAberto}
      />
      {/* Vai direto de/para outro evento (09/10): pedido de ajuste em par. */}
      <TrechoDiretoPedido inclusion={inclusion} data={data} />
    </>
  );
  return (
    <TabsContent value="resumo" className="esc-entra m-0 p-3 sm:p-5">
      <div className="space-y-4">
        <ProductionApprovalCard inclusion={inclusion} canApprove={canApproveProduction} mutations={mutations} blockReason={actionLockReason} trocaPendente={props.details.pendingSwap} />

        {/* Cada coluna empilha os cartões pela altura do próprio conteúdo (dono,
            07/10): nada estica para alinhar com a vizinha. */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <div className="min-w-0 flex flex-col gap-4">
            <ResumoColaboradorCard inclusion={inclusion} props={props} st={st} />
            {ajusteNaEsquerda && ajuste}

            {/* Tipo de freela da cenotécnica (empreita) — definido AQUI, na
                Escalação, por pedido do usuário (19/08). Aparece também
                depois de confirmada (só leitura quando sem permissão). Com
                empreita por empresa o valor é o da empreita — o tipo de
                freela não se aplica. */}
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
          </div>

          <div className="min-w-0 flex flex-col gap-4">
            <ResumoInfoCard inclusion={inclusion} data={data} details={details} mutations={mutations} st={st} />

            {!ajusteNaEsquerda && ajuste}
            <AttachmentsSummary
              ticketIds={selectedTicket?.attachmentIds}
              accommodationIds={accommodation?.attachmentIds}
              openAttachment={openAttachment}
              onVerTodos={() => setActiveTab("passagem")}
            />
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
