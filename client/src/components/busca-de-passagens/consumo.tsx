/**
 * Consumo da busca (09/10).
 *  - `ConsumoNaBarra`: "312 de 1.000 no mês" com o medidor fino, na barra da
 *    tela — só quando passa de 80% (para todos: é aviso, não enfeite);
 *  - `ConsumoNoRodape`: a mesma conta, discreta, embaixo da lista (só admin).
 *  - `AbaConsumo` (só admin): mês corrente, projeção contra o teto, quanto o
 *    cache poupou, últimos 6 meses e quem consultou — com as peças da aba
 *    Análises de Passagens (Painel, Numero, LinhaDeBarra).
 */
import { useState } from "react";
import { Gauge, Loader2, Pencil, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { situacaoDoTeto, type ConsumoDaBusca } from "@shared/busca-de-passagens";
import { rotuloDoMes } from "@shared/consumo-da-busca";
import { Painel, Numero, LinhaDeBarra } from "@/components/tickets/analises/partes";
import { useAlterarTeto, useDetalheDoConsumo } from "./use-busca-de-passagens";
import { plural } from "./formato";

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nMil = (n: number) => n.toLocaleString("pt-BR");

export function ConsumoNoRodape({ consumo, mes }: { consumo: ConsumoDaBusca | undefined; mes: string }) {
  if (!consumo) return null;
  const situacao = situacaoDoTeto(consumo.usadas, consumo.teto);
  const pct = consumo.teto > 0 ? Math.min(100, (consumo.usadas / consumo.teto) * 100) : 100;
  const nomeDoMes = MESES_LONGOS[Number(mes.slice(5, 7)) - 1] ?? "";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-xs text-muted-foreground" data-testid="consumo-no-rodape">
      <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="tabular-nums"><span className="font-semibold text-foreground">{nMil(consumo.usadas)} de {nMil(consumo.teto)}</span> consultas em {nomeDoMes}</span>
      <span className="pas-bp-medidor w-28" data-situacao={situacao} aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      <span>Rotas iguais nas últimas {consumo.cacheHoras} h vêm do cache e não contam.</span>
    </div>
  );
}

