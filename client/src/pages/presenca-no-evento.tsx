/**
 * PRESENÇA NO EVENTO — tela nova do grupo Honorários (27/10, Fase 1 do Módulo
 * de Honorários). Ata de 22/10: check-in e check-out diários com selfie,
 * horário e localização; o produtor faz o check-out final, marca as
 * divergências, ajusta o valor e envia ao DP. Decisão do dono (26/10): o
 * colaborador (ou o representante) confirma; o produtor ajusta até ±10%.
 *
 * Quem vê: admin, DP, produção e Área de Função (o servidor só manda a esta
 * as pessoas das funções em que é responsável, sem as fotos). O perfil
 * Honorários não entra. Contrato: server/routes/presenca.ts.
 *
 * A casca é a das irmãs (Pré-aprovação, Realizado): barra de 56px com o
 * evento como seletor e o filtro do legado; conteúdo até 1560px com a faixa
 * "Na arena agora", a trilha do evento (DP), a fila por situação (conta e
 * recorta), a busca e a lista de pessoas. Cada pessoa: linha do tempo dos
 * dias (cada dia abre as ações dele), ocorrências, confirmação, CNPJ com o
 * selo de contrato e o acesso ao portal; check-out final e código de acesso
 * em diálogos próprios. Link direto: /presenca?event=…&pessoa=… (id da
 * prestação ou do colaborador).
 *
 * 28/10 (Fase 2 manual): a situação da nota/pagamento na pessoa e, para a
 * produção e o DP, "Enviar nota fiscal" como representante (o mesmo envio do
 * portal: POST /api/ordens-de-compra/:actualId/nota-fiscal).
 *
 * 28/10 (Fase 3 — prazos e cobranças): o prazo do check-out final em cada
 * pessoa e, acima da lista, um aviso calmo com quantos check-outs finais
 * estão atrasados (e vencem hoje), que recorta a lista.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock, AlertCircle, Archive, CheckCheck, CircleSlash, ClipboardCheck, Clock3, Fingerprint, LogOut, RotateCw, Send, UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { QueryError } from "@/components/common/query-state";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EventSearchSelect } from "@/components/event-select";
import { useFiltroDoLegado, useTrilhaDoEvento } from "@/components/honorarios/use-honorarios";
import { TrilhaDoEvento } from "@/components/honorarios/trilha-do-honorario";
import { ddmm } from "@/components/budget/types";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { isRhOrAdmin } from "@/lib/role-utils";
import { toTitleCase } from "@/lib/format";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { dataDeCorteLegivel } from "@shared/legado-honorarios";
import type { Event } from "@shared/schema";
import type { TipoDeOcorrencia } from "@shared/presenca";
import { CartaoDaPessoa } from "@/components/presenca/cartao-da-pessoa";
import { FaixaNaArena } from "@/components/presenca/faixa-na-arena";
import { LightboxDaSelfie } from "@/components/presenca/lightbox-da-selfie";
import { DialogoMarcar, type AlvoDaMarcacao } from "@/components/presenca/dialogo-marcar";
import { DialogoCorrigir, type AlvoDaCorrecao } from "@/components/presenca/dialogo-corrigir";
import { DialogoOcorrencia, type AlvoDaOcorrencia } from "@/components/presenca/dialogo-ocorrencia";
import { DialogoConfirmar, type AlvoDaConfirmacao } from "@/components/presenca/dialogo-confirmar";
import { DialogoCheckoutFinal, type AlvoDoCheckout } from "@/components/presenca/dialogo-checkout-final";
import { DialogoCodigoDeAcesso, type AlvoDoCodigo } from "@/components/presenca/codigo-de-acesso";
import { usePresencaDoEvento, useAcoesDaPresenca } from "@/components/presenca/use-presenca";
import {
  ROTULO_DO_FILTRO, codigoDoErro, contarPorFiltro, filtrarPrestacoes, foiParaODp, selfiesDaPrestacao, type FiltroDaPresenca,
} from "@/components/presenca/presenca-utils";
import type { PrestacaoDaPresenca } from "@/components/presenca/tipos";
import { PRAZOS_PADRAO, diasEntre } from "@shared/prazos-honorarios";
import { DialogoEnviarNota, type AlvoDaNota } from "@/components/ordens-de-compra/dialogo-enviar-nota";
import { useAcoesDaOc } from "@/components/ordens-de-compra/use-ordens-de-compra";

/** "25/10 – 01/11/2026" — o mesmo do Realizado. */
function periodoDoEvento(e: Pick<Event, "startDate" | "endDate"> | undefined): string {
  if (!e?.startDate) return "";
  const ano = e.startDate.slice(0, 4);
  if (!e.endDate || e.endDate === e.startDate) return `${ddmm(e.startDate)}/${ano}`;
  return `${ddmm(e.startDate)} – ${ddmm(e.endDate)}/${e.endDate.slice(0, 4)}`;
}

