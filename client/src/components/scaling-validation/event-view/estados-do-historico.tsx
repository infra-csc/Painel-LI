/**
 * Estados do Histórico da escala (07/10 — redesenho premium): o esqueleto no
 * formato real da tela e o bloco de estado (vazio, sem resultado, erro) no
 * desenho da Validação e da Aprovação — círculo com o ícone, título, a causa
 * e o próximo passo.
 *
 * Diferença deliberada do `EstadoDaValidacao`: os estados de DENTRO das abas
 * não são região viva. A contagem das abas ("3 de 12 movimentos") já é a única
 * região `aria-live` da tela — duas regiões vivas se atropelam no leitor de
 * tela (regra de 25/09). Só o erro continua `role="alert"`.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EstadoDoHistorico({ icone, titulo, texto, acao, tom = "neutro", testId, className }: {
  icone: ReactNode;
  titulo: ReactNode;
  texto?: ReactNode;
  acao?: ReactNode;
  tom?: "neutro" | "erro";
  testId?: string;
  className?: string;
}) {
  const erro = tom === "erro";
  return (
    <div
      className={cn(
        "val-entra rounded-xl border bg-card px-6 py-10 text-center sm:px-8",
        erro ? "border-danger/25" : "border-dashed border-slate-300",
        className,
      )}
      role={erro ? "alert" : undefined}
      data-testid={testId}
    >
      <div
        className={cn("mx-auto flex h-11 w-11 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5", erro ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground")}
        aria-hidden="true"
      >
        {icone}
      </div>
      <p className="mt-3.5 text-[15px] font-semibold text-foreground">{titulo}</p>
      {texto && <p className="mx-auto mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">{texto}</p>}
      {acao && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{acao}</div>}
    </div>
  );
}

/**
 * Esqueleto no formato da tela: a faixa de resumo (total + seis situações),
 * as abas e a trilha da linha do tempo. Antes eram cinco barras cinza iguais,
 * que não lembravam nada do que ia aparecer.
 */
export function EsqueletoDoHistorico({ label }: { label: string }) {
  return (
    <div className="space-y-5" aria-busy="true" data-testid="hes-esqueleto">
      <div className="space-y-2" aria-hidden="true">
        <div className="val-osso h-3.5 w-40" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
          <div className="col-span-2 flex items-center gap-4 bg-card px-4 py-3.5 sm:col-span-3 xl:col-span-6">
            <div className="val-osso h-6 w-24" />
            <div className="val-osso h-2 flex-1 !rounded-full" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 bg-card px-4 py-3">
              <div className="val-osso h-3 w-24" />
              <div className="val-osso h-6 w-10" />
              <div className="val-osso h-2.5 w-4/5" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <div className="val-osso h-[38px] w-[360px] max-w-full !rounded-lg" />
        <div className="val-osso hidden h-3 w-28 sm:block" />
      </div>
      <div className="rounded-xl border border-border bg-card px-4 py-3" aria-hidden="true">
        <div className="val-osso mb-4 h-3 w-36" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mb-4 grid grid-cols-[2.75rem_1.75rem_minmax(0,1fr)] gap-x-2.5 last:mb-1">
            <div className="val-osso mt-2 h-3 w-9 justify-self-end" />
            <div className="val-osso h-7 w-7 !rounded-full" />
            <div className="space-y-2 pt-1">
              <div className="val-osso h-3.5 w-2/5" />
              <div className="val-osso h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
      <p role="status" className="sr-only">{label}</p>
    </div>
  );
}
