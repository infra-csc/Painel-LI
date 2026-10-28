/**
 * Exportar (Ordens de compra). Dois arquivos:
 *
 *  - 28/10 (Fase 3, arquivos) — o ARQUIVO DE OC DO M4: as prestações
 *    aprovadas sem OC (CNPJ emissor, razão social, valor, centro de custo,
 *    evento, função, descrição sugerida) MAIS uma linha por lote de compra
 *    Flash (fornecedor Flash, total do lote), por EVENTO ou por PERÍODO (os
 *    eventos que terminam nele; os lotes gerados nele). Layout PROVISÓRIO até
 *    o importador do M4 ter o dele (shared/formatos-de-arquivo.ts). Sem CPF.
 *  - 28/10 (Fase 2) — as aprovadas SEM OC do evento, a planilha de conferência
 *    (o "Plano B" do slide 12): leva o CPF COMPLETO e volta pelo lote com a
 *    coluna "Nº da OC" preenchida. Continua igual.
 *
 * Os dois downloads ficam na auditoria (sem CPF).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, Download, FileSpreadsheet, FileStack, FileText, Info, Loader2, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { erroDoPeriodo } from "@shared/flash-compras";
import { baixarArquivoDeOc, baixarExportacao, CHAVE_ARQUIVO_DE_OC, type PreviaDoArquivoDeOc } from "./use-ordens-de-compra";
import { reais } from "./oc-utils";

type Arquivo = "m4" | "sem_oc";
type Escopo = "evento" | "periodo";
type Extensao = "csv" | "xlsx";

const inicioDoMes = (hoje: string) => (hoje ? `${hoje.slice(0, 8)}01` : "");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function DialogoExportar({ aberto, eventId, nomeDoEvento, semOc, hoje, onClose }: {
  aberto: boolean;
  /** Evento aberto na tela ("" = nenhum: só o arquivo por período). */
  eventId: string;
  nomeDoEvento?: string | null;
  /** Quantas aprovadas estão sem OC (e emitem NF) no evento — as linhas da planilha de conferência. */
  semOc: number;
  hoje: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [arquivo, setArquivo] = useState<Arquivo>("m4");
  const [escopo, setEscopo] = useState<Escopo>(eventId ? "evento" : "periodo");
  const [inicio, setInicio] = useState(inicioDoMes(hoje));
  const [fim, setFim] = useState(hoje);
  const [formato, setFormato] = useState<Extensao>("xlsx");
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!aberto) return;
    setErro(null); setBaixando(false); setArquivo("m4"); setEscopo(eventId ? "evento" : "periodo");
    setInicio(inicioDoMes(hoje)); setFim(hoje);
  }, [aberto, eventId, hoje]);

  const erroPeriodo = escopo === "periodo" ? erroDoPeriodo(inicio, fim) : null;
  const query = escopo === "evento" && eventId ? `eventId=${encodeURIComponent(eventId)}` : `inicio=${inicio}&fim=${fim}`;
  const previa = useQuery<PreviaDoArquivoDeOc>({
    queryKey: [CHAVE_ARQUIVO_DE_OC, "previa", query],
    queryFn: ({ signal }) => fetchJson<PreviaDoArquivoDeOc>(`${CHAVE_ARQUIVO_DE_OC}/previa?${query}`, signal),
    enabled: aberto && arquivo === "m4" && !erroPeriodo,
    staleTime: 10_000,
  });
  const p = previa.data;
  const vazioM4 = !!p && p.linhas === 0;

  const baixar = async () => {
    setErro(null);
    setBaixando(true);
    try {
      const nome = arquivo === "m4" ? await baixarArquivoDeOc(query, formato) : await baixarExportacao(eventId, formato);
      toast({ variant: "success", title: "Arquivo baixado", description: `${nome} · o download ficou registrado na auditoria.` });
      onClose();
    } catch (e) {
      setErro(apiErrorMessage(e, "Não foi possível exportar."));
    } finally {
      setBaixando(false);
    }
  };

  const opcaoDoArquivo = (v: Arquivo, titulo: React.ReactNode, sub: string, Icone: typeof FileText, desabilitado = false) => (
    <label className={cn("prs-opcao", arquivo === v && "prs-opcao-on", desabilitado && "cursor-not-allowed opacity-60")}>
      <input type="radio" name="oc-arquivo" value={v} checked={arquivo === v} disabled={desabilitado} onChange={() => setArquivo(v)} className="mt-1 accent-[var(--primary)]" data-testid={`oc-arquivo-${v}`} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground"><Icone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{titulo}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{sub}</span>
      </span>
    </label>
  );
  const pilula = <T extends string>(nome: string, valor: T, atual: T, set: (v: T) => void, rotulo: React.ReactNode, testid: string, desabilitado = false) => (
    <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors max-sm:flex-1 max-sm:justify-center",
      atual === valor ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground", desabilitado && "pointer-events-none opacity-50")}>
      <input type="radio" name={nome} value={valor} checked={atual === valor} disabled={desabilitado} onChange={() => set(valor)} className="sr-only" data-testid={testid} />{rotulo}
    </label>
  );

  const podeBaixar = arquivo === "sem_oc" ? semOc > 0 && !!eventId : !!p && !vazioM4 && !erroPeriodo && !previa.isFetching;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !baixando) onClose(); }}>
      <DialogContent className="prs-dialogo max-h-[92dvh] max-w-[540px] gap-0 p-0" data-testid="oc-dialogo-exportar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Download className="h-4 w-4 text-primary" aria-hidden="true" />Exportar
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            O arquivo para gerar as OCs no M4 (prestadores e a compra da Flash) ou a planilha de conferência das aprovadas sem OC{nomeDoEvento ? ` de ${nomeDoEvento}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="prs-dialogo-corpo space-y-4 px-6 py-5">
          <div className="grid gap-2" role="radiogroup" aria-label="Qual arquivo">
            {opcaoDoArquivo("m4", <>Arquivo de OC do M4 — prestadores + Flash <span className="inline-flex items-center gap-1 rounded-full border border-warning/35 bg-warning-soft px-1.5 py-px text-2xs font-semibold text-warning"><Info className="h-3 w-3" aria-hidden="true" />Layout provisório</span></>,
              "Uma linha por prestação aprovada sem OC e uma por lote de compra Flash. Sem CPF.", FileStack)}
            {opcaoDoArquivo("sem_oc", "Aprovadas sem OC (conferência)", eventId
              ? `${plural(semOc, "prestação", "prestações")} de ${nomeDoEvento ?? "este evento"} com CPF completo — volta pelo “Registrar em lote”.`
              : "Escolha um evento na tela para esta planilha.", FileText, !eventId)}
          </div>

          {arquivo === "m4" && (
            <div className="space-y-3 rounded-lg border border-border bg-surface-muted/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Escopo</span>
                <div role="radiogroup" aria-label="Escopo do arquivo" className="inline-flex h-9 items-center rounded-lg bg-muted p-0.5 max-sm:w-full">
                  {pilula("oc-escopo", "evento", escopo, setEscopo, "Este evento", "oc-escopo-evento", !eventId)}
                  {pilula("oc-escopo", "periodo", escopo, setEscopo, <><CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />Período</>, "oc-escopo-periodo")}
                </div>
              </div>
              {escopo === "periodo" && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1 max-sm:basis-full">
                    <Label htmlFor="oc-arquivo-inicio" className="text-xs">De</Label>
                    <Input id="oc-arquivo-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9 w-full rounded-lg tabular-nums sm:w-[160px]" aria-invalid={!!erroPeriodo} data-testid="oc-arquivo-inicio" />
                  </div>
                  <div className="space-y-1 max-sm:basis-full">
                    <Label htmlFor="oc-arquivo-fim" className="text-xs">Até</Label>
                    <Input id="oc-arquivo-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="h-9 w-full rounded-lg tabular-nums sm:w-[160px]" aria-invalid={!!erroPeriodo} data-testid="oc-arquivo-fim" />
                  </div>
                  <p className="m-0 basis-full text-2xs leading-4 text-muted-foreground">Prestações dos eventos que terminam no período; lotes Flash gerados no período.</p>
                </div>
              )}
              {erroPeriodo ? (
                <p role="alert" className="m-0 text-xs font-medium text-danger">{erroPeriodo}</p>
              ) : previa.isError ? (
                <p role="alert" className="m-0 text-xs text-danger">{apiErrorMessage(previa.error, "Não foi possível montar a prévia.")}</p>
              ) : !p ? (
                <div className="pas-osso h-14 w-full rounded-lg" aria-busy="true" aria-label="Carregando a prévia" />
              ) : (
                <div className="space-y-1.5" data-testid="oc-arquivo-previa">
                  <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-slate-600">{plural(p.prestadores.linhas, "prestação sem OC", "prestações sem OC")}{p.prestadores.eventos > 1 ? ` · ${p.prestadores.eventos} eventos` : ""}</dt>
                    <dd className="m-0 text-right tabular-nums">{reais(p.prestadores.valorCents)}</dd>
                    <dt className="text-slate-600">{p.flash.lotes.length === 0 ? "Nenhum lote Flash" : `${plural(p.flash.lotes.length, "lote", "lotes")} Flash (nº ${p.flash.lotes.map((l) => l.numero).join(", ")})`}</dt>
                    <dd className="m-0 text-right tabular-nums">{reais(p.flash.valorCents)}</dd>
                    <div className="col-span-2 flex items-baseline justify-between gap-4 border-t border-border pt-1">
                      <dt className="font-semibold text-foreground">Total do arquivo</dt>
                      <dd className="m-0 font-semibold tabular-nums text-primary" data-testid="oc-arquivo-total">{reais(p.totalCents)}</dd>
                    </div>
                  </dl>
                  {(p.prestadores.semCnpj > 0 || !p.formato.cnpjDaFlashConfigurado && p.flash.lotes.length > 0 || p.legadosIgnorados > 0 || vazioM4) && (
                    <ul className="m-0 list-none space-y-0.5 p-0 text-xs text-warning">
                      {vazioM4 && <li className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />Nada para o arquivo neste escopo.</li>}
                      {p.prestadores.semCnpj > 0 && <li className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{plural(p.prestadores.semCnpj, "prestação sai", "prestações saem")} sem CNPJ emissor (o colaborador ainda não informou).</li>}
                      {!p.formato.cnpjDaFlashConfigurado && p.flash.lotes.length > 0 && <li className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />O CNPJ da Flash entra com o layout oficial — a coluna sai vazia por enquanto.</li>}
                      {p.legadosIgnorados > 0 && <li className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{plural(p.legadosIgnorados, "evento do fluxo antigo ficou", "eventos do fluxo antigo ficaram")} de fora.</li>}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Formato</span>
            <div role="radiogroup" aria-label="Formato do arquivo" className="inline-flex h-9 items-center rounded-lg bg-muted p-0.5 max-sm:w-full">
              {pilula("oc-formato", "xlsx", formato, setFormato, <><FileSpreadsheet className="h-4 w-4" aria-hidden="true" />Excel (.xlsx)</>, "oc-formato-xlsx")}
              {pilula("oc-formato", "csv", formato, setFormato, <><FileText className="h-4 w-4" aria-hidden="true" />CSV (;)</>, "oc-formato-csv")}
            </div>
          </div>

          {arquivo === "sem_oc" ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft/60 px-3.5 py-3" role="note" data-testid="oc-aviso-cpf">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
              <p className="m-0 text-xs leading-5 text-slate-700">
                <span className="font-semibold text-warning">O arquivo tem o CPF completo.</span> Guarde só onde o DP tem acesso e apague depois de gerar as OCs. O download fica registrado no log de auditoria com o seu nome. Para registrar as OCs de volta: preencha “Nº da OC” e suba em “Registrar em lote”.
              </p>
            </div>
          ) : (
            <p className="m-0 text-2xs leading-4 text-muted-foreground" data-testid="oc-aviso-layout">
              O layout do importador de OC do M4 ainda não chegou: o arquivo sai num formato provisório, marcado no topo e no nome. Confira as colunas antes de importar. O download fica na auditoria.
            </p>
          )}
          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
        </div>
        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={baixando}>Cancelar</Button>
          <Button type="button" onClick={baixar} disabled={baixando || !podeBaixar} data-testid="oc-baixar">
            {baixando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {baixando ? "Gerando…" : `Baixar ${formato.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
