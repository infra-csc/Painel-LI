/**
 * Cartão "Histórico" do detalhe da vaga sugerida (25/09 — extraído de
 * suggestion-detail-drawer.tsx): linha do tempo dos logs, com a última entrada
 * marcada como "agora" e o de → para em pt-BR.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { TEAM_INCLUSIONS_QUERY_KEY, type InclusionLog, type SuggestionRow } from "./types";
import { Card, LOG_ACTION_LABELS, describeSuggestedVaga, fmtDateTime, valueText } from "./suggestion-detail-helpers";

export function SuggestionHistoryCard({ row, open }: { row: SuggestionRow; open: boolean }) {
  const logsQuery = useQuery<InclusionLog[]>({
    queryKey: [TEAM_INCLUSIONS_QUERY_KEY, row.id, "logs"],
    queryFn: async () => (await apiRequest("GET", `${TEAM_INCLUSIONS_QUERY_KEY}/${row.id}/logs`)).json(),
    enabled: open && !!row.id,
    staleTime: 30_000,
  });
  return (
    <Card id="det-hist" title="Histórico" icon={History}>
      {logsQuery.isLoading ? (
        <div className="space-y-2" role="status" aria-label="Carregando histórico">
          <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" />
        </div>
      ) : logsQuery.isError ? (
        <p className="text-xs text-muted-foreground">Não foi possível carregar o histórico.</p>
      ) : !logsQuery.data?.length ? (
        // Sem log gravado, a linha do tempo mostra o único fato que
        // existe — a vaga sugerida —, descrevendo a própria vaga.
        // Nunca entradas fixas de devolução/ajuste: afirmariam
        // evento que não aconteceu.
        <ol className="relative ml-1.5 space-y-3 border-l border-border">
          <li className="ml-4">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white bg-slate-300" aria-hidden="true" />
            <p className="text-sm text-foreground">{describeSuggestedVaga(row)}</p>
            {row.suggestionSentAt && (
              <p className="mt-0.5 text-2xs text-muted-foreground">{fmtDateTime(row.suggestionSentAt)}</p>
            )}
          </li>
        </ol>
      ) : (
        <ol className="relative ml-1.5 space-y-3 border-l border-border">
          {logsQuery.data.map((log, i) => {
            const before = valueText(log.previousValue);
            const after = valueText(log.newValue);
            const phrase = log.details?.trim() || LOG_ACTION_LABELS[log.action] || "Atualização da vaga";
            // A última entrada é onde a vaga está: marcá-la evita
            // ler a trilha inteira para descobrir o presente.
            const agora = i === logsQuery.data!.length - 1;
            return (
              <li key={log.id} className="ml-4">
                <span className={cn("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white", agora ? "bg-primary" : "bg-slate-300")} aria-hidden="true" />
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                  {/* `whitespace-pre-line`: o log de validação traz a
                      observação numa linha própria ("\nObservação: …"). */}
                  <span className="whitespace-pre-line break-words">{phrase}</span>
                  {agora && <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-primary">agora</span>}
                </p>
                {/* Basta um dos dois lados: campo esvaziado tem "de"
                    sem "para", e guardar tudo pelo "para" fazia o
                    registro sumir inteiro. */}
                {(before || after) && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
                    {before && (
                      <>
                        <span className="line-through decoration-slate-300">{before}</span>
                        {after && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      </>
                    )}
                    {after
                      ? <span className="font-medium text-slate-600">{after}</span>
                      : <span className="italic">(esvaziado)</span>}
                  </p>
                )}
                <p className="mt-0.5 text-2xs text-muted-foreground">{log.userName} · {fmtDateTime(log.createdAt)}</p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
