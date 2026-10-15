/**
 * Aba PREÇO POR ROTA (etapa 2, 09/10): o menor preço visto ao longo do tempo
 * em cada rota, a companhia mais barata e a mais cara, quanto varia e para
 * onde está indo — e, ao lado, as rotas e companhias MAIS USADAS no que foi
 * pago (base para acordo corporativo).
 *
 * Cada rota é uma linha que se lê da esquerda para a direita: rota → menor
 * visto → típico → último → variação/tendência → a linha do tempo → as
 * companhias. No estreito vira cartão (mesmos dados, em blocos).
 */
import { useMemo, useState } from "react";
import { BarChart3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AMOSTRA_PEQUENA, type RotaDaAnalise } from "@shared/analise-da-busca";
import { Painel, Numero, Segmentado, Barra } from "@/components/tickets/analises/partes";
import { moeda, plural } from "@/components/tickets/analises/formato";
import { CLASSE_DA_CIA, ddmm } from "../formato";
import type { PeriodoDaAnalise } from "../filtros-da-busca";
import { usePrecoPorRota } from "./use-analises-da-busca";
import { AvisoDeAmostra, ErroDaAnalise, EsqueletoDaAnalise, EstadoDaAnalise, Fonte, Pct, ROTULO_DO_PERIODO, TopoDaAnalise } from "./moldura";
import { Serie } from "./graficos";

type Ordem = "consultas" | "variacao" | "preco";
const ORDENS = [["consultas", "Mais consultadas"], ["variacao", "Mais variam"], ["preco", "Mais caras"]] as const;
const POR_PAGINA = 12;

function SeloDaCia({ codigo }: { codigo: string }) {
  return <span className={cn("inline-flex h-[18px] min-w-[26px] items-center justify-center rounded px-1 font-mono text-[11px] font-bold", CLASSE_DA_CIA[codigo] ?? "bg-muted text-foreground")} aria-hidden="true">{codigo}</span>;
}

function LinhaDaRota({ r }: { r: RotaDaAnalise }) {
  const barata = r.cias.find((c) => c.codigo === r.ciaMaisBarata);
  const cara = r.cias.find((c) => c.codigo === r.ciaMaisCara);
  return (
    <li className="bpa-rota" data-testid={`rota-analise-${r.chave}`}>
      <div data-area="nome" className="min-w-0">
        <p className="m-0 font-mono text-sm font-semibold tabular-nums text-foreground">{r.nome}</p>
        <p className="m-0 mt-0.5 text-2xs text-muted-foreground">
          {r.tipo === "rt" ? "Ida e volta" : "Uma perna"} · {plural(r.consultas, "consulta", "consultas")} · {plural(r.datasDeVoo, "data de voo", "datas de voo")}
          {r.amostraPequena && <span className="ml-1 font-medium text-warning">· amostra pequena</span>}
        </p>
      </div>
      <dl data-area="numeros" className="m-0 grid grid-cols-3 gap-x-3 text-right">
        <div><dt className="text-2xs text-muted-foreground">Menor visto</dt><dd className="m-0 text-sm font-semibold tabular-nums text-success" title={r.menor ? `Consultado em ${ddmm(r.menor.dia)}, voo de ${ddmm(r.menor.dataVoo)}` : undefined}>{moeda(r.menor?.preco)}</dd></div>
        <div><dt className="text-2xs text-muted-foreground">Típico</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{moeda(r.mediana)}</dd></div>
        <div><dt className="text-2xs text-muted-foreground">Último</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground" title={r.ultimo ? `Consultado em ${ddmm(r.ultimo.dia)}` : undefined}>{moeda(r.ultimo?.preco)}</dd></div>
      </dl>
      <div data-area="variacao" className="text-right text-2xs leading-4 text-muted-foreground">
        <p className="m-0">varia <span className="font-semibold tabular-nums text-foreground">{r.variacaoPct === null ? "—" : `${r.variacaoPct}%`}</span></p>
        <p className="m-0">tendência <Pct valor={r.tendenciaPct} /></p>
      </div>
      <div data-area="serie" className="min-w-0"><Serie pontos={r.serie} rotulo={`Menor preço por dia de consulta em ${r.nome}`} /></div>
      <div data-area="cias" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-slate-600">
        {barata && cara ? (
          <>
            <span className="inline-flex items-center gap-1"><SeloDaCia codigo={barata.codigo} /><span>mais barata · média <strong className="font-semibold tabular-nums text-success">{moeda(barata.media)}</strong></span></span>
            <span className="inline-flex items-center gap-1"><SeloDaCia codigo={cara.codigo} /><span>mais cara · média <strong className="font-semibold tabular-nums text-danger">{moeda(cara.media)}</strong></span></span>
          </>
        ) : r.cias.length > 0 ? (
          <span className="text-muted-foreground">Companhias: {r.cias.map((c) => c.nome).join(", ")} — poucas consultas para comparar</span>
        ) : <span className="text-muted-foreground">Sem preço por companhia</span>}
      </div>
    </li>
  );
}

