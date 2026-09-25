/**
 * Mutações do espelho operacional (25/09 — extraídas da página).
 *
 * Gravação de célula (com Desfazer), gravação em lote do drawer, e as ações de
 * quarto/Uber (confirmar, reabrir, mover, separar, dispensar, recalcular).
 * Toda mutação invalida a MESMA query: o espelho é uma resposta só.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAvisos } from "./avisos";
import { rotuloCampo } from "./editable-cell";
import { textoDoValor, type CellValue } from "./mirror-shared";

function saveErrorMessage(err: unknown, fallback: string) {
  const e = err as { status?: number; body?: { message?: string } } | null;
  if (e?.status === 401) return "Sua sessão expirou. Entre novamente para continuar editando.";
  if (e?.status === 403) return "Você não tem permissão para editar este registro.";
  return e?.body?.message || fallback;
}

export function useMirrorMutations(eventId: string, mirrorKey: unknown[]) {
  const { toast } = useToast();
  const { avisar } = useAvisos();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: mirrorKey });
  const erro = (title: string, fallback = "Tente novamente em instantes.") => (err: unknown) =>
    toast({ title, description: saveErrorMessage(err, fallback), variant: "destructive" });

  /**
   * Grava uma célula.
   *
   * `anterior` é o valor que estava lá: com ele o toast oferece Desfazer. Sem
   * isso, o único retorno de uma gravação era um fundo verde que some em 1,2s —
   * quem digitou no campo errado descobria depois, sem caminho de volta.
   */
  async function saveCell(rowId: string, field: string, value: CellValue, anterior?: CellValue) {
    try {
      await apiRequest("PATCH", `/api/events/${eventId}/operational-mirror/rows/${rowId}`, { field, value });
    } catch (err) {
      // A célula só piscava em vermelho por 2s e o erro morria aqui. Este aviso
      // não fecha sozinho: gravação recusada precisa ser lida.
      avisar({
        tom: "erro",
        titulo: "Não foi possível salvar",
        texto: saveErrorMessage(err, "A alteração não foi gravada. Verifique sua conexão e tente novamente."),
      });
      throw err; // mantém o destaque de erro na célula
    }
    await invalidate();
    if (anterior !== undefined) {
      avisar({
        tom: "ok",
        titulo: `${rotuloCampo(field)} salvo`,
        texto: `${textoDoValor(anterior)} → ${textoDoValor(value)}`,
        desfazer: { acao: () => { void saveCell(rowId, field, anterior); } },
      });
    }
  }

  async function saveMany(rowId: string, changes: Record<string, CellValue>) {
    // Sequencial de propósito: o servidor faz "busca a linha; se não existir, insere" a
    // cada campo. Em paralelo, dois campos do mesmo bloco liam "não existe" ao mesmo tempo
    // e criavam linhas duplicadas de hospedagem/passagem/custo extra (custo somado em dobro).
    try {
      for (const [field, value] of Object.entries(changes)) {
        await apiRequest("PATCH", `/api/events/${eventId}/operational-mirror/rows/${rowId}`, { field, value });
      }
    } finally {
      // Mesmo com falha no meio do caminho, parte dos campos pode ter sido gravada.
      await invalidate();
    }
  }

  /** Reabrir o carro: confirmar por engano deixava o grupo travado para sempre. */
  const reabrirUber = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/uber-groups/${id}/reabrir`),
    onSuccess: invalidate,
    onError: erro("Não foi possível reabrir", "Tente novamente."),
  });

  /** Dispensar (ou trazer de volta) alguém da roteirização de Uber. */
  const skipUber = useMutation({
    mutationFn: async ({ id, skip }: { id: string; skip: boolean }) =>
      apiRequest("PATCH", `/api/team-inclusions/${id}/skip-uber`, { skipUber: skip }),
    onSuccess: (_r, v) => {
      invalidate();
      toast({
        title: v.skip ? "Fora da roteirização" : "De volta à roteirização",
        description: v.skip
          ? "A pessoa não entra em carro nenhum e não gera custo de Uber. Refaça as sugestões para recalcular os horários dos outros carros."
          : "A pessoa volta a entrar nas sugestões de carro na próxima vez que você refizer as sugestões.",
      });
    },
    onError: erro("Não foi possível alterar", "Tente novamente."),
  });

  /** Estadia de UMA pessoa dentro do quarto (pode diferir do grupo). */
  const patchMembroQuarto = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/hotel-room-group-members/${id}`, campos),
    onSuccess: invalidate,
    onError: erro("Não foi possível salvar a estadia", "Tente novamente."),
  });

  const recalc = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/events/${eventId}/recalculate-logistics-suggestions`)).json(),
    onSuccess: () => { invalidate(); toast({ title: "Sugestões recalculadas", description: "Grupos confirmados foram preservados." }); },
    onError: erro("Erro ao recalcular", "Não foi possível recalcular as sugestões."),
  });
  const confirmRoom = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/hotel-room-groups/${id}/confirm`),
    onSuccess: () => { invalidate(); toast({ title: "Quarto confirmado" }); },
    onError: erro("Não foi possível confirmar o quarto"),
  });
  const patchRoom = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/hotel-room-groups/${id}`, campos),
    onSuccess: invalidate,
    onError: erro("Não foi possível salvar o quarto"),
  });
  const mover = useMutation({
    mutationFn: async ({ tipo, corpo }: { tipo: "quarto" | "uber"; corpo: Record<string, unknown> }) =>
      apiRequest("POST", tipo === "quarto" ? "/api/hotel-room-groups/mover" : "/api/uber-groups/mover", corpo),
    onSuccess: (_d, v) => {
      invalidate();
      toast({ title: v.tipo === "quarto" ? "Pessoa movida de quarto" : "Pessoa movida de carro" });
    },
    onError: erro("Não foi possível mover"),
  });
  const separarQuarto = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/hotel-room-groups/${id}/separar`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Quarto separado", description: "Cada ocupante ficou com um quarto individual." });
    },
    onError: erro("Não foi possível separar"),
  });
  const patchUber = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/uber-groups/${id}`, campos),
    onSuccess: invalidate,
    onError: erro("Não foi possível salvar o carro"),
  });
  const confirmUber = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/uber-groups/${id}/confirm`),
    onSuccess: () => { invalidate(); toast({ title: "Uber confirmado" }); },
    onError: erro("Não foi possível confirmar o Uber"),
  });

  return {
    invalidate, saveCell, saveMany,
    reabrirUber, skipUber, patchMembroQuarto, recalc, confirmRoom, patchRoom, mover, separarQuarto, patchUber, confirmUber,
  };
}

export type MirrorMutations = ReturnType<typeof useMirrorMutations>;
