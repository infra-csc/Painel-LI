/**
 * Aba PAGO × ENCONTRADO (etapa 2, 09/10): para cada passagem registrada pelo
 * "Usar este voo", o valor PAGO contra o MENOR preço encontrado na mesma rota
 * e data (de qualquer consulta) e contra o TÍPICO da rota — e a ECONOMIA
 * GERADA PELA BUSCA, acumulada mês a mês. Recortes por evento, companhia e
 * quem registrou; a lista das compras no fim, como prova.
 */
import { useState } from "react";
import { Scale, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/format";
import type { GrupoPagoXEncontrado } from "@shared/analise-da-busca";
import { Painel, Numero, Segmentado } from "@/components/tickets/analises/partes";
import { moeda, plural } from "@/components/tickets/analises/formato";
import { ddmm } from "../formato";
import type { PeriodoDaAnalise } from "../filtros-da-busca";
import { usePagoXEncontrado } from "./use-analises-da-busca";
import { AvisoDeAmostra, ErroDaAnalise, EsqueletoDaAnalise, EstadoDaAnalise, Fonte, Pct, ROTULO_DO_PERIODO, TopoDaAnalise } from "./moldura";

type Recorte = "evento" | "companhia" | "quem";
const RECORTES = [["evento", "Evento"], ["companhia", "Companhia"], ["quem", "Quem registrou"]] as const;
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const sinal = (c: number) => (c > 0 ? `+${moeda(c)}` : c < 0 ? `−${moeda(Math.abs(c))}` : moeda(0));

function Grupos({ grupos }: { grupos: GrupoPagoXEncontrado[] }) {
  if (grupos.length === 0) return <p className="m-0 px-4 py-6 text-center text-sm text-muted-foreground">Nada com valor pago neste recorte.</p>;
  return (
    <div role="table" aria-label="Pago contra o menor encontrado" className="text-[13px]">
      <div role="row" className="bpa-grupo bpa-grupo-cabeca">
        <span role="columnheader">Nome</span>
        <span role="columnheader" className="text-right">Compras</span>
        <span role="columnheader" className="bpa-grupo-opc text-right">Pago</span>
        <span role="columnheader" className="bpa-grupo-opc text-right">Menor</span>
        <span role="columnheader" className="text-right">Diferença</span>
      </div>
      {grupos.map((g) => (
        <div role="row" key={g.chave || g.nome} className="bpa-grupo">
          <span role="cell" className="truncate font-medium text-foreground">{toTitleCase(g.nome)}</span>
          <span role="cell" className="text-right tabular-nums text-slate-700">{g.n}</span>
          <span role="cell" className="bpa-grupo-opc text-right tabular-nums text-slate-700">{moeda(g.pago)}</span>
          <span role="cell" className="bpa-grupo-opc text-right tabular-nums text-slate-600">{moeda(g.menor)}</span>
          <span role="cell" className="text-right tabular-nums">
            <span className={cn("font-semibold", g.diferenca > 0 ? "text-danger" : g.diferenca < 0 ? "text-success" : "text-foreground")}>{sinal(g.diferenca)}</span>
            <span className="block text-2xs"><Pct valor={g.diferencaPct} /></span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function AbaPagoXEncontrado({ periodo, onPeriodo, onIrParaBuscar }: { periodo: PeriodoDaAnalise; onPeriodo: (p: PeriodoDaAnalise) => void; onIrParaBuscar: () => void }) {
  const q = usePagoXEncontrado(periodo);
  const [recorte, setRecorte] = useState<Recorte>("evento");
  const [todas, setTodas] = useState(false);
  const r = q.data;
  const atualizando = q.isFetching && !!r;
  const topo = <TopoDaAnalise pergunta="Quanto se pagou contra o menor preço encontrado na mesma rota e data — e quanto a busca fez economizar contra o preço típico." periodo={periodo} onPeriodo={onPeriodo} atualizando={atualizando} />;
  if (q.isError && !r) return <div className="flex flex-col gap-4">{topo}<ErroDaAnalise erro={q.error} onTentar={() => q.refetch()} /></div>;
  if (!r) return <div className="flex flex-col gap-4">{topo}<EsqueletoDaAnalise /></div>;
  if (r.usos === 0) {
    return (
      <div className="flex flex-col gap-4">
        {topo}
        <EstadoDaAnalise testid="pago-vazio" icone={<Scale className="h-5 w-5" />} titulo="Nenhuma passagem comprada pela busca"
          texto={<>Aqui entram as passagens registradas pelo “Usar este voo” {ROTULO_DO_PERIODO[periodo]}: o preço encontrado fica ligado ao valor pago.</>}
          acao={<>
            {periodo !== "tudo" && <Button variant="outline" className="rounded-lg" onClick={() => onPeriodo("tudo")}>Ver todo o histórico</Button>}
            <Button variant="outline" className="rounded-lg" onClick={onIrParaBuscar}><Search className="mr-1.5 h-4 w-4" aria-hidden="true" />Ir para Buscar</Button>
          </>} />
      </div>
    );
  }
  const t = r.totais;
  const pctTotal = t.menor > 0 ? Math.round((t.diferenca / t.menor) * 100) : null;
  const nomeDoMes = MESES_LONGOS[Number(r.mesAtual.mes.slice(5, 7)) - 1];
  const grupos = recorte === "evento" ? r.porEvento : recorte === "companhia" ? r.porCompanhia : r.porQuem;
  const maiorMes = Math.max(1, ...r.porMes.map((m) => Math.abs(m.economia)));
  const linhas = todas ? r.linhas : r.linhas.slice(0, 10);
  return (
    <div className={cn("flex flex-col gap-4 transition-opacity duration-200", atualizando && "opacity-60")} data-testid="aba-pago-x-encontrado">
      {topo}
      {t.n < 10 && <AvisoDeAmostra>Amostra pequena: {plural(t.n, "compra", "compras")} com valor pago {ROTULO_DO_PERIODO[periodo]}. Os totais ainda dependem de poucos casos.</AvisoDeAmostra>}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <Numero testid="kpi-diferenca" rotulo="Pago acima do menor" valor={sinal(t.diferenca)} sub={`${pctTotal === null ? "—" : `${pctTotal}%`} sobre ${plural(t.n, "compra", "compras")}`} tom={t.diferenca > 0 ? "alerta" : undefined} />
        <Numero testid="kpi-acima" rotulo="Compras acima do menor" valor={`${t.acimaDoMenor} de ${t.n}`} sub="o menor estava na mesma rota e data" />
        <Numero testid="kpi-economia" rotulo="Economia gerada pela busca" valor={sinal(t.economia)} tom={t.economia < 0 ? "alerta" : undefined} sub={t.comTipico ? `contra o típico da rota · ${plural(t.comTipico, "compra", "compras")}` : "falta típico das rotas"} />
        <Numero testid="kpi-mes" rotulo={`Em ${nomeDoMes}`} valor={r.mesAtual.n ? sinal(r.mesAtual.diferenca) : "—"} sub={r.mesAtual.n ? `${plural(r.mesAtual.n, "compra", "compras")} · economia ${sinal(r.mesAtual.economia)}` : "nenhuma compra pela busca ainda"} />
      </div>
      {r.semValorPago > 0 && (
        <p className="m-0 text-xs text-muted-foreground" data-testid="sem-valor-pago">{plural(r.semValorPago, "uso", "usos")} do “Usar este voo” sem valor pago na passagem — fica{r.semValorPago === 1 ? "" : "m"} fora das contas até o valor ser preenchido.</p>
      )}

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">
        <Painel
          testid="economia-por-mes"
          titulo="Economia gerada pela busca"
          pergunta="Preço típico da rota menos o que se pagou, mês a mês, com o acumulado"
          acao={<Fonte tipo="estimado" className="mt-0.5" />}
          resposta={<p className="m-0">No acumulado, pagou-se <strong className={cn("font-semibold tabular-nums", t.economia >= 0 ? "text-success" : "text-danger")}>{moeda(Math.abs(t.economia))} {t.economia >= 0 ? "abaixo" : "acima"}</strong> do que essas rotas costumam custar{t.economia < 0 ? " — a busca ainda não compensou nestas compras" : ""}.</p>}
          rodape="Típico = mediana dos menores preços consultados na rota. Positivo = pagou menos do que a rota costuma custar."
        >
          {r.porMes.length === 0 ? <p className="m-0 py-4 text-center text-sm text-muted-foreground">Sem compras com valor pago.</p> : (
            <ul className="m-0 list-none p-0">
              {r.porMes.map((m) => (
                <li key={m.mes} className="bpa-mes">
                  <span className="text-[13px] text-slate-700">{m.rotulo}</span>
                  <span aria-hidden="true" className="bpa-divergente"><span className={cn("bpa-divergente-barra", m.economia >= 0 ? "bg-success-strong/70" : "bg-danger-strong/70")} style={m.economia >= 0 ? { left: "50%", width: `${(Math.abs(m.economia) / maiorMes) * 50}%` } : { right: "50%", width: `${(Math.abs(m.economia) / maiorMes) * 50}%` }} /></span>
                  <span className={cn("text-right text-[13px] font-semibold tabular-nums", m.economia >= 0 ? "text-success" : "text-danger")}>{sinal(m.economia)}</span>
                  <span className="text-right text-2xs tabular-nums text-muted-foreground">acum. {sinal(m.economiaAcumulada)}</span>
                </li>
              ))}
            </ul>
          )}
        </Painel>
        <Painel testid="pago-por-recorte" titulo="Onde se pagou acima" pergunta="Pago contra o menor encontrado, por recorte" corpoRente
          acao={<Segmentado valor={recorte} opcoes={RECORTES} onChange={setRecorte} rotulo="Recorte" testid="recorte-pago" />}>
          <Grupos grupos={grupos} />
        </Painel>
      </div>

      <Painel testid="compras-pela-busca" titulo="Compras pela busca" pergunta="Cada “Usar este voo” que virou passagem, do mais recente ao mais antigo" corpoRente
        rodape="Encontrado = o voo escolhido na busca. Menor = o menor preço visto na mesma rota e data, em qualquer consulta.">
        <div role="table" aria-label="Compras pela busca" className="text-[13px]">
          <div role="row" className="bpa-compra bpa-compra-cabeca">
            <span role="columnheader">Quando · rota</span>
            <span role="columnheader" className="bpa-compra-opc">Evento · quem</span>
            <span role="columnheader" className="text-right">Encontrado</span>
            <span role="columnheader" className="text-right">Menor</span>
            <span role="columnheader" className="text-right">Pago</span>
            <span role="columnheader" className="text-right">Diferença</span>
          </div>
          {linhas.map((l) => (
            <div role="row" key={l.id} className="bpa-compra" data-testid={`compra-${l.id}`}>
              <span role="cell" className="min-w-0">
                <span className="block font-mono text-[13px] font-semibold tabular-nums text-foreground">{l.rota}</span>
                <span className="block text-2xs text-muted-foreground">registrada {ddmm(l.dia)}{l.dataVoo ? ` · voo ${ddmm(l.dataVoo)}` : ""}{l.companhia ? ` · ${l.companhia}` : ""}</span>
              </span>
              <span role="cell" className="bpa-compra-opc min-w-0 text-xs text-slate-600"><span className="block truncate">{l.eventName ?? "—"}</span><span className="block truncate text-2xs text-muted-foreground">{toTitleCase(l.usuarioNome)}</span></span>
              <span role="cell" className="text-right tabular-nums text-slate-700">{moeda(l.precoEncontrado)}</span>
              <span role="cell" className="text-right tabular-nums text-success"><span className="mr-1 text-2xs text-muted-foreground min-[900px]:hidden">menor</span>{moeda(l.menorEncontrado)}</span>
              <span role="cell" className="text-right font-semibold tabular-nums text-foreground"><span className="mr-1 text-2xs font-normal text-muted-foreground min-[900px]:hidden">pago</span>{l.valorPago === null ? <span className="font-normal text-muted-foreground">sem valor</span> : moeda(l.valorPago)}</span>
              <span role="cell" className="text-right tabular-nums">{l.diferenca === null ? "—" : <span className={cn("font-semibold", l.diferenca > 0 ? "text-danger" : l.diferenca < 0 ? "text-success" : "text-foreground")}>{sinal(l.diferenca)}</span>}</span>
            </div>
          ))}
        </div>
        {r.linhas.length > 10 && (
          <div className="px-4 pt-2">
            <button type="button" onClick={() => setTodas((v) => !v)} className="h-8 rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft">
              {todas ? "Mostrar só as 10 mais recentes" : `Ver todas as ${r.linhas.length} compras`}
            </button>
          </div>
        )}
      </Painel>
    </div>
  );
}