export function AbaPrecoPorRota({ periodo, onPeriodo, onIrParaBuscar }: { periodo: PeriodoDaAnalise; onPeriodo: (p: PeriodoDaAnalise) => void; onIrParaBuscar: () => void }) {
  const q = usePrecoPorRota(periodo);
  const [ordem, setOrdem] = useState<Ordem>("consultas");
  const [filtro, setFiltro] = useState("");
  const [todas, setTodas] = useState(false);
  const r = q.data;
  const rotas = useMemo(() => {
    const t = filtro.trim().toUpperCase();
    const lista = (r?.rotas ?? []).filter((x) => !t || x.nome.includes(t));
    return lista.slice().sort((a, b) =>
      ordem === "variacao" ? (b.variacaoPct ?? -1) - (a.variacaoPct ?? -1)
        : ordem === "preco" ? (b.mediana ?? 0) - (a.mediana ?? 0)
          : b.consultas - a.consultas);
  }, [r, filtro, ordem]);
  const atualizando = q.isFetching && !!r;
  const topo = <TopoDaAnalise pergunta="Quanto custa cada rota ao longo do tempo, que companhia sai mais barata e onde o gasto se concentra." periodo={periodo} onPeriodo={onPeriodo} atualizando={atualizando} />;
  if (q.isError && !r) return <div className="flex flex-col gap-4">{topo}<ErroDaAnalise erro={q.error} onTentar={() => q.refetch()} /></div>;
  if (!r) return <div className="flex flex-col gap-4">{topo}<EsqueletoDaAnalise paineis={2} linhas={6} /></div>;
  if (r.rotas.length === 0 && r.base.passagens === 0) {
    return (
      <div className="flex flex-col gap-4">
        {topo}
        <EstadoDaAnalise testid="rotas-vazio" icone={<BarChart3 className="h-5 w-5" />} titulo="Nenhuma rota consultada ainda"
          texto={<>Sem consultas nem passagens pagas {ROTULO_DO_PERIODO[periodo]}. Cada busca feita na aba Buscar entra aqui.</>}
          acao={<>
            {periodo !== "tudo" && <Button variant="outline" className="rounded-lg" onClick={() => onPeriodo("tudo")}>Ver todo o histórico</Button>}
            <Button variant="outline" className="rounded-lg" onClick={onIrParaBuscar}><Search className="mr-1.5 h-4 w-4" aria-hidden="true" />Ir para Buscar</Button>
          </>} />
      </div>
    );
  }
  const maisVaria = r.rotas.filter((x) => !x.amostraPequena && x.variacaoPct !== null).sort((a, b) => (b.variacaoPct ?? 0) - (a.variacaoPct ?? 0))[0];
  const ciaTop = r.maisBaratasNasBuscas[0];
  const visiveis = todas ? rotas : rotas.slice(0, POR_PAGINA);
  const maiorGasto = Math.max(1, ...r.companhias.map((c) => c.gasto));
  const maiorUso = Math.max(1, ...r.rotasMaisUsadas.map((c) => c.passagens));
  return (
    <div className={cn("flex flex-col gap-4 transition-opacity duration-200", atualizando && "opacity-60")} data-testid="aba-preco-por-rota">
      {topo}
      {r.base.consultas < AMOSTRA_PEQUENA && r.base.consultas > 0 && (
        <AvisoDeAmostra>Amostra pequena: {plural(r.base.consultas, "consulta", "consultas")} {ROTULO_DO_PERIODO[periodo]}. Menor, típico e tendência ainda mudam muito.</AvisoDeAmostra>
      )}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <Numero testid="kpi-rotas" rotulo="Rotas consultadas" valor={r.rotas.length.toLocaleString("pt-BR")} sub={plural(r.base.consultas, "consulta ao fornecedor", "consultas ao fornecedor")} />
        <Numero testid="kpi-variacao" rotulo="Rota que mais varia" valor={maisVaria ? `${maisVaria.variacaoPct}%` : "—"} sub={maisVaria ? `${maisVaria.nome} · do menor ao maior` : "falta amostra"} />
        <Numero testid="kpi-cia-barata" rotulo="Mais vezes a mais barata" valor={ciaTop ? ciaTop.nome : "—"} sub={ciaTop ? `${ciaTop.pct}% das buscas com preço por companhia` : "sem preço por companhia"} />
        <Numero testid="kpi-gasto-pago" rotulo="Gasto pago no período" valor={moeda(r.base.gasto)} sub={plural(r.base.passagens, "passagem registrada", "passagens registradas")} />
      </div>

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] xl:items-start">
        <Painel
          testid="rotas-lista"
          titulo="Preço por rota"
          pergunta="Menor preço visto, o típico (mediana), o último e como mudou entre as consultas"
          acao={<Segmentado valor={ordem} opcoes={ORDENS} onChange={setOrdem} rotulo="Ordenar rotas" testid="ordem-rotas" />}
          corpoRente
          rodape={<><Fonte tipo="pesquisado" className="mr-1.5 align-middle" />Menor preço de cada consulta real. Ida e volta e uma perna são tarifas diferentes e aparecem separadas. Tendência: os 3 últimos dias consultados contra os 3 primeiros.</>}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 pb-3">
            <label className="relative min-w-0 flex-[1_1_200px]">
              <span className="sr-only">Filtrar rota</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por aeroporto (ex.: GRU)" className="h-8 w-full max-w-[280px] rounded-lg border border-border bg-card pl-8 pr-2 text-sm focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/12" data-testid="filtro-rota" />
            </label>
            <span className="text-2xs tabular-nums text-muted-foreground">{plural(rotas.length, "rota", "rotas")}</span>
          </div>
          {rotas.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="m-0 text-sm text-muted-foreground">Nenhuma rota com “{filtro}”.</p>
              <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => setFiltro("")}><X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Limpar filtro</Button>
            </div>
          ) : (
            <ul className="m-0 list-none p-0">{visiveis.map((x) => <LinhaDaRota key={x.chave} r={x} />)}</ul>
          )}
          {rotas.length > POR_PAGINA && (
            <div className="px-4 pt-2">
              <button type="button" onClick={() => setTodas((v) => !v)} className="h-8 rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft" data-testid="ver-todas-rotas">
                {todas ? `Mostrar só as ${POR_PAGINA} primeiras` : `Ver todas as ${rotas.length} rotas`}
              </button>
            </div>
          )}
        </Painel>

        <div className="flex min-w-0 flex-col gap-4">
          <Painel testid="rotas-mais-usadas" titulo="Rotas mais usadas" pergunta="Onde a empresa mais voa — passagens registradas" acao={<Fonte tipo="pago" className="mt-0.5" />}>
            {r.rotasMaisUsadas.length === 0 ? <p className="m-0 py-4 text-center text-sm text-muted-foreground">Nenhuma passagem paga no período.</p> : (
              <ul className="m-0 list-none space-y-2.5 p-0">
                {r.rotasMaisUsadas.map((x) => (
                  <li key={x.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                    <span className="truncate text-[13px] text-slate-700">{x.nome}</span>
                    <span className="text-right text-[13px] font-semibold tabular-nums text-foreground">{x.passagens}<span className="ml-1 text-2xs font-normal text-muted-foreground">· {moeda(x.gasto)}</span></span>
                    <Barra pct={(x.passagens / maiorUso) * 100} className="col-span-2 h-1.5" />
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          <Painel testid="companhias-no-gasto" titulo="Companhias no gasto" pergunta="Participação de cada companhia — base para negociar acordo corporativo" acao={<Fonte tipo="pago" className="mt-0.5" />}
            rodape={r.maisBaratasNasBuscas.length ? <>Nas buscas, a mais barata foi {r.maisBaratasNasBuscas.map((c) => `${c.nome} (${c.pct}%)`).join(", ")} das vezes.</> : undefined}>
            {r.companhias.length === 0 ? <p className="m-0 py-4 text-center text-sm text-muted-foreground">Nenhuma passagem paga no período.</p> : (
              <ul className="m-0 list-none space-y-2.5 p-0">
                {r.companhias.map((c) => (
                  <li key={c.chave || "sem"} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                    <span className="truncate text-[13px] font-medium text-foreground">{c.nome}</span>
                    <span className="text-right text-[13px] tabular-nums"><strong className="font-semibold text-foreground">{c.pctGasto.toLocaleString("pt-BR")}%</strong><span className="ml-1 text-2xs text-muted-foreground">· {moeda(c.gasto)} · {plural(c.passagens, "passagem", "passagens")}</span></span>
                    <Barra pct={(c.gasto / maiorGasto) * 100} className="col-span-2 h-1.5" />
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
      </div>
    </div>
  );
}
