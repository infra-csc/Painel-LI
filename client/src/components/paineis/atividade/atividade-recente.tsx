/**
 * Atividade recente (30/10) — o feed das últimas inclusões e mudanças da
 * escala, passagens, hotéis, pedidos de ajuste e trocas, mais recentes
 * primeiro, agrupado por dia.
 *
 * - Fonte: GET /api/paineis/atividade (server/routes/paineis.ts), que monta o
 *   histórico de cada vaga tocada com o MESMO vocabulário do modal da vaga.
 * - Atualiza sozinho a cada 60 s e diz "atualizado há X".
 * - "Novo desde a sua última visita": a marca fica no localStorage por
 *   usuário (comum/ultima-visita.ts) e é gravada ao sair da tela.
 * - "Atrasados" usa a régua do Quadro de prazos (comum/use-base-dos-paineis):
 *   vaga parada numa etapa com o prazo vencido.
 * - Período/evento/tipo/passagem/hotel filtram no servidor; atrasados e não
 *   vistos, aqui. Os filtros vivem na URL (link compartilhável).
 */
import { useCallback, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { CheckCheck, Inbox, ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isApiError } from "@/lib/queryClient";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ehNovo, etapaAtrasadaDoItem, ROTULO_DO_TIPO, type ItemDaAtividade } from "../comum/atividade-tipos";
import { LinhaDaAtividade } from "../comum/linha-da-atividade";
import { plural, quandoFoi, rotuloDoDia } from "../comum/paineis-dados";
import { useAgora, useBaseDosPaineis } from "../comum/use-base-dos-paineis";
import { useAtividade } from "../comum/use-atividade";
import { useUltimaVisita } from "../comum/ultima-visita";
import { AtualizadoHa } from "../comum/ui";
import { FiltrosDaAtividade, buscaDosFiltros, filtrosDaUrl, temFiltro, type FiltrosDaTela } from "./filtros-da-atividade";

/** Itens agrupados por dia, na ordem do feed. */
export function agruparPorDia(itens: ItemDaAtividade[], agora: Date): { dia: string; itens: ItemDaAtividade[] }[] {
  const out: { dia: string; itens: ItemDaAtividade[] }[] = [];
  for (const i of itens) {
    const dia = rotuloDoDia(i.at, agora);
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(i);
    else out.push({ dia, itens: [i] });
  }
  return out;
}

