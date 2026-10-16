/**
 * RESULTADOS da Busca de passagens (16/10) — tela própria, não um painel
 * sobre a lista (dono: "essa busca tem que levar para outra tela").
 *
 * A lista (/busca-de-passagens) monta a seleção e mostra a prévia de consumo;
 * "Buscar preços" / "Ver preços" e os atalhos (Passagens, trecho direto,
 * aviso de alteração, Previsão) trazem para cá com o estado na URL
 * (resultados/estado-dos-resultados.ts): recarregar ou mandar o link abre a
 * mesma busca — a prévia é de graça e o que está no cache volta sem gastar.
 *
 * Mesmas regras de antes: só gasta consulta o que um clique autoriza, com o
 * custo escrito no botão; o registro é o MESMO modal de Passagens.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, ArrowLeft, CircleAlert, CircleSlash, Lock, PlaneTakeoff, RotateCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { hasPermission } from "@/lib/role-utils";
import { toTitleCase } from "@/lib/format";
import { hojeISO } from "@shared/hoje-sp";
import { diaDe } from "@shared/janela-de-viagem";
import { alertasDeGrupo, type PernaParaGrupo } from "@shared/regras-da-busca";
import { situacaoDoTeto, type AjusteDaBusca, type OpcaoAvaliada, type ResultadoNaTela, type RotaNaTela, type VagaDoPedido } from "@shared/busca-de-passagens";
import { useTicketsData } from "@/components/tickets/use-tickets-data";
import { DEFAULT_TICKET_FILTERS } from "@/components/tickets/types";
import { montarLinhas } from "@/components/busca-de-passagens/linhas-da-busca";
import { useAcompanhamentos, useAcoesDoAcompanhamento, useAeroportosConfirmados, useBuscaDePassagens, useConsumoDaBusca } from "@/components/busca-de-passagens/use-busca-de-passagens";
import { ConsumoNaBarra } from "@/components/busca-de-passagens/consumo";
import { AvisoDeRemarcacao } from "@/components/busca-de-passagens/extras-da-busca";
import { RegistroPeloVoo } from "@/components/busca-de-passagens/registro-pelo-voo";
import type { VagaDaOpcao } from "@/components/busca-de-passagens/opcao-de-voo";
import type { VooEscolhido } from "@/components/busca-de-passagens/voo-para-formulario";
import { plural } from "@/components/busca-de-passagens/formato";
import { CAMINHO_DOS_RESULTADOS, escreverResultados, lerResultados, linkDaLista, type FiltrosDasOpcoes } from "@/components/busca-de-passagens/resultados/estado-dos-resultados";
import { BotaoQueGasta, type AcoesDaRota } from "@/components/busca-de-passagens/resultados/acoes-que-gastam";
import { NavegacaoDeRotas, resumoDaRota, type ResumoDaRota } from "@/components/busca-de-passagens/resultados/navegacao-de-rotas";
import { RotaEscolhida } from "@/components/busca-de-passagens/resultados/rota-escolhida";
import { EscalacoesDaRota, type PessoaDaRota } from "@/components/busca-de-passagens/resultados/escalacoes-da-rota";

/** Registro em andamento: a opção escolhida e a fila de escalações (uma ou todas as da rota). */
interface RegistroEmFila { fila: string[]; i: number; rota: RotaNaTela; opcao: OpcaoAvaliada; resultado: ResultadoNaTela }

function Esqueleto() {
  return (
    <div role="status" aria-busy="true" className="bpr-grade" data-testid="resultados-carregando">
      <span className="sr-only">Carregando a busca…</span>
      <div data-area="nav" className="bpr-nav" aria-hidden="true">
        <div className="pas-osso mb-2 h-3 w-16" />
        <div className="bpr-rotas">{[0, 1, 2].map((i) => <div key={i} className="bpr-rota"><div className="pas-osso h-4 w-28" /><div className="pas-osso mt-1.5 h-3 w-36" /></div>)}</div>
      </div>
      <div data-area="cabeca" className="bpr-cabeca" aria-hidden="true"><div className="pas-osso h-6 w-48" /><div className="pas-osso mt-2 h-4 w-80 max-w-full" /></div>
      <div data-area="lista" className="space-y-1.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3.5"><div className="pas-osso h-7 w-9" /><div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-2/5" /><div className="pas-osso h-3 w-3/5" /></div><div className="pas-osso h-5 w-24" /></div>)}
      </div>
    </div>
  );
}

