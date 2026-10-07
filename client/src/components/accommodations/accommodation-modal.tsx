/**
 * Modal de Hospedagem — Resumo / Dados / Complementos e histórico.
 *
 * Desde 25/09 cada aba mora no seu arquivo (`accommodation-modal-resumo`,
 * `-dados`, `-complementos`) e os estilos/rótulos em `-shared`; aqui ficam o
 * estado do rascunho, a validação, o cabeçalho e o rodapé (tinha 699 linhas).
 *
 * 07/10 (redesenho): a MESMA moldura do registro de passagem — cabeçalho
 * branco com o ícone em marca, título e situação na mesma linha e, embaixo,
 * "#ID · colaborador · função · evento"; o aviso de alteração aprovada logo
 * abaixo do cabeçalho (com "Já atuei"); o banner de evento encerrado vale para
 * as três abas; o progresso dos obrigatórios mora na faixa das abas; rodapé
 * cinza com "Fechar" e a ação principal na cor da marca (era verde — a única
 * tela da família com o "registrar" em outra cor). No celular, tela cheia.
 */
import { useEffect, useRef, useState } from "react";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, AlertCircle, Lock, Check, Loader2 } from "lucide-react";
import { useVoucherFill } from "@/components/tickets/use-voucher-fill";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation, Comment, TeamInclusionLog } from "@shared/schema";
import { EMPTY_DRAFT } from "./types";
import type { AccommodationDraft, NormalizedSwap, UserLite } from "./types";
import { draftFrom, fetchSwaps, formatDate, isCheckOutAfterCheckIn, toDateInput, toTitleCase } from "./utils";
import { contarDiarias } from "./accommodations-queue";
import { PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";
import { AvisoDaVaga } from "@/components/avisos-de-alteracao/aviso-da-vaga";
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

/**
 * Moldura do modal — a mesma do registro de passagem: 1100px no computador;
 * no celular ocupa a tela inteira (um modal de 95vw × 88vh com rodapé fixo
 * sobrava 20px de cada lado e cortava o formulário no meio).
 */
const MOLDURA = "!max-w-[1100px] w-[95vw] max-h-[88vh] sm:h-[min(88vh,820px)] !flex !flex-col p-0 gap-0 overflow-hidden max-sm:w-full max-sm:!max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0";

export default function AccommodationModal(props: AccommodationModalProps) {
  const { open, onClose, inclusion, modal = true } = props;
  // 28/09: quem sabe se há rascunho alterado é o conteúdo (que só existe
  // aberto); ele registra aqui a função que decide entre fechar e perguntar.
  // Antes, Esc ou clique fora fechavam e o que foi digitado se perdia.
  const fecharRef = useRef<() => void>(onClose);
  useEffect(() => { if (!open) fecharRef.current = onClose; }, [open, onClose]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) fecharRef.current(); }} modal={modal}>
      {/* Conteúdo montado só com inclusão: o rascunho nasce do registro atual a cada abertura. */}
      {open && inclusion && (
        <AccommodationModalContent
          key={inclusion.id}
          {...props}
          inclusion={inclusion}
          registrarFechamento={(fn) => { fecharRef.current = fn; }}
        />
      )}
    </Dialog>
  );
}

