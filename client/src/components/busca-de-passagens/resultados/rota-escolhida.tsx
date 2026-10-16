/**
 * A ROTA aberta na tela de resultados (16/10): cabeçalho com o trecho e o
 * que a busca pediu (datas, janela de horário, conexões), as datas vizinhas e
 * os aeroportos já testados, os filtros locais e as opções em lista densa.
 * Ao lado, quem viaja e as ações que gastam ("Buscar de outro jeito").
 *
 * Os três pedaços são itens da grade da página (`data-area`), para a coluna
 * lateral ir para baixo do cabeçalho no notebook e no celular sem duplicar.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Clock, CloudOff, FilterX, Loader2, Luggage, Plane, Route, SearchX, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  faixaEmTexto,
  ordenarOpcoes,
  reaisInteiros,
  voosDaPerna,
  type ItinerarioDeVoo,
  type ResultadoNaTela,
  type RotaNaTela,
  type VarianteNaTela,
} from "@shared/busca-de-passagens";
import { OpcaoDeVoo, type VagaDaOpcao } from "../opcao-de-voo";
import { sitesDeCompra, viagemDoItinerario, type LinkDeCompra } from "@shared/links-de-compra";
import { diaCurto, haQuanto, hhmm, plural } from "../formato";
import { pedirLinkDeCompra } from "../use-busca-de-passagens";
import { BotaoQueGasta, custoEmTexto, saidasDaRota, type AcoesDaRota, type IdDaSaida } from "./acoes-que-gastam";
import { BarraDeFiltrosDasOpcoes, type ContagemDosFiltros } from "./filtros-das-opcoes";
import { CIAS_DOS_FILTROS, FILTROS_DAS_OPCOES_PADRAO, ciasDaOpcao, filtrosLigados, ordenarParaTela, passaNasOpcoes, type FiltrosDasOpcoes } from "./estado-dos-resultados";

const PERNA: Record<RotaNaTela["perna"], string> = { ida_e_volta: "Ida e volta", ida: "Só ida", volta: "Só volta" };
const POR_VEZ = 20;
const CHIP = "inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-2xs font-medium";

function Esqueleto() {
  return (
    <ul className="m-0 list-none space-y-1.5 p-0" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
          <div className="pas-osso h-7 w-9" />
          <div className="w-32 space-y-1.5"><div className="pas-osso h-3.5 w-20" /><div className="pas-osso h-2.5 w-28" /></div>
          <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-3/5" /><div className="pas-osso h-3.5 w-1/2" /></div>
          <div className="pas-osso h-5 w-24" />
        </li>
      ))}
    </ul>
  );
}

/** "chegar até 22h · volta após 20h · até 1 conexão" — o que a busca pediu. */
function pedidoEmTexto(rota: RotaNaTela): string[] {
  const out: string[] = [];
  if (rota.faixaIda) out.push(`${rota.perna === "volta" ? "sair" : "chegar"} ${faixaEmTexto(rota.faixaIda)}`);
  if (rota.faixaVolta) out.push(`${rota.perna === "volta" ? "sair" : "volta"} ${faixaEmTexto(rota.faixaVolta).replace("a partir de ", "após ")}`);
  out.push(`até ${plural(rota.maxParadas, "conexão", "conexões")}`);
  return out;
}