function Vazio({ icone, titulo, texto, children, tom = "neutro", testid }: { icone: React.ReactNode; titulo: string; texto: React.ReactNode; children?: React.ReactNode; tom?: "neutro" | "perigo"; testid: string }) {
  return (
    <div role={tom === "perigo" ? "alert" : undefined} className={`pas-entra mx-auto flex max-w-[640px] flex-col items-center rounded-xl border bg-card px-6 py-14 text-center ${tom === "perigo" ? "border-danger/25" : "border-border"}`} data-testid={testid}>
      <span className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full ${tom === "perigo" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground"}`} aria-hidden="true">{icone}</span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <div className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">{texto}</div>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export default function ResultadosDaBusca() {
  usePageTitle("Preços na internet");
  const { user } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const inicial = useMemo(() => lerResultados(search), []); // eslint-disable-line react-hooks/exhaustive-deps
  const vagas = inicial.vagas;
  const [ajustesManuais, setAjustesManuais] = useState<Record<string, AjusteDaBusca>>(inicial.ajustes);
  const [rotaPedida, setRotaPedida] = useState<string | null>(inicial.rota);
  const [ancora, setAncora] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosDasOpcoes>(inicial.filtros);
  const [incluirPassados, setIncluirPassados] = useState(() => new URLSearchParams(inicial.lista).get("passados") === "1");
  const [remarcacaoAberta, setRemarcacaoAberta] = useState(inicial.remarcar);
  const [registro, setRegistro] = useState<RegistroEmFila | null>(null);
  const registrouAgora = useRef(false);
  /** Registradas aqui: continuam na busca (viram "comprada"), mas saem da seleção ao voltar à lista — como antes. */
  const [registradas, setRegistradas] = useState<ReadonlySet<string>>(() => new Set());
  const podeEntrar = hasPermission(user, "canAccessBuscaDePassagens");
  const hoje = useMemo(() => hojeISO(), []);

  const data = useTicketsData({ filters: { ...DEFAULT_TICKET_FILTERS, ticketStatus: "all" }, showOnlyPendingSwaps: false, sortConfig: null, user, somenteEventosFuturos: !incluirPassados });
  const consumo = useConsumoDaBusca(podeEntrar);
  const acompanhamentos = useAcompanhamentos(podeEntrar);
  const { acompanhar } = useAcoesDoAcompanhamento();
  const confirmados = useAeroportosConfirmados();
  const eventById = useMemo(() => {
    if (Object.keys(confirmados).length === 0) return data.eventById;
    const m = new Map(data.eventById);
    for (const [id, iata] of Object.entries(confirmados)) { const e = m.get(id); if (e) m.set(id, { ...e, aeroportoIata: iata }); }
    return m;
  }, [data.eventById, confirmados]);

  // Vaga pedida de evento que já terminou não vem no recorte padrão: traz o histórico.
  const faltamNaLista = !!data.teamInclusions && vagas.some((id) => !data.teamInclusions!.some((v) => v.id === id));
  useEffect(() => {
    if (!data.isLoading && faltamNaLista && !incluirPassados) setIncluirPassados(true);
  }, [data.isLoading, faltamNaLista, incluirPassados]);

  // Atalhos: trecho direto (a ida sai do evento anterior) e remarcação (datas NOVAS da escalação).
  const anterior = useMemo(() => (inicial.idaDe ? data.teamInclusions?.find((v) => v.id === inicial.idaDe) ?? null : null), [data.teamInclusions, inicial.idaDe]);
  const derivados = useMemo(() => {
    const out: Record<string, AjusteDaBusca> = {};
    if (inicial.remarcar) {
      for (const v of data.teamInclusions ?? []) {
        if (!inicial.vagas.includes(v.id)) continue;
        const ida = diaDe(v.flightDepartureDate), volta = diaDe(v.flightReturnDate);
        out[v.id] = { ...(ida ? { dataIda: ida } : {}), ...(volta ? { dataVolta: volta } : {}) };
      }
    }
    if (anterior) for (const id of inicial.vagas) out[id] = { ...out[id], idaDoEventoId: anterior.eventId, somente: "ida" };
    return out;
  }, [data.teamInclusions, inicial.remarcar, inicial.vagas, anterior]);
  const ajustes = useMemo(() => {
    const out: Record<string, AjusteDaBusca> = { ...derivados };
    for (const [id, a] of Object.entries(ajustesManuais)) out[id] = { ...out[id], ...a };
    return out;
  }, [derivados, ajustesManuais]);
  const remarcacao = useMemo(() => (inicial.remarcar ? (data.teamInclusions ?? []).filter((v) => inicial.vagas.includes(v.id))
    .map((v) => ({ numero: v.inclusionNumber ?? null, ida: diaDe(v.flightDepartureDate), volta: diaDe(v.flightReturnDate) })) : []), [data.teamInclusions, inicial.remarcar, inicial.vagas]);

  // ── Linhas (mesma regra do servidor) ──
  const linhas = useMemo(() => montarLinhas({
    vagas: data.filteredTicketInclusions, eventById, collaboratorById: data.collaboratorById, ticketByInclusion: data.ticketByInclusion,
    nomeDoColaborador: data.getCollaboratorName, nomeDaFuncao: data.getFunctionName, ajustes, hoje,
  }), [data.filteredTicketInclusions, eventById, data.collaboratorById, data.ticketByInclusion, data.getCollaboratorName, data.getFunctionName, ajustes, hoje]);
  const linhaPorId = useMemo(() => new Map(linhas.map((l) => [l.vaga.id, l])), [linhas]);
  const pronto = !data.isLoading && !!data.teamInclusions && (!faltamNaLista || incluirPassados);
  const pedido = useMemo<VagaDoPedido[]>(() => (pronto ? vagas.filter((id) => linhaPorId.has(id)).map((id) => {
    const aj = linhaPorId.get(id)!.ajuste;
    return Object.keys(aj).length ? { id, ajuste: aj } : { id };
  }) : []), [pronto, vagas, linhaPorId]);
  const busca = useBuscaDePassagens(pedido, { flex: inicial.flex, alternativas: inicial.alternativas });
  const rotas = useMemo(() => busca.resposta?.rotas ?? [], [busca.resposta]);
  const semPreco = rotas.filter((r) => !r.resultado);
  const consumoAtual = busca.resposta?.consumo ?? consumo.data;
  const teto = consumoAtual ? situacaoDoTeto(consumoAtual.usadas, consumoAtual.teto) : "ok";
  const naoConfigurada = consumoAtual ? consumoAtual.fornecedor === null : false;
  const restam = consumoAtual ? Math.max(0, consumoAtual.teto - consumoAtual.usadas) : Infinity;
  const bloqueadoPeloTeto = semPreco.length > 0 && (teto === "atingido" || semPreco.length > restam);
  const simulado = !!consumoAtual?.fornecedor?.simulado;

  // "Buscar preços" na lista: as rotas sem preço da prévia são consultadas UMA vez (o `buscar=1` já saiu da URL).
  const buscaPedida = useRef(inicial.buscar);
  useEffect(() => {
    if (!buscaPedida.current || !busca.resposta || busca.previaCarregando || busca.buscando) return;
    buscaPedida.current = false;
    const faltam = busca.resposta.rotas.filter((r) => !r.resultado).map((r) => r.chave);
    const c = busca.resposta.consumo;
    const cabe = c.fornecedor !== null && c.usadas < c.teto && faltam.length <= Math.max(0, c.teto - c.usadas);
    if (faltam.length > 0 && cabe) busca.buscar({ extra: { consultar: faltam } });
  }, [busca]);

  // ── Rota aberta: a pedida; se a chave mudou (2 conexões, outro aeroporto), a que tem as mesmas escalações ──
  const escolhida = rotas.find((r) => r.chave === rotaPedida)
    ?? (ancora ? rotas.find((r) => r.vagas.some((v) => v.vagaId === ancora)) : undefined)
    ?? rotas[0] ?? null;
  useEffect(() => {
    if (!escolhida) return;
    if (escolhida.chave !== rotaPedida) setRotaPedida(escolhida.chave);
    const a = escolhida.vagas[0]?.vagaId ?? null;
    if (a !== ancora) setAncora(a);
  }, [escolhida, rotaPedida, ancora]);

  // ── Estado na URL (replace): recarregar ou mandar o link abre a mesma busca ──
  const qs = escreverResultados({
    vagas, ajustes: ajustesManuais, idaDe: inicial.idaDe, remarcar: inicial.remarcar, rota: escolhida?.chave ?? rotaPedida,
    flex: busca.mostrando.flex, alternativas: busca.mostrando.alternativas, filtros, lista: inicial.lista,
  });
  useEffect(() => {
    if (qs !== search.replace(/^\?/, "")) setLocation(`${CAMINHO_DOS_RESULTADOS}?${qs}`, { replace: true });
  }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ações da rota (as mesmas de antes; cada botão diz quanto gasta) ──
  const comAjuste = useCallback((rota: RotaNaTela, patch: Partial<AjusteDaBusca>, mostrarAlternativas?: string[]) => {
    const ids = new Set(rota.vagas.map((v) => v.vagaId));
    setAjustesManuais((a) => ({ ...a, ...Object.fromEntries(Array.from(ids).map((id) => [id, { ...a[id], ...patch }])) }));
    const novo = pedido.map((p) => (ids.has(p.id) ? { id: p.id, ajuste: { ...(p.ajuste ?? {}), ...patch } } : p));
    busca.buscar({ extra: { consultarVagas: Array.from(ids), ...(mostrarAlternativas ? { mostrarAlternativas } : {}) }, vagas: novo });
  }, [pedido, busca]);
  const acoes: AcoesDaRota = {
    atualizar: (r) => busca.buscar({ extra: { atualizar: [r.chave] } }),
    datasFlexiveis: (r) => busca.buscar({ extra: { flex: [r.chave] } }),
    consultar: (r) => busca.buscar({ extra: { consultar: [r.chave] } }),
    duasConexoes: (r) => comAjuste(r, { maxParadas: 2 }),
    trocarSaida: (r, iata) => comAjuste(r, { aeroportoDeCasa: iata }),
    semHorario: (r) => comAjuste(r, { semHorario: true }),
    testarAlternativas: (r) => busca.buscar({ extra: { alternativas: [r.chave] } }),
    usarAlternativa: (r, alt) => comAjuste(r, alt.lado === "casa" ? { aeroportoDeCasa: alt.iata } : { aeroportoDoEvento: alt.iata }, [alt.chave]),
    usar: (vagaId, rota, opcao, resultado) => setRegistro({ fila: [vagaId], i: 0, rota, opcao, resultado }),
    usarParaTodas: (rota, opcao, resultado) => {
      const fila = rota.vagas.map((v) => v.vagaId).filter((id) => linhaPorId.get(id) && !linhaPorId.get(id)!.comprada);
      if (fila.length) setRegistro({ fila, i: 0, rota, opcao, resultado });
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
  const resumos = useMemo(() => new Map<string, ResumoDaRota>(rotas.map((r) => [r.chave, resumoDaRota(r, chavesEmAndamento.has(r.chave) && !r.resultado)])), [rotas, chavesEmAndamento]);
  const vagaPorId = useMemo(() => new Map<string, VagaDaOpcao>(linhas.map((l) => [l.vaga.id, {
    id: l.vaga.id, numero: l.vaga.inclusionNumber ?? null, nome: l.colaborador, comprada: l.comprada, valorPagoCentavos: l.valorPagoCentavos,
  }])), [linhas]);

  // ── Quem viaja, acompanhar preço e alerta de grupo ──
  const acompanhadas = useMemo(() => new Set((acompanhamentos.data?.itens ?? []).filter((i) => i.ativo).map((i) => i.teamInclusionId)), [acompanhamentos.data]);
  const pessoas = useMemo<PessoaDaRota[]>(() => (escolhida?.vagas ?? []).map((v) => linhaPorId.get(v.vagaId)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({
    id: l.vaga.id, numero: l.vaga.inclusionNumber ?? null, nome: l.colaborador, funcao: l.funcao, evento: l.evento?.name ?? "Evento",
    chegarAte: l.chegarAte, sairApos: l.sairApos, comprada: l.comprada, valorPagoCentavos: l.valorPagoCentavos, acompanhando: acompanhadas.has(l.vaga.id),
  })), [escolhida, linhaPorId, acompanhadas]);
  const alertasDaRota = useMemo(() => {
    if (!escolhida) return [];
    const pernas: PernaParaGrupo[] = [];
    for (const l of linhas) {
      if (l.comprada || l.faltas.length > 0) continue;
      const base = { vagaId: l.vaga.id, numero: l.vaga.inclusionNumber ?? null, nome: l.colaborador };
      for (const r of l.rotas) {
        pernas.push({ ...base, origem: r.origem, destino: r.destino, data: r.dataIda });
        if (r.perna === "ida_e_volta" && r.dataVolta) pernas.push({ ...base, origem: r.destino, destino: r.origem, data: r.dataVolta });
      }
    }
    const r = escolhida;
    return alertasDeGrupo(pernas).filter((a) =>
      (a.origem === r.origem && a.destino === r.destino && a.data === r.dataIda)
      || (r.perna === "ida_e_volta" && a.origem === r.destino && a.destino === r.origem && a.data === r.dataVolta));
  }, [linhas, escolhida]);
  const acompanharVaga = useCallback((vagaId: string) => {
    acompanhar.mutate({ teamInclusionId: vagaId, ajuste: linhaPorId.get(vagaId)?.ajuste }, {
      onSuccess: (r) => toast({ title: r.jaExistia ? "Já estava acompanhando" : "Acompanhando o preço", description: "O app checa uma vez por dia e avisa no sino se cair ou se a tendência virar “subir”. Não gastou consulta agora." }),
      onError: (e) => toast({ title: "Não foi possível acompanhar", description: apiErrorMessage(e, "Tente de novo."), variant: "destructive" }),
    });
  }, [acompanhar, linhaPorId, toast]);

  const voltar = linkDaLista(inicial.lista, vagas.filter((id) => !registradas.has(id)), ajustes);
  const nEscalacoes = new Set(rotas.flatMap((r) => r.vagas.map((v) => v.vagaId))).size;
  const faltando = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of busca.resposta?.faltando ?? []) m.set(f.vagaId, [...(m.get(f.vagaId) ?? []), f.mensagem]);
    return Array.from(m.entries());
  }, [busca.resposta]);

  // ── Barra de contexto (56px) ──
  const resumo = !pronto || (!busca.resposta && pedido.length > 0)
    ? "Carregando a busca…"
    : `${plural(rotas.length, "rota", "rotas")} · ${plural(nEscalacoes, "escalação", "escalações")} · LATAM, GOL e Azul · preço por pessoa`;
  const barra = (
    <header className="bpr-barra" data-testid="barra-resultados">
      <Link href={voltar} className="pas-alvo inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg pl-1.5 pr-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="voltar-as-escalacoes">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Voltar às escalações</span><span className="sm:hidden">Escalações</span>
      </Link>
      <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
      <div className="min-w-0 flex-1">
        <h1 className="m-0 truncate text-base font-semibold leading-5 text-foreground">Preços na internet</h1>
        <p className="m-0 truncate text-xs leading-4 text-muted-foreground" aria-live="polite" data-testid="resumo-resultados" title={resumo}>{resumo}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {simulado && (
          <span className="hidden h-[22px] items-center gap-1 rounded-md bg-info-soft px-2 text-2xs font-medium text-info-strong sm:inline-flex" title="Sem a chave do fornecedor: preços fictícios para demonstração">
            <Sparkles className="h-3 w-3" aria-hidden="true" />Preços simulados
          </span>
        )}
        <ConsumoNaBarra consumo={consumoAtual} mes={hoje.slice(0, 7)} />
        {semPreco.length > 0 && !busca.buscando && (
          <BotaoQueGasta onClick={() => busca.buscar({ extra: { consultar: semPreco.map((r) => r.chave) } })} disabled={bloqueadoPeloTeto || naoConfigurada} custo={semPreco.length} primario testid="buscar-as-que-faltam">
            <span className="hidden md:inline">Buscar {semPreco.length === 1 ? "a rota sem preço" : `as ${semPreco.length} sem preço`}</span><span className="md:hidden">Buscar</span>
          </BotaoQueGasta>
        )}
        {busca.buscando && <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 text-xs font-medium text-primary" role="status"><RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Consultando…</span>}
      </div>
    </header>
  );

  // ── Estados da tela ──
  let corpo: React.ReactNode;
  if (!podeEntrar) {
    corpo = <Vazio testid="resultados-sem-acesso" icone={<Lock className="h-5 w-5" />} titulo="Acesso negado" texto="A busca de preços é de Compras e do administrador." />;
  } else if (vagas.length === 0) {
    corpo = (
      <Vazio testid="resultados-sem-vagas" icone={<PlaneTakeoff className="h-5 w-5" />} titulo="Nenhuma escalação nesta busca" texto="Escolha as escalações na lista e use “Buscar preços”. Os preços já consultados nas últimas horas voltam sem gastar.">
        <Button asChild className="rounded-lg"><Link href={voltar}>Escolher escalações</Link></Button>
      </Vazio>
    );
  } else if (data.loadError) {
    corpo = (
      <Vazio testid="resultados-erro" tom="perigo" icone={<AlertCircle className="h-5 w-5" />} titulo="Não foi possível carregar as escalações" texto={data.loadError.body?.message || "Verifique sua conexão e tente novamente."}>
        <Button variant="outline" onClick={data.retryLoad} className="rounded-lg"><RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
      </Vazio>
    );
  } else if (!pronto || (pedido.length > 0 && !busca.resposta && !busca.erro)) {
    corpo = <Esqueleto />;
  } else if (pedido.length === 0) {
    corpo = (
      <Vazio testid="resultados-vagas-fora" icone={<PlaneTakeoff className="h-5 w-5" />} titulo="As escalações desta busca não estão mais esperando passagem aérea" texto="Elas podem ter sido removidas, trocadas para outro transporte ou já não precisar de passagem.">
        <Button asChild className="rounded-lg"><Link href={voltar}>Voltar às escalações</Link></Button>
      </Vazio>
    );
  } else if (rotas.length === 0) {
    corpo = (
      <Vazio testid="resultados-sem-rotas" icone={<TriangleAlert className="h-5 w-5" />} titulo="Nenhuma rota pronta para buscar" texto={<>As escalações escolhidas têm dado faltando — corrija na lista e busque de novo.{faltando.length > 0 && <ul className="m-0 mt-3 list-none space-y-1 p-0 text-left text-xs">{faltando.slice(0, 6).map(([id, msgs]) => <li key={id}><span className="font-mono font-semibold text-primary">#{vagaPorId.get(id)?.numero ?? "?"}</span> {toTitleCase(vagaPorId.get(id)?.nome ?? "")} — {msgs.join(" ")}</li>)}</ul>}</>}>
        <Button asChild className="rounded-lg"><Link href={voltar}>Corrigir na lista</Link></Button>
      </Vazio>
    );
  } else {
    corpo = (
      <div className="bpr-grade">
        <div data-area="nav" className="bpr-coluna-nav">
          <NavegacaoDeRotas rotas={rotas} resumos={resumos} escolhida={escolhida?.chave ?? null} onEscolher={setRotaPedida} vagaPorId={vagaPorId} />
        </div>
        {escolhida && (
          <RotaEscolhida
            key={escolhida.chave}
            rota={escolhida}
            vagas={escolhida.vagas.map((v) => vagaPorId.get(v.vagaId)).filter((v): v is VagaDaOpcao => !!v)}
            acoes={acoes}
            ocupado={busca.buscando}
            carregandoEsta={chavesEmAndamento.has(escolhida.chave)}
            simulado={simulado}
            filtros={filtros}
            onFiltros={setFiltros}
            lado={<EscalacoesDaRota pessoas={pessoas} onAcompanhar={acompanharVaga} acompanhandoAgora={acompanhar.isPending ? acompanhar.variables?.teamInclusionId ?? null : null} alertas={alertasDaRota} />}
          />
        )}
      </div>
    );
  }

  const registroAtual = registro ? data.teamInclusions?.find((v) => v.id === registro.fila[registro.i]) ?? null : null;
  const vooDoRegistro: VooEscolhido | null = registro && registroAtual ? {
    itinerario: registro.opcao.itinerario,
    perna: registro.rota.vagas.find((v) => v.vagaId === registroAtual.id)?.perna ?? registro.rota.perna,
    chave: registro.rota.chave,
    vistoEm: registro.resultado.consultadoEm,
    idaVemDeInclusionId: registro.rota.trechoDireto && anterior && inicial.vagas.includes(registroAtual.id) ? anterior.id : null,
  } : null;

  return (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra}
      <div className="px-[var(--page-gutter)] pb-8 pt-4">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3">
          {podeEntrar && naoConfigurada && (
            <div role="alert" className="pas-entra flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft/50 px-4 py-3" data-testid="busca-nao-configurada">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
              <p className="m-0 text-sm text-foreground"><span className="font-semibold">A busca de preços ainda não está ligada.</span> <span className="text-slate-600">Falta o Secret IGNAV_API_KEY no servidor. Só aparece o que já estiver no cache.</span></p>
            </div>
          )}
          {podeEntrar && !naoConfigurada && teto !== "ok" && (
            <div role={teto === "atingido" ? "alert" : "status"} className={`pas-entra flex items-start gap-2.5 rounded-xl border px-4 py-3 ${teto === "atingido" ? "border-danger/25 bg-danger-soft/50" : "border-warning/30 bg-warning-soft/50"}`} data-testid={`teto-${teto}`}>
              <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${teto === "atingido" ? "text-danger" : "text-warning-strong"}`} aria-hidden="true" />
              <p className="m-0 text-sm text-foreground">
                {teto === "atingido"
                  ? <><span className="font-semibold">Teto de {consumoAtual?.teto.toLocaleString("pt-BR")} consultas deste mês atingido.</span> <span className="text-slate-600">Novas consultas voltam no dia 1º (ou quando o administrador aumentar o teto). O que está no cache das últimas {consumoAtual?.cacheHoras} h continua aparecendo.</span></>
                  : <><span className="font-semibold">{consumoAtual?.usadas.toLocaleString("pt-BR")} de {consumoAtual?.teto.toLocaleString("pt-BR")} consultas usadas este mês.</span> <span className="text-slate-600">Restam {restam.toLocaleString("pt-BR")}.</span></>}
              </p>
            </div>
          )}
          {busca.erro && (
            <div role="alert" className={`pas-entra flex items-start gap-2.5 rounded-xl border px-4 py-3 ${busca.erro.tipo === "teto" ? "border-danger/25 bg-danger-soft/50" : "border-warning/30 bg-warning-soft/50"}`} data-testid="erro-da-busca">
              <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${busca.erro.tipo === "teto" ? "text-danger" : "text-warning-strong"}`} aria-hidden="true" />
              <p className="m-0 text-sm text-foreground">
                <span className="font-semibold">{busca.erro.tipo === "teto" ? "Teto de consultas do mês." : busca.erro.tipo === "nao_configurada" ? "Busca não configurada." : "A busca não respondeu."}</span>{" "}
                <span className="text-slate-600">{busca.erro.mensagem}</span>
              </p>
            </div>
          )}
          {remarcacaoAberta && <AvisoDeRemarcacao numeros={remarcacao} onFechar={() => setRemarcacaoAberta(false)} />}
          {rotas.length > 0 && faltando.length > 0 && (
            <div role="status" className="pas-entra flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-warning/30 bg-warning-soft/40 px-4 py-2.5" data-testid="faltando-na-busca">
              <TriangleAlert className="h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
              <p className="m-0 min-w-0 flex-1 basis-[260px] text-sm leading-5 text-foreground">
                <span className="font-semibold">{plural(faltando.length, "escalação ficou de fora", "escalações ficaram de fora")} por dado faltando:</span>{" "}
                <span className="text-slate-600">{faltando.slice(0, 3).map(([id, msgs]) => `#${vagaPorId.get(id)?.numero ?? "?"} (${msgs[0].replace(/\.$/, "").toLowerCase()})`).join(", ")}{faltando.length > 3 ? ` e mais ${faltando.length - 3}` : ""}.</span>
              </p>
              <Link href={voltar} className="pas-alvo inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted">Corrigir na lista</Link>
            </div>
          )}
          {corpo}
        </div>
      </div>

      {registro && registroAtual && vooDoRegistro && (
        <RegistroPeloVoo
          key={`${registroAtual.id}-${registro.i}`}
          data={data}
          user={user}
          vaga={registroAtual}
          voo={vooDoRegistro}
          fila={{ atual: registro.i + 1, total: registro.fila.length }}
          onRegistrado={(id) => { registrouAgora.current = true; setRegistradas((s) => new Set(s).add(id)); }}
          onFechar={() => {
            const registrou = registrouAgora.current;
            registrouAgora.current = false;
            const proxima = registro.i + 1;
            if (registrou && proxima < registro.fila.length) { setRegistro({ ...registro, i: proxima }); return; }
            if (!registrou && proxima < registro.fila.length) {
              toast({ title: "Sequência interrompida", description: `${plural(registro.fila.length - registro.i, "escalação desta rota ficou", "escalações desta rota ficaram")} sem registro.` });
            }
            setRegistro(null);
          }}
        />
      )}
    </div>
  );
}
