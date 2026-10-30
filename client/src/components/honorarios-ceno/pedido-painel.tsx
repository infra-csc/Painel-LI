/**
 * Honorários — o painel de QUEM PEDE (cenotécnica), por evento (16/10). "O
 * pessoal de cenotécnica entra, coloca um valor que negociou e manda para a
 * aprovação" — sem mexer em nada da escala.
 *
 * 20/10 (dono: "eles têm que pedir aqui na escalação"): saiu da Validação de
 * escala. Mora na Escalação, na gaveta "Honorários do evento"
 * (na-escalacao.tsx) — a vaga uma a uma também se pede no modal dela, aba
 * Honorário (aba-da-vaga.tsx).
 *
 * Sem evento: a lista dos eventos com cenotécnica (próximos primeiro).
 * Com evento: uma linha por vaga freela — escalada OU ainda aberta, "Vaga #N
 * sem nome" (20/10) — com o tipo de freela escolhido na linha (o valor da
 * tabela) ou "Outro valor" digitado na célula (grava ao sair); as empreitas
 * abaixo, cada uma com as vagas que agrupa; e "Enviar para aprovação" em
 * lote. A vaga da casa (funcionário) fica numa nota: não recebe honorário.
 *
 * 30/10 (quem lança: "não consigo ter controle das OCs que eu abrir"): sem
 * evento, duas abas — Eventos e "Aprovados (todos os eventos)"
 * (aprovados-todos.tsx). "Abrir no evento" de lá abre o evento já na linha
 * da pessoa; "voltar" volta à aba de onde veio, com os filtros.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, BadgeCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CloudOff, Crosshair, HardHat, History, Inbox, Lock, Pencil, Plus, Send, Trash2, Undo2, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { AcaoDoEstado, BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { ICONE_DA_LINHA, MOLDURA, TH } from "@/components/scaling-approval/tokens";
import { isCenotecnicaFunction } from "@shared/alimentacao";
import { isCenoFreelaTipo } from "@shared/cenotecnica-empreita";
import { contarLancamento, ehTipoDeTabela, faltaParaEnviar, lancadoPor, rotuloDoValor, valorPorDiaria, type SituacaoNaFila } from "@shared/honorarios-ceno";
import { useAuth } from "@/hooks/use-auth";
import { ABAS_DO_PEDIDO, AbasDoPedido, AutoriaDoPedido, BadgeFaltaLancar, ResumoDoLancamento, abaDaSituacao, contagemPorAba, situacaoDaLinha, type AbaDoPedido } from "./lancamento";
import {
  useAcessoHonorarios, useEventosDoPedido, useGravarTipoNaVaga, useMutacoesDoPedido, usePedidoDoEvento,
  type CamposDoPedido, type EventoDoPedido, type Honorario, type LinhaDoPedido, type TabelaDaVaga,
} from "./api";
import { AvisoDaLinha, BarraDaVerba, EtapaBadge, FaixaDeTotais, ValorComDiaria, VagasDaEmpreitaLista, brl, brlCurto, diariasTexto, periodoCurto } from "./pecas";
import { CampoDeValor, IndicadorDeSalvamento, SelectDoTipo, useSalvamento } from "./linha-editavel";
import { DetalhesDialog, type AlvoDoFormulario } from "./detalhes-dialog";
import { HistoricoSheet } from "./historico-sheet";
import { AprovadosDeTodosOsEventos, FILTROS_PADRAO, type FiltrosDosAprovados } from "./aprovados-todos";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Quadradinho de data "24 OUT" da lista de eventos. */
function DataDoEvento({ iso }: { iso: string }) {
  const [, m, d] = iso.split("-");
  return (
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-surface-muted leading-none" aria-hidden="true">
      <span className="text-[15px] font-semibold tabular-nums text-foreground">{d}</span>
      <span className="mt-0.5 text-2xs font-medium uppercase text-muted-foreground">{MESES[Number(m) - 1]}</span>
    </span>
  );
}

/** Os números de um evento para quem lança (23/10): o que falta, o que está em rascunho, o que foi. */
function numerosDoEvento(e: EventoDoPedido) {
  const lancadas = e.rascunhos + e.aguardando + e.devolvidos + e.aprovados;
  const total = e.semPedido + lancadas;
  const enviadas = e.aguardando + e.devolvidos + e.aprovados;
  return { total, lancadas, enviadas, falta: e.semPedido, rascunhos: e.rascunhos, devolvidos: e.devolvidos, aprovados: e.aprovados };
}

/** "3 faltam lançar · 2 rascunhos · 5 enviados" — o que pede ação vem primeiro e com cor. */
function ContadoresDoEvento({ n }: { n: ReturnType<typeof numerosDoEvento> }) {
  const itens = [
    { chave: "falta", v: n.falta, texto: `${n.falta} ${n.falta === 1 ? "falta" : "faltam"} lançar`, cls: "font-semibold text-warning", ponto: "bg-warning-strong" },
    { chave: "rascunho", v: n.rascunhos, texto: `${n.rascunhos} ${n.rascunhos === 1 ? "rascunho" : "rascunhos"}`, cls: "font-medium text-slate-700", ponto: "bg-slate-400" },
    { chave: "enviado", v: n.enviadas, texto: `${n.enviadas} ${n.enviadas === 1 ? "enviado" : "enviados"}`, cls: "text-slate-600", ponto: "bg-success-strong" },
  ].filter((x) => x.v > 0);
  if (itens.length === 0) return <span className="text-2xs text-muted-foreground">Nada lançado ainda</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs" data-testid="hon-evento-contadores">
      {itens.map((x) => (
        <span key={x.chave} className={cn("inline-flex items-center gap-1.5 tabular-nums", x.cls)}>
          <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", x.ponto)} />{x.texto}
        </span>
      ))}
      {n.devolvidos > 0 && <StatusBadge tone="primary" size="sm">{n.devolvidos} {n.devolvidos === 1 ? "devolvido" : "devolvidos"}</StatusBadge>}
    </span>
  );
}

