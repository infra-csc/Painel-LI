/**
 * Importar a planilha de contratos em 3 passos (26/10):
 *   1. enviar o arquivo (XLSX/CSV — lido no navegador);
 *   2. dizer qual coluna é o quê (palpite pelos títulos; CNPJ obrigatório;
 *      colaborador por CPF ou nome);
 *   3. prévia: o que entra, o que atualiza e o que tem erro — linha a linha.
 * Nada é gravado antes de "Confirmar importação"; o resultado vem num
 * relatório (com os erros para baixar). Se o cadastro mudar entre a prévia e
 * a confirmação, o servidor recusa e a prévia é refeita com um clique.
 */
import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CircleSlash, Copy, Download, FileSpreadsheet, Loader2, PlusCircle, RefreshCw, RotateCcw, Upload,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  CAMPOS_DA_IMPORTACAO, CAMPO_DA_IMPORTACAO_LABEL, erroDoMapeamento, sugerirMapeamento, type AcaoDaLinha, type CampoDaImportacao, type Mapeamento,
} from "@shared/importacao-contratos";
import { useImportacao, type LinhaDaPreviaApi, type PreviaApi, type ResultadoDaImportacao } from "./api";
import { ErroDaPlanilha, baixarModelo, lerPlanilha, type AbaDaPlanilha } from "./ler-planilha";

type Passo = 1 | 2 | 3 | 4;
const PASSOS: { n: 1 | 2 | 3; rotulo: string }[] = [
  { n: 1, rotulo: "Arquivo" },
  { n: 2, rotulo: "Colunas" },
  { n: 3, rotulo: "Prévia" },
];

const DICA_DO_CAMPO: Partial<Record<CampoDaImportacao, string>> = {
  cnpj: "Obrigatório. Com ou sem pontuação.",
  razaoSocial: "Obrigatória para CNPJ novo.",
  tipo: "MEI, Empresa ou Empreiteira. Vazio = Empresa.",
  vigenciaInicio: "DD/MM/AAAA ou data do Excel.",
  vigenciaFim: "Vazio = sem prazo.",
  colaboradorCpf: "Preferido para achar o colaborador.",
  colaboradorNome: "Usado só quando a linha não tem CPF. Nome exato.",
};

const ROTULO_DA_ACAO: Record<AcaoDaLinha, string> = {
  novo: "Entra", atualiza: "Atualiza", sem_mudanca: "Sem mudança", erro: "Erro", repetida: "Repetida",
};
const TOM_DA_ACAO: Record<AcaoDaLinha, string> = {
  novo: "border-success/30 bg-success-soft text-success",
  atualiza: "border-primary/25 bg-brand-soft text-primary",
  sem_mudanca: "border-border bg-surface-muted text-slate-600",
  erro: "border-danger/30 bg-danger-soft text-danger",
  repetida: "border-border bg-surface-muted text-slate-600",
};

type Filtro = "todas" | AcaoDaLinha;
const LIMITE_NA_TELA = 300;

const letra = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);

