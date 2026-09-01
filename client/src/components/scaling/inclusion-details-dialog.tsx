/**
 * Modal "Detalhes da Escalação" — 4 abas (Resumo, Passagem, Hospedagem,
 * Comentários e Histórico), header com navegação ‹ › pela lista atual e
 * footer com Fechar / Salvar / Salvar e próxima / Confirmar.
 * Extraído de pages/scaling.tsx — comportamento preservado.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

// Decisão do usuário (17/08): o Tipo 1 × Tipo 2 do percurseiro é definido no
// PLANEJADO. Mude para true se a Escalação voltar a pedir o tipo.
const SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO = false;
import {
  Eye, Save, Plane, Check, CalendarDays, Users, MessageSquare, FileText, File,
  HelpCircle, ArrowLeftRight, AlertCircle, RotateCcw, MapPin, ChevronLeft, ChevronRight, Bike, Hammer,
} from "lucide-react";
import { eachDayOfInterval, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import { isReadOnly } from "@/lib/interactions";
import { PastEventBanner } from "@/lib/event-lock";
import { PAST_EVENT_BLOCK_MSG } from "@shared/event-window";
import { hasRoleIn } from "@shared/roles";
import { ATENDIMENTO_TIPOS } from "@shared/atendimento";
import { PERCURSEIRO_TIPOS, percurseiroDiariaCents, diasEmpreita } from "@shared/calculation-rules";
// Cenotécnica: o tipo de freela (empreita) É definido na Escalação — decisão do
// usuário em 19/08. `isCenotecnicaFunction` (alimentacao) exclui "sup ceno", que
// é produtor; NÃO usar o `isCenotecnicaFunction` de use-scaling-data, que inclui.
import { isCenotecnicaFunction as isCenoEmpreitaFunction } from "@shared/alimentacao";
import {
  CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, cenoEmpreitaTotalCents, type CenoFreelaTipo,
} from "@shared/cenotecnica-empreita";
import type { TeamInclusion } from "@shared/schema";
import { getStatusBadge } from "./scaling-table";
import ConfirmDialog from "./confirm-dialog";
import { SwapStatusCard, RequestSwapButton, SwapRequestDialog } from "./swap-request-panel";
import { AdjustRequestPanel, pendingRequestLock, useChangeWindow } from "./adjust-request-panel";
import { ProductionApprovalCard } from "./production-approval-card";
import { PassagemTab, HospedagemTab, ComentariosTab } from "./inclusion-details-tabs";
import { parseDay, isEscalated, isEscalationConfirmed, isCityFromSP, formatDateWithWeekday, type ModalData } from "./scaling-utils";
import { getSaveBlockReason, getConfirmBlockReason, getScalingWarning, isAtendimentoMissing, isPercurseiroMissing } from "./scaling-validation";
import type { ScalingData, InclusionDetails, ScalingUser } from "./use-scaling-data";
import type { ScalingMutations } from "./use-scaling-mutations";

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

const COLLAB_TYPE: Record<string, { label: string; cls: string }> = {
  casa:   { label: "Casa",   cls: "bg-blue-50 text-blue-700 border-blue-100" },
  freela: { label: "Freela", cls: "bg-violet-50 text-violet-700 border-violet-100" },
  local:  { label: "Local",  cls: "bg-orange-50 text-orange-700 border-orange-100" },
};

const tabTrigger = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";
// Rótulo de campo: 11px normal. Era 10px `font-black` com tracking de 0.12em —
// caixa alta esticada e mais pesada que o próprio valor que rotulava.
const lbl = "text-[11px] text-muted-foreground font-medium mb-1";
const val = "text-[13px] font-semibold text-slate-700";
// A aba só sinaliza o que FALTA. Um "✓" verde em cada etapa pronta enche a
// barra de ruído para dizer que não há nada a fazer ali.
const doneBadge = null;
const pendingBadge = (
  <span
    aria-label="etapa pendente"
    title="Esta etapa ainda está pendente"
    className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#D97706] align-middle"
  />
);

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

/**
 * Modalidade de EMPREITA do cenotécnico (Freela Viagem / SP / Local A / Local B).
 * Regra do usuário (19/08): TODA vaga de cenotécnica ganha este flag na
 * Escalação e o valor é FECHADO pelo nº de dias (não é diária × dias). Grava na
 * hora, pela rota dedicada — e NÃO bloqueia escalar/confirmar sem o tipo.
 */