/** "Nenhum voo com estes filtros": por que, em linguagem clara, e as saídas com o custo de cada uma. */
function SemVoo({ rota, resultado, saidas, ocupado }: { rota: RotaNaTela; resultado: ResultadoNaTela; saidas: ReturnType<typeof saidasDaRota>; ocupado: boolean }) {
  const exigencias: string[] = [];
  if (rota.faixaIda && !rota.semHorario) exigencias.push(rota.perna === "volta" ? `saindo ${faixaEmTexto(rota.faixaIda).replace("a partir de ", "após ")} (horário pedido na escalação)` : `chegando ${faixaEmTexto(rota.faixaIda)} (horário pedido na escalação)`);
  if (rota.faixaVolta && !rota.semHorario) exigencias.push(`com a volta saindo ${faixaEmTexto(rota.faixaVolta).replace("a partir de ", "após ")}${rota.dataVolta ? ` em ${diaCurto(rota.dataVolta)}` : ""}`);
  exigencias.push(rota.maxParadas === 1 ? "com no máximo 1 conexão" : "com até 2 conexões");
  const outras = saidas.filter((s) => s.id !== "atualizar");
  return (
    <div className="bpr-vazio pas-entra" data-testid={`sem-voos-${rota.chave}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-strong" aria-hidden="true"><Plane className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h3 className="m-0 text-base font-semibold text-foreground">Nenhum voo com estes filtros</h3>
          <p className="m-0 mt-1 text-sm leading-relaxed text-slate-600">
            LATAM, GOL e Azul não têm voo <span className="whitespace-nowrap font-mono font-semibold text-foreground">{rota.origem} → {rota.destino}</span> em {diaCurto(rota.dataIda)} que atenda a tudo isto ao mesmo tempo:
          </p>
          <ul className="m-0 mt-1.5 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-slate-600">
            {exigencias.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <p className="m-0 mt-2 text-2xs text-muted-foreground">
            Consultado {haQuanto(resultado.consultadoEm)}{resultado.doCache ? " · do cache, não gastou agora" : ""}. Os filtros desta tela não entram aqui: a resposta já veio vazia.
          </p>
        </div>
      </div>
      {outras.length > 0 && (
        <div className="mt-4 border-t border-border pt-3.5">
          <p className="m-0 mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">O que dá para fazer</p>
          <ul className="m-0 grid list-none gap-2 p-0 xl:grid-cols-2">
            {outras.map((s, i) => {
              const Icone = s.icone;
              return (
                <li key={s.id}>
                  <button type="button" onClick={s.fazer} disabled={ocupado} data-testid={s.testid}
                    className={cn("bpr-saida pas-alvo", i === 0 && "bpr-saida-primeira")}>
                    <Icone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-5 text-foreground">{s.rotulo}</span>
                      <span className="block text-xs leading-5 text-muted-foreground">{s.explica}</span>
                    </span>
                    <span className="shrink-0 self-center rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium tabular-nums text-slate-700">{custoEmTexto(s.custo)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RotaEscolhida({ rota, vagas, acoes, ocupado, carregandoEsta, simulado, filtros, onFiltros, lado }: {
  rota: RotaNaTela;
  vagas: VagaDaOpcao[];
  acoes: AcoesDaRota;
  ocupado: boolean;
  carregandoEsta: boolean;
  simulado: boolean;
  filtros: FiltrosDasOpcoes;
  onFiltros: (f: FiltrosDasOpcoes) => void;
  /** Quem viaja (vai para a coluna lateral, acima das ações que gastam). */
  lado?: ReactNode;
}) {
  const { toast } = useToast();
  const [variante, setVariante] = useState<string | null>(null);
  const [quantas, setQuantas] = useState(POR_VEZ);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [carregandoLinks, setCarregandoLinks] = useState<string | null>(null);
  const [linksPorVoo, setLinksPorVoo] = useState<Record<string, LinkDeCompra[]>>({});
  const atual: VarianteNaTela | null = variante ? rota.variantes?.find((v) => v.chave === variante) ?? null : null;
  const resultado = atual ? atual.resultado : rota.resultado;
  const erro = atual ? atual.erro : rota.erro;
  const opcoes = useMemo(
    () => (resultado ? ordenarOpcoes(resultado.itinerarios, rota, { diariaCentavos: rota.diariaCentavos, diariasDaData: atual?.diarias ?? 0, malaCentavos: rota.malaCentavos }) : []),
    [resultado, rota, atual],
  );
  const filtradas = useMemo(() => ordenarParaTela(opcoes.filter((o) => passaNasOpcoes(o, rota.perna, filtros)), filtros.ordem), [opcoes, rota.perna, filtros]);
  const contagem = useMemo<ContagemDosFiltros>(() => {
    const cias: Record<string, number> = Object.fromEntries(CIAS_DOS_FILTROS.map((c) => [c.id, 0]));
    const paradas = { todas: 0, "0": 0, "1": 0 };
    for (const o of opcoes) {
      if (passaNasOpcoes(o, rota.perna, filtros, "cias")) for (const c of ciasDaOpcao(o)) if (c in cias) cias[c]++;
      if (passaNasOpcoes(o, rota.perna, filtros, "paradas")) {
        paradas.todas++;
        if (o.paradas === 0) paradas["0"]++;
        if (o.paradas <= 1) paradas["1"]++;
      }
    }
    return { cias, paradas };
  }, [opcoes, rota.perna, filtros]);
  const menorPorData = (r: ResultadoNaTela | null, diarias: number) => {
    if (!r) return null;
    const o = ordenarOpcoes(r.itinerarios, rota, { diariaCentavos: rota.diariaCentavos, diariasDaData: diarias, malaCentavos: rota.malaCentavos })[0];
    return o ? o.custoTotalCentavos : null;
  };

  /** Links de compra já pedidos nesta tela (o servidor também guarda no cache de 3 h). */
  const buscarLinks = async (itinerarioId: string): Promise<LinkDeCompra[]> => {
    const ja = linksPorVoo[itinerarioId];
    if (ja) return ja;
    const { links } = await pedirLinkDeCompra(itinerarioId);
    setLinksPorVoo((m) => ({ ...m, [itinerarioId]: links }));
    return links;
  };

  const abrirLink = async (it: ItinerarioDeVoo) => {
    // A janela abre JÁ no clique (senão o navegador bloqueia) e recebe o endereço quando o link chega.
    const janela = window.open("about:blank", "_blank");
    if (janela) janela.opener = null;
    setAbrindo(it.id);
    try {
      // Sempre o site da PRÓPRIA companhia (voo exato > busca dela > busca montada pelo app); agência nunca.
      const { companhia } = sitesDeCompra(await buscarLinks(it.id), viagemDoItinerario(it));
      if (!companhia) {
        janela?.close();
        toast({ title: "Sem link da companhia para este voo", description: "Veja “Outros sites” ou procure o mesmo voo no site da companhia." });
        return;
      }
      if (janela) janela.location.href = companhia.url;
      else window.open(companhia.url, "_blank", "noopener");
      if (!companhia.vooExato) {
        const [ida, volta] = it.pernas;
        const voo = (p: typeof ida) => `${voosDaPerna(p)} (${diaCurto(p.segmentos[0]?.partida)}, ${hhmm(p.segmentos[0]?.partida)})`;
        toast({
          title: `Abrimos a busca no site da ${companhia.nome}`,
          description: `Escolha ${volta ? `a ida ${voo(ida)} e a volta ${voo(volta)}` : `o voo ${voo(ida)}`}. O preço no site pode variar.`,
        });
      }
    } catch (e) {
      janela?.close();
      toast({ title: "Não foi possível abrir o link", description: apiErrorMessage(e, "Tente de novo."), variant: "destructive" });
    } finally {
      setAbrindo(null);
    }
  };

  const carregarOutrosSites = async (itinerarioId: string) => {
    setCarregandoLinks(itinerarioId);
    try {
      await buscarLinks(itinerarioId);
    } catch (e) {
      toast({ title: "Não foi possível buscar os sites", description: apiErrorMessage(e, "Tente de novo."), variant: "destructive" });
    } finally {
      setCarregandoLinks(null);
    }
  };

  const vagasPendentes = vagas.filter((v) => !v.comprada);
  const saidas = saidasDaRota(rota, acoes, !!atual);
  const soRuins = opcoes.length > 0 && opcoes.every((o) => o.grupo === 2);
  const semVoo = !!resultado && opcoes.length === 0 && !erro;
  // As saídas que já estão no meio da tela não se repetem na coluna.
  const emDestaque = new Set<IdDaSaida>(semVoo ? saidas.filter((s) => s.id !== "atualizar").map((s) => s.id) : soRuins ? ["sem-horario"] : []);
  const doLado = saidas.filter((s) => !emDestaque.has(s.id));
  const semHorarioSaida = saidas.find((s) => s.id === "sem-horario");
  const ligados = filtrosLigados(filtros);

  return (
    <>
      {/* ── Cabeçalho da rota ── */}
      <header data-area="cabeca" className="bpr-cabeca" aria-label={`Rota ${rota.origem} para ${rota.destino}`} data-testid={`rota-${rota.chave}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h2 className="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="inline-flex items-center gap-2 font-mono text-xl font-semibold tabular-nums tracking-tight text-foreground">
                {rota.origem}<ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" /><span className="sr-only"> para </span>{rota.destino}
              </span>
              <span className={cn(CHIP, "bg-muted text-slate-700")}>{PERNA[rota.perna]}</span>
              {rota.trechoDireto && <span className={cn(CHIP, "bg-brand-soft text-primary")}><Route className="h-3 w-3" aria-hidden="true" />trecho direto</span>}
              {rota.semHorario && <span className={cn(CHIP, "bg-warning-soft text-warning-strong")} title="Consulta feita sem a janela de horário: as opções fora dela aparecem marcadas"><Clock className="h-3 w-3" aria-hidden="true" />sem o horário sugerido</span>}
              {rota.malaCentavos ? (
                <span className={cn(CHIP, "bg-info-soft text-info-strong")} title="Função que despacha mala (ajuste do administrador): o custo total soma a mala quando a tarifa não a inclui" data-testid={`mala-${rota.chave}`}>
                  <Luggage className="h-3 w-3" aria-hidden="true" />{rota.vagasComMala === vagas.length ? "despacha mala" : `${rota.vagasComMala} de ${vagas.length} despacham mala`} · {reaisInteiros(rota.malaCentavos)} por perna
                </span>
              ) : null}
            </h2>
            <p className="m-0 mt-1 text-sm text-slate-600">
              <span className="font-medium text-foreground">{diaCurto(rota.dataIda)}{rota.dataVolta ? ` → ${diaCurto(rota.dataVolta)}` : ""}</span>
              {pedidoEmTexto(rota).map((t) => <span key={t}><span className="text-muted-foreground" aria-hidden="true"> · </span>{t}</span>)}
            </p>
          </div>
          {rota.resultado && (
            <p className="bpr-consultado m-0 text-2xs leading-4 text-muted-foreground" title={new Date(rota.resultado.consultadoEm).toLocaleString("pt-BR")} data-testid="consultado-em">
              consultado {haQuanto(rota.resultado.consultadoEm)}
              <span className="bpr-consultado-resto">{rota.resultado.doCache ? "do cache · não gastou agora" : "consulta nova"}{simulado ? " · simulado" : ""}</span>
            </p>
          )}
        </div>

        {/* Datas vizinhas (depois de pedidas): o menor custo de cada data e a troca. */}
        {rota.resultado && rota.variantes && (() => {
          const datas = [{ chave: null as string | null, rotulo: "Data sugerida", r: rota.resultado, diarias: 0 }, ...rota.variantes.map((v) => ({ chave: v.chave as string | null, rotulo: v.rotulo, r: v.resultado, diarias: v.diarias }))]
            .map((v) => ({ ...v, menor: menorPorData(v.r, v.diarias) }));
          const melhor = Math.min(...datas.map((d) => d.menor ?? Infinity));
          return (
            <div role="tablist" aria-label="Data" className="mt-3 inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-border bg-background p-[3px]">
              {datas.map((v) => {
                const on = variante === v.chave;
                const maisBarata = v.menor !== null && v.menor === melhor;
                return (
                  <button key={v.chave ?? "base"} type="button" role="tab" aria-selected={on} onClick={() => { setVariante(v.chave); setQuantas(POR_VEZ); }}
                    className={cn("pas-alvo flex min-h-9 flex-col items-start justify-center rounded-md px-2.5 py-1 text-left text-2xs leading-4 transition-colors", on ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                    <span>{v.rotulo}</span>
                    <span className={cn("tabular-nums", maisBarata && "font-semibold text-success")}>{v.menor ? formatarMoeda(v.menor) : v.r ? "sem voo" : "—"}{maisBarata && <span className="sr-only"> (data mais barata)</span>}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Aeroportos alternativos (depois de testados): o menor custo de cada um e a troca — do cache, sem gastar. */}
        {rota.resultado && rota.alternativas && rota.alternativas.length > 0 && (() => {
          const atualMenor = menorPorData(rota.resultado, 0);
          const lista = rota.alternativas.map((a) => ({ a, menor: menorPorData(a.resultado, 0) }));
          const melhor = Math.min(atualMenor ?? Infinity, ...lista.map((x) => x.menor ?? Infinity));
          return (
            <div className="mt-3 inline-flex max-w-full flex-wrap items-stretch gap-0.5 rounded-lg border border-border bg-background p-[3px]" data-testid={`alternativas-testadas-${rota.chave}`}>
              <span className="flex items-center px-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Aeroportos</span>
              <span className="flex min-h-9 flex-col justify-center rounded-md bg-card px-2.5 py-1 text-2xs leading-4 shadow-1 ring-1 ring-border">
                <span className="font-semibold text-primary">Atual · {rota.origem}→{rota.destino}</span>
                <span className={cn("tabular-nums", atualMenor === melhor ? "font-semibold text-success" : "text-muted-foreground")}>{atualMenor ? formatarMoeda(atualMenor) : "sem voo"}</span>
              </span>
              {lista.map(({ a, menor }) => (
                <button key={a.chave} type="button" disabled={ocupado || !a.resultado || !acoes.usarAlternativa} onClick={() => acoes.usarAlternativa?.(rota, a)}
                  title={a.resultado ? "Trocar para este aeroporto — já consultado, não gasta" : a.erro?.mensagem ?? "Não consultado"}
                  className="pas-alvo flex min-h-9 flex-col items-start justify-center rounded-md px-2.5 py-1 text-left text-2xs leading-4 text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid={`usar-alternativa-${a.iata}`}>
                  <span className="font-medium">{a.rotulo}</span>
                  <span className={cn("tabular-nums", menor !== null && menor === melhor && "font-semibold text-success")}>
                    {menor ? `${formatarMoeda(menor)}${atualMenor ? ` · ${menor < atualMenor ? "−" : "+"}${Math.abs(Math.round(((menor - atualMenor) / atualMenor) * 100))}%` : ""}` : a.erro ? "falhou" : "sem voo"}
                    {menor !== null && menor === melhor && <span className="sr-only"> (mais barato)</span>}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}
      </header>

      {/* ── Coluna lateral: quem viaja + as ações que gastam ── */}
      <aside data-area="lado" className="bpr-lado" aria-label="Escalações e ações da rota">
        {lado}
        {doLado.length > 0 && (
          <section className="bpr-bloco" aria-labelledby="bpr-outro-jeito" data-testid="acoes-que-gastam">
            <header className="px-3.5 pb-1 pt-3">
              <h2 id="bpr-outro-jeito" className="m-0 text-xs font-semibold text-foreground">Buscar de outro jeito</h2>
              <p className="m-0 mt-0.5 text-2xs leading-4 text-muted-foreground">Cada uma gasta o que está escrito nela.</p>
            </header>
            <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-2">
              {doLado.map((s) => {
                const Icone = s.icone;
                return (
                  <BotaoQueGasta key={s.id} onClick={s.fazer} disabled={ocupado} custo={s.custo} testid={s.testid} className="w-full justify-start">
                    <Icone className={cn("h-3.5 w-3.5 shrink-0", s.id === "atualizar" && carregandoEsta && "animate-spin")} aria-hidden="true" /><span className="truncate">{s.rotulo}</span>
                  </BotaoQueGasta>
                );
              })}
            </div>
          </section>
        )}
      </aside>

      {/* ── Opções ── */}
      <section data-area="lista" className="bpr-lista min-w-0" aria-label="Opções de voo" aria-live="polite" aria-busy={carregandoEsta || undefined} data-consultando={carregandoEsta && !!resultado ? "" : undefined}>
        {carregandoEsta && !!resultado && (
          <p role="status" className="pas-entra m-0 mb-2 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-primary" data-testid={`consultando-${rota.chave}`}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Consultando o fornecedor… o que está na tela continua valendo até a resposta chegar.
          </p>
        )}
        {carregandoEsta && !resultado ? (
          <Esqueleto />
        ) : erro ? (
          <div role="alert" className="bpr-vazio flex items-start gap-3 border-danger/25">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger" aria-hidden="true"><CloudOff className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-base font-semibold text-foreground">A consulta desta rota falhou</h3>
              <p className="m-0 mt-1 text-sm text-slate-600">{erro.mensagem}</p>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">Nada foi cobrado por esta rota.</p>
              {erro.codigo !== "limite_do_fornecedor" && erro.codigo !== "chave_invalida" && (
                <BotaoQueGasta onClick={() => acoes.consultar(rota)} disabled={ocupado} custo={1} primario className="mt-3">Tentar de novo</BotaoQueGasta>
              )}
            </div>
          </div>
        ) : !resultado ? (
          <div className="bpr-vazio flex flex-wrap items-center gap-3" data-testid={`nao-consultada-${rota.chave}`}>
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><SearchX className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1 basis-[240px]">
              <h3 className="m-0 text-base font-semibold text-foreground">Esta rota ainda não tem preço</h3>
              <p className="m-0 mt-0.5 text-sm text-slate-600">Nenhuma consulta nas últimas horas para estas datas. Buscar agora gasta 1 consulta.</p>
            </div>
            <BotaoQueGasta onClick={() => acoes.consultar(rota)} disabled={ocupado} custo={1} primario testid={`consultar-${rota.chave}`}>Buscar esta rota</BotaoQueGasta>
          </div>
        ) : semVoo ? (
          <SemVoo rota={rota} resultado={resultado} saidas={saidas} ocupado={ocupado} />
        ) : (
          <>
            <BarraDeFiltrosDasOpcoes filtros={filtros} onFiltros={onFiltros} contagem={contagem} visiveis={filtradas.length} total={opcoes.length}
              temVolta={rota.perna === "ida_e_volta"} soVolta={rota.perna === "volta"} />
            {soRuins && semHorarioSaida && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft/50 px-3 py-2" data-testid={`so-ruins-${rota.chave}`}>
                <p className="m-0 min-w-0 flex-1 basis-[220px] text-xs leading-5 text-foreground">No horário sugerido só há voos com 2 conexões, muito longos ou com troca de companhia.</p>
                <BotaoQueGasta onClick={semHorarioSaida.fazer} disabled={ocupado} custo={1} testid={semHorarioSaida.testid}>
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />Ver sem o horário sugerido
                </BotaoQueGasta>
              </div>
            )}
            {rota.semHorario && !atual && (
              <p className="m-0 mt-2 flex items-start gap-1.5 text-2xs leading-4 text-muted-foreground" data-testid={`aviso-sem-horario-${rota.chave}`}>
                <Sparkles className="mt-px h-3 w-3 shrink-0 text-warning-strong" aria-hidden="true" />
                Consulta sem a janela de horário{rota.faixaIda ? ` (chegar ${faixaEmTexto(rota.faixaIda)})` : ""}{rota.faixaVolta ? ` (${rota.perna === "volta" ? "sair" : "volta"} ${faixaEmTexto(rota.faixaVolta).replace("a partir de ", "após ")})` : ""}: as opções fora dela estão marcadas, não escondidas.
              </p>
            )}
            {filtradas.length === 0 ? (
              <div className="bpr-vazio mt-2 flex flex-col items-center py-10 text-center" data-testid="opcoes-filtradas-vazias">
                <span className="mb-2.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><FilterX className="h-5 w-5" /></span>
                <h3 className="m-0 text-base font-semibold text-foreground">Nenhuma das {plural(opcoes.length, "opção", "opções")} passa nos filtros desta tela</h3>
                <p className="m-0 mt-1 max-w-[440px] text-sm text-slate-600">Os voos existem — só estão escondidos pelos filtros. Tirar um filtro não gasta consulta.</p>
                <button type="button" onClick={() => onFiltros({ ...FILTROS_DAS_OPCOES_PADRAO, ordem: filtros.ordem })} className="pas-alvo mt-4 inline-flex h-9 items-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted" data-testid="vazio-limpar-filtros">
                  Limpar {ligados === 1 ? "o filtro" : `os ${ligados} filtros`}
                </button>
              </div>
            ) : (
              <ul className="m-0 mt-2 list-none space-y-1.5 p-0" data-testid="lista-de-opcoes">
                {filtradas.slice(0, quantas).map((o, i) => (
                  <OpcaoDeVoo
                    key={o.itinerario.id}
                    opcao={o}
                    perna={rota.perna}
                    diariaCentavos={rota.diariaCentavos}
                    vagas={vagas}
                    indice={i}
                    simulado={simulado}
                    onUsar={vagasPendentes.length > 0 && !atual ? (vagaId) => acoes.usar(vagaId, rota, o, resultado) : undefined}
                    onUsarTodas={vagasPendentes.length > 1 && !atual && acoes.usarParaTodas ? () => acoes.usarParaTodas?.(rota, o, resultado) : undefined}
                    onAbrirLink={() => abrirLink(o.itinerario)}
                    abrindoLink={abrindo === o.itinerario.id}
                    links={linksPorVoo[o.itinerario.id] ?? null}
                    carregandoLinks={carregandoLinks === o.itinerario.id}
                    onCarregarLinks={() => carregarOutrosSites(o.itinerario.id)}
                  />
                ))}
              </ul>
            )}
            {filtradas.length > quantas && (
              <button type="button" onClick={() => setQuantas((q) => q + POR_VEZ)} className="pas-alvo mt-2 h-9 w-full rounded-lg border border-dashed border-border text-xs font-medium text-primary hover:bg-brand-soft">
                Ver mais {Math.min(POR_VEZ, filtradas.length - quantas)} de {filtradas.length - quantas} opções
              </button>
            )}
            <div className="mt-3 space-y-1 text-2xs leading-4 text-muted-foreground">
              {atual && <p className="m-0">Data vizinha: para registrar, ajuste a data na Escalação e busque de novo.</p>}
              {rota.diariaCentavos ? <p className="m-0">Custo total = preço + diária média do hotel deste evento ({formatarMoeda(rota.diariaCentavos)}) quando a volta sai a partir das 18h.</p> : null}
              {rota.malaCentavos ? <p className="m-0">Quem despacha: “Inclui mala” quando a tarifa já tem bagagem; senão o custo total soma {reaisInteiros(rota.malaCentavos)} por perna (estimativa — confira no site da companhia).</p> : null}
              {!rota.diariaCentavos && opcoes.some((o) => o.diarias !== 0) ? <p className="m-0">“+1 diária”: volta a partir das 18h (regra do Espelho). Sem diária de hotel registrada no evento, o selo não entra no preço.</p> : null}
            </div>
          </>
        )}
      </section>
    </>
  );
}
