/**
 * CONTROLE RH — página de composição (25/09, modularização); redesenho 08/10.
 *
 * Dados (inalterados): `useRhControlData` (UMA consulta ao endpoint agregado
 * GET /api/rh/controle?eventId=&status= — o cruzamento roda no servidor),
 * `useRhFiltros` (filtros na URL) e `useRhFilaFiltrada` (filtros do client +
 * agrupamento por evento). Evento e status (inclusive os recortes da fila) vão
 * para o servidor; busca, função, colaborador, NF e check-in filtram no client.
 *
 * Apresentação (08/10) — a MESMA casca das telas do Financeiro: barra de
 * contexto de 56px grudada (título · o evento como seletor, que aqui aceita
 * "Todos os eventos" · a situação do RH à direita, que leva às pendências);
 * conteúdo até 1560px com o painel de resumo (progresso e o trabalho do RH por
 * tipo — cada número recorta), a fila de trabalho (os quatro recortes de
 * antes), a barra de filtros comum e a fila numa tabela agrupada por evento
 * que vira cartão no estreito. Carregando, erro e vazio são estados da página.
 *
 * 26/10 (Módulo de Honorários, Fase 0): a tela virou o "Painel de honorários"
 * (slide 11). Recorte Fluxo novo × Legado (eventos que terminam antes da data
 * de corte): o legado é só leitura, com "Concluir em lote" fora do fluxo; a
 * trilha de cada registro e a do resumo são a ÚNICA do slide 8.
 *
 * 28/10 (Fase 3 — prazos e cobranças): faixa "Atrasados · Vence hoje ·
 * Contestações" (cada número = o tamanho da lista que ele mostra, contado com
 * os outros filtros de agora), ordem "Mais atrasado primeiro" e o diálogo da
 * contestação do colaborador (o DP responde; o colaborador vê no portal).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { CheckCheck, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { EventSearchSelect } from "@/components/event-select";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/role-utils";
import { useRhControlData } from "@/components/rh/use-rh-control-data";
import { useRhFiltros } from "@/components/rh/use-rh-filtros";
import { useRhFilaFiltrada } from "@/components/rh/use-rh-fila-filtrada";
import { FilaDoRh, ResumoDoRh, irParaLista } from "@/components/rh/rh-summary";
import { RhFilters } from "@/components/rh/rh-filters";
import { RhLista } from "@/components/rh/rh-lista";
import { EsqueletoDoRh, ErroDoRh, VazioDoRh } from "@/components/rh/rh-estados";
import { periodoDoEvento } from "@/components/rh/prestacao-utils";
import { estaConcluida } from "@/components/rh/use-rh-fila-filtrada";
import { AvisoDoLegado, ConcluirLegadoDialog, RecorteDoPainel } from "@/components/rh/legado";
import { AbrirContestacao, FaixaDePrazos, type ContagemDaFaixa } from "@/components/rh/rh-prazos";
import { passaNoFiltroDePrazo } from "@/components/rh/use-rh-fila-filtrada";
import { DialogoDaContestacao, type ContestacaoParaTela } from "@/components/honorarios/contestacao";

export default function RhControlPage() {
  usePageTitle("Painel de honorários");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const filtros = useRhFiltros(user?.id);
  const { filterEvent, hasActiveFilters, showConcluded } = filtros;

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [approvingInvoiceId, setApprovingInvoiceId] = useState<string | null>(null);
  const [nfApproving, setNfApproving] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const toggleDetails = useCallback((id: string) => setExpandedDetails(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  }), []);

  const eventoSelecionado = filterEvent !== "all" ? filterEvent : null;
  const dados = useRhControlData(eventoSelecionado, filtros.filterStatus, filtros.recorte);
  const noLegado = filtros.recorte === "legado";
  const [concluindoLegado, setConcluindoLegado] = useState(false);
  const { estado, isLoading, atualizando, statusCounts, invoiceCounts, rhActionCount, concludedCount, totalForProgress, progressPct } = dados;
  const canRh = isRhOrAdmin(user);

  const { filteredItems, eventGroups } = useRhFilaFiltrada(dados, filtros);
  // "Concluir em lote" (legado): o que a lista mostra agora e ainda está aberto.
  const legadoAbertoVisivel = useMemo(() => (noLegado ? filteredItems.filter(i => !i.conclusaoForaDoFluxo && !estaConcluida(i)) : []), [noLegado, filteredItems]);
  // Quantas sobram em cada função com os OUTROS filtros de agora — a mesma
  // regra da lista (o hook roda de novo com a função em "todas").
  const { filteredItems: semFuncao } = useRhFilaFiltrada(dados, { ...filtros, filterFunction: "all" });
  // Faixa de prazos (28/10): contada com os OUTROS filtros de agora, sem o de prazo
  // — o número do botão é o tamanho exato da lista que ele mostra.
  const { filteredItems: semPrazo } = useRhFilaFiltrada(dados, { ...filtros, filtroPrazo: "all", ordem: "padrao" });
  const contagemDosPrazos = useMemo((): ContagemDaFaixa => {
    const c: ContagemDaFaixa = { atrasados: 0, venceHoje: 0, contestacoes: 0, porQuem: { dp: 0, producao: 0, colaborador: 0 } };
    for (const i of semPrazo) {
      if (passaNoFiltroDePrazo(i, "atrasados")) { c.atrasados += 1; c.porQuem[i.prazo!.pior!.quem] += 1; }
      if (passaNoFiltroDePrazo(i, "vence_hoje")) c.venceHoje += 1;
      if (passaNoFiltroDePrazo(i, "contestacoes")) c.contestacoes += 1;
    }
    return c;
  }, [semPrazo]);
  const [contestacaoAberta, setContestacaoAberta] = useState<{ actualId: string; nome: string; contestacao: ContestacaoParaTela } | null>(null);
  const opcoesDeFuncao = useMemo(() => {
    const n = new Map<string, number>();
    for (const i of semFuncao) if (i.functionId) n.set(i.functionId, (n.get(i.functionId) ?? 0) + 1);
    return dados.funcoes.map(fn => ({ id: fn.id, nome: fn.name, n: n.get(fn.id) ?? 0 }));
  }, [semFuncao, dados.funcoes]);

  const didAutoExpand = useRef(false);
  useEffect(() => {
    if (eventGroups.length > 0 && !didAutoExpand.current) {
      didAutoExpand.current = true;
      const toExpand = eventGroups.filter(g => g.actionNeeded > 0).map(g => g.event.id);
      if (toExpand.length > 0) {
        setExpandedEvents(new Set(toExpand));
      } else if (eventGroups.length <= 3) {
        setExpandedEvents(new Set(eventGroups.map(g => g.event.id)));
      }
    }
  }, [eventGroups]);

  // Atualização FUNCIONAL: o card memoizado guarda o closure do seu último
  // render — ler `expandedCards` aqui apagaria a expansão de outros cards.
  const toggleExpand = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleEventExpand = useCallback((eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId); else next.add(eventId);
      return next;
    });
  }, []);

  const expandAllEvents = () => setExpandedEvents(new Set(eventGroups.map(g => g.event.id)));
  const collapseAllEvents = () => setExpandedEvents(new Set());

  const recusadaCount = statusCounts.recusada || 0;
  const ocultos = concludedCount + recusadaCount;

  // "Ver pendências" (era o CTA da faixa laranja): só as pendências do RH, sem
  // os filtros finos. 08/10: o evento escolhido na barra fica.
  const verPendencias = () => {
    filtros.setFilterFunction("all");
    filtros.setFilterCollaborator("all");
    filtros.setFilterInvoiceStatus("all");
    filtros.setSearchTerm("");
    filtros.setFilterStatus("rh_action");
    filtros.setFilterCheckinOnly(false);
    filtros.setShowConcluded(false);
    filtros.setFiltroPrazo("all");
    irParaLista();
  };
  // Reseta TODOS os filtros — incl. Nota Fiscal e os recortes da fila
  // (rh_action/col_action/nf_andamento/concluidos vivem em filterStatus).
  const limparFiltros = () => {
    filtros.setFilterEvent("all"); filtros.setFilterFunction("all"); filtros.setFilterCollaborator("all");
    filtros.setFilterStatus("all"); filtros.setFilterInvoiceStatus("all"); filtros.setSearchTerm(""); filtros.setFilterCheckinOnly(false);
    filtros.setFiltroPrazo("all");
  };

  // ── Barra de contexto ──
  const eventoDaBarra = dados.eventos.find(e => e.id === eventoSelecionado);
  const nNaFila = Object.values(statusCounts).reduce((s, n) => s + n, 0);
  const detalheDoEvento = isLoading || estado.isError ? undefined
    : eventoDaBarra
      ? [periodoDoEvento(eventoDaBarra), `${nNaFila} ${nNaFila === 1 ? "prestação" : "prestações"}`].filter(Boolean).join(" · ")
      : `${nNaFila} ${nNaFila === 1 ? "prestação" : "prestações"} na fila`;
  const emRhAction = filtros.filterStatus === "rh_action";
  const situacao: ReactNode = isLoading || estado.isError ? null
    : rhActionCount > 0 ? (
      <button
        type="button"
        onClick={emRhAction ? () => filtros.setFilterStatus("all") : verPendencias}
        aria-pressed={emRhAction}
        title={emRhAction ? "Voltar à fila inteira" : "Mostrar só as pendências do DP"}
        className={`pas-alvo inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-[filter,background-color] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${emRhAction ? "bg-primary text-primary-foreground" : "bg-danger-soft text-danger"}`}
        data-testid="rh-situacao"
      >
        <ShieldAlert className="w-4 h-4" aria-hidden="true" />
        {rhActionCount} com o DP
      </button>
    ) : (
      <span className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg text-sm font-medium whitespace-nowrap bg-success-soft text-success" data-testid="rh-situacao">
        <CheckCheck className="w-4 h-4" aria-hidden="true" />Nada com o DP
      </span>
    );

  const barra = (
    <PageHeader
      variant="bar"
      title="Painel de honorários"
      // No celular a barra tem dois andares: grudada, comia a tela (como no Comparativo).
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      context={<>
        <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border shrink-0" />
        <EventSearchSelect
          variante="barra"
          value={eventoSelecionado ?? ""}
          onValueChange={(v) => filtros.setFilterEvent(v || "all")}
          events={dados.eventos}
          detalhe={detalheDoEvento}
          rotuloVazio="Todos os eventos"
        />
      </>}
      actions={situacao}
    />
  );

  // ── Conteúdo ──
  let lista: ReactNode;
  if (filteredItems.length === 0) {
    const caso = hasActiveFilters ? "filtros" : !showConcluded && ocultos > 0 ? "em-dia" : "vazia";
    lista = <VazioDoRh caso={caso} ocultos={ocultos} onLimpar={limparFiltros} onMostrarConcluidos={showConcluded ? null : () => filtros.setShowConcluded(true)} />;
  } else {
    lista = (
      <RhLista
        eventGroups={eventGroups}
        totalItens={filteredItems.length}
        expandedEvents={expandedEvents}
        onToggleEvent={toggleEventExpand}
        onExpandirTudo={expandAllEvents}
        onRecolherTudo={collapseAllEvents}
        atualizando={atualizando}
        expandedCards={expandedCards}
        expandedDetails={expandedDetails}
        approvingInvoiceId={approvingInvoiceId}
        nfApproving={nfApproving}
        canRh={canRh}
        somenteLeitura={noLegado}
        toggleExpand={toggleExpand}
        toggleDetails={toggleDetails}
        navigate={navigate}
        setApprovingInvoiceId={setApprovingInvoiceId}
        setNfApproving={setNfApproving}
        toast={toast}
      />
    );
  }

  let conteudo: ReactNode;
  if (estado.isError) {
    conteudo = <ErroDoRh error={estado.error} onRetry={estado.retry} />;
  } else if (isLoading) {
    conteudo = <EsqueletoDoRh />;
  } else {
    conteudo = (
      <>
        {/* Fluxo novo × Legado (26/10): o legado é só leitura. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <RecorteDoPainel recorte={filtros.recorte} onRecorte={filtros.setRecorte} recortes={dados.recortes} dataDeCorte={dados.dataDeCorte} />
          {!noLegado && dados.recortes.legado - dados.recortes.legadoConcluido > 0 && (
            <p className="m-0 text-xs text-muted-foreground">
              O legado fica no recorte ao lado — {(dados.recortes.legado - dados.recortes.legadoConcluido).toLocaleString("pt-BR")} {dados.recortes.legado - dados.recortes.legadoConcluido === 1 ? "registro aberto" : "registros abertos"}.
            </p>
          )}
        </div>
        {noLegado && (
          <AvisoDoLegado
            dataDeCorte={dados.dataDeCorte}
            recortes={dados.recortes}
            pendentesVisiveis={legadoAbertoVisivel.length}
            podeConcluir={canRh}
            onConcluir={() => setConcluindoLegado(true)}
          />
        )}
        <ResumoDoRh
          trilha={dados.trilha}
          statusCounts={statusCounts}
          invoiceCounts={invoiceCounts}
          concludedCount={concludedCount}
          totalForProgress={totalForProgress}
          progressPct={progressPct}
          filtros={filtros}
        />
        <FilaDoRh
          statusCounts={statusCounts}
          invoiceCounts={invoiceCounts}
          rhActionCount={rhActionCount}
          concludedCount={concludedCount}
          totalForProgress={totalForProgress}
          filtros={filtros}
        />
        {!noLegado && (
          <FaixaDePrazos
            contagem={contagemDosPrazos}
            filtro={filtros.filtroPrazo}
            onFiltro={filtros.setFiltroPrazo}
            ordem={filtros.ordem}
            onOrdem={filtros.setOrdem}
          />
        )}
        <RhFilters
          filtros={filtros}
          opcoesDeFuncao={opcoesDeFuncao}
          concludedCount={concludedCount}
          recusadaCount={recusadaCount}
          filteredCount={filteredItems.length}
        />
        {lista}
      </>
    );
  }

  return (
    // Margens pela variável do layout: a barra sangra até as bordas da página e
    // o conteúdo fica em até 1560px — a casca do Planejado e do Comparativo.
    <AbrirContestacao.Provider value={setContestacaoAberta}>
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra}
      <div className="px-[var(--page-gutter)] pt-5 pb-6">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
      </div>
      <ConcluirLegadoDialog
        itens={legadoAbertoVisivel}
        aberto={concluindoLegado}
        onClose={() => setConcluindoLegado(false)}
        recorteDescrito={eventoDaBarra ? eventoDaBarra.name : "Todos os eventos do legado"}
      />
      <DialogoDaContestacao alvo={contestacaoAberta} onClose={() => setContestacaoAberta(null)} podeResponder={canRh} />
    </div>
    </AbrirContestacao.Provider>
  );
}
