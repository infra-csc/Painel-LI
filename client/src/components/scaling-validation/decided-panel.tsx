/**
 * "Decididas" — histórico das vagas que JÁ SAÍRAM da fila, dentro da Validação
 * e da Aprovação (pedido do dono, 28/08: "tem que ter histórico de aprovados
 * tanto na aprovação quanto na validação").
 *
 * As duas telas só mostravam o que ainda espera alguém; aprovada, a vaga sumia
 * e a resposta para "cadê a que aprovei agora há pouco?" era outra tela. Este
 * painel lê o MESMO endpoint do Histórico da Escala (event-view) e lista as
 * aprovadas (viraram Inclusão) e as negadas, mais recentes primeiro. É leitura
 * pura — decisão continua nas abas de trabalho.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { CheckCircle2, ChevronRight, ExternalLink, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { scalingHref } from "@/lib/use-scaling-event";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { LoadingState } from "@/components/common/loading-state";
import { EmptyState } from "@/components/common/empty-state";
import { periodLabel } from "./suggestions-list";
import { SuggestionDetailDrawer } from "./suggestion-detail-drawer";
import { SUGGESTIONS_QUERY_KEY, invalidateScalingQueries, type SuggestionRow } from "./types";

/** Como a vaga foi decidida — o servidor lê do log mais recente que decide a vaga (11/09). */
interface DecisaoDaVaga {
  action: string;
  resumo: string;
  comment: string | null;
  byName: string | null;
  at: string | null;
}
/** Linha do event-view (vaga + evento anexado + pedidos da vaga + decisão). */
type EventViewRow = SuggestionRow & { requests?: { id: string }[]; decisao?: DecisaoDaVaga | null };

/** O que a barra de filtros da página aplica aqui (busca, função, área, "minhas funções"). */
export interface FiltroDasDecididas {
  busca: string;
  /** Funções marcadas na barra (15/09: seleção múltipla); null = todas. */
  functionIds: ReadonlySet<string> | null;
  soMinhas: ((r: SuggestionRow) => boolean) | null;
}

/** Rótulo curto do caminho da decisão, pelo log (o "resumo" completo vai no título). */
const CAMINHO_POR_ACAO: Record<string, string> = {
  suggestion_approved: "aprovada pelo aprovador após a validação da área",
  suggestion_rejected: "reprovada pelo aprovador",
  suggestion_returned: "devolvida pelo aprovador para a área",
  suggestion_bypass_approve: "aprovada direto, sem validação da área (vaga parada)",
  suggestion_bypass_reject: "reprovada direto, sem validação da área (vaga parada)",
  change_request_approved: "pedido aprovado como foi enviado",
  change_request_reajustar: "pedido reajustado pelo aprovador",
  change_request_negar: "pedido negado pelo aprovador",
};

interface EventViewResponse {
  suggestions: EventViewRow[];
  inclusions: EventViewRow[];
}

const MAX_LINHAS = 100;

