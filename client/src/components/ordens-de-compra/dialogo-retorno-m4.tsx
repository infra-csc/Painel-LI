/**
 * Importar o RETORNO DO M4 (Ordens de compra, 28/10 — o caminho de volta do
 * "Plano B": sem API, tudo por arquivo). Três passos, no modelo do lote:
 *   1. escolher a planilha que o M4 devolveu (CSV ou XLSX — lida NO
 *      NAVEGADOR; só as células vão para a prévia);
 *   2. prévia linha a linha, sem gravar: o que vai registrar a OC, programar
 *      (o "Lançar no M4" da nota) e marcar como pago — inclusive o lote
 *      Flash —, o que já estava assim e o que ficou com problema (valor
 *      divergente não entra). CNPJ sem contrato ativo pede UMA justificativa;
 *   3. resultado: o que foi gravado e o porquê de cada linha recusada.
 * O servidor relê as células ao aplicar (a prévia nunca é confiada) e grava
 * pelas mesmas regras das ações manuais. Layout PROVISÓRIO até o M4 mandar o
 * dele (`FORMATO_RETORNO_M4` em shared/formatos-de-arquivo.ts).
 */
import { useMemo, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleSlash, FileInput, FileSpreadsheet, Info, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { JUSTIFICATIVA_MIN } from "@shared/honorarios-pagamento";
import { FORMATO_RETORNO_M4 } from "@shared/formatos-de-arquivo";
import type { CelulaDoRetorno, LinhaPropostaDoRetorno, PreviaDoRetorno, ResultadoDaLinhaDoRetorno } from "@shared/retorno-m4";
import { ErroDoArquivoDoLote, dataBr, lerArquivoDoRetorno, reais } from "./oc-utils";
import { useRetornoDoM4, type ResultadoDoRetorno } from "./use-ordens-de-compra";

type Passo = "arquivo" | "previa" | "resultado";
type Filtro = "todas" | "registrar_oc" | "programar" | "marcar_pago" | "sem_mudanca" | "problema";

const ROTULO: Record<ResultadoDaLinhaDoRetorno, string> = { aplicar: "Aplica", sem_mudanca: "Sem mudança", problema: "Problema" };
const TOM: Record<ResultadoDaLinhaDoRetorno, string> = {
  aplicar: "border-success/30 bg-success-soft text-success",
  sem_mudanca: "border-border bg-surface-muted text-slate-600",
  problema: "border-danger/30 bg-danger-soft text-danger",
};
const LIMITE_NA_TELA = 300;
const SITUACAO: Record<string, string> = { emitida: "OC emitida", programado: "Programado", liquidado: "Liquidado" };

const passaNoFiltro = (l: LinhaPropostaDoRetorno, f: Filtro) =>
  f === "todas" || (f === "sem_mudanca" || f === "problema" ? l.resultado === f : l.resultado === "aplicar" && l.acoes.includes(f));

function LinhaDaPrevia({ l }: { l: LinhaPropostaDoRetorno }) {
  const datas = [
    l.situacao ? SITUACAO[l.situacao] : null,
    l.dataProgramada ? `prog. ${dataBr(l.dataProgramada)}` : null,
    l.dataLiquidacao ? `liq. ${dataBr(l.dataLiquidacao)}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <li className={cn("oc-lote-linha", l.resultado === "problema" && "oc-lote-linha-erro")} data-resultado={l.resultado} data-testid={`oc-retorno-linha-${l.linha}`}>
      <span className="oc-lote-n tabular-nums">{l.linha}</span>
      <div className="min-w-0">
        <p className="m-0 truncate text-sm font-medium text-foreground" title={l.quem ?? l.referencia}>{l.quem ? (l.tipo === "flash" ? l.quem : toTitleCase(l.quem)) : l.referencia || "—"}</p>
        <p className="m-0 truncate text-2xs text-muted-foreground" title={[l.evento, l.referencia].filter(Boolean).join(" · ")}>{l.evento ?? l.referencia}</p>
      </div>
      <div className="min-w-0 text-xs leading-5">
        <span className="block truncate font-mono font-semibold text-slate-700">{l.numeroOc ?? "—"}</span>
        <span className="block break-words tabular-nums text-muted-foreground">{l.valorCents != null ? reais(l.valorCents) : "—"}{datas ? ` · ${datas}` : ""}</span>
      </div>
      <span className={cn("inline-flex h-[22px] w-fit items-center rounded-md border px-1.5 text-2xs font-semibold", TOM[l.resultado])}>{ROTULO[l.resultado]}</span>
      <ul className="oc-lote-motivos m-0 list-none space-y-0.5 p-0 text-xs leading-5">
        {l.resultado === "problema"
          ? l.problemas.map((e) => <li key={e} className="flex gap-1.5 text-danger"><CircleSlash className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0">{e}</span></li>)
          : <li className={cn("flex gap-1.5", l.resultado === "aplicar" ? "text-success" : "text-muted-foreground")}>
            {l.resultado === "aplicar" ? <CheckCircle2 className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" /> : <Info className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" />}
            <span className="min-w-0">{l.frase}</span>
          </li>}
        {l.avisos.map((a) => <li key={a} className="flex gap-1.5 text-warning"><AlertTriangle className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0">{a}</span></li>)}
      </ul>
    </li>
  );
}

function Cifra({ rotulo, n, tom }: { rotulo: string; n: number; tom: "sucesso" | "neutro" | "perigo" }) {
  const cor = tom === "sucesso" ? "border-success/30 bg-success-soft text-success" : tom === "perigo" && n > 0 ? "border-danger/30 bg-danger-soft text-danger" : "border-border bg-surface-muted text-foreground";
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", cor)}>
      <p className="m-0 text-2xs font-semibold uppercase tracking-[0.05em] opacity-90">{rotulo}</p>
      <p className="m-0 text-xl font-semibold tabular-nums">{n}</p>
    </div>
  );
}

export function DialogoRetornoM4({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { previa: pedirPrevia, aplicar } = useRetornoDoM4();
  const [passo, setPasso] = useState<Passo>("arquivo");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [matriz, setMatriz] = useState<CelulaDoRetorno[][] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PreviaDoRetorno | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoRetorno | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reiniciar = () => {
    setPasso("arquivo"); setArquivo(null); setMatriz(null); setErroArquivo(null); setPrevia(null); setFiltro("todas");
    setJustificativa(""); setTentou(false); setErroGeral(null); setResultado(null);
  };
  const ocupado = lendo || pedirPrevia.isPending || aplicar.isPending;
  const fechar = () => { if (ocupado) return; reiniciar(); onClose(); };

  const abrirArquivo = async (f: File | undefined) => {
    if (!f) return;
    setErroArquivo(null);
    setErroGeral(null);
    setLendo(true);
    let celulas: CelulaDoRetorno[][];
    try {
      celulas = await lerArquivoDoRetorno(f);
    } catch (e) {
      setErroArquivo(e instanceof ErroDoArquivoDoLote ? e.message : "Não consegui ler este arquivo. Salve como .csv ou .xlsx e tente de novo.");
      return;
    } finally {
      setLendo(false);
      if (input.current) input.current.value = "";
    }
    setArquivo(f.name);
    setMatriz(celulas);
    pedirPrevia.mutate(celulas, {
      onSuccess: (p) => {
        setPrevia(p);
        setFiltro(p.resumo.problema > 0 && p.resumo.aplicar === 0 ? "problema" : "todas");
        setPasso("previa");
      },
      onError: (e) => setErroArquivo(apiErrorMessage(e, "Não foi possível ler o retorno.")),
    });
  };
  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); void abrirArquivo(e.dataTransfer.files?.[0]); };

  const r = previa?.resumo;
  const exige = (r?.exigemJustificativa ?? 0) > 0;
  const justCurta = justificativa.trim().length < JUSTIFICATIVA_MIN;
  const confirmar = () => {
    setTentou(true);
    if (!matriz || !r || r.aplicar === 0) return;
    if (exige && justCurta) return;
    setErroGeral(null);
    aplicar.mutate({ matriz, justificativa: exige ? justificativa.trim() : null }, {
      onSuccess: (res) => {
        setResultado(res);
        setPasso("resultado");
        toast({
          variant: res.aplicadas > 0 ? "success" : "default",
          title: res.aplicadas === 1 ? "1 linha do retorno aplicada" : `${res.aplicadas} linhas do retorno aplicadas`,
          description: res.recusadas.length ? `${res.recusadas.length} ${res.recusadas.length === 1 ? "linha recusada" : "linhas recusadas"} — veja o porquê no relatório.` : undefined,
        });
      },
      onError: (e) => setErroGeral(apiErrorMessage(e, "Não foi possível aplicar o retorno.")),
    });
  };

  const visiveis = useMemo(() => (previa?.linhas ?? []).filter((l) => passaNoFiltro(l, filtro)), [previa, filtro]);
  const colunas = FORMATO_RETORNO_M4.colunas;

  const avisoDoLayout = (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft/60 px-3.5 py-3" role="note" data-testid="oc-retorno-aviso-layout">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
      <p className="m-0 text-xs leading-5 text-slate-700">
        <span className="font-semibold text-warning">Layout provisório.</span> O M4 ainda não mandou o layout do retorno: o app lê as colunas abaixo pelos títulos.
        Cada linha é achada pela <span className="font-medium text-foreground">Referência</span> do arquivo de OC exportado. Valor diferente do aprovado não entra.
      </p>
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="prs-dialogo max-h-[92dvh] max-w-[900px] gap-0 p-0" data-testid="oc-retorno-dialogo">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-base font-semibold">
            <FileInput className="h-4 w-4 text-primary" aria-hidden="true" />Importar retorno do M4
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/35 bg-warning-soft px-1.5 py-px text-2xs font-semibold text-warning"><Info className="h-3 w-3" aria-hidden="true" />Layout provisório</span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {passo === "arquivo" && "Suba a planilha que o M4 devolveu: nº da OC, programação e liquidação de cada linha. Nada é gravado antes da confirmação."}
            {passo === "previa" && <>Prévia{arquivo ? <> de <span className="font-medium text-foreground">{arquivo}</span></> : null} — confira linha a linha. Só as linhas “Aplica” são gravadas; as com problema ficam de fora.</>}
            {passo === "resultado" && "Pronto. As mudanças já aparecem na lista, em Notas fiscais e no app do colaborador."}
          </DialogDescription>
        </DialogHeader>

        {passo === "arquivo" && (
          <div className="prs-dialogo-corpo space-y-4 px-6 py-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={soltar}
              className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed px-4 py-7 text-center transition-colors",
                arrastando ? "border-primary bg-brand-soft" : "border-border bg-surface-muted/60")}
            >
              <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="m-0 text-sm font-medium text-foreground">Arraste a planilha do retorno aqui</p>
              <p className="m-0 text-2xs leading-4 text-muted-foreground">CSV (; ou ,) ou XLSX · até 5 MB · linhas de vários eventos e lotes Flash no mesmo arquivo</p>
              <Button type="button" size="sm" variant="outline" className="mt-1.5 h-8 rounded-lg" onClick={() => input.current?.click()} disabled={ocupado} data-testid="oc-retorno-arquivo">
                {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />}
                {lendo ? "Lendo…" : pedirPrevia.isPending ? "Montando a prévia…" : "Escolher arquivo"}
              </Button>
              <input ref={input} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="hidden" onChange={(e) => void abrirArquivo(e.target.files?.[0])} data-testid="oc-retorno-input-arquivo" />
            </div>
            {erroArquivo && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erroArquivo}</p>}
            {avisoDoLayout}
            <div className="rounded-lg border border-border bg-card px-3.5 py-3">
              <p className="m-0 text-xs font-semibold text-foreground">Colunas lidas (pelos títulos, em qualquer ordem)</p>
              <ul className="m-0 mt-1.5 grid list-none gap-x-4 gap-y-1 p-0 text-2xs leading-4 text-slate-600 sm:grid-cols-2" data-testid="oc-retorno-colunas">
                {colunas.map((c) => (
                  <li key={c.campo} className="min-w-0">
                    <span className="font-medium text-foreground">{c.titulos[0]}</span>{c.obrigatoria ? <span className="text-danger"> *</span> : null}
                    {c.titulos.length > 1 && <span className="text-muted-foreground"> · ou {c.titulos.slice(1, 3).join(", ")}</span>}
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-2 text-2xs leading-4 text-muted-foreground">
                * obrigatória. Situação: programado ou liquidado (vazia = só a OC). Datas dd/mm/aaaa ou aaaa-mm-dd; valor com vírgula ou ponto. Colunas a mais são ignoradas.
              </p>
            </div>
          </div>
        )}

        {passo === "previa" && previa && r && (
          <div className="prs-dialogo-corpo space-y-3 px-6 py-4">
            {previa.erro ? (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger" data-testid="oc-retorno-erro-do-arquivo">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p className="m-0">{previa.erro}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar a prévia" data-testid="oc-retorno-resumo">
                  {([
                    ["todas", "Todas", r.total, null],
                    ["registrar_oc", "Registrar OC", r.registrarOc, "bg-primary"],
                    ["programar", "Programar", r.programar, "bg-info"],
                    ["marcar_pago", "Marcar pago", r.marcarPago, "bg-success-strong"],
                    ["sem_mudanca", "Sem mudança", r.semMudanca, "bg-slate-400"],
                    ["problema", "Com problema", r.problema, "bg-danger"],
                  ] as [Filtro, string, number, string | null][]).map(([f, rot, n, ponto]) => (
                    <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                      className={cn("pas-alvo inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        filtro === f ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-surface-muted")}
                      data-testid={`oc-retorno-filtro-${f}`}>
                      {ponto && <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", ponto)} />}
                      {rot} · {n}
                    </button>
                  ))}
                </div>

                {visiveis.length === 0 ? (
                  <p className="m-0 rounded-lg border border-border bg-surface-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma linha neste recorte.</p>
                ) : (
                  <ol className="oc-lote-lista m-0 list-none p-0" aria-label="Linhas do retorno">
                    {visiveis.slice(0, LIMITE_NA_TELA).map((l) => <LinhaDaPrevia key={l.linha} l={l} />)}
                  </ol>
                )}
                {visiveis.length > LIMITE_NA_TELA && <p className="m-0 text-2xs text-muted-foreground">Mostrando as primeiras {LIMITE_NA_TELA} de {visiveis.length}.</p>}

                {exige && (
                  <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning-soft/50 px-3.5 py-3" data-testid="oc-retorno-bloco-justificativa">
                    <Label htmlFor="oc-retorno-justificativa" className="text-warning">
                      Justificativa — {r.exigemJustificativa} {r.exigemJustificativa === 1 ? "OC de CNPJ sem contrato ativo" : "OCs de CNPJ sem contrato ativo"}
                    </Label>
                    <p className="m-0 text-xs leading-5 text-slate-700">A OC entra assim mesmo, como pendência com este porquê (vale para todas as linhas marcadas com o aviso).</p>
                    <textarea id="oc-retorno-justificativa" rows={2} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                      className="block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-danger"
                      aria-invalid={tentou && justCurta} placeholder="Ex.: contratos em renovação no jurídico (lista enviada em 27/10)." data-testid="oc-retorno-justificativa" />
                    {tentou && justCurta && <p role="alert" className="m-0 text-xs font-medium text-danger">Escreva a justificativa (pelo menos {JUSTIFICATIVA_MIN} caracteres) ou tire essas linhas do arquivo.</p>}
                  </div>
                )}
                {r.aplicar === 0 && (
                  <p role="status" className="m-0 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-slate-700" data-testid="oc-retorno-nada-a-aplicar">
                    Nada a aplicar: {r.problema > 0 ? "as linhas com problema ficam de fora e o resto já estava assim no app." : "tudo já estava assim no app."}
                  </p>
                )}
              </>
            )}
            {erroGeral && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erroGeral}</p>}
          </div>
        )}

        {passo === "resultado" && resultado && (
          <div className="prs-dialogo-corpo space-y-3 px-6 py-5" data-testid="oc-retorno-resultado">
            <div className="grid gap-2 sm:grid-cols-3">
              <Cifra rotulo="Aplicadas" n={resultado.aplicadas} tom="sucesso" />
              <Cifra rotulo="Sem mudança" n={resultado.semMudanca} tom="neutro" />
              <Cifra rotulo="Ficaram de fora" n={resultado.comProblema + resultado.recusadas.length} tom="perigo" />
            </div>
            {resultado.aplicadas > 0 && (
              <p className="m-0 text-xs leading-5 text-slate-700" data-testid="oc-retorno-detalhe">
                {[
                  resultado.ocsRegistradas ? `${resultado.ocsRegistradas} ${resultado.ocsRegistradas === 1 ? "OC registrada" : "OCs registradas"}` : null,
                  resultado.programadas ? `${resultado.programadas} ${resultado.programadas === 1 ? "nota programada" : "notas programadas"}` : null,
                  resultado.pagas ? `${resultado.pagas} ${resultado.pagas === 1 ? "prestação paga" : "prestações pagas"}` : null,
                  resultado.lotesFlashPagos ? `${resultado.lotesFlashPagos} ${resultado.lotesFlashPagos === 1 ? "lote Flash pago" : "lotes Flash pagos"}` : null,
                ].filter(Boolean).join(" · ")}. Tudo ficou no log de auditoria com “(retorno do M4)”.
              </p>
            )}
            {resultado.comProblema > 0 && <p className="m-0 text-xs text-muted-foreground">{resultado.comProblema} {resultado.comProblema === 1 ? "linha tinha problema na prévia e não foi aplicada" : "linhas tinham problema na prévia e não foram aplicadas"} — corrija no M4 e importe de novo.</p>}
            {resultado.recusadas.length > 0 && (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {resultado.recusadas.map((x) => (
                  <li key={x.linha} className="rounded-lg border border-danger/20 bg-card px-3 py-2 text-xs leading-5">
                    <p className="m-0 font-medium text-foreground">Linha {x.linha}{x.referencia ? <span className="font-normal text-muted-foreground"> · {x.referencia}</span> : null}</p>
                    {x.motivos.map((m) => <p key={m} className="m-0 text-danger">{m}</p>)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          {passo === "arquivo" && <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Cancelar</Button>}
          {passo === "previa" && previa && (
            <>
              <Button type="button" variant="ghost" className="sm:mr-auto" onClick={() => { setPasso("arquivo"); setPrevia(null); setMatriz(null); setTentou(false); setErroGeral(null); }} disabled={ocupado} data-testid="oc-retorno-outro-arquivo">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />Outro arquivo
              </Button>
              <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Cancelar</Button>
              {!previa.erro && (
                <Button type="button" onClick={confirmar} disabled={previa.resumo.aplicar === 0 || ocupado} data-testid="oc-retorno-aplicar">
                  {aplicar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  {aplicar.isPending ? "Aplicando…" : previa.resumo.aplicar === 1 ? "Aplicar 1 linha" : `Aplicar ${previa.resumo.aplicar} linhas`}
                </Button>
              )}
            </>
          )}
          {passo === "resultado" && <Button type="button" onClick={fechar} data-testid="oc-retorno-fechar">Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
