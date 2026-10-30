/**
 * Honorários na ESCALAÇÃO (dono, 20/10) — o que mora na tela da lista:
 *
 *  - `BotaoHonorariosDoEvento`: acesso discreto na barra de contexto, só com
 *    UM evento escolhido e só para quem pede (cenotécnica / admin). Abre o
 *    painel do evento;
 *  - `HonorariosDoEventoSheet`: o painel de sempre (`PedidoPainel`) numa
 *    gaveta — todas as linhas do evento, "Adicionar empreita" (equipe sem
 *    vaga) e "Enviar N para aprovação" em lote;
 *  - `useHonorariosNaEscalacao`: o link do sino "devolvido para negociar"
 *    (`/scaling?honorarios=devolvidos`). Com UM pedido devolvido de vaga, abre
 *    o modal dessa vaga já na aba Honorário; senão, a gaveta no evento (ou na
 *    lista de eventos, quando há devolvidos em mais de um).
 *
 * A barra de seleção da Escalação NÃO ganhou "Enviar honorários (N)": ela só
 * aceita vagas ainda não confirmadas, e honorário só existe para vaga já
 * escalada — o N seria sempre zero. O lote fica no painel do evento.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { DetailsTab } from "@/components/scaling/inclusion-details/details-shared";
import { buscarEventosDoPedido, buscarPedidoDoEvento, chaveDoPedido, chaveDosEventos, useAcessoHonorarios, useEventosDoPedido } from "./api";
import { PedidoPainel } from "./pedido-painel";

/**
 * Botão "Honorários do evento" — some só para quem não pede. Sem UM evento
 * escolhido (30/10, dono) vira "Honorários" e abre a lista: Eventos e
 * Aprovados (todos os eventos).
 */
export function BotaoHonorariosDoEvento({ eventId, onAbrir }: { eventId: string | null; onAbrir: () => void }) {
  const acesso = useAcessoHonorarios();
  const podePedir = !!acesso.data?.podePedir;
  const eventos = useEventosDoPedido(podePedir && !!eventId);
  if (!podePedir) return null;
  const rotulo = eventId ? "Honorários do evento" : "Honorários";
  const e = eventos.data?.find((x) => x.id === eventId);
  const pendentes = e ? e.semPedido + e.rascunhos + e.devolvidos : 0;
  const detalhe = e
    ? [e.semPedido && `${e.semPedido} ${e.semPedido === 1 ? "falta" : "faltam"} lançar`, e.rascunhos && `${e.rascunhos} em rascunho`, e.devolvidos && `${e.devolvidos} devolvido${e.devolvidos === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
    : "";
  return (
    <button
      type="button"
      onClick={onAbrir}
      data-testid="button-honorarios-do-evento"
      title={detalhe ? `Honorários da cenotécnica: ${detalhe}` : eventId ? "Valores negociados da cenotécnica deste evento" : "Honorários da cenotécnica: escolha o evento ou veja os aprovados de todos"}
      aria-label={`${rotulo}${pendentes ? ` (${pendentes} pendentes)` : ""}`}
      className="esc-alvo relative inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm font-medium text-slate-700 shadow-1 transition-colors hover:border-success/40 hover:bg-success-soft hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-3"
    >
      <HandCoins className="h-4 w-4 text-success-strong" aria-hidden="true" />
      <span className="hidden sm:inline">{rotulo}</span>
      {pendentes > 0 && (
        <span aria-hidden="true" className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warning-soft px-1.5 text-2xs font-semibold tabular-nums text-warning">{pendentes}</span>
      )}
    </button>
  );
}

/** A gaveta com o painel do evento. Trocar de evento aqui dentro não mexe no filtro da Escalação. */
export function HonorariosDoEventoSheet({ aberto, onOpenChange, eventId }: { aberto: boolean; onOpenChange: (o: boolean) => void; eventId: string | null }) {
  const [evento, setEvento] = useState<string | null>(eventId);
  useEffect(() => { if (aberto) setEvento(eventId); }, [aberto, eventId]);
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]" data-testid="hon-sheet">
        <SheetHeader className="space-y-0.5 border-b border-border px-4 pb-3.5 pt-4 text-left sm:px-6">
          <SheetTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <HandCoins className="h-4 w-4 text-success-strong" aria-hidden="true" /> {evento ? "Honorários do evento" : "Honorários da cenotécnica"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Valor negociado de cada vaga da cenotécnica e das empreitas. O aprovador decide em Aprovação de honorários — nada aqui muda a escala.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4 sm:px-6 sm:py-5">
          {aberto && <PedidoPainel eventId={evento} onEscolherEvento={(id) => setEvento(id || null)} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Estado da gaveta + o link do sino. A página passa as vagas carregadas e o
 * `openInclusion` do modal; a vaga do aviso abre quando chega na lista.
 */
export function useHonorariosNaEscalacao({ teamInclusions, openInclusion, verVagasDoEvento }: {
  teamInclusions: TeamInclusion[] | undefined;
  openInclusion: (i: TeamInclusion, tab: DetailsTab) => void;
  verVagasDoEvento: (eventId: string) => void;
}) {
  const qc = useQueryClient();
  const acesso = useAcessoHonorarios();
  const podePedir = !!acesso.data?.podePedir;
  const [painel, setPainel] = useState<{ aberto: boolean; eventId: string | null }>({ aberto: false, eventId: null });
  const [vagaDoAviso, setVagaDoAviso] = useState<string | null>(null);
  const abrirPainel = useCallback((eventId: string | null) => setPainel({ aberto: true, eventId }), []);

  const busca = useSearch();
  useEffect(() => {
    const alvo = new URLSearchParams(busca).get("honorarios");
    if (!alvo || !podePedir) return;
    let cancelado = false;
    void (async () => {
      try {
        const eventos = await qc.fetchQuery({ queryKey: [...chaveDosEventos()], queryFn: ({ signal }) => buscarEventosDoPedido(signal), staleTime: 0 });
        if (cancelado) return;
        const comDevolvido = alvo === "devolvidos" ? eventos.filter((e) => e.devolvidos > 0) : [];
        if (comDevolvido.length !== 1) { abrirPainel(null); return; }
        const ev = comDevolvido[0];
        verVagasDoEvento(ev.id);
        const pedido = await qc.fetchQuery({ queryKey: [...chaveDoPedido(ev.id)], queryFn: ({ signal }) => buscarPedidoDoEvento(ev.id, signal), staleTime: 0 });
        if (cancelado) return;
        const devolvidos = [...pedido.linhas.map((l) => l.honorario), ...pedido.empreitas].filter((h) => h?.status === "devolvido");
        const unico = devolvidos.length === 1 ? devolvidos[0] : null;
        if (unico?.tipo === "vaga" && unico.teamInclusionId) setVagaDoAviso(unico.teamInclusionId);
        else abrirPainel(ev.id);
      } catch {
        if (!cancelado) abrirPainel(null);
      }
    })();
    return () => { cancelado = true; };
  }, [busca, podePedir]); // eslint-disable-line react-hooks/exhaustive-deps

  // A vaga do aviso abre no modal assim que a lista do evento a traz.
  useEffect(() => {
    if (!vagaDoAviso) return;
    const vaga = teamInclusions?.find((i) => i.id === vagaDoAviso);
    if (!vaga) return;
    setVagaDoAviso(null);
    openInclusion(vaga, "honorario");
  }, [vagaDoAviso, teamInclusions, openInclusion]);

  return {
    podePedir,
    painel,
    abrirPainel,
    onPainelOpenChange: (o: boolean) => setPainel((p) => ({ ...p, aberto: o })),
  };
}
