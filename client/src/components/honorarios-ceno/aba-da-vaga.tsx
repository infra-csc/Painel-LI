/**
 * Honorários na ESCALAÇÃO (dono, 20/10): "eles têm que pedir aqui na
 * escalação e chegar para o aprovador em outra tela".
 *
 * A aba "Honorário" do modal da vaga — ao lado de Passagem e Hospedagem, com
 * o mesmo ponto de pendência. Aparece só quando a vaga é de cenotécnica,
 * recebe honorário (freela local/viagem ou empreita na escala; casa não) e a
 * pessoa pode pedir por aquela função — exatamente as linhas que
 * GET /api/honorarios-ceno/pedido devolve para ela. Vaga de outra função ou
 * usuário sem cadastro: a aba não existe (e nenhuma consulta de valores sai).
 *
 * Por que aba e não bloco do Resumo: o Resumo é a escala (quem vai, a vaga, o
 * pedido de ajuste) e o rodapé do modal salva a VAGA. Honorário é dinheiro, à
 * parte da escala — numa aba própria o rodapé do modal passa a ser o DELE
 * ("Salvar rascunho", "Enviar para aprovação", sempre à vista em 1366×800),
 * sem um "Salvar alterações" da vaga ao lado para confundir; e o ponto na aba
 * avisa o que falta sem empurrar o Resumo para baixo.
 *
 * Tudo aqui usa as rotas de sempre (nenhuma regra nova): o formulário é o
 * mesmo do diálogo de detalhes, o envio é o POST /enviar com um item.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, CircleDollarSign, History, Loader2, Save, Send, Undo2 } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { ehCenotecnica } from "@shared/cenotecnica";
import { faltaParaEnviar, valorPorDiaria } from "@shared/honorarios-ceno";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, cn } from "@/lib/utils";
import { Secao, useTelaLarga } from "@/components/scaling/inclusion-details/details-shared";
import { useAcessoHonorarios, useHistoricoDoHonorario, useMutacoesDoPedido, usePedidoDoEvento, type Honorario, type LinhaDoPedido } from "./api";
import { AvisoDaLinha, EtapaBadge, brl, dataBr, diariasTexto, haQuanto, periodoCurto, posicaoLabel, setorLabel } from "./pecas";
import { CamposDoPedido, useFormularioDoPedido } from "./detalhes-dialog";
import { LinhaDoTempo, ResumoDosValores } from "./historico-sheet";

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
  const h = linha?.honorario ?? null;
  return {
    /**
     * A aba existe para esta vaga e esta pessoa: toda vaga de cenotécnica de
     * quem pede (20/10, dono: "cenotécnica não aparece" — na vaga ABERTA a aba
     * sumia). Sem linha no pedido (vaga sem nome, casa…) a aba explica por quê.
     */
    visivel: podePedir,
    /** Ainda não se sabe (acesso ou pedido carregando). */
    carregando: ceno && (acesso.isLoading || (podePedir && q.isLoading)),
    linha,
    evento: q.data?.evento ?? null,
    /** O ponto na aba: falta lançar, está em rascunho ou voltou para negociar. */
    pendente: !!linha && (h ? h.podeEditar : !linha.foraDaEscala),
  };
}

