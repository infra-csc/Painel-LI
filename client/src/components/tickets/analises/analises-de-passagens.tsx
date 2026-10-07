/**
 * ABA ANÁLISES DE PASSAGENS (07/10) — só admin (dono: "pode começar, só
 * aparecer para admin"; o servidor recusa os outros papéis).
 *
 * Lê em ordem de pergunta: a faixa de números (quanto, quantas, quanto em
 * média, quanto ficou em trocas), o que fica fora das médias, e os painéis
 * que respondem ao dono — "que dia fica mais caro, mais barato" e "qual
 * evento gastamos mais, e menos" lado a lado no topo —, depois antecedência,
 * rotas/companhias, mês e trocas/remarcações. Cada painel abre com a
 * resposta em uma frase; o gráfico vem como prova.
 *
 * Estados: carregando (esqueleto com a geometria real), erro com "Tentar de
 * novo", vazio (com saída: limpar filtros ou ver todo o histórico), poucos
 * dados (aviso de que as médias ainda oscilam) e atualizando (o resultado
 * anterior fica, esmaecido, enquanto o novo chega).
 */
import { useMemo } from "react";
import { AlertCircle, BarChart3, Info, RotateCw } from "lucide-react";
import { hojeISO } from "@shared/hoje-sp";
import type { AnaliseDePassagens } from "@shared/analise-de-passagens";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FiltrosDaAnalise } from "./filtros-da-analise";
import { FILTROS_PADRAO, temRecorte, useAnalisesDePassagens, type FiltrosDaAba } from "./use-analises-de-passagens";
import type { VisaoDaAnalise } from "./url-da-analise";
import { moeda, plural } from "./formato";
import { Numero } from "./partes";
import { DiasDaSemana } from "./dias-da-semana";
import { RankingDeEventos } from "./ranking-de-eventos";
import { Antecedencia } from "./antecedencia";
import { RotasECompanhias } from "./rotas-e-companhias";
import { GastoPorMes, TrocasERemarcacoes } from "./meses-e-trocas";

/** Abaixo disto, as médias ainda mudam muito de um evento para outro. */
export const POUCOS_DADOS = 20;

function Esqueleto() {
  const painel = (linhas: number) => (
    <div className="rounded-xl border border-border bg-card">
      <div className="space-y-1.5 border-b border-border px-4 py-3"><div className="pas-osso h-3.5 w-44" /><div className="pas-osso h-2.5 w-64" /></div>
      <div className="space-y-3 px-4 py-4">
        <div className="pas-osso h-3 w-4/5" />
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex items-center gap-3"><div className="pas-osso h-3 w-16" /><div className="pas-osso h-2 flex-1" /><div className="pas-osso h-3 w-14" /></div>
        ))}
      </div>
    </div>
  );
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4" data-testid="analise-carregando">
      <span className="sr-only">Carregando as análises de passagens…</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 bg-card px-4 py-3.5"><div className="pas-osso h-3 w-20" /><div className="pas-osso h-6 w-28" /><div className="pas-osso h-2.5 w-24" /></div>
        ))}
      </div>
      <div aria-hidden="true" className="grid gap-4 xl:grid-cols-2">{painel(7)}{painel(6)}</div>
    </div>
  );
}

