// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// ZONA 1 da tela Valores padrão — as tarifas que ENTRAM no cálculo: diárias
// (casa por grupo, freela por viagem, atendimento), deflação, alimentação por
// refeição, percurseiro, mobilidade e cenotécnicos empreita. Só apresentação:
// recebe o form e desenha os campos; o salvamento é da barra de alterações.
//
// 08/10 — os oito cartões coloridos de alturas diferentes viraram grupos em
// linhas ("o que é · onde vale" à esquerda, campos à direita), com os totais
// que dependem dos campos calculados ao vivo logo abaixo deles: mobilidade
// ida + volta, exemplo da deflação e a diária do percurseiro (pela MESMA
// função do motor de cálculo, percurseiroDiariaCents).
import type { UseFormReturn } from "react-hook-form";
import { percurseiroDiariaCents, PERCURSEIRO_SETTING_KEYS, type PercurseiroTipo } from "@shared/calculation-rules";
import { formatarMoeda } from "@/lib/format";
import { parseBrNumber } from "@/lib/utils";
import { GrupoDeAjustes, LinhaDeAjuste, MoneyField, PercentField } from "./settings-fields";
import { PERCENT_KEYS, type FormValues } from "./settings-schema";
import { ancoraDaSecao, type SecaoId } from "./settings-secoes";
import { CenoEmpreitaCard } from "./ceno-empreita-card";

export interface AppliedValuesSectionProps {
  form: UseFormReturn<FormValues>;
  /** Alterações não salvas por seção (barra de alterações / índice). */
  alteradasPorSecao: Record<SecaoId, number>;
}

const reais = (v: string | undefined) => {
  const n = parseBrNumber(v || "0");
  return Number.isFinite(n) ? n : 0;
};
const centavos = (v: string | undefined) => Math.round(reais(v) * 100);

/** Total calculado ao vivo, alinhado com os campos (sem cara de campo). */
function TotalCalculado({ rotulo, valor, testId }: { rotulo: string; valor: string; testId?: string }) {
  return (
    <div className="cfg-total min-w-0" data-testid={testId}>
      <span className="cfg-rotulo">{rotulo}</span>
      <span className="cfg-total-valor tabular-nums" aria-live="polite">{valor}</span>
    </div>
  );
}