export default function AtividadeRecente() {
  const { user } = useAuth();
  const busca = useSearch();
  const [caminho, navegar] = useLocation();
  const [f, setF] = useState<FiltrosDaTela>(() => filtrosDaUrl(busca));
  const mudar = useCallback((patch: Partial<FiltrosDaTela>) => {
    const prox = { ...f, ...patch };
    setF(prox);
    const qs = buscaDosFiltros(prox);
    navegar(qs ? `${caminho}?${qs}` : caminho, { replace: true });
  }, [f, caminho, navegar]);

  const feed = useAtividade({ periodo: f.periodo, eventId: f.eventId, tipo: f.tipo, comPassagem: f.comPassagem, comHotel: f.comHotel });
  const base = useBaseDosPaineis();
  const { ultimaVisita, marcarTudoComoVisto } = useUltimaVisita(user?.id);
  const agora = useAgora();

  const atrasadosProntos = !base.carregando && !base.erro;
  const visiveis = useMemo(() => feed.itens.filter((i) =>
    (!f.atrasados || !!etapaAtrasadaDoItem(i, base.atrasadas))
    && (!f.naoVistos || ehNovo(i, ultimaVisita))), [feed.itens, f.atrasados, f.naoVistos, base.atrasadas, ultimaVisita]);
  const novos = useMemo(() => feed.itens.filter((i) => ehNovo(i, ultimaVisita)).length, [feed.itens, ultimaVisita]);
  const dias = useMemo(() => agruparPorDia(visiveis, new Date(agora)), [visiveis, agora]);
  const eventos = useMemo(
    () => [...base.listaDeEventos].filter((e) => e.status !== "excluído" && e.status !== "excluido")
      .sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? ""))),
    [base.listaDeEventos],
  );

  const semPermissao = isApiError(feed.error) && feed.error.status === 403;
  const filtrosDoClient = f.atrasados || f.naoVistos;

  return (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]" data-testid="paineis-atividade">
      <PageHeader
        variant="bar"
        title="Atividade recente"
        subtitle="Inclusões, mudanças, passagens, hotéis e pedidos · atualiza sozinho a cada minuto"
        className="mx-0 mt-0"
        actions={<AtualizadoHa em={feed.dataUpdatedAt || null} recarregando={feed.isFetching} onAtualizar={() => void feed.refetch()} testId="button-atualizar-atividade" />}
      />
      <div className="mx-auto max-w-[1100px] space-y-3 px-[var(--page-gutter)] pt-5 pb-6">
        {semPermissao ? (
          <EmptyState icon={ShieldOff} title="Sem acesso à atividade" description="A atividade recente é das equipes de Compras, Produção e administração." />
        ) : (
          <>
            <FiltrosDaAtividade
              f={f}
              onChange={mudar}
              eventos={eventos}
              resumo={feed.resumo}
              total={feed.data ? feed.total : null}
              atrasadosProntos={atrasadosProntos}
            />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-xs text-slate-600" aria-live="polite">
              <span data-testid="contagem-atividade">
                {feed.data
                  ? filtrosDoClient
                    ? `${plural(visiveis.length, "item", "itens")} de ${feed.itens.length} carregados`
                    : `${plural(feed.total, "item", "itens")}${f.tipo ? ` · ${ROTULO_DO_TIPO[f.tipo].toLowerCase()}` : ""}`
                  : "Carregando…"}
              </span>
              {novos > 0 && (
                <span className="font-medium text-primary" data-testid="contagem-novos">
                  · {plural(novos, "novo", "novos")} desde a sua última visita{ultimaVisita ? ` (${quandoFoi(ultimaVisita, new Date(agora))})` : ""}
                </span>
              )}
              {novos > 0 && (
                <button
                  type="button"
                  onClick={marcarTudoComoVisto}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-brand-soft sm:ml-auto"
                  data-testid="button-marcar-vistos"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />Marcar tudo como visto
                </button>
              )}
            </div>

            {feed.isError && !feed.data ? (
              <ErrorState title="Não foi possível carregar a atividade" description={feed.error?.message} onRetry={() => void feed.refetch()} />
            ) : feed.isLoading ? (
              <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true" aria-label="Carregando a atividade">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5">
                    <Skeleton className="h-7 w-7 rounded-lg" />
                    <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : visiveis.length === 0 ? (
              <EmptyState
                icon={Inbox}
                variant={temFiltro(f) ? "filtered" : "default"}
                title={temFiltro(f) ? "Nada com esses filtros" : "Nada mudou neste período"}
                description={temFiltro(f)
                  ? f.naoVistos && !f.atrasados ? "Você já viu tudo o que aconteceu no período." : "Tire algum filtro ou aumente o período."
                  : "Inclusões, mudanças, passagens, hotéis e pedidos aparecem aqui assim que acontecem."}
                onClearFilters={temFiltro(f) ? () => mudar({ eventId: null, tipo: null, comPassagem: false, comHotel: false, atrasados: false, naoVistos: false }) : undefined}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="feed-atividade">
                {dias.map((g) => (
                  <section key={g.dia} aria-label={g.dia}>
                    <h2 className="border-b border-border bg-surface-muted/60 px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {g.dia} <span className="font-normal normal-case tracking-normal">· {plural(g.itens.length, "item", "itens")}</span>
                    </h2>
                    <ul className="m-0 p-0">
                      {g.itens.map((item) => (
                        <LinhaDaAtividade
                          key={item.id}
                          item={item}
                          user={user ?? null}
                          novo={ehNovo(item, ultimaVisita)}
                          etapaAtrasada={etapaAtrasadaDoItem(item, base.atrasadas)}
                          agora={agora}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {feed.hasNextPage && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void feed.fetchNextPage()}
                  disabled={feed.isFetchingNextPage}
                  className="h-9 rounded-lg border border-border bg-card px-4 text-sm font-medium text-primary hover:border-primary hover:bg-brand-soft disabled:opacity-60"
                  data-testid="button-carregar-mais"
                >
                  {feed.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
                </button>
              </div>
            )}
            {feed.cortado && (
              <p className="px-1 text-2xs text-muted-foreground">O período tem muita movimentação: o feed mostra as vagas mexidas mais recentemente. Escolha um evento para ver tudo dele.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
