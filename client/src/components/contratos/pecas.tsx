/**
 * Peças visuais dos contratos (26/10): a pílula da situação, o tipo, a
 * vigência em texto curto e o SELO "contrato ativo" na pessoa.
 *
 * O selo é o sinal da Fase 0 — CNPJ sem contrato ativo vira pendência que
 * trava a OC (Fase 2), mas hoje NADA trava: só mostra. Ele aparece só para o
 * DP (admin + financial), que é quem recebe a situação do servidor.
 */
import { AlertTriangle, BadgeCheck, CircleSlash, Clock3, FileWarning, History, Hourglass } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge, type Tone } from "@/components/common/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { fetchJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { isFinanceRole } from "@shared/roles";
import {
  SITUACAO_CONTRATUAL_LABEL, SITUACAO_DO_CONTRATO_LABEL, TIPO_DE_CONTRATO_LABEL,
  type SituacaoContratualDoColaborador, type SituacaoDoContrato, type TipoDeContrato,
} from "@shared/contratos";
import { CHAVE, type RespostaDaSituacao, type SituacaoDoColaboradorApi } from "./api";

export const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** "01/01/2026 → 31/12/2026", "desde 01/01/2026 (sem fim)", "até 31/12/2026", "Sem vigência". */
export function vigenciaTexto(inicio: string | null, fim: string | null): string {
  if (inicio && fim) return `${dataBr(inicio)} → ${dataBr(fim)}`;
  if (inicio) return `desde ${dataBr(inicio)} · sem fim`;
  if (fim) return `até ${dataBr(fim)}`;
  return "Sem vigência";
}

const TOM_DA_SITUACAO: Record<SituacaoDoContrato, Tone> = {
  ativo: "success",
  vence_em_breve: "warning",
  vencido: "danger",
  futuro: "info",
  sem_vigencia: "neutral",
  encerrado: "neutral",
};

const ICONE_DA_SITUACAO: Record<SituacaoDoContrato, typeof BadgeCheck> = {
  ativo: BadgeCheck,
  vence_em_breve: Hourglass,
  vencido: AlertTriangle,
  futuro: Clock3,
  sem_vigencia: FileWarning,
  encerrado: CircleSlash,
};

export function SituacaoDoContratoBadge({ situacao, dias, className }: { situacao: SituacaoDoContrato; dias?: number | null; className?: string }) {
  const rotulo = situacao === "vence_em_breve" && dias != null
    ? dias === 0 ? "Vence hoje" : `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`
    : SITUACAO_DO_CONTRATO_LABEL[situacao];
  return (
    <StatusBadge tone={TOM_DA_SITUACAO[situacao]} icon={ICONE_DA_SITUACAO[situacao]} className={cn("whitespace-nowrap", className)} data-testid={`situacao-${situacao}`}>
      {rotulo}
    </StatusBadge>
  );
}

export const tipoLabel = (t: string) => TIPO_DE_CONTRATO_LABEL[t as TipoDeContrato] ?? t;

export function TipoDoContrato({ tipo }: { tipo: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded-md border border-border bg-surface-muted px-1.5 text-2xs font-medium text-slate-700">
      {tipoLabel(tipo)}
    </span>
  );
}

/**
 * 28/10 — selo do contrato criado (ou aberto) pelo sistema porque o CNPJ já
 * passou por OC, nota aprovada ou pagamento. A dica traz a frase da aprovação.
 */
export function SeloAprovadoAutomaticamente({ detalhe, compacto = false, className }: { detalhe: string | null; compacto?: boolean; className?: string }) {
  const dica = detalhe ?? "Aprovado automaticamente: o CNPJ já passou por um pagamento de honorário.";
  const selo = (
    <span
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-brand-soft px-1.5 text-2xs font-semibold whitespace-nowrap text-primary", className)}
      data-testid="selo-aprovado-automaticamente"
      aria-label={dica}
    >
      <History className="h-3 w-3" aria-hidden="true" />
      {compacto ? "Automático" : "Aprovado automaticamente"}
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{selo}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] text-xs leading-relaxed">{dica}</TooltipContent>
    </Tooltip>
  );
}

// ── Selo "contrato ativo" na pessoa ────────────────────────────────────────

