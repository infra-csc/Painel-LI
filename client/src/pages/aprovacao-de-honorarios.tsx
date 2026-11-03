/**
 * Aprovação de honorários — a tela do APROVADOR (dono, 20/10: "eles têm que
 * pedir aqui na escalação e chegar para o aprovador em outra tela").
 *
 * Era a aba "Honorários" da Aprovação de escala; agora é tela própria, perto
 * dela no menu, só para quem decide honorário (aprovador da escala das
 * funções de cenotécnica, aprovador padrão e admin — GET /acesso).
 *
 * Barra de 56px com o seletor de evento (padrão das telas com evento), faixa
 * de totais e duas abas: Aguardando (aprovar, aprovar com ajuste, devolver —
 * em lote) e Decididos (o que já passou por aqui e a situação da verba). As
 * decisões são as de sempre (aprovacao-painel.tsx); nada aqui mexe na escala.
 */
import { useMemo } from "react";
import { CalendarX, CheckCircle2, CloudOff, Hourglass, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Event } from "@shared/schema";
import { ehAprovado } from "@shared/honorarios-ceno";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { EventSearchSelect } from "@/components/event-select";
import { campo, useUrlState } from "@/lib/use-url-state";
import { apiErrorMessage, cn } from "@/lib/utils";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { MOLDURA } from "@/components/scaling-approval/tokens";
import { useAcessoHonorarios, useFilaDeAprovacao, type Honorario } from "@/components/honorarios-ceno/api";
import { AprovacaoPainel } from "@/components/honorarios-ceno/aprovacao-painel";
import { FaixaDeTotais, brlCurto, dataBr } from "@/components/honorarios-ceno/pecas";

type Aba = "aguardando" | "decididos";

const ABAS: { id: Aba; rotulo: string; icone: LucideIcon }[] = [
  { id: "aguardando", rotulo: "Aguardando", icone: Hourglass },
  { id: "decididos", rotulo: "Decididos", icone: CheckCircle2 },
];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const soma = (linhas: Honorario[], v: (h: Honorario) => number) => linhas.reduce((s, h) => s + v(h), 0);

