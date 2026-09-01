/**
 * Importar a planilha do Espelho Operacional (31/08).
 *
 * A equipe exporta, preenche em lote — uma agência devolve 30 localizadores de
 * uma vez — e precisava digitar tudo de volta célula a célula.
 *
 * A tela é em dois passos de propósito: ler o arquivo e MOSTRAR o que muda,
 * depois aplicar. Ninguém deveria gravar duzentas alterações num evento a
 * partir de um arquivo que acabou de escolher, sem ver o que ele contém.
 */
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

import { totalDeAlteracoes, type LinhaImportada, type ResultadoDaLeitura, type ValorImportado } from "@shared/mirror-import";

/** Rótulo humano de cada campo — a planilha fala em colunas, a tela em campos. */
const ROTULO: Record<string, string> = {
  "schedule.startDate": "Início", "schedule.departureDate": "Data ida",
  "schedule.endDate": "Término", "schedule.returnDate": "Data volta",
  "ticket.value": "Passagem — valor", "ticket.departureAirport": "Aero ida",
  "ticket.actualDepartureTime": "Hora ida", "ticket.actualReturnTime": "Hora volta",
  "ticket.returnOriginAirport": "Aero volta", "ticket.locator": "Localizador",
  "ticket.ticketCompany": "Companhia", "ticket.purchaseOrderNumber": "OC da passagem",
  "ticket.checkIn3": "Conferência da passagem",
  "accommodation.nightsCount": "Noites", "accommodation.dailyRate": "Diária",
  "accommodation.lateCheckout": "Late check-out", "accommodation.totalCents": "Hotel — total",
  "accommodation.hotelName": "Hotel", "accommodation.paymentCompany": "Pagador",
  "accommodation.hotelOc": "OC do hotel", "accommodation.checkIn4": "Conferência do hotel",
  "baggage.amountCents": "Bagagem — valor", "baggage.oc": "OC da bagagem", "baggage.checkIn": "Conferência da bagagem",
  "uber.amountCents": "Uber — valor", "uber.oc": "OC do Uber", "uber.checkIn": "Conferência do Uber",
  "carRental.company": "Locadora", "carRental.amountCents": "Locação — valor",
  "carRental.oc": "OC da locação", "carRental.checkIn": "Conferência da locação",
};

const EH_DINHEIRO = new Set([
  "ticket.value", "accommodation.dailyRate", "accommodation.totalCents",
  "baggage.amountCents", "uber.amountCents", "carRental.amountCents",
]);

function texto(campo: string, v: ValorImportado): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (EH_DINHEIRO.has(campo) && typeof v === "number") return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return String(v);
}

export function ImportarPlanilha({ eventId, aoAplicar }: {
  eventId: string;
  /** Chamado depois de gravar, para a tela recarregar. */
  aoAplicar: (gravados: number, falhas: number) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [leitura, setLeitura] = useState<ResultadoDaLeitura | null>(null);
  const [nomeDoArquivo, setNomeDoArquivo] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ler = useMutation({
    mutationFn: async (arquivo: File) => {
      const fd = new FormData();
      fd.append("file", arquivo);
      const r = await fetch(`/api/events/${eventId}/operational-mirror/import/preview`, {
        method: "POST", body: fd, credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Não foi possível ler a planilha.");
      return (await r.json()) as ResultadoDaLeitura;
    },
    onSuccess: (r) => setLeitura(r),
  });

  const aplicar = useMutation({
    mutationFn: async (linhas: LinhaImportada[]) =>
      (await apiRequest("POST", `/api/events/${eventId}/operational-mirror/import/aplicar`, { linhas })).json(),
    onSuccess: (r: { gravados: number; falhas: unknown[] }) => {
      setAberto(false);
      setLeitura(null);
      setNomeDoArquivo("");
      aoAplicar(r.gravados, r.falhas?.length ?? 0);
    },
  });

  const escolher = (arquivo: File | undefined) => {
    if (!arquivo) return;
    setNomeDoArquivo(arquivo.name);
    setLeitura(null);
    ler.mutate(arquivo);
  };

  const comMudanca = (leitura?.linhas ?? []).filter((l) => l.alteracoes.length > 0);
  const deFora = (leitura?.linhas ?? []).filter((l) => l.problema);
  const total = totalDeAlteracoes(comMudanca);

  return (
    <>
      <Button variant="outline" size="sm" className="h-[34px]" onClick={() => setAberto(true)} data-testid="button-import">
        <Upload className="h-4 w-4 mr-2" aria-hidden="true" /> Importar planilha
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => { if (!aplicar.isPending) { setAberto(o); if (!o) { setLeitura(null); setNomeDoArquivo(""); } } }}>
        <DialogContent className="!max-w-[720px] w-[95vw] max-h-[88vh] rounded-2xl !flex !flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-3 pr-12 text-left">
            <DialogTitle>Importar planilha do espelho</DialogTitle>
            <DialogDescription>
              É a planilha que sai em "Exportar planilha", preenchida. Campo em branco não apaga
              o que já está no sistema — só o que estiver preenchido é gravado.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }}
              />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={ler.isPending}>
                {ler.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4 mr-2" aria-hidden="true" />}
                {ler.isPending ? "Lendo…" : "Escolher arquivo"}
              </Button>
              {nomeDoArquivo && <span className="text-xs text-muted-foreground">{nomeDoArquivo}</span>}
            </div>

            {ler.error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {(ler.error as Error).message}
              </p>
            )}

            {leitura?.avisos?.map((a) => (
              <p key={a} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {a}
              </p>
            ))}

            {leitura && !leitura.formatoInvalido && (
              <>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{total}</span>{" "}
                  {total === 1 ? "alteração" : "alterações"} em{" "}
                  <span className="font-semibold tabular-nums">{comMudanca.length}</span>{" "}
                  {comMudanca.length === 1 ? "pessoa" : "pessoas"}.
                </p>

                {comMudanca.length > 0 && (
                  <ul className="divide-y rounded-xl border" data-testid="import-preview">
                    {comMudanca.map((l) => (
                      <li key={l.teamInclusionId} className="px-3 py-2">
                        <p className="text-[13px] font-semibold">{l.nome}</p>
                        <ul className="mt-1 space-y-0.5">
                          {l.alteracoes.map((a) => (
                            <li key={a.campo} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                              <span className="min-w-[150px] text-muted-foreground">{ROTULO[a.campo] ?? a.campo}</span>
                              <span className="text-muted-foreground line-through">{texto(a.campo, a.de)}</span>
                              <span aria-hidden="true">→</span>
                              <span className="font-medium">{texto(a.campo, a.para)}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}

                {deFora.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                      Fora da importação
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {deFora.map((l) => (
                        <li key={l.nome} className="text-xs text-amber-900 dark:text-amber-200">
                          <span className="font-medium">{l.nome}</span> — {l.problema}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t bg-muted/40 px-6 py-3">
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={aplicar.isPending}>Cancelar</Button>
            <Button
              type="button"
              disabled={total === 0 || aplicar.isPending}
              onClick={() => aplicar.mutate(comMudanca)}
              data-testid="button-import-aplicar"
            >
              {aplicar.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> Aplicando…</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" /> Aplicar {total > 0 ? total : ""} {total === 1 ? "alteração" : "alterações"}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ImportarPlanilha;
