/**
 * PAINEL DE HOSPEDAGEM (30/10) — /paineis/hospedagem.
 *
 * O irmão do Painel de passagens, com a etapa Hotel do Quadro de prazos
 * (D-30): números do topo, "Fora do prazo", "Registradas × não registradas"
 * por evento futuro e a comparação de hotéis por room nights. Cada evento
 * leva à Hospedagem no evento (?event=, 30/10); a comparação de hotéis abre
 * o Espelho operacional (onde ficam os quartos).
 *
 * "Registrada" = hospedagem com nome do hotel e não cancelada — a MESMA regra
 * de `vagasComHotel` (use-scaling-recorte.ts) e do servidor (`hospedagemConta`).
 */
import { useMemo } from "react";
import { BedDouble } from "lucide-react";
import { hojeISO } from "@shared/hoje-sp";
import { somarDias } from "@shared/analise-de-passagens";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Numero } from "@/components/tickets/analises/partes";
import { moeda } from "@/components/tickets/analises/formato";
import { FILTROS_PADRAO, periodoDoFiltro } from "@/components/tickets/analises/use-analises-de-passagens";
import { RECORTE_PADRAO, montarPainelDaLogistica, temRecorteNoPainel, type RecorteDoPainel } from "../passagens/logistica-dos-paineis";
import { useDadosDosPaineis } from "../passagens/use-dados-dos-paineis";
import {
  CoberturaPorEvento, EsqueletoDoPainel, EstadoDoPainel, ErroDoPainel, FiltrosDoPainel, ForaDoPrazo,
  plural, recorteDaUrl, recorteNaUrl, useParametrosDaUrl,
} from "../passagens/pecas-dos-paineis";
import { PERIODOS_DO_PRECO, type PeriodoDoPreco } from "../passagens/comparacao-de-precos";
import {
  DIMENSOES_DO_HOTEL, agruparEstadias, estadiasNoHotel, numerosDoHotel, recortarEstadias, textoDeNoites,
  type DimensaoDoHotel,
} from "./room-nights";
import { ComparacaoDeHoteis } from "./comparacao-de-hoteis";

const DIMENSOES = new Set<string>(DIMENSOES_DO_HOTEL.map(([k]) => k));
const PERIODOS = new Set<string>(PERIODOS_DO_PRECO.map((p) => p.id));

