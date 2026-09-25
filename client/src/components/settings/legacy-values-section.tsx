// Extraído de system-settings.tsx em 25/09 (modularização): ZONA 2 da tela
// Valores padrão — Collapsible "Valores legados e overrides" com o toggle
// Casa/Freela e os dois cards legados (diárias e alimentação útil/fds). A
// tabela "Diária por Função" entra como `children`, porque o estado dela mora
// no hook (a zona desmonta ao fechar).
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { DollarSign, Utensils, ChevronDown, Building2, Users } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MoneyField, SectionHeader } from "./settings-fields";
import type { FormValues } from "./settings-schema";
import type { SettingsTab } from "./use-function-values";

export interface LegacyValuesSectionProps {
  form: UseFormReturn<FormValues>;
  legacyOpen: boolean;
  setLegacyOpen: (open: boolean) => void;
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  /** Tabela "Diária por Função (legado)" */
  children: ReactNode;
}

export function LegacyValuesSection({ form, legacyOpen, setLegacyOpen, activeTab, setActiveTab, children }: LegacyValuesSectionProps) {
  return (
    <Collapsible open={legacyOpen} onOpenChange={setLegacyOpen} className="overflow-hidden rounded-xl border border-border bg-surface-muted/60">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/70"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm font-bold text-slate-700">Valores legados e overrides</span>
            <span className="rounded-full border border-slate-300 bg-border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-slate-600">
              Legado — usado só como fallback/override
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-5 border-t border-border p-5">
          <p className="text-xs text-muted-foreground">
            Os valores desta seção <span className="font-semibold">não entram no cálculo automático</span> — servem apenas de fallback quando um orçamento tem valor preenchido manualmente (override) ou quando a função não é coberta pelas regras acima.
          </p>

          {/* Toggle Casa/Freela — afeta APENAS os valores legados abaixo */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl bg-border/70 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('casa')}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${activeTab === 'casa' ? 'bg-card text-primary shadow-1' : 'text-muted-foreground hover:text-muted-foreground'}`}
              >
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> Casa
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('freela')}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${activeTab === 'freela' ? 'bg-card text-primary shadow-1' : 'text-muted-foreground hover:text-muted-foreground'}`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Freela
              </button>
            </div>
            <span className="text-2xs text-muted-foreground">
              Afeta apenas os valores legados abaixo — as regras aplicadas no cálculo não mudam.
            </span>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">

            {/* Diárias legadas útil/fds */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
              <SectionHeader
                icon={DollarSign}
                iconBg={activeTab === 'casa' ? 'bg-primary' : 'bg-primary'}
                title={`Diárias ${activeTab === 'casa' ? 'Casa' : 'Freela'} (legado útil/fds)`}
                subtitle="Valor por dia trabalhado — modelo antigo"
              />
              <div className="flex flex-col gap-3.5 p-4">
                {activeTab === 'casa' ? (<>
                  <MoneyField control={form.control} name="default_daily_value_weekday" label="Dia Útil" labelClass="text-primary" />
                  <MoneyField control={form.control} name="default_daily_value_weekend" label="Fim de Semana" labelClass="text-warning-strong" />
                </>) : (<>
                  <MoneyField control={form.control} name="default_daily_value_weekday_freela" label="Dia Útil" labelClass="text-primary" />
                  <MoneyField control={form.control} name="default_daily_value_weekend_freela" label="Fim de Semana" labelClass="text-warning-strong" />
                </>)}
                <p className="mb-0 text-2xs text-muted-foreground">
                  Onde ainda é usado: apenas como fallback/override manual de diária em orçamentos — o cálculo automático usa as regras de "Diárias Casa/Freela" da seção aplicada.
                </p>
              </div>
            </div>

            {/* Alimentação legada útil/fds */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
              <SectionHeader
                icon={Utensils}
                iconBg="bg-success-strong"
                title={`Alimentação ${activeTab === 'casa' ? 'Casa' : 'Freela'} (legado útil/fds)`}
                subtitle="Almoço e jantar por dia — modelo antigo"
              />
              <div className="flex flex-col gap-3.5 p-4">
                <div>
                  <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-primary">Dias Úteis</p>
                  <div className="grid grid-cols-2 gap-3">
                    {activeTab === 'casa' ? (<>
                      <MoneyField control={form.control} name="default_weekday_lunch" label="Almoço" labelClass="text-muted-foreground" />
                      <MoneyField control={form.control} name="default_weekday_dinner" label="Jantar" labelClass="text-muted-foreground" />
                    </>) : (<>
                      <MoneyField control={form.control} name="default_weekday_lunch_freela" label="Almoço" labelClass="text-muted-foreground" />
                      <MoneyField control={form.control} name="default_weekday_dinner_freela" label="Jantar" labelClass="text-muted-foreground" />
                    </>)}
                  </div>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-warning-strong">Fim de Semana</p>
                  <div className="grid grid-cols-2 gap-3">
                    {activeTab === 'casa' ? (<>
                      <MoneyField control={form.control} name="default_weekend_lunch" label="Almoço" labelClass="text-muted-foreground" />
                      <MoneyField control={form.control} name="default_weekend_dinner" label="Jantar" labelClass="text-muted-foreground" />
                    </>) : (<>
                      <MoneyField control={form.control} name="default_weekend_lunch_freela" label="Almoço" labelClass="text-muted-foreground" />
                      <MoneyField control={form.control} name="default_weekend_dinner_freela" label="Jantar" labelClass="text-muted-foreground" />
                    </>)}
                  </div>
                </div>
                <p className="mb-0 text-2xs text-muted-foreground">
                  Onde ainda é usado: apenas em overrides manuais de alimentação — o cálculo automático usa "Alimentação por refeição (regra por voo)" da seção aplicada.
                </p>
              </div>
            </div>
          </div>

          {/* ── Tabela: Diária por Função (legado) ── */}
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
