/**
 * PAINEL DE PASSAGENS (30/10) — /paineis/passagens.
 *
 * Lê em ordem de ação: os números do topo (fora do prazo, vencendo, quanto já
 * foi emitido, preço médio), o quadro "Fora do prazo" (o que fazer hoje),
 * "Emitidas × não emitidas" por evento futuro e a comparação de preços com
 * as passagens fora da curva. Cada evento leva à tela Passagens já filtrada.
 *
 * Filtros (período, evento, função) valem para a página toda — o período de
 * PREÇOS é próprio (preço é histórico; "os próximos 30 dias" não diz nada
 * sobre preço). Tudo na URL.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ticket as IconeDePassagem } from "lucide-react";
import { hojeISO } from "@shared/hoje-sp";
import { AJUSTES_PADRAO, type AjustesDaBusca } from "@shared/regras-da-busca";
import { useAuth } from "@/hooks/use-auth";
import { hasRole } from "@/lib/role-utils";
import { fetchJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Numero } from "@/components/tickets/analises/partes";
import { moeda } from "@/components/tickets/analises/formato";
import { FILTROS_PADRAO, periodoDoFiltro } from "@/components/tickets/analises/use-analises-de-passagens";
import { RECORTE_PADRAO, montarPainelDaLogistica, temRecorteNoPainel, type RecorteDoPainel } from "./logistica-dos-paineis";
import {
  DIMENSOES_DO_PRECO, acimaDoTipico, agruparPrecos, estatistica, precosDasPassagens, recortarPrecos, tiposPresentes,
  type DimensaoDoPreco,
} from "./precos-de-passagens";
import { useDadosDosPaineis } from "./use-dados-dos-paineis";
import {
  CoberturaPorEvento, EsqueletoDoPainel, EstadoDoPainel, ErroDoPainel, FiltrosDoPainel, ForaDoPrazo,
  plural, recorteDaUrl, recorteNaUrl, useParametrosDaUrl,
} from "./pecas-dos-paineis";
import { AcimaDoTipico, ComparacaoDePrecos, PERIODOS_DO_PRECO, type PeriodoDoPreco } from "./comparacao-de-precos";

const DIMENSOES = new Set<string>(DIMENSOES_DO_PRECO.map(([k]) => k));
const PERIODOS_PRECO = new Set<string>(PERIODOS_DO_PRECO.map((p) => p.id));

/** O teto da busca de passagens: o admin lê o ajustado; os outros papéis, o padrão (a rota é só admin). */
function usePctDoTeto(): number {
  const { user } = useAuth();
  const admin = hasRole(user, "admin");
  const { data } = useQuery<{ ajustes: AjustesDaBusca }>({
    queryKey: ["/api/busca-de-passagens/ajustes"],
    queryFn: ({ signal }) => fetchJson<{ ajustes: AjustesDaBusca }>("/api/busca-de-passagens/ajustes", signal),
    enabled: admin,
    staleTime: 300_000,
  });
  return data?.ajustes?.tetoPorTrechoPct ?? AJUSTES_PADRAO.tetoPorTrechoPct;
}

