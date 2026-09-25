/**
 * Modal "Detalhes da Escalação" — tipos, estilos e utilitários compartilhados
 * pelas partes do modal (25/09, extraídos de inclusion-details-dialog.tsx).
 */
import type { TeamInclusion } from "@shared/schema";
import { diasEmpreita } from "@shared/calculation-rules";
import { formatarMoeda } from "@/lib/format";
import type { ModalData } from "../scaling-utils";
import type { ScalingData, InclusionDetails, ScalingUser } from "../use-scaling-data";
import type { ScalingMutations } from "../use-scaling-mutations";

export type DetailsTab = "resumo" | "passagem" | "hospedagem" | "comentarios";

export interface InclusionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog não-modal enquanto o modal de sucesso está aberto por cima */
  modal: boolean;
  inclusion: TeamInclusion | null;
  initialTab: DetailsTab;
  /**
   * Veio do botão "Escalar alguém" da linha: a lista de colaboradores já abre
   * escolhida, sem exigir que a pessoa procure o campo dentro do modal.
   */
  abrirEscolhaDeColaborador?: boolean;
  modalData: ModalData;
  setModalData: React.Dispatch<React.SetStateAction<ModalData>>;
  data: ScalingData;
  details: InclusionDetails;
  mutations: ScalingMutations;
  user: ScalingUser;
  openAttachment: (attachmentId: string, fallbackLabel: string) => void;
  /** Navegação pela lista filtrada atual */
  navIndex: number;
  navTotal: number;
  onNavigate: (direction: -1 | 1) => void;
  onSave: (thenNext: boolean) => void;
  onConfirm: () => void;
}

// Decisão do usuário (17/08): o Tipo 1 × Tipo 2 do percurseiro é definido no
// PLANEJADO. Mude para true se a Escalação voltar a pedir o tipo.
export const SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO = false;

export const COLLAB_TYPE: Record<string, { label: string; cls: string }> = {
  casa:   { label: "Casa",   cls: "bg-brand-soft text-primary border-primary/25" },
  freela: { label: "Freela", cls: "bg-brand-soft text-primary border-primary/25" },
  local:  { label: "Local",  cls: "bg-warning-soft text-warning border-warning/25" },
};

export const tabTrigger = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";
// Rótulo de campo: 11px normal. Era 10px `font-black` com tracking de 0.12em —
// caixa alta esticada e mais pesada que o próprio valor que rotulava.
export const lbl = "text-2xs text-muted-foreground font-medium mb-1";
export const val = "text-sm font-semibold text-slate-700";
// A aba só sinaliza o que FALTA. Um "✓" verde em cada etapa pronta enche a
// barra de ruído para dizer que não há nada a fazer ali.
export const doneBadge = null;
export const pendingBadge = (
  <span
    aria-label="etapa pendente"
    title="Esta etapa ainda está pendente"
    className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-warning-strong align-middle"
  />
);

export const brl = formatarMoeda;

/**
 * Dias trabalhados da vaga para a tabela de empreita.
 *
 * A contagem mora em shared/calculation-rules (`diasEmpreita`) — MESMA função
 * usada pelo Planejado. Antes cada tela tinha a sua (aqui `workDays.length ||
 * dailyRates`, lá o intervalo completo), então uma vaga com dias específicos
 * dentro de uma janela maior anunciava um valor aqui e pagava outro no
 * Planejado. Este alias existe só para não espalhar o import pelo arquivo.
 */
export const cenoDiasTrabalhados = (inclusion: TeamInclusion): number => diasEmpreita(inclusion);

export const isTypingTarget = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node || !(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable || node.getAttribute("role") === "combobox";
};

/** Conflitos de agenda de uma pessoa nesta vaga, sem repetição (mesmo evento + sobreposição de datas). */
export function conflitosUnicos(data: ScalingData, collaboratorId: string, inclusion: TeamInclusion): TeamInclusion[] {
  const { sameEvent, dateOverlap } = data.getCollaboratorConflicts(collaboratorId, inclusion);
  return [...sameEvent, ...dateOverlap].filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
}