export function AppliedValuesSection({ form, alteradasPorSecao }: AppliedValuesSectionProps) {
  const c = form.control;
  const [ida, volta, idaF, voltaF, diariaExemplo, d1, d2, d3] = form.watch([
    "default_mobility_ida", "default_mobility_volta", "default_mobility_ida_freela", "default_mobility_volta_freela",
    "freela_diaria_local", "deflacao_fator_ate_4", "deflacao_fator_5_8", "deflacao_fator_9_mais",
  ]);
  const mobilidadeCasa = reais(ida) + reais(volta);
  const mobilidadeFreela = reais(idaF) + reais(voltaF);

  // Diária do percurseiro com o que está digitado agora — a regra é a do motor.
  const K = PERCURSEIRO_SETTING_KEYS;
  const chavesPercurseiro = Object.values(K) as (keyof FormValues)[];
  const valoresPercurseiro = form.watch(chavesPercurseiro);
  const settingsPercurseiro: Record<string, number> = {};
  chavesPercurseiro.forEach((k, i) => {
    settingsPercurseiro[k] = PERCENT_KEYS.has(k) ? Math.round(reais(valoresPercurseiro[i])) : centavos(valoresPercurseiro[i]);
  });
  const composicao = (tipo: PercurseiroTipo) => percurseiroDiariaCents(tipo, settingsPercurseiro);

  const baseExemplo = centavos(diariaExemplo);
  const faixas: { rotulo: string; pct: number }[] = [
    { rotulo: "dias 1 a 4", pct: reais(d1) },
    { rotulo: "5º ao 8º dia", pct: reais(d2) },
    { rotulo: "9º dia em diante", pct: reais(d3) },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Diárias ── */}
      <GrupoDeAjustes
        id={ancoraDaSecao("diarias")}
        titulo="Diárias"
        descricao="A diária de cada vaga sai daqui conforme o vínculo e a função. Cenotécnica, percurso e montagem seguem regimes próprios, mais abaixo."
        alteradas={alteradasPorSecao.diarias}
        data-testid="cfg-grupo-diarias"
      >
        <LinhaDeAjuste titulo="Casa · por grupo de função" descricao="Tarifa do time da casa conforme o grupo da função.">
          <MoneyField control={c} name="casa_diaria_dir_prova" label="Dir. de prova" />
          <MoneyField control={c} name="casa_diaria_produtor" label="Produtor" hint="produção, ativação, kit e sup. ceno" />
          <MoneyField control={c} name="casa_diaria_exec_vendas" label="Exec. vendas O2 Prime" />
        </LinhaDeAjuste>
        <LinhaDeAjuste titulo="Freela · por viagem" descricao="Escolhida sozinha pela função e por haver passagem na escalação. Os valores freela antigos por função não entram mais no cálculo.">
          <MoneyField control={c} name="freela_diaria_local" label="Local" hint="sem viagem" />
          <MoneyField control={c} name="freela_diaria_viagem" label="Em viagem" />
          <MoneyField control={c} name="freela_diaria_dir_prova" label="Dir. de prova" />
        </LinhaDeAjuste>
        <LinhaDeAjuste titulo="Atendimento" descricao="Tarifas fixas, valem para casa e freela.">
          <MoneyField control={c} name="atendimento_key_account" label="Key Account" />
          <MoneyField control={c} name="atendimento_executivo_contas" label="Executivo de contas" />
        </LinhaDeAjuste>
      </GrupoDeAjustes>

      {/* ── Deflação ── */}
      <GrupoDeAjustes
        id={ancoraDaSecao("deflacao")}
        titulo="Deflação das diárias"
        descricao="Quanto da diária é pago em cada faixa de dias trabalhados — a diária cai conforme a permanência."
        alteradas={alteradasPorSecao.deflacao}
        data-testid="cfg-grupo-deflacao"
      >
        <LinhaDeAjuste
          titulo="Percentual pago por faixa"
          descricao="Entre 0 e 100%."
          rodape={
            <div className="cfg-exemplo" data-testid="cfg-exemplo-deflacao">
              <p className="m-0 text-2xs font-medium text-muted-foreground">
                Exemplo com uma diária de <span className="tabular-nums text-foreground">{formatarMoeda(baseExemplo)}</span> (freela local)
              </p>
              <ol className="cfg-degraus" aria-label="Diária paga em cada faixa">
                {faixas.map(f => {
                  const pct = Math.max(0, Math.min(100, f.pct));
                  return (
                    <li key={f.rotulo} className="cfg-degrau">
                      <span className="cfg-degrau-barra" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                      <span className="text-2xs text-muted-foreground">{f.rotulo}</span>
                      <span className="text-xs font-semibold tabular-nums text-foreground">{formatarMoeda(Math.round(baseExemplo * pct / 100))}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          }
        >
          <PercentField control={c} name="deflacao_fator_ate_4" label="Até 4 dias" />
          <PercentField control={c} name="deflacao_fator_5_8" label="Do 5º ao 8º dia" />
          <PercentField control={c} name="deflacao_fator_9_mais" label="A partir do 9º dia" />
        </LinhaDeAjuste>
      </GrupoDeAjustes>

      {/* ── Alimentação por refeição ── */}
      <GrupoDeAjustes
        id={ancoraDaSecao("alimentacao")}
        titulo="Alimentação por refeição"
        descricao="Valor por refeição no cálculo automático (regra pelo horário do voo), igual em dia útil e fim de semana."
        alteradas={alteradasPorSecao.alimentacao}
        data-testid="cfg-grupo-alimentacao"
      >
        <LinhaDeAjuste titulo="Demais funções" descricao="Inclui Executivo de contas." colunas={2}>
          <MoneyField control={c} name="alimentacao_almoco" label="Almoço" />
          <MoneyField control={c} name="alimentacao_jantar" label="Jantar" />
        </LinhaDeAjuste>
        <LinhaDeAjuste titulo="Cenotécnica" descricao="Também o jantar útil e os fins de semana da cenotécnica de casa." colunas={2}>
          <MoneyField control={c} name="alimentacao_almoco_ceno" label="Almoço" />
          <MoneyField control={c} name="alimentacao_jantar_ceno" label="Jantar" />
        </LinhaDeAjuste>
        <LinhaDeAjuste titulo="Key Account e Gerente" colunas={2}>
          <MoneyField control={c} name="alimentacao_almoco_gestao" label="Almoço" />
          <MoneyField control={c} name="alimentacao_jantar_gestao" label="Jantar" />
        </LinhaDeAjuste>
        <LinhaDeAjuste
          titulo="Casa (CLT) em dia útil"
          descricao="Só a diferença do almoço — o vale-refeição cobre o resto. Jantar e fins de semana usam os valores cheios acima."
          colunas={2}
        >
          <MoneyField control={c} name="alimentacao_almoco_casa_util" label="Almoço" />
          <MoneyField control={c} name="alimentacao_almoco_casa_util_ceno" label="Almoço · cenotécnica de casa" />
        </LinhaDeAjuste>
        <p className="cfg-nota">
          Os campos antigos de alimentação útil/fim de semana (em Valores legados) continuam valendo só para ajustes manuais.
        </p>
      </GrupoDeAjustes>

      {/* ── Percurseiro ── */}
      <GrupoDeAjustes
        id={ancoraDaSecao("percurseiro")}
        titulo="Percurseiro (motoqueiro)"
        descricao="Pacote fechado por diária, com alimentação e mobilidade incluídas. Em viagem são sempre 2 diárias; local, 1. O tipo de cada percurseiro é escolhido na escalação (ou no Planejado, para quem já está escalado)."
        alteradas={alteradasPorSecao.percurseiro}
        data-testid="cfg-grupo-percurseiro"
      >
        <LinhaDeAjuste titulo="Motoqueiro" descricao="Valor por diária e o fee sobre ele.">
          <MoneyField control={c} name="percurseiro_t1_motoqueiro" label="Tipo 1" />
          <MoneyField control={c} name="percurseiro_t2_motoqueiro" label="Tipo 2" />
          <PercentField control={c} name="percurseiro_fee_pct" label="Fee" />
        </LinhaDeAjuste>
        <LinhaDeAjuste titulo="Incluído no pacote" colunas={3}>
          <MoneyField control={c} name="percurseiro_alimentacao" label="Alimentação" hint="3 refeições" />
          <MoneyField control={c} name="percurseiro_transporte" label="Transporte" hint="ajuda de custo" />
        </LinhaDeAjuste>
        <LinhaDeAjuste
          titulo="Nota fiscal"
          descricao="Valor por tipo, porque a tabela de origem não segue uma fórmula única. O percentual é só referência."
          rodape={
            <div className="cfg-composicao" data-testid="cfg-percurseiro-total">
              {(["tipo_1", "tipo_2"] as const).map(tipo => {
                const p = composicao(tipo);
                if (!p) return null;
                return (
                  <div key={tipo} className="cfg-composicao-tipo">
                    <p className="m-0 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">Diária {tipo === "tipo_1" ? "tipo 1" : "tipo 2"}</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">{formatarMoeda(p.total)}</span>
                    </p>
                    <p className="m-0 mt-0.5 text-2xs leading-4 text-muted-foreground tabular-nums">
                      {formatarMoeda(p.motoqueiro)} motoqueiro + {formatarMoeda(p.fee)} fee + {formatarMoeda(p.alimentacao)} alimentação + {formatarMoeda(p.transporte)} transporte + {formatarMoeda(p.nf)} NF
                    </p>
                  </div>
                );
              })}
            </div>
          }
        >
          <MoneyField control={c} name="percurseiro_t1_nf" label="NF tipo 1" />
          <MoneyField control={c} name="percurseiro_t2_nf" label="NF tipo 2" />
          <PercentField control={c} name="percurseiro_nf_pct" label="NF (referência)" hint="informativo" />
        </LinhaDeAjuste>
      </GrupoDeAjustes>

      {/* ── Mobilidade ── */}
      <GrupoDeAjustes
        id={ancoraDaSecao("mobilidade")}
        titulo="Mobilidade"
        descricao="Ajuda de custo de deslocamento, em ida e volta."
        alteradas={alteradasPorSecao.mobilidade}
        data-testid="cfg-grupo-mobilidade"
      >
        <LinhaDeAjuste titulo="Casa">
          <MoneyField control={c} name="default_mobility_ida" label="Ida" />
          <MoneyField control={c} name="default_mobility_volta" label="Volta" />
          <TotalCalculado rotulo="Ida + volta" valor={formatarMoeda(Math.round(mobilidadeCasa * 100))} testId="cfg-mobilidade-total-casa" />
        </LinhaDeAjuste>
        <LinhaDeAjuste titulo="Freela">
          <MoneyField control={c} name="default_mobility_ida_freela" label="Ida" />
          <MoneyField control={c} name="default_mobility_volta_freela" label="Volta" />
          <TotalCalculado rotulo="Ida + volta" valor={formatarMoeda(Math.round(mobilidadeFreela * 100))} testId="cfg-mobilidade-total-freela" />
        </LinhaDeAjuste>
      </GrupoDeAjustes>

      {/* ── Cenotécnicos Empreita — valor fechado por nº de dias ── */}
      <CenoEmpreitaCard form={form} alteradas={alteradasPorSecao.cenotecnicos} />
    </div>
  );
}
