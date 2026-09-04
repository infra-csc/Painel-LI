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
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, ChevronRight, ExternalLink, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { scalingHref } from "@/lib/use-scaling-event";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { LoadingState } from "@/components/common/loading-state";
import { EmptyState } from "@/components/common/empty-state";
import { periodLabel } from "./suggestions-list";
import { SuggestionDetailDrawer } from "./suggestion-detail-drawer";
import { SUGGESTIONS_QUERY_KEY, type SuggestionRow } from "./types";

/** Linha do event-view (vaga + evento anexado + pedidos da vaga). */
type EventViewRow = SuggestionRow & { requests?: { id: string }[] };

interface EventViewResponse {
  suggestions: EventViewRow[];
  inclusions: EventViewRow[];
}

const MAX_LINHAS = 100;

export function DecidedPanel({ eventId, functionNameById }: {
  /** Evento filtrado na tela ("" = todos os eventos). */
  eventId: string;
  functionNameById: Map<string, string>;
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

  const rows = useMemo(() => {
    const aprovadas = (query.data?.inclusions ?? [])
      .filter((i) => i.status !== "cancelado")
      .map((i) => ({ row: i, decisao: "aprovada" as const }));
    const negadas = (query.data?.suggestions ?? [])
      .filter((i) => i.status === SUGESTAO_STATUS.NEGADA)
      .map((i) => ({ row: i, decisao: "negada" as const }));
    return [...aprovadas, ...negadas]
      .sort((a, b) => String(b.row.updatedAt ?? "").localeCompare(String(a.row.updatedAt ?? "")))
      .slice(0, MAX_LINHAS);
  }, [query.data]);

  const detailRow = rows.find((r) => r.row.id === detailId)?.row ?? null;

  if (query.isLoading) return <LoadingState label="Carregando as vagas decididas…" />;
  if (query.isError) {
    return <EmptyState title="Não foi possível carregar" description="Tente recarregar a página." />;
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
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-[13px]">
          <caption className="sr-only">Vagas já decididas pelo aprovador</caption>
          <thead className="bg-slate-50">
            <tr>
              {["Vaga", "Evento", "Período / diárias", "Decisão", "Quando"].map((h) => (
                <th key={h} scope="col" className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 whitespace-nowrap">{h}</th>
              ))}
              <th scope="col" className="w-10 border-b border-slate-200 px-2 py-2"><span className="sr-only">Detalhes</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, decisao }) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setDetailId(row.id)}
                    className="group inline-flex items-center rounded-sm text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Ver detalhes da vaga #${row.inclusionNumber}`}
                  >
                    <span className="mr-2 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-blue-800">#{row.inclusionNumber}</span>
                    <span className="font-medium text-slate-800 group-hover:text-primary group-hover:underline">{functionNameById.get(row.functionId) ?? "Sem função"}</span>
                  </button>
                </td>
                <td className="max-w-[260px] whitespace-normal break-words px-3 py-2 text-slate-600" title={row.eventName ?? undefined}>{row.eventName ?? "Sem evento"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums text-slate-700">{periodLabel(row)}</td>
                <td className="px-3 py-2">
                  {decisao === "aprovada" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Aprovada — virou Inclusão
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      <XCircle className="h-3 w-3" aria-hidden="true" /> Negada
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{row.updatedAt ? formatDateBr(row.updatedAt) : "Sem data"}</td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setDetailId(row.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <p className="text-[11px] text-slate-500">
        {rows.length === MAX_LINHAS ? `Mostrando as ${MAX_LINHAS} decisões mais recentes. ` : ""}
        O detalhe completo — quem validou, pedidos e comentários — está no{" "}
        <Link href={scalingHref("/scaling-event-view", eventId)} className={cn("inline-flex items-center gap-1 font-medium text-primary hover:underline")}>
          Histórico da Escala <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>.
      </p>
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
