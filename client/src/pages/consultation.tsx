import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
/**
 * LOG DE AUDITORIA — quem fez o quê, quando, e o que mudou (revisão 18/09:
 * "os logs de auditoria não estão muito claros, revise para deixar 10/10").
 *
 * Cada registro é lido por shared/log-auditoria.ts: vira uma frase ("Leandro
 * excluiu o evento “Girl Power Brasília”"), o contexto (evento · função ·
 * colaborador), e as mudanças campo a campo com antes → depois — com NOMES no
 * lugar de ids e sem os campos técnicos.
 *
 * Redesenho 08/10 — a casca das telas já redesenhadas (Histórico da escala,
 * Passagens, Controle RH): barra de contexto de 56px grudada (título · quantos
 * registros e o período · atualizar e exportar), conteúdo até 1560px, a barra
 * de filtros comum, e o log numa moldura só — dias como cabeçalhos, uma linha
 * densa por registro sobre o fio do dia, que vira cartão no estreito. O
 * registro abre num painel lateral (antes → depois lado a lado, "investigar"
 * pela pessoa ou pelo módulo, detalhes técnicos recolhidos) e dá para andar de
 * um registro ao outro sem fechar. Estados: esqueleto, erro com "Tentar
 * novamente", vazio com "ver o último ano", sem resultado com "Limpar
 * filtros", nomes que não carregaram e acesso restrito.
 *
 * Inalterados: o endpoint e seus parâmetros, a paginação no servidor (30 por
 * página), o debounce da busca, as chaves de cache, a exportação da página e a
 * permissão (canAccessScreen6). A página anterior fica na tela enquanto a
 * próxima chega (`keepPreviousData`), com a lista esmaecida e uma barra fina.
 *
 * 08/10 (lógica): "Exclusão" filtra por `action=exclusao` (inclui evento/vaga
 * excluídos por alteração, como a tela os mostra); as ações do histórico da
 * vaga saíram do filtro (nunca são gravadas aqui); hora e dia em São Paulo; o
 * filtro de pessoa inclui quem aparece no log sem cadastro e o sistema
 * (`userName=`, via GET /api/system-logs/pessoas).
 */
import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fixEncoding } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { MODULOS, descreverLog, type NomesParaLog } from "@shared/log-auditoria";
import { hojeISO } from "@shared/hoje-sp";
import {
  FILTROS_PADRAO, PREFIXO_PESSOA_PELO_NOME, csvCell, dataHoraSp, nomeDoPeriodo, opcoesDePessoas, parametroDaPessoa, plural,
  type FiltrosDaAuditoria, type LogsResponse, type PessoaDoLog,
} from "@/components/auditoria/auditoria-utils";
import { BarraDaAuditoria } from "@/components/auditoria/barra-da-auditoria";
import { ListaDaAuditoria, agruparPorDia } from "@/components/auditoria/lista-da-auditoria";
import { DetalheDoRegistro } from "@/components/auditoria/detalhe-do-registro";
import {
  AvisoDeNomes, ErroDaAuditoria, EsqueletoDaAuditoria, SemAcessoAuditoria, VazioDaAuditoria,
} from "@/components/auditoria/estados-da-auditoria";

const NOMES_DOS_FILTROS: Record<keyof FiltrosDaAuditoria, string> = { userId: "pessoa", entityType: "módulo", action: "ação", days: "período" };

