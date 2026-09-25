/**
 * Visão Rateio do espelho operacional (25/09 — extraída da página).
 *
 * Rateio do evento em DUAS dimensões, como a planilha da equipe (28/08):
 * "Conta" é o rateio contábil com que o financeiro fecha (vários
 * departamentos caem na mesma conta); "Departamento" responde quem gastou.
 * Antes as duas tabelas daqui mostravam a mesma coisa, porque department caía
 * no nome da função quando a área não estava preenchida.
 */
import { Link } from "wouter";
import { AlertTriangle, Building2, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MirrorTotals, MirrorSubtotal } from "@shared/operational-mirror-types";
import { brl } from "./mirror-shared";

/** Célula de valor: zero fica apagado para o que foi gasto saltar aos olhos. */
function Valor({ v }: { v: number }) {
  return <td className={`p-2 text-right tabular-nums ${v ? "" : "text-muted-foreground"}`}>{brl(v)}</td>;
}

function RateioTabela({ titulo, icone, linhas, vazio }: {
  titulo: string;
  icone: React.ReactNode;
  linhas: MirrorSubtotal[];
  vazio: string;
}) {
  const total = linhas.reduce((acc, l) => acc + l.total, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{icone} {titulo}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {linhas.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">{vazio}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th scope="col" className="p-2 font-medium">{titulo.includes("Conta") ? "Conta" : "Departamento"}</th>
                  <th scope="col" className="p-2 font-medium text-right">Passagem</th><th scope="col" className="p-2 font-medium text-right">Hotel</th>
                  <th scope="col" className="p-2 font-medium text-right">Bag.</th><th scope="col" className="p-2 font-medium text-right">Uber</th>
                  <th scope="col" className="p-2 font-medium text-right">Locação</th><th scope="col" className="p-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((d) => (
                  <tr key={d.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-2 capitalize">{d.name}</td>
                    <Valor v={d.tickets} /><Valor v={d.hotel} /><Valor v={d.baggage} /><Valor v={d.uber} /><Valor v={d.carRental} />
                    <td className="p-2 text-right tabular-nums font-semibold">{brl(d.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="p-2">Total</td>
                  <td className="p-2" colSpan={5} />
                  <td className="p-2 text-right tabular-nums">{brl(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RateioView({ totals }: { totals: MirrorTotals; hotelDerived?: boolean }) {
  // Só vale mostrar o rateio por conta quando alguma função tem conta
  // preenchida — senão seria uma tabela com uma linha "(sem conta)".
  const contas = (totals.byAccount || []).filter((c) => c.name !== "(sem conta)");
  const semConta = (totals.byAccount || []).find((c) => c.name === "(sem conta)");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <RateioTabela
          titulo="Rateio por Conta"
          icone={<Landmark className="h-4 w-4" aria-hidden="true" />}
          linhas={totals.byAccount || []}
          vazio="Nenhuma função tem conta definida."
        />
        <RateioTabela
          titulo="Subtotais por Departamento"
          icone={<Building2 className="h-4 w-4" aria-hidden="true" />}
          linhas={totals.byDepartment || []}
          vazio="Sem departamentos."
        />
      </div>

      {contas.length === 0 && semConta && semConta.total > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft/60 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-warning">
            <strong>O rateio por conta está vazio.</strong> Defina a conta de cada função em{" "}
            <Link href="/functions" className="underline font-medium">Funções</Link> — é a coluna
            que diz em qual conta o custo do evento entra (cenotécnica, kit e percurso caem em LI,
            por exemplo). Sem isso, {brl(semConta.total)} ficam sem rateio.
          </p>
        </div>
      )}

    </div>
  );
}