export default function PainelDeHospedagem() {
  const { params, definir } = useParametrosDaUrl();
  const recorte = recorteDaUrl(params);
  const chaveDoRecorte = `${recorte.periodo}|${recorte.eventId}|${recorte.funcoes.join(",")}`;
  const dimensaoUrl = params.get("ho_grupo");
  const dimensao: DimensaoDoHotel = dimensaoUrl && DIMENSOES.has(dimensaoUrl) ? (dimensaoUrl as DimensaoDoHotel) : "hotel";
  const periodoUrl = params.get("ho_periodo");
  const periodoDosHoteis: PeriodoDoPreco = periodoUrl && PERIODOS.has(periodoUrl) ? (periodoUrl as PeriodoDoPreco) : "padrao";

  const { dados, carregando, erro, atualizando, atualizadoEm, atualizar } = useDadosDosPaineis({ passagens: false, hospedagens: true });
  const hoje = useMemo(() => new Date(), []);
  const hojeTxt = useMemo(() => hojeISO(), []);

  const painel = useMemo(
    () => (dados ? montarPainelDaLogistica(dados, "hotel", recorte, hoje, dados.dias) : null),
    // O recorte é recriado a cada render (vem da URL); a chave diz quando mudou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, chaveDoRecorte, hoje],
  );

  const estadias = useMemo(() => (dados ? estadiasNoHotel(dados.hospedagens, dados.vagas, dados.eventos) : []), [dados]);
  const hoteis = useMemo(() => {
    const { de, ate } = periodoDoFiltro({ ...FILTROS_PADRAO, preset: periodoDosHoteis }, hojeTxt);
    const doRecorte = recortarEstadias(estadias, { de, ate, eventId: recorte.eventId, funcoes: recorte.funcoes });
    // Os próximos eventos do recorte da página (para o número do topo).
    const ateDoPainel = recorte.periodo === "todos" ? null : somarDias(hojeTxt, Number(recorte.periodo));
    const proximos = recortarEstadias(estadias, { de: hojeTxt, ate: ateDoPainel, eventId: recorte.eventId, funcoes: recorte.funcoes });
    return { estadias: doRecorte, grupos: agruparEstadias(doRecorte, dimensao), proximos: numerosDoHotel(proximos) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadias, periodoDosHoteis, dimensao, chaveDoRecorte, hojeTxt]);

  const mudarRecorte = (r: RecorteDoPainel) => definir(recorteNaUrl(r));
  const r = painel?.resumo;
  const subtitulo = r
    ? `${plural(r.eventos, "evento", "eventos")} pela frente · ${plural(r.precisam - r.feitas, "hospedagem a reservar", "hospedagens a reservar")}${r.aFazerAtrasadas > 0 ? ` · ${r.aFazerAtrasadas.toLocaleString("pt-BR")} fora do prazo` : ""}`
    : "Fora do prazo, registradas × não registradas e room nights";

  let conteudo: React.ReactNode;
  if (erro && !dados) {
    conteudo = <ErroDoPainel erro={erro} onTentar={atualizar} />;
  } else if (carregando || !dados || !painel || !r) {
    conteudo = <EsqueletoDoPainel />;
  } else {
    const nenhumEvento = painel.linhas.length === 0;
    const px = hoteis.proximos;
    conteudo = (
      <div className={cn("flex flex-col gap-4 transition-opacity duration-200", atualizando && "opacity-70")} aria-busy={atualizando || undefined} data-testid="painel-hospedagem">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
          <Numero
            testid="kpi-fora-do-prazo"
            rotulo="Fora do prazo"
            valor={r.aFazerAtrasadas.toLocaleString("pt-BR")}
            sub={r.aFazerAtrasadas === 0
              ? (r.esperandoAtrasadas > 0 ? `nenhuma a reservar · ${r.esperandoAtrasadas} esperando a escala` : "nenhuma hospedagem atrasada")
              : `a reservar em ${plural(r.eventosAtrasados, "evento", "eventos")}${r.esperandoAtrasadas > 0 ? ` · +${r.esperandoAtrasadas} esperando a escala` : ""}`}
            tom={r.aFazerAtrasadas > 0 ? "alerta" : undefined}
          />
          <Numero
            testid="kpi-vencendo"
            rotulo="Vencem em até 3 dias"
            valor={r.vencendo.toLocaleString("pt-BR")}
            sub={r.eventosVencendo === 0 ? "nenhum prazo nos próximos dias" : `sem hotel em ${plural(r.eventosVencendo, "evento", "eventos")}`}
            tom={r.vencendo > 0 ? "alerta" : undefined}
          />
          <Numero
            testid="kpi-registradas"
            rotulo="Registradas"
            valor={r.pctFeitas === null ? "—" : `${r.pctFeitas}%`}
            sub={`${r.feitas.toLocaleString("pt-BR")} de ${plural(r.precisam, "vaga que precisa", "vagas que precisam")}`}
          />
          <Numero
            testid="kpi-room-nights"
            rotulo="Room nights · próximos eventos"
            valor={textoDeNoites(px.roomNights)}
            sub={`${textoDeNoites(px.pessoaNoites)} pessoa-noites${px.porRoomNight !== null ? ` · ${moeda(px.porRoomNight)}/room night` : ""}`}
          />
        </div>

        {nenhumEvento ? (
          <EstadoDoPainel
            testid="painel-sem-eventos"
            icone={<BedDouble className="h-5 w-5" />}
            titulo="Nenhum evento pela frente com hospedagem a acompanhar"
            texto={temRecorteNoPainel(recorte)
              ? "Nenhuma vaga que precisa de hotel bate com o período, o evento ou as funções escolhidos."
              : "Quando houver vagas que precisam de hotel em eventos futuros, elas aparecem aqui."}
            acao={temRecorteNoPainel(recorte) ? (
              <Button variant="outline" className="rounded-lg" onClick={() => mudarRecorte(RECORTE_PADRAO)} data-testid="painel-vazio-limpar">Limpar filtros</Button>
            ) : undefined}
          />
        ) : (
          <>
            <ForaDoPrazo etapa="hotel" grupos={painel.fora} diasAntes={dados.dias.hotel} />
            <CoberturaPorEvento
              etapa="hotel"
              linhas={painel.linhas}
              titulo="Registradas × não registradas por evento"
              pergunta="Eventos futuros, do mais próximo ao mais distante — clique para abrir na Hospedagem"
            />
          </>
        )}

        <ComparacaoDeHoteis
          estadias={hoteis.estadias}
          grupos={hoteis.grupos}
          dimensao={dimensao}
          onDimensao={(d) => definir({ ho_grupo: d === "hotel" ? null : d })}
          periodo={periodoDosHoteis}
          onPeriodo={(p) => definir({ ho_periodo: p === "padrao" ? null : p })}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader variant="bar" title="Painel de hospedagem" subtitle={subtitulo} />
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
