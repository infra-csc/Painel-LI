/**
 * Relatórios do Financeiro (16/10). O principal é o TOTAL POR EVENTO (pedido,
 * aprovado, liberado, a liberar); também por mês, por pessoa/empreita e por
 * setor × posição. As somas moram em shared/honorarios-ceno.ts (com teste);
 * aqui só a apresentação e o CSV (sem fórmula — padrão do app).
 */
import { useMemo } from "react";
import { BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/components/scaling-validation/event-view/event-view-shared";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { MOLDURA } from "@/components/scaling-approval/tokens";
import { RELATORIOS, csvDoRelatorio, somarGrupos, type GrupoDoRelatorio, type TipoDeRelatorio } from "@shared/honorarios-ceno";
import type { Honorario } from "./api";
import { BarraDaVerba, brl } from "./pecas";

export const TIPOS_DE_RELATORIO: TipoDeRelatorio[] = ["evento", "mes", "pessoa", "setor"];

const TH = "px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap";
const NUM = "px-3 py-2.5 text-right tabular-nums";

function Celula({ v, forte, tom }: { v: number; forte?: boolean; tom?: "warning" | "muted" }) {
  return (
    <td className={cn(NUM, forte ? "font-semibold text-foreground" : "text-slate-700", tom === "warning" && v > 0 && "font-semibold text-warning", (tom === "muted" || v === 0) && !forte && "text-muted-foreground")}>
      {v === 0 ? "—" : brl(v)}
    </td>
  );
}

/** `preambulo` (23/10): linhas de abertura do arquivo com o período e o evento. */
export function exportarRelatorio(tipo: TipoDeRelatorio, grupos: GrupoDoRelatorio[], sufixo: string, preambulo: string[][] = []) {
  const { cabecalho, linhas } = csvDoRelatorio(tipo, grupos);
  downloadCsv(`honorarios-cenotecnica-${tipo}${sufixo}.csv`, cabecalho, linhas, preambulo);
}

export function Relatorios({ linhas, tipo, onTipo, sufixoDoArquivo, preambulo, periodo, acaoSemDados }: {
  linhas: Honorario[]; tipo: TipoDeRelatorio; onTipo: (t: TipoDeRelatorio) => void; sufixoDoArquivo: string;
  /** Linhas de abertura do CSV, pelo rótulo do relatório (23/10: o período e o evento). */
  preambulo?: (rotulo: string) => string[][];
  /** "01/10/2026 a 31/10/2026" quando há período: vai para o vazio e a nota de rodapé. */
  periodo?: string | null;
  /** Botão do vazio (ex.: limpar o período). */
  acaoSemDados?: React.ReactNode;
}) {
  const r = RELATORIOS[tipo];
  const grupos = useMemo(() => r.gerar(linhas), [r, linhas]);
  const total = useMemo(() => somarGrupos(grupos), [grupos]);
  const largo = useMediaQuery("(min-width: 768px)");
  return (
    <div className="space-y-3" data-testid="hon-relatorios">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Tipo de relatório" className="val-rolagem-x -mx-[var(--page-gutter)] max-w-[calc(100%+2*var(--page-gutter))] px-[var(--page-gutter)] sm:mx-0 sm:max-w-full sm:px-0">
          <div className="inline-flex w-max gap-0.5 rounded-lg border border-border bg-background p-[3px]">
            {TIPOS_DE_RELATORIO.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => onTipo(t)}
                className={cn("val-alvo inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-[color,background-color,box-shadow] duration-150",
                  tipo === t ? "bg-card font-semibold text-primary shadow-1 ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                {RELATORIOS[t].rotulo}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="val-alvo" disabled={grupos.length === 0} onClick={() => exportarRelatorio(tipo, grupos, sufixoDoArquivo, preambulo?.(r.rotulo) ?? [])} data-testid="hon-exportar-relatorio">
          <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
        </Button>
      </div>

      {grupos.length === 0 ? null : !largo ? (
        <ul className="space-y-2" aria-label={`Honorários — ${r.rotulo.toLowerCase()}`}>
          {[...grupos, { ...total, chave: "__total", rotulo: "Total", detalhe: null, ordem: "" }].map((g) => (
            <li key={g.chave} className={cn("rounded-xl border px-3.5 py-3", g.chave === "__total" ? "border-foreground/15 bg-surface-muted" : "border-border bg-card shadow-1")}>
              <p className="text-sm font-semibold text-foreground">{g.rotulo}</p>
              <p className="text-2xs text-muted-foreground">{[g.detalhe, `${g.linhas} ${g.linhas === 1 ? "linha" : "linhas"}`, g.emNegociacao ? `${g.emNegociacao} em negociação` : null].filter(Boolean).join(" · ")}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {([["Pedido", g.pedido], ["Aprovado", g.aprovado], ["Liberado", g.liberado], ["A liberar", g.aLiberar]] as const).map(([rot, v]) => (
                  <div key={rot} className="flex items-baseline justify-between gap-2"><dt className="text-muted-foreground">{rot}</dt><dd className={cn("font-semibold tabular-nums", rot === "A liberar" && v > 0 ? "text-warning" : "text-foreground")}>{v ? brl(v) : "—"}</dd></div>
                ))}
              </dl>
              {g.aprovado > 0 && <BarraDaVerba aprovado={g.aprovado} liberado={g.liberado} className="mt-2" />}
            </li>
          ))}
        </ul>
      ) : null}
      {grupos.length === 0 ? (
        periodo ? (
          <EstadoDaValidacao icone={<BarChart3 aria-hidden="true" />} titulo="Nada para somar neste período"
            texto={`Nenhum honorário enviado de evento que começa em ${periodo}.`} acao={acaoSemDados} testId="hon-relatorio-periodo-vazio" />
        ) : (
          <EstadoDaValidacao icone={<BarChart3 aria-hidden="true" />} titulo="Nada para somar ainda"
            texto="Os relatórios somam o que a cenotécnica já enviou para aprovação — rascunhos não entram." />
        )
      ) : !largo ? null : (
        <div className={cn(MOLDURA, "overflow-x-auto")}>
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">Honorários da cenotécnica — {r.rotulo.toLowerCase()}</caption>
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                <th scope="col" className={cn(TH, "text-left")}>{r.coluna}</th>
                <th scope="col" className={cn(TH, "text-right")}>Pedido</th>
                <th scope="col" className={cn(TH, "text-right")}>Aguardando</th>
                <th scope="col" className={cn(TH, "text-right")}>Aprovado</th>
                <th scope="col" className={cn(TH, "text-right")}>Liberado</th>
                <th scope="col" className={cn(TH, "text-right")}>A liberar</th>
                <th scope="col" className={cn(TH, "w-[150px] text-left")}>Verba</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grupos.map((g) => (
                <tr key={g.chave} className="transition-colors hover:bg-surface-muted/50">
                  <th scope="row" className="px-3 py-2.5 text-left font-normal">
                    <span className="block font-medium text-foreground">{g.rotulo}</span>
                    <span className="block text-2xs text-muted-foreground">
                      {[g.detalhe, `${g.linhas} ${g.linhas === 1 ? "linha" : "linhas"}`, g.emNegociacao ? `${g.emNegociacao} em negociação` : null].filter(Boolean).join(" · ")}
                    </span>
                  </th>
                  <Celula v={g.pedido} />
                  <Celula v={g.aguardando} tom="muted" />
                  <Celula v={g.aprovado} forte />
                  <Celula v={g.liberado} />
                  <Celula v={g.aLiberar} tom="warning" />
                  <td className="px-3 py-2.5">{g.aprovado > 0 ? <BarraDaVerba aprovado={g.aprovado} liberado={g.liberado} /> : <span className="text-2xs text-muted-foreground">sem aprovação</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-surface-muted/70">
              <tr>
                <th scope="row" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total</th>
                <Celula v={total.pedido} forte />
                <Celula v={total.aguardando} tom="muted" />
                <Celula v={total.aprovado} forte />
                <Celula v={total.liberado} forte />
                <Celula v={total.aLiberar} tom="warning" />
                <td className="px-3 py-2.5">{total.aprovado > 0 && <BarraDaVerba aprovado={total.aprovado} liberado={total.liberado} />}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-2xs text-muted-foreground">
        Pedido = o que foi enviado (aguardando + aprovados). Devolvidos para negociar ficam fora das somas até voltarem. Mês = mês de início do evento.
        {periodo ? ` Período: eventos que começam em ${periodo}.` : ""}
      </p>
    </div>
  );
}
