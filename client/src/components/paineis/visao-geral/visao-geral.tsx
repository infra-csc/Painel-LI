/**
 * Visão geral dos Painéis (30/10) — "o que precisa de ação agora".
 *
 * Pedido do dono: passagens e hotéis fora do prazo por evento, escala
 * atrasada, aprovação atrasada, pedidos de ajuste e as últimas inclusões —
 * "pegar atualizações/inclusões o mais rápido possível para tomar ações".
 *
 * Régua ÚNICA: a do Quadro de prazos das Análises da Escalação (a etapa em
 * que a vaga está parada + prazo D-N da data do evento — comum/paineis-dados.ts).
 * Só eventos futuros. Cada linha leva à tela de trabalho já no evento.
 */
import { useMemo } from "react";
import { BedDouble, ClipboardCheck, Plane, ShieldOff, Users } from "lucide-react";
import type { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useDiasDosPrazos } from "@/components/scaling/scaling-analytics-quadro";
import { recortarPorEtapas, totaisDoBloco, plural, type EventoComAtraso } from "../comum/paineis-dados";
import { useAgora, useBaseDosPaineis } from "../comum/use-base-dos-paineis";
import { useAtividade } from "../comum/use-atividade";
import { lerUltimaVisita } from "../comum/ultima-visita";
import { AtualizadoHa, EsqueletoDoCartao, LinkDoRodape } from "../comum/ui";
import { BlocoDeAtrasos } from "./bloco-de-atrasos";
import { BlocoDePedidos } from "./bloco-de-pedidos";
import { BlocoDeNovidades } from "./bloco-de-novidades";

const enc = encodeURIComponent;

/** Para onde cada bloco leva o evento. Sem permissão para a tela da etapa, a Escalação do evento. */
export function destinosDosBlocos(user: User | null) {
  const escalacaoDoEvento = (e: EventoComAtraso) => ({ href: `/scaling?eventId=${enc(e.eventId)}`, tela: "Escalação" });
  return {
    passagem: (e: EventoComAtraso) => ({ href: `/tickets?event=${enc(e.eventId)}&status=pending`, tela: "Passagens" }),
    // Hospedagem abre já filtrada no evento (?event=, 30/10).
    hotel: (e: EventoComAtraso) => ({ href: `/accommodations?event=${enc(e.eventId)}`, tela: "Hospedagem" }),
    escala: (e: EventoComAtraso) => {
      const soSemNome = e.etapas.every((a) => a.etapa === "escalacao");
      return { href: `/scaling?eventId=${enc(e.eventId)}${soSemNome ? "&fila=escalar" : ""}`, tela: "Escalação" };
    },
    aprovacao: (e: EventoComAtraso) => {
      const validar = e.etapas.some((a) => a.etapa === "validacao");
      if (validar && hasPermission(user, "canAccessScalingValidation")) return { href: `/scaling-validation?eventId=${enc(e.eventId)}`, tela: "Validação" };
      if (hasPermission(user, "canAccessScalingApproval")) return { href: `/scaling-approval?eventId=${enc(e.eventId)}`, tela: "Aprovação" };
      return escalacaoDoEvento(e);
    },
  };
}

function Numero({ href, rotulo, valor, sub, extra, tom, testId }: { href: string; rotulo: string; valor: number; sub: string; extra?: string; tom: "danger" | "warning" | "success" | "primary"; testId: string }) {
  const cor = { danger: "text-danger", warning: "text-warning", success: "text-success", primary: "text-primary" }[tom];
  return (
    <a href={href} className="block min-w-0 bg-card px-4 py-3 no-underline hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40" data-testid={testId}>
      <span className="block truncate text-xs font-medium text-slate-600">{rotulo}</span>
      <span className={`mt-1 block text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em] ${cor}`}>{valor}</span>
      <span className="mt-1 block truncate text-xs text-muted-foreground" title={sub}>{sub}</span>
      {extra && <span className="mt-0.5 block truncate text-2xs font-medium text-warning" title={extra}>{extra}</span>}
    </a>
  );
}

