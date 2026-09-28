/**
 * Validação, prévia e envio da Sugestão de escala (25/09 — extraído da página).
 *
 * Deriva as pendências da grade, decompõe as linhas em vagas, envia em lote e
 * cancela o envio; também é dono do estado "pós-envio" (faixa verde, prévia,
 * painel de logística aberto) — o que o rascunho zera ao trocar de evento.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/utils";
import { summarizeCancelableSuggestions } from "@shared/scaling-validation-rules";
import { LOGISTICS_PANEL_DOM_ID, rowDomId } from "@/components/scaling-validation/suggestion-grid";
import { decomposeGridRows, summarizeGrid, validateGridRow, type RowValidation } from "@/components/scaling-validation/scaling-grid-utils";
import { SUGGESTIONS_QUERY_KEY, invalidateScalingQueries, type ApiError, type SuggestionRow } from "@/components/scaling-validation/types";
import { LIVE_DEBOUNCE_MS, MAX_VAGAS, VAGAS_WARN, plural, type Pendencia, type SentInfo } from "./suggestion-shared";
import type { SuggestionDraft } from "./use-suggestion-draft";

type Toast = (t: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export interface UseSuggestionSendArgs {
  draft: SuggestionDraft;
  eventId: string;
  selectedEvent: Event | undefined;
  canAccess: boolean;
  readOnly: boolean;
  toast: Toast;
}

export function useSuggestionSend({ draft, eventId, selectedEvent, canAccess, readOnly, toast }: UseSuggestionSendArgs) {
  const { rows, setRows, dates, draftKey, eventObservations, loadedObsRef, eventIdRef, periodError, setDraftSavedAt } = draft;
  const queryClient = useQueryClient();
  const [confirmSend, setConfirmSend] = useState(false);
  /** ConfirmDialog do "Cancelar envio" (remove todas as vagas já enviadas do evento). */
  const [confirmCancelSend, setConfirmCancelSend] = useState(false);
  const [sent, setSent] = useState<SentInfo | null>(null);
  /** Prévia das vagas sob demanda (painel colado acima da barra de envio). */
  const [previewOpen, setPreviewOpen] = useState(false);
  /** Linha com o painel de logística aberto — mora aqui para o "Corrigir" conseguir abri-lo. */
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  /** Painel de revisão: mostra REVIEW_PREVIEW itens; "Ver mais N" abre o resto. */
  const [showAllReview, setShowAllReview] = useState(false);
  /** Texto anunciado ao leitor de tela (contagem da grade), atualizado com debounce. */
  const [liveText, setLiveText] = useState("");

  /** O que o rascunho chama ao carregar um evento novo. */
  const resetAfterEventChange = useCallback(() => {
    setSent(null); setPreviewOpen(false); setOpenRowId(null); setShowAllReview(false);
  }, []);

  // Vagas que este evento JÁ tem na Validação de Escala. A tela de sugestão não
  // consultava isto: montava a grade do zero mesmo quando o envio anterior
  // estava lá inteiro, e o usuário só descobria o envio duplicado depois.
  const sentQuery = useQuery<SuggestionRow[]>({
    // Chave PRÓPRIA ("de-evento") — a Validação guarda o modo "todos os
    // eventos" em [SUGGESTIONS_QUERY_KEY, ""], e sem este prefixo esta tela lia
    // aquele cache quando ficava sem evento escolhido: o aviso acendia com a
    // contagem do app inteiro e o "Cancelar envio" saía sem eventId.
    queryKey: [SUGGESTIONS_QUERY_KEY, "de-evento", eventId],
    queryFn: async () => (await apiRequest("GET", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(eventId)}`)).json(),
    enabled: !!eventId && canAccess,
  });

  // ── Validação ──
  const issuesByRow = useMemo(() => {
    const m = new Map<string, RowValidation>();
    for (const r of rows) {
      const v = validateGridRow(r);
      if (v.errors.length || v.warnings.length) m.set(r.rowId, v);
    }
    return m;
  }, [rows]);
  // Função e problema separados desde a origem: o painel de revisão e os toasts
  // montam "Função: problema" cada um do seu jeito, sem cortar string.
  const pendencias = useMemo(() => {
    const errors: Pendencia[] = [];
    const warnings: Pendencia[] = [];
    for (const r of rows) {
      const v = issuesByRow.get(r.rowId);
      if (!v) continue;
      for (const e of v.errors) errors.push({ rowId: r.rowId, funcao: r.functionName, problema: e });
      for (const w of v.warnings) warnings.push({ rowId: r.rowId, funcao: r.functionName, problema: w });
    }
    return { errors, warnings };
  }, [rows, issuesByRow]);
  /**
   * Leva o usuário à linha. Tudo que `validateGridRow` aponta hoje é de
   * LOGÍSTICA (horário, data de volta, passagem sem data) — então o "Corrigir"
   * abre o painel de logística da linha e foca o primeiro campo; a célula de
   * quantidade só recebe o foco quando o alvo é a grade em si.
   */
  const focusRow = (rowId: string, target: "qty" | "logistica" = "qty") => {
    const el = document.getElementById(rowDomId(rowId));
    if (target === "logistica") {
      setOpenRowId(rowId);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      // O cartão já pode estar aberto nesta mesma linha (a grade só foca ao
      // MUDAR de linha): garante foco e rolagem no próximo frame, após o commit.
      requestAnimationFrame(() => {
        const panel = document.getElementById(LOGISTICS_PANEL_DOM_ID);
        const first = panel?.querySelector<HTMLElement>("input, button, select");
        first?.focus({ preventScroll: true });
        panel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      return;
    }
    const input = el?.querySelector<HTMLInputElement>("input[data-qty-cell]");
    (input ?? el)?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus();
  };
  /** Clique no motivo do bloqueio: leva à primeira linha com erro (ou aviso). */
  const focusFirstIssue = () => { const alvo = pendencias.errors[0] ?? pendencias.warnings[0]; if (alvo) focusRow(alvo.rowId, "logistica"); };

  const records = useMemo(() => decomposeGridRows(rows, dates), [rows, dates]);
  const summary = useMemo(() => summarizeGrid(rows, dates), [rows, dates]);
  // Só agrupa quando a prévia está aberta: a decomposição já roda a cada tecla,
  // e o agrupamento por linha não precisa rodar junto para um painel fechado.
  const previewGroups = useMemo(() => {
    const groups: { key: string; functionName: string; records: typeof records }[] = [];
    if (!previewOpen) return groups;
    const idx = new Map<string, number>();
    for (const rec of records) {
      const key = `${rec.functionId}-${rec.rowOrder}`;
      let i = idx.get(key);
      if (i === undefined) { i = groups.length; idx.set(key, i); groups.push({ key, functionName: rec.functionName, records: [] }); }
      groups[i].records.push(rec);
    }
    return groups;
  }, [records, previewOpen]);
  // Prévia sem vagas não tem o que mostrar: fecha sozinha ao esvaziar a grade.
  useEffect(() => { if (records.length === 0 && previewOpen) setPreviewOpen(false); }, [records.length, previewOpen]);
  // Linha aberta no painel de logística foi removida: fecha o painel.
  useEffect(() => { if (openRowId && !rows.some((r) => r.rowId === openRowId)) setOpenRowId(null); }, [rows, openRowId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Cópias do que está sendo enviado: o onSuccess compara com o evento
      // ATUAL e só limpa a grade/rascunho se ainda for o mesmo — trocar de
      // evento durante o POST (pela URL) destruía o rascunho do evento novo.
      const forEvent = eventId;
      const forKey = draftKey;
      const forName = selectedEvent?.name ?? "";
      const sentRecords = records;
      const sentObs = eventObservations;
      // Só envia os comentários se mudaram em relação ao evento carregado (undefined = servidor não mexe).
      const payload = {
        eventId,
        ...(eventObservations !== loadedObsRef.current ? { eventObservations } : {}),
        rows: records.map((r) => ({
          functionId: r.functionId,
          workDays: r.workDays,
          dailyRates: r.dailyRates,
          needsTicket: r.needsTicket,
          needsAccommodation: r.needsAccommodation,
          transportModeIda: r.transportModeIda,
          transportModeVolta: r.transportModeVolta,
          flightDepartureDate: r.flightDepartureDate,
          flightArrivalSuggestedTime: r.flightArrivalSuggestedTime,
          flightReturnDate: r.flightReturnDate,
          flightReturnSuggestedTime: r.flightReturnSuggestedTime,
          observations: r.observations,
        })),
      };
      const res = await apiRequest("POST", "/api/scaling-suggestions/bulk", payload);
      const data = (await res.json()) as { created: number };
      return { ...data, forEvent, forKey, forName, sentRecords, sentObs };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [SUGGESTIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [`${SUGGESTIONS_QUERY_KEY}/event-view`] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      // Quebra por função para a faixa pós-envio (calculada antes de limpar a grade).
      const byFunction: SentInfo["byFunction"] = [];
      const byIdx = new Map<string, number>();
      for (const r of data.sentRecords) {
        const i = byIdx.get(r.functionName);
        if (i === undefined) { byIdx.set(r.functionName, byFunction.length); byFunction.push({ name: r.functionName, count: 1 }); }
        else byFunction[i].count++;
      }
      // O rascunho do evento ENVIADO sai sempre; a grade em tela só é limpa se
      // ainda é a desse evento.
      if (data.forKey) localStorage.removeItem(data.forKey);
      setConfirmSend(false);
      if (data.forEvent === eventIdRef.current) {
        // Comentários já foram gravados no evento: passam a ser a base "carregada".
        loadedObsRef.current = data.sentObs;
        setRows([]);
        setPreviewOpen(false);
        setOpenRowId(null);
        setDraftSavedAt(null);
        setSent({ created: data.created, eventId: data.forEvent, eventName: data.forName, byFunction });
      }
      toast({ title: "Escala enviada para validação", description: `${plural(data.created, "vaga criada e enviada", "vagas criadas e enviadas")} às áreas${data.forName ? ` (${data.forName})` : ""}.` });
    },
    onError: (err: ApiError) => {
      setConfirmSend(false);
      toast({ title: "Não foi possível enviar", description: apiErrorMessage(err, "Nenhuma vaga foi criada. Revise a grade e tente novamente."), variant: "destructive" });
    },
  });
  // ── Cancelar envio ──
  // Resumo do que já está na Validação (a mesma regra do servidor decide o que
  // entra na conta: pendente, validada e com pedido — nunca o que virou
  // Inclusão nem o que foi negado).
  const sentSummary = useMemo(() => summarizeCancelableSuggestions(sentQuery.data ?? []), [sentQuery.data]);
  // O aviso anti-duplicação não pode falhar em silêncio: enquanto não se sabe o
  // que este evento JÁ tem na Validação (consulta falhou ou ainda carregando),
  // o Enviar fica bloqueado — enviar às cegas poderia duplicar a escala inteira.
  const sentCheckFailed = !!eventId && sentQuery.isError;
  const sentCheckLoading = !!eventId && sentQuery.isLoading;
  const sendBlocked = sentCheckFailed || sentCheckLoading;

  const cancelSendMutation = useMutation({
    mutationFn: async () => {
      // Rede de segurança: sem evento o servidor responderia "eventId é
      // obrigatório", e o usuário levaria a culpa por um estado da tela.
      if (!eventId) throw new Error("Escolha o evento antes de cancelar o envio.");
      const res = await apiRequest("DELETE", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(eventId)}`);
      return (await res.json()) as { removed: number; requestsCanceled: number };
    },
    onSuccess: (data) => {
      invalidateScalingQueries(queryClient);
      setConfirmCancelSend(false);
      setSent(null); // libera a barra de ação: a tela volta a permitir montar e enviar
      toast({
        title: data.removed > 0 ? "Envio cancelado" : "Nada para cancelar",
        description: data.removed > 0
          ? `${plural(data.removed, "vaga removida", "vagas removidas")} da Validação${data.requestsCanceled > 0 ? ` e ${plural(data.requestsCanceled, "pedido encerrado", "pedidos encerrados")}` : ""}. Monte a grade de novo e envie quando quiser.`
          : "Este evento não tem mais vagas em validação — a lista já estava vazia.",
      });
    },
    onError: (err: ApiError) => {
      setConfirmCancelSend(false);
      toast({
        title: "Não foi possível cancelar o envio",
        description: apiErrorMessage(err, "Nenhuma vaga foi removida. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // "busy" trava a edição: enquanto envia OU em modo leitura.
  const busy = sendMutation.isPending || readOnly;

  const openConfirmSend = () => {
    if (!eventId) { toast({ title: "Selecione o evento", variant: "destructive" }); return; }
    if (sendBlocked) {
      toast({
        title: "Não dá para enviar ainda",
        description: sentCheckFailed
          ? "Não foi possível verificar se este evento já tem vagas enviadas. Use “Tentar novamente” no aviso acima antes de enviar."
          : "Verificando se este evento já tem vagas enviadas — aguarde um instante.",
        variant: "destructive",
      });
      return;
    }
    if (records.length === 0) { toast({ title: "Grade vazia", description: "Informe ao menos uma quantidade na grade.", variant: "destructive" }); return; }
    if (records.length > MAX_VAGAS) {
      toast({ title: `Acima do limite de ${MAX_VAGAS} vagas`, description: `A grade tem ${records.length} vagas. Reduza as quantidades ou divida o envio.`, variant: "destructive" });
      return;
    }
    if (pendencias.errors.length > 0) {
      const texts = pendencias.errors.map((e) => `${e.funcao}: ${e.problema}`);
      toast({ title: "Revise a grade", description: texts.slice(0, 3).join(" · ") + (texts.length > 3 ? ` (+${texts.length - 3})` : ""), variant: "destructive" });
      focusRow(pendencias.errors[0].rowId, "logistica");
      return;
    }
    setConfirmSend(true);
  };

  const vagasLabel = plural(records.length, "vaga", "vagas");
  const overLimit = records.length > MAX_VAGAS;
  const nearLimit = records.length > VAGAS_WARN;

  // Anúncio da contagem para leitor de tela, com debounce: a região visível
  // era aria-live e cada tecla na grade virava um anúncio inteiro.
  const liveSummary = eventId && rows.length > 0
    ? `${plural(summary.funcoes, "linha", "linhas")}, ${summary.pessoasDia} pessoas-dia, ${vagasLabel}`
    : "";
  useEffect(() => {
    const t = setTimeout(() => setLiveText(liveSummary), LIVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [liveSummary]);

  // O rótulo diz por que NÃO dá para enviar (30/08). Antes o botão anunciava
  // "Enviar 0 vagas" com a grade vazia e continuava clicável com o período
  // inválido — duas promessas que a tela não cumpria.
  const sendLabel = readOnly ? "Somente leitura"
    : sendMutation.isPending ? "Enviando…"
      : sentCheckLoading ? "Verificando envios…"
        : periodError ? "Corrija o período"
          : pendencias.errors.length > 0 ? "Revise para enviar"
            : records.length === 0 ? "Nada para enviar"
              : overLimit ? `Acima do limite de ${MAX_VAGAS} vagas`
                : `Enviar ${vagasLabel}`;
  const sendDisabled = readOnly || records.length === 0 || busy || pendencias.errors.length > 0 || sendBlocked || !!periodError || overLimit;

  /**
   * Por que o envio está travado (ou o que merece um olhar antes dele).
   *
   * Sai da MESMA cadeia de `sendDisabled` e na mesma ordem — um texto com
   * régua própria acabaria dizendo "corrija a grade" enquanto o botão estava
   * bloqueado pelo período.
   */
  const motivoDoBloqueio: { tom: "erro" | "aviso" | "info"; texto: string } | null =
    readOnly ? { tom: "info", texto: "Só Produção e Admin enviam" }
      : sentCheckLoading ? { tom: "info", texto: "Verificando envios deste evento…" }
        : periodError ? { tom: "erro", texto: "O período da grade está inválido" }
          : pendencias.errors.length > 0
            ? { tom: "erro", texto: `${plural(pendencias.errors.length, "linha impede", "linhas impedem")} o envio` }
            : records.length === 0 ? { tom: "info", texto: "Preencha ao menos uma quantidade" }
              : overLimit ? { tom: "erro", texto: `${records.length} vagas — o envio aceita até ${MAX_VAGAS}` }
                : pendencias.warnings.length > 0
                  ? { tom: "aviso", texto: `${plural(pendencias.warnings.length, "aviso", "avisos")} — não travam o envio` }
                  : null;

  return {
    resetAfterEventChange,
    sentQuery, sentSummary, sentCheckFailed, sentCheckLoading,
    issuesByRow, pendencias, focusRow, focusFirstIssue, records, summary, previewGroups,
    sendMutation, cancelSendMutation, busy, openConfirmSend,
    confirmSend, setConfirmSend, confirmCancelSend, setConfirmCancelSend,
    sent, setSent, previewOpen, setPreviewOpen, openRowId, setOpenRowId, showAllReview, setShowAllReview, liveText,
    vagasLabel, overLimit, nearLimit, sendLabel, sendDisabled, motivoDoBloqueio,
  };
}

export type SuggestionSend = ReturnType<typeof useSuggestionSend>;
