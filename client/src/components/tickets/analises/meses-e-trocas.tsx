/**
 * Gasto por mês da ida e o custo de mudar: passagens que ficaram no
 * histórico por troca de colaborador e alterações aprovadas que mexeram em
 * passagem já registrada (os avisos para Compras).
 */
import { ArrowLeftRight, CalendarClock } from "lucide-react";
import type { AnaliseDePassagens } from "@shared/analise-de-passagens";
import { largura, moeda, plural } from "./formato";
import { LinhaDeBarra, Painel } from "./partes";

export function GastoPorMes({ meses }: { meses: AnaliseDePassagens["porMes"] }) {
  const maior = Math.max(0, ...meses.map((m) => m.gasto));
  const pico = meses.reduce<AnaliseDePassagens["porMes"][number] | null>((a, m) => (!a || m.gasto > a.gasto ? m : a), null);
  return (
    <Painel
      testid="analise-meses"
      titulo="Gasto por mês da ida"
      pergunta="Passagem e bagagem, pelo mês em que a pessoa viajou"
      resposta={pico && meses.length > 1 ? (
        <p className="m-0">
          O mês com mais gasto foi <strong className="font-semibold text-foreground">{pico.rotulo}</strong>:{" "}
          <span className="tabular-nums">{moeda(pico.gasto)}</span> em {plural(pico.passagens, "passagem", "passagens")}.
        </p>
      ) : meses.length === 0 ? (
        <p className="m-0 text-muted-foreground">Nenhuma passagem com data da ida neste recorte.</p>
      ) : undefined}
    >
      <ul className="m-0 list-none p-0" aria-label="Gasto por mês da ida">
        {meses.map((m) => (
          <LinhaDeBarra
            key={m.mes}
            testid={`mes-${m.mes}`}
            rotulo={m.rotulo}
            pct={largura(m.gasto, maior)}
            valor={moeda(m.gasto)}
            quantidade={plural(m.passagens, "passagem", "passagens")}
          />
        ))}
      </ul>
    </Painel>
  );
}

export function TrocasERemarcacoes({ trocas, remarcacoes }: Pick<AnaliseDePassagens, "trocas" | "remarcacoes">) {
  return (
    <Painel
      testid="analise-trocas"
      titulo="Trocas e remarcações"
      pergunta="Quanto custou mudar depois da compra"
    >
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        <div className="bg-card p-4">
          <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />Ficou em trocas
          </p>
          <p className="m-0 mt-1.5 text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em] text-foreground" data-testid="trocas-gasto">
            {moeda(trocas.gasto)}
          </p>
          <p className="m-0 mt-2 text-xs leading-[18px] text-muted-foreground">
            {trocas.passagens === 0
              ? "Nenhuma passagem foi para o histórico por troca de colaborador."
              : <>{plural(trocas.passagens, "passagem comprada", "passagens compradas")} para quem saiu numa troca aprovada. O custo continua no evento.</>}
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />Remarcações
          </p>
          <p className="m-0 mt-1.5 text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em] text-foreground" data-testid="remarcacoes-total">
            {remarcacoes.total.toLocaleString("pt-BR")}
          </p>
          <p className="m-0 mt-2 text-xs leading-[18px] text-muted-foreground">
            {remarcacoes.total === 0
              ? "Nenhuma alteração aprovada mexeu em passagem já registrada."
              : <>{remarcacoes.total === 1 ? "alteração aprovada mexeu" : "alterações aprovadas mexeram"} em passagem já registrada.</>}
          </p>
          {remarcacoes.total > 0 && (
            <p className="m-0 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className={remarcacoes.pendentes > 0 ? "font-medium text-warning" : "text-muted-foreground"}>
                {plural(remarcacoes.pendentes, "pendente", "pendentes")}
              </span>
              <span className="text-muted-foreground">{plural(remarcacoes.resolvidos, "resolvida", "resolvidas")}</span>
            </p>
          )}
        </div>
      </div>
      <p className="m-0 mt-3 text-2xs leading-4 text-muted-foreground">
        A remarcação conta avisos, não valor: o custo da passagem nova já entra no gasto quando é registrado.
      </p>
    </Painel>
  );
}
