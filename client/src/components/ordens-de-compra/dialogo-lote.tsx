/**
 * OC em LOTE (28/10, etapa 4) — o modelo da importação de contratos, em três
 * passos:
 *   1. colar as linhas ("prestação ; nº da OC ; valor? ; data?", direto do
 *      Excel com tabulação também vale) ou subir o CSV exportado com a coluna
 *      "Nº da OC" preenchida (lido NO NAVEGADOR — vira o mesmo texto);
 *   2. prévia linha a linha (ok · erro · ignorada, com os avisos), sem gravar
 *      nada; CNPJ sem contrato ativo pede UMA justificativa para o lote;
 *   3. resultado: quantas entraram e o porquê de cada recusa.
 * O servidor relê o texto na confirmação (a prévia nunca é confiada).
 */
import { useMemo, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleSlash, ClipboardPaste, FileSpreadsheet, Info, Layers, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { JUSTIFICATIVA_MIN, LOTE_DE_OC_MAX_LINHAS, type LinhaDoLoteDeOc, type SituacaoDaLinhaDoLote } from "@shared/honorarios-pagamento";
import { ErroDoArquivoDoLote, dataBr, lerArquivoDoLote, linhasDoTexto, reais } from "./oc-utils";
import type { PreviaDoLote, ResultadoDoLote } from "./tipos";
import type { useAcoesDaOc } from "./use-ordens-de-compra";

type Passo = "texto" | "previa" | "resultado";
type Filtro = "todas" | SituacaoDaLinhaDoLote;

const ROTULO: Record<SituacaoDaLinhaDoLote, string> = { ok: "Entra", erro: "Erro", ignorada: "Ignorada" };
const TOM: Record<SituacaoDaLinhaDoLote, string> = {
  ok: "border-success/30 bg-success-soft text-success",
  erro: "border-danger/30 bg-danger-soft text-danger",
  ignorada: "border-border bg-surface-muted text-slate-600",
};
const LIMITE_NA_TELA = 300;

const EXEMPLO = "#123 ; 4500123456\n04512345678 ; 4500123457 ; 1.250,00\nMaria da Silva Souza ; 4500123458 ; ; 25/10/2026";

function LinhaDaPrevia({ l }: { l: LinhaDoLoteDeOc }) {
  return (
    <li className={cn("oc-lote-linha", l.situacao === "erro" && "oc-lote-linha-erro")} data-situacao={l.situacao} data-testid={`oc-lote-linha-${l.linha}`}>
      <span className="oc-lote-n tabular-nums">{l.linha}</span>
      <div className="min-w-0">
        <p className="m-0 truncate text-sm font-medium text-foreground" title={l.colaborador ?? l.referencia}>{l.colaborador ? toTitleCase(l.colaborador) : l.referencia || "—"}</p>
        {l.colaborador && l.referencia && <p className="m-0 truncate text-2xs text-muted-foreground" title={l.referencia}>{l.referencia}</p>}
      </div>
      <div className="min-w-0 text-xs leading-5">
        <span className="block truncate font-mono font-semibold text-slate-700">{l.numero ?? "—"}</span>
        <span className="block tabular-nums text-muted-foreground">{l.valor != null ? reais(l.valor) : "—"}{l.data ? ` · ${dataBr(l.data)}` : ""}</span>
      </div>
      <span className={cn("inline-flex h-[22px] w-fit items-center rounded-md border px-1.5 text-2xs font-semibold", TOM[l.situacao])}>{ROTULO[l.situacao]}</span>
      {(l.erros.length > 0 || l.avisos.length > 0) && (
        <ul className="oc-lote-motivos m-0 list-none space-y-0.5 p-0 text-xs leading-5">
          {l.erros.map((e) => <li key={e} className="flex gap-1.5 text-danger"><CircleSlash className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0">{e}</span></li>)}
          {l.avisos.map((a) => <li key={a} className="flex gap-1.5 text-warning"><AlertTriangle className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0">{a}</span></li>)}
        </ul>
      )}
    </li>
  );
}

export function DialogoLote({ aberto, nomeDoEvento, previaDoLote, confirmarLote, onClose }: {
  aberto: boolean;
  nomeDoEvento: string;
  previaDoLote: ReturnType<typeof useAcoesDaOc>["previaDoLote"];
  confirmarLote: ReturnType<typeof useAcoesDaOc>["confirmarLote"];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [passo, setPasso] = useState<Passo>("texto");
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [previa, setPrevia] = useState<PreviaDoLote | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoLote | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reiniciar = () => {
    setPasso("texto"); setTexto(""); setArquivo(null); setErroArquivo(null); setPrevia(null); setFiltro("todas");
    setJustificativa(""); setTentou(false); setErroGeral(null); setResultado(null);
  };
  const ocupado = previaDoLote.isPending || confirmarLote.isPending;
  const fechar = () => { if (ocupado) return; reiniciar(); onClose(); };

  const abrirArquivo = async (f: File | undefined) => {
    if (!f) return;
    setErroArquivo(null);
    setLendo(true);
    try {
      setTexto(await lerArquivoDoLote(f));
      setArquivo(f.name);
    } catch (e) {
      setErroArquivo(e instanceof ErroDoArquivoDoLote ? e.message : "Não consegui ler este arquivo. Salve como .csv e tente de novo.");
    } finally {
      setLendo(false);
      if (input.current) input.current.value = "";
    }
  };
  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); void abrirArquivo(e.dataTransfer.files?.[0]); };

  const nLinhas = linhasDoTexto(texto);
  const verPrevia = () => {
    if (!texto.trim()) return;
    setErroGeral(null);
    previaDoLote.mutate(texto, {
      onSuccess: (p) => { setPrevia(p); setFiltro(p.resumo.erro > 0 ? "erro" : "todas"); setPasso("previa"); },
      onError: (e) => setErroGeral(apiErrorMessage(e, "Não foi possível ler o lote.")),
    });
  };

  const exige = (previa?.resumo.exigemJustificativa ?? 0) > 0;
  const justCurta = justificativa.trim().length < JUSTIFICATIVA_MIN;
  const confirmar = () => {
    setTentou(true);
    if (!previa || previa.resumo.ok === 0) return;
    if (exige && justCurta) return;
    setErroGeral(null);
    confirmarLote.mutate({ texto, justificativa: exige ? justificativa.trim() : null }, {
      onSuccess: (r) => {
        setResultado(r);
        setPasso("resultado");
        toast({ variant: r.registradas > 0 ? "success" : "default", title: r.registradas === 1 ? "1 OC registrada" : `${r.registradas} OCs registradas`, description: r.recusadas.length ? `${r.recusadas.length} ${r.recusadas.length === 1 ? "linha recusada" : "linhas recusadas"} — veja o porquê no relatório.` : undefined });
      },
      onError: (e) => setErroGeral(apiErrorMessage(e, "Não foi possível gravar o lote.")),
    });
  };

  const visiveis = useMemo(() => (previa?.linhas ?? []).filter((l) => filtro === "todas" || l.situacao === filtro), [previa, filtro]);

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="prs-dialogo max-h-[92dvh] max-w-[860px] gap-0 p-0" data-testid="oc-dialogo-lote">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />Registrar OCs em lote
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {passo === "texto" && <>Cole as linhas ou suba o CSV exportado com o nº da OC preenchido. Nada é gravado antes da confirmação · {nomeDoEvento}</>}
            {passo === "previa" && <>Prévia — confira linha a linha. Só as linhas “Entra” são gravadas; as com erro ficam de fora.</>}
            {passo === "resultado" && <>Pronto. As OCs gravadas já aparecem na lista e no app do colaborador.</>}
          </DialogDescription>
        </DialogHeader>

        {passo === "texto" && (
          <div className="prs-dialogo-corpo space-y-4 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="oc-lote-texto" className="flex items-center gap-1.5"><ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />Linhas do lote</Label>
                <Textarea id="oc-lote-texto" rows={10} value={texto} onChange={(e) => { setTexto(e.target.value); setArquivo(null); }}
                  placeholder={EXEMPLO} spellCheck={false} className="min-h-[220px] rounded-lg font-mono text-xs leading-5" data-testid="oc-lote-texto" />
                <p className="m-0 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground" aria-live="polite">
                  {arquivo ? <span className="inline-flex items-center gap-1 font-medium text-success"><FileSpreadsheet className="h-3 w-3" aria-hidden="true" />{arquivo}</span> : null}
                  <span className="tabular-nums">{nLinhas} {nLinhas === 1 ? "linha" : "linhas"}</span>
                  <span>· até {LOTE_DE_OC_MAX_LINHAS.toLocaleString("pt-BR")} por vez</span>
                </p>
              </div>
              <div className="space-y-3">
                <div
                  onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={soltar}
                  className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed px-4 py-5 text-center transition-colors",
                    arrastando ? "border-primary bg-brand-soft" : "border-border bg-surface-muted/60")}
                >
                  <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
                  <p className="m-0 text-xs font-medium text-foreground">Subir o CSV exportado</p>
                  <p className="m-0 text-2xs leading-4 text-muted-foreground">Preencha a coluna “Nº da OC”; linha sem OC é ignorada. CSV ou XLSX.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-1 h-8 rounded-lg" onClick={() => input.current?.click()} disabled={lendo} data-testid="oc-lote-arquivo">
                    {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />}
                    Escolher arquivo
                  </Button>
                  <input ref={input} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="hidden" onChange={(e) => void abrirArquivo(e.target.files?.[0])} data-testid="oc-lote-input-arquivo" />
                </div>
                {erroArquivo && <p role="alert" className="m-0 text-xs font-medium text-danger">{erroArquivo}</p>}
                <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-2xs leading-[1.6] text-slate-600">
                  <p className="m-0 flex items-center gap-1 font-semibold text-foreground"><Info className="h-3 w-3" aria-hidden="true" />Uma linha por prestação</p>
                  <p className="m-0 mt-1"><span className="font-mono text-foreground">referência ; nº da OC ; valor ; data</span></p>
                  <p className="m-0 mt-1">Referência: o nº da prestação (do CSV exportado), o CPF, o nº do colaborador (#123) ou o nome exato.</p>
                  <p className="m-0 mt-1">Valor vazio = o aprovado. Data vazia = hoje. Separe com “;”, tabulação ou vírgula.</p>
                </div>
              </div>
            </div>
            {erroGeral && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erroGeral}</p>}
          </div>
        )}

        {passo === "previa" && previa && (
          <div className="prs-dialogo-corpo space-y-3 px-6 py-4">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar a prévia" data-testid="oc-lote-resumo">
              {([
                ["todas", `Todas · ${previa.linhas.length}`],
                ["ok", `Entram · ${previa.resumo.ok}`],
                ["erro", `Com erro · ${previa.resumo.erro}`],
                ["ignorada", `Ignoradas · ${previa.resumo.ignorada}`],
              ] as [Filtro, string][]).map(([f, rot]) => (
                <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                  className={cn("pas-alvo inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filtro === f ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-surface-muted")}
                  data-testid={`oc-lote-filtro-${f}`}>
                  {f !== "todas" && <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", f === "ok" ? "bg-success-strong" : f === "erro" ? "bg-danger" : "bg-slate-400")} />}
                  {rot}
                </button>
              ))}
              {previa.comCabecalho && <span className="ml-auto text-2xs text-muted-foreground">Lido pelos títulos das colunas (CSV exportado).</span>}
            </div>

            {visiveis.length === 0 ? (
              <p className="m-0 rounded-lg border border-border bg-surface-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma linha nesta situação.</p>
            ) : (
              <ol className="oc-lote-lista m-0 list-none p-0" aria-label="Linhas do lote">
                {visiveis.slice(0, LIMITE_NA_TELA).map((l) => <LinhaDaPrevia key={l.linha} l={l} />)}
              </ol>
            )}
            {visiveis.length > LIMITE_NA_TELA && <p className="m-0 text-2xs text-muted-foreground">Mostrando as primeiras {LIMITE_NA_TELA} de {visiveis.length}.</p>}

            {exige && (
              <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning-soft/50 px-3.5 py-3" data-testid="oc-lote-bloco-justificativa">
                <Label htmlFor="oc-lote-justificativa" className="text-warning">
                  Justificativa do lote — {previa.resumo.exigemJustificativa} {previa.resumo.exigemJustificativa === 1 ? "prestação sem contrato ativo" : "prestações sem contrato ativo"}
                </Label>
                <p className="m-0 text-xs leading-5 text-slate-700">A OC sai assim mesmo, como pendência com este porquê (vale para todas as linhas marcadas com o aviso).</p>
                <textarea id="oc-lote-justificativa" rows={2} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                  className="block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-danger"
                  aria-invalid={tentou && justCurta} placeholder="Ex.: contratos em renovação no jurídico (lista enviada em 27/10)." data-testid="oc-lote-justificativa" />
                {tentou && justCurta && <p role="alert" className="m-0 text-xs font-medium text-danger">Escreva a justificativa (pelo menos {JUSTIFICATIVA_MIN} caracteres) ou tire essas linhas do lote.</p>}
              </div>
            )}
            {previa.resumo.ok === 0 && <p role="status" className="m-0 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">Nenhuma linha entra. Volte, corrija o texto e veja a prévia de novo.</p>}
            {erroGeral && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erroGeral}</p>}
          </div>
        )}

        {passo === "resultado" && resultado && (
          <div className="prs-dialogo-corpo space-y-3 px-6 py-5" data-testid="oc-lote-resultado">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-success/30 bg-success-soft px-3 py-2.5">
                <p className="m-0 text-2xs font-semibold uppercase tracking-[0.05em] text-success">Registradas</p>
                <p className="m-0 text-xl font-semibold tabular-nums text-success" data-testid="oc-lote-registradas">{resultado.registradas}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5">
                <p className="m-0 text-2xs font-semibold uppercase tracking-[0.05em] text-slate-600">Ignoradas</p>
                <p className="m-0 text-xl font-semibold tabular-nums text-foreground">{resultado.ignoradas}</p>
              </div>
              <div className={cn("rounded-lg border px-3 py-2.5", resultado.recusadas.length ? "border-danger/30 bg-danger-soft" : "border-border bg-surface-muted")}>
                <p className={cn("m-0 text-2xs font-semibold uppercase tracking-[0.05em]", resultado.recusadas.length ? "text-danger" : "text-slate-600")}>Recusadas</p>
                <p className={cn("m-0 text-xl font-semibold tabular-nums", resultado.recusadas.length ? "text-danger" : "text-foreground")}>{resultado.recusadas.length}</p>
              </div>
            </div>
            {resultado.recusadas.length > 0 && (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {resultado.recusadas.map((r) => (
                  <li key={r.linha} className="rounded-lg border border-danger/20 bg-card px-3 py-2 text-xs leading-5">
                    <p className="m-0 font-medium text-foreground">Linha {r.linha}{r.referencia ? <span className="font-normal text-muted-foreground"> · {r.referencia}</span> : null}</p>
                    {r.motivos.map((m) => <p key={m} className="m-0 text-danger">{m}</p>)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          {passo === "texto" && (
            <>
              <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Cancelar</Button>
              <Button type="button" onClick={verPrevia} disabled={!texto.trim() || ocupado} data-testid="oc-lote-ver-previa">
                {previaDoLote.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {previaDoLote.isPending ? "Lendo…" : "Ver a prévia"}
              </Button>
            </>
          )}
          {passo === "previa" && previa && (
            <>
              <Button type="button" variant="ghost" className="sm:mr-auto" onClick={() => { setPasso("texto"); setTentou(false); }} disabled={ocupado}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar e corrigir
              </Button>
              <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Cancelar</Button>
              <Button type="button" onClick={confirmar} disabled={previa.resumo.ok === 0 || ocupado} data-testid="oc-lote-confirmar">
                {confirmarLote.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {confirmarLote.isPending ? "Gravando…" : previa.resumo.ok === 1 ? "Registrar 1 OC" : `Registrar ${previa.resumo.ok} OCs`}
              </Button>
            </>
          )}
          {passo === "resultado" && (
            <Button type="button" onClick={fechar} data-testid="oc-lote-fechar">Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
