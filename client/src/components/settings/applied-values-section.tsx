// Extraído de system-settings.tsx em 25/09 (modularização): ZONA 1 da tela
// Valores padrão — os cards de tarifas efetivamente usadas no cálculo
// (diárias casa/freela, atendimento, deflação, alimentação por refeição,
// percurseiro, mobilidade e cenotécnicos empreita). Só apresentação: recebe o
// form e desenha os campos; o salvamento é da barra flutuante.
import type { UseFormReturn } from "react-hook-form";
import { DollarSign, Car, Utensils, Bike, ChevronDown, Building2, Users } from "lucide-react";
import { parseBrNumber } from "@/lib/utils";
import { MoneyField, PercentField, SectionHeader } from "./settings-fields";
import type { FormValues } from "./settings-schema";
import { CenoEmpreitaCard } from "./ceno-empreita-card";

export interface AppliedValuesSectionProps {
  form: UseFormReturn<FormValues>;
}

export function AppliedValuesSection({ form }: AppliedValuesSectionProps) {
  const mobilityIda = parseBrNumber(form.watch("default_mobility_ida") || "0");
  const mobilityVolta = parseBrNumber(form.watch("default_mobility_volta") || "0");
  const mobilityTotal = isNaN(mobilityIda + mobilityVolta) ? 0 : mobilityIda + mobilityVolta;

  const mobilityIdaFreela = parseBrNumber(form.watch("default_mobility_ida_freela") || "0");
  const mobilityVoltaFreela = parseBrNumber(form.watch("default_mobility_volta_freela") || "0");
  const mobilityTotalFreela = isNaN(mobilityIdaFreela + mobilityVoltaFreela) ? 0 : mobilityIdaFreela + mobilityVoltaFreela;

  return (
    <>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Valores aplicados no cálculo</h2>
          <span className="rounded-full border border-success/25 bg-success-soft px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-success">
            Aplicado no cálculo
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Estas são as regras e tarifas efetivamente usadas ao calcular o orçamento dos eventos.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">

        {/* Diárias Casa (regra por grupo de função) */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <SectionHeader icon={DollarSign} iconBg="bg-primary" title="Diárias Casa (regra por grupo)" subtitle="Três tarifas conforme o grupo de função" />
          <div className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MoneyField control={form.control} name="casa_diaria_dir_prova" label="Dir. de Prova" labelClass="text-primary" />
              <MoneyField control={form.control} name="casa_diaria_produtor" label="Produtor (produção/ativação/kit/sup ceno)" labelClass="text-primary" />
              <MoneyField control={form.control} name="casa_diaria_exec_vendas" label="Exec. Vendas O2 Prime" labelClass="text-primary" />
            </div>
            <p className="mb-0 mt-3 text-2xs text-muted-foreground">
              Tarifas do time da casa por grupo de função (slide). Atendimento tem tarifa própria (Key Account/Exec. de Contas); cenotécnica, percurso e montagem seguem seus regimes específicos.
            </p>
          </div>
        </div>

        {/* Diárias Freela (regra por viagem) */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <SectionHeader icon={DollarSign} iconBg="bg-primary" title="Diárias Freela (regra por viagem)" subtitle="Três tarifas conforme a função e se há viagem" />
          <div className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MoneyField control={form.control} name="freela_diaria_local" label="Local (sem viagem)" labelClass="text-primary" />
              <MoneyField control={form.control} name="freela_diaria_viagem" label="Em viagem" labelClass="text-primary" />
              <MoneyField control={form.control} name="freela_diaria_dir_prova" label="Dir de Prova" labelClass="text-primary" />
            </div>
            <p className="mb-0 mt-3 text-2xs text-muted-foreground">
              A diária é escolhida automaticamente conforme a função e se a escalação tem passagem. Os valores freela antigos por função deixaram de ser usados no cálculo.
            </p>
          </div>
        </div>

        {/* Atendimento (valores fixos, não dependem de Casa/Freela) */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <SectionHeader icon={Building2} iconBg="bg-primary" title="Atendimento" subtitle="Tarifas fixas de atendimento" />
          <div className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="atendimento_key_account" label="Key Account" labelClass="text-primary" />
              <MoneyField control={form.control} name="atendimento_executivo_contas" label="Executivo de Contas" labelClass="text-primary" />
            </div>
          </div>
        </div>

        {/* Regra de deflação (diárias) */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <SectionHeader icon={ChevronDown} iconBg="bg-danger-strong" title="Regra de deflação (diárias)" subtitle="Fatores aplicados à diária conforme o período trabalhado" />
          <div className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <PercentField control={form.control} name="deflacao_fator_ate_4" label="Até 4 dias (%)" labelClass="text-danger" />
              <PercentField control={form.control} name="deflacao_fator_5_8" label="Do 5º ao 8º dia (%)" labelClass="text-danger" />
              <PercentField control={form.control} name="deflacao_fator_9_mais" label="A partir do 9º dia (%)" labelClass="text-danger" />
            </div>
            <p className="mb-0 mt-3 text-2xs text-muted-foreground">
              Percentual da diária pago em cada faixa de dias. Ex.: 100% nos primeiros dias, reduzindo conforme a permanência.
            </p>
          </div>
        </div>

        {/* Alimentação por refeição (regra por voo) */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <SectionHeader icon={Utensils} iconBg="bg-success" title="Alimentação por refeição (regra por voo)" subtitle="Valores flat por refeição, sem distinção útil/fim de semana" />
          <div className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="alimentacao_almoco" label="Almoço — Demais" labelClass="text-success" />
              <MoneyField control={form.control} name="alimentacao_jantar" label="Jantar — Demais" labelClass="text-success" />
              <MoneyField control={form.control} name="alimentacao_almoco_ceno" label="Almoço — Cenotécnica" labelClass="text-success" />
              <MoneyField control={form.control} name="alimentacao_jantar_ceno" label="Jantar — Cenotécnica" labelClass="text-success" />
              <MoneyField control={form.control} name="alimentacao_almoco_gestao" label="Almoço — Key Account / Gerente" labelClass="text-success" />
              <MoneyField control={form.control} name="alimentacao_jantar_gestao" label="Jantar — Key Account / Gerente" labelClass="text-success" />
              <MoneyField control={form.control} name="alimentacao_almoco_casa_util" label="Almoço — Casa (CLT) em dia útil" labelClass="text-success" />
              <MoneyField control={form.control} name="alimentacao_almoco_casa_util_ceno" label="Almoço — Cenotécnica de casa em dia útil" labelClass="text-success" />
            </div>
            <p className="mb-0 mt-3 text-2xs text-muted-foreground">
              Valores por refeição usados no cálculo automático de alimentação (regra por horário de voo). Key Account e Gerente usam os valores de "Key Account / Gerente"; Executivo de Contas usa "Demais". Colaborador de casa (CLT) em dia útil recebe só a diferença do almoço (o vale-refeição cobre o resto); jantar e fins de semana usam os valores cheios — para cenotécnica de casa o jantar útil e os fins de semana usam os valores de Cenotécnica. Os campos antigos de alimentação útil/fds continuam valendo apenas para overrides manuais.
            </p>
          </div>
        </div>

        {/* Percurseiro (motoqueiro): pacote fechado por diária */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <SectionHeader icon={Bike} iconBg="bg-slate-700" title="Percurseiro (motoqueiro) — pacote por diária" subtitle="Tipo 1 × Tipo 2 · em viagem sempre 2 diárias, local 1 · alimentação e mobilidade já incluídas" />
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="percurseiro_t1_motoqueiro" label="Motoqueiro — Tipo 1" labelClass="text-slate-700" />
              <MoneyField control={form.control} name="percurseiro_t2_motoqueiro" label="Motoqueiro — Tipo 2" labelClass="text-slate-700" />
              <PercentField control={form.control} name="percurseiro_fee_pct" label="Fee sobre o motoqueiro (%)" labelClass="text-slate-700" />
              <MoneyField control={form.control} name="percurseiro_alimentacao" label="Alimentação (3 refeições)" labelClass="text-slate-700" />
              <MoneyField control={form.control} name="percurseiro_transporte" label="Ajuda de custo transporte" labelClass="text-slate-700" />
              <PercentField control={form.control} name="percurseiro_nf_pct" label="NF (%) — informativo" labelClass="text-slate-700" />
              <MoneyField control={form.control} name="percurseiro_t1_nf" label="NF — Tipo 1 (valor)" labelClass="text-slate-700" />
              <MoneyField control={form.control} name="percurseiro_t2_nf" label="NF — Tipo 2 (valor)" labelClass="text-slate-700" />
            </div>
            <p className="mb-0 text-2xs text-muted-foreground">
              Total por diária = motoqueiro + fee + alimentação + transporte + NF (Tipo 1: R$ 1.129,76 · Tipo 2: R$ 1.266,67 nos valores padrão). O valor da NF é editável por tipo porque a tabela de origem não segue uma fórmula única — o percentual acima é só referência. O tipo de cada percurseiro é definido na escalação (ou no Planejado, para os já escalados).
            </p>
          </div>
        </div>

        {/* Mobilidade (Casa e Freela, sem depender do toggle) */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <SectionHeader icon={Car} iconBg="bg-warning-strong" title="Mobilidade" subtitle="Ajuda de custo de deslocamento (ida e volta)" />
          <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-primary">
                <Building2 className="h-3 w-3" aria-hidden="true" /> Casa
              </p>
              <div className="grid grid-cols-2 gap-3">
                <MoneyField control={form.control} name="default_mobility_ida" label="Ida" />
                <MoneyField control={form.control} name="default_mobility_volta" label="Volta" />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                <span className="text-2xs text-muted-foreground">Total mobilidade</span>
                <span className="text-sm font-bold text-warning-strong">{`R$ ${mobilityTotal.toFixed(2).replace('.', ',')}`}</span>
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-primary">
                <Users className="h-3 w-3" aria-hidden="true" /> Freela
              </p>
              <div className="grid grid-cols-2 gap-3">
                <MoneyField control={form.control} name="default_mobility_ida_freela" label="Ida" />
                <MoneyField control={form.control} name="default_mobility_volta_freela" label="Volta" />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                <span className="text-2xs text-muted-foreground">Total mobilidade</span>
                <span className="text-sm font-bold text-warning-strong">{`R$ ${mobilityTotalFreela.toFixed(2).replace('.', ',')}`}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cenotécnicos Empreita — valor fechado por nº de dias */}
        <CenoEmpreitaCard form={form} />
      </div>
    </>
  );
}