export type HonorarioDaVaga = ReturnType<typeof useHonorarioDaVaga>;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O que a etapa significa para quem pede, numa frase. */
function Situacao({ h, linha }: { h: Honorario | null; linha: LinhaDoPedido }) {
  if (!h) {
    return (
      <div className="space-y-2" data-testid="hon-vaga-situacao">
        <StatusBadge tone="neutral" dot className="bg-transparent ring-1 ring-inset ring-border">Sem pedido</StatusBadge>
        <p className="text-sm text-slate-700">
          {linha.foraDaEscala ? "A vaga saiu da escala — não há o que pedir." : "Lance o valor que você negociou. Fica como rascunho até você enviar para o aprovador."}
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
          {/* O valor numa frase; a grade (pedido · aprovado · liberado · falta) e a barra ficam no cartão do pedido. */}
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
        <div><dt className="text-2xs text-muted-foreground">Setor · posição</dt><dd className="text-foreground">{setorLabel(h.setor)} · {posicaoLabel(h.posicao)}</dd></div>
        <div><dt className="text-2xs text-muted-foreground">Montagem</dt><dd className="tabular-nums text-foreground">{periodoCurto(h.inicio, h.fim)} · {diariasTexto(h.diarias)}</dd></div>
      </dl>
      {h.observacao && <p className="text-xs leading-relaxed text-slate-700"><span className="font-semibold text-foreground">Observação: </span>{h.observacao}</p>}
    </div>
  );
}

/** A vaga de cenotécnica ainda não entra no pedido: diz o que falta. */
function SemHonorario({ inclusion }: { inclusion: TeamInclusion }) {
  const aberta = !inclusion.collaboratorId && !inclusion.empreitaEmpresa?.trim();
  return (
    <TabsContent value="honorario" className="esc-entra m-0 p-3 sm:p-5">
      <Secao titulo="Pedido de honorário" icone={<CircleDollarSign className="text-muted-foreground" aria-hidden="true" />} testId="hon-vaga-sem-linha" corpo="p-4 space-y-2">
        <p className="m-0 text-sm text-foreground font-medium">
          {aberta ? "Escale alguém para lançar o honorário." : "Esta vaga não recebe honorário."}
        </p>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          {aberta
            ? "O honorário é do freela (local ou viagem) ou da empreita escalada nesta vaga. Escolha o colaborador ou a empreita no Resumo e volte aqui para lançar o valor negociado."
            : "Só freela (local ou viagem) e empreita recebem honorário — colaborador da casa (CLT) não. Se a vaga foi cancelada, também não há o que pedir."}
        </p>
      </Secao>
    </TabsContent>
  );
}

export function AbaHonorarioDaVaga({ inclusion, hon, rodape, onFechar }: {
  inclusion: TeamInclusion;
  hon: HonorarioDaVaga;
  /** O rodapé do modal: enquanto a aba está aberta, ele é o do honorário (portal). */
  rodape: HTMLElement | null;
  onFechar: () => void;
}) {
  const { linha, evento } = hon;
  const { toast } = useToast();
  const { enviar, editar } = useMutacoesDoPedido();
  const h = linha?.honorario ?? null;
  const editavel = !!linha && (h ? h.podeEditar : !linha.foraDaEscala);
  const alvo = linha && editavel ? { modo: "vaga" as const, linha } : null;
  const form = useFormularioDoPedido({
    alvo,
    // Volta ao gravado quando muda a vaga, o pedido ou a versão dele — não a cada refetch.
    chave: `${inclusion.id}|${h?.id ?? "novo"}|${h?.versao ?? 0}|${editavel}`,
    eventId: inclusion.eventId,
    evento: evento ?? { startDate: "", endDate: "" },
  });
  const [confirmando, setConfirmando] = useState(false);
  const telaLarga = useTelaLarga();
  // Navegar para outra vaga com o diálogo de envio aberto não o leva junto.
  useEffect(() => { setConfirmando(false); }, [inclusion.id]);

  if (!hon.carregando && !linha) return <SemHonorario inclusion={inclusion} />;
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
  const f = form.f;
  const prontoParaEnviar = f ? faltaParaEnviar({
    status: h?.status ?? "rascunho",
    valorPedido: f.valor,
    diarias: f.diarias ? Number(f.diarias) : null,
    setor: f.setor || null,
    posicao: f.posicao || null,
  }) : "Carregando…";
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
      toast({ title: "Pedido passado para quem está na vaga", description: h.colaboradorAtual ? `Agora o pedido é de ${h.colaboradorAtual}.` : undefined });
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

  const valorDoEnvio = f?.valor ?? h?.valorPedido ?? 0;
  const diariasDoEnvio = f?.diarias ? Number(f.diarias) : h?.diarias ?? null;
  const porDiaDoEnvio = valorPorDiaria(valorDoEnvio, diariasDoEnvio);

  const situacao = (
    <Secao titulo="Situação do pedido" icone={<CircleDollarSign aria-hidden="true" />} tom={h?.status === "devolvido" ? "decisao" : "neutro"} testId="hon-vaga-situacao-card">
      <Situacao h={h} linha={linha} />
      {h && (h.avisoDaVaga || h.eventoExcluido) && (
        <AvisoDaLinha h={h} className="mt-3">
          {trocado && h.podeEditar && (
            <button type="button" onClick={() => void confirmarTroca()} disabled={ocupado}
              className="val-alvo inline-flex items-center rounded-md px-1 text-2xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              data-testid="hon-vaga-confirmar-troca">
              Passar o pedido para {h.colaboradorAtual ?? "quem está na vaga"}
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
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs">
          {[["Valor", brl(valorDoEnvio)], ["Diárias", diariasDoEnvio ? plural(diariasDoEnvio, "diária", "diárias") : "—"], ["Por diária", porDiaDoEnvio != null ? brl(porDiaDoEnvio) : "—"]].map(([r, v]) => (
            <div key={r} className="bg-card px-3 py-2"><dt className="text-2xs text-muted-foreground">{r}</dt><dd className="font-semibold tabular-nums text-foreground">{v}</dd></div>
          ))}
        </dl>
        {form.erro && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{form.erro}</p>}
      </ConfirmDialog>
    </TabsContent>
  );
}
