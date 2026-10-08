/**
 * "Exportar CSV" do Histórico (25/09 — extraído da página): botão da barra
 * (com o motivo quando não há o que exportar) e o diálogo da aba corrente.
 *
 * 07/10 (redesenho premium): o diálogo em seções, com rodapé fixo — o que vai
 * sair (aba, evento, quantas linhas), as colunas na ordem do arquivo e o nome
 * do arquivo. Antes era um parágrafo de três linhas e uma lista de grupos
 * colados ao rótulo ("Quando data e hora"), sem dizer quantas linhas vinham.
 */
import type { ReactNode } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CONTORNO, EXPORT_COLS, EXPORT_EVENT_COL, TAB_LABEL, plural, type Tab } from "./event-view-shared";
import type { EventExport } from "./use-event-export";

export function ExportButton({ exp, effectiveTab }: { exp: EventExport; effectiveTab: Tab }) {
  const { exportEnabled, setExportOpen } = exp;
  /* Sem `disabled`: o botão continua na tabulação e o tooltip abre
     também pelo teclado, explicando POR QUE não há o que exportar.
     O clique é guardado; o sr-only repete o motivo para o leitor. */
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled={!exportEnabled}
          className={cn(CONTORNO, "hes-exportar", !exportEnabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-card hover:text-slate-700")}
          onClick={() => { if (exportEnabled) setExportOpen(true); }}
          data-testid="hes-exportar"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Exportar<span className="hidden sm:inline"> CSV</span></span>
          <span className="sr-only">{exportEnabled ? ` — aba ${TAB_LABEL[effectiveTab]}` : " — nada para exportar nesta aba"}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">{exportEnabled ? `Exporta a aba ${TAB_LABEL[effectiveTab]} com os filtros aplicados` : "Nada para exportar nesta aba"}</TooltipContent>
    </Tooltip>
  );
}

/** Linha "rótulo · valor" do bloco do que vai sair. */
function Fato({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 bg-card px-3 py-2", className)}>
      <dt className="text-2xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

export function ExportDialog({ exp, effectiveTab, eventId, eventName }: { exp: EventExport; effectiveTab: Tab; eventId: string; eventName?: string }) {
  const { exportOpen, setExportOpen, exportFilename, exportCsv, exportRows } = exp;
  // "Evento" é a primeira coluna no modo "todos" (o quadro Escala só existe com evento).
  const colunas = [...(!eventId && effectiveTab !== "escala" ? [EXPORT_EVENT_COL] : []), ...EXPORT_COLS[effectiveTab]];
  return (
    <Dialog open={exportOpen} onOpenChange={setExportOpen}>
      <DialogContent className="flex max-h-[min(640px,calc(100dvh-2rem))] max-w-lg flex-col gap-0 overflow-hidden rounded-xl p-0">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-5 pb-4 pr-12 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Exportar o histórico em CSV
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Sai a aba aberta agora, com os filtros aplicados agora — separado por ponto e vírgula, pronto para o Excel.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-2 gap-px sm:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,0.9fr)] overflow-hidden rounded-lg border border-border bg-border">
            <Fato rotulo="Aba">{TAB_LABEL[effectiveTab]}</Fato>
            <Fato rotulo="Evento" className="order-last col-span-2 sm:order-none sm:col-span-1"><span title={eventName ?? "Todos os eventos"}>{eventId ? eventName ?? "Evento" : "Todos"}</span></Fato>
            <Fato rotulo="Linhas"><span className="tabular-nums">{plural(exportRows, "linha", "linhas")}</span></Fato>
          </dl>

          <section aria-labelledby="hes-exportar-colunas" className="space-y-2">
            <h3 id="hes-exportar-colunas" className="text-xs font-semibold text-foreground">Colunas, na ordem do arquivo</h3>
            <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {colunas.map(([grupo, cols], i) => (
                <li key={grupo} className="grid grid-cols-[1.25rem_minmax(0,7.5rem)_minmax(0,1fr)] items-baseline gap-x-2.5 px-3 py-2 text-xs">
                  <span className="text-right tabular-nums text-muted-foreground" aria-hidden="true">{i + 1}</span>
                  <span className="font-semibold text-foreground">{grupo}</span>
                  <span className="text-muted-foreground">{cols}</span>
                </li>
              ))}
            </ol>
          </section>

          <p className="flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2 text-2xs text-muted-foreground">
            <Download className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-all font-mono">{exportFilename}</span>
          </p>
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border bg-surface-muted/60 px-5 py-3 sm:space-x-0">
          <Button type="button" variant="outline" className="val-alvo h-9 rounded-lg" onClick={() => setExportOpen(false)}>Cancelar</Button>
          <Button type="button" className="hes-baixar val-alvo h-9 rounded-lg bg-primary font-semibold shadow-1 hover:bg-primary-hover" onClick={exportCsv} data-testid="hes-baixar-csv">
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" /> Baixar CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
