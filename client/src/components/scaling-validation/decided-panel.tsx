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
 *
 * 07/10 (redesenho da Validação): pílulas do StatusBadge único, cabeçalho em
 * caixa de frase, cartões no celular, esqueleto e erro com "Tentar de novo".
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { CheckCircle2, ChevronRight, ClipboardCheck, CloudOff, ExternalLink, SearchX, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { scalingHref } from "@/lib/use-scaling-event";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { StatusBadge } from "@/components/common/status-badge";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "./validation-page/estados";
import { periodLabel } from "./suggestions-list";
import { SuggestionDetailDrawer } from "./suggestion-detail-drawer";
import { SUGGESTIONS_QUERY_KEY, invalidateScalingQueries, type SuggestionRow } from "./types";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

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

  if (query.isLoading) {
    return (
      <div className="space-y-0 overflow-hidden rounded-xl border border-border bg-card" aria-busy="true" data-testid="decididas-carregando">
        <div className="h-10 border-b border-border bg-surface-muted" aria-hidden="true" />
        {[["52%", "40%"], ["64%", "30%"], ["46%", "44%"]].map(([a, b], i) => (
          <div key={i} className="flex items-start gap-4 border-b border-border px-4 py-3.5 last:border-b-0" aria-hidden="true">
            <div className="flex-1 space-y-1.5"><div className="val-osso h-3.5" style={{ width: a }} /><div className="val-osso h-2.5 w-12" /></div>
            <div className="hidden flex-1 md:block"><div className="val-osso h-3" style={{ width: b }} /></div>
            <div className="w-40 space-y-1.5"><div className="val-osso h-5 w-24 rounded-full" /><div className="val-osso h-2.5 w-36" /></div>
          </div>
        ))}
        <p role="status" className="sr-only">Carregando as vagas decididas…</p>
      </div>
    );
  }
  if (query.isError) {
    return (
      <EstadoDaValidacao
        tom="erro"
        icone={<CloudOff aria-hidden="true" />}
        titulo="Não foi possível carregar as decididas"
        texto="A lista do que o aprovador já decidiu não chegou. Tente de novo — se continuar, recarregue a página."
        acao={<BotaoTentarDeNovo onClick={() => query.refetch()} tentando={query.isFetching} />}
        testId="decididas-erro"
      />
    );
  }
  if (rows.length === 0 && temFiltro) {
    return (
      <EstadoDaValidacao
        icone={<SearchX aria-hidden="true" />}
        titulo="Nenhuma vaga decidida com esses filtros"
        texto="Os filtros da barra acima valem aqui também."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EstadoDaValidacao
        icone={<ClipboardCheck aria-hidden="true" />}
        titulo="Nenhuma vaga decidida ainda"
        texto={eventId
          ? "Quando o aprovador aprovar ou negar vagas deste evento, elas aparecem aqui."
          : "Quando o aprovador aprovar ou negar vagas, elas aparecem aqui."}
      />
    );
  }

  /** A pílula da decisão — a mesma na tabela e no cartão. */
  const pilula = (decisao: "aprovada" | "negada") => decisao === "aprovada"
    ? <StatusBadge tone="success" icon={CheckCircle2}>Aprovada — virou Inclusão</StatusBadge>
    : <StatusBadge tone="danger" icon={XCircle}>Negada</StatusBadge>;
  /** Como e por quem (11/09): sem isto toda linha dizia a mesma coisa. */
  const comoEQuem = (row: EventViewRow) => row.decisao ? (
    <div className="mt-1.5 space-y-1 text-xs leading-snug text-slate-600" title={row.decisao.resumo || undefined}>
      <p className="break-words">
        {CAMINHO_POR_ACAO[row.decisao.action] ?? row.decisao.resumo}
        {row.decisao.byName ? <> · por <span className="font-medium text-foreground">{row.decisao.byName}</span></> : null}
      </p>
      {row.decisao.comment && (
        <p className="break-words border-l-2 border-border pl-2 italic text-muted-foreground">“{row.decisao.comment}”</p>
      )}
    </div>
  ) : (
    <p className="mt-1.5 text-xs text-muted-foreground">Sem registro de quem decidiu.</p>
  );
  const quandoTexto = (row: EventViewRow) => formatDateBr(row.decisao?.at ?? row.updatedAt) || "Sem data";
  const botaoExcluir = (row: EventViewRow) => (
    <MotivoDesabilitado motivo="Excluir da lista" desabilitado={limparMutation.isPending}>
      <button
        type="button"
        onClick={() => setLimpar([row.id])}
        disabled={limparMutation.isPending}
        className="val-alvo inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        aria-label={"Excluir da lista a vaga negada #" + row.inclusionNumber}
        data-testid={"decidida-excluir-" + row.id}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </MotivoDesabilitado>
  );
  const botaoDetalhe = (row: EventViewRow) => (
    <button
      type="button"
      onClick={() => setDetailId(row.id)}
      className="val-alvo val-abrir inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Abrir detalhes da vaga #${row.inclusionNumber}`}
      title="Ver detalhes"
      data-testid={`decidida-detalhe-${row.id}`}
    >
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
  /** Nome da função + número — abre o detalhe (o mesmo nas duas formas). */
  const nomeDaVaga = (row: EventViewRow) => (
    <button
      type="button"
      onClick={() => setDetailId(row.id)}
      className="group block max-w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Ver detalhes da vaga #${row.inclusionNumber}`}
    >
      <span className="block break-words text-sm font-semibold leading-5 text-foreground transition-colors group-hover:text-primary">{functionNameById.get(row.functionId) ?? "Sem função"}</span>
      <span className="block font-mono text-2xs tabular-nums text-muted-foreground">#{row.inclusionNumber}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      {podeLimpar && idsNegadas.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted/60 px-3.5 py-2.5 sm:flex-row sm:items-center" data-testid="limpar-negadas">
          <span className="text-xs text-slate-600 sm:mr-auto">Vagas negadas não têm mais ação. Você pode tirá-las desta lista.</span>
          <Button type="button" variant="outline" size="sm" className="val-alvo h-8 rounded-lg border-danger/30 bg-card text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => setLimpar(idsNegadas)} disabled={limparMutation.isPending} data-testid="button-limpar-negadas">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Excluir negadas da lista ({idsNegadas.length})
          </Button>
        </div>
      )}
      {/* Tabela (≥ md) — 07/10: cabeçalho em caixa de frase, linhas pelo topo,
          número da vaga sob o nome (como na Lista). Abaixo de md, cartões:
          a tabela de 760px rolava de lado no celular. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(222_47%_11%/0.04)] md:block">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Vagas já decididas pelo aprovador</caption>
          <thead className="bg-surface-muted">
            <tr>
              {["Vaga", "Evento", "Período / diárias", "Decisão · como · quem", "Quando"].map((h) => (
                <th key={h} scope="col" className="border-b border-border px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap first:pl-4">{h}</th>
              ))}
              <th scope="col" className={cn(podeLimpar ? "w-20" : "w-12", "border-b border-border px-2 py-2")}><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, decisao }) => (
              <tr key={row.id} className="val-linha border-b border-border align-top last:border-0 hover:bg-surface-muted/60">
                <td className="py-3 pl-4 pr-3">{nomeDaVaga(row)}</td>
                <td className="max-w-[240px] whitespace-normal break-words px-3 py-3 text-[13px] text-slate-600" title={row.eventName ?? undefined}>{row.eventName ?? "Sem evento"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-[13px] tabular-nums text-slate-700">{periodLabel(row)}</td>
                <td className="max-w-[420px] px-3 py-3">
                  {pilula(decisao)}
                  {comoEQuem(row)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-muted-foreground">{quandoTexto(row)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  {podeLimpar && decisao === "negada" && botaoExcluir(row)}
                  {botaoDetalhe(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2.5 md:hidden" aria-label="Vagas já decididas pelo aprovador">
        {rows.map(({ row, decisao }) => (
          <li key={row.id} className="val-cartao rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{nomeDaVaga(row)}</div>
              <div className="-mr-2 -mt-1 flex shrink-0 items-center">
                {podeLimpar && decisao === "negada" && botaoExcluir(row)}
                {botaoDetalhe(row)}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              <span className="break-words">{row.eventName ?? "Sem evento"}</span>
              <span className="text-muted-foreground" aria-hidden="true"> · </span>
              <span className="whitespace-nowrap tabular-nums">{periodLabel(row)}</span>
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {pilula(decisao)}
              <span className="text-2xs tabular-nums text-muted-foreground">{quandoTexto(row)}</span>
            </div>
            {comoEQuem(row)}
          </li>
        ))}
      </ul>
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