export default function SystemLogsPage() {
  usePageTitle("Log de auditoria");
  const { user, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<FiltrosDaAuditoria>(FILTROS_PADRAO);
  const [page, setPage] = useState(1);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  // O timer precisa viver fora do callback: cada tecla cancela a busca anterior.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const applySearch = useCallback((val: string) => { setDebouncedSearch(val); setPage(1); }, []);
  const debounceSearch = useCallback((val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Apagar (inclusive pelo Esc ou pelo X da busca) vale na hora.
    if (val === "") { applySearch(""); return; }
    searchTimer.current = setTimeout(() => applySearch(val), 400);
  }, [applySearch]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ page: page.toString(), limit: "30" });
    if (filters.entityType !== "all") params.set("entityType", filters.entityType);
    if (filters.action !== "all") params.set("action", filters.action);
    // Pessoa cadastrada vai por id; sem cadastro / sistema, pelo nome gravado (08/10).
    const pessoa = parametroDaPessoa(filters.userId);
    if (pessoa) params.set(pessoa.chave, pessoa.valor);
    if (filters.days) params.set("days", filters.days);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return `/api/system-logs?${params}`;
  }, [filters, page, debouncedSearch]);

  const podeVer = !authLoading && hasPermission(user, "canAccessScreen6");
  const { data: logsResponse, isLoading, isError, error, refetch, isFetching, isPlaceholderData } = useQuery<LogsResponse>({
    queryKey: [queryUrl],
    enabled: podeVer,
    // A página anterior fica na tela (esmaecida) enquanto a próxima chega.
    placeholderData: keepPreviousData,
  });

  // Nomes no lugar de ids (mesmas chaves das outras telas → cache compartilhado).
  const eventsQ = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/events"], enabled: podeVer, staleTime: 300_000 });
  const functionsQ = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/functions"], enabled: podeVer, staleTime: 300_000 });
  const collaboratorsQ = useQuery<{ id: string; fullName: string }[]>({ queryKey: ["/api/collaborators"], enabled: podeVer });
  const usersQ = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/users"], enabled: podeVer, staleTime: 300_000 });
  // Quem aparece no log (inclusive sem cadastro e o sistema) — para o filtro de pessoa.
  const pessoasDoLogQ = useQuery<PessoaDoLog[]>({ queryKey: ["/api/system-logs/pessoas"], enabled: podeVer, staleTime: 300_000 });
  const events = eventsQ.data, functions = functionsQ.data, collaborators = collaboratorsQ.data, users = usersQ.data;
  const nomesComFalha = [eventsQ, functionsQ, collaboratorsQ, usersQ].filter((q) => q.isError);
  const nomesTentando = [eventsQ, functionsQ, collaboratorsQ, usersQ].some((q) => q.isFetching);
  const recarregarNomes = () => { for (const q of nomesComFalha) void q.refetch(); };

  const nomes = useMemo<NomesParaLog>(() => {
    const ev = new Map((events ?? []).map((e) => [e.id, fixEncoding(e.name)]));
    const fn = new Map((functions ?? []).map((f) => [f.id, fixEncoding(f.name)]));
    const co = new Map((collaborators ?? []).map((c) => [c.id, fixEncoding(c.fullName)]));
    const us = new Map((users ?? []).map((u) => [u.id, fixEncoding(u.name)]));
    return { evento: (id) => ev.get(id), funcao: (id) => fn.get(id), colaborador: (id) => co.get(id), usuario: (id) => us.get(id) };
  }, [events, functions, collaborators, users]);

  const descritos = useMemo(
    () => (logsResponse?.logs ?? []).map((log) => ({ log, d: descreverLog(log, nomes) })),
    [logsResponse, nomes],
  );

  /** Agrupados por dia, na ordem em que vieram (mais recentes primeiro). */
  const porDia = useMemo(() => agruparPorDia(descritos), [descritos]);

  const usuariosOrdenados = useMemo(
    () => opcoesDePessoas((users ?? []).map((u) => ({ id: u.id, name: toTitleCase(fixEncoding(u.name)) })), pessoasDoLogQ.data),
    [users, pessoasDoLogQ.data],
  );

  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    setDebouncedSearch("");
    setFilters(FILTROS_PADRAO);
    setPage(1);
  };
  const setFiltro = (k: keyof FiltrosDaAuditoria, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const hasActiveFilters = filters.entityType !== "all" || filters.action !== "all" || filters.userId !== "all" || filters.days !== "30" || !!debouncedSearch;

  const exportar = () => {
    const header = "Nº;Data;Pessoa;Ação;Módulo;O que aconteceu;Contexto;Mudanças\r\n";
    const rows = descritos.map(({ log, d }) => [
      log.logNumber, dataHoraSp(log.createdAt), fixEncoding(log.userName) || "Sistema",
      d.acao, d.modulo, `${fixEncoding(log.userName) || "Sistema"} ${d.frase}`, d.contexto.join(" · "),
      d.mudancas.map((m) => `${m.campo}: ${m.antes} → ${m.depois}`).join(" | "),
    ].map(csvCell).join(";")).join("\r\n");
    // BOM para o Excel pt-BR abrir os acentos corretamente
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `log-de-auditoria-${hojeISO()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Registro aberto no painel (só desta página) ──
  const iAberto = abertoId ? descritos.findIndex((x) => x.log.id === abertoId) : -1;
  const aberto = iAberto >= 0 ? descritos[iAberto] : null;
  // A posição do rodapé não pisca para "1 de N" enquanto o painel fecha.
  const ultimaPosicao = useRef(0);
  if (iAberto >= 0) ultimaPosicao.current = iAberto;
  const fecharDetalhe = () => setAbertoId(null);
  const abrirVizinho = (passo: number) => {
    const alvo = descritos[iAberto + passo];
    if (!alvo) return;
    setAbertoId(alvo.log.id);
    // A linha do registro acompanha o painel (fica à vista quando ele fecha).
    document.querySelector(`[data-testid="log-${alvo.log.logNumber}"]`)?.scrollIntoView({ block: "nearest" });
  };
  // "Tudo de X": pela pessoa cadastrada ou, sem cadastro / sistema, pelo nome gravado.
  const idDaPessoaAberta = aberto
    ? (aberto.log.userId && usuariosOrdenados.some((u) => u.id === aberto.log.userId) ? aberto.log.userId : `${PREFIXO_PESSOA_PELO_NOME}${aberto.log.userName}`)
    : null;
  const pessoaNaLista = idDaPessoaAberta && usuariosOrdenados.some((u) => u.id === idDaPessoaAberta) ? idDaPessoaAberta : null;
  const moduloConhecido = aberto && MODULOS[aberto.log.entityType] ? aberto.log.entityType : null;

  // ── Página: a lista volta ao topo quando a página muda ──
  const listaRef = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    setPage(n);
    const topo = listaRef.current?.getBoundingClientRect().top;
    if (topo !== undefined && topo < 0) listaRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // ── Barra de contexto (56px) ──
  const pagination = logsResponse?.pagination;
  const periodo = nomeDoPeriodo(filters.days);
  const resumoDaBarra = pagination && !isError
    ? `${plural(pagination.total, "registro", "registros")} · ${periodo.toLowerCase()}`
    : "Quem fez o quê, quando — e o que mudou";
  const atualizando = isFetching && !isLoading;

  const barra = (
    <PageHeader
      variant="bar"
      title="Log de auditoria"
      subtitle={resumoDaBarra}
      // No celular a barra tem dois andares: grudada, comia a tela (como no Controle RH).
      className="mx-0 mt-0 max-sm:static"
      actions={podeVer && logsResponse ? (
        <>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label={isFetching ? "Atualizando o log" : "Atualizar o log"}
            title="Buscar registros novos"
            className="pas-alvo inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-card text-slate-600 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="aud-atualizar"
          >
            <RotateCw className={`h-4 w-4 ${isFetching ? "aud-girando" : ""}`} aria-hidden="true" />
          </button>
          <MotivoDesabilitado motivo="Exporta os registros desta página, já em frases" desabilitado={descritos.length === 0}>
            <Button variant="outline" className="pas-alvo h-[34px] gap-1.5 rounded-lg px-3 text-sm" disabled={descritos.length === 0} onClick={exportar} data-testid="aud-exportar">
              <Download className="h-4 w-4" aria-hidden="true" /> Exportar página
            </Button>
          </MotivoDesabilitado>
        </>
      ) : undefined}
    />
  );

  const casca = (conteudo: ReactNode) => (
    // Margens pela variável do layout: a barra sangra até as bordas da página e
    // o conteúdo fica em até 1560px — a casca do Controle RH e do Planejado.
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra}
      <div className="px-[var(--page-gutter)] pb-6 pt-5">
        <div className="mx-auto flex max-w-[1560px] flex-col gap-4">{conteudo}</div>
      </div>
    </div>
  );

  // Enquanto a sessão está sendo verificada não dá para saber o perfil.
  if (authLoading) return casca(<EsqueletoDaAuditoria rotulo="Carregando…" />);
  if (!hasPermission(user, "canAccessScreen6")) return casca(<SemAcessoAuditoria />);

  // Linha do topo da lista: quantos, o período e o recorte por extenso.
  const recortes = (Object.keys(NOMES_DOS_FILTROS) as (keyof FiltrosDaAuditoria)[])
    .filter((k) => k !== "days" && filters[k] !== "all")
    .map((k) => NOMES_DOS_FILTROS[k]);
  if (debouncedSearch) recortes.unshift("busca");
  const resumoDaLista = pagination && (
    <>
      <p className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
        <span className="font-semibold tabular-nums text-foreground">{plural(pagination.total, "registro", "registros")}</span>
        {recortes.length > 0
          ? <> · filtrados por {recortes.join(", ").replace(/, ([^,]*)$/, " e $1")}</>
          : <> · do mais recente para o mais antigo</>}
      </p>
      <p className="ml-auto hidden shrink-0 text-2xs text-muted-foreground md:block">Abra um registro para ver o que mudou</p>
    </>
  );

  let conteudo: ReactNode;
  if (isLoading) {
    conteudo = <EsqueletoDaAuditoria />;
  } else if (isError) {
    conteudo = (
      <ErroDaAuditoria
        status={apiErrorStatus(error)}
        detalhe={apiErrorMessage(error, "Verifique sua conexão e tente novamente.")}
        onTentar={() => void refetch()}
        tentando={isFetching}
      />
    );
  } else if (descritos.length === 0) {
    conteudo = (
      <VazioDaAuditoria
        // Só o período mudou: é "nada no período", não "nada com esses filtros".
        filtrado={recortes.length > 0}
        periodo={periodo}
        onLimpar={clearFilters}
        onAmpliar={filters.days !== "365" ? () => setFiltro("days", "365") : null}
      />
    );
  } else if (pagination) {
    conteudo = (
      <ListaDaAuditoria
        dias={porDia}
        selecionadoId={abertoId}
        onAbrir={setAbertoId}
        atualizando={atualizando && isPlaceholderData}
        paginacao={{ ...pagination, page }}
        onPage={irParaPagina}
        resumo={resumoDaLista}
      />
    );
  }

  return (
    <>
      {casca(
        <>
          <BarraDaAuditoria
            busca={search}
            onBusca={debounceSearch}
            filtros={filters}
            onFiltro={setFiltro}
            temFiltros={hasActiveFilters}
            onLimpar={clearFilters}
            usuarios={usuariosOrdenados}
          />
          {nomesComFalha.length > 0 && !isLoading && !isError && <AvisoDeNomes onTentar={recarregarNomes} tentando={nomesTentando} />}
          <div ref={listaRef} className="scroll-mt-[calc(var(--sticky-top,3.5rem)+4.5rem)]">{conteudo}</div>
        </>,
      )}
      <DetalheDoRegistro
        item={aberto}
        aberto={!!aberto}
        onFechar={fecharDetalhe}
        posicao={{ i: ultimaPosicao.current, n: descritos.length }}
        onAnterior={iAberto > 0 ? () => abrirVizinho(-1) : null}
        onProximo={iAberto >= 0 && iAberto < descritos.length - 1 ? () => abrirVizinho(1) : null}
        onFiltrarPessoa={pessoaNaLista ? () => { setFiltro("userId", pessoaNaLista); fecharDetalhe(); } : null}
        onFiltrarModulo={moduloConhecido ? () => { setFiltro("entityType", moduloConhecido); fecharDetalhe(); } : null}
      />
    </>
  );
}
