/**
 * Aba "Complementos e histórico" do modal de Hospedagem (25/09 — extraída de
 * accommodation-modal.tsx): comentários e a linha do tempo da inclusão.
 *
 * 07/10 (redesenho): é a MESMA aba de Passagens (`TicketExtrasTab`) — duas
 * colunas com o desenho de seção do modal, carregando e vazio próprios, a
 * linha do tempo sem um cartão com sombra em cada evento, e os rótulos das
 * ações vindos do mapa único (`rotuloDaAcao`, shared/inclusion-timeline) em vez
 * do mapa local de oito ações. Comentários (ver/adicionar), histórico, "Ver
 * todos" — tudo continua.
 */
import { TabsContent } from "@/components/ui/tabs";
import type { Comment, TeamInclusionLog } from "@shared/schema";
import TicketExtrasTab from "@/components/tickets/ticket-extras-tab";

export function AccommodationComplementosTab({ comments, commentsLoading, logs, logsLoading, userName, roMode, onShowComments }: {
  comments: Comment[] | undefined;
  commentsLoading: boolean;
  logs: TeamInclusionLog[] | undefined;
  logsLoading: boolean;
  userName: (id: string | null | undefined) => string;
  roMode: boolean;
  onShowComments: () => void;
}) {
  return (
    <TabsContent value="complementos" className="m-0 p-4 sm:p-6 pas-entra">
      <TicketExtrasTab
        comments={comments}
        commentsLoading={commentsLoading}
        logs={logs}
        logsLoading={logsLoading}
        getUserName={userName}
        readOnly={roMode}
        onOpenComments={onShowComments}
      />
    </TabsContent>
  );
}