const nomeDa = (p: PrestacaoDaPresenca) => (p.colaborador ? toTitleCase(p.colaborador.nome) : "Sem colaborador");

/** Estado da página no meio da área de conteúdo (sem evento, legado, erro, vazio). */
function Estado({ icone: Icone, tom = "neutro", titulo, children, acao, testid }: {
  icone: typeof AlertCircle; tom?: "neutro" | "marca" | "perigo"; titulo: string; children: ReactNode; acao?: ReactNode; testid: string;
}) {
  const cor = tom === "perigo" ? "bg-danger-soft text-danger" : tom === "marca" ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground";
  return (
    <div role={tom === "perigo" ? "alert" : undefined} className={`pas-entra flex flex-col items-center text-center rounded-xl border ${tom === "perigo" ? "border-danger/25" : "border-border"} bg-card px-6 py-14`} data-testid={testid}>
      <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full mb-3 ${cor}`} aria-hidden="true"><Icone className="w-5 h-5" /></span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <div className="m-0 mt-1.5 max-w-[500px] text-sm leading-relaxed text-muted-foreground">{children}</div>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export default function PresencaNoEventoPage() {
  usePageTitle("Presença no evento");
  const { user } = useAuth();
  const { toast } = useToast();
  const dp = isRhOrAdmin(user);
  const legado = useFiltroDoLegado({ lerDoServidor: dp });
  const { eventId, setEventId, sanitize } = useEventoEmFoco();
  const busca = useSearch();
  const pessoaDaUrl = useMemo(() => new URLSearchParams(busca).get("pessoa") || "", [busca]);

  const qEventos = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const eventos = useMemo(() => (qEventos.data ?? []).filter((e) => e.status !== "cancelado"), [qEventos.data]);
  useEffect(() => { if (qEventos.data?.length) sanitize(qEventos.data.map((e) => e.id)); }, [qEventos.data, sanitize]);
  const evento = eventos.find((e) => e.id === eventId) ?? qEventos.data?.find((e) => e.id === eventId);
  const legadoNaTela = !!evento && legado.ehLegado(evento);

  // Só pergunta depois de saber o evento: legado nem chega a chamar a API.
  const q = usePresencaDoEvento(eventId, !!evento && !legadoNaTela);
  const legadoNoServidor = q.isError && codigoDoErro(q.error).codigo === "evento_legado";
  const dados = q.data?.evento?.id === eventId && Array.isArray(q.data?.prestacoes) ? q.data : undefined;
  const acoes = useAcoesDaPresenca(eventId);
  const acoesDaNota = useAcoesDaOc(eventId);
  const trilha = useTrilhaDoEvento(dp && dados ? eventId : null);

  // ── Lista: fila, busca, abertas ──
  const [filtro, setFiltro] = useState<FiltroDaPresenca | null>(null);
  const [texto, setTexto] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [destaque, setDestaque] = useState("");
  const trocarEvento = (v: string) => { setEventId(v); setAbertas(new Set()); setFiltro(null); setTexto(""); };

  const prestacoes = useMemo(() => dados?.prestacoes ?? [], [dados]);
  const contagem = useMemo(() => contarPorFiltro(prestacoes), [prestacoes]);
  // 28/10 (Fase 3): check-outs finais que vencem hoje (os atrasados estão em `contagem`).
  const checkoutVenceHoje = useMemo(() => prestacoes.filter((p) => !foiParaODp(p) && p.prazos?.checkoutFinal?.situacao === "vence_hoje").length, [prestacoes]);
  const prazoDoCheckoutDias = useMemo(() => {
    const p = prestacoes.find((x) => x.prazos?.checkoutFinal?.etapa === "checkout_final")?.prazos?.checkoutFinal;
    return p ? diasEntre(p.desde, p.venceEm) : PRAZOS_PADRAO.checkoutFinal;
  }, [prestacoes]);
  const visiveis = useMemo(() => filtrarPrestacoes(prestacoes, texto, filtro), [prestacoes, texto, filtro]);
  const alternar = useCallback((id: string) => setAbertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);

  const irPara = useCallback((actualId: string) => {
    setFiltro(null); setTexto("");
    setAbertas((s) => new Set(s).add(actualId));
    setDestaque(actualId);
    setTimeout(() => document.querySelector(`[data-actual-id="${actualId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    setTimeout(() => setDestaque(""), 3500);
  }, []);

  // Link direto (Conferência DP → "Ver presença"): abre e destaca a pessoa.
  const jaFoi = useRef("");
  useEffect(() => {
    if (!pessoaDaUrl || !dados || jaFoi.current === `${eventId}:${pessoaDaUrl}`) return;
    const alvo = dados.prestacoes.find((p) => p.actualId === pessoaDaUrl || p.colaborador?.id === pessoaDaUrl);
    if (!alvo) return;
    jaFoi.current = `${eventId}:${pessoaDaUrl}`;
    irPara(alvo.actualId);
  }, [pessoaDaUrl, dados, eventId, irPara]);

  // ── Diálogos ──
  const [alvoMarcar, setAlvoMarcar] = useState<AlvoDaMarcacao | null>(null);
  const [alvoCorrigir, setAlvoCorrigir] = useState<AlvoDaCorrecao | null>(null);
  const [alvoOcorrencia, setAlvoOcorrencia] = useState<AlvoDaOcorrencia | null>(null);
  const [alvoConfirmar, setAlvoConfirmar] = useState<AlvoDaConfirmacao | null>(null);
  const [alvoCheckout, setAlvoCheckout] = useState<AlvoDoCheckout | null>(null);
  const [alvoCodigo, setAlvoCodigo] = useState<AlvoDoCodigo | null>(null);
  const [remover, setRemover] = useState<{ id: string; rotulo: string; nome: string } | null>(null);
  const [galeria, setGaleria] = useState<{ actualId: string; indice: number } | null>(null);
  const [alvoNota, setAlvoNota] = useState<AlvoDaNota | null>(null);

  const pessoaDaGaleria = galeria ? prestacoes.find((p) => p.actualId === galeria.actualId) : undefined;
  const selfiesDaGaleria = useMemo(() => (pessoaDaGaleria ? selfiesDaPrestacao(pessoaDaGaleria) : []), [pessoaDaGaleria]);

  const acoesDe = (p: PrestacaoDaPresenca) => {
    const nome = nomeDa(p);
    return {
      verSelfie: (dia: string, lado: "entrada" | "saida") => {
        const i = selfiesDaPrestacao(p).findIndex((s) => s.dia === dia && s.lado === lado);
        if (i >= 0) setGaleria({ actualId: p.actualId, indice: i });
      },
      verSelfies: () => setGaleria({ actualId: p.actualId, indice: 0 }),
      marcar: (dia: string, tipo: "entrada" | "saida") => setAlvoMarcar({ actualId: p.actualId, nome, dia, tipo }),
      corrigir: (dia: string) => { const d = p.dias.find((x) => x.dia === dia); if (d) setAlvoCorrigir({ actualId: p.actualId, nome, dia: d }); },
      lancarFalta: (dia: string) => setAlvoOcorrencia({ prestacao: p, nome, tipo: "falta" as TipoDeOcorrencia, dia }),
      lancarOcorrencia: () => setAlvoOcorrencia({ prestacao: p, nome }),
      removerOcorrencia: (id: string) => {
        const o = p.ocorrencias.find((x) => x.id === id);
        setRemover({ id, rotulo: o ? `${o.rotulo}${o.dia ? ` de ${ddmm(o.dia)}` : ""}` : "a ocorrência", nome });
      },
      confirmar: () => setAlvoConfirmar({ prestacao: p, nome }),
      checkoutFinal: () => setAlvoCheckout({ prestacao: p, nome }),
      enviarNota: () => {
        const nf = p.notaFiscal;
        if (!nf?.oc) return;
        setAlvoNota({
          actualId: p.actualId, nome, oc: { numero: nf.oc.numero, valor: nf.oc.valor }, cnpjEmissor: p.cnpj.informado,
          devolvida: nf.estado === "nf_devolvida" ? { comentario: nf.nota?.comentarioDoDp ?? null } : null,
        });
      },
      gerarCodigo: () => p.colaborador && setAlvoCodigo({ collaboratorId: p.colaborador.id, nome, temSenha: p.acesso.temSenha, codigoValidoAte: p.acesso.codigoValidoAte }),
    };
  };

  // O diálogo do check-out acompanha a prestação viva (uma ocorrência lançada muda o cálculo).
  const checkoutVivo = alvoCheckout ? { ...alvoCheckout, prestacao: prestacoes.find((p) => p.actualId === alvoCheckout.prestacao.actualId) ?? alvoCheckout.prestacao } : null;

  // ── Estados ──
  const carregando = !!eventId && !legadoNaTela && (q.isLoading || (!evento && qEventos.isLoading));
  const semListaDeEventos = !!eventId && !evento && qEventos.isError;
  const comErro = (!!eventId && !legadoNaTela && q.isError && !legadoNoServidor) || semListaDeEventos;
  const mostrarLegado = !!eventId && (legadoNaTela || legadoNoServidor);
  const temDados = !!eventId && !mostrarLegado && !!dados;
  const vazio = temDados && prestacoes.length === 0;

  const hoje = dados?.hoje ?? "";
  const emAndamento = !!dados && !!dados.evento.inicio && !!dados.evento.fim && hoje >= dados.evento.inicio && hoje <= dados.evento.fim;
  const verValores = !!dados && dados.permissoes.checkoutFinal;

  const detalhe = evento
    ? [periodoDoEvento(evento), temDados && !vazio ? `${prestacoes.length} ${prestacoes.length === 1 ? "pessoa" : "pessoas"}` : null, evento.location].filter(Boolean).join(" · ")
    : undefined;

  const barra = (
    <PageHeader
      variant="bar"
      title="Presença no evento"
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={eventId ? undefined : "check-in, check-out e o fechamento de cada pessoa"}
      context={eventId ? <>
        <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border shrink-0" />
        <EventSearchSelect variante="barra" value={eventId} onValueChange={trocarEvento} events={eventos} detalhe={detalhe} legado={legado} />
      </> : undefined}
      actions={temDados ? (
        <Button type="button" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching} className="pas-alvo h-[34px] rounded-lg px-3 text-sm gap-1.5" data-testid="prs-atualizar">
          <RotateCw className={`w-4 h-4 ${q.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          <span className="max-sm:sr-only">Atualizar</span>
        </Button>
      ) : undefined}
    />
  );

  const blocos: BlocoDaFilaDeTrabalho<FiltroDaPresenca>[] = [
    { key: "pendente_dia", rotulo: ROTULO_DO_FILTRO.pendente_dia, n: contagem.pendente_dia, sub: contagem.pendente_dia ? "dia sem registro" : "nenhum", icone: CircleSlash, cor: "text-danger", titulo: "Dia que já passou sem check-in nem falta — registre a falta ou corrija o horário" },
    { key: "sem_saida", rotulo: ROTULO_DO_FILTRO.sem_saida, n: contagem.sem_saida, sub: contagem.sem_saida ? "check-out esquecido" : "nenhum", icone: LogOut, cor: "text-warning", titulo: "Entrou e não registrou a saída num dia que já passou — corrija o horário" },
    { key: "nao_confirmou", rotulo: ROTULO_DO_FILTRO.nao_confirmou, n: contagem.nao_confirmou, sub: contagem.nao_confirmou ? "já podiam confirmar" : "nenhum pendente", icone: Clock3, cor: "text-warning", titulo: "O último dia passou e o colaborador ainda não confirmou os dias e o CNPJ" },
    { key: "confirmou", rotulo: ROTULO_DO_FILTRO.confirmou, n: contagem.confirmou, sub: contagem.confirmou ? "dias e CNPJ" : "ninguém ainda", icone: CheckCheck, cor: "text-success", titulo: "Confirmou os dias e o CNPJ (no app ou pelo representante)" },
    { key: "pronto", rotulo: ROTULO_DO_FILTRO.pronto, n: contagem.pronto, sub: contagem.pronto ? "falta o check-out" : "nenhum", icone: ClipboardCheck, cor: "text-primary", titulo: "Todos os dias resolvidos — falta o check-out final da produção" },
    { key: "enviado", rotulo: ROTULO_DO_FILTRO.enviado, n: contagem.enviado, sub: contagem.enviado ? "com o DP" : "nenhum", icone: Send, cor: "text-info", titulo: "Check-out final feito — com o DP para a conferência" },
  ];

  let conteudo: ReactNode;
  if (!eventId) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="prs-sem-evento">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-3.5" aria-hidden="true"><Fingerprint className="w-5 h-5" /></span>
        <h2 className="m-0 text-base font-semibold text-foreground">Selecione um evento</h2>
        <p className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">
          Veja quem está na arena, a entrada e a saída de cada dia com a selfie, lance as ocorrências e faça o check-out final de cada pessoa para o DP.
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
      <Estado icone={Archive} titulo="Evento do fluxo antigo" testid="prs-legado"
        acao={<Button variant="outline" className="rounded-lg" onClick={() => trocarEvento("")}>Escolher outro evento</Button>}>
        <p className="m-0">
          {evento?.name ? <><span className="font-medium text-foreground">{evento.name}</span> termina</> : "Este evento termina"} antes de {dataDeCorteLegivel(legado.dataDeCorte)}, a data de corte do fluxo novo dos honorários.
          No fluxo antigo não há check-in, selfie nem check-out final: a prestação segue pelo Realizado como sempre.
        </p>
      </Estado>
    );
  } else if (carregando) {
    conteudo = (
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando a presença" className="flex flex-col gap-4" data-testid="prs-carregando">
        <span className="sr-only">Carregando a presença…</span>
        <div aria-hidden="true" className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-2.5"><div className="pas-osso h-4 w-40" /><div className="flex gap-2"><div className="pas-osso h-8 w-48 rounded-lg" /><div className="pas-osso h-8 w-48 rounded-lg" /></div></div>
        <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-6 rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="px-3.5 pt-3 pb-3.5 space-y-2"><div className="pas-osso h-3 w-20" /><div className="pas-osso h-5 w-12" /></div>)}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-4">
            <div className="space-y-2 w-[240px]"><div className="pas-osso h-4 w-40" /><div className="pas-osso h-3 w-28" /><div className="pas-osso h-5 w-36" /></div>
            <div className="flex gap-1.5 flex-1">{[0, 1, 2, 3].map((j) => <div key={j} className="pas-osso h-[58px] w-[92px] rounded-lg" />)}</div>
          </div>
        ))}
      </div>
    );
  } else if (comErro) {
    conteudo = (
      <Estado icone={AlertCircle} tom="perigo" titulo="Não foi possível carregar a presença deste evento" testid="prs-erro"
        acao={<Button variant="outline" className="rounded-lg gap-1.5" onClick={() => (semListaDeEventos ? qEventos.refetch() : q.refetch())} data-testid="prs-tentar-de-novo"><RotateCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</Button>}>
        <p className="m-0">{apiErrorMessage(semListaDeEventos ? qEventos.error : q.error, "Verifique sua conexão e tente de novo.")}</p>
      </Estado>
    );
  } else if (vazio) {
    conteudo = (
      <Estado icone={UsersRound} titulo={dados?.permissoes.checkoutFinal === false ? "Ninguém das suas funções neste evento" : "Ninguém na presença deste evento ainda"} testid="prs-vazio">
        <p className="m-0">
          {dados?.permissoes.checkoutFinal === false
            ? "Você vê as pessoas das funções em que é responsável. Neste evento, nenhuma delas está no Realizado ainda."
            : "A presença começa quando a pessoa chega ao Realizado: o DP pré-aprova o valor no Planejado e envia. Depois disso ela aparece aqui e no app do colaborador."}
        </p>
      </Estado>
    );
  } else if (dados) {
    const regra = dados.configuracao;
    conteudo = (
      <>
        <FaixaNaArena pessoas={dados.naArenaAgora} emAndamento={emAndamento} atualizadoEm={q.dataUpdatedAt} onIr={irPara} />
        {dp && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <TrilhaDoEvento {...trilha} foco={["em_evento", "confirmado"]} />
          </div>
        )}
        <FilaDeTrabalho blocos={blocos} ativa={filtro} onEscolher={setFiltro} rotulo="Situação das pessoas" testid={(k) => `prs-fila-${k}`} />
        {(contagem.checkout_atrasado > 0 || checkoutVenceHoje > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-warning/25 bg-warning-soft/60 px-4 py-2.5 text-sm" role="status" data-testid="prs-aviso-prazo">
            <AlarmClock className="w-4 h-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="min-w-0 text-slate-700">
              {contagem.checkout_atrasado > 0 && <><strong className="font-semibold text-danger">{contagem.checkout_atrasado} {contagem.checkout_atrasado === 1 ? "check-out final atrasado" : "check-outs finais atrasados"}</strong>{checkoutVenceHoje > 0 ? " · " : ""}</>}
              {checkoutVenceHoje > 0 && <strong className="font-semibold text-warning">{checkoutVenceHoje} {checkoutVenceHoje === 1 ? "vence hoje" : "vencem hoje"}</strong>}
              <span className="text-muted-foreground"> — o check-out final vai ao DP até {prazoDoCheckoutDias} {prazoDoCheckoutDias === 1 ? "dia" : "dias"} depois do último dia de trabalho.</span>
            </span>
            {contagem.checkout_atrasado > 0 && (
              <button type="button" onClick={() => setFiltro(filtro === "checkout_atrasado" ? null : "checkout_atrasado")}
                className="pas-alvo ml-auto h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-pressed={filtro === "checkout_atrasado"} data-testid="prs-ver-atrasados">
                {filtro === "checkout_atrasado" ? "Ver todas" : "Ver os atrasados"}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <BuscaDaLista valor={texto} onChange={setTexto} placeholder="Buscar pessoa ou função" rotulo="Buscar pessoa ou função" testid="prs-busca" />
          <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
            {visiveis.length === prestacoes.length ? `${prestacoes.length} ${prestacoes.length === 1 ? "pessoa" : "pessoas"}` : `${visiveis.length} de ${prestacoes.length}`}
            {filtro && <> · <button type="button" className="font-medium text-primary hover:underline" onClick={() => setFiltro(null)}>ver todas</button></>}
          </p>
          <p className="m-0 ml-auto text-2xs text-muted-foreground" title="Regras da presença — padrão provisório, o dono pode mudar (Tabela de valores)">
            Selfie {regra.selfieObrigatoria ? "obrigatória" : "opcional"} · localização {regra.localizacao === "registrar" ? "registrada" : "não registrada"} · produção ajusta até ±{regra.produtorAjusteMaxPct.toLocaleString("pt-BR")}% · <span className="italic">padrão provisório</span>
          </p>
        </div>
        {visiveis.length === 0 ? (
          <Estado icone={UsersRound} titulo="Ninguém nesta situação" testid="prs-sem-resultado"
            acao={<Button variant="outline" className="rounded-lg" onClick={() => { setFiltro(null); setTexto(""); }}>Limpar filtros</Button>}>
            <p className="m-0">Nenhuma pessoa bate com a busca e a situação escolhidas.</p>
          </Estado>
        ) : (
          <div className="prs-lista" role="list" aria-label="Pessoas do evento">
            {visiveis.map((p) => (
              <div role="listitem" key={p.actualId}>
                <CartaoDaPessoa
                  p={p}
                  hoje={hoje}
                  permissoes={dados.permissoes}
                  verValores={verValores}
                  aberto={abertas.has(p.actualId)}
                  destacado={destaque === p.actualId}
                  removendo={acoes.removerOcorrencia.isPending ? (acoes.removerOcorrencia.variables ?? null) : null}
                  onAlternar={() => alternar(p.actualId)}
                  acoes={acoesDe(p)}
                />
              </div>
            ))}
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
          <DialogoMarcar alvo={alvoMarcar} configuracao={dados.configuracao} marcar={acoes.marcar} onClose={() => setAlvoMarcar(null)} />
          <DialogoCorrigir alvo={alvoCorrigir} corrigir={acoes.corrigir} onClose={() => setAlvoCorrigir(null)} />
          <DialogoOcorrencia alvo={alvoOcorrencia} lancar={acoes.lancarOcorrencia} onClose={() => setAlvoOcorrencia(null)}
            financeiras={dados?.permissoes.ocorrenciasFinanceiras ?? true} horaExtraMaxDia={dados?.configuracao.horaExtraMaxDia} />
          <DialogoConfirmar alvo={alvoConfirmar} confirmar={acoes.confirmar} onClose={() => setAlvoConfirmar(null)} />
          <DialogoCheckoutFinal alvo={checkoutVivo} hoje={hoje} checkoutFinal={acoes.checkoutFinal} onClose={() => setAlvoCheckout(null)} />
          <LightboxDaSelfie
            nome={pessoaDaGaleria ? nomeDa(pessoaDaGaleria) : ""}
            selfies={selfiesDaGaleria}
            indice={galeria?.indice ?? null}
            onIndice={(i) => setGaleria((g) => (g ? { ...g, indice: i } : g))}
            onClose={() => setGaleria(null)}
          />
        </>
      )}
      <DialogoCodigoDeAcesso alvo={alvoCodigo} onClose={() => setAlvoCodigo(null)} />
      <DialogoEnviarNota alvo={alvoNota} enviar={acoesDaNota.enviarNota} onClose={() => setAlvoNota(null)} />
      <ConfirmDialog
        open={!!remover}
        onOpenChange={(o) => { if (!o && !acoes.removerOcorrencia.isPending) setRemover(null); }}
        title={`Remover ${remover?.rotulo.toLowerCase() ?? "a ocorrência"}?`}
        description={remover ? `${remover.nome}: o valor da prestação é recalculado sem ela. Fica registrado no log de auditoria.` : undefined}
        confirmLabel="Remover"
        tone="danger"
        pending={acoes.removerOcorrencia.isPending}
        onConfirm={() => remover && acoes.removerOcorrencia.mutate(remover.id, {
          onSuccess: () => { toast({ variant: "success", title: "Ocorrência removida", description: `${remover.nome} · o valor foi recalculado.` }); setRemover(null); },
          onError: (e) => { toast({ variant: "destructive", title: "Não foi possível remover", description: apiErrorMessage(e, "Tente de novo.") }); setRemover(null); },
        })}
        testId="prs-confirmar-remocao"
      />
    </>
  );
}
