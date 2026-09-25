// Extraído de system-settings.tsx em 25/09 (modularização): card
// "Cenotécnicos Empreita — valor fechado por dias" (4 modalidades × 2..6 dias).
// Fica em arquivo próprio porque calcula o incremento ao vivo com `form.watch`
// por linha — a única parte da zona aplicada que precisa observar o form.
import type { UseFormReturn } from "react-hook-form";
import { Hammer } from "lucide-react";
import { parseBrNumber } from "@/lib/utils";
import { CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, CENO_EMPREITA_TABLE_DAYS } from "@shared/cenotecnica-empreita";
import { MoneyField, SectionHeader } from "./settings-fields";
import { cenoEmpreitaKey, type FormValues } from "./settings-schema";

export interface CenoEmpreitaCardProps {
  form: UseFormReturn<FormValues>;
}

export function CenoEmpreitaCard({ form }: CenoEmpreitaCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-1 xl:col-span-2">
      <SectionHeader
        icon={Hammer}
        iconBg="bg-warning"
        title="Cenotécnicos Empreita — valor fechado por dias"
        subtitle="Quatro modalidades × 2 a 6 dias · valor fechado, sem deflação"
      />
      <div className="space-y-5 p-4">
        {CENO_FREELA_TIPOS.map(tipo => {
          // Incremento usado quando os dias caem fora de 2–6: (6 dias − 2 dias) / 4,
          // calculado ao vivo com o que está digitado na linha.
          const v2 = parseBrNumber(form.watch(cenoEmpreitaKey(tipo, 2)) || "0");
          const v6 = parseBrNumber(form.watch(cenoEmpreitaKey(tipo, 6)) || "0");
          const incremento = (v6 - v2) / 4;
          return (
            <div key={tipo}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-warning">
                  <Hammer className="h-3 w-3" aria-hidden="true" /> {CENO_FREELA_TIPO_LABELS[tipo]}
                </p>
                <span className="text-2xs text-muted-foreground">
                  Incremento{' '}
                  <span className="font-semibold text-muted-foreground">
                    {Number.isFinite(incremento) ? `R$ ${incremento.toFixed(2).replace('.', ',')}` : '—'}
                  </span>
                  {' '}por dia fora de 2–6
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {CENO_EMPREITA_TABLE_DAYS.map(dias => (
                  <MoneyField
                    key={dias}
                    control={form.control}
                    name={cenoEmpreitaKey(tipo, dias)}
                    label={`${dias} dias`}
                    labelClass="text-warning"
                  />
                ))}
              </div>
            </div>
          );
        })}
        <p className="mb-0 text-2xs text-muted-foreground">
          Cada valor é <span className="font-semibold text-muted-foreground">fechado</span> para o total de dias trabalhados — não é diária × dias e <span className="font-semibold text-muted-foreground">não sofre deflação</span> por período. A modalidade é escolhida na Escalação, por vaga. Fora da faixa de 2 a 6 dias o sistema extrapola pelo incremento da própria linha (mostrado acima de cada modalidade). Cenotécnico de casa (CLT) continua sem diária; alimentação e mobilidade seguem as regras normais e ficam fora do valor fechado.
        </p>
      </div>
    </div>
  );
}
