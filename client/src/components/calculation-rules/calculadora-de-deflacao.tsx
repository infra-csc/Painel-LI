/**
 * Calculadora de diárias com deflação (redesenho 08/10). Mesma conta de antes
 * (`calcDeflatedDailies` com os fatores vigentes); agora uma calculadora só,
 * com as funções da casa e do freela agrupadas, a régua dos dias pintada por
 * faixa e a memória de cálculo em linhas.
 */
import { useId, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { calcDeflatedDailies, type DeflationFactors } from "@shared/calculation-rules";
import { cn } from "@/lib/utils";
import { fmt } from "./rgc-ui";
import type { Tarifa } from "./regras-vigentes";

const MIN_DIAS = 1;
const MAX_DIAS = 30;

export function CalculadoraDeDeflacao({ casaRates, freelaRates, factors }: { casaRates: Tarifa[]; freelaRates: Tarifa[]; factors: DeflationFactors }) {
  const ids = useId();
  const [escolha, setEscolha] = useState("casa:0");
  const [dias, setDias] = useState(4);
  const [texto, setTexto] = useState("4");

  const [regime, idxTxt] = escolha.split(":");
  const lista = regime === "freela" ? freelaRates : casaRates;
  const rate = lista[Number(idxTxt)] ?? lista[0];

  const result = useMemo(() => calcDeflatedDailies(rate.cents, dias, factors), [rate, dias, factors]);
  const semDeflacao = rate.cents * dias;

  const definirDias = (n: number) => {
    const v = Math.min(MAX_DIAS, Math.max(MIN_DIAS, Math.round(n) || MIN_DIAS));
    setDias(v);
    setTexto(String(v));
  };

  // Faixa de cada dia (1, 2 ou 3) para a régua.
  const faixaDoDia: number[] = [];
  result.segments.forEach((s, i) => { for (let d = 0; d < s.days; d++) faixaDoDia.push(i + 1); });
  let inicio = 1;
  const linhas = result.segments.map((s, i) => {
    const de = inicio;
    const ate = inicio + s.days - 1;
    inicio = ate + 1;
    return { ...s, de, ate, faixa: i + 1 };
  });

  return (
    <div className="rgc-calc" data-testid="rgc-calculadora">
      <div className="rgc-calc-campos">
        <div className="min-w-0">
          <label htmlFor={`${ids}-funcao`} className="rgc-rotulo">Função</label>
          <select
            id={`${ids}-funcao`}
            value={escolha}
            onChange={e => setEscolha(e.target.value)}
            className="rgc-campo w-full"
            data-testid="rgc-calc-funcao"
          >
            <optgroup label="Time da Casa">
              {casaRates.map((r, i) => <option key={r.funcao} value={`casa:${i}`}>{r.funcao} — {fmt(r.cents)}/dia</option>)}
            </optgroup>
            <optgroup label="Time Freela">
              {freelaRates.map((r, i) => <option key={r.funcao} value={`freela:${i}`}>{r.funcao} — {fmt(r.cents)}/dia</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-dias`} className="rgc-rotulo">Dias com diária</label>
          <div className="rgc-passo">
            <button
              type="button"
              className="rgc-passo-botao pas-alvo"
              onClick={() => definirDias(dias - 1)}
              disabled={dias <= MIN_DIAS}
              aria-label="Um dia a menos"
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <input
              id={`${ids}-dias`}
              type="number"
              inputMode="numeric"
              min={MIN_DIAS}
              max={MAX_DIAS}
              value={texto}
              onChange={e => {
                setTexto(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n)) setDias(Math.min(MAX_DIAS, Math.max(MIN_DIAS, Math.round(n) || MIN_DIAS)));
              }}
              onBlur={() => definirDias(Number(texto))}
              className="rgc-passo-campo"
              aria-describedby={`${ids}-dias-dica`}
              data-testid="rgc-calc-dias"
            />
            <button
              type="button"
              className="rgc-passo-botao pas-alvo"
              onClick={() => definirDias(dias + 1)}
              disabled={dias >= MAX_DIAS}
              aria-label="Um dia a mais"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <p id={`${ids}-dias-dica`} className="m-0 mt-1.5 text-2xs text-muted-foreground">de {MIN_DIAS} a {MAX_DIAS} dias</p>
        </div>
      </div>

      {/* Régua: um traço por dia, pintado pela faixa de deflação. */}
      <div className="rgc-regua" aria-hidden="true">
        {faixaDoDia.map((f, i) => (
          <span key={i} className="rgc-regua-dia" data-faixa={f} title={`${i + 1}º dia`} />
        ))}
      </div>

      <div className="rgc-memoria" aria-live="polite">
        <table className="w-full">
          <caption className="sr-only">Memória de cálculo das diárias</caption>
          <tbody>
            {linhas.map(s => (
              <tr key={s.label} className="rgc-memoria-linha">
                <th scope="row" className="text-left font-normal">
                  <span className="inline-flex items-center gap-2">
                    <span className="rgc-faixa-ponto" data-faixa={s.faixa} aria-hidden="true" />
                    <span className="text-foreground font-medium">{s.de === s.ate ? `${s.de}º dia` : `${s.de}º ao ${s.ate}º dia`}</span>
                    <span className="text-muted-foreground">· {Math.round(s.factor * 100)}%</span>
                  </span>
                </th>
                <td className="text-right text-muted-foreground tabular-nums whitespace-nowrap max-sm:hidden">
                  {s.days} × {fmt(s.dailyCents)}
                </td>
                <td className="text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">{fmt(s.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rgc-memoria-total">
          <p className="rgc-memoria-titulo m-0 text-sm font-semibold text-foreground">Total das diárias</p>
          <p className="rgc-memoria-valor m-0 text-xl font-semibold tabular-nums text-foreground whitespace-nowrap" data-testid="rgc-calc-total">{fmt(result.totalCents)}</p>
          <p className={cn("rgc-memoria-eco m-0 text-xs", result.totalCents !== semDeflacao ? "text-success" : "text-muted-foreground")}>
            {result.totalCents !== semDeflacao
              ? <>Economia da deflação: <span className="tabular-nums font-medium">{fmt(semDeflacao - result.totalCents)}</span> <span className="text-muted-foreground whitespace-nowrap">(sem ela, {fmt(semDeflacao)})</span></>
              : dias <= 4
                ? <>Até o 4º dia a diária é cheia — a deflação começa no 5º.</>
                : <>Com os fatores vigentes, não há desconto.</>}
          </p>
        </div>
      </div>
    </div>
  );
}
