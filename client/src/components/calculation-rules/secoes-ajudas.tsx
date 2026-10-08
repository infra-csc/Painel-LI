/**
 * Ajudas de custo (redesenho 08/10): alimentação, mobilidade e o deslocamento
 * em dias adicionais do freela. Regras de `shared/alimentacao.ts`
 * (calcAlimentacao, refeicaoCentsDia) e `shared/atendimento.ts`
 * (mobilidadeTrechoComLocalCents).
 */
import { Info } from "lucide-react";
import { MOBILITY_2026, FREELA_EXTRA_DAY_ALLOWANCE } from "@shared/calculation-rules";
import { MOBILIDADE_TRECHO_PADRAO_CENTS, MOBILIDADE_TRECHO_MADRUGADA_CENTS } from "@shared/atendimento";
import { Secao, Tabela, Valor, Regras, Nota, Subtitulo, fmt, type Linha } from "./rgc-ui";
import type { RefeicaoLinha, RegrasVigentes } from "./regras-vigentes";

function linhasDeRefeicao(rows: RefeicaoLinha[]): Linha[] {
  return rows.map(f => ({
    chave: f.refeicao,
    celulas: [
      f.refeicao,
      <Valor key="d" cents={f.demaisCents} padraoCents={f.demaisPadrao} />,
      <Valor key="c" cents={f.cenotecnicaCents} padraoCents={f.cenotecnicaPadrao} />,
      <Valor key="g" cents={f.gestaoCents} padraoCents={f.gestaoPadrao} />,
    ],
  }));
}

export function SecaoAlimentacao({ r }: { r: RegrasVigentes }) {
  const demais = r.food.jornadaExterna[0]?.demaisCents;
  const gestao = r.food.jornadaExterna[0]?.gestaoCents;
  return (
    <Secao
      id="alimentacao"
      grupo="Ajudas de custo"
      titulo="Alimentação"
      fonte="editavel"
      lede="Valor por refeição, pelo perfil da função. Quais refeições entram depende de a pessoa voar e dos horários da passagem."
    >
      <Tabela
        legenda="Valor por refeição"
        cartao
        testid="rgc-tabela-alimentacao"
        colunas={[
          { rotulo: "Refeição" },
          { rotulo: "Demais", numero: true, largura: "16%" },
          { rotulo: "Cenotécnica", numero: true, largura: "16%" },
          { rotulo: "Key Account / Gerente", curto: "KA / Gerente", numero: true, largura: "21%" },
        ]}
        linhas={[
          { tipo: "grupo", chave: "g-externa", celulas: ["Em jornada externa (não voa)"] },
          ...linhasDeRefeicao(r.food.jornadaExterna),
          { tipo: "grupo", chave: "g-viagem", celulas: ["Em viagem"] },
          ...linhasDeRefeicao(r.food.emViagem),
        ]}
      />
      {demais !== undefined && gestao !== undefined && (
        <p className="m-0 -mt-2 text-xs text-muted-foreground">
          Executivo de Contas fica em Demais ({fmt(demais)}); Key Account e Gerente, {fmt(gestao)} por refeição.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Subtitulo>Como o sistema aplica</Subtitulo>
        <Regras
          testid="rgc-regras-alimentacao"
          itens={[
            { chave: "nao-voa", titulo: "Não voa", texto: "almoço e jantar em todos os dias trabalhados. O sistema não registra horas de jornada — as condições da tabela acima não são conferidas." },
            { chave: "chegada", titulo: "Dia de chegada", texto: "almoço se o voo chega até 11h; jantar se chega até 19h." },
            { chave: "meio", titulo: "Dias do meio", texto: "almoço e jantar." },
            { chave: "retorno", titulo: "Dia de retorno", texto: "almoço se a volta parte a partir das 13h; jantar a partir das 21h (van ou ônibus: 20h)." },
            { chave: "horario", titulo: "Horários", texto: "valem os da passagem; sem passagem, os sugeridos na Escalação. Sem nenhum, o dia conta cheio e o Planejado marca a alimentação como estimada." },
            { chave: "casa-util", titulo: "Casa (CLT) em dia útil", texto: <>almoço de {fmt(r.almocoCasaUtil.demais)} (cenotécnica {fmt(r.almocoCasaUtil.ceno)}) — o vale-refeição cobre o resto. O jantar é o da tabela.</> },
            { chave: "sem", titulo: "Não recebem", texto: "freela (o cachê cobre), percurseiro (está no pacote), função com “local” no nome e empreita por empresa." },
          ]}
        />
      </div>
    </Secao>
  );
}

export function SecaoMobilidade() {
  return (
    <Secao
      id="mobilidade"
      grupo="Ajudas de custo"
      titulo="Mobilidade"
      fonte="fixo"
      lede="Deslocamento até o aeroporto, por trecho — ida e volta contam separado. Igual para casa e freela."
    >
      <Tabela
        legenda="Mobilidade por trecho"
        testid="rgc-tabela-mobilidade"
        colunas={[{ rotulo: "Situação" }, { rotulo: "Por trecho", numero: true, largura: "9.5rem" }]}
        linhas={MOBILITY_2026.map(m => ({ chave: m.faixa, celulas: [m.faixa, <Valor key="v" cents={m.cents} />] }))}
      />
      <Regras
        itens={[
          { chave: "sp", titulo: "Evento em SP ou Grande SP", texto: "sem mobilidade, voando ou não." },
          { chave: "terrestre", titulo: "Fora de SP, sem voo", texto: <>{fmt(MOBILIDADE_TRECHO_PADRAO_CENTS)} por trecho — van, ônibus ou carro, em qualquer horário.</> },
          { chave: "madrugada", titulo: "Voo de madrugada", texto: <>{fmt(MOBILIDADE_TRECHO_MADRUGADA_CENTS)} quando o voo parte entre 23h30 e 9h30 ou chega entre 20h e 5h.</> },
          { chave: "sem", titulo: "Não recebem", texto: "percurseiro, função com “local” no nome e empreita por empresa." },
        ]}
      />
    </Secao>
  );
}

export function SecaoDiasAdicionais() {
  return (
    <Secao
      id="dias-adicionais"
      grupo="Ajudas de custo"
      titulo="Deslocamento em dias adicionais"
      fonte="referencia"
      lede="Ajuda de custo do freela que sai na véspera ou volta no dia seguinte ao evento."
    >
      <Tabela
        legenda="Ajuda de custo em dias adicionais (freela)"
        testid="rgc-tabela-dias-adicionais"
        colunas={[{ rotulo: "Situação" }, { rotulo: "Valor", numero: true, largura: "9.5rem" }]}
        linhas={FREELA_EXTRA_DAY_ALLOWANCE.map(a => ({ chave: a.situacao, celulas: [a.situacao, <Valor key="v" cents={a.cents} />] }))}
      />
      <Nota tom="aviso" icone={<Info className="w-3.5 h-3.5" />}>
        Tabela do slide para consulta: o cálculo automático do Planejado não soma este valor à vaga.
      </Nota>
    </Secao>
  );
}