function Estado({ icone, titulo, texto, acao, tom, testid }: {
  icone: React.ReactNode; titulo: string; texto: React.ReactNode; acao?: React.ReactNode; tom?: "erro"; testid: string;
}) {
  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={cn("pas-entra flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center", tom === "erro" ? "border-danger/25" : "border-border")}
      data-testid={testid}
    >
      <span className={cn("mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full", tom === "erro" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground")} aria-hidden="true">
        {icone}
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <div className="mt-5 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  );
}

/** "12 sem valor · 4 sem data da compra…" — o que não entra nas médias, nunca escondido. */
function ForaDasMedias({ t }: { t: AnaliseDePassagens["totais"] }) {
  const partes = [
    t.semValor > 0 && `${plural(t.semValor, "passagem", "passagens")} sem valor (fora de todas as médias)`,
    t.semDataIda > 0 && `${t.semDataIda.toLocaleString("pt-BR")} sem data da ida (fora do dia da semana e do mês)`,
    t.semDataCompra > 0 && `${t.semDataCompra.toLocaleString("pt-BR")} sem data da compra (fora da antecedência)`,
  ].filter(Boolean) as string[];
  if (partes.length === 0) return null;
  return (
    <p className="m-0 flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs leading-5 text-slate-600" data-testid="fora-das-medias">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{partes.join(" · ")}. Complete na lista para entrarem na conta.</span>
    </p>
  );
}

export default function AnalisesDePassagens({ visao, onVisao, onVerEvento }: {
  /** Filtros e alternadores — moram na URL (url-da-analise.ts), a página guarda. */
  visao: VisaoDaAnalise;
  onVisao: (v: VisaoDaAnalise) => void;
  /** Troca para a aba Lista já filtrada pelo evento. */
  onVerEvento: (eventId: string) => void;
}) {
  const hoje = useMemo(() => hojeISO(), []);
  const filtros = visao.filtros;
  const setFiltros = (f: FiltrosDaAba) => onVisao({ ...visao, filtros: f });
  const consulta = useAnalisesDePassagens(filtros, hoje);
  const r = consulta.data;
  const atualizando = consulta.isFetching && !!r;

  let conteudo: React.ReactNode;
  if (consulta.isError && !r) {
    const msg = consulta.error instanceof Error ? consulta.error.message : "";
    conteudo = (
      <Estado
        testid="analise-erro"
        tom="erro"
        icone={<AlertCircle className="h-5 w-5" />}
        titulo="Não foi possível carregar as análises"
        texto={msg || "Verifique sua conexão e tente de novo."}
        acao={
          <Button variant="outline" onClick={() => consulta.refetch()} className="rounded-lg" data-testid="analise-tentar-de-novo">
            <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Tentar de novo
          </Button>
        }
      />
    );
  } else if (!r) {
    conteudo = <Esqueleto />;
  } else if (r.totais.passagens === 0) {
    const recorte = filtros.eventId !== "all" || filtros.companhia !== "all" || filtros.transporte !== "all";
    conteudo = (
      <Estado
        testid="analise-vazia"
        icone={<BarChart3 className="h-5 w-5" />}
        titulo="Nenhuma passagem registrada neste período"
        texto={recorte
          ? "Nenhuma passagem bate com o evento, a companhia ou o transporte escolhidos."
          : "As análises usam as passagens já registradas. Amplie o período para ver o histórico."}
        acao={
          <>
            {temRecorte(filtros) && (
              <Button variant="outline" className="rounded-lg" onClick={() => setFiltros(FILTROS_PADRAO)} data-testid="vazio-limpar">Limpar filtros</Button>
            )}
            {filtros.preset !== "tudo" && (
              <Button variant="outline" className="rounded-lg" onClick={() => setFiltros({ ...filtros, preset: "tudo" })} data-testid="vazio-ver-tudo">
                Ver todo o histórico
              </Button>
            )}
          </>
        }
      />
    );
  } else {
    const t = r.totais;
    conteudo = (
      <div className={cn("flex flex-col gap-4 transition-opacity duration-200", atualizando && "opacity-60")} aria-busy={atualizando || undefined} data-testid="analise-conteudo">
        {t.comValor < POUCOS_DADOS && (
          <p className="m-0 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning" data-testid="poucos-dados">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Poucos dados: {plural(t.comValor, "passagem", "passagens")} com valor neste recorte. As médias ainda mudam muito de um evento para outro — leia como tendência, não como regra.
            </span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          <Numero testid="kpi-gasto" rotulo="Gasto total" valor={moeda(t.gasto)} sub="passagem + bagagem" />
          <Numero testid="kpi-passagens" rotulo="Passagens" valor={t.passagens.toLocaleString("pt-BR")} sub={`em ${plural(t.eventos, "evento", "eventos")}`} />
          <Numero testid="kpi-media" rotulo="Preço médio" valor={moeda(t.media)} sub="por passagem, sem bagagem" />
          <Numero
            testid="kpi-trocas"
            rotulo="Ficou em trocas"
            valor={moeda(r.trocas.gasto)}
            sub={r.trocas.passagens === 0 ? "nada no histórico" : `${plural(r.trocas.passagens, "passagem", "passagens")} no histórico`}
            tom={r.trocas.passagens > 0 ? "alerta" : undefined}
          />
        </div>

        <ForaDasMedias t={t} />

        {/* Duas colunas independentes no desktop (07/10): em fileiras, o painel
            mais alto da linha deixava um buraco ao lado (o ranking com 12
            eventos tem quase o dobro da altura dos dias). Abaixo de xl as
            colunas somem (`contents`) e a ordem volta a ser a das perguntas:
            dia, evento, antecedência, rotas, mês, trocas. */}
        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">
          <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
            <div className="order-1 min-w-0">
              <DiasDaSemana ida={r.diasDaIda} volta={r.diasDaVolta} minimo={r.minimoPorDia} trecho={visao.trecho} onTrecho={(trecho) => onVisao({ ...visao, trecho })} />
            </div>
            <div className="order-3 min-w-0">
              <Antecedencia antecedencia={r.antecedencia} minimo={r.minimoPorDia} compraDepoisDaIda={t.compraDepoisDaIda} />
            </div>
            <div className="order-5 min-w-0">
              <GastoPorMes meses={r.porMes} />
            </div>
          </div>
          <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
            <div className="order-2 min-w-0">
              <RankingDeEventos eventos={r.porEvento} onVerEvento={onVerEvento} modo={visao.ordem} onModo={(ordem) => onVisao({ ...visao, ordem })} />
            </div>
            <div className="order-4 min-w-0">
              <RotasECompanhias r={r} visao={visao.grupo} onVisao={(grupo) => onVisao({ ...visao, grupo })} />
            </div>
            <div className="order-6 min-w-0">
              <TrocasERemarcacoes trocas={r.trocas} remarcacoes={r.remarcacoes} />
            </div>
          </div>
        </div>
        <p className="m-0 text-2xs leading-4 text-muted-foreground">
          Entram as passagens atuais e as do histórico de troca, de vagas não excluídas. A tela Realizado do Financeiro continua sendo a fonte do custo de cada evento.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="aba-analises-passagens">
      <FiltrosDaAnalise filtros={filtros} onChange={setFiltros} opcoes={r?.opcoes} atualizando={atualizando} />
      {conteudo}
    </div>
  );
}
