/**
 * Painel de passagens — "Comparação de preços" e "Muito acima do típico".
 * A conta mora em precos-de-passagens.ts; aqui só a aparência (mesmas peças
 * das Análises de passagens: Painel, Segmentado, LinhaDeBarra).
 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { ROTULO_TRANSPORTE } from "@shared/analise-de-passagens";
import { FiltroDeLista } from "@/components/common/filter-popover";
import { cn } from "@/lib/utils";
import { LinhaDeBarra, Painel, Segmentado } from "@/components/tickets/analises/partes";
import { dataCurta, largura, moeda } from "@/components/tickets/analises/formato";
import {
  DIMENSOES_DO_PRECO, estatistica,
  type DimensaoDoPreco, type GrupoDePreco, type PassagemAcima, type PrecoDaPassagem,
} from "./precos-de-passagens";
import { plural } from "./pecas-dos-paineis";

export type PeriodoDoPreco = "padrao" | "proximos" | "12m" | "ano" | "tudo";

export const PERIODOS_DO_PRECO: { id: PeriodoDoPreco; nome: string }[] = [
  { id: "padrao", nome: "Últimos 3 meses e próximos" },
  { id: "proximos", nome: "Só os próximos eventos" },
  { id: "12m", nome: "Últimos 12 meses" },
  { id: "ano", nome: "Este ano" },
  { id: "tudo", nome: "Todo o histórico" },
];

const LIMITE = 10;

const NOME_DA_COLUNA: Record<DimensaoDoPreco, string> = {
  rota: "Rota", companhia: "Companhia", tipo: "Tipo", evento: "Evento", mes: "Mês da viagem",
};

const UNIDADE: Record<DimensaoDoPreco, [string, string]> = {
  rota: ["rota", "rotas"], companhia: ["companhia", "companhias"], tipo: ["tipo", "tipos"], evento: ["evento", "eventos"], mes: ["mês", "meses"],
};

/** Trilho de 0 ao maior máximo da tabela: barra do mínimo ao máximo e um ponto na média. */
function FaixaDePreco({ g, escala }: { g: GrupoDePreco; escala: number }) {
  if (g.min === null || g.max === null || g.media === null || escala <= 0) return <span className="text-muted-foreground">—</span>;
  const pos = (v: number) => Math.min(100, Math.max(0, (v / escala) * 100));
  return (
    <span className="flex min-w-[120px] flex-col gap-1">
      <span aria-hidden="true" className="relative block h-2 rounded-full bg-muted">
        <span className="absolute inset-y-0 rounded-full bg-primary/25" style={{ left: `${pos(g.min)}%`, width: `${Math.max(1.5, pos(g.max) - pos(g.min))}%` }} />
        <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary" style={{ left: `${pos(g.media)}%` }} />
      </span>
      <span className="text-2xs tabular-nums text-muted-foreground">{moeda(g.min)} – {moeda(g.max)}</span>
    </span>
  );
}

function Resposta({ grupos, dimensao }: { grupos: GrupoDePreco[]; dimensao: DimensaoDoPreco }) {
  const comMedia = grupos.filter((g) => g.media !== null);
  if (grupos.length === 0) {
    return <p className="m-0 text-muted-foreground">{dimensao === "rota" ? "Nenhuma passagem com origem e destino preenchidos neste recorte." : "Nenhuma passagem neste recorte."}</p>;
  }
  if (dimensao === "mes") {
    if (comMedia.length < 2) return undefined;
    const caro = comMedia.reduce((a, g) => ((g.media ?? 0) > (a.media ?? 0) ? g : a));
    const barato = comMedia.reduce((a, g) => ((g.media ?? 0) < (a.media ?? 0) ? g : a));
    return (
      <p className="m-0">
        Mais caro em <strong className="font-semibold text-danger">{caro.nome}</strong> (média <span className="tabular-nums">{moeda(caro.media)}</span>);
        mais barato em <strong className="font-semibold text-success">{barato.nome}</strong> (<span className="tabular-nums">{moeda(barato.media)}</span>).
      </p>
    );
  }
  const g = grupos[0];
  const quem = dimensao === "rota" ? "é a rota mais comprada" : dimensao === "companhia" ? "é a companhia mais usada" : dimensao === "tipo" ? "é o tipo mais comprado" : "é o evento com mais passagens";
  return (
    <p className="m-0">
      <strong className="font-semibold text-foreground">{g.nome}</strong> {quem}: {plural(g.qtde, "passagem", "passagens")}
      {g.media !== null && <>, média <span className="tabular-nums">{moeda(g.media)}</span>{g.min !== g.max && <> (de <span className="tabular-nums">{moeda(g.min)}</span> a <span className="tabular-nums">{moeda(g.max)}</span>)</>}</>}.
    </p>
  );
}

