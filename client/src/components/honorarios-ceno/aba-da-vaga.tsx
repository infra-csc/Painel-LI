/**
 * Honorários na ESCALAÇÃO (dono, 20/10): "eles têm que pedir aqui na
 * escalação e chegar para o aprovador em outra tela".
 *
 * A aba "Honorário" do modal da vaga — ao lado de Passagem e Hospedagem, com
 * o mesmo ponto de pendência. Aparece quando a vaga é de cenotécnica e a
 * pessoa pode pedir por aquela função. Vaga de outra função ou usuário sem
 * cadastro: a aba não existe (e nenhuma consulta de valores sai).
 *
 * O que a aba mostra (20/10):
 *  - vaga ativa (escalada OU ainda aberta — "não precisa escalar"): o
 *    formulário do pedido (tipo de freela da tabela ou "Outro valor"). Na
 *    vaga aberta, uma linha discreta diz que o pedido segue sem colaborador;
 *  - vaga que faz parte de uma EMPREITA: "Faz parte da empreita X (R$ Y, N
 *    vagas)", com "Abrir a empreita" e "Tirar desta empreita" — a vaga não
 *    tem pedido próprio;
 *  - vaga da casa ou cancelada: `SemHonorario` explica por que não há pedido.
 *
 * Por que aba e não bloco do Resumo: o Resumo é a escala e o rodapé do modal
 * salva a VAGA. Honorário é dinheiro, à parte — numa aba própria o rodapé do
 * modal passa a ser o DELE ("Salvar rascunho", "Enviar para aprovação").
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, CircleDollarSign, History, Loader2, Save, Send, Undo2, UserRound, Users } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { ehCenotecnica } from "@shared/cenotecnica";
import { faltaParaEnviar, rotuloDoValor } from "@shared/honorarios-ceno";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { Secao, useTelaLarga } from "@/components/scaling/inclusion-details/details-shared";
import {
  useAcessoHonorarios, useHistoricoDoHonorario, useMutacoesDoPedido, usePedidoDoEvento,
  type Honorario, type LinhaDoPedido, type PedidoDoEvento, type PrecisaConfirmarDescarte,
} from "./api";
import { AvisoDaLinha, EtapaBadge, VagasDaEmpreitaLista, brl, dataBr, diariasTexto, haQuanto, periodoCurto } from "./pecas";
import { CamposDoPedido, ConfirmarDescarteDasVagas, DetalhesDialog, useFormularioDoPedido, type AlvoDoFormulario } from "./detalhes-dialog";
import { HistoricoSheet, LinhaDoTempo, ResumoDosValores } from "./historico-sheet";

/**
 * A linha de honorário desta vaga, para quem pode pedir. Só consulta quando a
 * função é de cenotécnica (com Sup Ceno) e o modal está aberto; a chave do
 * cache é a mesma do painel "Honorários do evento" — os dois andam juntos.
 */
export function useHonorarioDaVaga(inclusion: TeamInclusion | null, nomeDaFuncao: string, aberto: boolean) {
  const ceno = aberto && !!inclusion && ehCenotecnica(nomeDaFuncao, { incluiSupCeno: true });
  const acesso = useAcessoHonorarios(ceno);
  const podePedir = ceno && !!acesso.data?.podePedir;
  const q = usePedidoDoEvento(inclusion?.eventId ?? null, podePedir);
  const linha = (inclusion && q.data?.linhas.find((l) => l.vaga?.id === inclusion.id || l.honorario?.teamInclusionId === inclusion.id)) || null;
  const empreita = (inclusion && q.data?.empreitas.find((e) => e.vagasDaEmpreita?.some((v) => v.id === inclusion.id))) || null;
  const h = linha?.honorario ?? null;
  return {
    /**
     * A aba existe para esta vaga e esta pessoa: toda vaga de cenotécnica de
     * quem pede. Sem linha no pedido (casa, cancelada) a aba explica por quê.
     */
    visivel: podePedir,
    /** Ainda não se sabe (acesso ou pedido carregando). */
    carregando: ceno && (acesso.isLoading || (podePedir && q.isLoading)),
    linha,
    /** A empreita de que esta vaga faz parte (então ela não tem pedido próprio). */
    empreita,
    pedido: q.data ?? null,
    evento: q.data?.evento ?? null,
    /** O ponto na aba: falta lançar, está em rascunho ou voltou para negociar. */
    pendente: !empreita && !!linha && (h ? h.podeEditar : !linha.foraDaEscala),
  };
}

