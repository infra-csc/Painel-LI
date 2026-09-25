/**
 * "Exportar CSV" do Histórico (25/09 — extraído da página): botão do cabeçalho
 * (com o motivo quando não há o que exportar) e o diálogo da aba corrente.
 */
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EXPORT_COLS, EXPORT_EVENT_COL, TAB_LABEL, type Tab } from "./event-view-shared";
import type { EventExport } from "./use-event-export";

export function ExportButton({ exp, effectiveTab }: { exp: EventExport; effectiveTab: Tab }) {
  const { exportEnabled, setExportOpen } = exp;
  /* Sem `disabled`: o botão continua na tabulação e o tooltip abre
     também pelo teclado, explicando POR QUE não há o que exportar.
     O clique é guardado; o sr-only repete o motivo para o leitor. */
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button" size="sm" variant="outline"
          aria-disabled={!exportEnabled}
          className={cn("rounded-lg whitespace-nowrap", !exportEnabled && "cursor-not-allowed opacity-50 hover:bg-background hover:text-foreground")}
          onClick={() => { if (exportEnabled) setExportOpen(true); }}
        >
          <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Exportar CSV
          <span className="sr-only">{exportEnabled ? ` — aba ${TAB_LABEL[effectiveTab]}` : " — nada para exportar nesta aba"}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{exportEnabled ? `Exporta a aba ${TAB_LABEL[effectiveTab]} com os filtros aplicados` : "Nada para exportar nesta aba"}</TooltipContent>
    </Tooltip>
  );
}

export function ExportDialog({ exp, effectiveTab, eventId }: { exp: EventExport; effectiveTab: Tab; eventId: string }) {
  const { exportOpen, setExportOpen, exportFilename, exportCsv } = exp;
  return (
    <Dialog open={exportOpen} onOpenChange={setExportOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar o histórico em CSV</DialogTitle>
          <DialogDescription>
            O arquivo sai com a aba aberta agora — <strong className="font-semibold text-slate-700">{TAB_LABEL[effectiveTab]}</strong> — com os filtros aplicados agora, separado por ponto e vírgula, pronto para o Excel.
          </DialogDescription>
        </DialogHeader>
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {/* "Evento" é a primeira coluna no modo "todos" (o quadro Escala só existe com evento). */}
          {[...(!eventId && effectiveTab !== "escala" ? [EXPORT_EVENT_COL] : []), ...EXPORT_COLS[effectiveTab]].map(([grupo, cols]) => (
            <li key={grupo} className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground last:border-b-0">
              <span className="font-semibold text-slate-700">{grupo}</span> {cols}
            </li>
          ))}
        </ul>
        <p className="font-mono text-2xs text-muted-foreground break-all">{exportFilename}</p>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-lg" onClick={() => setExportOpen(false)}>Cancelar</Button>
          <Button type="button" className="rounded-lg" onClick={exportCsv}>Baixar CSV</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
