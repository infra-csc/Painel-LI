// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// ZONA 2 da tela Valores padrão — "Valores legados" (recolhida): o toggle
// Casa/Freela, as diárias e a alimentação útil/fds do modelo antigo e a tabela
// "Diária por função", que entra como `children` porque o estado dela mora no
// hook (a zona desmonta ao fechar).
//
// 08/10 — fechada, a zona diz em uma linha o que é e se tem alteração dentro;
// aberta, os dois cartões viraram linhas do mesmo grupo e o Casa/Freela é um
// seletor de segmento com o efeito escrito ao lado.
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ChevronDown, Building2, Users } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { LinhaDeAjuste, MoneyField, SeloAlteradas } from "./settings-fields";
import type { FormValues } from "./settings-schema";
import { ancoraDaSecao } from "./settings-secoes";
import type { SettingsTab } from "./use-function-values";

export interface LegacyValuesSectionProps {
  form: UseFormReturn<FormValues>;
  legacyOpen: boolean;
  setLegacyOpen: (open: boolean) => void;
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  /** Alterações não salvas na zona (campos legados + diárias por função). */
  alteradas?: number;
  /** Tabela "Diária por função (legado)" */
  children: ReactNode;
}

export function LegacyValuesSection({ form, legacyOpen, setLegacyOpen, activeTab, setActiveTab, alteradas = 0, children }: LegacyValuesSectionProps) {
  const c = form.control;
  const casa = activeTab === "casa";
  const segmento = (tab: SettingsTab, rotulo: string, Icone: typeof Building2) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      aria-pressed={activeTab === tab}
      className={cn(
        "cfg-segmento pas-alvo inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md text-sm font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        activeTab === tab ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground",
      )}
      data-testid={`cfg-legado-${tab}`}
    >
      <Icone className="w-3.5 h-3.5" aria-hidden="true" />{rotulo}
    </button>
  );
  return (
    <Collapsible
      open={legacyOpen}
      onOpenChange={setLegacyOpen}
      id={ancoraDaSecao("legado")}
      className="cfg-grupo rounded-xl border border-border bg-card"
      data-testid="cfg-legado"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-start justify-between gap-3 px-5 py-4 text-left rounded-xl transition-colors hover:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-sm:px-4"
          data-testid="cfg-legado-alternar"
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-[15px] font-semibold leading-6 text-foreground">Valores legados</span>
              <span className="inline-flex items-center h-6 px-2 rounded-full border border-border bg-surface-muted text-2xs font-medium text-muted-foreground">fora do cálculo automático</span>
              <SeloAlteradas n={alteradas} />
            </span>
            <span className="block mt-0.5 max-w-[760px] text-xs leading-5 text-muted-foreground">
              Diárias e alimentação do modelo antigo e a diária por função. Servem só de reserva: quando um orçamento tem valor preenchido à mão ou a função não é coberta pelas regras acima.
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 shrink-0 mt-0.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <span className="max-sm:hidden">{legacyOpen ? "Recolher" : "Mostrar"}</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border">
          {/* Casa/Freela — afeta APENAS os valores legados abaixo */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 bg-surface-muted/50 border-b border-border max-sm:px-4">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Vínculo dos valores legados">
              {segmento("casa", "Casa", Building2)}
              {segmento("freela", "Freela", Users)}
            </div>
            <span className="text-xs text-muted-foreground">
              Troca só os valores legados mostrados abaixo — as regras do cálculo não mudam.
            </span>
          </div>

          <div key={activeTab} className="pas-entra">
            <LinhaDeAjuste
              titulo={`Diária ${casa ? "casa" : "freela"}`}
              descricao="Por dia trabalhado. Usada só em diária preenchida à mão; o cálculo usa as Diárias da seção de cima."
              colunas={2}
            >
              {casa ? (<>
                <MoneyField control={c} name="default_daily_value_weekday" label="Dia útil" />
                <MoneyField control={c} name="default_daily_value_weekend" label="Fim de semana" />
              </>) : (<>
                <MoneyField control={c} name="default_daily_value_weekday_freela" label="Dia útil" />
                <MoneyField control={c} name="default_daily_value_weekend_freela" label="Fim de semana" />
              </>)}
            </LinhaDeAjuste>
            <LinhaDeAjuste
              titulo={`Alimentação ${casa ? "casa" : "freela"} · dia útil`}
              descricao="Usada só em alimentação preenchida à mão; o cálculo usa a Alimentação por refeição."
              colunas={2}
            >
              {casa ? (<>
                <MoneyField control={c} name="default_weekday_lunch" label="Almoço" />
                <MoneyField control={c} name="default_weekday_dinner" label="Jantar" />
              </>) : (<>
                <MoneyField control={c} name="default_weekday_lunch_freela" label="Almoço" />
                <MoneyField control={c} name="default_weekday_dinner_freela" label="Jantar" />
              </>)}
            </LinhaDeAjuste>
            <LinhaDeAjuste titulo={`Alimentação ${casa ? "casa" : "freela"} · fim de semana`} colunas={2}>
              {casa ? (<>
                <MoneyField control={c} name="default_weekend_lunch" label="Almoço" />
                <MoneyField control={c} name="default_weekend_dinner" label="Jantar" />
              </>) : (<>
                <MoneyField control={c} name="default_weekend_lunch_freela" label="Almoço" />
                <MoneyField control={c} name="default_weekend_dinner_freela" label="Jantar" />
              </>)}
            </LinhaDeAjuste>
          </div>

          {/* ── Tabela: Diária por função (legado) ── */}
          <div className="px-5 pt-1 pb-5 max-sm:px-4">{children}</div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
