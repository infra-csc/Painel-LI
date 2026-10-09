/**
 * Importar a planilha do Espelho Operacional (31/08; redesenho 07/10).
 *
 * A equipe exporta, preenche em lote — uma agência devolve 30 localizadores de
 * uma vez — e precisava digitar tudo de volta célula a célula.
 *
 * A tela é em dois passos de propósito: ler o arquivo e MOSTRAR o que muda,
 * depois aplicar. Ninguém deveria gravar duzentas alterações num evento a
 * partir de um arquivo que acabou de escolher, sem ver o que ele contém.
 *
 * 07/10: o arquivo também pode ser arrastado para a área do diálogo; a prévia
 * vira uma tabela por pessoa (campo · de → para), com o resumo no rodapé, ao
 * lado do botão que aplica — quem decide vê o número que vai gravar.
 */
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

import { totalDeAlteracoes, type LinhaImportada, type ResultadoDaLeitura, type ValorImportado } from "@shared/mirror-import";

import { formatarMoeda } from "@/lib/format";
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
  if (EH_DINHEIRO.has(campo) && typeof v === "number") return formatarMoeda(v);
  return String(v);
}

export function ImportarPlanilha({ eventId, aoAplicar, aberto: abertoDeFora, aoMudarAberto, classeDoBotao }: {
  eventId: string;
  /** Chamado depois de gravar, para a tela recarregar. */
  aoAplicar: (gravados: number, falhas: number) => void;
  /** Controlado de fora — o menu "Mais" da barra também abre o diálogo. */
  aberto?: boolean;
  aoMudarAberto?: (v: boolean) => void;
  /** Classe do botão que abre o diálogo (a da barra da tela). */
  classeDoBotao?: string;
}) {
  const [abertoProprio, setAbertoProprio] = useState(false);
  const aberto = abertoDeFora ?? abertoProprio;
  const setAberto = (v: boolean) => { if (aoMudarAberto) aoMudarAberto(v); else setAbertoProprio(v); };
  const [leitura, setLeitura] = useState<ResultadoDaLeitura | null>(null);
  const [nomeDoArquivo, setNomeDoArquivo] = useState("");
  const [arrastando, setArrastando] = useState(false);
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
  const recomecar = () => { setLeitura(null); setNomeDoArquivo(""); ler.reset(); };

  const comMudanca = (leitura?.linhas ?? []).filter((l) => l.alteracoes.length > 0);
  const deFora = (leitura?.linhas ?? []).filter((l) => l.problema);
  const total = totalDeAlteracoes(comMudanca);
  const lido = !!leitura && !leitura.formatoInvalido;

  return (
    <>
      <button type="button" className={classeDoBotao ?? "inline-flex h-[34px] items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium"}
        onClick={() => setAberto(true)} data-testid="button-import" title="Importar a planilha preenchida">
        <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Importar
      </button>

      <Dialog open={aberto} onOpenChange={(o) => { if (!aplicar.isPending) { setAberto(o); if (!o) { setLeitura(null); setNomeDoArquivo(""); ler.reset(); } } }}>
        <DialogContent className="!max-w-[760px] w-[calc(100vw-24px)] max-h-[88vh] rounded-xl !flex !flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="shrink-0 border-b px-6 pt-5 pb-4 pr-12 text-left space-y-1">
            <DialogTitle className="text-base">Importar planilha do espelho</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Use a planilha que sai em <span className="font-medium text-foreground">Exportar</span>, preenchida. Campo em branco não apaga
              o que já está no sistema — só o que estiver preenchido é gravado.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }}
            />

            {!nomeDoArquivo ? (
              // Área de soltar: o arquivo costuma estar aberto no Excel ao lado.
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]); }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  arrastando ? "border-primary bg-brand-soft" : "border-border bg-surface-muted hover:border-primary/40 hover:bg-brand-soft/60",
                )}
                data-testid="import-escolher"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card text-primary shadow-1" aria-hidden="true">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-foreground">{arrastando ? "Solte para ler a planilha" : "Escolher arquivo"}</span>
                <span className="text-xs text-muted-foreground">ou arraste o .xlsx para cá</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success" aria-hidden="true">
                  <FileSpreadsheet className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{nomeDoArquivo}</span>
                  <span className="block text-xs text-muted-foreground" aria-live="polite">
                    {ler.isPending ? "Lendo a planilha…"
                      : ler.error ? "Não foi possível ler"
                      : lido ? `${total} ${total === 1 ? "alteração" : "alterações"} em ${comMudanca.length} ${comMudanca.length === 1 ? "pessoa" : "pessoas"}`
                      : leitura?.formatoInvalido ? "Formato não reconhecido" : ""}
                  </span>
                </span>
                {ler.isPending
                  ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                  : (
                    <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={() => inputRef.current?.click()} disabled={aplicar.isPending} title="Escolher outro arquivo">
                      Trocar
                    </Button>
                  )}
                {!ler.isPending && (
                  <button type="button" onClick={recomecar} aria-label="Tirar o arquivo" disabled={aplicar.isPending}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {ler.error && (
              <p role="alert" className="pas-entra flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {(ler.error as Error).message}
              </p>
            )}

            {aplicar.error && (
              <p role="alert" className="pas-entra flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {(aplicar.error as { body?: { message?: string } }).body?.message
                  ?? "Não foi possível aplicar. Parte das alterações pode ter sido gravada — confira a grade antes de tentar de novo."}
              </p>
            )}

            {leitura?.avisos?.map((a) => (
              <p key={a} className="pas-entra flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {a}
              </p>
            ))}

            {lido && comMudanca.length === 0 && (
              <p className="pas-entra rounded-lg border bg-surface-muted px-3 py-3 text-sm text-muted-foreground">
                A planilha não traz nada diferente do que já está no sistema.
              </p>
            )}

            {lido && comMudanca.length > 0 && (
              <div className="pas-entra overflow-hidden rounded-xl border" data-testid="import-preview">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b bg-surface-muted px-3.5 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <span>O que muda</span>
                  <span className="tabular-nums normal-case tracking-normal">{comMudanca.length} {comMudanca.length === 1 ? "pessoa" : "pessoas"}</span>
                </div>
                <ul className="divide-y">
                  {comMudanca.map((l) => (
                    <li key={l.teamInclusionId} className="px-3.5 py-2.5">
                      <p className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                        {l.nome}
                        <span className="text-2xs font-normal tabular-nums text-muted-foreground">{l.alteracoes.length} {l.alteracoes.length === 1 ? "campo" : "campos"}</span>
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {l.alteracoes.map((a) => (
                          <li key={a.campo} className="grid grid-cols-1 gap-x-3 text-xs sm:grid-cols-[160px_minmax(0,1fr)]">
                            <span className="text-muted-foreground">{ROTULO[a.campo] ?? a.campo}</span>
                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 tabular-nums">
                              <span className="text-muted-foreground line-through decoration-muted-foreground/50">{texto(a.campo, a.de)}</span>
                              <span aria-hidden="true" className="text-muted-foreground">→</span>
                              <span className="sr-only">passa a ser</span>
                              <span className="font-medium text-foreground">{texto(a.campo, a.para)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lido && deFora.length > 0 && (
              <div className="pas-entra rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5" data-testid="import-fora">
                <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Fora da importação · {deFora.length}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {deFora.map((l) => (
                    <li key={l.nome} className="text-xs text-warning">
                      <span className="font-medium">{l.nome}</span> — {l.problema}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center gap-2 border-t bg-surface-muted px-6 py-3 sm:justify-between">
            <span className="mr-auto hidden text-xs text-muted-foreground sm:block" aria-live="polite">
              {aplicar.isPending ? "Gravando no espelho…"
                : lido && total > 0 ? "Nada é gravado até você aplicar."
                : "Escolha a planilha para ver o que muda."}
            </span>
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={aplicar.isPending}>Cancelar</Button>
            <Button
              type="button"
              disabled={total === 0 || aplicar.isPending}
              onClick={() => aplicar.mutate(comMudanca)}
              data-testid="button-import-aplicar"
            >
              {aplicar.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Aplicando…</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" /> Aplicar {total > 0 ? total : ""} {total === 1 ? "alteração" : "alterações"}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ImportarPlanilha;
