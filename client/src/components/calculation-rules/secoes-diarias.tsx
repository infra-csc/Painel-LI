/**
 * Diárias (redesenho 08/10): tabela da casa, regra do freela e deflação por
 * período com a calculadora. Regras de `shared/calculation-rules.ts`
 * (casaDailyCents, freelaDailyCents, regraDiariaPorTipo, calcDeflatedDailies).
 */
import { Secao, Tabela, Valor, Regras } from "./rgc-ui";
import { CalculadoraDeDeflacao } from "./calculadora-de-deflacao";
import type { RegrasVigentes } from "./regras-vigentes";

const pct = (f: number) => `${Math.round(f * 100)}%`;

export function SecaoDiariaCasa({ r }: { r: RegrasVigentes }) {
  return (
    <Secao
      id="diaria-casa"
      grupo="Diárias"
      titulo="Time da Casa"
      fonte="editavel"
      lede="Valor por dia, pelo grupo da função. Quem é CLT já é assalariado no dia útil: recebe diária só no fim de semana."
    >
      <Tabela
        legenda="Diárias do Time da Casa por função"
        testid="rgc-tabela-casa"
        colunas={[{ rotulo: "Função" }, { rotulo: "Valor por dia", numero: true, largura: "9.5rem" }]}
        linhas={r.casaRates.map(t => ({ chave: t.funcao, celulas: [t.funcao, <Valor key="v" cents={t.cents} padraoCents={t.padraoCents} />] }))}
      />
      <Regras
        itens={[
          { chave: "clt", titulo: "CLT (casa)", texto: "diária só em sábado e domingo; no dia útil, zero." },
          { chave: "local", titulo: "Produção local", texto: "a mesma tabela, em todos os dias do período." },
          { chave: "ceno", titulo: "Cenotécnica da casa", texto: "não recebe diária, nem no fim de semana. Sup Ceno conta como Produtor." },
          { chave: "atend", titulo: "Atendimento", texto: "Key Account ou Executivo de Contas, escolhido vaga por vaga na Escalação." },
          { chave: "outras", titulo: "Outras funções", texto: "fora destes grupos, vale a diária cadastrada na função (ou, sem ela, a da vaga)." },
        ]}
      />
    </Secao>
  );
}

export function SecaoDiariaFreela({ r }: { r: RegrasVigentes }) {
  return (
    <Secao
      id="diaria-freela"
      grupo="Diárias"
      titulo="Time Freela"
      fonte="editavel"
      lede="A diária do freela não é por função: são três valores. “Em viagem” é a vaga que tem passagem."
    >
      <Tabela
        legenda="Diárias do Time Freela"
        testid="rgc-tabela-freela"
        colunas={[{ rotulo: "Função" }, { rotulo: "Valor por dia", numero: true, largura: "9.5rem" }]}
        linhas={r.freelaRates.map(t => ({ chave: t.funcao, celulas: [t.funcao, <Valor key="v" cents={t.cents} padraoCents={t.padraoCents} />] }))}
      />
      <Regras
        itens={[
          { chave: "dias", titulo: "Dias", texto: "diária em todos os dias do período." },
          { chave: "atend", titulo: "Atendimento", texto: "com o tipo escolhido na Escalação, vale a tarifa de Key Account ou de Executivo de Contas." },
          { chave: "alim", titulo: "Alimentação", texto: "o freela não recebe — o cachê já cobre a refeição." },
        ]}
      />
    </Secao>
  );
}

export function SecaoDeflacao({ r }: { r: RegrasVigentes }) {
  const faixas = [
    { faixa: 1, dias: "1º ao 4º dia", fator: r.factors.ate4 },
    { faixa: 2, dias: "5º ao 8º dia", fator: r.factors.d5a8 },
    { faixa: 3, dias: "9º dia ou mais", fator: r.factors.d9mais },
  ];
  return (
    <Secao
      id="deflacao"
      grupo="Diárias"
      titulo="Deflação por período"
      fonte="editavel"
      lede="Aplicada dia a dia sobre a diária — não sobre o total — na casa e no freela. Empreita e percurseiro não têm deflação."
    >
      <ol className="rgc-faixas m-0 p-0 list-none" aria-label="Faixas de deflação vigentes" data-testid="rgc-faixas">
        {faixas.map(f => (
          <li key={f.faixa} className="rgc-faixa-item" data-faixa={f.faixa}>
            <span className="text-xs text-muted-foreground">{f.dias}</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground leading-8">{pct(f.fator)}</span>
            <span className="text-2xs text-muted-foreground">da diária</span>
          </li>
        ))}
      </ol>
      <CalculadoraDeDeflacao casaRates={r.casaRates} freelaRates={r.freelaRates} factors={r.factors} />
    </Secao>
  );
}
