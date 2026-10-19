/**
 * Honorários — a aba de QUEM PEDE (cenotécnica), dentro da Validação de escala
 * (16/10). "O pessoal de cenotécnica entra, coloca um valor que negociou e
 * manda para a aprovação" — sem mexer em nada da escala.
 *
 * Sem evento: a lista dos eventos com cenotécnica escalada (próximos primeiro).
 * Com evento: uma linha por vaga escalada freela, com o valor digitado na
 * célula (grava ao sair), as empreitas abaixo e "Enviar para aprovação" em
 * lote. A vaga da casa (funcionário) fica numa nota: não recebe honorário.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, CloudOff, HardHat, History, Inbox, Lock, Pencil, Plus, Send, Trash2, Undo2, Users,
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
import { faltaParaEnviar, valorPorDiaria } from "@shared/honorarios-ceno";
import {
  useAcessoHonorarios, useEventosDoPedido, useMutacoesDoPedido, usePedidoDoEvento,
  type CamposDoPedido, type EventoDoPedido, type Honorario, type LinhaDoPedido,
} from "./api";
import { AvisoDaLinha, BarraDaVerba, EtapaBadge, FaixaDeTotais, ValorComDiaria, brl, brlCurto, diariasTexto, haQuanto, periodoCurto, posicaoLabel, setorLabel } from "./pecas";
import { CampoDeValor, IndicadorDeSalvamento, SelectDePosicao, SelectDeSetor, useSalvamento } from "./linha-editavel";
import { DetalhesDialog, type AlvoDoFormulario } from "./detalhes-dialog";
import { HistoricoSheet } from "./historico-sheet";

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

function LinhaDoEvento({ e, onEscolher }: { e: EventoDoPedido; onEscolher: (id: string) => void }) {
  const contadores = [
    e.devolvidos ? { n: e.devolvidos, rotulo: e.devolvidos === 1 ? "devolvido" : "devolvidos", tom: "primary" as const } : null,
    e.aguardando ? { n: e.aguardando, rotulo: "aguardando", tom: "warning" as const } : null,
    e.rascunhos ? { n: e.rascunhos, rotulo: e.rascunhos === 1 ? "rascunho" : "rascunhos", tom: "neutral" as const } : null,
    e.aprovados ? { n: e.aprovados, rotulo: e.aprovados === 1 ? "aprovado" : "aprovados", tom: "success" as const } : null,
  ].filter(Boolean) as { n: number; rotulo: string; tom: "primary" | "warning" | "neutral" | "success" }[];
  return (
    <li>
      <button
        type="button"
        onClick={() => onEscolher(e.id)}
        className="group flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-testid={`hon-evento-${e.id}`}
      >
        <DataDoEvento iso={e.startDate} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{e.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
            <span>{periodoCurto(e.startDate, e.endDate)}</span>
            <span aria-hidden="true">·</span>
            <span>{e.vagas} {e.vagas === 1 ? "vaga escalada" : "vagas escaladas"}{e.semPedido > 0 ? ` · ${e.semPedido} sem valor` : ""}</span>
            {e.empreitas > 0 && <><span aria-hidden="true">·</span><span>{e.empreitas} {e.empreitas === 1 ? "empreita" : "empreitas"}</span></>}
          </span>
          {contadores.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {contadores.map((c) => <StatusBadge key={c.rotulo} tone={c.tom} size="sm">{c.n} {c.rotulo}</StatusBadge>)}
            </span>
          )}
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <span className="block text-2xs text-muted-foreground">{e.totalAprovado > 0 ? "Aprovado" : e.totalPedido > 0 ? "Enviado" : "Nada enviado"}</span>
          <span className={cn("block text-sm font-semibold tabular-nums", e.totalAprovado || e.totalPedido ? "text-foreground" : "text-muted-foreground")}>{e.totalAprovado || e.totalPedido ? brlCurto(e.totalAprovado || e.totalPedido) : "—"}</span>
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
      <EstadoDaValidacao icone={<HardHat aria-hidden="true" />} titulo="Nenhum evento com cenotécnica escalada"
        texto="Quando uma vaga de cenotécnica freela for escalada, o evento aparece aqui para você lançar o valor negociado."
        testId="hon-eventos-vazio" />
    );
  }
  const proximos = lista.filter((e) => !e.passado);
  const passados = lista.filter((e) => e.passado);
  const bloco = (titulo: string, itens: EventoDoPedido[]) => itens.length > 0 && (
    <section className="space-y-2" aria-label={titulo}>
      <h3 className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{titulo}</h3>
      <ul className={cn(MOLDURA, "divide-y divide-border overflow-hidden")}>{itens.map((e) => <LinhaDoEvento key={e.id} e={e} onEscolher={onEscolher} />)}</ul>
    </section>
  );
  return (
    <div className="val-entra space-y-5" data-testid="hon-eventos">
      <p className="text-sm text-muted-foreground">Escolha o evento para lançar o valor negociado de cada vaga escalada da cenotécnica.</p>
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
        : await criar.mutateAsync({ eventId, tipo: linha.vaga ? "vaga" : "empreita", teamInclusionId: linha.vaga?.id, setor: linha.sugestao?.setor, posicao: linha.sugestao?.posicao, ...campos });
      atual.current = novo;
    }, mensagemDoErro));
  };
  return { salvar, ...sv };
}

function Situacao({ h, sem, compacta }: { h: Honorario | null; sem?: string; compacta?: boolean }) {
  if (h && compacta) return <EtapaBadge h={h} visao="pedido" />;
  if (!h) return <StatusBadge tone="neutral" size="sm" className="bg-transparent ring-1 ring-inset ring-border">{sem ?? "Sem valor"}</StatusBadge>;
  return (
    <span className="block space-y-1">
      <EtapaBadge h={h} visao="pedido" />
      {h.status === "aguardando" && <span className="block text-2xs text-muted-foreground">Enviado {haQuanto(h.enviadoEm)}</span>}
      {(h.status === "aprovado" || h.status === "aprovado_ajuste") && (
        <>
          <span className="block text-2xs text-muted-foreground">por {h.decididoPorNome ?? "aprovador"}</span>
          {h.liberado > 0 && h.valorAprovado ? <BarraDaVerba aprovado={h.valorAprovado} liberado={h.liberado} className="max-w-[140px]" /> : null}
        </>
      )}
      {h.status === "devolvido" && <span className="block text-2xs text-muted-foreground">por {h.decididoPorNome ?? "aprovador"} · {haQuanto(h.decididoEm)}</span>}
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
        <button type="button" className={cn(ICONE_DA_LINHA, "hover:bg-brand-soft hover:text-primary")} onClick={onDetalhes} aria-label={`Editar detalhes de ${nome}`} title="Período, diárias e observação">
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
  setor: string | null;
  posicao: string | null;
  periodo: string;
  diarias: number | null;
  valor: number;
  rotuloDoValor: string;
  salvar: (c: CamposDoPedido) => void;
  estado: ReturnType<typeof useSalvamento>["estado"];
  erro: string | null;
  acoes: ReactNode;
}

function PorDiariaOuStatus({ d }: { d: DadosDaLinha }) {
  const porDia = valorPorDiaria(d.valor, d.diarias);
  if (d.estado !== "parado") return <IndicadorDeSalvamento estado={d.estado} erro={d.erro} />;
  return <span className="tabular-nums">{porDia != null && d.valor > 0 ? `${brl(porDia)}/diária` : "— /diária"}</span>;
}

function CampoDoValor({ d, alinhar = "direita" }: { d: DadosDaLinha; alinhar?: "direita" | "esquerda" }) {
  if (!d.editavel) {
    const h = d.h;
    return <ValorComDiaria valor={h?.valorAprovado ?? h?.valorPedido} diarias={d.diarias} riscado={h?.valorAprovado != null ? h.valorPedido : null} alinhar={alinhar} />;
  }
  return (
    <>
      <CampoDeValor valor={d.valor} onSalvar={(c) => d.salvar({ valorPedido: c })} rotulo={`${d.rotuloDoValor} de ${d.nome}`} testId={`hon-valor-${d.testId}`} />
      <span className="mt-1 flex min-h-4 justify-end text-2xs text-muted-foreground"><PorDiariaOuStatus d={d} /></span>
    </>
  );
}

function CampoSetorPosicao({ d }: { d: DadosDaLinha }) {
  const setor = d.editavel
    ? <SelectDeSetor valor={d.setor} onMudar={(x) => d.salvar({ setor: x })} rotulo={`Setor de ${d.nome}`} />
    : <span className="inline-flex h-9 items-center text-xs text-slate-700">{setorLabel(d.setor)}</span>;
  const posicao = d.posicao === "empreita"
    ? <span className="inline-flex h-9 items-center text-xs font-medium text-slate-600">Empreita</span>
    : d.editavel
      ? <SelectDePosicao valor={d.posicao} onMudar={(x) => d.salvar({ posicao: x })} rotulo={`Posição de ${d.nome}`} />
      : <span className="inline-flex h-9 items-center text-xs text-slate-700">{posicaoLabel(d.posicao)}</span>;
  return (
    <span className="grid grid-cols-2 gap-2">
      <span className="min-w-0">{setor}</span>
      <span className="min-w-0">{posicao}</span>
    </span>
  );
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
      <li className={cn("val-entra overflow-hidden rounded-xl border bg-card shadow-1", devolvido ? "border-primary/25" : "border-border")} data-testid={`hon-linha-${d.testId}`}>
        <div className="space-y-3 px-3.5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">{titulo}<span className="mt-0.5 block text-2xs text-muted-foreground">{d.sub}</span></div>
            <span className="shrink-0"><Situacao h={d.h} compacta /></span>
          </div>
          {d.avisos}
          <CampoSetorPosicao d={d} />
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
        <div className="flex items-center justify-end gap-1 border-t border-border bg-surface-muted/60 px-2 py-1">{d.acoes}</div>
      </li>
    );
  }
  return (
    <tr className={cn("border-b border-border align-top transition-colors last:border-b-0", devolvido ? "bg-brand-soft/30" : "bg-card hover:bg-surface-muted/50")} data-testid={`hon-linha-${d.testId}`}>
      <td className="px-3 py-3">
        {titulo}
        <span className="mt-0.5 block text-2xs text-muted-foreground">{d.sub}</span>
        <span className="mt-0.5 block text-2xs tabular-nums text-slate-600">Montagem {d.periodo} · {diariasTexto(d.diarias)}</span>
        {d.avisos}
      </td>
      <td className="px-3 py-3"><CampoSetorPosicao d={d} /></td>
      <td className="px-3 py-3 text-right"><CampoDoValor d={d} /></td>
      <td className="px-3 py-3"><Situacao h={d.h} /></td>
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
  const nome = h?.nome ?? s?.nome ?? "Vaga";
  const numero = v?.inclusionNumber ?? h?.inclusionNumber;
  return {
    chave: v?.id ?? h?.id ?? nome,
    testId: String(numero ?? h?.id ?? nome),
    nome,
    sub: (
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
                Passar o pedido para {h.colaboradorAtual ?? "quem está na vaga"}
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
    setor: h?.setor ?? s?.setor ?? null,
    posicao: h?.posicao ?? s?.posicao ?? null,
    periodo: periodoCurto(h?.inicio ?? s?.inicio, h?.fim ?? s?.fim),
    diarias: h?.diarias ?? s?.diarias ?? null,
    valor: h?.valorPedido ?? 0,
    rotuloDoValor: "Valor negociado",
    salvar: sv.salvar,
    estado: sv.estado,
    erro: sv.erro,
    acoes: <AcoesDaLinha h={h} editavel={editavel && !!v} nome={nome} onDetalhes={() => cb.onDetalhes(linha)} onHistorico={cb.onHistorico} onRemover={cb.onRemover} />,
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
    avisos: <AvisoDevolvido h={h} />,
    h,
    editavel: h.podeEditar,
    setor: h.setor,
    posicao: "empreita",
    periodo: periodoCurto(h.inicio, h.fim),
    diarias: h.diarias,
    valor: h.valorPedido,
    rotuloDoValor: "Valor fechado",
    salvar: sv.salvar,
    estado: sv.estado,
    erro: sv.erro,
    acoes: <AcoesDaLinha h={h} editavel={h.podeEditar} nome={h.nome} onDetalhes={() => cb.onEditarEmpreita(h)} onHistorico={cb.onHistorico} onRemover={cb.onRemover} />,
  };
}

interface Callbacks {
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
function ListaDoPedido({ modo, valorRotulo, legenda, children }: { modo: ModoDaLista; valorRotulo: string; legenda: string; children: ReactNode }) {
  if (modo === "cartao") return <ul className="grid gap-2.5 md:grid-cols-2" aria-label={legenda}>{children}</ul>;
  return (
    <div className={cn(MOLDURA, "overflow-hidden")}>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={TH}>Pessoa</th>
            <th scope="col" className={cn(TH, "w-[296px] 2xl:w-[340px]")}>Setor · posição</th>
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
                <span className="block text-2xs text-muted-foreground">{setorLabel(p.setor)} · {posicaoLabel(p.posicao)} · {diariasTexto(p.diarias)}{p.status === "devolvido" ? " · reenvio" : ""}</span>
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

function PedidoDoEvento({ eventId, onTrocarEvento }: { eventId: string; onTrocarEvento: () => void }) {
  const q = usePedidoDoEvento(eventId);
  const { remover } = useMutacoesDoPedido();
  const { toast } = useToast();
  const [alvo, setAlvo] = useState<AlvoDoFormulario | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<Honorario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [verCasa, setVerCasa] = useState(false);
  const modo: ModoDaLista = useMediaQuery("(min-width: 1280px)") ? "tabela" : "cartao";

  const d = q.data;
  const todas = useMemo(() => [
    ...(d?.linhas.map((l) => l.honorario).filter(Boolean) as Honorario[] ?? []),
    ...(d?.empreitas ?? []),
  ], [d]);
  const editaveis = todas.filter((h) => h.podeEditar);
  /** O que ainda segura a linha (dados ou a troca de colaborador sem confirmar). */
  const pendencia = (h: Honorario) => faltaParaEnviar(h) ?? (h.avisoDaVaga === "colaborador_trocado" ? "A vaga trocou de colaborador — confirme na linha." : null);
  const prontos = editaveis.filter((h) => !pendencia(h));
  const incompletos = [
    ...editaveis.filter((h) => pendencia(h)).map((h) => ({ nome: h.nome, motivo: pendencia(h)! })),
    ...(d?.linhas.filter((l) => !l.honorario && !l.foraDaEscala).map((l) => ({ nome: l.sugestao?.nome ?? "Vaga", motivo: "Sem valor" })) ?? []),
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
      toast({ title: "Rascunho removido", description: `${removendo.nome} voltou a ficar sem valor.` });
      setRemovendo(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível remover", description: apiErrorMessage(e, "Tente de novo.") });
      if (isApiError(e) && (e.status === 409 || e.status === 404)) setRemovendo(null);
    }
  };

  const vagas = d.linhas;
  const cb: Callbacks = {
    onDetalhes: (x) => setAlvo({ modo: "vaga", linha: x }),
    onEditarEmpreita: (x) => setAlvo({ modo: "empreita", honorario: x }),
    onHistorico: setHistoricoId,
    onRemover: setRemovendo,
  };
  const semNada = vagas.length === 0 && d.empreitas.length === 0;
  const motivoSemEnvio = prontos.length === 0 ? (editaveis.length === 0 && incompletos.length === 0 ? "Nada a enviar" : "Preencha valor, setor e posição antes de enviar") : null;

  return (
    <div className="val-entra space-y-4" data-testid="hon-pedido">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onTrocarEvento} className="val-alvo -ml-1 inline-flex h-7 items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Todos os eventos
          </button>
          <h2 className="text-sm font-semibold text-foreground">Honorários do evento</h2>
          <p className="text-xs text-muted-foreground">
            {vagas.length} {vagas.length === 1 ? "vaga escalada" : "vagas escaladas"} · {d.empreitas.length} {d.empreitas.length === 1 ? "empreita" : "empreitas"}
            {d.casa.length ? ` · ${d.casa.length} da casa (sem honorário)` : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button type="button" variant="outline" className="val-alvo flex-1 sm:flex-none" onClick={() => setAlvo({ modo: "empreita", honorario: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar empreita
          </Button>
          <Button type="button" className="val-alvo flex-1 sm:flex-none" onClick={() => setEnviando(true)} disabled={!!motivoSemEnvio}
            title={motivoSemEnvio ?? undefined} data-testid="hon-enviar">
            <Send className="h-4 w-4" aria-hidden="true" /> Enviar para aprovação{prontos.length ? ` (${prontos.length})` : ""}
          </Button>
        </div>
      </div>

      <FaixaDeTotais testId="hon-totais" itens={[
        { rotulo: "A enviar", valor: brlCurto(soma((h) => h.podeEditar && !pendencia(h))), detalhe: `${prontos.length} ${prontos.length === 1 ? "pronto" : "prontos"}${incompletos.length ? ` · ${incompletos.length} ${incompletos.length === 1 ? "pendente" : "pendentes"}` : ""}` },
        { rotulo: "Aguardando aprovação", valor: brlCurto(soma((h) => h.status === "aguardando")), detalhe: `${todas.filter((h) => h.status === "aguardando").length} com o aprovador`, destaque: todas.some((h) => h.status === "aguardando") ? "warning" : undefined },
        { rotulo: "Aprovado", valor: brlCurto(soma((h) => h.valorAprovado != null, (h) => h.valorAprovado ?? 0)), detalhe: `${todas.filter((h) => h.valorAprovado != null).length} ${todas.filter((h) => h.valorAprovado != null).length === 1 ? "pedido" : "pedidos"}`, destaque: todas.some((h) => h.valorAprovado != null) ? "success" : undefined },
        { rotulo: "Liberado pelo Financeiro", valor: brlCurto(soma(() => true, (h) => h.liberado)), detalhe: soma((h) => h.valorAprovado != null, (h) => h.falta) > 0 ? `faltam ${brlCurto(soma((h) => h.valorAprovado != null, (h) => h.falta))}` : "—" },
      ]} />

      {devolvidos.length > 0 && (
        <p role="status" className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-brand-soft px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
          <Undo2 className="mt-px h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-semibold text-foreground">{devolvidos.length} {devolvidos.length === 1 ? "pedido voltou" : "pedidos voltaram"} para negociar.</span>{" "}
            O motivo está na linha — ajuste o valor e envie de novo.
          </span>
        </p>
      )}

      {semNada ? (
        <EstadoDaValidacao icone={<Inbox aria-hidden="true" />} titulo="Nenhuma vaga de cenotécnica freela escalada neste evento"
          texto={d.casa.length ? `Há ${d.casa.length} ${d.casa.length === 1 ? "vaga da casa" : "vagas da casa"} (funcionário), que não recebem honorário. Equipes terceirizadas entram como empreita.` : "Quando a escalação da cenotécnica for confirmada, as vagas aparecem aqui. Equipes terceirizadas entram como empreita."}
          acao={<AcaoDoEstado onClick={() => setAlvo({ modo: "empreita", honorario: null })}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar empreita</AcaoDoEstado>}
          testId="hon-pedido-vazio" />
      ) : (
        <>
          {vagas.length > 0 && (
            <section aria-labelledby="hon-vagas" className="space-y-2">
              <h3 id="hon-vagas" className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-foreground">
                Vagas escaladas <span className="font-normal text-muted-foreground">· {vagas.length} {vagas.length === 1 ? "pessoa" : "pessoas"} · o valor grava ao sair do campo</span>
              </h3>
              <ListaDoPedido modo={modo} valorRotulo="Valor negociado" legenda="Vagas escaladas da cenotécnica e o valor negociado de cada uma">
                {vagas.map((l) => <LinhaDaVaga key={l.vaga?.id ?? l.honorario?.id} linha={l} eventId={eventId} cb={cb} modo={modo} />)}
              </ListaDoPedido>
            </section>
          )}

          <section aria-labelledby="hon-empreitas" className="space-y-2 pt-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="hon-empreitas" className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-foreground">
                Empreitas <span className="font-normal text-muted-foreground">· equipes terceirizadas com valor fechado</span>
              </h3>
              {d.empreitas.length > 0 && (
                <Button type="button" variant="ghost" size="sm" className="val-alvo text-primary hover:bg-brand-soft hover:text-primary" onClick={() => setAlvo({ modo: "empreita", honorario: null })}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Nova
                </Button>
              )}
            </div>
            {d.empreitas.length === 0 ? (
              <button type="button" onClick={() => setAlvo({ modo: "empreita", honorario: null })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-card px-4 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-brand-soft/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar uma empreita (responsável, nº de pessoas e valor fechado)
              </button>
            ) : (
              <ListaDoPedido modo={modo} valorRotulo="Valor fechado" legenda="Empreitas do evento">
                {d.empreitas.map((h) => <LinhaDaEmpreita key={h.id} h={h} eventId={eventId} cb={cb} modo={modo} />)}
              </ListaDoPedido>
            )}
          </section>
        </>
      )}

      {d.casa.length > 0 && !semNada && (
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

      <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
        Os honorários não mudam a escalação, o Planejado nem o Realizado — são um pedido à parte para o Financeiro.
      </p>

      <DetalhesDialog alvo={alvo} eventId={eventId} evento={d.evento} onClose={() => setAlvo(null)} />
      <HistoricoSheet id={historicoId} aberto={!!historicoId} onOpenChange={(o) => { if (!o) setHistoricoId(null); }} visao="pedido" />
      <EnviarDialog aberto={enviando} onOpenChange={setEnviando} prontos={prontos} incompletos={incompletos} evento={d.evento.name} />
      <ConfirmDialog
        open={!!removendo}
        onOpenChange={(o) => { if (!o && !remover.isPending) setRemovendo(null); }}
        title="Remover o rascunho?"
        description={removendo ? `${removendo.nome} volta a ficar sem valor. Nada foi enviado ao aprovador ainda.` : undefined}
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

/** A aba inteira: acesso → lista de eventos ou o evento escolhido. */
export function PedidoPainel({ eventId, onEscolherEvento }: { eventId: string | null; onEscolherEvento: (id: string) => void }) {
  const acesso = useAcessoHonorarios();
  if (acesso.isLoading) return <Esqueleto linhas={4} rotulo="Carregando…" />;
  if (!acesso.data?.podePedir) {
    return (
      <EstadoDaValidacao icone={<Lock aria-hidden="true" />} titulo="Honorários são lançados pela cenotécnica"
        texto="Só quem responde pelas funções de cenotécnica (validador ou responsável da função) e o administrador lançam o valor negociado. Se deveria ser você, fale com o administrador."
        testId="hon-sem-acesso" />
    );
  }
  if (!eventId) return <EventosDoPedido onEscolher={onEscolherEvento} />;
  return <PedidoDoEvento eventId={eventId} onTrocarEvento={() => onEscolherEvento("")} />;
}