export type HonorarioDaVaga = ReturnType<typeof useHonorarioDaVaga>;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const LINK = "val-alvo inline-flex items-center rounded-md px-1 text-2xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** O que a etapa significa para quem pede, numa frase. */
function Situacao({ h, linha }: { h: Honorario | null; linha: LinhaDoPedido }) {
  if (!h) {
    return (
      <div className="space-y-2" data-testid="hon-vaga-situacao">
        <StatusBadge tone="neutral" dot className="bg-transparent ring-1 ring-inset ring-border">Sem pedido</StatusBadge>
        <p className="text-sm text-slate-700">
          {linha.foraDaEscala ? "A vaga saiu da escala — não há o que pedir." : "Escolha o tipo de freela (valor da tabela) ou outro valor. Fica como rascunho até você enviar para o aprovador."}
        </p>
      </div>
    );
  }
  const aprovado = h.status === "aprovado" || h.status === "aprovado_ajuste";
  return (
    <div className="space-y-2.5" data-testid="hon-vaga-situacao">
      <EtapaBadge h={h} visao="pedido" />
      {h.status === "rascunho" && <p className="text-sm text-slate-700">Ainda não foi para o aprovador.</p>}
      {h.status === "aguardando" && (
        <p className="text-sm text-slate-700">
          Enviado {haQuanto(h.enviadoEm)}{h.enviadoPorNome ? ` por ${h.enviadoPorNome}` : ""}. Está com o aprovador — o valor só muda se ele devolver para negociar.
        </p>
      )}
      {h.status === "devolvido" && (
        <div className="rounded-lg border border-primary/20 bg-brand-soft px-3 py-2.5 text-sm leading-relaxed text-slate-700" data-testid="hon-vaga-motivo">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-primary">
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Voltou para negociar
          </p>
          <p className="mt-1">{h.motivoDecisao ?? "O aprovador pediu para rever o valor."}</p>
          <p className="mt-1 text-2xs text-muted-foreground">{h.decididoPorNome ?? "Aprovador"} · {haQuanto(h.decididoEm)} — ajuste e envie de novo.</p>
        </div>
      )}
      {aprovado && h.valorAprovado != null && (
        <>
          <p className="text-sm text-slate-700">
            <span className="font-semibold tabular-nums text-foreground" data-testid="hon-vaga-valor-aprovado">{brl(h.valorAprovado)}</span>
            {h.valorAprovado !== h.valorPedido && <span className="tabular-nums text-muted-foreground"> (pedido {brl(h.valorPedido)})</span>}
            {" "}aprovado{h.status === "aprovado_ajuste" ? " com ajuste" : ""} por {h.decididoPorNome ?? "aprovador"}{h.decididoEm ? ` em ${dataBr(h.decididoEm)}` : ""}.
            {h.falta > 0
              ? (h.liberado > 0 ? ` O Financeiro já liberou parte; faltam ${brl(h.falta)}.` : " Agora o Financeiro registra a liberação da verba.")
              : " Verba liberada por completo."}
          </p>
          {h.status === "aprovado_ajuste" && h.motivoDecisao && (
            <p className="rounded-lg border border-success/20 bg-success-soft/60 px-3 py-2 text-xs leading-relaxed text-slate-700">
              <span className="font-semibold text-foreground">Motivo do ajuste: </span>{h.motivoDecisao}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Historico({ id }: { id: string }) {
  const q = useHistoricoDoHonorario(id);
  if (q.isLoading) {
    return <div className="space-y-2" aria-busy="true" aria-label="Carregando o histórico"><div className="val-osso h-4 w-2/3" /><div className="val-osso h-4 w-1/2" /></div>;
  }
  if (q.error || !Array.isArray(q.data?.historico)) return <p className="text-xs text-muted-foreground">{apiErrorMessage(q.error, "Não foi possível carregar o histórico.")}</p>;
  return <LinhaDoTempo historico={q.data.historico} />;
}

/** Só leitura: o que foi pedido (aguardando, aprovado, vaga parada). */
function PedidoSoLeitura({ h }: { h: Honorario }) {
  return (
    <div className="space-y-3">
      <ResumoDosValores h={h} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-2xs text-muted-foreground">Origem do valor</dt><dd className="text-foreground">{rotuloDoValor({ ...h, observacao: null })}</dd></div>
        <div><dt className="text-2xs text-muted-foreground">Montagem</dt><dd className="tabular-nums text-foreground">{periodoCurto(h.inicio, h.fim)} · {diariasTexto(h.diarias)}</dd></div>
      </dl>
      {h.observacao && <p className="text-xs leading-relaxed text-slate-700"><span className="font-semibold text-foreground">Observação: </span>{h.observacao}</p>}
    </div>
  );
}

/** Vaga da casa ou cancelada: não há pedido. (A vaga ABERTA pede normalmente desde 20/10.) */
function SemHonorario() {
  return (
    <TabsContent value="honorario" className="esc-entra m-0 p-3 sm:p-5">
      <Secao titulo="Pedido de honorário" icone={<CircleDollarSign className="text-muted-foreground" aria-hidden="true" />} testId="hon-vaga-sem-linha" corpo="p-4 space-y-2">
        <p className="m-0 text-sm font-medium text-foreground">Esta vaga não recebe honorário.</p>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          Colaborador da casa (CLT) não recebe honorário, e vaga cancelada não tem o que pedir. Freela (local ou viagem), vaga ainda sem colaborador e empreita recebem.
        </p>
      </Secao>
    </TabsContent>
  );
}

/** Abre a empreita no diálogo (editável) ou no histórico (já enviada). */
function useAbrirEmpreita(pedido: PedidoDoEvento | null) {
  const [alvo, setAlvo] = useState<AlvoDoFormulario | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const abrir = (e: Honorario | null, vagaInicial?: string) => {
    if (e && !e.podeEditar) { setHistoricoId(e.id); return; }
    setAlvo({ modo: "empreita", honorario: e, vagasDoEvento: pedido?.vagasDoEvento ?? [], vagaInicial: vagaInicial ?? null });
  };
  const dialogos = pedido ? (
    <>
      <DetalhesDialog alvo={alvo} eventId={pedido.evento.id} evento={pedido.evento} onClose={() => setAlvo(null)} />
      <HistoricoSheet id={historicoId} aberto={!!historicoId} onOpenChange={(o) => { if (!o) setHistoricoId(null); }} visao="pedido" />
    </>
  ) : null;
  return { abrir, dialogos };
}

/** A vaga faz parte de uma empreita: não tem pedido próprio — mostra a empreita. */
function NaEmpreita({ inclusion, empreita, hon, rodape, onFechar }: { inclusion: TeamInclusion; empreita: Honorario; hon: HonorarioDaVaga; rodape: HTMLElement | null; onFechar: () => void }) {
  const { toast } = useToast();
  const { editar } = useMutacoesDoPedido();
  const [tirando, setTirando] = useState(false);
  const { abrir, dialogos } = useAbrirEmpreita(hon.pedido);
  const n = empreita.vagasDaEmpreita.length;
  const valor = empreita.valorAprovado ?? empreita.valorPedido;
  const tirar = async () => {
    try {
      await editar.mutateAsync({ id: empreita.id, versao: empreita.versao, vagaIds: empreita.vagasDaEmpreita.map((v) => v.id).filter((id) => id !== inclusion.id) });
      toast({ title: "Vaga tirada da empreita", description: "Agora ela pode ter pedido próprio." });
      setTirando(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível tirar a vaga", description: apiErrorMessage(e, "Tente de novo.") });
      setTirando(false);
    }
  };
  const barra = (
    <div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-6" data-testid="hon-vaga-rodape">
      <Button type="button" variant="outline" onClick={onFechar} className="h-9 rounded-lg border-border bg-card px-4 text-sm font-medium text-slate-700 hover:bg-muted">Fechar</Button>
    </div>
  );
  return (
    <TabsContent value="honorario" className="esc-entra m-0 p-3 sm:p-5" data-testid="hon-vaga-na-empreita">
      {rodape ? createPortal(barra, rodape) : null}
      <Secao titulo="Faz parte de uma empreita" icone={<Users aria-hidden="true" />} corpo="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-sm text-slate-700">
              Faz parte da empreita <span className="font-semibold text-foreground">{empreita.nome}</span>{" "}
              (<span className="tabular-nums">{brl(valor)}</span>, {plural(n, "vaga", "vagas")}).
            </p>
            <p className="m-0 mt-1 text-xs text-muted-foreground">O valor desta vaga é o da empreita — ela não tem pedido próprio.</p>
          </div>
          <EtapaBadge h={empreita} visao="pedido" />
        </div>
        <AvisoDaLinha h={empreita} />
        <VagasDaEmpreitaLista vagas={empreita.vagasDaEmpreita} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3">
          <button type="button" className={LINK} onClick={() => abrir(empreita)} data-testid="hon-vaga-abrir-empreita">Abrir a empreita</button>
          {empreita.podeEditar ? (
            <button type="button" className={cn(LINK, "text-slate-600")} onClick={() => setTirando(true)} disabled={editar.isPending} data-testid="hon-vaga-tirar-da-empreita">Tirar desta empreita</button>
          ) : (
            <span className="text-2xs text-muted-foreground">A empreita já foi enviada — para tirar a vaga, peça para o aprovador devolver.</span>
          )}
        </div>
      </Secao>
      <ConfirmDialog
        open={tirando}
        onOpenChange={(o) => { if (!editar.isPending) setTirando(o); }}
        title="Tirar a vaga desta empreita?"
        description={`A empreita ${empreita.nome} fica com ${plural(n - 1, "vaga", "vagas")}; o valor fechado não muda sozinho. A vaga volta a poder ter pedido próprio.`}
        cancelLabel="Manter"
        confirmLabel={editar.isPending ? "Tirando…" : "Tirar da empreita"}
        pending={editar.isPending}
        onConfirm={() => { void tirar(); }}
        testId="hon-vaga-tirar-dialogo"
      />
      {dialogos}
    </TabsContent>
  );
}

/**
 * "Esta vaga faz parte de uma empreita": escolhe uma empreita do evento (que
 * ainda se edita) ou cria uma com esta vaga. Pedido próprio em rascunho é
 * descartado com confirmação; enviado bloqueia (o servidor diz o porquê).
 */
function ColocarEmEmpreita({ inclusion, hon, h }: { inclusion: TeamInclusion; hon: HonorarioDaVaga; h: Honorario | null }) {
  const { toast } = useToast();
  const { editar } = useMutacoesDoPedido();
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState<{ empreita: Honorario; lista: PrecisaConfirmarDescarte[] } | null>(null);
  const { abrir, dialogos } = useAbrirEmpreita(hon.pedido);
  const editaveis = (hon.pedido?.empreitas ?? []).filter((e) => e.podeEditar);
  const enviado = !!h && !h.podeRemover && h.status !== "devolvido";
  const colocar = async (e: Honorario, descartarRascunhos = false) => {
    try {
      await editar.mutateAsync({ id: e.id, versao: e.versao, vagaIds: [...e.vagasDaEmpreita.map((v) => v.id), inclusion.id], ...(descartarRascunhos ? { descartarRascunhos: true } : {}) });
      toast({ variant: "success", title: "Vaga colocada na empreita", description: `${e.nome} — o valor desta vaga passa a ser o da empreita.` });
      setConfirmar(null);
      setAberto(false);
    } catch (err) {
      if (isApiError(err) && err.status === 409 && Array.isArray(err.body?.precisaConfirmar)) {
        setConfirmar({ empreita: e, lista: err.body.precisaConfirmar as PrecisaConfirmarDescarte[] });
        return;
      }
      toast({ variant: "destructive", title: "Não foi possível colocar na empreita", description: apiErrorMessage(err, "Tente de novo.") });
    }
  };
  if (!hon.pedido) return null;
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-3" data-testid="hon-vaga-empreita">
      {!aberto ? (
        <button type="button" className={cn(LINK, "-ml-1 text-xs")} onClick={() => setAberto(true)} data-testid="hon-vaga-parte-de-empreita">
          <Users className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Esta vaga faz parte de uma empreita
        </button>
      ) : (
        <div className="space-y-2.5">
          <p className="m-0 text-xs font-semibold text-foreground">Em qual empreita?</p>
          {enviado ? (
            <p className="m-0 text-2xs text-muted-foreground">Esta vaga já tem pedido próprio enviado — peça para o aprovador devolver antes de colocá-la numa empreita.</p>
          ) : (
            <>
              {editaveis.length > 0 && (
                <ul className="space-y-1.5">
                  {editaveis.map((e) => (
                    <li key={e.id}>
                      <button type="button" disabled={editar.isPending} onClick={() => void colocar(e)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                        data-testid={`hon-vaga-empreita-${e.id}`}>
                        <span className="min-w-0"><span className="block truncate font-semibold text-foreground">{e.nome}</span><span className="block text-2xs text-muted-foreground">{plural(e.vagasDaEmpreita.length, "vaga", "vagas")} · {brl(e.valorPedido)}</span></span>
                        <span className="shrink-0 text-2xs font-semibold text-primary">Colocar aqui</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-x-3">
                <button type="button" className={cn(LINK, "-ml-1")} onClick={() => abrir(null, inclusion.id)} data-testid="hon-vaga-criar-empreita">Criar uma empreita com esta vaga</button>
                <button type="button" className={cn(LINK, "text-slate-600")} onClick={() => setAberto(false)}>Cancelar</button>
              </div>
              {h && <p className="m-0 text-2xs text-muted-foreground">O pedido próprio desta vaga ({h.status === "rascunho" ? "rascunho" : "devolvido"}) será descartado — a tela pede confirmação.</p>}
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmar}
        onOpenChange={(o) => { if (!o && !editar.isPending) setConfirmar(null); }}
        title="Descartar o pedido próprio?"
        description="Numa empreita, a vaga não tem pedido próprio — o valor é o da empreita. Nada disso foi aprovado; fica registrado no histórico da empreita."
        tone="danger"
        cancelLabel="Voltar"
        confirmLabel={editar.isPending ? "Salvando…" : "Descartar e colocar"}
        pending={editar.isPending}
        onConfirm={() => { if (confirmar) void colocar(confirmar.empreita, true); }}
        testId="hon-vaga-confirmar-descarte"
      />
      {dialogos}
    </div>
  );
}

export function AbaHonorarioDaVaga({ inclusion, hon, rodape, onFechar }: {
  inclusion: TeamInclusion;
  hon: HonorarioDaVaga;
  /** O rodapé do modal: enquanto a aba está aberta, ele é o do honorário (portal). */
  rodape: HTMLElement | null;
  onFechar: () => void;
}) {
  const { linha } = hon;
  const { toast } = useToast();
  const { enviar, editar } = useMutacoesDoPedido();
  const h = linha?.honorario ?? null;
  const editavel = !!linha && (h ? h.podeEditar : !linha.foraDaEscala);
  const alvo = linha && editavel ? { modo: "vaga" as const, linha } : null;
  const form = useFormularioDoPedido({
    alvo,
    // Volta ao gravado quando muda a vaga, o pedido ou a versão dele — não a cada refetch.
    chave: `${inclusion.id}|${h?.id ?? "novo"}|${h?.versao ?? 0}|${editavel}|${linha?.tabela?.dias ?? ""}`,
    eventId: inclusion.eventId,
  });
  const [confirmando, setConfirmando] = useState(false);
  const telaLarga = useTelaLarga();
  // Navegar para outra vaga com o diálogo de envio aberto não o leva junto.
  useEffect(() => { setConfirmando(false); }, [inclusion.id]);

  if (!hon.carregando && hon.empreita) return <NaEmpreita inclusion={inclusion} empreita={hon.empreita} hon={hon} rodape={rodape} onFechar={onFechar} />;
  if (!hon.carregando && !linha) return <SemHonorario />;
  if (hon.carregando || !linha) {
    return (
      <TabsContent value="honorario" className="esc-entra m-0 p-3 sm:p-5">
        <div className="space-y-3" aria-busy="true" aria-label="Carregando o honorário da vaga">
          <div className="val-osso h-24 w-full rounded-xl" />
          <div className="val-osso h-56 w-full rounded-xl" />
        </div>
      </TabsContent>
    );
  }

  const trocado = h?.avisoDaVaga === "colaborador_trocado";
  const semColaborador = !!linha.vaga && !!linha.sugestao?.semColaborador;
  const f = form.f;
  const prontoParaEnviar = f ? faltaParaEnviar({ status: h?.status ?? "rascunho", tipo: "vaga", tipoFreela: f.tipo || null, valorPedido: form.valorEfetivo }) : "Carregando…";
  const motivoSemEnvio = trocado ? "A vaga trocou de colaborador — confirme a troca antes de enviar." : prontoParaEnviar;
  const ocupado = form.salvando || enviar.isPending || editar.isPending;

  const salvarRascunho = async () => {
    const salvo = await form.gravar();
    if (salvo) toast({ variant: "success", title: "Rascunho salvo", description: "Fica com você até enviar para aprovação." });
  };

  const confirmarTroca = async () => {
    if (!h) return;
    try {
      await editar.mutateAsync({ id: h.id, versao: h.versao });
      toast({ title: "Pedido passado para quem está na vaga", description: h.colaboradorAtual ? `Agora o pedido é de ${h.colaboradorAtual}.` : "O pedido volta a ser da vaga, sem nome." });
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível confirmar a troca", description: apiErrorMessage(e, "Tente de novo.") });
    }
  };

  const enviarAgora = async () => {
    // Grava o que mudou antes (ou cria o pedido) e manda a versão que acabou de sair do servidor.
    const atual = form.sujo || !h ? await form.gravar() : h;
    if (!atual) return; // o motivo aparece no próprio diálogo (form.erro)
    try {
      const r = await enviar.mutateAsync([{ id: atual.id, versao: atual.versao }]);
      if (r.enviados?.length) {
        toast({ variant: "success", title: "Enviado ao aprovador", description: `${atual.nome} · ${brl(atual.valorPedido)}. Você recebe o aviso se voltar para negociar.` });
      } else if (r.recusados.length) {
        toast({ variant: "warning", title: "Não foi enviado", description: r.recusados.map((x) => x.motivo).join(" · ") });
      }
      setConfirmando(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível enviar", description: apiErrorMessage(e, "Tente de novo.") });
      setConfirmando(false);
    }
  };

  const valorDoEnvio = form.valorEfetivo || h?.valorPedido || 0;

  const situacao = (
    <Secao titulo="Situação do pedido" icone={<CircleDollarSign aria-hidden="true" />} tom={h?.status === "devolvido" ? "decisao" : "neutro"} testId="hon-vaga-situacao-card">
      <Situacao h={h} linha={linha} />
      {h && (h.avisoDaVaga || h.eventoExcluido) && (
        <AvisoDaLinha h={h} className="mt-3">
          {trocado && h.podeEditar && (
            <button type="button" onClick={() => void confirmarTroca()} disabled={ocupado} className={LINK} data-testid="hon-vaga-confirmar-troca">
              Passar o pedido para {h.colaboradorAtual ?? "a vaga sem nome"}
            </button>
          )}
        </AvisoDaLinha>
      )}
    </Secao>
  );

  /*
   * O rodapé do honorário — no lugar do rodapé da vaga, no mesmo desenho:
   * faixa do motivo em cima, ações embaixo; no celular o Enviar ocupa a linha.
   */
  const barra = (
    <div data-testid="hon-vaga-rodape">
      {editavel && motivoSemEnvio && !ocupado && (
        <p role="status" className="flex items-start gap-2 border-b border-border bg-surface-muted px-4 py-2 text-xs leading-snug text-slate-600 sm:px-6" data-testid="hon-vaga-falta">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">{motivoSemEnvio}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6">
        {editavel && (
          <p className={cn("mr-auto min-w-0 text-2xs", form.sujo ? "font-medium text-warning" : "text-muted-foreground")} aria-live="polite" data-testid="hon-vaga-salvo">
            {form.sujo ? "Alterações não salvas" : h ? `Rascunho salvo${h.updatedAt ? ` ${haQuanto(h.updatedAt)}` : ""}` : "Nada salvo ainda"}
          </p>
        )}
        <Button type="button" variant={editavel ? "ghost" : "outline"} onClick={onFechar}
          className={editavel
            ? "hidden h-9 rounded-lg px-3.5 text-sm font-medium text-slate-600 hover:bg-muted hover:text-foreground sm:inline-flex"
            : "h-9 rounded-lg border-border bg-card px-4 text-sm font-medium text-slate-700 hover:bg-muted"}>
          Fechar
        </Button>
        {editavel && (
          <>
            <Button type="button" variant="outline" onClick={() => void salvarRascunho()} disabled={ocupado || (!form.sujo && !!h)} data-testid="hon-vaga-salvar"
              className="h-9 gap-1.5 rounded-lg border-primary/30 bg-card px-3.5 text-sm font-semibold text-primary hover:bg-brand-soft hover:text-primary">
              {form.salvando && !confirmando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Salvar rascunho
            </Button>
            <span className="inline-flex basis-full sm:basis-auto">
              <Button type="button" onClick={() => { form.setErro(null); setConfirmando(true); }} disabled={ocupado || !!motivoSemEnvio}
                className="h-10 w-full gap-1.5 rounded-lg px-5 text-sm font-semibold shadow-1 sm:h-9 sm:w-auto" data-testid="hon-vaga-enviar">
                <Send className="h-4 w-4" aria-hidden="true" /> {h?.status === "devolvido" ? "Reenviar para aprovação" : "Enviar para aprovação"}
              </Button>
            </span>
          </>
        )}
      </div>
    </div>
  );

  // Só enquanto o pedido próprio é de quem pede (sem pedido, rascunho, devolvido): enviado, só o aprovador devolvendo.
  const podeIrParaEmpreita = !!linha.vaga && (!h || h.podeEditar);

  return (
    <TabsContent value="honorario" className="esc-entra m-0 p-3 sm:p-5" data-testid="hon-vaga">
      {rodape ? createPortal(barra, rodape) : null}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* No celular a situação vem primeiro: é a resposta para "em que pé está?". */}
        <div className="min-w-0 lg:order-2 flex flex-col gap-4">
          {situacao}
          {h && telaLarga && (
            <Secao titulo="Histórico" icone={<History aria-hidden="true" />}>
              <Historico id={h.id} />
            </Secao>
          )}
        </div>

        <div className="min-w-0 lg:order-1 flex flex-col gap-4">
          {editavel && f ? (
            <Secao
              titulo={h?.status === "devolvido" ? "Renegociar o valor" : "Pedido de honorário"}
              icone={<CircleDollarSign aria-hidden="true" />}
              acessorio={<span className="text-2xs text-muted-foreground">não muda a escala</span>}
              corpo="p-0"
              testId="hon-vaga-form"
            >
              {semColaborador && (
                <p className="m-0 flex items-center gap-1.5 border-b border-border px-4 py-2 text-2xs text-muted-foreground" data-testid="hon-vaga-sem-colaborador">
                  <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Vaga ainda sem colaborador — o pedido segue assim mesmo. Quando alguém for escalado, o nome entra sozinho.
                </p>
              )}
              <form className="space-y-5 p-4" noValidate onSubmit={(e) => { e.preventDefault(); void salvarRascunho(); }}>
                <CamposDoPedido form={form} prefixo="hon-vaga" />
                <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
              </form>
            </Secao>
          ) : h ? (
            <Secao titulo="O que foi pedido" icone={<CheckCircle2 aria-hidden="true" />} testId="hon-vaga-pedido">
              <PedidoSoLeitura h={h} />
            </Secao>
          ) : null}

          {podeIrParaEmpreita && <ColocarEmEmpreita inclusion={inclusion} hon={hon} h={h} />}

          {h && !telaLarga && (
            <Secao titulo="Histórico" icone={<History aria-hidden="true" />}>
              <Historico id={h.id} />
            </Secao>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={(o) => { if (!ocupado) setConfirmando(o); }}
        title="Enviar para aprovação?"
        description="O aprovador da escala recebe o aviso na tela Aprovação de honorários. Depois de enviado, o valor só muda se ele devolver para negociar."
        icon={Send}
        className="!max-w-[520px]"
        cancelLabel="Voltar"
        confirmLabel={ocupado ? "Enviando…" : `Enviar · ${brl(valorDoEnvio)}`}
        pending={ocupado}
        onConfirm={() => { void enviarAgora(); }}
        testId="hon-vaga-enviar-dialogo"
      >
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs">
          {[["Valor", brl(valorDoEnvio)], ["Origem", f ? rotuloDoValor({ tipo: "vaga", tipoFreela: f.tipo || null, observacao: null }) : "—"]].map(([r, v]) => (
            <div key={r} className="bg-card px-3 py-2"><dt className="text-2xs text-muted-foreground">{r}</dt><dd className="font-semibold tabular-nums text-foreground">{v}</dd></div>
          ))}
        </dl>
        <p className="text-2xs text-muted-foreground">{diariasTexto(form.dias || null)} · {form.porDia != null ? `${brl(form.porDia)}/diária` : "—"}</p>
        {form.erro && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{form.erro}</p>}
      </ConfirmDialog>
      <ConfirmarDescarteDasVagas form={form} onConfirmar={() => { void form.gravar({ descartarRascunhos: true }); }} />
    </TabsContent>
  );
}