function CenoFreelaTipoCard({ inclusion, systemSettings, canEdit, isCasa, mutation, disabledReason }: {
  inclusion: TeamInclusion;
  systemSettings: Record<string, number> | undefined;
  canEdit: boolean;
  isCasa: boolean;
  mutation: ScalingMutations["setCenoFreelaTipo"];
  /** Motivo do bloqueio (evento encerrado) — vira o tooltip dos botões. */
  disabledReason?: string | null;
}) {
  const atual = ((inclusion as any).cenoFreelaTipo ?? null) as CenoFreelaTipo | null;
  const dias = cenoDiasTrabalhados(inclusion);
  const saving = mutation.isPending;
  const algumExtrapolado = CENO_FREELA_TIPOS.some(t => cenoEmpreitaTotalCents(t, dias, systemSettings)?.extrapolado);
  return (
    <div className="mt-5">
      <div className={`border rounded-2xl overflow-hidden ${atual ? "border-slate-200" : "border-amber-200"}`} data-testid="card-ceno-freela-tipo">
        <div className={`border-b px-4 py-2.5 flex items-center gap-2 flex-wrap ${atual ? "bg-slate-50 border-slate-100" : "bg-amber-50 border-amber-100"}`}>
          <Hammer className={`w-4 h-4 ${atual ? "text-slate-400" : "text-amber-500"}`} />
          <span className={`text-[11px] font-black uppercase tracking-[0.12em] ${atual ? "text-slate-500" : "text-amber-700"}`}>
            Tipo de freela (cenotécnica)
          </span>
          {!atual && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold" data-testid="badge-ceno-freela-definir">
              definir o tipo
            </span>
          )}
        </div>
        <div className="p-4 space-y-2.5">
          <div
            role="radiogroup"
            aria-label="Tipo de freela do cenotécnico"
            data-testid="select-ceno-freela-tipo"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            {CENO_FREELA_TIPOS.map((t) => {
              const ativo = atual === t;
              const valor = cenoEmpreitaTotalCents(t, dias, systemSettings);
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  disabled={!canEdit || saving}
                  title={canEdit ? undefined : (disabledReason || "Apenas o responsável pela função pode definir o tipo de freela.")}
                  data-testid={`btn-ceno-freela-${t}`}
                  onClick={() => { if (!ativo) mutation.mutate({ id: inclusion.id, cenoFreelaTipo: t }); }}
                  className={`px-2 py-2 rounded-xl text-[11px] font-semibold border text-center transition-all disabled:opacity-60 disabled:cursor-not-allowed ${ativo ? "bg-[#2563EB] text-white border-[#2563EB]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  {CENO_FREELA_TIPO_LABELS[t]}
                  <span className={`block text-[11px] font-bold tabular-nums mt-0.5 ${ativo ? "text-blue-100" : "text-slate-500"}`}>
                    {valor ? brl(valor.totalCents) : "—"}
                  </span>
                  {valor?.extrapolado && (
                    <span className={`block text-[9px] font-medium ${ativo ? "text-blue-100" : "text-amber-600"}`}>extrapolado</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            {dias > 0
              ? <>Valor <b>fechado</b> por {dias} {dias === 1 ? "dia" : "dias"} de trabalho — não é diária × dias e não sofre deflação por período.</>
              : <>Sem dias de trabalho na vaga: defina o período ou as diárias para ver o valor fechado.</>}
            {algumExtrapolado && dias > 0 && (
              <> A tabela cobre de 2 a 6 dias; fora disso o valor é <b>extrapolado</b> pelo incremento da modalidade — confira com o Financeiro.</>
            )}
          </p>
          {isCasa && (
            <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5" data-testid="hint-ceno-casa">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
              Cenotécnico de casa (CLT) não usa a tabela de empreita — o tipo fica gravado, mas o Planejado não aplica o valor fechado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const isTypingTarget = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node || !(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable || node.getAttribute("role") === "combobox";
};

export default function InclusionDetailsDialog(props: InclusionDetailsDialogProps) {
  const {
    open, onOpenChange, modal, inclusion, initialTab, abrirEscolhaDeColaborador = false, modalData, setModalData, data, details, mutations, user,
    openAttachment, navIndex, navTotal, onNavigate, onSave, onConfirm,
  } = props;

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Valores Padrão (tabelas do percurseiro e da empreita de cenotécnica) — só
  // busca quando a função é de percurso ou de cenotécnica; sem resposta,
  // percurseiroDiariaCents / cenoEmpreitaTotalCents caem nos defaults do shared.
  const isPercursoInclusion = !!inclusion && data.isPercursoInclusion(inclusion);
  const isCenoEmpreitaInclusion = !!inclusion && isCenoEmpreitaFunction(data.getFunctionName(inclusion.functionId));
  const { data: systemSettings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings", { credentials: "include" });
      return res.json();
    },
    enabled: open && (isPercursoInclusion || isCenoEmpreitaInclusion),
    staleTime: 5 * 60 * 1000,
  });
  const fmtBRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Ao abrir (ou navegar para outra escalação) volta para a aba pedida
  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setShowAllLogs(false);
  }, [open, inclusion?.id, initialTab]);

  const hasPrev = navIndex > 0;
  const hasNext = navIndex >= 0 && navIndex < navTotal - 1;

  // Atalhos ← → quando o foco não está num campo de texto nem num sub-dialog
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      // Nas abas (Radix roving focus) e em combobox/radiogroup as setas já têm dono
      const role = (e.target as HTMLElement | null)?.getAttribute?.("role");
      if (role === "tab" || role === "radio" || role === "option" || role === "combobox" || role === "slider") return;
      const target = e.target as Node | null;
      const inside = target === document.body || (!!contentRef.current && !!target && contentRef.current.contains(target));
      if (!inside) return; // foco num dialog aninhado (troca, confirm…)
      if (e.key === "ArrowLeft" && hasPrev) { e.preventDefault(); onNavigate(-1); }
      if (e.key === "ArrowRight" && hasNext) { e.preventDefault(); onNavigate(1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hasPrev, hasNext, onNavigate]);

  const {
    collaborators, events,
    getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity,
    getPurchasedTicket, getTicket, getAccommodation,
    canManageFunction, canEditCollaborator, canConfirmEscalation, canApproveProduction, isAdminOrPurchasing,
    getCollaboratorConflicts, isEventLocked,
  } = data;
  // Evento encerrado (regra 20/08): só o administrador age. Espelha o
  // 403 do servidor — nenhuma ação daqui pode prometer o que a API vai negar.
  const eventLocked = !!inclusion && isEventLocked(inclusion);
  const eventLockReason = eventLocked ? PAST_EVENT_BLOCK_MSG : null;
  // Pedido de ajuste em análise: a escalação inteira fica travada até o
  // aprovador decidir (mesma consulta do painel "Precisa mudar algo?").
  const changeWindow = useChangeWindow(inclusion?.id, open && !!inclusion?.id);
  const requestLockReason = pendingRequestLock(changeWindow.data);
  /** Um motivo só para os cartões internos: pedido em análise vence evento encerrado. */
  const actionLockReason = requestLockReason ?? eventLockReason;
  const { comments, inclusionLogs, pendingSwap, latestSwap, users } = details;

  const getUserName = (userId: string): string => {
    if (user?.id === userId) return "Você";
    return users?.find(u => u.id === userId)?.name || "Usuário";
  };

  const renderAttachments = (ids: string[] | null | undefined, label: string) => {
    if (!ids || ids.length === 0) {
      return (
        <div className="flex items-center gap-2.5 py-3 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <File className="w-4 h-4 text-slate-300" />
          <span className="text-sm text-slate-400">Nenhum anexo disponível.</span>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {ids.map((attachmentId, index) => (
          <div
            key={attachmentId}
            role="button"
            tabIndex={0}
            aria-label={`Abrir ${label} ${index + 1}`}
            className="flex items-center gap-3 bg-white border border-slate-200 hover:border-[#2563EB] hover:bg-blue-50 rounded-xl px-4 py-3 cursor-pointer transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            onClick={() => openAttachment(attachmentId, `${label} ${index + 1}`)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAttachment(attachmentId, `${label} ${index + 1}`); } }}
          >
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-slate-700">{label} {index + 1}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Documento anexado · clique para visualizar</div>
            </div>
            <Eye className="w-4 h-4 text-slate-300 group-hover:text-[#2563EB] transition-colors flex-shrink-0" />
          </div>
        ))}
      </div>
    );
  };

  const renderWorkDays = (incl: TeamInclusion): ReactNode => {
    // Dias de trabalho: prioriza `workDays` (dias específicos); cai no intervalo início→fim se vazio.
    const explicitDays = ((incl.workDays || []) as (string | null)[])
      .map(d => parseDay(d))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    let allDays: Date[] = explicitDays;
    const usesWorkDays = explicitDays.length > 0;
    if (!usesWorkDays) {
      if (!incl.scheduleStartDate || !incl.scheduleEndDate) return null;
      const startDate = parseDay(incl.scheduleStartDate);
      const endDate = parseDay(incl.scheduleEndDate);
      // eachDayOfInterval lança RangeError com data inválida ou fim < início
      if (!startDate || !endDate || startDate > endDate) return null;
      allDays = eachDayOfInterval({ start: startDate, end: endDate });
    }
    if (allDays.length === 0) return null;
    const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
    return (
      <div>
        <div className={lbl + " mb-2"}>
          {allDays.length} {allDays.length === 1 ? "dia" : "dias"} {usesWorkDays ? "de trabalho" : "no período"}
          {usesWorkDays && <span className="normal-case tracking-normal font-medium text-slate-400"> · dias específicos</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allDays.map((day, index) => {
            const weekend = isWeekend(day);
            return (
              <div key={index} className={`flex flex-col items-center rounded-xl border text-center px-2 py-1.5 min-w-[40px] ${weekend ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200"}`}>
                <div className={`text-[9px] uppercase font-bold ${weekend ? "text-orange-400" : "text-slate-400"}`}>{format(day, "EEE", { locale: ptBR })}</div>
                <div className={`text-[15px] font-bold leading-tight ${weekend ? "text-orange-600" : "text-slate-700"}`}>{format(day, "dd", { locale: ptBR })}</div>
                <div className={`text-[8px] ${weekend ? "text-orange-300" : "text-slate-300"}`}>{format(day, "MMM", { locale: ptBR })}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const selectedTicket = inclusion ? getTicket(inclusion.id) : undefined;
  const accommodation = inclusion ? getAccommodation(inclusion.id) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      {/* 980px no lugar de 1180: em duas colunas o conteúdo respira, e a
          terceira coluna do layout antigo só existia porque a largura sobrava. */}
      <DialogContent ref={contentRef} className="!max-w-[980px] w-[95vw] max-h-[calc(100dvh-48px)] !rounded-[14px] !flex !flex-col p-0 gap-0 overflow-hidden">
        {/* ── Cabeçalho ──
            O gradiente e o quadrado azul de 44px com sombra ocupavam a linha
            inteira para dizer "Detalhes da Escalação", que é o que o próprio
            modal já é. O que identifica o registro é o ID, o nome e a
            situação — e é isso que fica. */}
        <div className="px-6 pt-4 pb-3.5 border-b border-slate-100 shrink-0 flex items-center gap-3 pr-14">
          <span className="font-mono text-[12px] text-muted-foreground tabular-nums shrink-0">
            #{inclusion?.inclusionNumber || "—"}
          </span>
          {inclusion && getStatusBadge(inclusion, "sm")}
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 leading-tight m-0 p-0 truncate">
              {inclusion?.collaboratorId ? getCollaboratorName(inclusion.collaboratorId) : "Vaga sem nome"}
            </DialogTitle>
            <span className="sr-only">Detalhes da escalação</span>
          </div>
          {navTotal > 1 && navIndex >= 0 && (
            <div className="flex items-center gap-1 shrink-0" aria-label="Navegar entre escalações da lista">
              <button
                type="button"
                onClick={() => onNavigate(-1)}
                disabled={!hasPrev}
                title="Anterior (←)"
                aria-label="Escalação anterior"
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                data-testid="button-nav-prev"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-semibold text-slate-400 tabular-nums px-1" data-testid="text-nav-position">
                {navIndex + 1} / {navTotal}
              </span>
              <button
                type="button"
                onClick={() => onNavigate(1)}
                disabled={!hasNext}
                title="Próxima (→)"
                aria-label="Próxima escalação"
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                data-testid="button-nav-next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {inclusion && (
          <>
            {eventLocked && <PastEventBanner show className="mx-6 mt-3" />}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="px-6 border-b border-slate-100 shrink-0">
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
                      <span className="ml-1.5 bg-primary text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{comments.length}</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">

                {/* ══ ABA: RESUMO ══ */}
                <TabsContent value="resumo" className="m-0 p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                    {/* Col 1: Informações Básicas */}
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                        <div>
                          <div className={lbl}>Evento</div>
                          <div className="text-[13px] font-semibold text-primary leading-snug">{getEventName(inclusion.eventId)}</div>
                        </div>
                        <div>
                          <div className={lbl}>ID</div>
                          <div className="text-[13px] font-bold text-slate-700 font-mono">#{inclusion.inclusionNumber || "N/A"}</div>
                        </div>
                        <div>
                          <div className={lbl}>Função</div>
                          <div className={val}>{getFunctionName(inclusion.functionId)}</div>
                        </div>
                        <div>
                          <div className={lbl}>Status</div>
                          {getStatusBadge(inclusion, "md")}
                        </div>
                        <div>
                          <div className={lbl}>Nota Fiscal</div>
                          {(() => {
                            const emitsNf = (inclusion as any).emitsNf !== false;
                            // Mesmo gate do Confirmar: responsável pela função, admin ou Compras
                            // Pedido em análise trava aqui também: a NF entra na
                            // conta do que o aprovador está decidindo.
                            const canToggleNf = canManageFunction(inclusion.functionId) && !eventLocked && !requestLockReason;
                            const badgeCls = `inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full transition-colors ${emitsNf ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`;
                            const dot = <span className={`w-1.5 h-1.5 rounded-full ${emitsNf ? "bg-emerald-500" : "bg-slate-400"}`} />;
                            const label = emitsNf ? "Emite NF" : "Não emite NF";
                            if (!canToggleNf) {
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0} className={`${badgeCls} cursor-not-allowed opacity-80`} aria-disabled="true" data-testid="badge-emits-nf-readonly">
                                      {dot}{label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[260px] text-[12px]">
                                    {actionLockReason ?? "Somente o responsável pela função, administradores ou Compras podem alterar se este escalado emite nota fiscal."}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            }
                            return (
                              <button
                                type="button"
                                disabled={mutations.toggleEmitsNf.isPending}
                                onClick={() => mutations.toggleEmitsNf.mutate({ id: inclusion.id, emitsNf: !emitsNf })}
                                title="Clique para alternar. Define se a tela de Notas Fiscais cobra nota deste escalado."
                                className={`${badgeCls} disabled:opacity-50 ${emitsNf ? "hover:bg-emerald-200" : "hover:bg-slate-200"}`}
                                data-testid="button-toggle-emits-nf"
                              >
                                {dot}{label}
                              </button>
                            );
                          })()}
                        </div>
                        {(inclusion.needsTicket || inclusion.needsAccommodation) && (
                          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                            {inclusion.needsTicket && (
                              selectedTicket ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-100">
                                  <Plane style={{ width: 9, height: 9 }} />Passagem registrada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                                  <Plane style={{ width: 9, height: 9 }} />Passagem pendente
                                </span>
                              )
                            )}
                            {inclusion.needsAccommodation && (
                              accommodation ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-lg border border-purple-100">🏨 Hospedagem registrada</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">🏨 Hospedagem pendente</span>
                              )
                            )}
                          </div>
                        )}
                        {isAdminOrPurchasing && pendingSwap && (
                          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                              <ArrowLeftRight style={{ width: 9, height: 9 }} />Troca pendente
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Col 2: Colaborador */}
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className={lbl} style={{ marginBottom: 0 }}>Colaborador <span className="text-red-400">*</span></span>
                            {(() => {
                              const ticketPurchased = inclusion.needsTicket ? !!getPurchasedTicket(inclusion.id) : false;
                              const accommodationReserved = inclusion.needsAccommodation ? !!accommodation : false;
                              const blocked = !canEditCollaborator(inclusion);
                              const blockReason = ticketPurchased && accommodationReserved
                                ? "passagem comprada e hospedagem reservada"
                                : ticketPurchased ? "passagem já comprada"
                                : accommodationReserved ? "hospedagem já reservada"
                                : null;
                              return (
                                <div className="relative group inline-flex items-center">
                                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-[#2563EB] cursor-help transition-colors" />
                                  <div className="pointer-events-none absolute left-0 top-6 z-[9999] w-72 bg-slate-800 text-white rounded-xl px-4 py-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute left-3 -top-1.5 border-[6px] border-transparent border-b-slate-800" />
                                    <div className="text-[12px] font-bold text-white mb-1.5">Troca de colaborador</div>
                                    <div className="text-[11px] text-slate-300 leading-relaxed">
                                      A alteração é liberada enquanto não houver passagem comprada ou hospedagem reservada vinculada a esta escalação.
                                    </div>
                                    {blocked && blockReason && (
                                      <div className="mt-2 pt-2 border-t border-slate-600 text-[11px] text-amber-300 font-medium">Bloqueio atual: {blockReason}.</div>
                                    )}
                                    {blocked && !blockReason && (
                                      <div className="mt-2 pt-2 border-t border-slate-600 text-[11px] text-amber-300 font-medium">Você não tem permissão para alterar nesta escalação.</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                          {(() => {
                            const collab = collaborators?.find(c => c.id === (modalData.collaboratorId || inclusion.collaboratorId));
                            if (!collab) return null;
                            const t = COLLAB_TYPE[collab.type] ?? { label: collab.type ?? "—", cls: "bg-slate-100 text-slate-600 border-slate-200" };
                            return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 ${t.cls}`}>{t.label}</span>;
                          })()}
                        </div>
                        {(!canEditCollaborator(inclusion) || isEscalationConfirmed(inclusion)) ? (
                          <div className="space-y-2">
                            <div className="border border-slate-200 rounded-xl bg-white px-3 py-2.5">
                              <div className="text-sm font-medium text-slate-700">{getCollaboratorName(modalData.collaboratorId)}</div>
                              {(() => {
                                const city = modalData.city || getCollaboratorCity(modalData.collaboratorId);
                                if (!city) return null;
                                return (
                                  <div className="mt-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5 flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                                    <div>
                                      <div className="text-[9px] font-semibold text-blue-400 uppercase tracking-wide leading-none">Sai de</div>
                                      <div className="text-[12px] font-bold text-blue-700 leading-tight">{city}</div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <SwapStatusCard
                              pendingSwap={pendingSwap}
                              latestSwap={latestSwap}
                              currentUserId={user?.id}
                              isAdminOrPurchasing={isAdminOrPurchasing}
                              getCollaboratorName={getCollaboratorName}
                              mutations={mutations}
                              blockReason={actionLockReason}
                            />
                            {isEscalationConfirmed(inclusion) && inclusion.collaboratorId && !pendingSwap && (
                              <RequestSwapButton onClick={() => setShowSwapModal(true)} blockReason={actionLockReason} />
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Marcação inline: colaborador é obrigatório para confirmar */}
                            <div className={!modalData.collaboratorId && !isEscalated(inclusion) ? "rounded-lg ring-1 ring-amber-300" : ""}>
                              <CollaboratorCombobox
                                collaborators={collaborators}
                                value={modalData.collaboratorId}
                                onValueChange={(value) => {
                                  const newCity = getCollaboratorCity(value);
                                  const fromSP = isCityFromSP(newCity);
                                  setModalData(prev => ({ ...prev, collaboratorId: value, city: fromSP ? "São Paulo - SP" : (newCity || ""), departureFromSP: fromSP }));
                                }}
                                placeholder="Selecione um colaborador"
                                abrirAoMontar={abrirEscolhaDeColaborador}
                                testId="select-collaborator-escalation"
                                hideAll={true}
                                disabled={!!requestLockReason}
                                disabledReason={requestLockReason}
                              />
                            </div>
                            {!modalData.collaboratorId && !isEscalated(inclusion) && (
                              <p className="text-[10px] text-amber-600 flex items-center gap-1" data-testid="hint-collaborator-required">
                                <AlertCircle className="w-3 h-3 shrink-0" />Obrigatório para confirmar a escalação.
                              </p>
                            )}
                            {/* Tipo de atendimento — obrigatório quando a função é de atendimento */}
                            {data.isAtendimentoInclusion(inclusion) && (() => {
                              const missing = isAtendimentoMissing(inclusion, modalData, data);
                              return (
                                <div className="space-y-1.5">
                                  <label htmlFor="select-atendimento-tipo" className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    Tipo de atendimento <span className="text-red-500">*</span>
                                  </label>
                                  <select
                                    id="select-atendimento-tipo"
                                    value={modalData.atendimentoTipo}
                                    onChange={(e) => setModalData(prev => ({ ...prev, atendimentoTipo: e.target.value }))}
                                    data-testid="select-atendimento-tipo"
                                    disabled={!!requestLockReason}
                                    title={requestLockReason ?? undefined}
                                    aria-invalid={missing}
                                    className={`w-full px-3 py-2 text-[13px] border rounded-xl bg-white focus:outline-none focus:ring-2 focus:border-transparent ${missing ? "border-red-300 focus:ring-red-300" : "border-slate-200 focus:ring-[#2563EB]"}`}
                                  >
                                    <option value="">Selecione...</option>
                                    {ATENDIMENTO_TIPOS.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                                  </select>
                                  {missing && (
                                    <p className="text-[10px] text-red-600 flex items-center gap-1" data-testid="hint-atendimento-required">
                                      <AlertCircle className="w-3 h-3 shrink-0" />Selecione Key Account ou Executivo de Contas.
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                            {/* Tipo do percurseiro (Tipo 1 × Tipo 2): por decisão do usuário
                                (17/08) é definido NO PLANEJADO, não aqui. Bloco mantido
                                desligado (SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO) para religar
                                sem reescrever se a regra mudar. */}
                            {SHOW_PERCURSEIRO_TIPO_NA_ESCALACAO && isPercursoInclusion && (() => {
                              const missing = isPercurseiroMissing(inclusion, modalData, data);
                              return (
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                                    <Bike className="w-3 h-3" />
                                    Tipo do percurseiro <span className="text-red-500">*</span>
                                  </label>
                                  <div
                                    role="radiogroup"
                                    aria-label="Tipo do percurseiro"
                                    aria-invalid={missing}
                                    data-testid="select-percurseiro-tipo"
                                    className={`flex gap-1.5 rounded-xl ${missing ? "ring-1 ring-red-300 p-0.5" : ""}`}
                                  >
                                    {PERCURSEIRO_TIPOS.map((t) => {
                                      const ativo = modalData.percurseiroTipo === t.value;
                                      const diaria = percurseiroDiariaCents(t.value, systemSettings);
                                      return (
                                        <button
                                          key={t.value}
                                          type="button"
                                          role="radio"
                                          aria-checked={ativo}
                                          data-testid={`btn-percurseiro-${t.value}`}
                                          onClick={() => setModalData(prev => ({ ...prev, percurseiroTipo: t.value }))}
                                          className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${ativo ? "bg-[#2563EB] text-white border-[#2563EB]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                                        >
                                          {t.label}
                                          {diaria && (
                                            <span className={`block text-[10px] font-medium ${ativo ? "text-blue-100" : "text-slate-400"}`}>
                                              {fmtBRL(diaria.total)}/diária
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {missing && (
                                    <p className="text-[10px] text-red-600 flex items-center gap-1" data-testid="hint-percurseiro-required">
                                      <AlertCircle className="w-3 h-3 shrink-0" />Defina o tipo do percurseiro (Tipo 1 ou Tipo 2).
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                            {/* Cidade de saída */}
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                Sai de
                              </label>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setModalData(prev => ({ ...prev, departureFromSP: true, city: "São Paulo - SP" }))}
                                  disabled={!!requestLockReason}
                                  title={requestLockReason ?? undefined}
                                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${modalData.departureFromSP ? "bg-primary text-white border-primary" : "bg-card text-slate-600 border-border hover:border-slate-300"}`}
                                >
                                  São Paulo - SP
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalData(prev => ({ ...prev, departureFromSP: false, city: "" }))}
                                  disabled={!!requestLockReason}
                                  title={requestLockReason ?? undefined}
                                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${!modalData.departureFromSP ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                                >
                                  Outra cidade
                                </button>
                              </div>
                              {!modalData.departureFromSP && (
                                <input
                                  type="text"
                                  value={modalData.city || ""}
                                  onChange={(e) => setModalData(prev => ({ ...prev, city: e.target.value }))}
                                  placeholder="Ex: Rio de Janeiro - RJ"
                                  disabled={!!requestLockReason}
                                  autoFocus
                                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                                />
                              )}
                            </div>
                            {/* Bloqueio de conflito de datas */}
                            {(() => {
                              if (!modalData.collaboratorId) return null;
                              const { sameEvent, dateOverlap } = getCollaboratorConflicts(modalData.collaboratorId, inclusion);
                              if (!sameEvent.length && !dateOverlap.length) return null;
                              const conflicts = [...sameEvent, ...dateOverlap].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);
                              return (
                                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                                  <div className="text-[11px] text-red-700 leading-snug space-y-1">
                                    <p className="font-bold">Escalação bloqueada — colaborador já escalado:</p>
                                    {conflicts.map(inc => {
                                      const startStr = inc.scheduleStartDate ? new Date(inc.scheduleStartDate).toLocaleDateString("pt-BR") : "";
                                      const endStr = inc.scheduleEndDate ? new Date(inc.scheduleEndDate).toLocaleDateString("pt-BR") : "";
                                      return (
                                        <p key={inc.id}>
                                          <span className="font-semibold">{getEventName(inc.eventId)}</span>
                                          {startStr && endStr && <span className="text-red-500"> · {startStr} a {endStr}</span>}
                                        </p>
                                      );
                                    })}
                                    <p className="text-red-500 mt-0.5">Só é possível escalar se o colaborador for inativado ou sair da outra prova.</p>
                                  </div>
                                </div>
                              );
                            })()}
                            {isEscalationConfirmed(inclusion) && inclusion.collaboratorId && !pendingSwap && (
                              <RequestSwapButton onClick={() => setShowSwapModal(true)} blockReason={actionLockReason} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Col 3: Período de Trabalho */}
                    <div>
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="bg-[#2563EB]/5 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 text-[#2563EB]" />
                          <span className="text-[11px] font-black text-[#2563EB] uppercase tracking-[0.12em]">Período de Trabalho</span>
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                              <div className={lbl}>Início</div>
                              <div className={val}>{formatDateWithWeekday(inclusion.scheduleStartDate)}</div>
                            </div>
                            <div>
                              <div className={lbl}>Término</div>
                              <div className={val}>{formatDateWithWeekday(inclusion.scheduleEndDate)}</div>
                            </div>
                          </div>
                          {renderWorkDays(inclusion)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pedido de ajuste da vaga já escalada (regra do dono, 26/08):
                      dias, diárias e viagem ainda podem mudar por pedido ao
                      aprovador enquanto a passagem não for comprada. Quem decide
                      se aparece é o servidor (papel + janela). */}
                  <AdjustRequestPanel
                    inclusion={inclusion}
                    event={events?.find(e => e.id === inclusion.eventId)}
                    functionName={getFunctionName(inclusion.functionId)}
                  />

                  {/* Tipo de freela da cenotécnica (empreita) — definido AQUI, na
                      Escalação, por pedido do usuário (19/08). Aparece também
                      depois de confirmada (só leitura quando sem permissão). */}
                  {isCenoEmpreitaInclusion && (
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
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-slate-400" />
                          <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Observações</span>
                        </div>
                        <div className="px-4 py-3">
                          <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">{inclusion.observations}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <ProductionApprovalCard inclusion={inclusion} canApprove={canApproveProduction} mutations={mutations} blockReason={actionLockReason} />

                  {/* Anexos no Resumo */}
                  {(() => {
                    const allAttachments = [
                      ...(selectedTicket?.attachmentIds || []).map(id => ({ id, label: "Passagem" })),
                      ...(accommodation?.attachmentIds || []).map(id => ({ id, label: "Hospedagem" })),
                    ];
                    if (allAttachments.length === 0) return null;
                    const visible = allAttachments.slice(0, 3);
                    return (
                      <div className="mt-5">
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                          <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Anexos</span>
                            <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{allAttachments.length}</span>
                          </div>
                          <div className="p-4 space-y-2">
                            {visible.map(({ id, label }, index) => (
                              <div
                                key={id}
                                role="button"
                                tabIndex={0}
                                aria-label={`Abrir ${label} · Anexo ${index + 1}`}
                                className="flex items-center gap-3 bg-white border border-slate-200 hover:border-[#2563EB] hover:bg-blue-50 rounded-xl px-3 py-2.5 cursor-pointer transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                                onClick={() => openAttachment(id, `${label} · Anexo ${index + 1}`)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAttachment(id, `${label} · Anexo ${index + 1}`); } }}
                              >
                                <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[12px] font-semibold text-slate-700">{label} · Anexo {index + 1}</div>
                                  <div className="text-[10px] text-slate-400">Documento anexado</div>
                                </div>
                                <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#2563EB] transition-colors flex-shrink-0" />
                              </div>
                            ))}
                            {allAttachments.length > 3 && (
                              <button
                                className="w-full text-center text-[12px] text-[#2563EB] font-semibold py-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                                onClick={() => setActiveTab("passagem")}
                              >
                                Ver todos os {allAttachments.length} anexos →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>

                <PassagemTab inclusion={inclusion} ticket={selectedTicket} renderAttachments={renderAttachments} />
                <HospedagemTab inclusion={inclusion} accommodation={accommodation} renderAttachments={renderAttachments} />
                <ComentariosTab
                  comments={comments}
                  inclusionLogs={inclusionLogs}
                  getUserName={getUserName}
                  newComment={newComment}
                  setNewComment={setNewComment}
                  showAllLogs={showAllLogs}
                  setShowAllLogs={setShowAllLogs}
                  addComment={mutations.addComment}
                  canComment={!isReadOnly(inclusion, user) && canConfirmEscalation(inclusion)}
                  canSend={!isReadOnly(inclusion, user)}
                />
              </div>
            </Tabs>

            {/* ── Footer ── */}
            {(() => {
              const isSaving = mutations.saveInclusion.isPending;
              const readOnly = isReadOnly(inclusion, user);
              const escalated = isEscalated(inclusion);
              // Pedido em análise trava TUDO e explica o porquê (regra do dono,
              // 26/08) — vem antes dos demais motivos porque é o mais forte:
              // salvar por baixo faria o aprovador decidir sobre outra vaga.
              const saveReason = isSaving ? null : (requestLockReason ?? getSaveBlockReason(inclusion, modalData, data));
              const confirmReason = isSaving ? null : (requestLockReason ?? getConfirmBlockReason(inclusion, modalData, data));
              const showSave = !readOnly && (canEditCollaborator(inclusion) || !escalated);
              const showConfirm = !readOnly && !escalated;
              const inlineReason = showConfirm ? confirmReason : (showSave ? saveReason : null);
              // Aviso não bloqueante (ex.: cenotécnica sem tipo de freela): só
              // aparece quando não há bloqueio, para não competir com ele.
              const warning = inlineReason ? null : getScalingWarning(inclusion, data);
              return (
                <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-3 shrink-0 bg-white">
                  {inclusion.status === "cancelado" && !eventLocked && hasRoleIn(user?.role, ["admin"]) && (
                    <Button
                      onClick={() => setShowReactivateConfirm(true)}
                      disabled={mutations.reactivate.isPending}
                      className="mr-auto flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm font-semibold"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reativar escalação
                    </Button>
                  )}
                  {inlineReason && (
                    <p
                      className="mr-auto flex items-center gap-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 max-w-full sm:max-w-[420px] leading-snug"
                      role="status"
                      data-testid="text-confirm-block-reason"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="min-w-0">{inlineReason}</span>
                    </p>
                  )}
                  {warning && (
                    <p
                      className="mr-auto flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 max-w-full sm:max-w-[420px] leading-snug"
                      role="status"
                      data-testid="text-scaling-warning"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0">{warning}</span>
                    </p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium"
                  >
                    Fechar
                  </Button>
                  {showSave && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={saveReason ? 0 : -1} className="inline-flex">
                          <Button
                            variant="secondary"
                            onClick={() => onSave(false)}
                            disabled={isSaving || !!saveReason}
                            className="flex items-center gap-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl px-5 py-2 text-sm font-medium"
                            data-testid="button-save-scaling"
                          >
                            <Save className="w-4 h-4" />
                            {isSaving ? "Salvando..." : "Salvar Alterações"}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {saveReason && <TooltipContent side="top" className="max-w-[300px] text-[12px]">{saveReason}</TooltipContent>}
                    </Tooltip>
                  )}
                  {showSave && hasNext && (
                    <Button
                      variant="secondary"
                      onClick={() => onSave(true)}
                      disabled={isSaving || !!saveReason}
                      title="Salva esta escalação e abre a próxima da lista"
                      className="flex items-center gap-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl px-4 py-2 text-sm font-medium"
                      data-testid="button-save-next-scaling"
                    >
                      Salvar e próxima
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                  {showConfirm && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={confirmReason ? 0 : -1} className="inline-flex">
                          <Button
                            onClick={onConfirm}
                            disabled={isSaving || !!confirmReason}
                            style={{ background: "hsl(var(--primary))" }}
                            className="flex items-center gap-2 text-white rounded-xl px-6 py-2 h-10 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                            data-testid="button-confirm-scaling"
                          >
                            <Check className="w-4 h-4" />
                            {isSaving ? "Confirmando..." : "Confirmar Escalação"}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {confirmReason && <TooltipContent side="top" className="max-w-[320px] text-[12px]">{confirmReason}</TooltipContent>}
                    </Tooltip>
                  )}
                </div>
              );
            })()}

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
            />
            <ConfirmDialog
              open={showReactivateConfirm}
              onOpenChange={setShowReactivateConfirm}
              icon={RotateCcw}
              tone="emerald"
              title="Reativar escalação?"
              description={<>A escalação voltará ao status <span className="font-semibold text-slate-700">Pendente</span> e ficará disponível novamente para edição e confirmação.</>}
              confirmLabel="Sim, reativar"
              pendingLabel="Reativando..."
              isPending={mutations.reactivate.isPending}
              onConfirm={() => mutations.reactivate.mutate(inclusion.id, { onSuccess: () => setShowReactivateConfirm(false) })}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