export function DecidedPanel({ eventId, functionNameById, filtro, podeLimpar = false }: {
  /** Evento filtrado na tela ("" = todos os eventos). */
  eventId: string;
  functionNameById: Map<string, string>;
  filtro?: FiltroDasDecididas;
  /** Administrador (14/09): pode excluir da lista as vagas negadas, que não têm mais ação. */
  podeLimpar?: boolean;
}) {
  const query = useQuery<EventViewResponse>({
    queryKey: [`${SUGGESTIONS_QUERY_KEY}/event-view`, eventId || "__todos__"],
    queryFn: async () => {
      const url = eventId
        ? `${SUGGESTIONS_QUERY_KEY}/event-view?eventId=${encodeURIComponent(eventId)}`
        : `${SUGGESTIONS_QUERY_KEY}/event-view`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Erro ao carregar as decididas");
      return r.json();
    },
  });

  /**
   * Detalhe da vaga decidida (04/09): a lista só dizia "aprovada"/"negada" e
   * mandava para o Histórico para ver o resto. A seta abre o mesmo modal de
   * detalhe da Lista, em leitura, com ‹ › percorrendo as decididas.
   */
  const [detailId, setDetailId] = useState<string | null>(null);

  /** Vagas negadas a excluir da lista (uma ou todas as visíveis) — confirma antes. */
  const [limpar, setLimpar] = useState<string[] | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const limparMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      (await apiRequest("POST", SUGGESTIONS_QUERY_KEY + "/limpar-negadas", { ids })).json() as Promise<{ ok: string[]; skipped: { id: string; reason: string }[] }>,
    onSuccess: (r) => {
      invalidateScalingQueries(queryClient);
      setLimpar(null);
      if (r.ok.length > 0) {
        toast({
          title: r.ok.length === 1 ? "Vaga negada excluída da lista" : r.ok.length + " vagas negadas excluídas da lista",
          description: "Saíram das Decididas. O registro continua no histórico.",
        });
      }
      if (r.skipped.length > 0) {
        toast({ title: r.skipped.length + " não excluída(s)", description: r.skipped[0].reason, variant: "destructive" });
      }
    },
    onError: (err: { body?: { message?: string } }) =>
      toast({ title: "Não foi possível excluir", description: err?.body?.message ?? "Tente novamente.", variant: "destructive" }),
  });

  const rows = useMemo(() => {
    const aprovadas = (query.data?.inclusions ?? [])
      .filter((i) => i.status !== "cancelado")
      .map((i) => ({ row: i, decisao: "aprovada" as const }));
    const negadas = (query.data?.suggestions ?? [])
      .filter((i) => i.status === SUGESTAO_STATUS.NEGADA && !i.deletedAt)
      .map((i) => ({ row: i, decisao: "negada" as const }));
    const q = (filtro?.busca ?? "").trim().toLowerCase();
    const qNum = q.replace(/^#/, "");
    const passa = ({ row }: { row: EventViewRow }) => {
      if (filtro?.functionIds && !filtro.functionIds.has(row.functionId)) return false;
      if (filtro?.soMinhas && !filtro.soMinhas(row)) return false;
      if (!q) return true;
      const nome = (functionNameById.get(row.functionId) ?? "").toLowerCase();
      return nome.includes(q) || (qNum !== "" && String(row.inclusionNumber).includes(qNum))
        || (row.observations ?? "").toLowerCase().includes(q)
        || (row.eventName ?? "").toLowerCase().includes(q) || (row.decisao?.byName ?? "").toLowerCase().includes(q);
    };
    const quando = (r: { row: EventViewRow }) => String(r.row.decisao?.at ?? r.row.updatedAt ?? "");
    return [...aprovadas, ...negadas]
      .filter(passa)
      .sort((a, b) => quando(b).localeCompare(quando(a)))
      .slice(0, MAX_LINHAS);
  }, [query.data, filtro, functionNameById]);
  const temFiltro = !!filtro && (filtro.busca.trim() !== "" || !!filtro.functionIds || !!filtro.soMinhas);

  const detailRow = rows.find((r) => r.row.id === detailId)?.row ?? null;
  /** As negadas visíveis (com os filtros da barra) — alvo do "Excluir negadas da lista". */
  const idsNegadas = rows.filter((r) => r.decisao === "negada").map((r) => r.row.id);

  if (query.isLoading) return <LoadingState label="Carregando as vagas decididas…" />;
  if (query.isError) {
    return <EmptyState title="Não foi possível carregar" description="Tente recarregar a página." />;
  }
  if (rows.length === 0 && temFiltro) {
    return <EmptyState variant="filtered" title="Nenhuma vaga decidida com esses filtros" description="Os filtros da barra acima valem aqui também." />;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhuma vaga decidida ainda"
        description={eventId
          ? "Quando o aprovador aprovar ou negar vagas deste evento, elas aparecem aqui."
          : "Quando o aprovador aprovar ou negar vagas, elas aparecem aqui."}
      />
    );
  }

  return (
    <div className="space-y-2">
      {podeLimpar && idsNegadas.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2" data-testid="limpar-negadas">
          <span className="text-2xs text-muted-foreground">Vagas negadas não têm mais ação. Você pode tirá-las desta lista.</span>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg border-danger/25 text-danger hover:bg-danger-soft"
            onClick={() => setLimpar(idsNegadas)} disabled={limparMutation.isPending} data-testid="button-limpar-negadas">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Excluir negadas da lista ({idsNegadas.length})
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Vagas já decididas pelo aprovador</caption>
          <thead className="bg-surface-muted">
            <tr>
              {["Vaga", "Evento", "Período / diárias", "Decisão · como · quem", "Quando"].map((h) => (
                <th key={h} scope="col" className="border-b border-border px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
              <th scope="col" className={cn(podeLimpar ? "w-20" : "w-10", "border-b border-border px-2 py-2")}><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, decisao }) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setDetailId(row.id)}
                    className="group inline-flex items-center rounded-sm text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Ver detalhes da vaga #${row.inclusionNumber}`}
                  >
                    <span className="mr-2 inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-primary">#{row.inclusionNumber}</span>
                    <span className="font-medium text-foreground group-hover:text-primary group-hover:underline">{functionNameById.get(row.functionId) ?? "Sem função"}</span>
                  </button>
                </td>
                <td className="max-w-[260px] whitespace-normal break-words px-3 py-2 text-slate-600" title={row.eventName ?? undefined}>{row.eventName ?? "Sem evento"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums text-slate-700">{periodLabel(row)}</td>
                <td className="max-w-[420px] px-3 py-2">
                  {decisao === "aprovada" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success-soft px-2 py-0.5 text-2xs font-semibold text-success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Aprovada — virou Inclusão
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-danger/25 bg-danger-soft px-2 py-0.5 text-2xs font-semibold text-danger">
                      <XCircle className="h-3 w-3" aria-hidden="true" /> Negada
                    </span>
                  )}
                  {/* Como e por quem (11/09): sem isto toda linha dizia a mesma coisa. */}
                  {row.decisao ? (
                    <div className="mt-1 space-y-0.5 text-xs leading-snug text-slate-600" title={row.decisao.resumo || undefined}>
                      <p className="break-words">
                        {CAMINHO_POR_ACAO[row.decisao.action] ?? row.decisao.resumo}
                        {row.decisao.byName ? <> · por <span className="font-medium text-foreground">{row.decisao.byName}</span></> : null}
                      </p>
                      {row.decisao.comment && (
                        <p className="break-words italic text-muted-foreground">“{row.decisao.comment}”</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Sem registro de quem decidiu.</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatDateBr(row.decisao?.at ?? row.updatedAt) || "Sem data"}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {podeLimpar && decisao === "negada" && (
                    <button
                      type="button"
                      onClick={() => setLimpar([row.id])}
                      disabled={limparMutation.isPending}
                      className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      aria-label={"Excluir da lista a vaga negada #" + row.inclusionNumber}
                      title="Excluir da lista"
                      data-testid={"decidida-excluir-" + row.id}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailId(row.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Abrir detalhes da vaga #${row.inclusionNumber}`}
                    title="Ver detalhes"
                    data-testid={`decidida-detalhe-${row.id}`}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-muted-foreground">
        {rows.length === MAX_LINHAS ? `Mostrando as ${MAX_LINHAS} decisões mais recentes. ` : ""}
        O detalhe completo — quem validou, pedidos e comentários — está no{" "}
        <Link href={scalingHref("/scaling-event-view", eventId)} className={cn("inline-flex items-center gap-1 font-medium text-primary hover:underline")}>
          Histórico da Escala <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>.
      </p>
      {/* ConfirmDialog único (23/09): destrutivo → foco no Cancelar, spinner em pending. */}
      <ConfirmDialog
        open={!!limpar}
        onOpenChange={(o) => { if (!o) setLimpar(null); }}
        title={(limpar?.length ?? 0) === 1 ? "Excluir esta vaga negada da lista?" : "Excluir " + (limpar?.length ?? 0) + " vagas negadas da lista?"}
        description="Elas saem das Decididas e não voltam para a escala. O registro continua no histórico, com quem negou, quando e o motivo."
        cancelLabel="Voltar"
        confirmLabel="Excluir da lista"
        tone="danger"
        pending={limparMutation.isPending}
        onConfirm={() => { if (limpar) limparMutation.mutate(limpar); }}
        confirmTestId="button-confirmar-limpar-negadas"
      />
      <SuggestionDetailDrawer
        open={!!detailRow}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        row={detailRow}
        functionName={detailRow ? functionNameById.get(detailRow.functionId) : undefined}
        list={rows.map((r) => r.row)}
        onNavigate={(r) => setDetailId(r.id)}
      />
    </div>
  );
}