function LinhaDoEvento({ e, onEscolher }: { e: EventoDoPedido; onEscolher: (id: string) => void }) {
  const n = numerosDoEvento(e);
  const pct = n.total ? Math.round((n.lancadas / n.total) * 100) : 0;
  const pendente = n.falta + n.rascunhos + n.devolvidos > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onEscolher(e.id)}
        className={cn(
          "group flex w-full items-center gap-3.5 border-l-[3px] px-4 py-3 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          pendente && !e.passado ? "border-l-warning-strong" : "border-l-transparent",
        )}
        data-testid={`hon-evento-${e.id}`}
      >
        <DataDoEvento iso={e.startDate} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{e.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
            <span className="tabular-nums">{periodoCurto(e.startDate, e.endDate)}</span>
            <span aria-hidden="true">·</span>
            <span>{e.vagas} {e.vagas === 1 ? "vaga" : "vagas"}{e.semColaborador ? ` (${e.semColaborador} sem nome)` : ""}</span>
            {e.empreitas > 0 && <><span aria-hidden="true">·</span><span>{e.empreitas} {e.empreitas === 1 ? "empreita" : "empreitas"}</span></>}
          </span>
          <span className="mt-1.5 block"><ContadoresDoEvento n={n} /></span>
        </span>
        <span className="hidden w-[132px] shrink-0 sm:block">
          <span className="flex items-baseline justify-between gap-2 text-2xs text-muted-foreground">
            <span>{n.total && n.lancadas === n.total ? "Tudo lançado" : "Lançadas"}</span>
            <span className="font-semibold tabular-nums text-foreground">{n.lancadas}/{n.total}</span>
          </span>
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-muted ring-1 ring-inset ring-border" role="img" aria-label={`${n.lancadas} de ${n.total} lançadas`}>
            <span className={cn("block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", n.lancadas === n.total ? "bg-success-strong" : "bg-primary")} style={{ width: `${pct}%` }} />
          </span>
          <span className="mt-1 block text-right text-2xs tabular-nums text-muted-foreground">
            {e.totalAprovado ? `${brlCurto(e.totalAprovado)} aprovado` : e.totalPedido ? `${brlCurto(e.totalPedido)} enviado` : "nada enviado"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function EventosDoPedido({ onEscolher }: { onEscolher: (id: string) => void }) {
  const q = useEventosDoPedido(true);
  if (q.isLoading) return <Esqueleto linhas={4} rotulo="Carregando eventos…" />;
  if (q.error) {
    return (
      <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível carregar os eventos"
        texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")}
        acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} />
    );
  }
  const lista = q.data ?? [];
  if (lista.length === 0) {
    return (
      <EstadoDaValidacao icone={<HardHat aria-hidden="true" />} titulo="Nenhum evento com vaga de cenotécnica"
        texto="Quando o evento tiver vaga de cenotécnica (escalada ou ainda aberta), ele aparece aqui para você lançar o honorário."
        testId="hon-eventos-vazio" />
    );
  }
  const proximos = lista.filter((e) => !e.passado);
  const passados = lista.filter((e) => e.passado);
  // O que está com você nos eventos que ainda vão acontecer — a pergunta de quem abre a gaveta.
  const pendentes = proximos.map(numerosDoEvento).reduce((s, n) => ({ falta: s.falta + n.falta, rascunhos: s.rascunhos + n.rascunhos, devolvidos: s.devolvidos + n.devolvidos }), { falta: 0, rascunhos: 0, devolvidos: 0 });
  const comPendencia = proximos.filter((e) => { const n = numerosDoEvento(e); return n.falta + n.rascunhos + n.devolvidos > 0; }).length;
  const bloco = (titulo: string, itens: EventoDoPedido[]) => itens.length > 0 && (
    <section className="space-y-2" aria-label={titulo}>
      <h3 className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{titulo}</h3>
      <ul className={cn(MOLDURA, "divide-y divide-border overflow-hidden")}>{itens.map((e) => <LinhaDoEvento key={e.id} e={e} onEscolher={onEscolher} />)}</ul>
    </section>
  );
  const partes = [
    pendentes.falta ? `${pendentes.falta} ${pendentes.falta === 1 ? "vaga falta" : "vagas faltam"} lançar` : null,
    pendentes.rascunhos ? `${pendentes.rascunhos} ${pendentes.rascunhos === 1 ? "rascunho não enviado" : "rascunhos não enviados"}` : null,
    pendentes.devolvidos ? `${pendentes.devolvidos} ${pendentes.devolvidos === 1 ? "devolvido" : "devolvidos"} para negociar` : null,
  ].filter(Boolean);
  return (
    <div className="val-entra space-y-5" data-testid="hon-eventos">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Escolha o evento para lançar o honorário de cada vaga da cenotécnica — escalada ou ainda sem nome.</p>
        {proximos.length > 0 && (
          <p className="text-sm text-slate-700" data-testid="hon-eventos-resumo">
            {partes.length
              ? <>Nos próximos eventos: <span className="font-semibold text-foreground">{partes.join(" · ")}</span>{comPendencia > 1 ? `, em ${comPendencia} eventos` : ""}.</>
              : <span className="font-medium text-success">Nos próximos eventos está tudo lançado e enviado.</span>}
          </p>
        )}
      </div>
      {bloco("Próximos e em andamento", proximos)}
      {bloco("Já aconteceram", passados)}
    </div>
  );
}

function Esqueleto({ linhas, rotulo }: { linhas: number; rotulo: string }) {
  return (
    <div className={cn(MOLDURA, "space-y-0 divide-y divide-border overflow-hidden")} aria-busy="true" aria-label={rotulo}>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="val-osso h-9 w-9 shrink-0" />
          <div className="flex-1 space-y-2"><div className="val-osso h-3.5 w-2/5" /><div className="val-osso h-3 w-1/4" /></div>
          <div className="val-osso h-8 w-28" />
        </div>
      ))}
    </div>
  );
}

// ── Linha de vaga ───────────────────────────────────────────────────────────

const mensagemDoErro = (e: unknown) =>
  isApiError(e) && e.status === 409 ? "Mudou em outra tela — recarregado" : apiErrorMessage(e, "Não salvou");

function useSalvarLinha(eventId: string, linha: { vaga: LinhaDoPedido["vaga"]; sugestao: LinhaDoPedido["sugestao"]; honorario: Honorario | null }) {
  const { criar, editar } = useMutacoesDoPedido();
  const sv = useSalvamento();
  // A linha mais recente (a resposta de uma gravação vale para a próxima,
  // mesmo antes do refetch) e uma fila: duas mudanças rápidas nunca criam
  // dois pedidos para a mesma vaga.
  const atual = useRef<Honorario | null>(linha.honorario);
  useEffect(() => { atual.current = linha.honorario; }, [linha.honorario]);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const salvar = (campos: CamposDoPedido) => {
    fila.current = fila.current.then(() => sv.rodar(async () => {
      const h = atual.current;
      const novo = h
        ? await editar.mutateAsync({ id: h.id, versao: h.versao, ...campos })
        : await criar.mutateAsync({ eventId, tipo: linha.vaga ? "vaga" : "empreita", teamInclusionId: linha.vaga?.id, ...campos });
      atual.current = novo;
    }, mensagemDoErro));
  };
  return { salvar, ...sv };
}

/**
 * A etapa da linha e quem lançou/enviou/decidiu (23/10: "quem lança não sabe
 * quais lançou"). Sem pedido: "Falta lançar", tracejado como o selo da Fila.
 */
function Situacao({ h, compacta, meuId }: { h: Honorario | null; compacta?: boolean; meuId: string | null | undefined }) {
  if (!h) return <BadgeFaltaLancar />;
  if (compacta) return <EtapaBadge h={h} visao="pedido" />;
  return (
    <span className="block space-y-1">
      <EtapaBadge h={h} visao="pedido" />
      <AutoriaDoPedido h={h} meuId={meuId} />
      {(h.status === "aprovado" || h.status === "aprovado_ajuste") && h.liberado > 0 && h.valorAprovado
        ? <BarraDaVerba aprovado={h.valorAprovado} liberado={h.liberado} className="max-w-[140px]" />
        : null}
    </span>
  );
}