export default function AprovacaoDeHonorariosPage() {
  usePageTitle("Aprovação de honorários");
  const acesso = useAcessoHonorarios();
  const podeAprovar = !!acesso.data?.podeAprovar;
  // 30/10 (dono): quem lança a cenotécnica acompanha a tela — vê os pedidos e
  // os valores das funções dele, sem aprovar nem devolver.
  const podeVer = podeAprovar || !!acesso.data?.podePedir;
  const [url, setUrl] = useUrlState({ aba: campo.opcao<Aba>("aguardando"), evento: campo.texto("") });
  const aba: Aba = ABAS.some((a) => a.id === url.aba) ? url.aba : "aguardando";

  // Sem recorte: a lista de eventos e os totais saem das duas filas inteiras
  // (a de pendentes é a mesma chave que o painel usa sem evento).
  const pend = useFilaDeAprovacao("pendentes", null, podeVer);
  const dec = useFilaDeAprovacao("decididos", null, podeVer);
  const todos = useMemo(() => [...(pend.data ?? []), ...(dec.data ?? [])], [pend.data, dec.data]);
  const eventos = useMemo(() => {
    const m = new Map<string, Event>();
    for (const h of todos) if (!m.has(h.eventId)) m.set(h.eventId, { id: h.eventId, name: h.eventName ?? "Evento", startDate: h.eventStartDate ?? "", endDate: h.eventEndDate ?? "" } as unknown as Event);
    return Array.from(m.values()).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  }, [todos]);
  const eventoEscolhido = eventos.find((e) => e.id === url.evento);
  // 28/10 (dono): `?evento=` de um evento que saiu das duas filas (link antigo,
  // sininho) escondia tudo sem aviso — agora a tela diz e oferece "Ver todos".
  const eventoForaDaFila = !!url.evento && !eventoEscolhido && !pend.isLoading && !dec.isLoading && !pend.isError && !dec.isError;
  const doEvento = (l: Honorario[] | undefined) => (l ?? []).filter((h) => !url.evento || h.eventId === url.evento);
  const pendentes = doEvento(pend.data);
  const decididos = doEvento(dec.data);
  const meus = podeAprovar ? pendentes.filter((h) => h.podeDecidir) : pendentes;
  const aprovados = decididos.filter((h) => ehAprovado(h.status));
  const devolvidos = decididos.filter((h) => h.status === "devolvido");
  const falta = soma(aprovados, (h) => h.falta);
  // Fila que falhou não soma (03/11): a faixa dizia "Aprovado R$ 0" sem nenhum aviso.
  const falhouPendentes = pend.isError && !pend.data;
  const falhouDecididos = dec.isError && !dec.data;

  const barra = (
    <PageHeader
      variant="bar"
      title="Aprovação de honorários"
      className="gap-x-3 max-sm:static"
      subtitle={eventos.length === 0 ? "valores negociados pela cenotécnica, pedidos na Escalação" : undefined}
      context={podeVer && eventos.length > 0 ? (
        <>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <EventSearchSelect variante="barra" value={url.evento} onValueChange={(id) => setUrl({ evento: id })} events={eventos} rotuloVazio="Todos os eventos"
            detalhe={eventoEscolhido ? `${dataBr(String(eventoEscolhido.startDate))} · ${plural(pendentes.length, "aguardando", "aguardando")}` : `${plural(eventos.length, "evento", "eventos")} com honorários`} />
        </>
      ) : undefined}
    />
  );

  let conteudo: React.ReactNode;
  if (acesso.isLoading || (podeVer && pend.isLoading)) {
    conteudo = (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando honorários">
        <div className="val-osso h-[78px] w-full rounded-xl" />
        <div className={cn(MOLDURA, "space-y-2 p-4")}>{[0, 1, 2, 3].map((i) => <div key={i} className="val-osso h-11 w-full" />)}</div>
      </div>
    );
  } else if (acesso.isError && !acesso.data) {
    // A falha NÃO é "sem acesso" (03/11): o cadeado mandava o próprio administrador falar com o administrador.
    conteudo = (
      <EstadoDaValidacao tom="erro" icone={<CloudOff aria-hidden="true" />} titulo="Não foi possível conferir o seu acesso"
        texto={apiErrorMessage(acesso.error, "Verifique sua conexão e tente novamente.")}
        acao={<BotaoTentarDeNovo onClick={() => acesso.refetch()} tentando={acesso.isFetching} />}
        testId="hon-apr-acesso-erro" />
    );
  } else if (!podeVer) {
    conteudo = (
      <EstadoDaValidacao icone={<Lock aria-hidden="true" />} titulo="Tela do aprovador de honorários"
        texto="Só o aprovador da escala das funções de cenotécnica, o aprovador padrão e o administrador decidem os honorários. Se deveria ser você, fale com o administrador."
        testId="hon-apr-sem-acesso" />
    );
  } else if (eventoForaDaFila) {
    conteudo = (
      <EstadoDaValidacao icone={<CalendarX aria-hidden="true" />} titulo="Este evento não tem pedidos na fila"
        texto="Os pedidos dele já saíram da aprovação (ou o link é de outro evento). Veja a fila de todos os eventos."
        acao={(
          <button type="button" onClick={() => setUrl({ evento: "" })} data-testid="hon-apr-ver-todos"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Ver todos
          </button>
        )}
        testId="hon-apr-evento-fora" />
    );
  } else {
    conteudo = (
      <>
        <FaixaDeTotais testId="hon-apr-totais" itens={[
          { rotulo: podeAprovar ? "Aguardando a sua decisão" : "Aguardando aprovação", valor: falhouPendentes ? "—" : brlCurto(soma(meus, (h) => h.valorPedido)), detalhe: falhouPendentes ? "não carregou" : plural(meus.length, "pedido", "pedidos"), destaque: meus.length ? "warning" : undefined },
          { rotulo: "Aprovado", valor: falhouDecididos ? "—" : brlCurto(soma(aprovados, (h) => h.valorAprovado ?? 0)), detalhe: falhouDecididos ? "não carregou" : plural(aprovados.length, "pedido", "pedidos"), destaque: aprovados.length ? "success" : undefined },
          { rotulo: "Devolvidos para negociar", valor: falhouDecididos ? "—" : String(devolvidos.length), detalhe: falhouDecididos ? "não carregou" : devolvidos.length ? "com a cenotécnica, na Escalação" : "—", destaque: devolvidos.length ? "primary" : undefined },
          { rotulo: "Liberado pelo Financeiro", valor: falhouDecididos ? "—" : brlCurto(soma(aprovados, (h) => h.liberado)), detalhe: falhouDecididos ? "não carregou" : falta > 0 ? `faltam ${brlCurto(falta)}` : aprovados.length ? "tudo liberado" : "—" },
        ]} />

        {(falhouPendentes || falhouDecididos) && (
          <div role="alert" data-testid="hon-apr-totais-erro" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">
            <span>Não foi possível carregar {falhouPendentes && falhouDecididos ? "as filas" : falhouPendentes ? "os pedidos aguardando" : "os pedidos decididos"}. Os totais com "—" não são zero.</span>
            <button type="button" className="val-alvo font-semibold underline underline-offset-2" onClick={() => { if (falhouPendentes) void pend.refetch(); if (falhouDecididos) void dec.refetch(); }}>Carregar de novo</button>
          </div>
        )}

        <div className="border-b border-border">
          <div role="tablist" aria-label="Honorários" className="flex min-w-max items-end gap-1">
            {ABAS.map((a, i) => {
              const on = aba === a.id;
              const Icone = a.icone;
              const n = a.id === "aguardando" ? meus.length : 0;
              return (
                <button key={a.id} id={`hon-apr-tab-${a.id}`} type="button" role="tab" aria-selected={on} aria-controls={`hon-apr-painel-${a.id}`} tabIndex={on ? 0 : -1}
                  onClick={() => setUrl({ aba: a.id })}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const prox = ABAS[(i + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length];
                    setUrl({ aba: prox.id });
                    document.getElementById(`hon-apr-tab-${prox.id}`)?.focus();
                  }}
                  className={cn("group relative -mb-px inline-flex h-11 items-center gap-2 rounded-t-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    on ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                  <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {a.rotulo}
                  {n ? <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warning-soft px-1.5 text-2xs font-semibold tabular-nums text-warning">{n}</span> : null}
                  <span aria-hidden="true" className={cn("absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none", on ? "scale-x-100" : "scale-x-0")} />
                </button>
              );
            })}
          </div>
        </div>

        <div id={`hon-apr-painel-${aba}`} role="tabpanel" aria-labelledby={`hon-apr-tab-${aba}`} className="val-entra">
          <AprovacaoPainel eventId={url.evento || null} situacao={aba === "aguardando" ? "pendentes" : "decididos"} />
        </div>

        <p className="text-2xs text-muted-foreground">
          Aprovado vai para o Financeiro liberar a verba (Honorários da cenotécnica). Devolvido volta para quem pediu, no modal da vaga na Escalação.
        </p>
      </>
    );
  }

  return (
    <PageContainer fluid className="pb-24">
      {barra}
      <div className="mx-auto w-full max-w-[1560px] space-y-5">{conteudo}</div>
    </PageContainer>
  );
}
