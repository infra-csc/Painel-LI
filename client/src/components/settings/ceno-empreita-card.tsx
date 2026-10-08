// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// "Cenotécnicos empreita — valor fechado por dias" (4 modalidades × 2..6 dias).
// Calcula o incremento ao vivo com `form.watch` por linha.
//
// 08/10 — vira uma grade de verdade: modalidade na linha, dias na coluna e o
// incremento no fim (o mesmo desenho da tabela do slide). Na largura estreita
// (medida pelo grupo) cada modalidade vira um cartão com os rótulos dos dias.
import type { UseFormReturn } from "react-hook-form";
import { CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, CENO_EMPREITA_TABLE_DAYS } from "@shared/cenotecnica-empreita";
import { formatarMoedaReais } from "@/lib/format";
import { parseBrNumber } from "@/lib/utils";
import { GrupoDeAjustes, MoneyField } from "./settings-fields";
import { cenoEmpreitaKey, type FormValues } from "./settings-schema";
import { ancoraDaSecao } from "./settings-secoes";

export interface CenoEmpreitaCardProps {
  form: UseFormReturn<FormValues>;
  alteradas?: number;
}

export function CenoEmpreitaCard({ form, alteradas = 0 }: CenoEmpreitaCardProps) {
  return (
    <GrupoDeAjustes
      id={ancoraDaSecao("cenotecnicos")}
      titulo="Cenotécnicos empreita"
      descricao={<>Valor <strong className="font-semibold text-foreground">fechado</strong> pelo total de dias trabalhados — não é diária × dias e <strong className="font-semibold text-foreground">não sofre deflação</strong>. A modalidade é escolhida na Escalação, por vaga.</>}
      alteradas={alteradas}
      data-testid="cfg-grupo-cenotecnicos"
    >
      <div className="cfg-empreita" role="group" aria-label="Valor fechado por modalidade e número de dias">
        <div className="cfg-empreita-cabeca" aria-hidden="true">
          <span>Modalidade</span>
          {CENO_EMPREITA_TABLE_DAYS.map(d => <span key={d} className="text-right">{d} dias</span>)}
          <span className="text-right">Incremento</span>
        </div>
        {CENO_FREELA_TIPOS.map(tipo => {
          // Incremento usado quando os dias caem fora de 2–6: (6 dias − 2 dias) / 4,
          // calculado ao vivo com o que está digitado na linha.
          const v2 = parseBrNumber(form.watch(cenoEmpreitaKey(tipo, 2)) || "0");
          const v6 = parseBrNumber(form.watch(cenoEmpreitaKey(tipo, 6)) || "0");
          const incremento = (v6 - v2) / 4;
          const textoIncremento = Number.isFinite(incremento) ? formatarMoedaReais(incremento) : "—";
          return (
            <div key={tipo} className="cfg-empreita-linha" data-testid={`cfg-empreita-${tipo}`}>
              <p className="cfg-empreita-nome m-0 text-sm font-medium text-foreground">{CENO_FREELA_TIPO_LABELS[tipo]}</p>
              {CENO_EMPREITA_TABLE_DAYS.map(dias => (
                <MoneyField
                  key={dias}
                  control={form.control}
                  name={cenoEmpreitaKey(tipo, dias)}
                  label={`${dias} dias`}
                  rotuloAcessivel={`${CENO_FREELA_TIPO_LABELS[tipo]}, ${dias} dias`}
                  rotuloOculto
                />
              ))}
              <p className="cfg-empreita-inc m-0" title="Somado por dia fora da faixa de 2 a 6 dias">
                <span className="cfg-empreita-inc-rotulo text-2xs text-muted-foreground">Incremento por dia fora de 2–6</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">{textoIncremento}</span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="cfg-nota">
        Fora da faixa de 2 a 6 dias o sistema extrapola pelo incremento da própria linha: (6 dias − 2 dias) ÷ 4. Cenotécnico de casa (CLT) continua sem diária; alimentação e mobilidade seguem as regras normais e ficam fora do valor fechado.
      </p>
    </GrupoDeAjustes>
  );
}
