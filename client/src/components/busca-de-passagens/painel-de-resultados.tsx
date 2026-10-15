/**
 * Resultados da busca num PAINEL LATERAL (09/10) — não um modal: a lista de
 * escalações continua ali atrás, e no celular o painel ocupa a tela (a etapa
 * "resultados" depois de "lista" e "seleção").
 *
 * Um bloco por ROTA (as vagas agrupadas numa consulta só), com: quem viaja
 * nela, quando foi consultada ("há 12 min · do cache"), "Atualizar" (1
 * consulta), "Datas ±1 dia" (até 2), troca do aeroporto de saída (1) e as
 * opções em ordem de custo total. Todo botão que gasta diz quanto.
 */
import { useMemo, useState } from "react";
import { ArrowRight, CalendarRange, CircleAlert, CloudOff, Plane, RefreshCw, Sparkles, X, Layers } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { rotuloDoAeroporto } from "@shared/aeroportos-do-brasil";
import {
  faixaEmTexto,
  ordenarOpcoes,
  type OpcaoAvaliada,
  type RespostaDaBusca,
  type RotaNaTela,
  type VarianteNaTela,
  type ResultadoNaTela,
} from "@shared/busca-de-passagens";
import { OpcaoDeVoo, type VagaDaOpcao } from "./opcao-de-voo";
import { diaCurto, haQuanto, plural } from "./formato";
import { melhorLink, pedirLinkDeCompra } from "./use-busca-de-passagens";
import type { ErroDaBusca } from "./use-busca-de-passagens";

const PERNA: Record<RotaNaTela["perna"], string> = { ida_e_volta: "Ida e volta", ida: "Só ida", volta: "Só volta" };

export interface AcoesDaRota {
  atualizar: (rota: RotaNaTela) => void;
  datasFlexiveis: (rota: RotaNaTela) => void;
  duasConexoes: (rota: RotaNaTela) => void;
  trocarSaida: (rota: RotaNaTela, iata: string) => void;
  consultar: (rota: RotaNaTela) => void;
  usar: (vagaId: string, rota: RotaNaTela, opcao: OpcaoAvaliada, resultado: ResultadoNaTela) => void;
}

function Esqueleto() {
  return (
    <ul className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="rounded-lg border border-border bg-card px-3.5 py-3">
          <div className="flex items-start gap-3">
            <div className="pas-osso h-7 w-9" />
            <div className="flex-1 space-y-2"><div className="pas-osso h-3.5 w-2/5" /><div className="pas-osso h-3 w-4/5" /><div className="pas-osso h-3 w-3/5" /></div>
            <div className="pas-osso h-5 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function BotaoQueGasta({ onClick, disabled, children, custo, testid, primario }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; custo: number; testid?: string; primario?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`pas-alvo inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        primario ? "bg-primary text-primary-foreground hover:bg-primary-hover font-semibold" : "border border-border bg-card text-slate-700 hover:bg-muted"}`}
      data-testid={testid}
    >
      {children}
      <span className={`rounded px-1 text-2xs tabular-nums ${primario ? "bg-primary-foreground/15" : "bg-muted text-muted-foreground"}`}>
        {custo === 0 ? "grátis" : plural(custo, "consulta", "consultas")}
      </span>
    </button>
  );
}

