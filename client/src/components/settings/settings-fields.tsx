// Extraído de system-settings.tsx em 25/09 (modularização): campos do
// formulário de Valores padrão (monetário com "R$", percentual com "%") e o
// cabeçalho padrão dos cards. São folhas puras de apresentação, reutilizadas
// por todas as seções da tela.
import type { Control, ControllerRenderProps, FieldPath } from "react-hook-form";
import type { LucideIcon } from "lucide-react";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import type { FormValues } from "./settings-schema";
import { normalizeDecimal } from "./settings-utils";

type AnyFieldProps = ControllerRenderProps<FormValues, FieldPath<FormValues>>;

function CurrencyInput({ field, id }: { field: AnyFieldProps; id?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm font-semibold text-muted-foreground">R$</span>
      <input
        type="text"
        inputMode="decimal"
        id={id}
        name={field.name}
        ref={field.ref}
        value={field.value}
        onBlur={field.onBlur}
        onChange={e => field.onChange(normalizeDecimal(e.target.value))}
        className="h-[38px] w-full appearance-none rounded-lg border border-border bg-surface-muted pl-9 pr-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:bg-card"
      />
    </div>
  );
}

// Input de percentual inteiro (0..100) com sufixo "%". NÃO é monetário.
function PercentInput({ field, id }: { field: AnyFieldProps; id?: string }) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        id={id}
        name={field.name}
        ref={field.ref}
        value={field.value}
        onBlur={field.onBlur}
        onChange={e => field.onChange(normalizeDecimal(e.target.value))}
        className="h-[38px] w-full appearance-none rounded-lg border border-border bg-surface-muted pl-3 pr-8 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:bg-card"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-sm font-semibold text-muted-foreground">%</span>
    </div>
  );
}

export interface SettingsFieldProps {
  control: Control<FormValues>;
  name: FieldPath<FormValues>;
  label: string;
  labelClass?: string;
}

// Campo monetário com <label htmlFor> apontando para o input (a11y).
export function MoneyField({
  control, name, label, labelClass = "text-muted-foreground",
}: SettingsFieldProps) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <label htmlFor={name} className={`mb-1 block text-2xs font-bold uppercase tracking-wider ${labelClass}`}>{label}</label>
        <FormControl><CurrencyInput field={field} id={name} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

export function PercentField({
  control, name, label, labelClass = "text-muted-foreground",
}: SettingsFieldProps) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <label htmlFor={name} className={`mb-1 block text-2xs font-bold uppercase tracking-wider ${labelClass}`}>{label}</label>
        <FormControl><PercentInput field={field} id={name} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

export interface SectionHeaderProps {
  icon: LucideIcon;
  iconBg: string;
  title: string;
  subtitle: string;
}

// Cabeçalho padrão dos cards (sem gradiente, seguindo o padrão do app).
export function SectionHeader({ icon: Icon, iconBg, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-surface-muted/60 px-4 py-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className="h-[18px] w-[18px] text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-2xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