function AccommodationModalContent({
  onClose, inclusion, accommodation, event, func, collaborator, collaboratorById, users,
  canEditRecord, isPurchasingRole, lockedForRole, eventLocked, eventLockMessage, isPostPurchase, isSaving, onSave,
  registrarFechamento,
}: AccommodationModalProps & { inclusion: TeamInclusion; registrarFechamento: (fn: () => void) => void }) {
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
  const [showComments, setShowComments] = useState(false);
  const roMode = !canEditRecord;
  // `tocou` liga em qualquer alteração do rascunho — é o "sujo" do descarte.
  const { pedirParaFechar, Dialogo: DialogoDescarte } = useConfirmarDescarte(tocou && !roMode, { salvando: isSaving });
  const fechar = () => pedirParaFechar(onClose);
  useEffect(() => { registrarFechamento(fechar); });

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

  const { data: comments, isLoading: commentsLoading } = useQuery<Comment[]>({ queryKey: ["/api/comments", inclusion.id] });
  const { data: logs, isLoading: logsLoading } = useQuery<TeamInclusionLog[]>({ queryKey: ["/api/team-inclusions", inclusion.id, "logs"] });
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

  /** Situação no cabeçalho — a mesma pílula de Passagens. */
  const statusPill = accommodation ? (
    <span className="inline-flex items-center gap-1.5 h-[22px] px-2 bg-success-soft text-success text-2xs font-medium rounded-md">
      <span className="w-1.5 h-1.5 rounded-full bg-success-strong" aria-hidden="true" />Registrada
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 h-[22px] px-2 bg-warning-soft text-warning text-2xs font-medium rounded-md">
      <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />Pendente
    </span>
  );
  /** Em leitura, o cabeçalho diz logo — e o porquê fica no título da pílula. */
  const leitura = roMode ? (
    <span
      className="inline-flex items-center gap-1.5 h-[22px] px-2 bg-muted text-muted-foreground text-2xs font-medium rounded-md"
      title={eventLocked ? (eventLockMessage || PAST_EVENT_BLOCK_MSG) : lockedForRole ? "Somente Compras altera hospedagem registrada" : undefined}
    ><Lock className="w-3 h-3" aria-hidden="true" />Somente leitura</span>
  ) : null;
  const nomeDoColaborador = collaborator ? toTitleCase(collaborator.fullName) : "Sem colaborador";
  const contexto = [func?.name, event?.name].filter(Boolean) as string[];
  const completo = preenchidos === obrigatorios.length;

  return (
    <DialogContent aria-describedby={undefined} className={MOLDURA}>
      {/* CABEÇALHO: o que é, de quem, em qual prova — e a situação. */}
      <div className="px-5 sm:px-6 pt-4 pb-3.5 border-b border-border shrink-0 flex items-start gap-3.5 pr-14 bg-card">
        <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-brand-soft text-primary">
          <BedDouble className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Título e situação na mesma linha: a pílula não disputa espaço com o X. */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <DialogTitle className="text-base font-semibold text-foreground leading-6 m-0 p-0">Registro de hospedagem</DialogTitle>
            {statusPill}
            {leitura}
          </div>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground leading-5">
            <span className="font-mono font-semibold text-primary">#{inclusion.inclusionNumber || "N/A"}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="font-medium text-foreground">{nomeDoColaborador}</span>
            {contexto.map((c, i) => (
              <span key={i}><span className="mx-1.5" aria-hidden="true">·</span>{c}</span>
            ))}
          </p>
        </div>
      </div>

      {/* Alteração aprovada depois do registro (07/10): o que mudou + "Já atuei". */}
      <AvisoDaVaga tipo="hospedagem" teamInclusionId={inclusion.id} className="shrink-0 max-h-[34vh] overflow-y-auto" />

      {/* ─── ABAS ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center gap-3 pl-3 sm:pl-4 pr-4 sm:pr-6 border-b border-border shrink-0">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
            <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
              <TabsTrigger value="resumo" className={TAB}>Resumo</TabsTrigger>
              <TabsTrigger value="dados" className={TAB}>
                <span className="sm:hidden">Dados</span><span className="hidden sm:inline">Dados da hospedagem</span>
                {accommodation
                  ? <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-success-soft text-success rounded-full"><Check className="w-2.5 h-2.5" strokeWidth={3} aria-hidden="true" /><span className="sr-only"> (registrada)</span></span>
                  : <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-warning-soft text-warning rounded-full"><AlertCircle className="w-2.5 h-2.5" strokeWidth={3} aria-hidden="true" /><span className="sr-only"> (pendente)</span></span>}
              </TabsTrigger>
              <TabsTrigger value="complementos" className={TAB}>
                <span className="sm:hidden">Complementos</span><span className="hidden sm:inline">Complementos e histórico</span>
              </TabsTrigger>
            </TabsList>
          </div>
          {/*
            Progresso só na aba Dados: fora dela ele contava "0 de 0" e virava
            um indicador que media nada. Mora na faixa das abas (era uma faixa
            própria de 36px entre o cabeçalho e as abas); no celular, só o número.
          */}
          {activeTab === "dados" && !roMode && (
            <div className="pas-entra flex items-center gap-2 shrink-0" data-testid="progresso-obrigatorios">
              <div
                className="hidden sm:block w-20 h-1.5 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={preenchidos}
                aria-valuemin={0}
                aria-valuemax={obrigatorios.length}
                aria-label="Campos obrigatórios preenchidos"
              >
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none ${completo ? "bg-success" : "bg-primary"}`}
                  style={{ width: `${(preenchidos / obrigatorios.length) * 100}%` }}
                />
              </div>
              <span className={`text-2xs tabular-nums whitespace-nowrap ${completo ? "text-success font-medium" : "text-muted-foreground"}`}>
                {completo
                  ? <><Check className="inline w-3 h-3 -mt-px mr-0.5" strokeWidth={3} aria-hidden="true" />Obrigatórios ok</>
                  : <>{preenchidos} de {obrigatorios.length}<span className="hidden sm:inline"> obrigatórios</span></>}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <AccommodationResumoTab
            inclusion={inclusion} accommodation={accommodation} event={event} func={func} collaborator={collaborator}
            collaboratorById={collaboratorById} swaps={swaps} isPurchasingRole={isPurchasingRole}
            onIrParaDados={roMode ? undefined : () => setActiveTab("dados")}
          />
          <AccommodationDadosTab
            inclusion={inclusion} accommodation={accommodation} draft={draft} set={set} erros={erros} setErros={setErros} roMode={roMode}
            eventLocked={eventLocked} eventLockMessage={eventLockMessage} lockedForRole={lockedForRole} isPostPurchase={isPostPurchase} isPurchasingRole={isPurchasingRole}
            voucher={voucher} periodoDaEscalaPorExtenso={periodoDaEscalaPorExtenso} usarPeriodoDaEscala={usarPeriodoDaEscala}
            chegaTarde={chegaTarde} escalaInicio={escalaInicio} diariasDoRascunho={diariasDoRascunho}
          />
          <AccommodationComplementosTab
            comments={comments} commentsLoading={commentsLoading} logs={logs} logsLoading={logsLoading}
            userName={userName} roMode={roMode} onShowComments={() => setShowComments(true)}
          />
        </div>
      </Tabs>

      {/* ─── RODAPÉ ─── */}
      <div className="px-5 sm:px-6 py-3 border-t border-border flex flex-wrap items-center justify-end gap-x-3 gap-y-2 shrink-0 bg-surface-muted">
        {eventLocked && (
          // No celular o banner da aba Dados já diz isso logo acima — o rodapé não repete.
          <span className="mr-auto max-sm:hidden inline-flex items-center gap-1.5 text-xs text-warning" data-testid="footer-past-event-block">
            <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {eventLockMessage || PAST_EVENT_BLOCK_MSG}
          </span>
        )}
        {!eventLocked && lockedForRole && (
          <span className="mr-auto max-sm:hidden inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Somente Compras altera hospedagem registrada
          </span>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fechar} className="h-9 rounded-lg px-4 text-sm font-medium">
            Fechar
          </Button>
          {!roMode && (
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-register"
              className="h-9 flex items-center gap-2 rounded-lg px-4 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground">
              {isSaving
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{accommodation ? "Atualizando…" : "Registrando…"}</>
                : <><Check className="w-4 h-4" aria-hidden="true" />{accommodation ? "Atualizar hospedagem" : "Registrar hospedagem"}</>}
            </Button>
          )}
        </div>
      </div>

      {DialogoDescarte}
      {showComments && (
        <CommentsModal open={showComments} onClose={() => setShowComments(false)} teamInclusionId={inclusion.id} />
      )}
    </DialogContent>
  );
}