export function ComparacaoDePrecos({ itens, grupos, dimensao, onDimensao, periodo, onPeriodo, tipo, onTipo, tipos }: {
  itens: PrecoDaPassagem[];
  grupos: GrupoDePreco[];
  dimensao: DimensaoDoPreco;
  onDimensao: (d: DimensaoDoPreco) => void;
  periodo: PeriodoDoPreco;
  onPeriodo: (p: PeriodoDoPreco) => void;
  tipo: string;
  onTipo: (t: string) => void;
  tipos: { id: string; nome: string; n: number }[];
}) {
  const [todos, setTodos] = useState(false);
  const total = estatistica(itens);
  const semValor = total.qtde - total.comValor;
  const visiveis = todos ? grupos : grupos.slice(0, LIMITE);
  const escala = Math.max(0, ...visiveis.map((g) => g.max ?? 0));
  const maiorMedia = Math.max(0, ...grupos.map((g) => g.media ?? 0));
  const opcoesDeTipo = [{ id: "all", nome: "Todos os tipos" }, ...tipos.map((t) => ({ id: t.id, nome: ROTULO_TRANSPORTE[t.id] ?? t.nome }))];
  const [um, varios] = UNIDADE[dimensao];

  return (
    <Painel
      testid="comparacao-de-precos"
      titulo="Comparação de preços"
      pergunta="Quantidade, total e valor unitário (médio, mínimo e máximo) das passagens"
      acao={<Segmentado rotulo="Comparar por" valor={dimensao} onChange={onDimensao} opcoes={DIMENSOES_DO_PRECO} testid="precos-dimensao" />}
      resposta={
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="col-span-2 sm:w-[244px]">
              <FiltroDeLista valor={periodo} onChange={(v) => onPeriodo(v as PeriodoDoPreco)} opcoes={PERIODOS_DO_PRECO} testid="precos-periodo" larguraPopover={252} />
            </div>
            <div className="col-span-2 sm:w-[180px]">
              <FiltroDeLista
                valor={tipo}
                onChange={onTipo}
                opcoes={opcoesDeTipo}
                contagens={new Map(tipos.map((t) => [t.id, t.n]))}
                testid="precos-tipo"
                larguraPopover={220}
              />
            </div>
            <p className="col-span-2 m-0 text-2xs text-muted-foreground sm:ml-auto">
              {plural(total.qtde, "passagem", "passagens")} · média <span className="tabular-nums">{moeda(total.media)}</span> · total <span className="tabular-nums">{moeda(total.total)}</span>
            </p>
          </div>
          <Resposta grupos={grupos} dimensao={dimensao} />
        </div>
      }
      rodape={
        <>
          Unidade = a passagem como foi comprada: ida e volta numa compra só (⇄) ou um trecho (→: só ida, só volta, ou a volta de outro tipo — cada trecho no seu tipo, com o seu valor).
          Entram as atuais e as do histórico de troca; período pela data de início do evento.
          {semValor > 0 && <> {plural(semValor, "passagem sem valor conta", "passagens sem valor contam")} na quantidade e fica{semValor === 1 ? "" : "m"} fora de média, mínimo e máximo.</>}
        </>
      }
    >
      {grupos.length === 0 ? null : dimensao === "mes" ? (
        <ul className="m-0 list-none p-0" aria-label="Preço médio por mês da viagem" data-testid="precos-meses">
          {grupos.map((g) => (
            <LinhaDeBarra
              key={g.chave}
              testid={`precos-mes-${g.chave}`}
              rotulo={g.nome}
              pct={largura(g.media, maiorMedia)}
              valor={moeda(g.media)}
              quantidade={plural(g.qtde, "passagem", "passagens")}
              comparavel={g.media !== null}
              title={g.min !== null ? `${g.nome}: de ${moeda(g.min)} a ${moeda(g.max)} · total ${moeda(g.total)}` : undefined}
            />
          ))}
        </ul>
      ) : (
        <>
          <table className="w-full border-collapse text-[13px]" data-testid={`precos-tabela-${dimensao}`}>
            <thead>
              <tr className="text-left text-2xs font-medium text-muted-foreground">
                <th scope="col" className="w-[58%] pb-1.5 pr-3 font-medium sm:w-[40%]">{NOME_DA_COLUNA[dimensao]}</th>
                <th scope="col" className="hidden pb-1.5 pr-3 text-right font-medium sm:table-cell">Qtde</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Médio</th>
                <th scope="col" className="hidden pb-1.5 pr-3 font-medium md:table-cell">Mín – máx</th>
                <th scope="col" className="hidden pb-1.5 text-right font-medium sm:table-cell">Total</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((g) => (
                <tr key={g.chave || "vazio"} className="border-t border-border align-top" data-testid={`precos-${dimensao}-${g.chave || "vazio"}`}>
                  <td className="max-w-0 py-2 pr-3">
                    <span className={cn("block truncate font-medium text-foreground", dimensao === "rota" && /^[A-Z]{3} [⇄→] [A-Z]{3}$/.test(g.nome) && "tracking-[0.04em]")} title={g.nome}>
                      {g.nome}
                    </span>
                    <span className="block text-2xs tabular-nums text-muted-foreground">
                      <span className="sm:hidden">{plural(g.qtde, "passagem", "passagens")}{g.acima > 0 || g.comValor < g.qtde ? " · " : ""}</span>
                      {g.acima > 0 && <span className="font-semibold text-danger">{plural(g.acima, "acima do típico", "acima do típico")}</span>}
                      {g.acima > 0 && g.comValor < g.qtde && " · "}
                      {g.comValor < g.qtde && <>{g.qtde - g.comValor} sem valor</>}
                    </span>
                    {g.min !== null && g.min !== g.max && (
                      <span className="block text-2xs tabular-nums text-muted-foreground md:hidden">de {moeda(g.min)} a {moeda(g.max)}</span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-600 sm:table-cell">{g.qtde.toLocaleString("pt-BR")}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums text-foreground">
                    {moeda(g.media)}                  </td>
                  <td className="hidden py-2 pr-3 md:table-cell"><FaixaDePreco g={g} escala={escala} /></td>
                  <td className="hidden whitespace-nowrap py-2 text-right tabular-nums text-foreground sm:table-cell">{moeda(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {grupos.length > LIMITE && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="mt-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={todos}
              data-testid="precos-todos"
            >
              {todos ? `Mostrar só ${LIMITE}` : `Mostrar ${plural(grupos.length, um, varios)}`}
            </button>
          )}
        </>
      )}
    </Painel>
  );
}

const LIMITE_ACIMA = 8;

export function AcimaDoTipico({ itens, pctDoTeto }: { itens: PassagemAcima[]; pctDoTeto: number }) {
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? itens : itens.slice(0, LIMITE_ACIMA);
  return (
    <Painel
      testid="acima-do-tipico"
      titulo="Muito acima do típico da rota"
      pergunta={`Passagens que passam de ${pctDoTeto}% sobre a mediana da mesma rota e tipo`}
      corpoRente
      resposta={itens.length === 0 ? (
        <p className="m-0 text-muted-foreground">Nenhuma passagem fora da curva neste recorte.</p>
      ) : (
        <p className="m-0">
          <strong className="font-semibold text-danger">{plural(itens.length, "passagem", "passagens")}</strong> acima do teto — vale conferir a justificativa ou a data da compra.
        </p>
      )}
      rodape={<>Típico = mediana de todas as passagens com valor da mesma rota (⇄ ou →) e tipo; só rotas com 3 ou mais. É o mesmo teto da busca de passagens.</>}
    >
      {itens.length > 0 && (
        <>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {visiveis.map(({ item: p, tipico, pctAcima }) => (
              <li key={p.id}>
                <Link
                  href={`/tickets?event=${encodeURIComponent(p.eventId)}${p.inclusionNumber ? `&q=${p.inclusionNumber}` : ""}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2.5 transition-colors hover:bg-surface-muted focus-visible:bg-brand-soft focus-visible:outline-none"
                  data-testid={`acima-${p.id}`}
                  title="Abrir a passagem em Passagens"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">{p.rota?.nome ?? "Rota sem origem/destino"}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                    </span>
                    <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                      {p.eventName}
                      {p.inclusionNumber ? ` · vaga #${p.inclusionNumber}` : ""}
                      {` · ${ROTULO_TRANSPORTE[p.tipo] ?? p.tipo} · ${p.companhiaNome}`}
                      {p.data ? ` · viagem ${dataCurta(p.data)}` : ""}
                      {p.arquivada ? " · histórico de troca" : ""}
                    </span>
                  </span>
                  <span className="text-right leading-tight">
                    <span className="block text-[13px] font-semibold tabular-nums text-danger">{moeda(p.valor)}</span>
                    <span className="block text-2xs tabular-nums text-muted-foreground">+{pctAcima}% · típico {moeda(tipico)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {itens.length > LIMITE_ACIMA && (
            <div className="border-t border-border px-4 pt-2.5">
              <button
                type="button"
                onClick={() => setTodos((v) => !v)}
                className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={todos}
                data-testid="acima-todos"
              >
                {todos ? `Mostrar só ${LIMITE_ACIMA}` : `Mostrar as ${itens.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </Painel>
  );
}
