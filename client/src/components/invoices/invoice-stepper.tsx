// Extraído de invoices.tsx em 25/09 (modularização): stepper compacto do topo
// da tela de Notas Fiscais. Componente puro — recebe só as contagens.
import { CheckCircle2 } from "lucide-react";

// ── Stepper compacto ─────────────────────────────────────────────────────────
// Reflete o ESTÁGIO real dos itens do evento (quantos aguardam em cada etapa),
// não a aba ativa. Etapa sem pendências aparece concluída.
export type StepperCounts = { lancamento: number; aprovacao: number; checkin: number };

export function InvoiceStepper({ counts }: { counts: StepperCounts }) {
  const steps = [
    { id: "lancamento", label: "Lançamento",   count: counts.lancamento },
    { id: "aprovacao",  label: "Aprovação RH", count: counts.aprovacao },
    { id: "checkin",    label: "Check-in",     count: counts.checkin },
  ];
  return (
    <div className="flex items-center gap-0 h-9 flex-wrap">
      {steps.map((step, i) => {
        const done  = step.count === 0;
        const color = done ? "var(--success)" : "var(--primary)";
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 shrink-0`}
                style={{ borderColor: color, background: color }}>
                {done
                  ? <CheckCircle2 className="w-2 h-2 text-white" strokeWidth={3} aria-hidden="true" />
                  : <div className="w-1.5 h-1.5 rounded-full bg-card" />}
              </div>
              <span className="text-2xs font-semibold whitespace-nowrap" style={{ color }}>
                {step.label}
              </span>
              {step.count > 0 && (
                <span
                  className="text-2xs font-bold leading-none px-1.5 py-0.5 rounded-full bg-brand-soft text-primary ring-1 ring-primary/25 whitespace-nowrap"
                  title={`${step.count} ite${step.count === 1 ? "m aguardando" : "ns aguardando"} nesta etapa`}
                >
                  {step.count} aguardando
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className="w-10 mx-2 border-t border-slate-300" />
            )}
          </div>
        );
      })}
    </div>
  );
}