function RotaDeResultados({ rota, vagas, acoes, ocupado, carregandoEsta, simulado, indice }: {
  rota: RotaNaTela;
  vagas: VagaDaOpcao[];
  acoes: AcoesDaRota;
  ocupado: boolean;
  carregandoEsta: boolean;
  simulado: boolean;
  indice: number;
}) {
  const { toast } = useToast();
  const [variante, setVariante] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const atual: VarianteNaTela | null = variante ? rota.variantes?.find((v) => v.chave === variante) ?? null : null;
  const resultado = atual ? atual.resultado : rota.resultado;
  const erro = atual ? atual.erro : rota.erro;
  const opcoes = useMemo(
    () => (resultado ? ordenarOpcoes(resultado.itinerarios, rota, { diariaCentavos: rota.diariaCentavos, diariasDaData: atual?.diarias ?? 0 }) : []),
    [resultado, rota, atual],
  );
  const visiveis = verTodas ? opcoes : opcoes.slice(0, 5);
  const menorPorData = (r: ResultadoNaTela | null, diarias: number) => {
    if (!r) return null;
    const o = ordenarOpcoes(r.itinerarios, rota, { diariaCentavos: rota.diariaCentavos, diariasDaData: diarias })[0];
    return o ? o.custoTotalCentavos : null;
  };

  const abrirLink = async (itinerarioId: string) => {
    // A janela abre JÁ no clique (senão o navegador bloqueia) e recebe o
    // endereço quando o link chega.
    const janela = window.open("about:blank", "_blank");
    if (janela) janela.opener = null;
    setAbrindo(itinerarioId);
    try {
      const { links } = await pedirLinkDeCompra(itinerarioId);
      const link = melhorLink(links);
      if (!link) {
        janela?.close();
        toast({ title: "Sem link direto para este voo", description: "Procure o mesmo voo no site da companhia." });
        return;
      }
      if (janela) janela.location.href = link.url;
      else window.open(link.url, "_blank", "noopener");
    } catch (e) {
      janela?.close();
      toast({ title: "Não foi possível abrir o link", description: apiErrorMessage(e, "Tente de novo."), variant: "destructive" });
    } finally {
      setAbrindo(null);
    }
  };

  const vagasPendentes = vagas.filter((v) => !v.comprada);
  return (
    <section className="pas-bp-chega border-b border-border px-4 py-4 last:border-0 sm:px-5" style={{ ["--i" as string]: indice }} aria-label={`Rota ${rota.origem} para ${rota.destino}`} data-testid={`rota-${rota.chave}`}>
      {/* Cabeçalho da rota: o trecho e quando foi consultada; embaixo, quem viaja e as ferramentas. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 flex flex-wrap items-baseline gap-x-2 font-mono text-base font-semibold tabular-nums text-foreground">
            <span className="inline-flex items-center gap-1.5">{rota.origem}<ArrowRight className="h-4 w-4 self-center text-muted-foreground" aria-hidden="true" />{rota.destino}</span>
            <span className="font-sans text-xs font-medium text-muted-foreground">{PERNA[rota.perna]}{rota.trechoDireto ? " · trecho direto" : ""}</span>
          </h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {diaCurto(rota.dataIda)}{rota.dataVolta ? ` → ${diaCurto(rota.dataVolta)}` : ""}
            {rota.faixaIda ? ` · chegar ${faixaEmTexto(rota.faixaIda)}` : ""}
            {rota.faixaVolta ? ` · ${rota.perna === "volta" ? "sair" : "volta"} ${faixaEmTexto(rota.faixaVolta).replace("a partir de ", "após ")}` : ""}
            {` · até ${plural(rota.maxParadas, "conexão", "conexões")}`}
          </p>
        </div>
        {rota.resultado && (
          <span className="shrink-0 pt-1 text-right text-2xs leading-4 text-muted-foreground" title={new Date(rota.resultado.consultadoEm).toLocaleString("pt-BR")}>
            consultado {haQuanto(rota.resultado.consultadoEm)}
            {rota.resultado.doCache && <span className="block">do cache · não gastou</span>}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {vagas.map((v) => (
          <span key={v.id} className="inline-flex h-[22px] items-center gap-1 rounded-md bg-muted px-1.5 text-2xs text-slate-700">
            <span className="font-mono font-semibold text-primary">#{v.numero}</span>{toTitleCase(v.nome).split(" ")[0]}
            {v.comprada && <span className="text-success">· comprada</span>}
          </span>
        ))}
        {rota.resultado && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {rota.alternativasDeCasa.length > 0 && !rota.trechoDireto && (
              <select
                value=""
                disabled={ocupado}
                onChange={(e) => { if (e.target.value) acoes.trocarSaida(rota, e.target.value); }}
                className="pas-alvo h-8 max-w-[190px] rounded-lg border border-border bg-card px-2 text-xs font-medium text-slate-700 hover:bg-muted focus:border-primary focus:outline-none"
                aria-label={`Trocar o aeroporto de ${rota.perna === "volta" ? "chegada" : "saída"} (1 consulta)`}
                data-testid={`trocar-saida-${rota.chave}`}
              >
                <option value="">{rota.perna === "volta" ? "Chegar em" : "Sair de"} {rota.perna === "volta" ? rota.destino : rota.origem}</option>
                {rota.alternativasDeCasa.map((a) => <option key={a} value={a}>{rotuloDoAeroporto(a)} — 1 consulta</option>)}
              </select>
            )}
            {!rota.variantes && (
              <BotaoQueGasta onClick={() => acoes.datasFlexiveis(rota)} disabled={ocupado} custo={rota.consultasDoFlex} testid={`flex-${rota.chave}`}>
                <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />Datas ±1 dia
              </BotaoQueGasta>
            )}
            <BotaoQueGasta onClick={() => acoes.atualizar(rota)} disabled={ocupado} custo={1} testid={`atualizar-${rota.chave}`}>
              <RefreshCw className={`h-3.5 w-3.5 ${carregandoEsta ? "animate-spin" : ""}`} aria-hidden="true" />Atualizar
            </BotaoQueGasta>
          </div>
        )}
      </div>

      {/* Datas vizinhas (depois de pedidas): o menor custo de cada data, e a troca. */}
      {rota.resultado && rota.variantes && (
        <div role="tablist" aria-label="Data" className="mt-2.5 inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-background p-[3px]">
          {(() => {
            const datas = [{ chave: null as string | null, rotulo: "Data sugerida", r: rota.resultado, diarias: 0 }, ...rota.variantes.map((v) => ({ chave: v.chave as string | null, rotulo: v.rotulo, r: v.resultado, diarias: v.diarias }))]
              .map((v) => ({ ...v, menor: menorPorData(v.r, v.diarias) }));
            return datas;
          })().map((v, _i, todas) => {
            const menor = v.menor;
            const maisBarata = menor !== null && menor === Math.min(...todas.map((d) => d.menor ?? Infinity));
            const on = variante === v.chave;
            return (
              <button key={v.chave ?? "base"} type="button" role="tab" aria-selected={on} onClick={() => { setVariante(v.chave); setVerTodas(false); }}
                className={`pas-alvo flex min-h-8 flex-col items-start justify-center rounded-md px-2.5 py-1 text-left text-2xs leading-4 transition-colors ${on ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
                <span>{v.rotulo}</span>
                <span className={`tabular-nums ${maisBarata ? "font-semibold text-success" : ""}`}>{menor ? formatarMoeda(menor) : v.r ? "sem voo" : "—"}{maisBarata && <span className="sr-only"> (data mais barata)</span>}</span>
              </button>
            );
          })}
        </div>
      )}


      {/* Corpo: estados da rota */}
      <div className="mt-3" aria-live="polite">
        {carregandoEsta && !resultado ? (
          <Esqueleto />
        ) : erro ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft/50 px-3 py-2.5">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-medium text-foreground">{erro.mensagem}</p>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">Nada foi cobrado por esta rota.</p>
            </div>
            {erro.codigo !== "limite_do_fornecedor" && erro.codigo !== "chave_invalida" && (
              <BotaoQueGasta onClick={() => acoes.consultar(rota)} disabled={ocupado} custo={1}>Tentar de novo</BotaoQueGasta>
            )}
          </div>
        ) : !resultado ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted/50 px-3 py-3">
            <p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground">Ainda não consultada.</p>
            <BotaoQueGasta onClick={() => acoes.consultar(rota)} disabled={ocupado} custo={1} primario testid={`consultar-${rota.chave}`}>Buscar esta rota</BotaoQueGasta>
          </div>
        ) : opcoes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-muted/50 px-3.5 py-4" data-testid={`sem-voos-${rota.chave}`}>
            <p className="m-0 flex items-center gap-2 text-sm font-medium text-foreground"><Plane className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Nenhum voo com estes filtros</p>
            <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
              LATAM, GOL e Azul{rota.maxParadas === 1 ? " com até 1 conexão" : ""}{rota.faixaIda ? `, chegando ${faixaEmTexto(rota.faixaIda)}` : ""}{rota.faixaVolta ? `, saindo ${faixaEmTexto(rota.faixaVolta).replace("a partir de ", "após ")}` : ""}, não têm voo nesta data.
            </p>
            {rota.maxParadas === 1 && !atual && (
              <div className="mt-2.5">
                <BotaoQueGasta onClick={() => acoes.duasConexoes(rota)} disabled={ocupado} custo={1} testid={`duas-conexoes-${rota.chave}`}>
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />Tentar com 2 conexões
                </BotaoQueGasta>
              </div>
            )}
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {visiveis.map((o, i) => (
                <OpcaoDeVoo
                  key={o.itinerario.id}
                  opcao={o}
                  perna={rota.perna}
                  diariaCentavos={rota.diariaCentavos}
                  vagas={vagas}
                  indice={i}
                  simulado={simulado}
                  onUsar={vagasPendentes.length > 0 && !atual ? (vagaId) => acoes.usar(vagaId, rota, o, resultado) : undefined}
                  onAbrirLink={() => abrirLink(o.itinerario.id)}
                  abrindoLink={abrindo === o.itinerario.id}
                />
              ))}
            </ul>
            {opcoes.length > 5 && (
              <button type="button" onClick={() => setVerTodas((v) => !v)} className="mt-2 h-8 rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft">
                {verTodas ? "Mostrar só as 5 melhores" : `Ver mais ${opcoes.length - 5} opções`}
              </button>
            )}
            {atual && <p className="m-0 mt-2 text-2xs text-muted-foreground">Data vizinha: para registrar, ajuste a data na Escalação e busque de novo.</p>}
            {rota.diariaCentavos ? (
              <p className="m-0 mt-2 text-2xs text-muted-foreground">Custo total = preço + diária média do hotel deste evento ({formatarMoeda(rota.diariaCentavos)}) quando a volta sai a partir das 18h.</p>
            ) : opcoes.some((o) => o.diarias !== 0) ? (
              <p className="m-0 mt-2 text-2xs text-muted-foreground">“+1 diária”: volta a partir das 18h (regra do Espelho). Sem diária de hotel registrada no evento, o selo não entra no preço.</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export function PainelDeResultados({ aberto, onFechar, resposta, erro, buscando, chavesEmAndamento, vagaPorId, acoes, onBuscarTudo, previstas }: {
  aberto: boolean;
  onFechar: () => void;
  resposta: RespostaDaBusca | null;
  erro: ErroDaBusca | null;
  buscando: boolean;
  /** Chaves sendo consultadas agora (esqueleto só nelas). */
  chavesEmAndamento: Set<string>;
  vagaPorId: Map<string, VagaDaOpcao>;
  acoes: AcoesDaRota;
  onBuscarTudo: () => void;
  previstas: number;
}) {
  const rotas = resposta?.rotas ?? [];
  const simulado = !!resposta?.consumo.fornecedor?.simulado;
  const consultadas = rotas.filter((r) => r.resultado).length;
  return (
    <Sheet open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:!max-w-[760px] [&>button:last-child]:hidden" data-testid="painel-resultados">
        <header className="flex shrink-0 items-start gap-3 border-b border-border bg-card px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-base font-semibold text-foreground">Preços na internet</SheetTitle>
            <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
              LATAM, GOL e Azul · preço por pessoa · {plural(rotas.length, "rota", "rotas")}{rotas.length ? ` · ${consultadas} com preço` : ""}
            </SheetDescription>
          </div>
          {simulado && (
            <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md bg-info-soft px-2 text-2xs font-medium text-info-strong" title="Sem a chave do fornecedor: preços fictícios para demonstração">
              <Sparkles className="h-3 w-3" aria-hidden="true" />Preços simulados
            </span>
          )}
          <button type="button" onClick={onFechar} className="pas-alvo -mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Fechar os resultados">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {erro && (
          <div role="alert" className={`mx-4 mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 sm:mx-5 ${erro.tipo === "teto" ? "border-danger/25 bg-danger-soft/50" : "border-warning/30 bg-warning-soft/50"}`} data-testid="erro-da-busca">
            <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${erro.tipo === "teto" ? "text-danger" : "text-warning-strong"}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="m-0 text-sm font-medium text-foreground">{erro.tipo === "teto" ? "Teto de consultas do mês" : erro.tipo === "nao_configurada" ? "Busca não configurada" : "A busca não respondeu"}</p>
              <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">{erro.mensagem}</p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rotas.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="m-0 text-sm font-medium text-foreground">Nenhuma rota pronta para buscar</p>
              <p className="m-0 mt-1 text-xs text-muted-foreground">As escalações escolhidas têm dado faltando — corrija na lista e busque de novo.</p>
            </div>
          ) : (
            rotas.map((r, i) => (
              <RotaDeResultados
                key={r.chave}
                rota={r}
                indice={i}
                vagas={r.vagas.map((v) => vagaPorId.get(v.vagaId)).filter((v): v is VagaDaOpcao => !!v)}
                acoes={acoes}
                ocupado={buscando}
                carregandoEsta={chavesEmAndamento.has(r.chave)}
                simulado={simulado}
              />
            ))
          )}
        </div>

        {previstas > 0 && !buscando && (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-3 sm:px-5">
            <p className="m-0 text-xs text-muted-foreground">{plural(previstas, "rota ainda sem preço", "rotas ainda sem preço")}</p>
            <BotaoQueGasta onClick={onBuscarTudo} custo={previstas} primario>Buscar as que faltam</BotaoQueGasta>
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}
