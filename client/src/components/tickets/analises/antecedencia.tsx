/**
 * "Quanto custa comprar em cima da hora?" — preço médio por faixa de dias
 * entre a compra e a ida, a parcela comprada com menos de 14 dias e, quando
 * os nossos números deixam, quanto comprar com 30 dias ou mais economizou.
 */
import type { AnaliseDePassagens } from "@shared/analise-de-passagens";
import { cn } from "@/lib/utils";
import { largura, moeda, plural } from "./formato";
import { LegendaDeDestaque, LinhaDeBarra, Painel } from "./partes";

/**
 * A meta de antecedência do plano (comprar com 30 dias ou mais, 07/10): que
 * parte das compras já chega lá. Barra de progresso simples, sem alvo
 * inventado além dos 30 dias.
 */
function MetaDe30Dias({ faixas, base }: { faixas: AnaliseDePassagens["antecedencia"]["faixas"]; base: number }) {
  const cedo = faixas.filter((f) => f.chave === "30-59" || f.chave === "60+").reduce((s, f) => s + f.passagens, 0);
  const pct = Math.round((cedo / base) * 100);
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2.5" data-testid="meta-30-dias">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-slate-700">Compradas com 30 dias ou mais</span>
        <span className="tabular-nums text-muted-foreground"><strong className="font-semibold text-foreground">{pct}%</strong> · {cedo} de {base}</span>
      </div>
      <span
        role="meter"
        aria-label="Compradas com 30 dias ou mais"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full rounded-full bg-success-strong transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

export function Antecedencia({ antecedencia, minimo, compraDepoisDaIda }: {
  antecedencia: AnaliseDePassagens["antecedencia"];
  minimo: number;
  compraDepoisDaIda: number;
}) {
  const { faixas, base, menosDe14, pctMenosDe14 } = antecedencia;
  const maior = Math.max(0, ...faixas.map((f) => f.media ?? 0));
  const temFraco = faixas.some((f) => f.passagens > 0 && !f.comparavel);

  // Economia de comprar cedo, com os NOSSOS números: 30+ dias × menos de 7.
  const emCimaDaHora = faixas.find((f) => f.chave === "0-6");
  const cedo = faixas.filter((f) => f.chave === "30-59" || f.chave === "60+");
  const cedoComValor = cedo.reduce((s, f) => s + f.comValor, 0);
  const mediaCedo = cedoComValor > 0 ? Math.round(cedo.reduce((s, f) => s + f.totalPassagem, 0) / cedoComValor) : null;
  const economia = emCimaDaHora && emCimaDaHora.comValor >= minimo && emCimaDaHora.media !== null && mediaCedo !== null && cedoComValor >= minimo
    ? emCimaDaHora.media - mediaCedo
    : null;

  return (
    <Painel
      testid="analise-antecedencia"
      titulo="Antecedência da compra"
      pergunta="Quanto custa comprar em cima da hora — dias entre a compra e a ida"
      resposta={base === 0 ? (
        <p className="m-0 text-muted-foreground">Nenhuma passagem com data da compra e da ida neste recorte.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <p className="m-0 flex items-baseline gap-2">
            <span className={cn("text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em]", (pctMenosDe14 ?? 0) >= 50 ? "text-warning" : "text-foreground")} data-testid="pct-menos-14">
              {pctMenosDe14}%
            </span>
            <span className="text-xs leading-4 text-slate-600">
              compradas com menos de 14 dias
              <span className="block text-muted-foreground">{menosDe14} de {plural(base, "passagem", "passagens")}</span>
            </span>
          </p>
          {economia !== null && economia > 0 && (
            <p className="m-0 min-w-0 flex-1 basis-[220px] text-[13px] leading-5 text-slate-700" data-testid="economia-antecedencia">
              Comprar com 30 dias ou mais saiu <strong className="font-semibold tabular-nums text-success">{moeda(economia)} mais barato</strong> por passagem do que com menos de 7.
            </p>
          )}
        </div>
      )}
      rodape={
        <>
          Mais caro e mais barato só entre faixas com {minimo} ou mais passagens com valor.
          {compraDepoisDaIda > 0 && <> {plural(compraDepoisDaIda, "passagem tem", "passagens têm")} a data da compra depois da ida e fica{compraDepoisDaIda === 1 ? "" : "m"} de fora.</>}
        </>
      }
    >
      <ul className="m-0 list-none p-0" aria-label="Preço médio por antecedência da compra">
        {faixas.map((f) => (
          <LinhaDeBarra
            key={f.chave}
            testid={`faixa-${f.chave}`}
            rotulo={f.rotulo}
            rotuloCurto={f.chave === "0-6" ? "< 7 dias" : f.chave === "60+" ? "60+ dias" : `${f.chave.replace("-", " a ")} dias`}
            pct={largura(f.media, maior)}
            valor={f.media === null ? "—" : moeda(f.media)}
            quantidade={plural(f.comValor, "passagem", "passagens")}
            destaque={f.destaque}
            comparavel={f.comparavel}
          />
        ))}
      </ul>
      <LegendaDeDestaque minimo={minimo} mostrarFraco={temFraco} />
      {base > 0 && <MetaDe30Dias faixas={faixas} base={base} />}
    </Painel>
  );
}