export default function VisaoGeral() {
  const { user } = useAuth();
  const base = useBaseDosPaineis();
  const dias = useDiasDosPrazos();
  const agora = useAgora();
  const novidades = useAtividade({ periodo: "24h", eventId: null, tipo: null, comPassagem: false, comHotel: false }, { limite: 6 });
  // Só lê (quem grava é a Atividade recente, ao sair dela).
  const ultimaVisita = useMemo(() => lerUltimaVisita(user?.id), [user?.id]);

  const blocos = useMemo(() => ({
    passagem: recortarPorEtapas(base.atrasos, ["passagem"]),
    hotel: recortarPorEtapas(base.atrasos, ["hotel"]),
    escala: recortarPorEtapas(base.atrasos, ["escalacao", "escalado"]),
    aprovacao: recortarPorEtapas(base.atrasos, ["validacao", "aprovacao"]),
  }), [base.atrasos]);
  const destinos = useMemo(() => destinosDosBlocos(user ?? null), [user]);

  const recarregar = () => { base.recarregar(); void novidades.refetch(); };
  const cabecalho = (
    <PageHeader
      variant="bar"
      title="Visão geral"
      subtitle={base.carregando ? "Carregando…" : `O que precisa de ação agora · ${plural(base.eventos.length, "evento futuro", "eventos futuros")}`}
      className="mx-0 mt-0"
      actions={<AtualizadoHa em={base.atualizadoEm} recarregando={base.recarregando || novidades.isFetching} onAtualizar={recarregar} />}
    />
  );

  if (base.semPermissao) {
    return (
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {cabecalho}
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <EmptyState icon={ShieldOff} title="Sem acesso às vagas" description="Seu perfil não vê a lista de vagas que alimenta estes painéis. Fale com o administrador." />
        </div>
      </div>
    );
  }

  const resumoDe = (lista: EventoComAtraso[]) => {
    const t = totaisDoBloco(lista);
    const valor = t.vagasAtrasadas || t.vagasVencendo;
    const tom = t.vagasAtrasadas ? "danger" as const : t.vagasVencendo ? "warning" as const : "success" as const;
    const sub = t.vagasAtrasadas
      ? `fora do prazo · ${plural(t.eventosAtrasados, "evento", "eventos")}`
      : t.vagasVencendo ? "vencem em até 3 dias" : "tudo no prazo";
    const extra = t.vagasAtrasadas && t.vagasVencendo ? `+${t.vagasVencendo} vencendo em 3 dias` : undefined;
    return { valor, tom, sub, extra };
  };
  const nP = resumoDe(blocos.passagem);
  const nH = resumoDe(blocos.hotel);
  const nE = resumoDe(blocos.escala);
  const nA = resumoDe(blocos.aprovacao);

  return (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]" data-testid="paineis-visao-geral">
      {cabecalho}
      <div className="px-[var(--page-gutter)] pt-5 pb-6">
        {base.erro ? (
          <ErrorState
            title="Não foi possível carregar as vagas"
            description={base.erro.message || "Tente de novo em instantes."}
            onRetry={base.recarregar}
          />
        ) : base.carregando ? (
          <div className="space-y-4" aria-busy="true" aria-label="Carregando os painéis">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-muted md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2 bg-card px-4 py-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-6 w-10" /><Skeleton className="h-3 w-28" /></div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <EsqueletoDoCartao key={i} />)}</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Os números do topo levam ao bloco de cada um. */}
            <nav aria-label="Resumo" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-muted md:grid-cols-3 xl:grid-cols-6">
              <Numero href="#bloco-passagens" rotulo="Passagens" valor={nP.valor} sub={nP.sub} extra={nP.extra} tom={nP.tom} testId="numero-passagens" />
              <Numero href="#bloco-hoteis" rotulo="Hotéis" valor={nH.valor} sub={nH.sub} extra={nH.extra} tom={nH.tom} testId="numero-hoteis" />
              <Numero href="#bloco-escala" rotulo="Escala" valor={nE.valor} sub={nE.sub} extra={nE.extra} tom={nE.tom} testId="numero-escala" />
              <Numero href="#bloco-aprovacao" rotulo="Validação e aprovação" valor={nA.valor} sub={nA.sub} extra={nA.extra} tom={nA.tom} testId="numero-aprovacao" />
              <Numero
                href="#bloco-pedidos"
                rotulo="Pedidos de ajuste"
                valor={base.pedidos.total}
                sub={base.pedidos.parados ? `${base.pedidos.parados} há 3 dias ou mais` : base.pedidos.total ? "esperando o aprovador" : "nenhum pendente"}
                tom={base.pedidos.parados ? "danger" : base.pedidos.total ? "warning" : "success"}
                testId="numero-pedidos"
              />
              <Numero
                href="#bloco-novidades"
                rotulo="Novidades em 24 h"
                valor={novidades.total}
                sub="inclusões e mudanças"
                tom="primary"
                testId="numero-novidades"
              />
            </nav>

            {base.eventos.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground" data-testid="sem-eventos-futuros">
                Nenhum evento futuro com vagas. Os blocos voltam a contar quando a Inclusão de Equipe abrir as vagas.
              </p>
            )}

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <BlocoDeAtrasos
                id="bloco-passagens"
                titulo="Passagens fora do prazo"
                icone={Plane}
                etapas={["passagem"]}
                lista={blocos.passagem}
                dias={dias}
                destino={destinos.passagem}
                vazio="Nenhuma passagem fora do prazo nos eventos futuros."
                rodape={<LinkDoRodape href="/paineis/passagens">Painel de passagens</LinkDoRodape>}
                testId="bloco-passagens"
              />
              <BlocoDeAtrasos
                id="bloco-hoteis"
                titulo="Hotéis fora do prazo"
                icone={BedDouble}
                etapas={["hotel"]}
                lista={blocos.hotel}
                dias={dias}
                destino={destinos.hotel}
                vazio="Nenhum hotel fora do prazo nos eventos futuros."
                rodape={<LinkDoRodape href="/paineis/hospedagem">Painel de hospedagem</LinkDoRodape>}
                testId="bloco-hoteis"
              />
              <BlocoDeAtrasos
                id="bloco-escala"
                titulo="Escala atrasada"
                icone={Users}
                etapas={["escalacao", "escalado"]}
                lista={blocos.escala}
                dias={dias}
                destino={destinos.escala}
                vazio="Nenhuma escala atrasada nos eventos futuros."
                rodape={<LinkDoRodape href="/paineis/escala">Painel da escala</LinkDoRodape>}
                testId="bloco-escala"
              />
              <BlocoDeAtrasos
                id="bloco-aprovacao"
                titulo="Validação e aprovação atrasadas"
                icone={ClipboardCheck}
                etapas={["validacao", "aprovacao"]}
                lista={blocos.aprovacao}
                dias={dias}
                destino={destinos.aprovacao}
                vazio="Nada esperando validação ou aprovação fora do prazo."
                testId="bloco-aprovacao"
              />
              <BlocoDePedidos pedidos={base.pedidos} disponiveis={base.pedidosDisponiveis} trocasPendentes={base.trocasPendentes} user={user ?? null} />
              <BlocoDeNovidades
                itens={novidades.itens.slice(0, 6)}
                resumo={novidades.resumo}
                total={novidades.total}
                carregando={novidades.isLoading}
                erro={novidades.isError}
                onTentarDeNovo={() => void novidades.refetch()}
                user={user ?? null}
                ultimaVisita={ultimaVisita}
                atrasadas={base.atrasadas}
                agora={agora}
              />
            </div>
            <p className="text-2xs text-muted-foreground">
              Mesma régua do Quadro de prazos das Análises da Escalação: cada vaga conta na etapa em que está parada; vermelho = prazo passou, âmbar = vence em até 3 dias. Passagem e hotel contam só depois da escala confirmada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
