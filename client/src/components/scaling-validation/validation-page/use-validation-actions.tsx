/**
 * Ações da Validação de escala (25/09 — extraídas da página): drawer de detalhe,
 * diálogos de pedido, validação (linha, lote e "Validar e próxima"), realce de
 * linhas e a observação para o aprovador. Arquivo .tsx porque o toast do lote
 * parcial leva um botão "Ver quais".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/utils";
import { invalidateScalingQueries, type ApiError, type SuggestionRow, type ValidateResult } from "@/components/scaling-validation/types";
import { AFTER_DRAWER_FALLBACK_MS, AFTER_VALIDATE_MSG, PULSE_LONG_MS, PULSE_MS, vagas } from "./validation-shared";
import type { ValidationData } from "./use-validation-data";
import type { ValidationSelection } from "./use-validation-selection";

export function useValidationActions(data: Pick<ValidationData, "filteredRows" | "rowById" | "validatableAll">, sel: ValidationSelection, eventId: string) {
  const { filteredRows, rowById, validatableAll } = data;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(false);
  /** Vaga alvo dos diálogos de pedido (linha ou seleção única). */
  const [requestTargetId, setRequestTargetId] = useState<string | null>(null);
  const [confirmValidate, setConfirmValidate] = useState(false);
  /**
   * Observação opcional para o aprovador (dono, 24/09) — digitada no diálogo
   * de confirmação, vale para TODAS as vagas do lote. Zerada a cada abertura
   * (`openValidateConfirm`): a nota de um lote não pode vazar para o próximo.
   */
  const [validationNote, setValidationNote] = useState("");
  /** Mensagem do servidor (400) sobre a observação — marca o campo, o diálogo fica aberto. */
  const [validationNoteError, setValidationNoteError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  /** Linhas realçadas por um instante (pedido enviado, "Ver quais" do lote parcial). */
  const [pulseIds, setPulseIds] = useState<ReadonlySet<string>>(() => new Set());
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  /** Ação que espera o drawer terminar de fechar — ver `runAfterDrawer`. */
  const pendingAfterDrawer = useRef<(() => void) | null>(null);
  const afterDrawerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Vaga a abrir no drawer assim que a validação corrente terminar ("Validar e próxima"). */
  const chainNextId = useRef<string | null>(null);
  /** Espelho de `detailId` para os callbacks estáveis (as linhas da tabela são `memo`). */
  const detailIdRef = useRef<string | null>(null);
  detailIdRef.current = detailId;

  // Trocou de evento: fecha detalhe e alvo de pedido (evita agir em vaga que sumiu da lista).
  useEffect(() => { setDetailId(null); setRequestTargetId(null); }, [eventId]);
  useEffect(() => () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    if (afterDrawerTimer.current) clearTimeout(afterDrawerTimer.current);
  }, []);

  const detailRow = detailId ? rowById.get(detailId) ?? null : null;
  /** Alvo dos diálogos de ajuste/exclusão: a linha clicada ou a seleção única. */
  const requestTarget = requestTargetId ? rowById.get(requestTargetId) ?? null : null;

  /** Realça uma ou mais linhas por um instante (a última chamada substitui a anterior). */
  const pulseRows = (ids: (string | null)[], ms = PULSE_MS) => {
    const valid = ids.filter((id): id is string => !!id);
    if (valid.length === 0) return;
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulseIds(new Set(valid));
    pulseTimer.current = setTimeout(() => setPulseIds(new Set()), ms);
  };
  const pulseRow = (id: string | null) => pulseRows([id]);
  /**
   * Pedido enviado: sai da seleção SÓ a vaga que virou pedido (ela deixa de
   * aceitar ações). Pedir ajuste pela LINHA de uma vaga não pode apagar o lote
   * que o usuário montou nas outras.
   */
  const onRequestSent = (inclusionId: string | null) => {
    if (inclusionId) sel.removeFromSelection(inclusionId);
    pulseRow(inclusionId);
  };

  // ── Ações por vaga (linha, card e rodapé do drawer) ──
  // Todas com `useCallback` (04/09): são props das linhas `memo` da tabela —
  // recriadas a cada render, elas anulariam o memo.
  /** Executa a ação pendente que esperava o drawer fechar (idempotente). */
  const flushAfterDrawer = useCallback(() => {
    if (afterDrawerTimer.current) { clearTimeout(afterDrawerTimer.current); afterDrawerTimer.current = null; }
    const fn = pendingAfterDrawer.current;
    pendingAfterDrawer.current = null;
    fn?.();
  }, []);
  /**
   * Abre um diálogo só DEPOIS que o drawer terminou de fechar: dois overlays
   * Radix trocando focus-trap/scroll-lock no mesmo tick deixam a página com o
   * scroll travado. O drawer avisa pelo `onClosed`; o timer é a rede de
   * segurança (animação desligada, remontagem…).
   */
  const runAfterDrawer = useCallback((fn: () => void) => {
    if (!detailIdRef.current) { fn(); return; }
    pendingAfterDrawer.current = fn;
    setDetailId(null);
    if (afterDrawerTimer.current) clearTimeout(afterDrawerTimer.current);
    afterDrawerTimer.current = setTimeout(flushAfterDrawer, AFTER_DRAWER_FALLBACK_MS);
  }, [flushAfterDrawer]);

  /**
   * ÚNICA porta de entrada do diálogo "Validar N vagas?" (linha, drawer,
   * "Validar e próxima" e o botão do lote): zera a observação e o erro antes
   * de abrir. `null` = o lote selecionado; lista = alvo próprio da linha.
   */
  const { setValidateTargetIds } = sel;
  const openValidateConfirm = useCallback((ids: string[] | null) => {
    setValidationNote("");
    setValidationNoteError(null);
    setValidateTargetIds(ids);
    setConfirmValidate(true);
  }, [setValidateTargetIds]);
  /** Validar uma vaga só: mesma confirmação do lote, mas com alvo próprio — a seleção fica intacta. */
  const validateOne = useCallback((row: SuggestionRow) => runAfterDrawer(() => openValidateConfirm([row.id])), [runAfterDrawer, openValidateConfirm]);

  /**
   * "Validar e próxima" (rodapé do drawer): encadeia a fila sem passar pela
   * tabela. A próxima é a PRÓXIMA VALIDÁVEL na lista filtrada e ordenada que
   * está na tela — não a próxima do evento inteiro. Guardada antes de validar,
   * porque depois de validar a vaga atual sai da conta de "pendentes".
   */
  const nextValidatableAfter = (row: SuggestionRow): SuggestionRow | null => {
    const i = filteredRows.findIndex((r) => r.id === row.id);
    if (i < 0) return null;
    for (let j = i + 1; j < filteredRows.length; j++) {
      if (validatableAll.has(filteredRows[j].id)) return filteredRows[j];
    }
    return null;
  };
  const validateAndNext = (row: SuggestionRow) => {
    chainNextId.current = nextValidatableAfter(row)?.id ?? null;
    validateOne(row);
  };
  const openAdjust = useCallback((row: SuggestionRow) => runAfterDrawer(() => { setRequestTargetId(row.id); setAdjustOpen(true); }), [runAfterDrawer]);
  const openDelete = useCallback((row: SuggestionRow) => runAfterDrawer(() => { setRequestTargetId(row.id); setDeleteOpen(true); }), [runAfterDrawer]);
  const openDetail = useCallback((row: SuggestionRow) => setDetailId(row.id), []);

  // ── Validar em massa ──
  const validateMutation = useMutation({
    // `validationNote`: a observação do diálogo, já normalizada (trim; vazia →
    // null) — o servidor aplica a mesma regra e grava o texto em cada vaga do lote.
    mutationFn: async ({ ids, validationNote: note }: { ids: string[]; fromRow: boolean; validationNote: string | null }) =>
      (await apiRequest("POST", "/api/scaling-suggestions/validate", { inclusionIds: ids, validationNote: note })).json() as Promise<ValidateResult>,
    onSuccess: (res, { ids, fromRow }) => {
      invalidateScalingQueries(queryClient);
      // Saem da seleção só as vagas efetivamente validadas — o resto do lote
      // que o usuário montou continua marcado.
      sel.removeManyFromSelection(ids);
      setValidateTargetIds(null);
      setConfirmValidate(false);
      if (fromRow) {
        // "Validar e próxima": abre a próxima vaga no drawer em vez de devolver
        // o usuário para a tabela. Sem próxima, cai no comportamento de sempre.
        const next = chainNextId.current;
        chainNextId.current = null;
        if (next) setDetailId(next); else pulseRow(ids[0] ?? null);
      } else if (topRef.current) {
        // Lote: volta ao topo mantendo filtros — as vagas continuam na lista
        // (agora "aguardando aprovação") e o resumo do topo é o que muda.
        topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      const okN = res.ok?.length ?? 0;
      const skipped = res.skipped ?? [];
      const reasons = Array.from(new Set(skipped.map((s) => s.reason))).slice(0, 3).join(" · ");
      if (okN > 0 && skipped.length > 0) {
        // Resultado PARCIAL num toast só (04/09): dois toasts empilhados (um
        // verde, um vermelho) sobre o mesmo lote confundiam — e o vermelho
        // não dizia QUAIS ficaram de fora. "Ver quais" realça as linhas.
        toast({
          title: `${okN} ${okN === 1 ? "validada" : "validadas"} · ${skipped.length} não ${skipped.length === 1 ? "validada" : "validadas"}`,
          description: reasons,
          action: (
            <ToastAction altText="Realçar na lista as vagas que não foram validadas" onClick={() => pulseRows(skipped.map((s) => s.id), PULSE_LONG_MS)}>
              Ver quais
            </ToastAction>
          ),
        });
      } else if (okN > 0) {
        toast({
          title: `${vagas(okN)} ${okN === 1 ? "validada" : "validadas"}`,
          description: `${okN === 1 ? "Ela segue" : "Elas seguem"} para o aprovador. ${AFTER_VALIDATE_MSG}`,
        });
      } else if (skipped.length > 0) {
        toast({ title: `${vagas(skipped.length)} não ${skipped.length === 1 ? "validada" : "validadas"}`, description: reasons, variant: "destructive" });
      }
    },
    onError: (err: ApiError) => {
      const message = apiErrorMessage(err, "Tente novamente.");
      // 400 = o servidor recusou o corpo (na prática, a observação — ex.: acima
      // de 1000 caracteres). O diálogo FICA aberto com o campo marcado: fechar
      // apagaria o texto que a pessoa acabou de escrever.
      if (err.status === 400) {
        setValidationNoteError(message);
        toast({ title: "Não foi possível validar", description: message, variant: "destructive" });
        return;
      }
      setConfirmValidate(false);
      setValidateTargetIds(null);
      chainNextId.current = null; // a corrente para aqui: nada de abrir a próxima
      toast({ title: "Não foi possível validar", description: message, variant: "destructive" });
    },
  });

  /** Fechar/cancelar o diálogo de validação zera só o alvo — a seleção do lote não é tocada. */
  const onValidateDialogChange = (o: boolean) => {
    setConfirmValidate(o);
    if (!o) { setValidateTargetIds(null); setValidationNoteError(null); chainNextId.current = null; }
  };
  const changeNote = (v: string) => { setValidationNote(v); if (validationNoteError) setValidationNoteError(null); };

  return {
    topRef, adjustOpen, setAdjustOpen, deleteOpen, setDeleteOpen, includeOpen, setIncludeOpen, setRequestTargetId, requestTarget,
    confirmValidate, onValidateDialogChange, validationNote, changeNote, validationNoteError,
    detailId, setDetailId, detailRow, pulseIds, onRequestSent, flushAfterDrawer,
    openValidateConfirm, validateOne, validateAndNext, nextValidatableAfter, openAdjust, openDelete, openDetail, validateMutation,
  };
}

export type ValidationActions = ReturnType<typeof useValidationActions>;
