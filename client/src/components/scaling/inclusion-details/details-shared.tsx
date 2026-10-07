/**
 * Modal "Detalhes da escalação" — tipos, estilos e utilitários compartilhados
 * pelas partes do modal (25/09, extraídos de inclusion-details-dialog.tsx).
 */
import { useSyncExternalStore, type ReactNode } from "react";
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

export const tabTrigger = "group/aba relative h-11 shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground bg-transparent data-[state=active]:bg-transparent px-3 sm:px-3.5 text-sm font-medium shadow-none hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
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
 * Seção do modal (07/10) — UMA moldura para todo bloco do Resumo: cartão
 * branco sobre o fundo do modal, cabeçalho de 40px com título em caixa normal
 * e, à direita, o que qualifica a seção (tipo, contagem, "definir o tipo").
 * Antes cada bloco tinha a sua: cinza, azul, vermelho, títulos em caixa alta
 * com tracking de 0.12em em `font-black` — o olho não sabia onde começar.
 */
export function Secao({ titulo, icone, acessorio, tom = "neutro", children, className = "", corpo = "p-4", testId }: {
  titulo: ReactNode;
  icone?: ReactNode;
  acessorio?: ReactNode;
  /** `atencao`: falta algo (âmbar). `decisao`: espera a decisão de quem olha. */
  tom?: "neutro" | "atencao" | "decisao";
  children: ReactNode;
  className?: string;
  corpo?: string;
  testId?: string;
}) {
  const borda = tom === "atencao" ? "border-warning/35" : tom === "decisao" ? "border-primary/30" : "border-border";
  const cabeca = tom === "atencao" ? "bg-warning-soft/60 border-warning/25" : tom === "decisao" ? "bg-brand-soft border-primary/20" : "border-border";
  return (
    <section className={`rounded-xl border bg-card shadow-[0_1px_2px_hsl(222_47%_11%/0.04)] ${borda} ${className}`} data-testid={testId}>
      <header className={`flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 rounded-t-xl border-b px-4 py-2 ${cabeca}`}>
        {icone && <span className="flex shrink-0 items-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icone}</span>}
        <h3 className="text-[13px] font-semibold leading-5 text-foreground">{titulo}</h3>
        {acessorio && <div className="ml-auto flex items-center gap-2">{acessorio}</div>}
      </header>
      <div className={corpo}>{children}</div>
    </section>
  );
}

/** Uma linha "rótulo · valor" do painel de propriedades da vaga. */
export function Propriedade({ rotulo, children, testId }: { rotulo: string; children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-3 px-4 py-2.5 sm:grid-cols-[104px_minmax(0,1fr)]" data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

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

/**
 * A tela é larga o bastante para o Resumo em duas colunas (lg, 1024px)? Decide
 * em qual coluna o pedido de ajuste entra — numa coluna só, ele vem depois da
 * vaga, não entre o colaborador e a vaga.
 */
export function useTelaLarga(): boolean {
  return useSyncExternalStore(
    (aviso) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", aviso);
      return () => mq.removeEventListener("change", aviso);
    },
    () => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia("(min-width: 1024px)").matches : true),
    () => true,
  );
}
