/**
 * Confirmar direto da linha (04/09) — pedido do dono na fila "Prontas".
 * Mesmo payload do lote: manda o que a linha já tem gravado e o servidor
 * decide status/fase (cenotécnica → gestor). Sem diálogo de confirmação:
 * o botão só aparece em vaga com nome, não confirmada e sem bloqueio.
 * (25/09 — extraído de pages/scaling.tsx)
 */
import { useState } from "react";
import type { TeamInclusion } from "@shared/schema";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { queryClient } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { avisarAgenda } from "@/hooks/use-vaga-acoes";
import type { useToast } from "@/hooks/use-toast";
import type { SentToProductionInfo } from "../production-approval-card";
import { confirmInclusionRequest } from "../use-scaling-mutations";
import { isEscalated, isCityFromSP } from "../scaling-utils";
import type { QueueContext } from "../scaling-queue";

type Toast = ReturnType<typeof useToast>["toast"];

export function useConfirmarRapido({ queueContext, getCollaboratorName, getFunctionName, toast, setSentToProductionInfo }: {
  queueContext: QueueContext;
  getCollaboratorName: (collaboratorId?: string | null) => string;
  getFunctionName: (functionId: string | null) => string;
  toast: Toast;
  setSentToProductionInfo: (info: SentToProductionInfo | null) => void;
}) {
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const podeConfirmarRapido = (i: TeamInclusion) =>
    (!!i.collaboratorId || vagaComEmpreita(i)) && !isEscalated(i) && i.status !== "cancelado" && !queueContext.bloqueioParaConfirmar(i);

  const confirmarRapido = async (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation();
    if (confirmandoId) return;
    setConfirmandoId(inclusion.id);
    const nome = getCollaboratorName(inclusion.collaboratorId);
    try {
      const updated = await confirmInclusionRequest(inclusion.id, {
        collaboratorId: inclusion.collaboratorId || "",
        observations: inclusion.observations || "",
        city: isCityFromSP(inclusion.city) ? "São Paulo - SP" : (inclusion.city || ""),
        atendimentoTipo: inclusion.atendimentoTipo || null,
        percurseiroTipo: inclusion.percurseiroTipo || null,
        needsTicket: inclusion.needsTicket,
        needsAccommodation: inclusion.needsAccommodation,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      if (updated.status === "aguardando_producao") {
        setSentToProductionInfo({ collaboratorName: nome, functionName: getFunctionName(inclusion.functionId), inclusionNumber: inclusion.inclusionNumber ?? null });
      } else {
        toast({ title: "Escalação confirmada", description: `#${inclusion.inclusionNumber ?? "—"} · ${nome}` });
      }
      // Duas viagens no mesmo dia: aviso, não erro — a confirmação valeu.
      avisarAgenda(toast, updated.avisosDeAgenda);
    } catch (err: unknown) {
      // 409 (já confirmada, conflito de agenda) vem com a explicação do servidor.
      toast({ title: "Não foi possível confirmar", description: apiErrorMessage(err, "Erro desconhecido"), variant: "destructive" });
    } finally {
      setConfirmandoId(null);
    }
  };

  return { confirmandoId, podeConfirmarRapido, confirmarRapido };
}
