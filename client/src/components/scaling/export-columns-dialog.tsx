/**
 * Modal do Exportar da Escalação — o usuário marca QUAIS colunas saem e escolhe
 * o formato (Excel ou PDF). Pedido do dono, 27/08.
 *
 * A seleção fica no navegador (localStorage): quem exporta o mesmo recorte toda
 * semana não remarca 40 caixas. Colunas novas que surgirem no código entram
 * marcadas por padrão — o que o usuário desmarcou continua desmarcado.
 */
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ALL_EXPORT_COLUMNS, EXPORT_COLUMN_GROUPS } from "./export-scaling-xlsx";

const STORAGE_KEY = "scaling-export-columns-v1";

/** Colunas desmarcadas guardadas no navegador (guardar as DESMARCADAS faz coluna nova nascer marcada). */
function lerDesmarcadas(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function gravarDesmarcadas(desmarcadas: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(desmarcadas))); } catch { /* modo privado etc. */ }
}

export type ExportFormat = "xlsx" | "pdf";

export function ExportColumnsDialog({ open, onOpenChange, onExport, exporting }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado com as colunas MARCADAS (na ordem canônica) e o formato. */
  onExport: (columns: string[], format: ExportFormat) => void;
  exporting?: boolean;
}) {
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(lerDesmarcadas);
  useEffect(() => { if (open) setDesmarcadas(lerDesmarcadas()); }, [open]);

  const marcadas = useMemo(
    () => ALL_EXPORT_COLUMNS.filter((k) => !desmarcadas.has(k)),
    [desmarcadas],
  );

  const alternar = (key: string) => setDesmarcadas((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    gravarDesmarcadas(n);
    return n;
  });
  const alternarGrupo = (keys: string[], marcar: boolean) => setDesmarcadas((prev) => {
    const n = new Set(prev);
    for (const k of keys) { if (marcar) n.delete(k); else n.add(k); }
    gravarDesmarcadas(n);
    return n;
  });

  const exportar = (formato: ExportFormat) => {
    if (marcadas.length === 0) return;
    onExport(marcadas, formato);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !exporting && onOpenChange(o)}>
      <DialogContent className="max-w-3xl p-0 gap-0 flex flex-col max-h-[92vh] overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 pr-12">
          <DialogTitle>Exportar escalações</DialogTitle>
          <DialogDescription>
            Marque as colunas que devem sair no arquivo. A escolha fica salva neste navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 tabular-nums">
              {marcadas.length} de {ALL_EXPORT_COLUMNS.length} colunas marcadas
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" className="h-7 rounded-lg text-xs"
                onClick={() => alternarGrupo(ALL_EXPORT_COLUMNS, true)}>Marcar todas</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 rounded-lg text-xs"
                onClick={() => alternarGrupo(ALL_EXPORT_COLUMNS, false)}>Desmarcar todas</Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {EXPORT_COLUMN_GROUPS.map((grupo) => {
              const todasDoGrupo = grupo.keys.every((k) => !desmarcadas.has(k));
              return (
                <fieldset key={grupo.label} className="rounded-2xl border border-slate-200 p-3">
                  <legend className="px-1">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                      <Checkbox
                        checked={todasDoGrupo}
                        onCheckedChange={(c) => alternarGrupo(grupo.keys, c === true)}
                        aria-label={`Marcar todas as colunas de ${grupo.label}`}
                      />
                      {grupo.label}
                    </label>
                  </legend>
                  <div className="mt-1 grid gap-1">
                    {grupo.keys.map((k) => (
                      <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] text-slate-700 hover:bg-slate-50">
                        <Checkbox checked={!desmarcadas.has(k)} onCheckedChange={() => alternar(k)} aria-label={k} />
                        {k}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-6 py-3">
          <DialogFooter className="gap-2 sm:gap-2">
            {marcadas.length === 0 && (
              <p role="alert" className="mr-auto self-center text-xs text-red-700">Marque ao menos uma coluna.</p>
            )}
            <Button type="button" variant="outline" className="rounded-lg bg-white" disabled={exporting}
              onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" variant="outline" disabled={marcadas.length === 0 || exporting}
              onClick={() => exportar("pdf")}
              className="rounded-lg border-slate-200 bg-white hover:bg-brand-soft hover:text-primary"
              title="Abre a janela de impressão — escolha “Salvar como PDF”">
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" /> PDF
            </Button>
            <Button type="button" disabled={marcadas.length === 0 || exporting}
              onClick={() => exportar("xlsx")}
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {exporting ? "Exportando…" : "Excel"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
