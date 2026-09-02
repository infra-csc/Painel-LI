import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Hotel, MessageCircle, FileText, History, AlertCircle, Lock, MapPin, Check,
  ArrowDown, ArrowUp, RefreshCw, UserRound, CalendarDays, Pencil, Sparkles, CheckCircle2, Unlock, type LucideIcon,
} from "lucide-react";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { useVoucherFill } from "@/components/tickets/use-voucher-fill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fixEncoding } from "@/lib/utils";
import { ROOM_TYPE_LABEL } from "@/components/operational-mirror-drawers";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation, Comment, TeamInclusionLog } from "@shared/schema";
import { EMPTY_DRAFT } from "./types";
import type { AccommodationDraft, NormalizedSwap, UserLite } from "./types";
import { brl, draftFrom, fetchSwaps, formatDate, isCheckOutAfterCheckIn, toDateInput } from "./utils";
import { contarDiarias } from "./accommodations-queue";
import SwapReviewPanel from "./swap-review-panel";
import { PastEventBanner, PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";

export interface AccommodationModalProps {
  open: boolean;
  onClose: () => void;
  /** Inclusão aberta. Com null, o modal não renderiza conteúdo. */
  inclusion: TeamInclusion | null;
  accommodation: Accommodation | undefined;
  event: Event | undefined;
  func: Function | undefined;
  collaborator: Collaborator | undefined;
  collaboratorById: Map<string, Collaborator>;
  users: UserLite[] | undefined;
  /** Pode editar/salvar este registro (já considera status e papel). */
  canEditRecord: boolean;
  /** Admin/Compras — aprova trocas e altera hospedagem registrada. */
  isPurchasingRole: boolean;
  /** Registrada e o usuário não é Compras: somente leitura com aviso. */
  lockedForRole: boolean;
  /** Evento encerrado (ou fora da lista): só leitura — o servidor responde 403. */
  eventLocked?: boolean;
  /** Texto do banner quando `eventLocked` — encerrado x indisponível. */
  eventLockMessage?: string | null;
  isPostPurchase: boolean;
  isSaving: boolean;
  /** Persiste o rascunho (cria ou atualiza). Deve rejeitar (throw) em erro. */
  onSave: (draft: AccommodationDraft) => Promise<void>;
  /** `modal={false}` enquanto o diálogo de sucesso está por cima. */
  modal?: boolean;
}

const LBL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-0.5";
const VAL = "text-[13px] font-semibold text-slate-700";
const FIELD_LBL = "text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block";
const TAB = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-slate-500 bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";

const LOG_ACTIONS: Record<string, { label: string; icon: LucideIcon }> = {
  status_changed: { label: "Status alterado", icon: RefreshCw },
  collaborator_changed: { label: "Colaborador alterado", icon: UserRound },
  dates_changed: { label: "Período alterado", icon: CalendarDays },
  accommodation_created: { label: "Hospedagem criada", icon: Hotel },
  accommodation_updated: { label: "Hospedagem atualizada", icon: Pencil },
  created: { label: "Criado", icon: Sparkles },
  confirmed: { label: "Confirmado", icon: CheckCircle2 },
  reopened: { label: "Reaberto", icon: Unlock },
};

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className={LBL}>{label}</div>
      <div className={`${VAL} ${mono ? "font-mono font-bold" : ""}`}>{children}</div>
    </div>
  );
}

/** Modal de Hospedagem — Resumo / Dados / Complementos e Histórico. */
/** O que o voucher traz e esta tela não guarda — dito por extenso no aviso. */
const ROTULO_FORA: Record<string, string> = {
  roomType: "o tipo de quarto",
  nightsCount: "o número de diárias",
  dailyRate: "o valor da diária",
  totalCents: "o total da hospedagem",
  paymentCompany: "a empresa pagadora",
};

export default function AccommodationModal(props: AccommodationModalProps) {
  const { open, onClose, inclusion, modal = true } = props;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} modal={modal}>
      {/* Conteúdo montado só com inclusão: o rascunho nasce do registro atual a cada abertura. */}
      {open && inclusion && <AccommodationModalContent key={inclusion.id} {...props} inclusion={inclusion} />}
    </Dialog>
  );
}

