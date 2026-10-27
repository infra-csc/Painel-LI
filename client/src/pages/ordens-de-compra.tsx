/**
 * ORDENS DE COMPRA — tela nova do grupo Honorários (28/10, Fase 2 MANUAL do
 * Módulo de Honorários; etapas 4 a 7 do slide 7, sem integração com o M4).
 *
 * Depois da Conferência DP aprovar, o DP registra a OC gerada no M4 (uma a
 * uma ou em LOTE colado/CSV), acompanha a nota fiscal (do portal do
 * colaborador ou da produção) com a conferência OC × valor × CNPJ e, depois
 * do "Lançar no M4" em Notas fiscais (= programado), marca como PAGO — em
 * lote, aqui. Exporta as aprovadas sem OC (o "Plano B" do slide 12). Tudo
 * grava nos mesmos campos que o importador do M4 vai usar depois.
 *
 * Quem vê: admin e DP (`canAccessFinanceiro` — o mesmo `requireFinanceUser`
 * das rotas). O perfil Honorários não entra. Evento legado: não se aplica
 * (409 `evento_legado`). Contrato: server/routes/honorarios-pagamento.ts.
 *
 * A casca é a das irmãs (Presença, Notas fiscais): barra de 56px com o
 * evento como seletor e o filtro do legado; conteúdo até 1560px com o resumo
 * e a trilha, a fila por estado (conta e recorta), a busca e a lista.
 * Link direto: /ordens-de-compra?event=…&pessoa=… (id da prestação).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, AlertTriangle, Archive, BadgeCheck, Building2, CalendarClock, CircleDashed, Download, FileCheck2, FileClock, FileSearch, FileWarning,
  Layers, Receipt, RotateCw, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { QueryError } from "@/components/common/query-state";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import { EventSearchSelect } from "@/components/event-select";
import { useFiltroDoLegado, useTrilhaDoEvento } from "@/components/honorarios/use-honorarios";
import { TrilhaDoEvento } from "@/components/honorarios/trilha-do-honorario";
import { codigoDoErro } from "@/components/presenca/presenca-utils";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { campo, useUrlState } from "@/lib/use-url-state";
import { dataDeCorteLegivel } from "@shared/legado-honorarios";
import type { Event } from "@shared/schema";
import { CabecalhoDaLista, LinhaDaOc, type AcoesDaLinhaDaOc } from "@/components/ordens-de-compra/linha-da-oc";
import { DialogoRegistrarOc } from "@/components/ordens-de-compra/dialogo-registrar-oc";
import { DialogoDesfazer, alvoDoDesfazer, type AlvoDoDesfazer } from "@/components/ordens-de-compra/dialogo-desfazer";
import { DialogoLote } from "@/components/ordens-de-compra/dialogo-lote";
import { DialogoExportar } from "@/components/ordens-de-compra/dialogo-exportar";
import { DialogoMarcarPago, type ItemDoPago } from "@/components/ordens-de-compra/dialogo-marcar-pago";
import { DialogoEnviarNota, type AlvoDaNota } from "@/components/ordens-de-compra/dialogo-enviar-nota";
import { useAcoesDaOc, useOrdensDeCompra } from "@/components/ordens-de-compra/use-ordens-de-compra";
import { FILTROS_DA_OC, contarOcs, filtrarOcs, reais, type FiltroDaOc } from "@/components/ordens-de-compra/oc-utils";
import type { LinhaDaOc as Linha } from "@/components/ordens-de-compra/tipos";

/** "30/10 – 01/11/2026". */
function periodoDoEvento(e: Pick<Event, "startDate" | "endDate"> | undefined): string {
  if (!e?.startDate) return "";
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const ano = e.startDate.slice(0, 4);
  if (!e.endDate || e.endDate === e.startDate) return `${dm(e.startDate)}/${ano}`;
  return `${dm(e.startDate)} – ${dm(e.endDate)}/${e.endDate.slice(0, 4)}`;
}

