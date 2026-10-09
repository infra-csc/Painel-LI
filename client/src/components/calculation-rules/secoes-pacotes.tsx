/**
 * Pacotes fechados (redesenho 08/10): cenotécnicos em empreita e percurseiro.
 * Regras de `shared/cenotecnica-empreita.ts` (cenoEmpreitaTotalCents,
 * arredondarReais) e `shared/calculation-rules.ts` (percurseiroDiariaCents,
 * diasPercurseiro, diasEmpreita).
 */
import { AlertTriangle } from "lucide-react";
import { CENO_EMPREITA_TABLE_DAYS, CENO_EMPREITA_DEFAULTS, cenoEmpreitaTotalCents, arredondarReais } from "@shared/cenotecnica-empreita";
import type { PercurseiroDiaria } from "@shared/calculation-rules";
import { Secao, Tabela, Valor, Regras, Nota, Subtitulo, fmt } from "./rgc-ui";
import type { RegrasVigentes, SystemSettings } from "./regras-vigentes";

export function SecaoEmpreita({ r, settings }: { r: RegrasVigentes; settings?: SystemSettings }) {
  const algumaEditada = r.empreita.some(l => l.editada);
  // Exemplos numéricos com a MESMA função do Planejado.
  const sp = r.empreita.find(l => l.tipo === "sp") ?? r.empreita[0];
  const ex7 = cenoEmpreitaTotalCents(sp.tipo, 7, settings);
  const viagem = r.empreita.find(l => l.tipo === "viagem") ?? r.empreita[0];
  const brutoViagem2 = viagem.row[2];

  return (
    <Secao
      id="empreita"
      grupo="Pacotes fechados"
      titulo="Cenotécnicos empreita"
      fonte="editavel"
      lede="Cenotécnico que não é da casa recebe um valor fechado pela modalidade e pelo número de dias trabalhados — não é diária × dias, e a deflação não se aplica (já está embutida na proposta)."
    >
      <Tabela
        legenda="Valor fechado por modalidade e número de dias"
        cartao
        densa
        testid="rgc-tabela-empreita"
        colunas={[
          { rotulo: "Modalidade", largura: "19%" },
          ...CENO_EMPREITA_TABLE_DAYS.map(d => ({ rotulo: `${d} dias`, numero: true })),
          { rotulo: "Por dia a mais", curto: "Dia a mais", numero: true },
        ]}
        linhas={r.empreita.map(l => ({
          chave: l.tipo,
          celulas: [
            l.label,
            ...CENO_EMPREITA_TABLE_DAYS.map(d => <Valor key={d} cents={l.row[d]} padraoCents={CENO_EMPREITA_DEFAULTS[l.tipo][d]} />),
            <span key="inc" className="tabular-nums whitespace-nowrap text-muted-foreground">+{fmt(l.incremento)}</span>,
          ],
        }))}
      />
      {algumaEditada && (
        <p className="m-0 -mt-2 text-xs text-warning">Em âmbar, o valor aplicado hoje; riscado, o valor original do slide.</p>
      )}
      <Nota>
        <strong className="font-semibold text-foreground">Pago sem centavos:</strong> o valor da tabela é arredondado ao real mais próximo — {fmt(brutoViagem2)} vira {fmt(arredondarReais(brutoViagem2))}.
      </Nota>
      {ex7 && (
        <div className="rgc-exemplo" data-testid="rgc-exemplo-empreita">
          <p className="rgc-exemplo-rotulo m-0">Exemplo · fora da tabela</p>
          <p className="m-0 text-sm text-slate-700 leading-6">
            {sp.label} por <strong className="font-semibold text-foreground">7 dias</strong>: 6 dias ({fmt(sp.row[6])}) + 1 dia a mais ({fmt(ex7.incrementoCents)})
            {" "}= <span className="tabular-nums">{fmt(sp.row[6] + ex7.incrementoCents)}</span> → pago{" "}
            <strong className="font-semibold text-foreground tabular-nums">{fmt(ex7.totalCents)}</strong>.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Subtitulo>Como a regra é aplicada</Subtitulo>
        <Regras
          itens={[
            { chave: "mod", titulo: "Modalidade", texto: "Viagem, SP, Local A ou Local B — escolhida na Escalação, vaga por vaga; não vem da função nem do evento." },
            { chave: "dias", titulo: "Dias", texto: "os dias marcados na vaga; sem marcação, o período de trabalho inteiro." },
            { chave: "fora", titulo: "1 dia, ou 7 e mais", texto: "o valor é extrapolado pelo “por dia a mais” da própria modalidade — a última coluna." },
            { chave: "casa", titulo: "Cenotécnico da casa (CLT)", texto: "continua sem diária: a tabela vale só para quem não é da casa." },
            { chave: "fora-do-valor", titulo: "Alimentação e mobilidade", texto: "seguem as regras normais e não estão dentro do valor fechado, que cobre só a mão de obra." },
            { chave: "empresa", titulo: "Empreita por empresa", texto: "vale o valor total informado na Escalação, sem diária, alimentação ou mobilidade por pessoa." },
          ]}
        />
      </div>
    </Secao>
  );
}

export function SecaoPercurseiro({ r }: { r: RegrasVigentes }) {
  const tipos = r.percurseiro;
  const linhas: { label: string; get: (d: PercurseiroDiaria) => number }[] = [
    { label: "Motoqueiro", get: d => d.motoqueiro },
    { label: `Fee Ivan (${r.percurseiroFeePct}%)`, get: d => d.fee },
    { label: "Alimentação (3 refeições)", get: d => d.alimentacao },
    { label: "Ajuda de custo transporte", get: d => d.transporte },
    { label: `NF (${r.percurseiroNfPct}%)`, get: d => d.nf },
  ];
  // A NF não sai do percentual: mostra quanto daria, com os valores vigentes.
  const t1 = tipos[0]?.d;
  const subtotalT1 = t1 ? t1.motoqueiro + t1.fee + t1.alimentacao + t1.transporte : 0;
  const nfCalculada = Math.round(subtotalT1 * r.percurseiroNfPct / 100);

  return (
    <Secao
      id="percurseiro"
      grupo="Pacotes fechados"
      titulo="Percurseiro"
      fonte="editavel"
      lede="Motoqueiros: pacote fixo por tipo, sempre com emissão de NF. Em viagem (com passagem) são sempre 2 diárias, independente do período; sem passagem, 1 diária."
    >
      <Tabela
        legenda="Composição da diária do percurseiro"
        testid="rgc-tabela-percurseiro"
        colunas={[{ rotulo: "Composição" }, ...tipos.map(t => ({ rotulo: t.label, numero: true, largura: "9.5rem" }))]}
        linhas={[
          ...linhas.map(l => ({ chave: l.label, celulas: [l.label, ...tipos.map(t => <Valor key={t.label} cents={l.get(t.d)} />)] })),
          { tipo: "total" as const, chave: "total", celulas: ["Total por diária", ...tipos.map(t => <Valor key={t.label} cents={t.d.total} forte />)] },
          { tipo: "total-forte" as const, chave: "viagem", celulas: ["Em viagem (2 diárias)", ...tipos.map(t => <Valor key={t.label} cents={t.d.total * 2} forte />)] },
        ]}
      />
      {t1 && (
        <Nota tom="aviso" icone={<AlertTriangle className="w-3.5 h-3.5" />}>
          Os {r.percurseiroNfPct}% de NF não saem das demais parcelas ({r.percurseiroNfPct}% do subtotal do {tipos[0].label} daria {fmt(nfCalculada)}) — o valor da NF vem da tabela confirmada em 17/08 e é editável nos Valores Padrão, junto com as demais parcelas.
        </Nota>
      )}
      <Regras
        itens={[
          { chave: "tipo", titulo: "Tipo", texto: "escolhido na Escalação; sem tipo, conta o Tipo 1." },
          { chave: "defl", titulo: "Deflação", texto: "não se aplica — é pacote fechado." },
          { chave: "dentro", titulo: "Alimentação e mobilidade", texto: "já estão dentro do pacote e não entram de novo no Planejado." },
        ]}
      />
    </Secao>
  );
}
