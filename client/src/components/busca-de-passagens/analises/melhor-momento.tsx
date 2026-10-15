/**
 * Aba MELHOR MOMENTO (dono, 09/10: "quando está mais barato, mais caro").
 *
 * Lê na ordem da pergunta: as frases diretas no topo (antecedência, dia da
 * semana do voo, horário — cada uma com a fonte), depois os gráficos que as
 * provam (pesquisado | pago lado a lado no mesmo painel), e por fim QUEM
 * compra cedo ou tarde e quanto isso custa a mais (estimado). Comparar rotas
 * diferentes engana: tudo é "% contra o típico da própria rota".
 */
import { useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AMOSTRA_PEQUENA, type FraseDoMomento, type GrupoDePreco } from "@shared/analise-da-busca";
import { Painel, Segmentado } from "@/components/tickets/analises/partes";
import { moeda, plural } from "@/components/tickets/analises/formato";
import { toTitleCase } from "@/lib/format";
import type { PeriodoDaAnalise } from "../filtros-da-busca";
import { useMelhorMomento } from "./use-analises-da-busca";
import { AvisoDeAmostra, ErroDaAnalise, EsqueletoDaAnalise, EstadoDaAnalise, Fonte, Frases, ROTULO_DO_PERIODO, TopoDaAnalise } from "./moldura";
import { LegendaDoIndice, ListaDeIndice, Realce } from "./graficos";

type Lado = "pesquisado" | "pago";
const LADOS = [["pesquisado", "Pesquisado"], ["pago", "Pago"]] as const;

function frase(f: FraseDoMomento) {
  return {
    chave: `${f.tema}-${f.fonte}`,
    fonte: f.fonte,
    texto: <Realce texto={f.texto} trechos={[[f.barato.rotulo, "text-success"], [f.caro.rotulo, "text-danger"], [f.barato.curto, "text-success"], [f.caro.curto, "text-danger"]]} />,
  };
}

function PainelComLados({ titulo, pergunta, pesquisado, pago, unidadePago = "passagem", unidadePesquisado = "consulta", testid, minimo, rodape }: {
  titulo: string; pergunta: string; pesquisado: GrupoDePreco[]; pago?: GrupoDePreco[]; unidadePago?: "passagem"; unidadePesquisado?: "consulta" | "opção"; testid: string; minimo: number; rodape: React.ReactNode;
}) {
  const [lado, setLado] = useState<Lado>(pesquisado.some((g) => g.n > 0) || !pago ? "pesquisado" : "pago");
  const grupos = lado === "pago" && pago ? pago : pesquisado;
  const temDado = grupos.some((g) => g.n > 0);
  return (
    <Painel
      testid={testid}
      titulo={titulo}
      pergunta={pergunta}
      acao={pago ? <Segmentado valor={lado} opcoes={LADOS} onChange={setLado} rotulo="Fonte" testid={`${testid}-fonte`} /> : <Fonte tipo="pesquisado" className="mt-0.5" />}
      rodape={rodape}
    >
      {temDado ? (
        <>
          <ListaDeIndice grupos={grupos} rotulo={titulo} unidade={lado === "pago" ? unidadePago : unidadePesquisado} testid={`${testid}-${lado}`} />
          <LegendaDoIndice minimo={minimo} mostrarFraco={grupos.some((g) => g.n > 0 && !g.comparavel)} />
        </>
      ) : (
        <p className="m-0 py-6 text-center text-sm text-muted-foreground">{lado === "pago" ? "Nenhuma passagem paga com estas datas no período." : "Nenhuma consulta no período."}</p>
      )}
    </Painel>
  );
}