export default function PainelDePassagens() {
  const { params, definir } = useParametrosDaUrl();
  const recorte = recorteDaUrl(params);
  const chaveDoRecorte = `${recorte.periodo}|${recorte.eventId}|${recorte.funcoes.join(",")}`;
  const dimensaoUrl = params.get("pr_grupo");
  const dimensao: DimensaoDoPreco = dimensaoUrl && DIMENSOES.has(dimensaoUrl) ? (dimensaoUrl as DimensaoDoPreco) : "rota";
  const periodoUrl = params.get("pr_periodo");
  const periodoDoPreco: PeriodoDoPreco = periodoUrl && PERIODOS_PRECO.has(periodoUrl) ? (periodoUrl as PeriodoDoPreco) : "padrao";
  // `pr_tipo=` (vazio) é "não informado" — por isso `has`, não `get || "all"`.
  const tipo = params.has("pr_tipo") ? (params.get("pr_tipo") ?? "") : "all";

  const { dados, carregando, erro, atualizando, atualizadoEm, atualizar } = useDadosDosPaineis({ passagens: true, hospedagens: false });
  const pctDoTeto = usePctDoTeto();
  const hoje = useMemo(() => new Date(), []);
  const hojeTxt = useMemo(() => hojeISO(), []);

  const painel = useMemo(
    () => (dados ? montarPainelDaLogistica(dados, "passagem", recorte, hoje, dados.dias) : null),
    // O recorte é recriado a cada render (vem da URL); a chave diz quando mudou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, chaveDoRecorte, hoje],
  );

  const todasAsPassagens = useMemo(
    () => (dados ? precosDasPassagens([...dados.passagens, ...dados.historico], dados.vagas, dados.eventos) : []),
    [dados],
  );
  const precos = useMemo(() => {
    const { de, ate } = periodoDoFiltro({ ...FILTROS_PADRAO, preset: periodoDoPreco }, hojeTxt);
    const semTipo = recortarPrecos(todasAsPassagens, { de, ate, eventId: recorte.eventId, funcoes: recorte.funcoes, tipo: "all" });
    const itens = tipo === "all" ? semTipo : semTipo.filter((p) => p.tipo === tipo);
    const acima = acimaDoTipico(itens, todasAsPassagens, pctDoTeto);
    const acimaIds = new Set(acima.map((a) => a.item.id));
    return { itens, acima, grupos: agruparPrecos(itens, dimensao, acimaIds), tipos: tiposPresentes(semTipo), media: estatistica(itens).media };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todasAsPassagens, periodoDoPreco, tipo, dimensao, chaveDoRecorte, pctDoTeto, hojeTxt]);

  const mudarRecorte = (r: RecorteDoPainel) => definir(recorteNaUrl(r));
  const r = painel?.resumo;
  const subtitulo = r
    ? `${plural(r.eventos, "evento", "eventos")} pela frente · ${plural(r.precisam - r.feitas, "passagem a emitir", "passagens a emitir")}${r.aFazerAtrasadas > 0 ? ` · ${r.aFazerAtrasadas.toLocaleString("pt-BR")} fora do prazo` : ""}`
    : "Fora do prazo, emitidas × não emitidas e preços";

  let conteudo: React.ReactNode;
  if (erro && !dados) {
    conteudo = <ErroDoPainel erro={erro} onTentar={atualizar} />;
  } else if (carregando || !dados || !painel || !r) {
    conteudo = <EsqueletoDoPainel />;
  } else {
    const nenhumEvento = painel.linhas.length === 0;
    conteudo = (
      <div className={cn("flex flex-col gap-4 transition-opacity duration-200", atualizando && "opacity-70")} aria-busy={atualizando || undefined} data-testid="painel-passagens">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
          <Numero
            testid="kpi-fora-do-prazo"
            rotulo="Fora do prazo"
            valor={r.aFazerAtrasadas.toLocaleString("pt-BR")}
            sub={r.aFazerAtrasadas === 0
              ? (r.esperandoAtrasadas > 0 ? `nenhuma a emitir · ${r.esperandoAtrasadas} esperando a escala` : "nenhuma passagem atrasada")
              : `a emitir em ${plural(r.eventosAtrasados, "evento", "eventos")}${r.esperandoAtrasadas > 0 ? ` · +${r.esperandoAtrasadas} esperando a escala` : ""}`}
            tom={r.aFazerAtrasadas > 0 ? "alerta" : undefined}
          />
          <Numero
            testid="kpi-vencendo"
            rotulo="Vencem em até 3 dias"
            valor={r.vencendo.toLocaleString("pt-BR")}
            sub={r.eventosVencendo === 0 ? "nenhum prazo nos próximos dias" : `sem passagem em ${plural(r.eventosVencendo, "evento", "eventos")}`}
            tom={r.vencendo > 0 ? "alerta" : undefined}
          />
          <Numero
            testid="kpi-emitidas"
            rotulo="Emitidas"
            valor={r.pctFeitas === null ? "—" : `${r.pctFeitas}%`}
            sub={`${r.feitas.toLocaleString("pt-BR")} de ${plural(r.precisam, "vaga que precisa", "vagas que precisam")}`}
          />
          <Numero
            testid="kpi-preco-medio"
            rotulo="Preço médio"
            valor={moeda(precos.media)}
            sub={precos.acima.length > 0
              ? `${plural(precos.acima.length, "passagem", "passagens")} acima do típico`
              : `${plural(precos.itens.length, "passagem", "passagens")} no período de preços`}
          />
        </div>

        {nenhumEvento ? (
          <EstadoDoPainel
            testid="painel-sem-eventos"
            icone={<IconeDePassagem className="h-5 w-5" />}
            titulo="Nenhum evento pela frente com passagem a acompanhar"
            texto={temRecorteNoPainel(recorte)
              ? "Nenhuma vaga que precisa de passagem bate com o período, o evento ou as funções escolhidos."
              : "Quando houver vagas que precisam de passagem em eventos futuros, elas aparecem aqui."}
            acao={temRecorteNoPainel(recorte) ? (
              <Button variant="outline" className="rounded-lg" onClick={() => mudarRecorte(RECORTE_PADRAO)} data-testid="painel-vazio-limpar">Limpar filtros</Button>
            ) : undefined}
          />
        ) : (
          <>
            <ForaDoPrazo etapa="passagem" grupos={painel.fora} diasAntes={dados.dias.passagem} />
            <CoberturaPorEvento
              etapa="passagem"
              linhas={painel.linhas}
              titulo="Emitidas × não emitidas por evento"
              pergunta="Eventos futuros, do mais próximo ao mais distante — clique para abrir em Passagens"
            />
          </>
        )}

        <div className="flex flex-col gap-4 2xl:grid 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] 2xl:items-start">
          <ComparacaoDePrecos
            itens={precos.itens}
            grupos={precos.grupos}
            dimensao={dimensao}
            onDimensao={(d) => definir({ pr_grupo: d === "rota" ? null : d })}
            periodo={periodoDoPreco}
            onPeriodo={(p) => definir({ pr_periodo: p === "padrao" ? null : p })}
            tipo={tipo}
            onTipo={(t) => definir({ pr_tipo: t === "all" ? null : t })}
            tipos={precos.tipos}
          />
          <AcimaDoTipico itens={precos.acima} pctDoTeto={pctDoTeto} />
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader variant="bar" title="Painel de passagens" subtitle={subtitulo} />
      <div className="mt-4 flex flex-col gap-4">
        <FiltrosDoPainel
          recorte={recorte}
          onRecorte={mudarRecorte}
          opcoes={painel?.opcoes ?? null}
          atualizando={atualizando}
          atualizadoEm={dados ? atualizadoEm : null}
          onAtualizar={atualizar}
        />
        {conteudo}
      </div>
    </>
  );
}