function AvisoDevolvido({ h }: { h: Honorario }) {
  if (h.status !== "devolvido" || !h.motivoDecisao) return null;
  return (
    <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-primary/15 bg-brand-soft px-2.5 py-1.5 text-2xs leading-4 text-slate-700">
      <Undo2 className="mt-px h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
      <span><span className="font-semibold text-primary">Voltou para negociar:</span> {h.motivoDecisao}</span>
    </p>
  );
}

function AcoesDaLinha({ h, editavel, onDetalhes, onHistorico, onRemover, nome }: {
  h: Honorario | null; editavel: boolean; nome: string;
  onDetalhes: () => void; onHistorico: (id: string) => void; onRemover: (h: Honorario) => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {editavel && (
        <button type="button" className={cn(ICONE_DA_LINHA, "hover:bg-brand-soft hover:text-primary")} onClick={onDetalhes} aria-label={`Editar detalhes de ${nome}`} title="Abrir o pedido (tipo, valor e observação)">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {h && (
        <button type="button" className={cn(ICONE_DA_LINHA, "hover:bg-muted hover:text-foreground")} onClick={() => onHistorico(h.id)} aria-label={`Histórico de ${nome}`} title="Histórico">
          <History className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {h?.podeRemover && (
        <button type="button" className={cn(ICONE_DA_LINHA, "hover:bg-danger-soft hover:text-danger")} onClick={() => onRemover(h)} aria-label={`Remover o rascunho de ${nome}`} title="Remover rascunho">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/**
 * Uma linha do pedido, nos dois desenhos: TABELA (≥ 1280px) e CARTÃO
 * (abaixo disso). A troca é por media query — só um dos dois existe no DOM,
 * então o leitor de tela nunca ouve a mesma pessoa duas vezes. O cartão junta
 * setor e posição lado a lado e o valor ocupa a largura toda (é o que se digita).
 */
type ModoDaLista = "tabela" | "cartao";

interface DadosDaLinha {
  chave: string;
  testId: string;
  nome: string;
  icone?: boolean;
  sub: ReactNode;
  avisos: ReactNode;
  h: Honorario | null;
  editavel: boolean;
  /** Vaga: o tipo de freela (tabela) ou "outro"; empreita: null. */
  tipo: string | null;
  tabela: TabelaDaVaga | null;
  empreita: boolean;
  periodo: string;
  diarias: number | null;
  valor: number;
  rotuloDoValor: string;
  salvar: (c: CamposDoPedido) => void;
  estado: ReturnType<typeof useSalvamento>["estado"];
  erro: string | null;
  acoes: ReactNode;
  /** Trabalho de quem lança: falta lançar, rascunho ou devolvido que ainda dá para mexer (marcador âmbar). */
  pedeAcao: boolean;
  /** Para "Lançado por você". */
  meuId: string | null | undefined;
}

function PorDiariaOuStatus({ d }: { d: DadosDaLinha }) {
  const porDia = valorPorDiaria(d.valor, d.diarias);
  if (d.estado !== "parado") return <IndicadorDeSalvamento estado={d.estado} erro={d.erro} />;
  return <span className="tabular-nums">{porDia != null && d.valor > 0 ? `${brl(porDia)}/diária` : "— /diária"}</span>;
}

function CampoDoValor({ d, alinhar = "direita" }: { d: DadosDaLinha; alinhar?: "direita" | "esquerda" }) {
  const digitavel = d.editavel && (d.empreita || d.tipo === "outro");
  if (!digitavel) {
    const h = d.h;
    // Tipo de tabela ainda sem pedido: mostra o valor da tabela que vai entrar.
    const daTabela = !h && ehTipoDeTabela(d.tipo) ? d.tabela?.valores[d.tipo]?.total ?? null : null;
    if (d.editavel && !d.tipo && !d.empreita) {
      return <span className={cn("block text-2xs text-muted-foreground", alinhar === "direita" ? "text-right" : "text-left")}>Escolha o tipo</span>;
    }
    return (
      <>
        <ValorComDiaria valor={h ? h.valorAprovado ?? h.valorPedido : daTabela} diarias={d.diarias} riscado={h?.valorAprovado != null ? h.valorPedido : null} alinhar={alinhar} />
        {d.editavel && (
          <span className={cn("mt-0.5 flex min-h-4 text-2xs text-muted-foreground", alinhar === "direita" ? "justify-end" : "justify-start")}>
            {d.estado !== "parado" ? <IndicadorDeSalvamento estado={d.estado} erro={d.erro} />
              : !h && d.tipo ? (
                // Tipo que veio do Resumo, ainda sem pedido: um clique lança o valor da tabela.
                <button type="button" onClick={() => d.salvar({ tipoFreela: d.tipo })} className="val-alvo rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`hon-lancar-${d.testId}`}>
                  Lançar o valor da tabela
                </button>
              ) : "da tabela"}
          </span>
        )}
      </>
    );
  }
  return (
    <>
      <CampoDeValor valor={d.valor} onSalvar={(c) => d.salvar({ valorPedido: c })} rotulo={`${d.rotuloDoValor} de ${d.nome}`} testId={`hon-valor-${d.testId}`} />
      <span className="mt-1 flex min-h-4 justify-end text-2xs text-muted-foreground"><PorDiariaOuStatus d={d} /></span>
    </>
  );
}

/** Coluna "Tipo": o tipo de freela da vaga (escolhido na linha) ou o resumo da empreita. */
function CampoTipo({ d }: { d: DadosDaLinha }) {
  if (d.empreita) {
    return (
      <span className="block pt-1.5">
        <span className="block text-xs font-medium text-slate-700">Empreita · valor fechado</span>
        <VagasDaEmpreitaLista vagas={d.h?.vagasDaEmpreita ?? []} className="mt-0.5" />
      </span>
    );
  }
  if (d.editavel) {
    return (
      <SelectDoTipo valor={d.tipo} tabela={d.tabela} rotulo={`Tipo de freela de ${d.nome}`} testId={`hon-tipo-${d.testId}`}
        onMudar={(x) => d.salvar({ tipoFreela: x })} />
    );
  }
  return <span className="inline-flex min-h-9 items-center text-xs text-slate-700">{d.h ? rotuloDoValor({ ...d.h, observacao: null }) : "—"}</span>;
}

function Linha({ d, modo }: { d: DadosDaLinha; modo: ModoDaLista }) {
  const devolvido = d.h?.status === "devolvido";
  const titulo = (
    <span className="flex items-center gap-1.5 break-words text-sm font-semibold leading-5 text-foreground">
      {d.icone && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}{d.nome}
    </span>
  );
  if (modo === "cartao") {
    return (
      <li className={cn("val-entra overflow-hidden rounded-xl border border-l-[3px] bg-card shadow-1", devolvido ? "border-primary/25" : "border-border", d.pedeAcao && "border-l-warning-strong")} data-testid={`hon-linha-${d.testId}`} data-pede-acao={d.pedeAcao || undefined}>
        <div className="space-y-3 px-3.5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">{titulo}<span className="mt-0.5 block text-2xs text-muted-foreground">{d.sub}</span></div>
            <span className="shrink-0"><Situacao h={d.h} compacta meuId={d.meuId} /></span>
          </div>
          {d.avisos}
          <CampoTipo d={d} />
          <div className="grid grid-cols-[1fr_auto] items-start gap-3">
            <div className="min-w-0">
              <span className="block text-2xs text-muted-foreground">{d.rotuloDoValor}</span>
              <div className="mt-1"><CampoDoValor d={d} alinhar="esquerda" /></div>
            </div>
            <div className="pt-[18px] text-right">
              <span className="block text-xs tabular-nums text-foreground">{d.periodo}</span>
              <span className="block text-2xs text-muted-foreground">{diariasTexto(d.diarias)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-muted/60 py-1 pl-3.5 pr-2">
          <span className="min-w-0">{d.h && <AutoriaDoPedido h={d.h} meuId={d.meuId} />}</span>
          <span className="flex shrink-0 items-center gap-1">{d.acoes}</span>
        </div>
      </li>
    );
  }
  return (
    <tr className={cn("border-b border-border align-top transition-colors last:border-b-0", devolvido ? "bg-brand-soft/30" : "bg-card hover:bg-surface-muted/50")} data-testid={`hon-linha-${d.testId}`} data-pede-acao={d.pedeAcao || undefined}>
      <td className={cn("border-l-[3px] px-3 py-3", d.pedeAcao ? "border-l-warning-strong" : "border-l-transparent")}>
        {titulo}
        <span className="mt-0.5 block text-2xs text-muted-foreground">{d.sub}</span>
        <span className="mt-0.5 block text-2xs tabular-nums text-slate-600">Montagem {d.periodo} · {diariasTexto(d.diarias)}</span>
        {d.avisos}
      </td>
      <td className="px-3 py-3"><CampoTipo d={d} /></td>
      <td className="px-3 py-3 text-right"><CampoDoValor d={d} /></td>
      <td className="px-3 py-3"><Situacao h={d.h} meuId={d.meuId} /></td>
      <td className="whitespace-nowrap py-2.5 pl-1 pr-2 text-right">{d.acoes}</td>
    </tr>
  );
}

function useDadosDaVaga(linha: LinhaDoPedido, eventId: string, cb: Callbacks): DadosDaLinha {
  const h = linha.honorario;
  const v = linha.vaga;
  const s = linha.sugestao;
  const editavel = h ? h.podeEditar : !linha.foraDaEscala;
  const sv = useSalvarLinha(eventId, linha);
  const gravarTipo = useGravarTipoNaVaga();
  const nome = h?.nome ?? s?.nome ?? "Vaga";
  const numero = v?.inclusionNumber ?? h?.inclusionNumber;
  const semColaborador = h ? h.semColaborador : !!s?.semColaborador;
  const tipo = h ? h.tipoFreela : s?.tipoFreela ?? null;
  /** Escolheu um tipo da tabela e a vaga não tinha: a vaga também passa a ter (o Planejado usa). */
  const salvar = (c: CamposDoPedido) => {
    // Primeira gravação da linha: leva o tipo pré-selecionado (o do Resumo) junto.
    sv.salvar(!h && c.tipoFreela === undefined && tipo ? { tipoFreela: tipo, ...c } : c);
    if (v && !v.cenoFreelaTipo && isCenoFreelaTipo(c.tipoFreela) && isCenotecnicaFunction(v.functionName)) {
      gravarTipo.mutate({ vagaId: v.id, tipo: c.tipoFreela });
    }
  };
  return {
    chave: v?.id ?? h?.id ?? nome,
    testId: String(numero ?? h?.id ?? nome),
    nome,
    sub: semColaborador ? (
      <span className="italic">Vaga ainda sem colaborador — o pedido segue assim mesmo</span>
    ) : (
      <>
        {numero != null && <span className="font-mono tabular-nums">#{numero}</span>}
        {numero != null && " · "}
        {v?.functionName ?? h?.functionName ?? "Cenotécnica"}
        {v?.empreitaEmpresa ? ` · empreita na escala${v.empreitaPessoas ? ` (${v.empreitaPessoas} pessoas)` : ""}` : ""}
      </>
    ),
    avisos: (
      <>
        {h && (h.avisoDaVaga || h.eventoExcluido) ? (
          <AvisoDaLinha h={h}>
            {/* Troca de colaborador: o valor foi negociado com outra pessoa — quem pede confere e confirma. */}
            {h.avisoDaVaga === "colaborador_trocado" && h.podeEditar && (
              <button type="button" onClick={() => sv.salvar({})} disabled={sv.estado === "salvando"}
                className="val-alvo inline-flex items-center rounded-md px-1 text-2xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                data-testid={`hon-confirmar-troca-${numero ?? h.id}`}>
                Passar o pedido para {h.colaboradorAtual ?? "a vaga sem nome"}
              </button>
            )}
          </AvisoDaLinha>
        ) : linha.foraDaEscala ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-medium text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> A vaga saiu da escala
          </span>
        ) : null}
        {h && <AvisoDevolvido h={h} />}
      </>
    ),
    h,
    editavel,
    tipo,
    tabela: linha.tabela ?? null,
    empreita: false,
    periodo: periodoCurto(h?.inicio ?? s?.inicio, h?.fim ?? s?.fim),
    diarias: h?.diarias ?? s?.diarias ?? null,
    valor: h?.valorPedido ?? 0,
    rotuloDoValor: "Valor negociado",
    salvar,
    estado: sv.estado,
    erro: sv.erro,
    acoes: <AcoesDaLinha h={h} editavel={editavel && !!v} nome={nome} onDetalhes={() => cb.onDetalhes(linha)} onHistorico={cb.onHistorico} onRemover={cb.onRemover} />,
    pedeAcao: h ? h.podeEditar && (h.status === "rascunho" || h.status === "devolvido") : !linha.foraDaEscala,
    meuId: cb.meuId,
  };
}

function useDadosDaEmpreita(h: Honorario, eventId: string, cb: Callbacks): DadosDaLinha {
  const sv = useSalvarLinha(eventId, { vaga: null, sugestao: null, honorario: h });
  return {
    chave: h.id,
    testId: h.id,
    nome: h.nome,
    icone: true,
    sub: <>{h.pessoas ? `${h.pessoas} ${h.pessoas === 1 ? "pessoa" : "pessoas"}` : "Empreita"}{h.descricao ? ` · ${h.descricao}` : ""}</>,
    avisos: <><AvisoDaLinha h={h} /><AvisoDevolvido h={h} /></>,
    h,
    editavel: h.podeEditar,
    tipo: null,
    tabela: null,
    empreita: true,
    periodo: periodoCurto(h.inicio, h.fim),
    diarias: h.diarias,
    valor: h.valorPedido,
    rotuloDoValor: "Valor fechado",
    salvar: sv.salvar,
    estado: sv.estado,
    erro: sv.erro,
    acoes: <AcoesDaLinha h={h} editavel={h.podeEditar} nome={h.nome} onDetalhes={() => cb.onEditarEmpreita(h)} onHistorico={cb.onHistorico} onRemover={cb.onRemover} />,
    pedeAcao: h.podeEditar && (h.status === "rascunho" || h.status === "devolvido"),
    meuId: cb.meuId,
  };
}

interface Callbacks {
  meuId: string | null | undefined;
  onDetalhes: (l: LinhaDoPedido) => void;
  onEditarEmpreita: (h: Honorario) => void;
  onHistorico: (id: string) => void;
  onRemover: (h: Honorario) => void;
}

function LinhaDaVaga({ linha, eventId, cb, modo }: { linha: LinhaDoPedido; eventId: string; cb: Callbacks; modo: ModoDaLista }) {
  return <Linha d={useDadosDaVaga(linha, eventId, cb)} modo={modo} />;
}
function LinhaDaEmpreita({ h, eventId, cb, modo }: { h: Honorario; eventId: string; cb: Callbacks; modo: ModoDaLista }) {
  return <Linha d={useDadosDaEmpreita(h, eventId, cb)} modo={modo} />;
}

/** A lista: tabela no desktop largo, cartões abaixo de 1280px. */
function ListaDoPedido({ modo, valorRotulo, colunaTipo = "Tipo de freela", legenda, children }: { modo: ModoDaLista; valorRotulo: string; colunaTipo?: string; legenda: string; children: ReactNode }) {
  if (modo === "cartao") return <ul className="grid gap-2.5 md:grid-cols-2" aria-label={legenda}>{children}</ul>;
  return (
    <div className={cn(MOLDURA, "overflow-hidden")}>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={TH}>Pessoa / vaga</th>
            <th scope="col" className={cn(TH, "w-[296px] 2xl:w-[340px]")}>{colunaTipo}</th>
            <th scope="col" className={cn(TH, "w-[172px] text-right")}>{valorRotulo}</th>
            <th scope="col" className={cn(TH, "w-[168px]")}>Situação</th>
            <th scope="col" className={cn(TH, "w-[112px] text-right")}><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ── Enviar para aprovação (lote) ────────────────────────────────────────────

function EnviarDialog({ aberto, onOpenChange, prontos, incompletos, evento }: {
  aberto: boolean; onOpenChange: (o: boolean) => void;
  prontos: Honorario[]; incompletos: { nome: string; motivo: string }[]; evento: string;
}) {
  const { enviar } = useMutacoesDoPedido();
  const { toast } = useToast();
  // Guarda os DESMARCADOS: uma linha que fica pronta com o diálogo aberto
  // (a gravação terminou depois do clique) entra marcada, como as outras.
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  useEffect(() => { if (aberto) setDesmarcados(new Set()); }, [aberto]);
  const escolhidos = prontos.filter((p) => !desmarcados.has(p.id));
  const total = escolhidos.reduce((s, p) => s + p.valorPedido, 0);
  const confirmar = async () => {
    try {
      const r = await enviar.mutateAsync(escolhidos.map((p) => ({ id: p.id, versao: p.versao })));
      const n = r.enviados?.length ?? 0;
      toast({ variant: "success", title: `${n} ${n === 1 ? "pedido enviado" : "pedidos enviados"} ao aprovador`, description: `${evento} · ${brl(total)}. Você recebe o aviso se algum voltar para negociar.` });
      if (r.recusados.length) toast({ variant: "warning", title: `${r.recusados.length} não ${r.recusados.length === 1 ? "foi" : "foram"}`, description: r.recusados.map((x) => `${x.nome}: ${x.motivo}`).join(" · ") });
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível enviar", description: apiErrorMessage(e, "Tente de novo.") });
    }
  };
  return (
    <ConfirmDialog
      open={aberto}
      onOpenChange={(o) => { if (!enviar.isPending) onOpenChange(o); }}
      title={`Enviar ${escolhidos.length} ${escolhidos.length === 1 ? "pedido" : "pedidos"} para aprovação?`}
      description="O aprovador da escala recebe o aviso. Depois de enviado, o valor só muda se ele devolver para negociar."
      icon={Send}
      className="!max-w-[560px] max-h-[88vh] overflow-y-auto"
      cancelLabel="Voltar"
      confirmLabel={enviar.isPending ? "Enviando…" : `Enviar · ${brl(total)}`}
      pending={enviar.isPending}
      confirmDisabled={escolhidos.length === 0}
      onConfirm={() => { void confirmar(); }}
      testId="hon-enviar-dialogo"
    >
      <ul className="max-h-[280px] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
        {prontos.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-surface-muted/60">
              <Checkbox checked={!desmarcados.has(p.id)} onCheckedChange={() => setDesmarcados((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label={`Enviar ${p.nome}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{p.nome}</span>
                <span className="block text-2xs text-muted-foreground">{rotuloDoValor({ ...p, observacao: null })} · {diariasTexto(p.diarias)}{p.status === "devolvido" ? " · reenvio" : ""}</span>
              </span>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{brlCurto(p.valorPedido)}</span>
            </label>
          </li>
        ))}
      </ul>
      {incompletos.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft/70 px-3 py-2 text-xs text-slate-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-semibold text-foreground">{incompletos.length} {incompletos.length === 1 ? "linha fica" : "linhas ficam"} de fora</span> por falta de dados:{" "}
            {incompletos.slice(0, 4).map((x) => `${x.nome} (${x.motivo.replace(/\.$/, "").toLowerCase()})`).join(", ")}{incompletos.length > 4 ? "…" : "."}
          </span>
        </p>
      )}
    </ConfirmDialog>
  );
}

// ── O painel do evento ──────────────────────────────────────────────────────

/** Uma linha do pedido (vaga ou empreita), como o resumo e as abas leem. */
interface ItemDoPedido { chave: string; situacao: SituacaoNaFila; meu: boolean }

const chaveDaLinha = (l: LinhaDoPedido) => l.vaga?.id ?? l.honorario?.id ?? "";

function PedidoDoEvento({ eventId, onTrocarEvento, foco: focoInicial, voltarPara }: {
  eventId: string; onTrocarEvento: () => void;
  /** 30/10: id do pedido em foco (vindo de "Aprovados") — a lista mostra só ele até "Ver todas". */
  foco?: string | null;
  voltarPara?: string;
}) {
  const q = usePedidoDoEvento(eventId);
  const { remover } = useMutacoesDoPedido();
  const { toast } = useToast();
  const { user } = useAuth();
  const meuId = user?.id ?? null;
  const [alvo, setAlvo] = useState<AlvoDoFormulario | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<Honorario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [verCasa, setVerCasa] = useState(false);
  // Abas (23/10): o recorte da lista. `fixados` guarda as linhas que estavam
  // na aba quando ela foi aberta — lançar o valor numa linha de "Faltam
  // lançar" não a faz sumir debaixo do cursor; ela fica, já com a etapa nova,
  // até a pessoa trocar de aba.
  const [recorte, setRecorte] = useState<{ aba: AbaDoPedido; soMeus: boolean; fixados: Set<string> }>({ aba: "todas", soMeus: false, fixados: new Set() });
  const modo: ModoDaLista = useMediaQuery("(min-width: 1280px)") ? "tabela" : "cartao";
  const [foco, setFoco] = useState<string | null>(focoInicial ?? null);

  const d = q.data;
  const todas = useMemo(() => [
    ...(d?.linhas.map((l) => l.honorario).filter(Boolean) as Honorario[] ?? []),
    ...(d?.empreitas ?? []),
  ], [d]);
  const itens = useMemo<ItemDoPedido[]>(() => [
    ...(d?.linhas ?? []).map((l) => ({ chave: chaveDaLinha(l), situacao: situacaoDaLinha(l.honorario), meu: !!l.honorario && lancadoPor(l.honorario, meuId) })),
    ...(d?.empreitas ?? []).map((h) => ({ chave: h.id, situacao: situacaoDaLinha(h), meu: lancadoPor(h, meuId) })),
  ], [d, meuId]);
  const editaveis = todas.filter((h) => h.podeEditar);
  /** O que ainda segura a linha (dados ou a troca de colaborador sem confirmar). */
  const pendencia = (h: Honorario) => faltaParaEnviar(h)
    ?? (h.avisoDaVaga === "colaborador_trocado" ? "A vaga trocou de colaborador — confirme na linha." : null)
    ?? (h.avisosDaEmpreita?.length ? "Vaga da empreita mudou na escala — tire-a da empreita." : null);
  const prontos = editaveis.filter((h) => !pendencia(h));
  const incompletos = [
    ...editaveis.filter((h) => pendencia(h)).map((h) => ({ nome: h.nome, motivo: pendencia(h)! })),
    ...(d?.linhas.filter((l) => !l.honorario && !l.foraDaEscala).map((l) => ({ nome: l.sugestao?.nome ?? "Vaga", motivo: "Falta lançar" })) ?? []),
  ];
  const soma = (f: (h: Honorario) => boolean, v: (h: Honorario) => number = (h) => h.valorPedido) => todas.filter(f).reduce((s, h) => s + v(h), 0);
  const devolvidos = todas.filter((h) => h.status === "devolvido");

  if (q.isLoading) return <Esqueleto linhas={6} rotulo="Carregando as vagas da cenotécnica…" />;
  if (q.error || !d) {
    return (
      <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível carregar os honorários do evento"
        texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")}
        acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} testId="hon-pedido-erro" />
    );
  }

  const confirmarRemocao = async () => {
    if (!removendo) return;
    try {
      await remover.mutateAsync({ id: removendo.id, versao: removendo.versao });
      toast({ title: "Rascunho removido", description: `${removendo.nome} voltou para "Falta lançar".` });
      setRemovendo(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível remover", description: apiErrorMessage(e, "Tente de novo.") });
      if (isApiError(e) && (e.status === 409 || e.status === 404)) setRemovendo(null);
    }
  };

  // ── Recorte das abas ──────────────────────────────────────────────────
  const naAba = (i: ItemDoPedido, aba: AbaDoPedido, soMeus: boolean) => (!soMeus || i.meu) && (aba === "todas" || abaDaSituacao(i.situacao) === aba);
  const mudarRecorte = (aba: AbaDoPedido, soMeus: boolean) =>
    setRecorte({ aba, soMeus, fixados: new Set(itens.filter((i) => naAba(i, aba, soMeus)).map((i) => i.chave)) });
  const porChave = new Map(itens.map((i) => [i.chave, i]));
  const visivel = (chave: string) => {
    const i = porChave.get(chave);
    return !!i && (naAba(i, recorte.aba, recorte.soMeus) || recorte.fixados.has(chave));
  };
  const universo = recorte.soMeus ? itens.filter((i) => i.meu) : itens;
  const nPorAba = contagemPorAba(contarLancamento(universo.map((i) => i.situacao)));
  const resumo = contarLancamento(itens.map((i) => i.situacao));
  const filtrando = recorte.aba !== "todas" || recorte.soMeus;

  const vagas = d.linhas;
  // Em foco (vindo de "Aprovados"): só a linha do pedido. Se ele não está mais aqui, a lista inteira.
  const linhaEmFoco = foco ? vagas.find((l) => l.honorario?.id === foco) ?? null : null;
  const empreitaEmFoco = foco ? d.empreitas.find((h) => h.id === foco) ?? null : null;
  const emFoco = linhaEmFoco ? (linhaEmFoco.honorario?.nome ?? linhaEmFoco.sugestao?.nome ?? "") : empreitaEmFoco?.nome ?? null;
  const vagasVisiveis = emFoco != null ? (linhaEmFoco ? [linhaEmFoco] : []) : filtrando ? vagas.filter((l) => visivel(chaveDaLinha(l))) : vagas;
  const empreitasVisiveis = emFoco != null ? (empreitaEmFoco ? [empreitaEmFoco] : []) : filtrando ? d.empreitas.filter((h) => visivel(h.id)) : d.empreitas;
  const cb: Callbacks = {
    meuId,
    onDetalhes: (x) => setAlvo({ modo: "vaga", linha: x }),
    onEditarEmpreita: (x) => setAlvo({ modo: "empreita", honorario: x, vagasDoEvento: d.vagasDoEvento ?? [] }),
    onHistorico: setHistoricoId,
    onRemover: setRemovendo,
  };
  const novaEmpreita = () => setAlvo({ modo: "empreita", honorario: null, vagasDoEvento: d.vagasDoEvento ?? [] });
  const semNada = vagas.length === 0 && d.empreitas.length === 0;
  const semNome = vagas.filter((l) => l.honorario ? l.honorario.semColaborador : l.sugestao?.semColaborador).length;
  const motivoSemEnvio = prontos.length === 0 ? (editaveis.length === 0 && incompletos.length === 0 ? "Nada a enviar" : "Escolha o tipo de freela (ou outro valor) antes de enviar") : null;
  const vazioDaAba = ABAS_DO_PEDIDO.find((a) => a.key === recorte.aba)?.vazio;

  return (
    <div className="val-entra space-y-4" data-testid="hon-pedido">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onTrocarEvento} className="val-alvo -ml-1 inline-flex h-7 items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> {voltarPara ?? "Todos os eventos"}
          </button>
          <h2 className="text-[15px] font-semibold leading-6 text-foreground">{d.evento.name}</h2>
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">{periodoCurto(d.evento.startDate, d.evento.endDate)}</span>
            {" · "}{vagas.length} {vagas.length === 1 ? "vaga" : "vagas"}{semNome ? ` (${semNome} sem nome)` : ""} · {d.empreitas.length} {d.empreitas.length === 1 ? "empreita" : "empreitas"}
            {d.casa.length ? ` · ${d.casa.length} da casa (sem honorário)` : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button type="button" variant="outline" className="val-alvo w-full sm:w-auto" onClick={novaEmpreita}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar empreita
          </Button>
          <Button type="button" className="val-alvo w-full sm:w-auto" onClick={() => setEnviando(true)} disabled={!!motivoSemEnvio}
            title={motivoSemEnvio ?? undefined} data-testid="hon-enviar">
            <Send className="h-4 w-4" aria-hidden="true" /> Enviar para aprovação{prontos.length ? ` (${prontos.length})` : ""}
          </Button>
        </div>
      </div>

      {/* O que já foi lançado e o que falta (23/10) — a primeira coisa que se lê. */}
      {!semNada && <ResumoDoLancamento c={resumo} onAba={(a) => mudarRecorte(a, false)} />}

      <FaixaDeTotais testId="hon-totais" itens={[
        { rotulo: "A enviar", valor: brlCurto(soma((h) => h.podeEditar && !pendencia(h))), detalhe: `${prontos.length} ${prontos.length === 1 ? "pronto" : "prontos"}${incompletos.length ? ` · ${incompletos.length} ${incompletos.length === 1 ? "pendente" : "pendentes"}` : ""}` },
        { rotulo: "Aguardando aprovação", valor: brlCurto(soma((h) => h.status === "aguardando")), detalhe: `${todas.filter((h) => h.status === "aguardando").length} com o aprovador`, destaque: todas.some((h) => h.status === "aguardando") ? "warning" : undefined },
        { rotulo: "Aprovado", valor: brlCurto(soma((h) => h.valorAprovado != null, (h) => h.valorAprovado ?? 0)), detalhe: `${todas.filter((h) => h.valorAprovado != null).length} ${todas.filter((h) => h.valorAprovado != null).length === 1 ? "pedido" : "pedidos"}`, destaque: todas.some((h) => h.valorAprovado != null) ? "success" : undefined },
        { rotulo: "Liberado pelo Financeiro", valor: brlCurto(soma(() => true, (h) => h.liberado)), detalhe: soma((h) => h.valorAprovado != null, (h) => h.falta) > 0 ? `faltam ${brlCurto(soma((h) => h.valorAprovado != null, (h) => h.falta))}` : "—" },
      ]} />

      {devolvidos.length > 0 && (
        <p role="status" className="flex flex-wrap items-start gap-x-2.5 gap-y-1 rounded-lg border border-primary/20 bg-brand-soft px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
          <Undo2 className="mt-px h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-foreground">{devolvidos.length} {devolvidos.length === 1 ? "pedido voltou" : "pedidos voltaram"} para negociar.</span>{" "}
            O motivo está na linha — ajuste o valor e envie de novo.
          </span>
          {recorte.aba !== "decididos" && (
            <button type="button" onClick={() => mudarRecorte("decididos", false)} className="val-alvo shrink-0 rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="hon-ver-devolvidos">
              Ver {devolvidos.length === 1 ? "o devolvido" : "os devolvidos"}
            </button>
          )}
        </p>
      )}

      {semNada ? (
        <EstadoDaValidacao icone={<Inbox aria-hidden="true" />} titulo="Nenhuma vaga de cenotécnica freela neste evento"
          texto={d.casa.length ? `Há ${d.casa.length} ${d.casa.length === 1 ? "vaga da casa" : "vagas da casa"} (funcionário), que não recebem honorário. Equipes terceirizadas entram como empreita.` : "Quando houver vaga de cenotécnica neste evento (escalada ou ainda aberta), ela aparece aqui. Equipes terceirizadas entram como empreita."}
          acao={<AcaoDoEstado onClick={novaEmpreita}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar empreita</AcaoDoEstado>}
          testId="hon-pedido-vazio" />
      ) : (
        <>
          {emFoco != null && (
            <p role="status" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-primary/20 bg-brand-soft px-3.5 py-2 text-xs text-slate-700" data-testid="hon-pedido-foco">
              <Crosshair className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">Mostrando só <span className="font-semibold text-foreground">{emFoco}</span>, aberto pelos Aprovados.</span>
              <button type="button" onClick={() => setFoco(null)} className="val-alvo inline-flex shrink-0 items-center gap-1 rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="hon-pedido-foco-limpar">
                <X className="h-3 w-3" aria-hidden="true" /> Ver todas as linhas
              </button>
            </p>
          )}
          <AbasDoPedido
            aba={recorte.aba} onAba={(a) => mudarRecorte(a, recorte.soMeus)} n={nPorAba}
            devolvidos={universo.filter((i) => i.situacao === "devolvido").length}
            soMeus={recorte.soMeus} onSoMeus={(v) => mudarRecorte(recorte.aba, v)} nMeus={itens.filter((i) => i.meu).length}
          />

          {emFoco == null && filtrando && vagasVisiveis.length === 0 && empreitasVisiveis.length === 0 ? (
            <div className="val-entra flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-300 bg-card px-6 py-8 text-center" role="status" data-testid="hon-aba-vazia">
              <p className="text-sm font-semibold text-foreground">
                {recorte.soMeus && recorte.aba === "todas" ? "Você ainda não lançou nada neste evento" : vazioDaAba?.titulo}
              </p>
              <p className="max-w-[440px] text-xs leading-relaxed text-muted-foreground">
                {recorte.soMeus ? "“Lançados por mim” mostra só o que você lançou ou enviou." : vazioDaAba?.texto}
              </p>
              <button type="button" onClick={() => mudarRecorte("todas", false)} className="val-alvo mt-2 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Ver todas as linhas
              </button>
            </div>
          ) : (
            <>
              {vagasVisiveis.length > 0 && (
                <section aria-labelledby="hon-vagas" className="space-y-2">
                  <h3 id="hon-vagas" className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-foreground">
                    Vagas <span className="font-normal text-muted-foreground">· {filtrando ? `${vagasVisiveis.length} de ${vagas.length}` : `${vagas.length}${semNome ? `, ${semNome} sem nome` : ""}`} · escolha o tipo de freela ou digite outro valor</span>
                  </h3>
                  <ListaDoPedido modo={modo} valorRotulo="Valor negociado" legenda="Vagas da cenotécnica e o honorário de cada uma">
                    {vagasVisiveis.map((l) => <LinhaDaVaga key={chaveDaLinha(l)} linha={l} eventId={eventId} cb={cb} modo={modo} />)}
                  </ListaDoPedido>
                </section>
              )}

              {((!filtrando && emFoco == null) || empreitasVisiveis.length > 0) && (
                <section aria-labelledby="hon-empreitas" className="space-y-2 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="hon-empreitas" className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-foreground">
                      Empreitas <span className="font-normal text-muted-foreground">· equipe com valor fechado, com as vagas da escala que ela cobre</span>
                    </h3>
                    {d.empreitas.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" className="val-alvo text-primary hover:bg-brand-soft hover:text-primary" onClick={novaEmpreita}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Nova
                      </Button>
                    )}
                  </div>
                  {d.empreitas.length === 0 ? (
                    <button type="button" onClick={novaEmpreita}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-card px-4 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-brand-soft/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar uma empreita (responsável, vagas da escala e valor fechado)
                    </button>
                  ) : (
                    <ListaDoPedido modo={modo} valorRotulo="Valor fechado" colunaTipo="Vagas" legenda="Empreitas do evento">
                      {empreitasVisiveis.map((h) => <LinhaDaEmpreita key={h.id} h={h} eventId={eventId} cb={cb} modo={modo} />)}
                    </ListaDoPedido>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      {d.casa.length > 0 && !semNada && !filtrando && (
        <div className="rounded-xl border border-border bg-surface-muted/60 px-3.5 py-2.5 text-xs text-slate-600">
          <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setVerCasa((x) => !x)} aria-expanded={verCasa}>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1"><span className="font-medium text-foreground">{d.casa.length} {d.casa.length === 1 ? "vaga da casa" : "vagas da casa"}</span> — funcionário não recebe honorário.</span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-150", verCasa && "rotate-180")} aria-hidden="true" />
          </button>
          {verCasa && (
            <ul className="val-entra mt-2 grid gap-1 border-t border-border pt-2 sm:grid-cols-2">
              {d.casa.map((c) => <li key={c.id} className="truncate"><span className="font-mono tabular-nums text-muted-foreground">#{c.inclusionNumber}</span> {c.collaboratorName ?? "—"} · {c.functionName}</li>)}
            </ul>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-2xs leading-4 text-muted-foreground">
        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        Os honorários não mudam a escalação. Só o valor aprovado entra no Planejado da vaga — rascunho, enviado e devolvido não mudam nada.
      </p>

      <DetalhesDialog alvo={alvo} eventId={eventId} evento={d.evento} onClose={() => setAlvo(null)} />
      <HistoricoSheet id={historicoId} aberto={!!historicoId} onOpenChange={(o) => { if (!o) setHistoricoId(null); }} visao="pedido" />
      <EnviarDialog aberto={enviando} onOpenChange={setEnviando} prontos={prontos} incompletos={incompletos} evento={d.evento.name} />
      <ConfirmDialog
        open={!!removendo}
        onOpenChange={(o) => { if (!o && !remover.isPending) setRemovendo(null); }}
        title="Remover o rascunho?"
        description={removendo ? `${removendo.nome} volta para "Falta lançar". Nada foi enviado ao aprovador ainda.` : undefined}
        tone="danger"
        icon={Trash2}
        cancelLabel="Manter"
        confirmLabel={remover.isPending ? "Removendo…" : "Remover rascunho"}
        pending={remover.isPending}
        onConfirm={() => { void confirmarRemocao(); }}
      />
    </div>
  );
}

type ListaSemEvento = "eventos" | "aprovados";
const ABAS_SEM_EVENTO: { id: ListaSemEvento; rotulo: string; icone: typeof CalendarDays }[] = [
  { id: "eventos", rotulo: "Eventos", icone: CalendarDays },
  { id: "aprovados", rotulo: "Aprovados (todos os eventos)", icone: BadgeCheck },
];

/** Eventos | Aprovados (todos os eventos) — as abas de quem lança sem evento escolhido (30/10). */
function AbasSemEvento({ aba, onAba }: { aba: ListaSemEvento; onAba: (a: ListaSemEvento) => void }) {
  return (
    <div className="val-rolagem-x border-b border-border">
      <div role="tablist" aria-label="Honorários sem evento escolhido" className="flex min-w-max items-end gap-1">
        {ABAS_SEM_EVENTO.map((a, i) => {
          const on = aba === a.id;
          const Icone = a.icone;
          return (
            <button key={a.id} id={`hon-lista-tab-${a.id}`} type="button" role="tab" aria-selected={on} aria-controls="hon-lista-painel" tabIndex={on ? 0 : -1}
              data-testid={`hon-lista-tab-${a.id}`}
              onClick={() => onAba(a.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const prox = ABAS_SEM_EVENTO[(i + 1) % ABAS_SEM_EVENTO.length];
                onAba(prox.id);
                document.getElementById(`hon-lista-tab-${prox.id}`)?.focus();
              }}
              className={cn("relative -mb-px inline-flex h-11 items-center gap-2 rounded-t-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                on ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
              {a.rotulo}
              <span aria-hidden="true" className={cn("absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none", on ? "scale-x-100" : "scale-x-0")} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A aba inteira: acesso → lista de eventos (ou os aprovados de todos) ou o evento escolhido. */
export function PedidoPainel({ eventId, onEscolherEvento }: { eventId: string | null; onEscolherEvento: (id: string) => void }) {
  const acesso = useAcessoHonorarios();
  // 30/10: a aba e os filtros dos Aprovados sobrevivem à ida ao evento e à volta.
  const [lista, setLista] = useState<ListaSemEvento>("eventos");
  const [filtros, setFiltros] = useState<FiltrosDosAprovados>(FILTROS_PADRAO);
  const [foco, setFoco] = useState<{ eventId: string; honorarioId: string } | null>(null);
  if (acesso.isLoading) return <Esqueleto linhas={4} rotulo="Carregando…" />;
  if (!acesso.data?.podePedir) {
    return (
      <EstadoDaValidacao icone={<Lock aria-hidden="true" />} titulo="Honorários são lançados pela cenotécnica"
        texto="Só quem responde pelas funções de cenotécnica (validador ou responsável da função) e o administrador lançam o valor negociado. Se deveria ser você, fale com o administrador."
        testId="hon-sem-acesso" />
    );
  }
  if (!eventId) {
    return (
      <div className="space-y-4">
        <AbasSemEvento aba={lista} onAba={setLista} />
        <div id="hon-lista-painel" role="tabpanel" aria-labelledby={`hon-lista-tab-${lista}`}>
          {lista === "eventos"
            ? <EventosDoPedido onEscolher={(id) => { setFoco(null); onEscolherEvento(id); }} />
            : <AprovadosDeTodosOsEventos filtros={filtros} onFiltros={(f) => setFiltros((x) => ({ ...x, ...f }))} visao="quem-lanca"
                podeInformarOc={!!acesso.data?.podeInformarOc}
                onAbrirNoEvento={(h) => { setFoco({ eventId: h.eventId, honorarioId: h.id }); onEscolherEvento(h.eventId); }} />}
        </div>
      </div>
    );
  }
  const focoAqui = foco?.eventId === eventId ? foco.honorarioId : null;
  return <PedidoDoEvento key={`${eventId}:${focoAqui ?? ""}`} eventId={eventId} foco={focoAqui} voltarPara={lista === "aprovados" ? "Aprovados (todos os eventos)" : undefined}
    onTrocarEvento={() => { setFoco(null); onEscolherEvento(""); }} />;
}