export function AbaMelhorMomento({ periodo, onPeriodo, onIrParaBuscar }: { periodo: PeriodoDaAnalise; onPeriodo: (p: PeriodoDaAnalise) => void; onIrParaBuscar: () => void }) {
  const q = useMelhorMomento(periodo);
  const r = q.data;
  const atualizando = q.isFetching && !!r;
  const topo = <TopoDaAnalise pergunta="Quando comprar e quando voar sai mais barato — pelo que foi pesquisado e pelo que foi pago, sempre contra o preço típico de cada rota." periodo={periodo} onPeriodo={onPeriodo} atualizando={atualizando} />;
  if (q.isError && !r) return <div className="flex flex-col gap-4">{topo}<ErroDaAnalise erro={q.error} onTentar={() => q.refetch()} /></div>;
  if (!r) return <div className="flex flex-col gap-4">{topo}<EsqueletoDaAnalise numeros={0} paineis={2} /></div>;
  if (r.base.consultas === 0 && r.base.passagens === 0) {
    return (
      <div className="flex flex-col gap-4">
        {topo}
        <EstadoDaAnalise
          testid="momento-vazio"
          icone={<CalendarClock className="h-5 w-5" />}
          titulo="Ainda sem preços para comparar"
          texto={<>Nenhuma consulta nem passagem paga {ROTULO_DO_PERIODO[periodo]}. Cada busca feita na aba Buscar entra aqui automaticamente.</>}
          acao={<>
            {periodo !== "tudo" && <Button variant="outline" className="rounded-lg" onClick={() => onPeriodo("tudo")}>Ver todo o histórico</Button>}
            <Button variant="outline" className="rounded-lg" onClick={onIrParaBuscar}><Search className="mr-1.5 h-4 w-4" aria-hidden="true" />Ir para Buscar</Button>
          </>}
        />
      </div>
    );
  }
  const pequena = r.base.consultas < AMOSTRA_PEQUENA;
  return (
    <div className={cn("flex flex-col gap-4 transition-opacity duration-200", atualizando && "opacity-60")} data-testid="aba-melhor-momento">
      {topo}
      {(pequena || r.base.passagens < AMOSTRA_PEQUENA) && (
        <AvisoDeAmostra>
          Amostra pequena: {plural(r.base.consultas, "consulta", "consultas")} em {plural(r.base.rotas, "rota", "rotas")} e {plural(r.base.passagens, "passagem paga", "passagens pagas")} {ROTULO_DO_PERIODO[periodo]}. As diferenças ainda mudam muito — leia como indício, não como regra.
        </AvisoDeAmostra>
      )}
      {r.frases.length > 0 ? (
        <Frases itens={r.frases.map(frase)} />
      ) : (
        <p className="m-0 rounded-xl border border-dashed border-border bg-card px-4 py-3.5 text-sm text-muted-foreground" data-testid="momento-sem-frase">
          Ainda não dá para afirmar quando é mais barato: falta ter ao menos {r.minimo} preços em duas faixas diferentes. Os números parciais estão abaixo.
        </p>
      )}

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <PainelComLados
            testid="momento-antecedencia"
            titulo="Antecedência da compra"
            pergunta="Quanto o preço muda conforme os dias até o voo"
            pesquisado={r.pesquisado.antecedencia}
            pago={r.pago.antecedencia}
            minimo={r.minimo}
            rodape={<>Pesquisado: dias entre a consulta e o voo. Pago: dias entre a compra e a ida. “vs típico” compara cada preço com a mediana da própria rota.</>}
          />
          <PainelComLados
            testid="momento-horario"
            titulo="Horário do voo"
            pergunta="Madrugada, manhã, tarde ou noite — contra os outros voos da mesma busca"
            pesquisado={r.pesquisado.horario}
            unidadePesquisado="opção"
            minimo={r.minimo}
            rodape={<>Cada voo é comparado com os outros da MESMA consulta (mesma rota, data e momento). Base: {plural(r.base.opcoes, "opção", "opções")} guardadas.</>}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <PainelComLados
            testid="momento-dia"
            titulo="Dia da semana do voo"
            pergunta="Em que dia voar sai mais caro ou mais barato"
            pesquisado={r.pesquisado.diaDaSemana}
            pago={r.pago.diaDaSemana}
            minimo={r.minimo}
            rodape={<>Pelo dia da ida (ou do único trecho). Mais caro e mais barato só entre dias com {r.minimo} ou mais preços.</>}
          />
          <QuemCompra r={r} />
        </div>
      </div>
    </div>
  );
}

