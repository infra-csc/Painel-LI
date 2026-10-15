/**
 * Aba BUSCAR (09/10) — "segue o fluxo de Passagens: aparecem as PENDENTES,
 * tem filtro de COMPRADAS, e procura POR ESCALAÇÃO" (dono).
 *
 * Etapas, do largo ao celular: LISTA (escalações com o que a busca vai usar e
 * o que falta) → SELEÇÃO (barra no rodapé com a prévia "N rotas · M em cache ·
 * gasta K consultas", de graça) → RESULTADOS (painel lateral; tela cheia no
 * celular) → "Usar este voo" (o modal de registro de Passagens, aqui mesmo).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, PlaneTakeoff, RotateCw, Search, Sparkles, X, CircleSlash, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import type { OpcaoDeFiltro } from "@/components/common/filter-popover";
import { useTicketsData } from "@/components/tickets/use-tickets-data";
import { DEFAULT_TICKET_FILTERS } from "@/components/tickets/types";
import { hasPermission } from "@/lib/role-utils";
import { hojeISO } from "@shared/hoje-sp";
import {
  situacaoDoTeto,
  type AjusteDaBusca,
  type OpcaoAvaliada,
  type ResultadoNaTela,
  type RotaNaTela,
  type VagaDoPedido,
} from "@shared/busca-de-passagens";
import type { User } from "@shared/schema";
import { montarLinhas, ordenarLinhas, passaNosFiltros, destinoDaLinha, saidaDaLinha, type CampoContado, type LinhaDaBusca } from "./linhas-da-busca";
import { FILTROS_PADRAO, type FiltrosDaBusca, type Situacao } from "./filtros-da-busca";
import { BarraDeFiltrosDaBusca } from "./barra-de-filtros-da-busca";
import { CabecaDaLista, LinhaDeEscalacao } from "./lista-de-escalacoes";
import { PainelDeResultados, type AcoesDaRota } from "./painel-de-resultados";
import { BarraDeSelecao } from "./barra-de-selecao";
import { RegistroPeloVoo } from "./registro-pelo-voo";
import { useAeroportosConfirmados, useBuscaDePassagens, useConsumoDaBusca } from "./use-busca-de-passagens";
import type { VagaDaOpcao } from "./opcao-de-voo";
import type { VooEscolhido } from "./voo-para-formulario";
import { plural } from "./formato";

const COR_SITUACAO: Record<Situacao, string> = { pendentes: "text-warning-strong", compradas: "text-success-strong", todas: "text-primary" };
const ICONE_SITUACAO = { pendentes: Clock, compradas: CheckCircle2, todas: ListChecks } as const;

/** Opções de um filtro com a contagem "se eu escolher isto mantendo o resto". */
function opcoes(linhas: LinhaDaBusca[], f: FiltrosDaBusca, campo: CampoContado, chave: (l: LinhaDaBusca) => string[], nome: (id: string, l: LinhaDaBusca) => string): OpcaoDeFiltro[] {
  const mapa = new Map<string, OpcaoDeFiltro>();
  for (const l of linhas) {
    if (!passaNosFiltros(l, f, campo)) continue;
    for (const id of chave(l)) {
      if (!id) continue;
      const o = mapa.get(id) ?? { id, nome: nome(id, l), n: 0 };
      o.n++;
      mapa.set(id, o);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function AbaBuscar({ user, filtros, onFiltros, vagasDaUrl, idaDeDaUrl, onResumo }: {
  user: User | null;
  filtros: FiltrosDaBusca;
  onFiltros: (f: FiltrosDaBusca) => void;
  /** Atalho de Passagens: vagas já selecionadas (`?vagas=`). */
  vagasDaUrl: string[];
  /** Atalho "Buscar preços do trecho direto" (`?idaDe=`). */
  idaDeDaUrl: string | null;
  onResumo: (texto: string) => void;
}) {
  const data = useTicketsData({ filters: { ...DEFAULT_TICKET_FILTERS, ticketStatus: "all" }, showOnlyPendingSwaps: false, sortConfig: null, user });
  const podeCorrigir = hasPermission(user, "canAccessBuscaDePassagens");
  const hoje = useMemo(() => hojeISO(), []);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set(vagasDaUrl));
  const [ajustes, setAjustes] = useState<Record<string, AjusteDaBusca>>({});
  /** Trecho direto pedido pelo atalho: vaga → vaga anterior (para "Usar este voo"). */
  const [trechoDiretoDe, setTrechoDiretoDe] = useState<Record<string, string>>({});
  const [painel, setPainel] = useState(false);
  const [registro, setRegistro] = useState<{ vagaId: string; voo: VooEscolhido } | null>(null);
  const consumo = useConsumoDaBusca();
  const confirmados = useAeroportosConfirmados();
  const eventById = useMemo(() => {
    if (Object.keys(confirmados).length === 0) return data.eventById;
    const m = new Map(data.eventById);
    for (const [id, iata] of Object.entries(confirmados)) { const e = m.get(id); if (e) m.set(id, { ...e, aeroportoIata: iata }); }
    return m;
  }, [data.eventById, confirmados]);

  // ── Linhas (mesma regra do servidor) ──
  const linhas = useMemo(() => montarLinhas({
    vagas: data.filteredTicketInclusions,
    eventById,
    collaboratorById: data.collaboratorById,
    ticketByInclusion: data.ticketByInclusion,
    nomeDoColaborador: data.getCollaboratorName,
    nomeDaFuncao: data.getFunctionName,
    ajustes,
    hoje,
  }), [data.filteredTicketInclusions, eventById, data.collaboratorById, data.ticketByInclusion, data.getCollaboratorName, data.getFunctionName, ajustes, hoje]);
  const linhaPorId = useMemo(() => new Map(linhas.map((l) => [l.vaga.id, l])), [linhas]);
  const visiveis = useMemo(() => ordenarLinhas(linhas.filter((l) => passaNosFiltros(l, filtros))), [linhas, filtros]);

  // Atalhos de Passagens: a vaga comprada só aparece em "Todas"; o trecho direto vira ajuste.
  const atalhoAplicado = useRef(false);
  useEffect(() => {
    if (atalhoAplicado.current || data.isLoading || vagasDaUrl.length === 0) return;
    atalhoAplicado.current = true;
    if (vagasDaUrl.some((id) => data.ticketByInclusion.has(id)) && filtros.situacao === "pendentes") onFiltros({ ...filtros, situacao: "todas" });
    if (idaDeDaUrl) {
      const anterior = data.teamInclusions?.find((v) => v.id === idaDeDaUrl);
      if (anterior) {
        setAjustes((a) => Object.fromEntries([...Object.entries(a), ...vagasDaUrl.map((id) => [id, { ...a[id], idaDoEventoId: anterior.eventId, somente: "ida" as const }])]));
        setTrechoDiretoDe(Object.fromEntries(vagasDaUrl.map((id) => [id, anterior.id])));
      }
    }
  }, [data.isLoading, data.ticketByInclusion, data.teamInclusions, vagasDaUrl, idaDeDaUrl, filtros, onFiltros]);

  // ── Contagens e opções dos filtros ──
  const contagem = useMemo(() => {
    const base = linhas.filter((l) => passaNosFiltros(l, filtros, "situacao"));
    const pend = base.filter((l) => !l.comprada);
    return {
      pendentes: pend.length,
      prontas: pend.filter((l) => l.faltas.length === 0).length,
      faltando: pend.filter((l) => l.faltas.length > 0).length,
      compradas: base.length - pend.length,
      todas: base.length,
    };
  }, [linhas, filtros]);
  const opcoesDosFiltros = useMemo(() => ({
    eventos: opcoes(linhas, filtros, "evento", (l) => [l.vaga.eventId], (_id, l) => l.evento?.name ?? "Evento"),
    saidas: opcoes(linhas, filtros, "saida", (l) => [saidaDaLinha(l)], (_id, l) => l.cidadeDeSaida || "—"),
    destinos: opcoes(linhas, filtros, "destino", (l) => [destinoDaLinha(l)], (id, l) => (l.evento?.aeroportoIata ? `${l.cidadeDoEvento} · ${id}` : l.cidadeDoEvento || id)),
    funcoes: opcoes(linhas, filtros, "funcoes", (l) => [l.vaga.functionId], (_id, l) => l.funcao),
  }), [linhas, filtros]);

  useEffect(() => {
    onResumo(data.isLoading ? "Carregando…" : `${contagem.pendentes} sem passagem · ${contagem.prontas} prontas para buscar`);
  }, [contagem, data.isLoading, onResumo]);

  // ── Seleção e prévia ──
  const idsSelecionados = useMemo(() => Array.from(selecionadas).filter((id) => linhaPorId.has(id)), [selecionadas, linhaPorId]);
  const pedido = useMemo<VagaDoPedido[]>(() => idsSelecionados.map((id) => {
    const aj = linhaPorId.get(id)?.ajuste ?? {};
    return Object.keys(aj).length ? { id, ajuste: aj } : { id };
  }), [idsSelecionados, linhaPorId]);
  const busca = useBuscaDePassagens(pedido);
  const rotas = useMemo(() => busca.resposta?.rotas ?? [], [busca.resposta]);
  const semPreco = rotas.filter((r) => !r.resultado);
  const compradasNaSelecao = idsSelecionados.filter((id) => linhaPorId.get(id)?.comprada).length;
  const consumoAtual = busca.resposta?.consumo ?? consumo.data;
  const teto = consumoAtual ? situacaoDoTeto(consumoAtual.usadas, consumoAtual.teto) : "ok";
  const naoConfigurada = consumoAtual ? consumoAtual.fornecedor === null : false;
  const restam = consumoAtual ? Math.max(0, consumoAtual.teto - consumoAtual.usadas) : Infinity;

  const alternar = useCallback((id: string) => {
    setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const todasVisiveis = visiveis.length > 0 && visiveis.every((l) => selecionadas.has(l.vaga.id));
  const algumaVisivel = visiveis.some((l) => selecionadas.has(l.vaga.id));
  const alternarTodas = () => setSelecionadas((s) => {
    const n = new Set(s);
    if (todasVisiveis) visiveis.forEach((l) => n.delete(l.vaga.id)); else visiveis.forEach((l) => n.add(l.vaga.id));
    return n;
  });
  const ajustar = useCallback((vagaId: string, patch: Partial<AjusteDaBusca>) => {
    setAjustes((a) => ({ ...a, [vagaId]: { ...a[vagaId], ...patch } }));
    setSelecionadas((s) => (s.has(vagaId) ? s : new Set(s).add(vagaId)));
  }, []);

  // ── Ações que gastam (cada uma diz quanto na tela) ──
  const buscarPrecos = () => {
    setPainel(true);
    if (semPreco.length > 0) busca.buscar({ extra: { consultar: semPreco.map((r) => r.chave) } });
  };
  const comAjuste = (rota: RotaNaTela, patch: Partial<AjusteDaBusca>) => {
    const ids = new Set(rota.vagas.map((v) => v.vagaId));
    setAjustes((a) => ({ ...a, ...Object.fromEntries(Array.from(ids).map((id) => [id, { ...a[id], ...patch }])) }));
    const novo = pedido.map((p) => (ids.has(p.id) ? { id: p.id, ajuste: { ...(p.ajuste ?? {}), ...patch } } : p));
    busca.buscar({ extra: { consultarVagas: Array.from(ids) }, vagas: novo });
  };
  const acoes: AcoesDaRota = {
    atualizar: (r) => busca.buscar({ extra: { atualizar: [r.chave] } }),
    datasFlexiveis: (r) => busca.buscar({ extra: { flex: [r.chave] } }),
    consultar: (r) => busca.buscar({ extra: { consultar: [r.chave] } }),
    duasConexoes: (r) => comAjuste(r, { maxParadas: 2 }),
    trocarSaida: (r, iata) => comAjuste(r, { aeroportoDeCasa: iata }),
    usar: (vagaId: string, rota: RotaNaTela, opcao: OpcaoAvaliada, resultado: ResultadoNaTela) => {
      const perna = rota.vagas.find((v) => v.vagaId === vagaId)?.perna ?? rota.perna;
      setRegistro({ vagaId, voo: { itinerario: opcao.itinerario, perna, chave: rota.chave, vistoEm: resultado.consultadoEm, idaVemDeInclusionId: rota.trechoDireto ? trechoDiretoDe[vagaId] ?? null : null } });
    },
  };
  const andamento = busca.pedidoEmAndamento;
  const chavesEmAndamento = useMemo(() => {
    const s = new Set<string>([...(andamento?.consultar ?? []), ...(andamento?.atualizar ?? [])]);
    for (const r of rotas) {
      if (andamento?.consultarVagas?.some((id) => r.vagas.some((v) => v.vagaId === id))) s.add(r.chave);
      if (andamento?.flex?.includes(r.chave)) s.add(r.chave);
    }
    return s;
  }, [andamento, rotas]);
  const vagaPorId = useMemo(() => new Map<string, VagaDaOpcao>(linhas.map((l) => [l.vaga.id, {
    id: l.vaga.id, numero: l.vaga.inclusionNumber ?? null, nome: l.colaborador, comprada: l.comprada, valorPagoCentavos: l.valorPagoCentavos,
  }])), [linhas]);

  // ── Estados da tela ──
  if (data.isLoading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Carregando escalações…</span>
        <div aria-hidden="true" className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className={`space-y-2 px-3.5 pb-3.5 pt-3 ${i ? "sm:border-l border-border" : ""}`}><div className="pas-osso h-3 w-20" /><div className="pas-osso h-5 w-28" /></div>)}
        </div>
        <div aria-hidden="true" className="flex gap-2"><div className="pas-osso h-[34px] max-w-[320px] flex-[1_1_220px] rounded-lg" /><div className="pas-osso hidden h-[34px] w-[160px] rounded-lg sm:block" /><div className="pas-osso hidden h-[34px] w-[150px] rounded-lg sm:block" /></div>
        <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden h-10 border-b border-border bg-surface-muted lg:block" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0">
              <div className="pas-osso h-4 w-4" /><div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-2/5" /><div className="pas-osso h-2.5 w-1/4" /></div>
              <div className="pas-osso hidden h-3.5 w-28 md:block" /><div className="pas-osso hidden h-3.5 w-24 md:block" /><div className="pas-osso h-[22px] w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (data.loadError) {
    return (
      <div role="alert" className="pas-entra flex flex-col items-center rounded-xl border border-danger/25 bg-card px-6 py-14 text-center">
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger" aria-hidden="true"><AlertCircle className="h-5 w-5" /></span>
        <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar as escalações</h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{data.loadError.body?.message || "Verifique sua conexão e tente novamente."}</p>
        <Button variant="outline" onClick={data.retryLoad} className="mt-5 rounded-lg"><RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
      </div>
    );
  }

  const nSel = idsSelecionados.length;
  const temFiltro = JSON.stringify({ ...filtros, situacao: "pendentes" }) !== JSON.stringify(FILTROS_PADRAO);
  const bloqueadoPeloTeto = semPreco.length > 0 && (teto === "atingido" || semPreco.length > restam);
  return (
    <>
      {/* Avisos de configuração e de teto — acima de tudo, só quando existem. */}
      {naoConfigurada && (
        <div role="alert" className="pas-entra flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft/50 px-4 py-3" data-testid="busca-nao-configurada">
          <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
          <p className="m-0 text-sm text-foreground"><span className="font-semibold">A busca de preços ainda não está ligada.</span> <span className="text-slate-600">Falta o Secret IGNAV_API_KEY no servidor. A lista e os dados que faltam continuam funcionando.</span></p>
        </div>
      )}
      {!naoConfigurada && teto !== "ok" && (
        <div role={teto === "atingido" ? "alert" : "status"} className={`pas-entra flex items-start gap-2.5 rounded-xl border px-4 py-3 ${teto === "atingido" ? "border-danger/25 bg-danger-soft/50" : "border-warning/30 bg-warning-soft/50"}`} data-testid={`teto-${teto}`}>
          <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${teto === "atingido" ? "text-danger" : "text-warning-strong"}`} aria-hidden="true" />
          <p className="m-0 text-sm text-foreground">
            {teto === "atingido"
              ? <><span className="font-semibold">Teto de {consumoAtual?.teto.toLocaleString("pt-BR")} consultas deste mês atingido.</span> <span className="text-slate-600">Novas buscas voltam no dia 1º (ou quando o administrador aumentar o teto). Preços já consultados nas últimas {consumoAtual?.cacheHoras} h continuam aparecendo.</span></>
              : <><span className="font-semibold">{consumoAtual?.usadas.toLocaleString("pt-BR")} de {consumoAtual?.teto.toLocaleString("pt-BR")} consultas usadas este mês.</span> <span className="text-slate-600">Restam {restam.toLocaleString("pt-BR")}. Prefira buscar várias escalações juntas — rotas iguais viram uma consulta só.</span></>}
          </p>
        </div>
      )}
      {consumoAtual?.fornecedor?.simulado && (
        <p className="m-0 -mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-info-strong" aria-hidden="true" />Ambiente de demonstração: os preços são simulados (sem a chave do fornecedor).</p>
      )}

      <FilaDeTrabalho<Situacao>
        rotulo="Situação das escalações"
        ativa={filtros.situacao}
        onEscolher={(k) => onFiltros({ ...filtros, situacao: k ?? "todas" })}
        testid={(k) => `situacao-${k}`}
        blocos={[
          { key: "pendentes", rotulo: "Pendentes", n: contagem.pendentes, sub: contagem.faltando ? `${contagem.prontas} prontas · ${contagem.faltando} com falta` : "sem passagem registrada", icone: ICONE_SITUACAO.pendentes, cor: COR_SITUACAO.pendentes },
          { key: "compradas", rotulo: "Compradas", n: contagem.compradas, sub: "comparar o pago com o de hoje", icone: ICONE_SITUACAO.compradas, cor: COR_SITUACAO.compradas },
          { key: "todas", rotulo: "Todas", n: contagem.todas, sub: "pendentes e compradas", icone: ICONE_SITUACAO.todas, cor: COR_SITUACAO.todas },
        ]}
      />

      <BarraDeFiltrosDaBusca
        filtros={filtros}
        onChange={onFiltros}
        eventos={opcoesDosFiltros.eventos}
        saidas={opcoesDosFiltros.saidas}
        destinos={opcoesDosFiltros.destinos}
        funcoes={opcoesDosFiltros.funcoes}
        count={visiveis.length}
        total={contagem[filtros.situacao]}
      />

      <div className="overflow-clip rounded-xl border border-border bg-card">
        {visiveis.length === 0 ? (
          <div className="pas-entra flex flex-col items-center px-6 py-14 text-center" data-testid="busca-vazia">
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">{temFiltro ? <Search className="h-5 w-5" /> : <PlaneTakeoff className="h-5 w-5" />}</span>
            <h2 className="m-0 text-base font-semibold text-foreground">
              {temFiltro ? "Nenhuma escalação com estes filtros" : filtros.situacao === "compradas" ? "Nenhuma passagem comprada ainda" : "Nenhuma escalação esperando passagem aérea"}
            </h2>
            <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
              {temFiltro ? "Tire um filtro para ver mais escalações." : filtros.situacao === "pendentes" ? "Quando uma escalação confirmada precisar de voo, ela aparece aqui para buscar o preço." : "As escalações com passagem registrada aparecem aqui para comparar o preço pago com o de hoje."}
            </p>
            {temFiltro
              ? <Button variant="outline" onClick={() => onFiltros({ ...FILTROS_PADRAO, situacao: filtros.situacao })} className="mt-5 rounded-lg"><X className="mr-1.5 h-4 w-4" aria-hidden="true" />Limpar filtros</Button>
              : filtros.situacao === "pendentes" && contagem.compradas > 0 && <Button variant="outline" onClick={() => onFiltros({ ...filtros, situacao: "compradas" })} className="mt-5 rounded-lg">Ver compradas ({contagem.compradas})</Button>}
          </div>
        ) : (
          <div role="grid" aria-label="Escalações que precisam de passagem" aria-multiselectable="true" aria-rowcount={visiveis.length}>
            <CabecaDaLista todasMarcadas={todasVisiveis} algumaMarcada={algumaVisivel} onTodas={alternarTodas} n={visiveis.length} />
            <ul className="m-0 list-none p-0" role="rowgroup">
              {visiveis.map((l, i) => (
                <LinhaDeEscalacao key={l.vaga.id} l={l} indice={i} selecionada={selecionadas.has(l.vaga.id)} onAlternar={alternar} onAjustar={ajustar} podeCorrigir={podeCorrigir} />
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-muted/60 px-4 py-2 text-xs text-muted-foreground lg:hidden">
              <button type="button" onClick={alternarTodas} className="h-8 rounded-md px-2 font-medium text-primary hover:bg-brand-soft">{todasVisiveis ? "Desmarcar todas" : `Selecionar as ${visiveis.length}`}</button>
              <span className="tabular-nums">{plural(visiveis.length, "escalação", "escalações")}</span>
            </div>
          </div>
        )}
      </div>

      {/* SELEÇÃO: a prévia de consumo antes de gastar, sempre à vista no rodapé. */}
      <BarraDeSelecao
        nSel={nSel}
        resposta={busca.resposta}
        previaCarregando={busca.previaCarregando}
        erro={busca.erro}
        buscando={busca.buscando}
        painelAberto={painel}
        bloqueadoPeloTeto={bloqueadoPeloTeto}
        naoConfigurada={naoConfigurada}
        compradas={compradasNaSelecao}
        onLimpar={() => setSelecionadas(new Set())}
        onVerPainel={() => setPainel(true)}
        onBuscar={buscarPrecos}
      />

      <PainelDeResultados
        aberto={painel}
        onFechar={() => setPainel(false)}
        resposta={busca.resposta}
        erro={busca.erro}
        buscando={busca.buscando}
        chavesEmAndamento={chavesEmAndamento}
        vagaPorId={vagaPorId}
        acoes={acoes}
        previstas={semPreco.length}
        onBuscarTudo={() => busca.buscar({ extra: { consultar: semPreco.map((r) => r.chave) } })}
      />

      {registro && data.teamInclusions && (() => {
        const vaga = data.teamInclusions.find((v) => v.id === registro.vagaId);
        return vaga ? <RegistroPeloVoo data={data} user={user} vaga={vaga} voo={registro.voo} onFechar={() => setRegistro(null)}
          onRegistrado={(id) => setSelecionadas((s) => { const n = new Set(s); n.delete(id); return n; })} /> : null;
      })()}
    </>
  );
}