const TOM_DO_SELO: Record<SituacaoContratualDoColaborador, string> = {
  com_contrato_ativo: "border-success/30 bg-success-soft text-success",
  sem_contrato_ativo: "border-danger/30 bg-danger-soft text-danger",
  sem_cnpj: "border-warning/35 bg-warning-soft text-warning",
};

/**
 * Selo na pessoa. `oculto` quando está tudo certo (`com_contrato_ativo`) e a
 * tela só quer apontar o problema — o padrão nas listas do Planejado/Realizado.
 */
export function SeloContratoAtivo({ situacao, contratos, mostrarQuandoAtivo = false, className }: {
  situacao: SituacaoContratualDoColaborador | null | undefined;
  contratos?: SituacaoDoColaboradorApi["contratos"];
  mostrarQuandoAtivo?: boolean;
  className?: string;
}) {
  if (!situacao) return null;
  if (situacao === "com_contrato_ativo" && !mostrarQuandoAtivo) return null;
  const Icone = situacao === "com_contrato_ativo" ? BadgeCheck : situacao === "sem_cnpj" ? FileWarning : AlertTriangle;
  const dica = situacao === "sem_cnpj"
    ? "Nenhum CNPJ ligado a esta pessoa nos Contratos. Sem contrato ativo, a OC fica pendente."
    : situacao === "sem_contrato_ativo"
      ? `Nenhum CNPJ ligado tem contrato ativo na data${contratos?.length ? ` (${contratos.map((c) => `${c.razaoSocial}: ${SITUACAO_DO_CONTRATO_LABEL[c.situacao].toLowerCase()}`).join("; ")})` : ""}. A OC fica pendente até regularizar.`
      : `Contrato ativo${contratos?.length ? `: ${contratos.filter((c) => c.situacao === "ativo" || c.situacao === "vence_em_breve").map((c) => c.razaoSocial).join(", ")}` : ""}.`;
  const selo = (
    <span
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-2xs font-semibold whitespace-nowrap", TOM_DO_SELO[situacao], className)}
      data-testid={`selo-contrato-${situacao}`}
      aria-label={`${SITUACAO_CONTRATUAL_LABEL[situacao]}. ${dica}`}
    >
      <Icone className="h-3 w-3" aria-hidden="true" />
      {situacao === "sem_contrato_ativo" ? "Sem contrato ativo" : situacao === "sem_cnpj" ? "Sem CNPJ" : "Contrato ativo"}
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{selo}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[300px] text-xs leading-relaxed">{dica}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Situação contratual das pessoas escaladas num evento (data = fim do
 * evento, o check-out final da ata). Só o DP pergunta ao servidor; para os
 * outros papéis devolve um mapa vazio e o selo simplesmente não aparece.
 *
 * Uso no Planejado/Realizado:
 *   const situacoes = useSituacaoContratualNoEvento(eventId);
 *   <SeloContratoAtivo situacao={situacoes.get(vaga.collaboratorId)?.situacao} contratos={situacoes.get(...)?.contratos} />
 */
export function useSituacaoContratualNoEvento(eventId: string | null | undefined): Map<string, SituacaoDoColaboradorApi> {
  const { user } = useAuth();
  const dp = isFinanceRole(user?.role);
  const q = useQuery<RespostaDaSituacao>({
    queryKey: [CHAVE, "situacao", "evento", eventId],
    queryFn: ({ signal }) => fetchJson(`/api/contratos/situacao?eventId=${encodeURIComponent(eventId!)}`, signal),
    enabled: dp && !!eventId,
    staleTime: 60_000,
  });
  return new Map(Object.entries(q.data?.situacoes ?? {}));
}

/** O mesmo, para uma lista de colaboradores e uma data (padrão: hoje). */
export function useSituacaoContratualDosColaboradores(ids: readonly string[], data?: string): Map<string, SituacaoDoColaboradorApi> {
  const { user } = useAuth();
  const dp = isFinanceRole(user?.role);
  const chave = [...ids].sort().join(",");
  const q = useQuery<RespostaDaSituacao>({
    queryKey: [CHAVE, "situacao", "colaboradores", chave, data ?? null],
    queryFn: ({ signal }) => fetchJson(`/api/contratos/situacao?colaboradores=${encodeURIComponent(chave)}${data ? `&data=${data}` : ""}`, signal),
    enabled: dp && ids.length > 0,
    staleTime: 60_000,
  });
  return new Map(Object.entries(q.data?.situacoes ?? {}));
}
