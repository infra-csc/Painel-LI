/**
 * Modal de Hospedagem — Resumo / Dados / Complementos e Histórico.
 *
 * Desde 25/09 cada aba mora no seu arquivo (`accommodation-modal-resumo`,
 * `-dados`, `-complementos`) e os estilos/rótulos em `-shared`; aqui ficam o
 * estado do rascunho, a validação, o cabeçalho e o rodapé (tinha 699 linhas).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hotel, AlertCircle, Lock, Check } from "lucide-react";
import { useVoucherFill } from "@/components/tickets/use-voucher-fill";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation, Comment, TeamInclusionLog } from "@shared/schema";
import { EMPTY_DRAFT } from "./types";
import type { AccommodationDraft, NormalizedSwap, UserLite } from "./types";
import { draftFrom, fetchSwaps, formatDate, isCheckOutAfterCheckIn, toDateInput } from "./utils";
import { contarDiarias } from "./accommodations-queue";
import { PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";
import { ROTULO_FORA, TAB } from "./accommodation-modal-shared";
import { AccommodationResumoTab } from "./accommodation-modal-resumo";
import { AccommodationDadosTab, type ErrosDaHospedagem } from "./accommodation-modal-dados";
import { AccommodationComplementosTab } from "./accommodation-modal-complementos";

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
  // Erros inline por campo (24/09): antes só um toast genérico "Campos obrigatórios".
  const [erros, setErros] = useState<ErrosDaHospedagem>({});
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
        if (k in EMPTY_DRAFT && k !== "attachmentIds") (meus as Record<string, string>)[k] = typeof v === "string" ? v : String(v ?? "");
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
    const novosErros: typeof erros = {};
    if (!draft.hotelName.trim()) novosErros.hotelName = "Informe o nome do hotel.";
    if (!draft.hotelLocation.trim()) novosErros.hotelLocation = "Informe a localização.";
    if (!draft.checkInDate) novosErros.checkInDate = "Informe a data do check-in.";
    if (!draft.checkOutDate) novosErros.checkOutDate = "Informe a data do check-out.";
    else if (!isCheckOutAfterCheckIn(draft)) novosErros.checkOutDate = "O check-out deve ser igual ou posterior ao check-in.";
    setErros(novosErros);
    const primeiro = (Object.keys(novosErros) as Array<keyof typeof novosErros>)[0];
    if (primeiro) {
      toast({ title: "Preencha os campos obrigatórios", description: novosErros[primeiro], variant: "destructive" });
      setActiveTab("dados");
      setTimeout(() => document.getElementById(`${primeiro}-${inclusion.id}`)?.focus(), 0);
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
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success-soft text-success text-2xs font-bold rounded-full border border-success/25">
      <span className="w-1.5 h-1.5 rounded-full bg-success-strong" />Registrada
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning-soft text-warning text-2xs font-bold rounded-full border border-warning/25">
      <span className="w-1.5 h-1.5 rounded-full bg-warning-strong animate-pulse motion-reduce:animate-none" />Pendente
    </span>
  );

  const sortedLogs = (logs ?? []).slice().sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <DialogContent className="!max-w-[1100px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
      <DialogHeader className="sr-only">
        <DialogTitle>Registro de Hospedagem</DialogTitle>
        <DialogDescription>Modal de hospedagem</DialogDescription>
      </DialogHeader>

      {/* ─── HEADER ─── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-4 bg-brand-soft border-b border-border">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-1 shrink-0 bg-primary">
          <Hotel className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-foreground leading-tight">Registro de Hospedagem</h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
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
        <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-3" data-testid="progresso-obrigatorios">
          <div
            className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={preenchidos}
            aria-valuemin={0}
            aria-valuemax={obrigatorios.length}
            aria-label="Campos obrigatórios preenchidos"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${preenchidos === obrigatorios.length ? "bg-success" : "bg-primary"}`}
              style={{ width: `${(preenchidos / obrigatorios.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {preenchidos} de {obrigatorios.length} campos obrigatórios
          </span>
        </div>
      )}

      {/* ─── ABAS ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="px-6 border-b border-border shrink-0">
          <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
            <TabsTrigger value="resumo" className={TAB}>Resumo</TabsTrigger>
            <TabsTrigger value="dados" className={TAB}>
              Dados da Hospedagem
              {accommodation
                ? <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-success-soft text-success rounded-full"><Check className="w-2.5 h-2.5" aria-hidden="true" /><span className="sr-only"> (registrada)</span></span>
                : <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-warning-soft text-warning rounded-full"><AlertCircle className="w-2.5 h-2.5" aria-hidden="true" /><span className="sr-only"> (pendente)</span></span>}
            </TabsTrigger>
            <TabsTrigger value="complementos" className={TAB}>Complementos e Histórico</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <AccommodationResumoTab
            inclusion={inclusion} accommodation={accommodation} event={event} func={func} collaborator={collaborator}
            collaboratorById={collaboratorById} swaps={swaps} isPurchasingRole={isPurchasingRole}
          />
          <AccommodationDadosTab
            inclusion={inclusion} accommodation={accommodation} draft={draft} set={set} erros={erros} setErros={setErros} roMode={roMode}
            eventLocked={eventLocked} eventLockMessage={eventLockMessage} lockedForRole={lockedForRole} isPostPurchase={isPostPurchase} isPurchasingRole={isPurchasingRole}
            voucher={voucher} periodoDaEscalaPorExtenso={periodoDaEscalaPorExtenso} usarPeriodoDaEscala={usarPeriodoDaEscala}
            chegaTarde={chegaTarde} escalaInicio={escalaInicio} diariasDoRascunho={diariasDoRascunho}
          />
          <AccommodationComplementosTab
            comments={comments} userName={userName} roMode={roMode} onShowComments={() => setShowComments(true)}
            sortedLogs={sortedLogs} showAllLogs={showAllLogs} setShowAllLogs={setShowAllLogs}
          />
        </div>
      </Tabs>

      {/* ─── FOOTER ─── */}
      <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 shrink-0 bg-card">
        {eventLocked && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-warning" data-testid="footer-past-event-block">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" /> {eventLockMessage || PAST_EVENT_BLOCK_MSG}
          </span>
        )}
        {!eventLocked && lockedForRole && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Somente Compras altera hospedagem registrada
          </span>
        )}
        <Button variant="outline" onClick={onClose} className="border border-border text-slate-600 hover:bg-surface-muted rounded-xl px-5 py-2 text-sm font-medium">
          Fechar
        </Button>
        {!roMode && (
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-register"
            className="flex items-center gap-2 text-white rounded-xl px-5 py-2 text-sm font-bold bg-success hover:bg-success/90">
            {isSaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Hotel className="w-4 h-4" aria-hidden="true" />}
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