function AccommodationModalContent({
  onClose, inclusion, accommodation, event, func, collaborator, collaboratorById, users,
  canEditRecord, isPurchasingRole, lockedForRole, eventLocked, eventLockMessage, isPostPurchase, isSaving, onSave,
}: AccommodationModalProps & { inclusion: TeamInclusion }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<AccommodationDraft>(() => draftFrom(accommodation, inclusion));
  /*
   * A aba de abertura segue a intenção de quem abriu: vaga pendente abre em
   * Dados, que é o trabalho a fazer; registrada abre em Resumo, que é consulta.
   * Abrir as duas em Resumo custava um clique a cada reserva registrada.
   */
  const [activeTab, setActiveTab] = useState(accommodation ? "resumo" : "dados");
  /** O aviso de check-in tardio só aparece depois que o usuário mexe em algo. */
  const [tocou, setTocou] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const roMode = !canEditRecord;

  const set = <K extends keyof AccommodationDraft>(field: K, value: AccommodationDraft[K]) => {
    setTocou(true);
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  // ── Período de trabalho da escala, que é o que a hospedagem precisa cobrir ──
  const escalaInicio = toDateInput(inclusion.scheduleStartDate);
  const escalaFim = toDateInput(inclusion.scheduleEndDate);
  const temPeriodoDaEscala = !!(escalaInicio && escalaFim);
  const diariasDaEscala = contarDiarias(escalaInicio, escalaFim);
  const diariasDoRascunho = contarDiarias(draft.checkInDate, draft.checkOutDate);
  const periodoDaEscalaPorExtenso = temPeriodoDaEscala
    ? `${formatDate(escalaInicio).slice(0, 5)} a ${formatDate(escalaFim)} · ${diariasDaEscala} ${diariasDaEscala === 1 ? "diária" : "diárias"}`
    : null;

  const usarPeriodoDaEscala = () => {
    setTocou(true);
    // Não sobrescreve o que já foi digitado: o botão é atalho, não borracha.
    setDraft((prev) => ({
      ...prev,
      checkInDate: prev.checkInDate || escalaInicio,
      checkOutDate: prev.checkOutDate || escalaFim,
    }));
  };

  /*
   * Progresso dos obrigatórios. São quatro: hotel, localização, check-in e
   * check-out — os mesmos que o botão de salvar exige.
   */
  const obrigatorios = [draft.hotelName, draft.hotelLocation, draft.checkInDate, draft.checkOutDate];
  const preenchidos = obrigatorios.filter((v) => !!(v || "").trim()).length;

  /*
   * Check-in depois do começo da escala significa uma noite sem hotel para
   * alguém que já está trabalhando. É aviso, não impedimento — às vezes a
   * pessoa mesmo pediu para chegar depois.
   */
  const chegaTarde = tocou && !!escalaInicio && !!draft.checkInDate && draft.checkInDate > escalaInicio;

  /**
   * O mesmo anexo que vira comprovante preenche a reserva (31/08) — como já
   * acontece na passagem. Serve para o voucher do hotel e para o relatório de
   * reservas que o hotel manda com o evento inteiro: nesse caso o hook procura
   * a reserva DESTA pessoa, e não a primeira do arquivo.
   */
  const voucher = useVoucherFill({
    para: "hospedagem",
    colaborador: collaborator?.fullName,
    onPreencher: (campos) => {
      // O voucher traz mais do que esta tela guarda: diária, total, tipo de
      // quarto e empresa pagadora moram no Espelho Operacional. Aplicar só o
      // que este formulário conhece — e dizer o que ficou de fora, para o
      // número não se perder no caminho.
      const meus: Partial<AccommodationDraft> = {};
      const foraDaqui: string[] = [];
      for (const [k, v] of Object.entries(campos)) {
        if (k in EMPTY_DRAFT && k !== "attachmentIds") (meus as Record<string, string>)[k] = v;
        else foraDaqui.push(ROTULO_FORA[k] ?? k);
      }
      setDraft((d) => ({ ...d, ...meus }));
      if (foraDaqui.length) {
        toast({
          title: "Nem tudo cabe nesta tela",
          description: `O voucher também traz ${foraDaqui.join(", ")} — esses campos ficam no Espelho Operacional.`,
        });
      }
    },
  });

  const { data: comments } = useQuery<Comment[]>({ queryKey: ["/api/comments", inclusion.id] });
  const { data: logs } = useQuery<TeamInclusionLog[]>({ queryKey: ["/api/team-inclusions", inclusion.id, "logs"] });
  const { data: swaps } = useQuery<NormalizedSwap[]>({
    queryKey: ["/api/swap-requests/inclusion", inclusion.id],
    queryFn: () => fetchSwaps(`/api/swap-requests/inclusion/${inclusion.id}`),
  });

  const userName = (id: string | null | undefined) => users?.find((u) => u.id === id)?.name || "Usuário";

  const handleSave = async () => {
    if (isSaving) return; // guarda contra duplo clique com a requisição em voo
    if (!draft.hotelName.trim() || !draft.hotelLocation.trim()) {
      toast({ title: "Campos obrigatórios", description: "Nome do hotel e localização são obrigatórios", variant: "destructive" });
      setActiveTab("dados");
      return;
    }
    if (!draft.checkInDate || !draft.checkOutDate) {
      toast({ title: "Campos obrigatórios", description: "Informe as datas de check-in e check-out.", variant: "destructive" });
      setActiveTab("dados");
      return;
    }
    if (!isCheckOutAfterCheckIn(draft)) {
      toast({ title: "Datas inválidas", description: "O check-out deve ser igual ou posterior ao check-in.", variant: "destructive" });
      setActiveTab("dados");
      return;
    }
    try {
      await onSave(draft);
    } catch {
      // O toast destrutivo vem do onError da mutação; aqui só evitamos que o
      // modal feche e o "Sucesso" apareça sem nada ter sido gravado.
    }
  };

  const StatusPill = accommodation ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-[11px] font-bold rounded-full border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Registrada
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 text-[11px] font-bold rounded-full border border-orange-200">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
    </span>
  );

  const sortedLogs = (logs ?? []).slice().sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const visibleLogs = showAllLogs ? sortedLogs : sortedLogs.slice(0, 5);

  return (
    <DialogContent className="!max-w-[1100px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
      <DialogHeader className="sr-only">
        <DialogTitle>Registro de Hospedagem</DialogTitle>
        <DialogDescription>Modal de hospedagem</DialogDescription>
      </DialogHeader>

      {/* ─── HEADER ─── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-4 bg-brand-soft border-b border-slate-200">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm shrink-0 bg-primary">
          <Hotel className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-black text-slate-800 leading-tight">Registro de Hospedagem</h2>
          <p className="text-[12px] text-slate-500 mt-0.5 truncate">
            #{inclusion.inclusionNumber || "N/A"} · {event?.name || "—"} · {func?.name || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">{StatusPill}</div>
      </div>

      {/*
        Progresso só na aba Dados: fora dela ele contava "0 de 0" e virava um
        indicador que media nada.
      */}
      {activeTab === "dados" && !roMode && (
        <div className="shrink-0 px-6 py-2 border-b border-slate-100 flex items-center gap-3" data-testid="progresso-obrigatorios">
          <div
            className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={preenchidos}
            aria-valuemin={0}
            aria-valuemax={obrigatorios.length}
            aria-label="Campos obrigatórios preenchidos"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${preenchidos === obrigatorios.length ? "bg-[#059669]" : "bg-primary"}`}
              style={{ width: `${(preenchidos / obrigatorios.length) * 100}%` }}
            />
          </div>
          <span className="text-[12px] text-[#64748B] tabular-nums whitespace-nowrap">
            {preenchidos} de {obrigatorios.length} campos obrigatórios
          </span>
        </div>
      )}

      {/* ─── ABAS ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="px-6 border-b border-slate-100 shrink-0">
          <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
            <TabsTrigger value="resumo" className={TAB}>Resumo</TabsTrigger>
            <TabsTrigger value="dados" className={TAB}>
              Dados da Hospedagem
              {accommodation
                ? <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-green-100 text-green-700 rounded-full" aria-label="registrada"><Check className="w-2.5 h-2.5" /></span>
                : <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-amber-100 text-amber-600 rounded-full" aria-label="pendente"><AlertCircle className="w-2.5 h-2.5" /></span>}
            </TabsTrigger>
            <TabsTrigger value="complementos" className={TAB}>Complementos e Histórico</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ══ ABA: RESUMO ══ */}
          <TabsContent value="resumo" className="m-0 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Col 1: Evento + Função */}
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                <div>
                  <div className={LBL}>Evento</div>
                  <div className="text-[13px] font-semibold text-primary leading-snug">{event?.name || "—"}</div>
                </div>
                <Field label="ID" mono>#{inclusion.inclusionNumber || "N/A"}</Field>
                <Field label="Função">{func?.name || "—"}</Field>
                <div>
                  <div className={LBL}>Hospedagem</div>
                  {accommodation ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded-lg border border-green-100"><Hotel className="w-2.5 h-2.5" />Registrada</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200"><Hotel className="w-2.5 h-2.5" />Pendente</span>
                  )}
                </div>
              </div>

              {/* Col 2: Colaborador */}
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                <Field label="Colaborador">{collaborator ? fixEncoding(collaborator.fullName) : "—"}</Field>
                {collaborator && (<>
                  <Field label="Documento" mono>{collaborator.documentType?.toUpperCase() || "N/A"}: {collaborator.officialDocument || "N/A"}</Field>
                  <Field label="Data de Nascimento">{collaborator.birthDate ? formatDate(collaborator.birthDate) : "N/A"}</Field>
                  <Field label="Cidade do colaborador">{collaborator.city || "—"}</Field>
                  <Field label="Tipo">{collaborator.type || "—"}</Field>
                </>)}
                {inclusion.city && (
                  <div className="mt-1 rounded-xl bg-brand-soft border border-blue-100 px-3 py-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Sai de</div>
                      <div className="text-[13px] font-bold text-primary">{inclusion.city}</div>
                    </div>
                  </div>
                )}
                <SwapReviewPanel inclusion={inclusion} swaps={swaps} collaboratorById={collaboratorById} canReview={isPurchasingRole} />
              </div>

              {/* Col 3: Período + Hotel (se registrado) */}
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-brand-soft border-b border-slate-200 px-4 py-2.5">
                    <span className="text-[11px] font-black text-primary uppercase tracking-[0.12em]">Período de Trabalho</span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3">
                    <Field label="Início">{inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : "—"}</Field>
                    <Field label="Término">{inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : "—"}</Field>
                  </div>
                </div>

                {accommodation && (
                  <div className="border border-green-200 rounded-2xl overflow-hidden">
                    <div className="bg-green-50 border-b border-green-200 px-4 py-2.5 flex items-center gap-2">
                      <Hotel className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-[11px] font-black text-green-700 uppercase tracking-[0.12em]">Hotel</span>
                    </div>
                    <div className="p-4 space-y-2">
                      <Field label="Nome">{accommodation.hotelName || "—"}</Field>
                      <Field label="Localização">{accommodation.hotelLocation || "—"}</Field>
                      {accommodation.reservationNumber && <Field label="Reserva" mono>{accommodation.reservationNumber}</Field>}
                      {(accommodation.checkInDate || accommodation.checkOutDate) && (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <Field label="Check-in">{accommodation.checkInDate ? formatDate(accommodation.checkInDate) : "—"}{accommodation.checkInTime ? ` · ${accommodation.checkInTime}` : ""}</Field>
                          <Field label="Check-out">{accommodation.checkOutDate ? formatDate(accommodation.checkOutDate) : "—"}{accommodation.checkOutTime ? ` · ${accommodation.checkOutTime}` : ""}</Field>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ══ ABA: DADOS DA HOSPEDAGEM ══ */}
          <TabsContent value="dados" className="m-0 p-6">
            <div className="space-y-4">
              <PastEventBanner show={!!eventLocked} message={eventLockMessage} />
              {lockedForRole && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2" data-testid="notice-locked-for-role">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-amber-700 font-semibold text-[13px]">Hospedagem registrada — somente Compras altera hospedagem registrada.</span>
                </div>
              )}
              {isPostPurchase && isPurchasingRole && (
                <div className="bg-brand-soft border border-blue-200 rounded-xl px-4 py-2.5">
                  <span className="text-primary font-semibold text-[13px]">Hospedagem registrada — alterações ficam no histórico da inclusão.</span>
                </div>
              )}

              {/*
                O voucher vem primeiro porque é o caminho mais curto: ele
                preenche hotel, período e valores de uma vez. Estava no fim da
                aba, depois de todos os campos que ele mesmo preencheria.
              */}
              {!roMode && (
                <div className="rounded-2xl border border-[#DDE3FF] bg-[#F5F7FF] p-4" data-testid="card-voucher">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800">Comece pelo voucher em PDF</p>
                      <p className="text-[12px] text-[#64748B] mt-0.5 leading-snug">
                        Ele fica guardado como comprovante e preenche hotel, período e valores.
                        Serve também para o relatório de reservas do hotel — nele buscamos a reserva desta pessoa.
                      </p>
                      <div className="mt-2.5">
                        <AttachmentUpload
                          attachmentIds={draft.attachmentIds}
                          onAttachmentsChange={(ids) => set("attachmentIds", ids)}
                          onFileSelected={voucher.lerArquivo}
                        />
                      </div>
                    </div>
                    {voucher.lendo && <span className="text-[11px] font-semibold text-primary shrink-0">Lendo o voucher…</span>}
                  </div>
                </div>
              )}

              {/* Dados do Hotel */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 mb-3">Dados do Hotel</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <div>
                    <Label htmlFor={`hotelName-${inclusion.id}`} className={FIELD_LBL}>Nome do Hotel *</Label>
                    <Input id={`hotelName-${inclusion.id}`} placeholder="Ex: Hotel Copacabana Palace" value={draft.hotelName}
                      onChange={(e) => set("hotelName", e.target.value)} data-testid="input-hotel-name" disabled={roMode} />
                  </div>
                  <div>
                    <Label htmlFor={`hotelLocation-${inclusion.id}`} className={FIELD_LBL}>Localização *</Label>
                    <Input id={`hotelLocation-${inclusion.id}`} placeholder="Ex: Copacabana, Rio de Janeiro" value={draft.hotelLocation}
                      onChange={(e) => set("hotelLocation", e.target.value)} data-testid="input-hotel-location" disabled={roMode} />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`reservationNumber-${inclusion.id}`} className={FIELD_LBL}>Número da Reserva</Label>
                  <Input id={`reservationNumber-${inclusion.id}`} placeholder="Ex: RES-123456" value={draft.reservationNumber}
                    onChange={(e) => set("reservationNumber", e.target.value)} className="max-w-[280px]" disabled={roMode} />
                </div>
              </div>

              {/* Check-in / Check-out */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Check-in / Check-out</div>
                  {periodoDaEscalaPorExtenso && (
                    <div className="flex items-center gap-2.5">
                      {/* O período dito por extenso: "de 11/09 a 15/09/2026" é o
                          que o operador precisa conferir, e ele estava só
                          implícito nos campos já preenchidos. */}
                      <span className="text-[12px] text-[#64748B]" data-testid="periodo-da-escala">
                        Escala: {periodoDaEscalaPorExtenso}
                      </span>
                      {!roMode && (
                        <button
                          type="button"
                          onClick={usarPeriodoDaEscala}
                          className="h-[26px] px-2.5 rounded-lg border border-border bg-card text-[12px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                          data-testid="button-usar-periodo-escala"
                        >
                          Usar o período da escala
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-green-100 bg-green-50/40 p-3">
                    <div className="text-[10px] font-bold text-green-700 uppercase tracking-[0.06em] mb-2 flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Check-in *</div>
                    <div className="grid grid-cols-[1fr_110px] gap-2">
                      <div>
                        <Label htmlFor={`checkInDate-${inclusion.id}`} className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 block">Data</Label>
                        <Input id={`checkInDate-${inclusion.id}`} type="date" value={draft.checkInDate}
                          onChange={(e) => set("checkInDate", e.target.value)} data-testid="input-checkin-date" disabled={roMode} />
                      </div>
                      <div>
                        <Label htmlFor={`checkInTime-${inclusion.id}`} className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 block">Hora</Label>
                        <Input id={`checkInTime-${inclusion.id}`} type="time" value={draft.checkInTime}
                          onChange={(e) => set("checkInTime", e.target.value)} data-testid="input-checkin-time" disabled={roMode} />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                    <div className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.06em] mb-2 flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Check-out *</div>
                    <div className="grid grid-cols-[1fr_110px] gap-2">
                      <div>
                        <Label htmlFor={`checkOutDate-${inclusion.id}`} className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 block">Data</Label>
                        <Input id={`checkOutDate-${inclusion.id}`} type="date" min={draft.checkInDate || undefined} value={draft.checkOutDate}
                          onChange={(e) => set("checkOutDate", e.target.value)} data-testid="input-checkout-date" disabled={roMode} />
                      </div>
                      <div>
                        <Label htmlFor={`checkOutTime-${inclusion.id}`} className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 block">Hora</Label>
                        <Input id={`checkOutTime-${inclusion.id}`} type="time" value={draft.checkOutTime}
                          onChange={(e) => set("checkOutTime", e.target.value)} data-testid="input-checkout-time" disabled={roMode} />
                      </div>
                    </div>
                  </div>
                </div>
                {!isCheckOutAfterCheckIn(draft) && (
                  <p className="mt-2 text-[12px] text-red-600 flex items-center gap-1.5" role="alert">
                    <AlertCircle className="w-3.5 h-3.5" /> O check-out deve ser igual ou posterior ao check-in.
                  </p>
                )}
                {chegaTarde && (
                  <p className="mt-2 text-[12px] text-[#92400E] bg-[#FEF3C7] rounded-xl px-3 py-2" role="alert" data-testid="aviso-chegada-tardia">
                    O check-in é depois do início da escala ({formatDate(escalaInicio)}) — a pessoa fica sem hotel na primeira noite.
                  </p>
                )}
                {diariasDoRascunho > 0 && (
                  <p className="mt-2 text-[12px] text-[#64748B]" data-testid="impacto-no-planejado">
                    {diariasDoRascunho} {diariasDoRascunho === 1 ? "diária" : "diárias"} neste período.
                    O valor da diária e o total são preenchidos no Espelho Operacional.
                  </p>
                )}
              </div>

              {/* Dados do Espelho Operacional — só leitura: quem preenche é a Logística. */}
              {accommodation && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4" data-testid="mirror-readonly-block">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Dados do Espelho Operacional</div>
                    <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Somente leitura — editado no Espelho</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Field label="Tipo de quarto">{accommodation.roomType ? (ROOM_TYPE_LABEL[accommodation.roomType] ?? accommodation.roomType) : "—"}</Field>
                    <Field label="Diárias">{accommodation.nightsCount ?? "—"}</Field>
                    <Field label="Valor da diária">{brl(accommodation.dailyRate)}</Field>
                    <Field label="Total">{brl(accommodation.totalCents)}</Field>
                    <Field label="OC do hotel" mono>{accommodation.hotelOc || "—"}</Field>
                  </div>
                </div>
              )}

              {/* Observações */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Label htmlFor={`accommodationObservations-${inclusion.id}`} className={FIELD_LBL}>Observações</Label>
                <Textarea id={`accommodationObservations-${inclusion.id}`} placeholder="Informações adicionais sobre a hospedagem..." value={draft.accommodationObservations}
                  onChange={(e) => set("accommodationObservations", e.target.value)} className="h-24 resize-none" data-testid="textarea-observations" disabled={roMode} />
              </div>

              {/*
                Em leitura o card do voucher não aparece, mas os anexos ainda
                precisam ser vistos — é onde está o comprovante da reserva.
              */}
              {roMode && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Anexos</span>
                  </div>
                  <div className="p-4">
                    <AttachmentUpload attachmentIds={draft.attachmentIds} onAttachmentsChange={(ids) => set("attachmentIds", ids)} disabled />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ══ ABA: COMPLEMENTOS ══ */}
          <TabsContent value="complementos" className="m-0 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Comentários */}
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-slate-400" />
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Comentários</span>
                      {comments && comments.length > 0 && (
                        <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{comments.length}</span>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowComments(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:text-primary-hover transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" />
                      {roMode ? "Ver" : "Ver/Adicionar"}
                    </button>
                  </div>
                  <div className="p-4">
                    {comments && comments.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {comments.map((comment) => (
                          <div key={comment.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                            <div className="flex justify-between items-center mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-black shrink-0">
                                  {userName(comment.userId).charAt(0).toUpperCase()}
                                </div>
                                <div className="text-[12px] font-bold text-slate-700">{userName(comment.userId)}</div>
                              </div>
                              <div className="text-[10px] text-slate-400">{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString("pt-BR") : ""}</div>
                            </div>
                            <div className="text-[12px] text-slate-600 leading-relaxed">{comment.content}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                        <MessageCircle className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                        <div className="text-[12px] text-slate-400">Nenhum comentário registrado.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Histórico */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-slate-400" />
                  <span className="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">Histórico</span>
                  {sortedLogs.length > 0 && <span className="text-[10px] text-slate-400">{sortedLogs.length} entr.</span>}
                </div>
                {sortedLogs.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                    <History className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                    <div className="text-[12px] text-slate-400">Nenhum histórico encontrado.</div>
                  </div>
                ) : (
                  <div>
                    <div className="border-l-2 border-slate-100 ml-3 pl-4 space-y-2 max-h-72 overflow-y-auto">
                      {visibleLogs.map((log) => {
                        const meta = LOG_ACTIONS[log.action];
                        const Icon = meta?.icon ?? History;
                        return (
                          <div key={log.id} className="flex gap-3">
                            <div className="w-2.5 h-2.5 bg-primary rounded-full -ml-[1.3rem] mt-2.5 flex-shrink-0 ring-4 ring-white" />
                            <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5"><Icon className="w-3 h-3 text-slate-400" />{meta?.label ?? log.action}</div>
                                <div className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                                  {log.createdAt && new Date(log.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                              {log.details && <div className="text-[11px] text-slate-500 mt-0.5">{log.details}</div>}
                              <div className="text-[10px] font-semibold mt-1 text-primary">↳ {log.userName}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!showAllLogs && sortedLogs.length > 5 && (
                      <button type="button" onClick={() => setShowAllLogs(true)} className="text-xs font-medium mt-2 ml-7 hover:underline text-primary">
                        Ver todos ({sortedLogs.length - 5} mais)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* ─── FOOTER ─── */}
      <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-white">
        {eventLocked && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-[12px] text-amber-700" data-testid="footer-past-event-block">
            <Lock className="w-3.5 h-3.5" /> {eventLockMessage || PAST_EVENT_BLOCK_MSG}
          </span>
        )}
        {!eventLocked && lockedForRole && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-[12px] text-slate-500">
            <Lock className="w-3.5 h-3.5" /> Somente Compras altera hospedagem registrada
          </span>
        )}
        <Button variant="outline" onClick={onClose} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium">
          Fechar
        </Button>
        {!roMode && (
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-register"
            className="flex items-center gap-2 text-white rounded-xl px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700">
            {isSaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Hotel className="w-4 h-4" />}
            {accommodation ? "Atualizar Hospedagem" : "Registrar Hospedagem"}
          </Button>
        )}
      </div>

      {showComments && (
        <CommentsModal open={showComments} onClose={() => setShowComments(false)} teamInclusionId={inclusion.id} />
      )}
    </DialogContent>
  );
}
