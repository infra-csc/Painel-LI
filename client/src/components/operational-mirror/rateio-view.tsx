/**
 * Visão Rateio do espelho operacional (25/09 — extraída da página; redesenho 07/10).
 *
 * Rateio do evento em DUAS dimensões, como a planilha da equipe (28/08):
 * "Conta" é o rateio contábil com que o financeiro fecha (vários
 * departamentos caem na mesma conta); "Departamento" responde quem gastou.
 * Antes as duas tabelas daqui mostravam a mesma coisa, porque department caía
 * no nome da função quando a área não estava preenchida.
 *
 * 07/10: as duas tabelas no desenho de tabela do app; a linha de total fecha
 * cada coluna (não só o subtotal) e cada linha diz quanto pesa no evento.
 */
import { Link } from "wouter";
import { AlertTriangle, Building2, Landmark } from "lucide-react";
import type { MirrorTotals, MirrorSubtotal } from "@shared/operational-mirror-types";
import { cn } from "@/lib/utils";
import { brl } from "./mirror-shared";

/** Célula de valor: zero fica apagado para o que foi gasto saltar aos olhos. */
function Valor({ v, forte }: { v: number; forte?: boolean }) {
  return <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${forte ? "font-semibold text-foreground" : v ? "text-foreground" : "text-muted-foreground/70"}`}>{brl(v)}</td>;
}

function RateioTabela({ titulo, icone, linhas, vazio }: {
  titulo: string;
  icone: React.ReactNode;
  linhas: MirrorSubtotal[];
  vazio: string;
}) {
  const total = linhas.reduce((acc, l) => acc + l.total, 0);
  const soma = (k: "tickets" | "hotel" | "baggage" | "uber" | "carRental") => linhas.reduce((acc, l) => acc + (l[k] || 0), 0);
  const th = "h-9 whitespace-nowrap border-b border-border px-3 text-right align-middle text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-muted-foreground">{icone}</span>
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        {linhas.length > 0 && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{linhas.length} {linhas.length === 1 ? "linha" : "linhas"}</span>}
      </header>
      {linhas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className={cn(th, "pl-4 text-left")}>{titulo.includes("Conta") || titulo.includes("conta") ? "Conta" : "Departamento"}</th>
                <th scope="col" className={th}>Passagem</th><th scope="col" className={th}>Hotel</th>
                <th scope="col" className={th}>Bag.</th><th scope="col" className={th}>Uber</th>
                <th scope="col" className={th}>Locação</th><th scope="col" className={cn(th, "pr-4")}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((d) => {
                const peso = total > 0 ? Math.round((d.total / total) * 100) : 0;
                return (
                  <tr key={d.name} className="transition-colors hover:bg-surface-muted/60 [&>td]:border-b [&>td]:border-border/60">
                    <td className="py-2 pl-4 pr-3 capitalize text-foreground">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{d.name}</span>
                        {peso > 0 && <span className="text-2xs tabular-nums text-muted-foreground">{peso}%</span>}
                      </span>
                    </td>
                    <Valor v={d.tickets} /><Valor v={d.hotel} /><Valor v={d.baggage} /><Valor v={d.uber} /><Valor v={d.carRental} />
                    <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right font-semibold tabular-nums text-foreground">{brl(d.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-muted">
              <tr className="[&>td]:border-t [&>td]:border-border">
                <td className="py-2 pl-4 pr-3 text-2xs font-semibold uppercase tracking-[0.06em] text-slate-700">Total</td>
                <Valor v={soma("tickets")} forte /><Valor v={soma("hotel")} forte /><Valor v={soma("baggage")} forte /><Valor v={soma("uber")} forte /><Valor v={soma("carRental")} forte />
                <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right text-sm font-semibold tabular-nums text-foreground">{brl(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

export function RateioView({ totals }: { totals: MirrorTotals; hotelDerived?: boolean }) {
  // Só vale mostrar o rateio por conta quando alguma função tem conta
  // preenchida — senão seria uma tabela com uma linha "(sem conta)".
  const contas = (totals.byAccount || []).filter((c) => c.name !== "(sem conta)");
  const semConta = (totals.byAccount || []).find((c) => c.name === "(sem conta)");

  return (
    <div className="space-y-4">
      {contas.length === 0 && semConta && semConta.total > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft/70 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-warning">
            <strong className="font-semibold">O rateio por conta está vazio.</strong> Defina a conta de cada função em{" "}
            <Link href="/functions" className="font-medium underline underline-offset-2">Funções</Link> — é a coluna
            que diz em qual conta o custo do evento entra (cenotécnica, kit e percurso caem em LI,
            por exemplo). Sem isso, {brl(semConta.total)} ficam sem rateio.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-2">
        <RateioTabela
          titulo="Rateio por conta"
          icone={<Landmark className="h-4 w-4" aria-hidden="true" />}
          linhas={totals.byAccount || []}
          vazio="Nenhuma função tem conta definida."
        />
        <RateioTabela
          titulo="Subtotais por departamento"
          icone={<Building2 className="h-4 w-4" aria-hidden="true" />}
          linhas={totals.byDepartment || []}
          vazio="Sem departamentos."
        />
      </div>
    </div>
  );
}