const nomeDa = (l: Linha) => (l.colaborador ? toTitleCase(l.colaborador.nome) : "Prestação");
const itemDoPago = (l: Linha): ItemDoPago => ({ actualId: l.actualId, nome: nomeDa(l), valor: l.oc?.valor ?? l.valorAprovado, programadoPara: l.programadoPara });

/** Estado da página no meio da área de conteúdo (sem evento, legado, erro, vazio). */
function Estado({ icone: Icone, tom = "neutro", titulo, children, acao, testid }: {
  icone: typeof AlertCircle; tom?: "neutro" | "marca" | "perigo"; titulo: string; children: ReactNode; acao?: ReactNode; testid: string;
}) {
  const cor = tom === "perigo" ? "bg-danger-soft text-danger" : tom === "marca" ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground";
  return (
    <div role={tom === "perigo" ? "alert" : undefined} className={`pas-entra flex flex-col items-center text-center rounded-xl border ${tom === "perigo" ? "border-danger/25" : "border-border"} bg-card px-6 py-14`} data-testid={testid}>
      <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full mb-3 ${cor}`} aria-hidden="true"><Icone className="w-5 h-5" /></span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <div className="m-0 mt-1.5 max-w-[520px] text-sm leading-relaxed text-muted-foreground">{children}</div>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

/** Uma cifra do resumo: o número grande, o que é e quanto soma. */
function Cifra({ rotulo, n, sub, valor, tom = "text-foreground", testid }: { rotulo: string; n: number; sub: string; valor?: number; tom?: string; testid?: string }) {
  return (
    <div className="min-w-0 px-4 pt-3 pb-3.5" data-testid={testid}>
      <p className="m-0 text-xs font-medium text-slate-600 truncate">{rotulo}</p>
      <p className="m-0 mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className={`text-xl leading-6 font-semibold tabular-nums tracking-[-0.02em] ${n === 0 ? "text-muted-foreground" : tom}`}>{n}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </p>
      {valor != null && <p className="m-0 mt-0.5 text-xs font-medium tabular-nums text-slate-700">{reais(valor)}</p>}
    </div>
  );
}

export default function OrdensDeCompraPage() {
  usePageTitle("Ordens de compra");
  const legado = useFiltroDoLegado();
  const { eventId, setEventId, sanitize } = useEventoEmFoco();
  const busca = useSearch();
  const pessoaDaUrl = useMemo(() => new URLSearchParams(busca).get("pessoa") || "", [busca]);
  const [url, setUrl] = useUrlState({ estado: campo.texto(""), q: campo.texto("") });
  const filtro = (FILTROS_DA_OC as readonly string[]).includes(url.estado) ? (url.estado as FiltroDaOc) : null;
  const setFiltro = (f: FiltroDaOc | null) => setUrl({ estado: f ?? "" });
  const texto = url.q;
  const setTexto = (v: string) => setUrl({ q: v });

  const qEventos = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const eventos = useMemo(() => (qEventos.data ?? []).filter((e) => e.status !== "cancelado" && e.status !== "excluído"), [qEventos.data]);
  useEffect(() => { if (qEventos.data?.length) sanitize(qEventos.data.map((e) => e.id)); }, [qEventos.data, sanitize]);
  const evento = eventos.find((e) => e.id === eventId) ?? qEventos.data?.find((e) => e.id === eventId);
  const legadoNaTela = !!evento && legado.ehLegado(evento);

  const q = useOrdensDeCompra(eventId, !!evento && !legadoNaTela);
  const legadoNoServidor = q.isError && codigoDoErro(q.error).codigo === "evento_legado";
  const dados = q.data?.evento?.id === eventId && Array.isArray(q.data?.linhas) ? q.data : undefined;
  const acoes = useAcoesDaOc(eventId);
  const trilha = useTrilhaDoEvento(dados ? eventId : null);

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [destaque, setDestaque] = useState("");
  const trocarEvento = (v: string) => { setEventId(v); setSelecionadas(new Set()); setUrl({ estado: "", q: "" }); };

  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const contagem = useMemo(() => contarOcs(linhas), [linhas]);
  const visiveis = useMemo(() => filtrarOcs(linhas, texto, filtro), [linhas, texto, filtro]);
  const hoje = dados?.hoje ?? "";

  // A seleção só guarda o que ainda dá para marcar como pago (a lista muda por baixo).
  const marcaveis = useMemo(() => new Map(linhas.filter((l) => l.acoes.marcarPago).map((l) => [l.actualId, l])), [linhas]);
  const selecionadasVivas = useMemo(() => Array.from(selecionadas).filter((id) => marcaveis.has(id)), [selecionadas, marcaveis]);
  const marcaveisAVista = visiveis.filter((l) => l.acoes.marcarPago);
  const todosAVista = marcaveisAVista.length > 0 && marcaveisAVista.every((l) => selecionadas.has(l.actualId));
  const algunsAVista = marcaveisAVista.some((l) => selecionadas.has(l.actualId));
  const totalSelecionado = selecionadasVivas.reduce((s, id) => s + (marcaveis.get(id)?.oc?.valor ?? marcaveis.get(id)?.valorAprovado ?? 0), 0);

  const irPara = useCallback((actualId: string) => {
    setDestaque(actualId);
    setTimeout(() => document.querySelector(`[data-actual-id="${actualId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    setTimeout(() => setDestaque(""), 3500);
  }, []);
  const jaFoi = useRef("");
  useEffect(() => {
    if (!pessoaDaUrl || !dados || jaFoi.current === `${eventId}:${pessoaDaUrl}`) return;
    if (!dados.linhas.some((l) => l.actualId === pessoaDaUrl)) return;
    jaFoi.current = `${eventId}:${pessoaDaUrl}`;
    setUrl({ estado: "", q: "" });
    irPara(pessoaDaUrl);
  }, [pessoaDaUrl, dados, eventId, irPara, setUrl]);

  // ── Diálogos ──
  const [alvoOc, setAlvoOc] = useState<Linha | null>(null);
  const [alvoDesfazer, setAlvoDesfazer] = useState<AlvoDoDesfazer | null>(null);
  const [alvoNota, setAlvoNota] = useState<AlvoDaNota | null>(null);
  const [itensDoPago, setItensDoPago] = useState<ItemDoPago[] | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  const [exportarAberto, setExportarAberto] = useState(false);

  const acoesDaLinha: AcoesDaLinhaDaOc = useMemo(() => ({
    registrarOc: (l) => setAlvoOc(l),
    desfazerOc: (l) => setAlvoDesfazer(alvoDoDesfazer("oc", l)),
    desfazerPago: (l) => setAlvoDesfazer(alvoDoDesfazer("pago", l)),
    marcarPago: (l) => setItensDoPago([itemDoPago(l)]),
    enviarNota: (l) => l.oc && setAlvoNota({
      actualId: l.actualId, nome: nomeDa(l), oc: { numero: l.oc.numero, valor: l.oc.valor }, cnpjEmissor: l.cnpjEmissor.cnpj,
      tomador: dados?.evento.empresaPagadora ?? null,
      devolvida: l.estado === "nf_devolvida" ? { comentario: l.nota?.comentarioDoDp ?? null } : null,
    }),
    selecionar: (id, on) => setSelecionadas((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; }),
  }), [dados?.evento.empresaPagadora]);

  const selecionarAVista = (on: boolean) => setSelecionadas((s) => {
    const n = new Set(s);
    for (const l of marcaveisAVista) { if (on) n.add(l.actualId); else n.delete(l.actualId); }
    return n;
  });

  // ── Estados ──
  const carregando = !!eventId && !legadoNaTela && (q.isLoading || (!evento && qEventos.isLoading));
  const semListaDeEventos = !!eventId && !evento && qEventos.isError;
  const comErro = (!!eventId && !legadoNaTela && q.isError && !legadoNoServidor) || semListaDeEventos;
  const mostrarLegado = !!eventId && (legadoNaTela || legadoNoServidor);
  const temDados = !!eventId && !mostrarLegado && !!dados;
  const vazio = temDados && linhas.length === 0;

  const detalhe = evento
    ? [periodoDoEvento(evento), temDados && !vazio ? `${linhas.length} ${linhas.length === 1 ? "aprovada" : "aprovadas"}` : null, evento.location].filter(Boolean).join(" · ")
    : undefined;

  const barra = (
    <PageHeader
      variant="bar"
      title="Ordens de compra"
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={eventId ? undefined : "OC, nota fiscal e pagamento de cada prestação aprovada"}
      context={eventId ? <>
        <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border shrink-0" />
        <EventSearchSelect variante="barra" value={eventId} onValueChange={trocarEvento} events={eventos} detalhe={detalhe} legado={legado} />
      </> : undefined}
      actions={temDados && !vazio ? (
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" onClick={() => setExportarAberto(true)} className="pas-alvo h-[34px] rounded-lg px-3 text-sm gap-1.5" data-testid="oc-exportar">
            <Download className="w-4 h-4" aria-hidden="true" /><span className="max-md:sr-only">Exportar sem OC</span>
          </Button>
          <Button type="button" onClick={() => setLoteAberto(true)} className="pas-alvo h-[34px] rounded-lg px-3 text-sm gap-1.5" data-testid="oc-abrir-lote">
            <Layers className="w-4 h-4" aria-hidden="true" /><span className="max-md:sr-only">Registrar em lote</span>
          </Button>
          <Button type="button" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching} aria-label="Atualizar" title="Atualizar" className="pas-alvo h-[34px] w-[34px] rounded-lg p-0" data-testid="oc-atualizar">
            <RotateCw className={`w-4 h-4 ${q.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      ) : undefined}
    />
  );

  const c = contagem.porFiltro;
  const v = contagem.valorPorFiltro;
  const blocos: BlocoDaFilaDeTrabalho<FiltroDaOc>[] = [
    { key: "sem_oc", rotulo: "Sem OC", n: c.sem_oc, sub: c.sem_oc ? "registrar no M4" : "nenhuma", icone: CircleDashed, cor: "text-slate-500", titulo: `Aprovadas pela Conferência DP e ainda sem OC${c.sem_oc ? ` — ${reais(v.sem_oc)}` : ""}` },
    { key: "com_oc", rotulo: "Com OC", n: c.com_oc, sub: c.com_oc ? "aguardando a NF" : "nenhuma", icone: FileCheck2, cor: "text-primary", titulo: "OC registrada; o colaborador (ou a produção) ainda não enviou a nota" },
    { key: "nf_enviada", rotulo: "NF enviada", n: c.nf_enviada, sub: c.nf_enviada ? "conferir no DP" : "nenhuma", icone: FileSearch, cor: "text-warning", titulo: "Nota enviada, esperando a conferência do DP em Notas fiscais" },
    { key: "nf_devolvida", rotulo: "Devolvida", n: c.nf_devolvida, sub: c.nf_devolvida ? (contagem.recusadas ? `${contagem.recusadas} recusada${contagem.recusadas > 1 ? "s" : ""}` : "com o colaborador") : "nenhuma", icone: FileWarning, cor: "text-warning", titulo: "Nota devolvida ao colaborador para corrigir (ou recusada em definitivo)" },
    { key: "nf_aprovada", rotulo: "NF aprovada", n: c.nf_aprovada, sub: c.nf_aprovada ? "lançar no M4" : "nenhuma", icone: FileClock, cor: "text-info", titulo: "Nota aprovada, falta o lançamento no M4 (Notas fiscais)" },
    { key: "programado", rotulo: "Programado", n: c.programado, sub: c.programado ? reais(v.programado) : "nenhum", icone: CalendarClock, cor: "text-info", titulo: "Lançada no M4 com a data de pagamento — marque como pago quando liquidar" },
    { key: "pago", rotulo: "Pago", n: c.pago, sub: c.pago ? reais(v.pago) : "nenhum", icone: BadgeCheck, cor: "text-success", titulo: "Pagamento liquidado e baixado pelo DP" },
  ];

  let conteudo: ReactNode;
  if (!eventId) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="oc-sem-evento">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-3.5" aria-hidden="true"><Receipt className="w-5 h-5" /></span>
        <h2 className="m-0 text-base font-semibold text-foreground">Selecione um evento</h2>
        <p className="m-0 mt-1.5 max-w-[500px] text-sm leading-relaxed text-muted-foreground">
          Registre a OC de cada prestação aprovada (uma a uma ou em lote), acompanhe a nota fiscal com a conferência e marque como pago depois do lançamento no M4.
        </p>
        <div className="mt-5 w-full max-w-sm text-left">
          {qEventos.isError ? (
            <QueryError error={qEventos.error} onRetry={() => qEventos.refetch()} title="Não foi possível carregar os eventos" />
          ) : (
            <EventSearchSelect value={eventId} onValueChange={trocarEvento} events={eventos} className="sm:w-full" legado={legado} />
          )}
        </div>
      </div>
    );
  } else if (mostrarLegado) {
    conteudo = (
      <Estado icone={Archive} titulo="Não se aplica a evento do fluxo antigo" testid="oc-legado"
        acao={<Button variant="outline" className="rounded-lg" onClick={() => trocarEvento("")}>Escolher outro evento</Button>}>
        <p className="m-0">
          {evento?.name ? <><span className="font-medium text-foreground">{evento.name}</span> termina</> : "Este evento termina"} antes de {dataDeCorteLegivel(legado.dataDeCorte)}, a data de corte do fluxo novo dos honorários.
          No fluxo antigo a OC vem digitada com a nota em Notas fiscais e o pagamento é acompanhado fora do app.
        </p>
      </Estado>
    );
  } else if (carregando) {
    conteudo = (
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando as ordens de compra" className="flex flex-col gap-4" data-testid="oc-carregando">
        <span className="sr-only">Carregando as ordens de compra…</span>
        <div aria-hidden="true" className="rounded-xl border border-border bg-card grid grid-cols-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="px-4 py-3.5 space-y-2"><div className="pas-osso h-3 w-24" /><div className="pas-osso h-6 w-14" /></div>)}
        </div>
        <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-7 rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="px-3.5 pt-3 pb-3.5 space-y-2"><div className="pas-osso h-3 w-16" /><div className="pas-osso h-5 w-10" /></div>)}
        </div>
        <div aria-hidden="true" className="rounded-xl border border-border bg-card divide-y divide-border">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3.5 flex flex-wrap gap-5">
              <div className="space-y-2 w-[220px]"><div className="pas-osso h-4 w-40" /><div className="pas-osso h-3 w-28" /></div>
              <div className="pas-osso h-4 w-20" /><div className="pas-osso h-4 w-36" /><div className="pas-osso h-4 w-28" /><div className="pas-osso h-8 w-28 ml-auto rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (comErro) {
    conteudo = (
      <Estado icone={AlertCircle} tom="perigo" titulo="Não foi possível carregar as ordens de compra deste evento" testid="oc-erro"
        acao={<Button variant="outline" className="rounded-lg gap-1.5" onClick={() => (semListaDeEventos ? qEventos.refetch() : q.refetch())} data-testid="oc-tentar-de-novo"><RotateCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</Button>}>
        <p className="m-0">{apiErrorMessage(semListaDeEventos ? qEventos.error : q.error, "Verifique sua conexão e tente de novo.")}</p>
      </Estado>
    );
  } else if (vazio) {
    conteudo = (
      <Estado icone={FileCheck2} titulo="Nenhuma prestação aprovada neste evento ainda" testid="oc-vazio">
        <p className="m-0">A OC é registrada depois que a Conferência DP aprova a prestação. Quando houver aprovadas, elas aparecem aqui para a OC, a nota fiscal e o pagamento.</p>
      </Estado>
    );
  } else if (dados) {
    const totalAprovado = linhas.reduce((s, l) => s + l.valorAprovado, 0);
    const comOc = linhas.filter((l) => !!l.oc);
    const valorDasOcs = comOc.reduce((s, l) => s + (l.oc?.valor ?? 0), 0);
    const pagadora = dados.evento.empresaPagadora;
    conteudo = (
      <>
        <section aria-label="Resumo das ordens de compra do evento" className="rounded-xl border border-border bg-card overflow-hidden" data-testid="oc-resumo">
          <div className="grid grid-cols-2 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.3fr)] divide-x divide-border [&>*:nth-child(3)]:max-md:border-l-0 [&>*:nth-child(n+3)]:max-md:border-t [&>*:nth-child(n+3)]:max-md:border-border">
            <Cifra rotulo="Aprovadas na Conferência DP" n={linhas.length} sub={linhas.length === 1 ? "prestação" : "prestações"} valor={totalAprovado} testid="oc-resumo-aprovadas" />
            <Cifra rotulo="Com OC registrada" n={comOc.length} sub={`de ${linhas.length - contagem.naoEmiteNf}`} valor={valorDasOcs} tom="text-primary" />
            <Cifra rotulo="Pagas" n={c.pago} sub={c.pago === 1 ? "prestação" : "prestações"} valor={v.pago} tom="text-success" />
            <div className="col-span-2 md:col-span-1 min-w-0 px-4 pt-3 pb-3.5" data-testid="oc-pagadora">
              <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600"><Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />Tomador da nota (empresa pagadora)</p>
              {pagadora.nome ? (
                <>
                  <p className="m-0 mt-1 text-sm font-semibold leading-5 text-foreground truncate" title={pagadora.nome}>{pagadora.nome}</p>
                  {pagadora.cnpj && <p className="m-0 text-xs tabular-nums text-muted-foreground">CNPJ {pagadora.cnpj}</p>}
                </>
              ) : (
                <p className="m-0 mt-1 text-xs leading-5 text-warning">Não definida — defina em Notas fiscais antes de pedir as notas.</p>
              )}
            </div>
          </div>
          <TrilhaDoEvento {...trilha} foco={["oc_emitida", "pago"]} className="border-t border-border" />
        </section>

        <FilaDeTrabalho blocos={blocos} ativa={filtro} onEscolher={setFiltro} rotulo="Situação das prestações" testid={(k) => `oc-fila-${k}`} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <BuscaDaLista valor={texto} onChange={setTexto} placeholder="Pessoa, função, OC, NF ou CNPJ" rotulo="Buscar pessoa, função, OC, nota ou CNPJ" testid="oc-busca" />
          <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
            {visiveis.length === linhas.length ? `${linhas.length} ${linhas.length === 1 ? "prestação" : "prestações"}` : `${visiveis.length} de ${linhas.length}`}
            {(filtro || texto) && <> · <button type="button" className="font-medium text-primary hover:underline" onClick={() => setUrl({ estado: "", q: "" })}>ver todas</button></>}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
            {contagem.divergentes > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-danger" data-testid="oc-aviso-divergentes"><AlertTriangle className="w-3 h-3" aria-hidden="true" />{contagem.divergentes} {contagem.divergentes === 1 ? "nota diverge" : "notas divergem"} da OC</span>
            )}
            {contagem.semOcExigemJustificativa > 0 && (
              <span className="inline-flex items-center gap-1 text-warning"><FileWarning className="w-3 h-3" aria-hidden="true" />{contagem.semOcExigemJustificativa} sem contrato ativo (OC com justificativa)</span>
            )}
            {contagem.naoEmiteNf > 0 && <span>{contagem.naoEmiteNf} não {contagem.naoEmiteNf === 1 ? "emite" : "emitem"} NF</span>}
            <span title="O layout do arquivo de OC do M4 ainda não existe: tudo é digitado ou colado; o importador grava depois nos mesmos campos.">Modo manual (sem arquivo do M4)</span>
          </div>
        </div>

        {visiveis.length === 0 ? (
          <Estado icone={FileSearch} titulo="Nenhuma prestação neste recorte" testid="oc-sem-resultado"
            acao={<Button variant="outline" className="rounded-lg" onClick={() => setUrl({ estado: "", q: "" })}>Limpar filtros</Button>}>
            <p className="m-0">Nenhuma prestação bate com a busca e a situação escolhidas.</p>
          </Estado>
        ) : (
          <div className="oc-lista">
            <CabecalhoDaLista todosSelecionados={todosAVista ? true : algunsAVista ? "indeterminate" : false} algumSelecionavel={marcaveisAVista.length > 0} onSelecionarTodos={selecionarAVista} />
            <div role="list" aria-label="Prestações aprovadas">
              {visiveis.map((l) => (
                <LinhaDaOc key={l.actualId} l={l} selecionada={selecionadas.has(l.actualId)} destacada={destaque === l.actualId} acoes={acoesDaLinha} />
              ))}
            </div>
          </div>
        )}

        {selecionadasVivas.length > 0 && (
          <div className="oc-barra-selecao" role="region" aria-label="Seleção para marcar como pago" data-testid="oc-barra-selecao">
            <p className="m-0 text-sm text-foreground">
              <span className="font-semibold tabular-nums">{selecionadasVivas.length}</span> {selecionadasVivas.length === 1 ? "programada selecionada" : "programadas selecionadas"}
              <span className="text-muted-foreground"> · </span><span className="font-semibold tabular-nums">{reais(totalSelecionado)}</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="ghost" className="h-9 rounded-lg gap-1.5" onClick={() => setSelecionadas(new Set())}><X className="w-4 h-4" aria-hidden="true" />Limpar</Button>
              <Button type="button" className="h-9 rounded-lg gap-1.5 bg-success text-white hover:bg-success-strong" onClick={() => setItensDoPago(selecionadasVivas.map((id) => itemDoPago(marcaveis.get(id)!)))} data-testid="oc-marcar-selecionadas">
                <BadgeCheck className="w-4 h-4" aria-hidden="true" />Marcar como pagas
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {barra}
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

      {dados && (
        <>
          <DialogoRegistrarOc alvo={alvoOc} hoje={hoje} registrar={acoes.registrar} onClose={() => setAlvoOc(null)} />
          <DialogoDesfazer alvo={alvoDesfazer} desfazerOc={acoes.desfazerOc} desfazerPago={acoes.desfazerPago} onClose={() => setAlvoDesfazer(null)} />
          <DialogoEnviarNota alvo={alvoNota} enviar={acoes.enviarNota} onClose={() => setAlvoNota(null)} />
          <DialogoMarcarPago itens={itensDoPago} hoje={hoje} marcarPago={acoes.marcarPago} onClose={() => setItensDoPago(null)}
            onPronto={(r) => setSelecionadas((s) => { const n = new Set(s); for (const l of r.linhas) n.delete(l.actualId); return n; })} />
          <DialogoLote aberto={loteAberto} nomeDoEvento={dados.evento.nome} previaDoLote={acoes.previaDoLote} confirmarLote={acoes.confirmarLote} onClose={() => setLoteAberto(false)} />
          <DialogoExportar aberto={exportarAberto} eventId={eventId} semOc={c.sem_oc} onClose={() => setExportarAberto(false)} />
        </>
      )}
    </>
  );
}