export function ConsumoNaBarra({ consumo, mes }: { consumo: ConsumoDaBusca | undefined; mes: string }) {
  if (!consumo) return null;
  const situacao = situacaoDoTeto(consumo.usadas, consumo.teto);
  if (situacao === "ok") return null;
  const pct = consumo.teto > 0 ? Math.min(100, (consumo.usadas / consumo.teto) * 100) : 100;
  const nomeDoMes = MESES_LONGOS[Number(mes.slice(5, 7)) - 1] ?? "";
  return (
    <div
      className={`flex min-w-0 shrink-0 flex-col justify-center gap-1 ${situacao === "atingido" ? "text-danger-strong" : situacao === "alerta" ? "text-warning-strong" : "text-slate-600"}`}
      title={`Consultas reais ao fornecedor neste mês (o cache não conta). Teto: ${nMil(consumo.teto)}.`}
      data-testid="consumo-na-barra"
    >
      <span className="whitespace-nowrap text-xs font-medium tabular-nums">
        <Gauge className="mr-1 inline h-3.5 w-3.5 -translate-y-px" aria-hidden="true" />
        {nMil(consumo.usadas)} de {nMil(consumo.teto)}<span className="hidden 2xl:inline"> consultas em {nomeDoMes}</span><span className="2xl:hidden"> no mês</span>
      </span>
      <span className="pas-bp-medidor w-full min-w-[96px]" data-situacao={situacao} aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

function EditarTeto({ teto }: { teto: number }) {
  const { toast } = useToast();
  const alterar = useAlterarTeto();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(teto));
  if (!editando) {
    return (
      <button type="button" onClick={() => { setValor(String(teto)); setEditando(true); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-slate-700 hover:bg-muted" data-testid="editar-teto">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />Alterar teto
      </button>
    );
  }
  const n = Number(valor);
  const ok = Number.isInteger(n) && n >= 0;
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        alterar.mutate(n, {
          onSuccess: () => { toast({ title: "Teto atualizado", description: `${nMil(n)} consultas por mês.` }); setEditando(false); },
          onError: (err) => toast({ title: "Não foi possível salvar", description: apiErrorMessage(err, "Tente de novo."), variant: "destructive" }),
        });
      }}
    >
      <input value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Teto mensal de consultas" autoFocus className="h-8 w-24 rounded-lg border border-border bg-card px-2 text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/12" />
      <Button type="submit" size="sm" disabled={!ok || alterar.isPending} className="h-8 rounded-lg">{alterar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Salvar"}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)} className="h-8 rounded-lg">Cancelar</Button>
    </form>
  );
}

export function AbaConsumo() {
  const q = useDetalheDoConsumo(true);
  if (q.isLoading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Carregando o consumo…</span>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2 bg-card px-4 py-3.5"><div className="pas-osso h-3 w-24" /><div className="pas-osso h-6 w-20" /><div className="pas-osso h-3 w-32" /></div>)}
        </div>
        <div className="pas-osso h-56 rounded-xl" aria-hidden="true" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div role="alert" className="flex flex-col items-center rounded-xl border border-danger/25 bg-card px-6 py-12 text-center">
        <p className="m-0 text-base font-semibold text-foreground">Não foi possível carregar o consumo</p>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{apiErrorMessage(q.error, "Verifique a conexão e tente de novo.")}</p>
        <Button variant="outline" onClick={() => q.refetch()} className="mt-4 rounded-lg"><RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
      </div>
    );
  }
  const d = q.data;
  const m = d.mesAtual;
  const maiorMes = Math.max(1, ...d.porMes.map((x) => x.reais + x.cache));
  const maiorUsuario = Math.max(1, ...d.porUsuario.map((x) => x.reais + x.cache));
  const ultrapassa = m.projecao > m.teto;
  const nomeDoMes = MESES_LONGOS[Number(m.mes.slice(5, 7)) - 1];
  return (
    <div className="flex flex-col gap-4" data-testid="aba-consumo">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        <Numero rotulo={`Consultas em ${nomeDoMes}`} valor={`${nMil(m.reais)} / ${nMil(m.teto)}`} sub={m.links ? `${plural(m.links, "link de compra", "links de compra")} incluídos` : "consultas reais ao fornecedor"} tom={m.situacao !== "ok" ? "alerta" : undefined} testid="consumo-mes" />
        <Numero rotulo="Projeção do mês" valor={nMil(m.projecao)} sub={ultrapassa ? `passa do teto no ritmo atual (dia ${m.diaDoMes} de ${m.diasNoMes})` : `dentro do teto (dia ${m.diaDoMes} de ${m.diasNoMes})`} tom={ultrapassa ? "alerta" : undefined} />
        <Numero rotulo="Atendido pelo cache" valor={m.taxaCache === null ? "—" : `${Math.round(m.taxaCache * 100)}%`} sub={m.cache ? `${plural(m.cache, "resultado entregue", "resultados entregues")} sem gastar` : `ninguém reaproveitou uma busca ainda (cache de ${d.cacheHoras} h)`} />
        <Numero rotulo="Fornecedor" valor={d.fornecedor ? (d.fornecedor.simulado ? "Simulado" : "Ignav") : "Não configurado"} sub={d.fornecedor ? (d.fornecedor.simulado ? "preços fictícios (sem a chave)" : "LATAM, GOL e Azul · US$ 2 a cada mil após as grátis") : "falta o Secret IGNAV_API_KEY"} tom={!d.fornecedor ? "alerta" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Consultas por mês"
          pergunta="Quantas consultas de verdade e quantas o cache poupou — últimos 6 meses"
          acao={<EditarTeto teto={m.teto} />}
          resposta={m.reais === 0 && d.porMes.every((x) => x.reais === 0) ? "Ainda sem consultas — os números aparecem depois da primeira busca." : undefined}
          testid="consumo-por-mes"
        >
          <ul className="m-0 list-none p-0">
            {d.porMes.map((x) => (
              <LinhaDeBarra
                key={x.mes}
                rotulo={rotuloDoMes(x.mes)}
                pct={Math.round(((x.reais) / maiorMes) * 100)}
                valor={nMil(x.reais)}
                quantidade={x.cache ? `+${nMil(x.cache)} do cache` : "—"}
                destaque={x.mes === m.mes && m.situacao !== "ok" ? "caro" : null}
              />
            ))}
          </ul>
        </Painel>

        <Painel titulo="Quem consultou" pergunta={`Consultas reais e resultados do cache por pessoa em ${nomeDoMes}`} testid="consumo-por-usuario">
          {d.porUsuario.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-muted-foreground">Ninguém buscou preços neste mês ainda.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {d.porUsuario.map((u) => (
                <LinhaDeBarra
                  key={u.usuarioId ?? "removido"}
                  rotulo={u.nome}
                  rotuloCurto={u.nome.split(" ")[0]}
                  pct={Math.round((u.reais / maiorUsuario) * 100)}
                  valor={nMil(u.reais)}
                  quantidade={u.cache ? `+${nMil(u.cache)} do cache` : "—"}
                />
              ))}
            </ul>
          )}
        </Painel>
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        Conta no teto toda consulta que vai ao fornecedor (preços e links de compra). Resultado do cache — a mesma rota buscada por outra pessoa nas últimas {d.cacheHoras} h — não conta. No teto, a busca para até o dia 1º ou até o teto ser aumentado.
      </p>
    </div>
  );
}

/** Abas de análise que chegam na próxima etapa: estado vazio honesto. */
export function AbaEmConstrucao({ titulo, pergunta }: { titulo: string; pergunta: string }) {
  return (
    <div className="pas-entra flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="aba-em-construcao">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-primary" aria-hidden="true"><Gauge className="h-5 w-5" /></span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">{pergunta}</p>
      <p className="m-0 mt-3 max-w-[460px] text-xs leading-relaxed text-muted-foreground">
        Em construção — as análises completas chegam na próxima etapa. Cada consulta feita a partir de hoje já fica guardada (rota, data do voo, quando foi consultada, companhias, horários e preços) para alimentar esta aba.
      </p>
    </div>
  );
}