function QuemCompra({ r }: { r: NonNullable<ReturnType<typeof useMelhorMomento>["data"]> }) {
  const lista = r.quemCompra.filter((p) => p.passagens > 0);
  const ref = r.faixaDeReferencia;
  const maisCaro = lista.find((p) => (p.custoExtraEstimado ?? 0) > 0);
  return (
    <Painel
      testid="quem-compra"
      titulo="Quem compra cedo, quem compra tarde"
      pergunta="Antecedência média de quem registra as passagens e quanto a compra tardia custou a mais"
      acao={<Fonte tipo="pago" className="mt-0.5" />}
      corpoRente
      resposta={maisCaro && ref ? (
        <p className="m-0">
          <strong className="font-semibold text-foreground">{toTitleCase(maisCaro.nome)}</strong> compra em média com {maisCaro.antecedenciaMedia} dias: estimamos{" "}
          <strong className="font-semibold text-danger">{moeda(maisCaro.custoExtraEstimado)} a mais</strong> do que se tivesse comprado com {ref.rotulo.toLowerCase()}.
        </p>
      ) : undefined}
      rodape={ref
        ? <>Custo a mais = estimativa contra a faixa mais barata do pago ({ref.rotulo.toLowerCase()}, {ref.pct !== null ? `${Math.abs(ref.pct)}% ${ref.pct < 0 ? "abaixo" : "acima"} do típico` : "típico"}). Quem registrou = quem criou a passagem no app.</>
        : <>Sem faixas de antecedência suficientes no pago para estimar o custo a mais. Quem registrou = quem criou a passagem no app.</>}
    >
      {lista.length === 0 ? (
        <p className="m-0 px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma passagem paga no período.</p>
      ) : (
        <div role="table" aria-label="Antecedência por quem registra" className="text-[13px]">
          <div role="row" className="bpa-quem bpa-quem-cabeca">
            <span role="columnheader">Quem registra</span>
            <span role="columnheader" className="text-right" title="Passagens registradas">Qtd.</span>
            <span role="columnheader" className="text-right" title="Antecedência média da compra">Dias antes</span>
            <span role="columnheader" className="bpa-quem-opc text-right">&lt; 7 dias</span>
            <span role="columnheader" className="text-right" title="Custo a mais estimado">A mais</span>
          </div>
          {lista.map((p) => (
            <div role="row" key={p.usuarioId ?? p.nome} className="bpa-quem" data-testid={`quem-${p.usuarioId ?? "sem"}`}>
              <span role="cell" className="truncate font-medium text-foreground">{toTitleCase(p.nome)}</span>
              <span role="cell" className="text-right tabular-nums text-slate-700">{p.passagens}</span>
              <span role="cell" className={cn("text-right tabular-nums", (p.antecedenciaMedia ?? 99) < 14 ? "font-semibold text-warning" : "text-slate-700")}>{p.antecedenciaMedia === null ? "—" : `${p.antecedenciaMedia} dias`}</span>
              <span role="cell" className="bpa-quem-opc text-right tabular-nums text-slate-600">{p.pctEmCimaDaHora === null ? "—" : `${p.pctEmCimaDaHora}%`}</span>
              <span role="cell" className={cn("text-right font-semibold tabular-nums", (p.custoExtraEstimado ?? 0) > 0 ? "text-danger" : "text-muted-foreground")}>{p.custoExtraEstimado === null ? "—" : moeda(p.custoExtraEstimado)}</span>
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}