function Etapas({ passo }: { passo: Passo }) {
  return (
    <ol className="ctr-etapas flex items-center gap-2" aria-label="Passos da importação">
      {PASSOS.map((p, i) => {
        const feito = passo > p.n;
        const atual = passo === p.n || (passo === 4 && p.n === 3);
        return (
          <li key={p.n} className="flex items-center gap-2" aria-current={atual ? "step" : undefined}>
            <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-2xs font-semibold tabular-nums transition-colors",
              feito || passo === 4 ? "bg-success text-white" : atual ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
              {feito || passo === 4 ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : p.n}
            </span>
            <span className={cn("text-xs font-medium", atual ? "text-foreground" : "text-muted-foreground")}>{p.rotulo}</span>
            {i < PASSOS.length - 1 && <span aria-hidden="true" className={cn("mx-1 h-px w-6 sm:w-10", feito ? "bg-success" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

function baixarErros(linhas: { linha: number; cnpj: string | null; erros: string[] }[], nome: string) {
  const csv = "﻿" + [["Linha", "CNPJ", "Erros"], ...linhas.map((l) => [String(l.linha), l.cnpj ?? "", l.erros.join(" | ")])]
    .map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `erros-${nome.replace(/\.[^.]+$/, "")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportacaoDialog({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { previa: pedirPrevia, confirmar } = useImportacao();
  const { toast } = useToast();
  const [passo, setPasso] = useState<Passo>(1);
  const [arquivoNome, setArquivoNome] = useState("");
  const [abas, setAbas] = useState<AbaDaPlanilha[]>([]);
  const [abaIdx, setAbaIdx] = useState(0);
  const [lendo, setLendo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [mapa, setMapa] = useState<Mapeamento>({});
  const [previa, setPrevia] = useState<PreviaApi | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [desatualizada, setDesatualizada] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // No celular a prévia vira lista de cartões: a tabela escondia a coluna do erro à direita.
  const tabela = useMediaQuery("(min-width: 768px)");
  const aba = abas[abaIdx];

  const reiniciar = () => {
    setPasso(1); setArquivoNome(""); setAbas([]); setAbaIdx(0); setErroArquivo(null); setMapa({}); setPrevia(null);
    setFiltro("todas"); setDesatualizada(false); setResultado(null); setErroGeral(null);
  };
  const fechar = () => { if (confirmar.isPending) return; reiniciar(); onClose(); };

  const abrirArquivo = async (f: File | undefined) => {
    if (!f) return;
    setErroArquivo(null);
    setLendo(true);
    try {
      const lidas = await lerPlanilha(f);
      setArquivoNome(f.name);
      setAbas(lidas);
      setAbaIdx(0);
      setMapa(sugerirMapeamento(lidas[0].cabecalho));
      setPasso(2);
    } catch (e) {
      setErroArquivo(e instanceof ErroDaPlanilha ? e.message : "Não consegui ler este arquivo. Salve como .xlsx ou .csv e tente de novo.");
    } finally {
      setLendo(false);
      if (input.current) input.current.value = "";
    }
  };

  const pedido = () => ({ nomeDoArquivo: arquivoNome, colunas: aba?.colunas ?? 0, mapeamento: mapa, linhas: aba?.linhas ?? [] });
  const erroMapa = aba ? erroDoMapeamento(mapa, aba.colunas) : null;
  const semColaborador = mapa.colaboradorCpf == null && mapa.colaboradorNome == null;

  const gerarPrevia = async () => {
    if (erroMapa || !aba) return;
    setErroGeral(null);
    try {
      const p = await pedirPrevia.mutateAsync(pedido());
      setPrevia(p);
      setDesatualizada(false);
      setFiltro(p.contagem.erros > 0 ? "erro" : "todas");
      setPasso(3);
    } catch (e) {
      setErroGeral(apiErrorMessage(e, "Não foi possível gerar a prévia."));
    }
  };

  const confirmarImportacao = async () => {
    if (!previa) return;
    setErroGeral(null);
    try {
      const r = await confirmar.mutateAsync({ ...pedido(), assinatura: previa.assinatura });
      setResultado(r);
      setPasso(4);
      toast({ variant: "success", title: "Planilha importada", description: `${r.criados} ${r.criados === 1 ? "contrato novo" : "contratos novos"} · ${r.atualizados} ${r.atualizados === 1 ? "atualizado" : "atualizados"}` });
    } catch (e) {
      if (isApiError(e) && e.status === 409) { setDesatualizada(true); return; }
      setErroGeral(apiErrorMessage(e, "Não foi possível importar. Nada foi gravado."));
    }
  };

  const linhasFiltradas = useMemo(() => (previa ? previa.linhas.filter((l) => filtro === "todas" || l.acao === filtro) : []), [previa, filtro]);
  const aGravar = previa ? previa.contratos.novos + previa.contratos.atualizados : 0;

  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); void abrirArquivo(e.dataTransfer.files?.[0]); };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className={cn("ctr-importacao gap-0 p-0", passo >= 3 ? "max-w-[1040px]" : "max-w-[720px]")} onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="space-y-3 border-b border-border px-6 pb-4 pt-5 text-left">
          <div className="space-y-1 pr-8">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" /> Importar planilha de contratos
            </DialogTitle>
            <DialogDescription className="text-xs">
              {passo === 1 && "Nada é gravado até você conferir a prévia e confirmar."}
              {passo === 2 && `${arquivoNome} · ${aba?.linhas.length ?? 0} ${aba?.linhas.length === 1 ? "linha" : "linhas"} — diga qual coluna é o quê.`}
              {passo === 3 && `${arquivoNome} · confira antes de gravar. Linhas com erro não entram.`}
              {passo === 4 && `${arquivoNome} · importação concluída.`}
            </DialogDescription>
          </div>
          <Etapas passo={passo} />
        </DialogHeader>

        <div className="ctr-importacao-corpo px-6 py-5" aria-live="polite">
          {passo === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={soltar}
                className={cn("ctr-soltar flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                  arrastando ? "border-primary bg-brand-soft" : "border-slate-300 bg-surface-muted/50")}
                data-testid="ctr-importar-soltar"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-primary shadow-1" aria-hidden="true">
                  {lendo ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Upload className="h-5 w-5" />}
                </span>
                <p className="mt-3 text-sm font-semibold text-foreground">{lendo ? "Lendo a planilha…" : "Arraste a planilha aqui"}</p>
                <p className="mt-1 text-xs text-muted-foreground">.xlsx ou .csv · até 10 MB · até 5.000 linhas</p>
                <input ref={input} type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" id="ctr-importar-arquivo"
                  onChange={(e) => void abrirArquivo(e.target.files?.[0])} data-testid="ctr-importar-arquivo" />
                <Button type="button" variant="outline" className="mt-4" disabled={lendo} onClick={() => input.current?.click()}>Escolher arquivo</Button>
              </div>
              {erroArquivo && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />{erroArquivo}</p>}
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-xs font-semibold text-foreground">Como a planilha deve vir</p>
                <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-600">
                  <li>Primeira linha com os títulos das colunas; uma linha por CNPJ <span className="text-muted-foreground">— ou uma por colaborador atendido, repetindo o CNPJ (empreiteira)</span>.</li>
                  <li>Colunas: CNPJ (obrigatório), razão social, nome fantasia, tipo, início e fim da vigência, CPF ou nome do colaborador, observação.</li>
                  <li>CNPJ que já está cadastrado é atualizado; célula vazia não apaga o que já existe.</li>
                </ul>
                <button type="button" onClick={baixarModelo} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Baixar modelo (.csv)
                </button>
              </div>
            </div>
          )}

          {passo === 2 && aba && (
            <div className="space-y-4">
              {abas.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Aba:</span>
                  {abas.map((a, i) => (
                    <button key={a.nome} type="button" onClick={() => { setAbaIdx(i); setMapa(sugerirMapeamento(a.cabecalho)); }}
                      className={cn("h-7 rounded-full border px-2.5 font-medium transition-colors", i === abaIdx ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-slate-300")}>
                      {a.nome} <span className="tabular-nums text-muted-foreground">· {a.linhas.length}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="ctr-mapa overflow-hidden rounded-xl border border-border bg-card">
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-3 border-b border-border bg-surface-muted px-4 py-2 text-2xs font-medium text-muted-foreground sm:grid">
                  <span>Campo do contrato</span><span>Coluna da planilha</span><span>Exemplo (1ª linha)</span>
                </div>
                <ul className="divide-y divide-border">
                  {CAMPOS_DA_IMPORTACAO.map((campo) => {
                    const col = mapa[campo];
                    const exemplo = col != null ? aba.linhas[0]?.[col] ?? "" : "";
                    return (
                      <li key={campo} className="grid gap-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] sm:items-center sm:gap-3">
                        <div className="min-w-0">
                          <label htmlFor={`ctr-map-${campo}`} className="text-sm font-medium text-foreground">
                            {CAMPO_DA_IMPORTACAO_LABEL[campo]}{campo === "cnpj" && <span className="text-danger" aria-hidden="true"> *</span>}
                          </label>
                          {DICA_DO_CAMPO[campo] && <p className="text-2xs text-muted-foreground">{DICA_DO_CAMPO[campo]}</p>}
                        </div>
                        <select id={`ctr-map-${campo}`} value={col ?? ""} data-testid={`ctr-map-${campo}`}
                          onChange={(e) => setMapa((m) => {
                            const v = e.target.value === "" ? undefined : Number(e.target.value);
                            const novo: Mapeamento = { ...m };
                            // A mesma coluna não fica em dois campos: quem a tinha perde.
                            for (const k of CAMPOS_DA_IMPORTACAO) if (v != null && novo[k] === v) delete novo[k];
                            if (v == null) delete novo[campo]; else novo[campo] = v;
                            return novo;
                          })}
                          className={cn("h-9 w-full rounded-lg border bg-card px-2.5 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12",
                            campo === "cnpj" && col == null ? "border-danger/40" : "border-border")}>
                          <option value="">— Não importar —</option>
                          {aba.cabecalho.map((t, i) => <option key={i} value={i}>{letra(i)} · {t}</option>)}
                        </select>
                        <span className={cn("min-w-0 truncate text-xs", exemplo ? "font-mono text-slate-700" : "text-muted-foreground")} title={exemplo || undefined}>
                          {col == null ? "" : exemplo || "(vazio)"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {semColaborador && <p className="text-xs text-muted-foreground">Sem coluna de CPF ou nome, os contratos entram sem colaboradores vinculados — dá para vincular depois.</p>}
              {erroMapa && <p role="alert" className="text-xs font-medium text-danger">{erroMapa}</p>}
              {erroGeral && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erroGeral}</p>}
            </div>
          )}

          {passo === 3 && previa && (
            <div className="space-y-4">
              {desatualizada && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/35 bg-warning-soft px-3.5 py-2.5 text-xs text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">O cadastro de contratos mudou desde esta prévia (outra pessoa gravou). Nada foi importado — gere a prévia de novo.</span>
                  <Button type="button" size="sm" variant="outline" className="h-8 bg-card" onClick={() => void gerarPrevia()} disabled={pedirPrevia.isPending}>
                    <RefreshCw className={cn("h-3.5 w-3.5", pedirPrevia.isPending && "animate-spin motion-reduce:animate-none")} aria-hidden="true" /> Gerar de novo
                  </Button>
                </div>
              )}
              <div role="tablist" aria-label="Filtrar a prévia" className="flex flex-wrap gap-1.5">
                {([
                  ["todas", "Todas", previa.contagem.total],
                  ["novo", "Entram", previa.contagem.novos],
                  ["atualiza", "Atualizam", previa.contagem.atualizados],
                  ["erro", "Com erro", previa.contagem.erros],
                  ["sem_mudanca", "Sem mudança", previa.contagem.semMudanca],
                  ["repetida", "Repetidas", previa.contagem.repetidas],
                ] as [Filtro, string, number][]).filter(([id, , n]) => id === "todas" || n > 0).map(([id, rotulo, n]) => (
                  <button key={id} type="button" role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)} data-testid={`ctr-previa-filtro-${id}`}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      filtro === id ? "border-foreground bg-foreground text-white" : "border-border bg-card text-slate-700 hover:border-slate-300")}>
                    {rotulo}
                    <span className={cn("tabular-nums", filtro === id ? "text-white/80" : id === "erro" ? "text-danger" : "text-muted-foreground")}>{n}</span>
                  </button>
                ))}
              </div>

              {!tabela ? (
                <ul className="space-y-2" aria-label="Prévia da importação, linha a linha">
                  {linhasFiltradas.slice(0, LIMITE_NA_TELA).map((l) => <CartaoDaPrevia key={l.linha} l={l} />)}
                  {linhasFiltradas.length === 0 && <li className="rounded-xl border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma linha neste filtro.</li>}
                </ul>
              ) : (
              <div className="ctr-previa max-h-[min(52vh,520px)] overflow-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[720px] text-sm">
                  <caption className="sr-only">Prévia da importação, linha a linha</caption>
                  <thead className="sticky top-0 z-[1] border-b border-border bg-surface-muted">
                    <tr className="text-left text-2xs font-medium text-muted-foreground">
                      <th scope="col" className="w-[64px] px-3 py-2">Linha</th>
                      <th scope="col" className="w-[110px] px-3 py-2">O que acontece</th>
                      <th scope="col" className="px-3 py-2">Empresa</th>
                      <th scope="col" className="w-[190px] px-3 py-2">Colaborador</th>
                      <th scope="col" className="px-3 py-2">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhasFiltradas.slice(0, LIMITE_NA_TELA).map((l) => <LinhaDaPrevia key={l.linha} l={l} />)}
                  </tbody>
                </table>
                {linhasFiltradas.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma linha neste filtro.</p>}
              </div>
              )}
              {linhasFiltradas.length > LIMITE_NA_TELA && (
                <p className="text-2xs text-muted-foreground">Mostrando {LIMITE_NA_TELA} de {linhasFiltradas.length} linhas — use os filtros acima.</p>
              )}
              <p className="text-xs text-slate-600">
                {aGravar > 0
                  ? <>Ao confirmar: <strong className="font-semibold text-foreground">{previa.contratos.novos}</strong> {previa.contratos.novos === 1 ? "contrato novo" : "contratos novos"} e <strong className="font-semibold text-foreground">{previa.contratos.atualizados}</strong> {previa.contratos.atualizados === 1 ? "atualizado" : "atualizados"}.{previa.contagem.erros > 0 && <> As {previa.contagem.erros} linhas com erro ficam de fora — corrija na planilha e importe de novo.</>}</>
                  : "Nada a gravar: nenhuma linha nova ou com mudança."}
              </p>
              {erroGeral && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erroGeral}</p>}
            </div>
          )}

          {passo === 4 && resultado && (
            <div className="space-y-4" data-testid="ctr-importacao-resultado">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                {[
                  { rotulo: "Contratos novos", valor: resultado.criados, icone: PlusCircle, cor: "text-success" },
                  { rotulo: "Atualizados", valor: resultado.atualizados, icone: RotateCcw, cor: "text-primary" },
                  { rotulo: "Vínculos criados", valor: resultado.vinculos, icone: Copy, cor: "text-slate-600" },
                  { rotulo: "Linhas com erro", valor: resultado.linhasComErro, icone: CircleSlash, cor: resultado.linhasComErro ? "text-danger" : "text-slate-600" },
                ].map((i) => (
                  <div key={i.rotulo} className="bg-card px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground"><i.icone className={cn("h-3.5 w-3.5", i.cor)} aria-hidden="true" />{i.rotulo}</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{i.valor}</dd>
                  </div>
                ))}
              </dl>
              {resultado.erros.length > 0 ? (
                <div className="rounded-xl border border-danger/25 bg-card">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                    <p className="text-xs font-semibold text-foreground">Linhas que não entraram</p>
                    <Button type="button" size="sm" variant="outline" className="ml-auto h-8" onClick={() => baixarErros(resultado.erros, arquivoNome)}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Baixar (.csv)
                    </Button>
                  </div>
                  <ul className="max-h-[240px] divide-y divide-border overflow-y-auto">
                    {resultado.erros.map((e) => (
                      <li key={e.linha} className="px-4 py-2 text-xs"><span className="font-semibold tabular-nums text-foreground">Linha {e.linha}</span>{e.cnpj ? <span className="font-mono text-muted-foreground"> · {e.cnpj}</span> : null}<span className="block text-danger">{e.erros.join(" ")}</span></li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Todas as linhas válidas entraram.</p>
              )}
              {(resultado.semMudanca > 0 || resultado.repetidas > 0) && (
                <p className="text-xs text-muted-foreground">{resultado.semMudanca} sem mudança e {resultado.repetidas} repetidas foram ignoradas.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="ctr-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          {passo === 1 && <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>}
          {passo === 2 && (
            <>
              <Button type="button" variant="outline" onClick={() => { setPasso(1); setErroGeral(null); }} className="sm:mr-auto"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Trocar arquivo</Button>
              <Button type="button" onClick={() => void gerarPrevia()} disabled={!!erroMapa || pedirPrevia.isPending} data-testid="ctr-gerar-previa">
                {pedirPrevia.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                {pedirPrevia.isPending ? "Conferindo…" : "Ver prévia"}
              </Button>
            </>
          )}
          {passo === 3 && (
            <>
              <Button type="button" variant="outline" onClick={() => { setPasso(2); setErroGeral(null); setDesatualizada(false); }} className="sm:mr-auto" disabled={confirmar.isPending}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Colunas</Button>
              <Button type="button" variant="outline" onClick={fechar} disabled={confirmar.isPending} className="max-sm:hidden">Cancelar</Button>
              <Button type="button" onClick={() => void confirmarImportacao()} disabled={aGravar === 0 || desatualizada || confirmar.isPending} data-testid="ctr-confirmar-importacao">
                {confirmar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {confirmar.isPending ? "Gravando…" : `Confirmar importação${aGravar ? ` (${aGravar})` : ""}`}
              </Button>
            </>
          )}
          {passo === 4 && <Button type="button" onClick={fechar} data-testid="ctr-importacao-concluir">Concluir</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function detalhesDaLinha(l: LinhaDaPreviaApi): string[] {
  return l.acao === "erro" ? l.erros : l.acao === "atualiza" ? l.mudancas : [];
}

function CartaoDaPrevia({ l }: { l: LinhaDaPreviaApi }) {
  const detalhes = detalhesDaLinha(l);
  return (
    <li className={cn("rounded-xl border bg-card px-3.5 py-2.5", l.acao === "erro" ? "border-danger/30" : "border-border")} data-testid={`ctr-previa-linha-${l.linha}`}>
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-2xs font-semibold", TOM_DA_ACAO[l.acao])}>{ROTULO_DA_ACAO[l.acao]}</span>
        <span className="text-2xs tabular-nums text-muted-foreground">Linha {l.linha}</span>
      </div>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{l.razaoSocial ?? "—"}</p>
      {l.cnpj && <p className="font-mono text-2xs tabular-nums text-muted-foreground">{l.cnpj}{l.colaborador ? <span className="font-sans"> · {l.colaborador.nome}</span> : null}</p>}
      {detalhes.length > 0 && <ul className={cn("mt-1 space-y-0.5 text-xs leading-relaxed", l.acao === "erro" ? "text-danger" : "text-slate-700")}>{detalhes.map((d, i) => <li key={i} className="break-words">{d}</li>)}</ul>}
      {l.avisos.map((a, i) => <p key={i} className="mt-0.5 text-2xs leading-relaxed text-warning">{a}</p>)}
    </li>
  );
}

function LinhaDaPrevia({ l }: { l: LinhaDaPreviaApi }) {
  const detalhes = detalhesDaLinha(l);
  return (
    <tr className={cn("align-top", l.acao === "erro" && "bg-danger-soft/30")} data-testid={`ctr-previa-linha-${l.linha}`}>
      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{l.linha}</td>
      <td className="px-3 py-2"><span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-2xs font-semibold", TOM_DA_ACAO[l.acao])}>{ROTULO_DA_ACAO[l.acao]}</span></td>
      <td className="px-3 py-2">
        <span className="block break-words text-sm text-foreground">{l.razaoSocial ?? <span className="text-muted-foreground">—</span>}</span>
        {l.cnpj && <span className="block font-mono text-2xs tabular-nums text-muted-foreground">{l.cnpj}</span>}
      </td>
      <td className="px-3 py-2 text-xs text-slate-700">{l.colaborador?.nome ?? <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2">
        {detalhes.length > 0 && (
          <ul className={cn("space-y-0.5 text-xs leading-relaxed", l.acao === "erro" ? "text-danger" : "text-slate-700")}>
            {detalhes.map((d, i) => <li key={i} className="break-words">{d}</li>)}
          </ul>
        )}
        {l.avisos.map((a, i) => <p key={i} className="text-2xs leading-relaxed text-warning">{a}</p>)}
        {l.acao === "novo" && detalhes.length === 0 && l.avisos.length === 0 && <span className="text-xs text-muted-foreground">Contrato novo</span>}
        {l.acao === "sem_mudanca" && <span className="text-xs text-muted-foreground">Já está assim no cadastro</span>}
      </td>
    </tr>
  );
}
