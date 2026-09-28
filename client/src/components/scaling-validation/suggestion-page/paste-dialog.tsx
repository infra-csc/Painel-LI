/**
 * "Colar da planilha" da Sugestão de escala (25/09 — extraído da página).
 * Decidir antes de aplicar: campo · resumo em chips · nomes a mapear ·
 * mapeamentos salvos · como vai entrar · formatos aceitos.
 */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Function as FunctionType } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import { functionNameKey, PASTE_FORMAT_LABELS } from "@/components/scaling-validation/scaling-grid-utils";
import { PILL, SKIP_FUNCTION, plural } from "./suggestion-shared";
import { PasteHelp } from "./paste-help";
import type { SuggestionPaste } from "./use-suggestion-paste";

export interface PasteDialogProps {
  paste: SuggestionPaste;
  dates: string[];
  sortedFunctions: FunctionType[];
  presentFunctionIds: Set<string>;
}

export function PasteDialog({ paste, dates, sortedFunctions, presentFunctionIds }: PasteDialogProps) {
  const {
    showPaste, closePaste, pasteText, changePasteText, pasteAnalyzing, pastePreview, pasteParsed, pasteWarnings, pasteImpact,
    pasteFormat, setShowPasteHelp, unknownToMap, pasteUndecided, pasteNameMap, pasteApplyCount, pasteUnknownRef, goToUnknownNames,
    mapUnknownName, descartarPendentes, removerMapeamento, limparMapeamentos, nomeDoMapeamento, applyPaste,
  } = paste;
  return (
    <Dialog open={showPaste} onOpenChange={(o) => { if (!o) closePaste(); }}>
      <DialogContent className="max-w-[680px] max-h-[90vh] p-0 gap-0 grid-rows-[auto_minmax(0,1fr)_auto] w-[calc(100%-2rem)] rounded-xl sm:w-full">
        <DialogHeader className="px-4 sm:px-5 pt-5 pb-3 pr-12">
          <DialogTitle>Colar da planilha</DialogTitle>
          <DialogDescription>Copie as linhas no Excel e cole aqui — o formato é reconhecido sozinho e nada entra na grade antes do "Aplicar".</DialogDescription>
        </DialogHeader>

        {/* Corpo rolável: 1. campo · 2. resumo em chips · 3. nomes a mapear · 4. como vai entrar · 5. formato */}
        <div className="overflow-y-auto px-4 sm:px-5 pb-4 space-y-3">
          <Label htmlFor="sug-paste" className="sr-only">Conteúdo colado</Label>
          {/* Mudou o conteúdo colado → os nomes não reconhecidos são perguntados de novo. */}
          <Textarea
            id="sug-paste" autoFocus value={pasteText} rows={7} placeholder="Cole aqui (Ctrl+V)"
            onChange={(e) => changePasteText(e.target.value)}
            className="font-mono text-xs rounded-lg min-h-[150px] placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          />

          {/* 2. Resumo ao vivo em chips (nada é aplicado até clicar em "Aplicar"). */}
          {pasteText.trim() !== "" && (
            pasteAnalyzing || !pastePreview ? (
              <p className="text-xs text-muted-foreground">Analisando o que você colou…</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={PILL}>{plural(pastePreview.lines, "linha lida", "linhas lidas")}</span>
                  <span className={cn(pastePreview.recognized > 0 ? "inline-flex items-center gap-1 rounded-full border border-success/25 bg-success-soft px-2 py-0.5 text-2xs font-semibold text-success tabular-nums" : PILL)}>
                    {pastePreview.recognized > 0 && <CheckCircle2 className="w-3 h-3 text-success" aria-hidden="true" />}
                    {plural(pastePreview.recognized, "função reconhecida", "funções reconhecidas")}
                  </span>
                  <span className={PILL}>{plural(pastePreview.mappedDays, "dia mapeado", "dias mapeados")}</span>
                  {pasteWarnings.map((w, i) => {
                    const inline = w.detail && w.detail.length > 0 && w.detail.length <= 3 ? w.detail.join(", ") : "";
                    const title = w.detail && w.detail.length > 3 ? w.detail.join(", ") : undefined;
                    return (
                      <span key={i} title={title} className="inline-flex max-w-full items-center gap-1 rounded-full border border-warning/25 bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning">
                        <AlertTriangle className="w-3 h-3 shrink-0 text-warning" aria-hidden="true" />
                        <span className="truncate">{w.text}{inline ? `: ${inline}` : ""}</span>
                      </span>
                    );
                  })}
                </div>
                {pastePreview.recognized === 0 && (
                  <p className="text-xs text-warning">
                    {pastePreview.problem === "cabecalho-nao-encontrado"
                      ? "Não consegui identificar o cabeçalho — no formato da logística é preciso colar também a linha de cabeçalho (ida, chegada, retorno e as colunas de dia)."
                      : pastePreview.unknownNames.length > 0
                        ? "Nenhum dos nomes está no catálogo — aponte a função de cada um abaixo."
                        : "Nenhuma linha reconhecida. Confira se as colunas vieram separadas por TAB (copie direto do Excel)."}
                  </p>
                )}
                <p className="text-2xs text-muted-foreground">
                  {PASTE_FORMAT_LABELS[pastePreview.format]}{pastePreview.hadHeader ? " · cabeçalho ignorado" : ""}.{" "}
                  <button
                    type="button" onClick={() => setShowPasteHelp(true)}
                    className="underline underline-offset-2 hover:opacity-80 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                  >
                    {pasteFormat === "auto" ? "Não reconheceu? Escolher o formato" : `Formato definido à mão — trocar`}
                  </button>
                </p>
              </div>
            )
          )}

          {/* 3. Nomes que o catálogo não reconheceu: apontar a função certa (ou descartar) antes de aplicar */}
          {unknownToMap.length > 0 && (
            <div ref={pasteUnknownRef} className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-warning">
                    {plural(unknownToMap.length, "nome não reconhecido", "nomes não reconhecidos")}
                  </p>
                  <p className="text-2xs text-warning mt-0.5">Escolha a função equivalente ou descarte a linha. As escolhas ficam salvas neste navegador.</p>
                </div>
                {/* Atalho para quem só quer as linhas conhecidas: decide "descartar" para todas as pendentes de uma vez. */}
                {pasteUndecided.length > 0 && (
                  <button
                    type="button"
                    onClick={descartarPendentes}
                    className="rounded text-2xs font-semibold text-warning underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-strong"
                  >
                    Descartar {pasteUndecided.length === 1 ? "a pendente" : `as ${pasteUndecided.length} pendentes`}
                  </button>
                )}
              </div>
              <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                {unknownToMap.map((name) => {
                  const key = functionNameKey(name);
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-700 truncate max-w-[180px]" title={name}>{name}</span>
                      <span aria-hidden="true" className="text-warning text-xs">→</span>
                      {/* Sem decisão o Select fica VAZIO (placeholder): com "Descartar linha"
                          pré-selecionado, escolher "descartar" não disparava onValueChange
                          e o nome nunca contava como decidido. */}
                      <Select value={pasteNameMap[key] ?? ""} onValueChange={(v) => mapUnknownName(name, v)}>
                        <SelectTrigger aria-label={`Função para ${name}`} className={cn("h-8 w-[260px] max-w-full text-xs rounded-lg bg-card", !(key in pasteNameMap) && "border-warning-strong")}>
                          <SelectValue placeholder="Escolher função…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP_FUNCTION}>Descartar linha</SelectItem>
                          {sortedFunctions.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 3b. Mapeamentos salvos (11/09): o que este navegador já decidiu para
              nomes não reconhecidos — visível e desfazível, porque um mapa antigo
              errado ("ceno" → "Montagem") mandava em toda colagem sem avisar. */}
          {Object.keys(pasteNameMap).length > 0 && (
            <details className="rounded-lg border border-border bg-card px-3 py-2 text-xs" data-testid="mapeamentos-salvos">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Nomes que você já mapeou ({Object.keys(pasteNameMap).length}) — valem para toda colagem neste navegador
              </summary>
              <p className="mt-1 text-2xs text-muted-foreground">Se um nome está entrando na função errada, desfaça aqui e escolha de novo.</p>
              <ul className="mt-2 space-y-1">
                {Object.entries(pasteNameMap).map(([key, id]) => (
                  <li key={key} className="flex flex-wrap items-center gap-2" data-testid={`mapeamento-${key}`}>
                    <span className="font-mono text-slate-700">{key}</span>
                    <span aria-hidden="true" className="text-muted-foreground">→</span>
                    <span className={cn("font-medium", id === SKIP_FUNCTION ? "text-muted-foreground" : "text-foreground")}>{nomeDoMapeamento(id)}</span>
                    <button type="button" onClick={() => removerMapeamento(key)}
                      className="ml-auto rounded text-2xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Desfazer
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={limparMapeamentos}
                className="mt-2 rounded text-2xs font-semibold text-slate-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Desfazer todos
              </button>
            </details>
          )}

          {/* 4. Como vai entrar na grade: prévia por função + substituídas × novas */}
          {!pasteAnalyzing && pasteParsed && pasteParsed.rows.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-muted border-b border-border px-3 py-1.5">
                <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">Como vai entrar na grade</p>
                <p className={cn("text-2xs tabular-nums", pasteImpact.replaced > 0 ? "font-medium text-warning" : "text-muted-foreground")}>
                  {pasteImpact.replaced > 0
                    ? `${plural(pasteImpact.replaced, "linha substituída", "linhas substituídas")}, ${pasteImpact.added} ${pasteImpact.added === 1 ? "nova" : "novas"}`
                    : plural(pasteImpact.added, "linha nova", "linhas novas")}
                </p>
              </div>
              <ul className="max-h-[160px] overflow-y-auto divide-y divide-border">
                {pasteParsed.rows.map((r) => {
                  const days = dates.filter((d) => (r.quantities[d] || 0) > 0);
                  return (
                    <li key={r.rowId} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
                      <span className="w-[150px] shrink-0 truncate font-semibold text-foreground" title={r.functionName}>
                        {r.functionName}
                        {presentFunctionIds.has(r.functionId) && <span className="ml-1 font-normal text-warning">(substitui)</span>}
                      </span>
                      <span className="min-w-0 truncate font-mono tabular-nums text-slate-600">
                        {days.length > 0 ? days.map((d) => `${formatDayMonthBr(d)}×${r.quantities[d]}`).join(" · ") : "sem quantidades"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 5. Formato: seletor + explicação curta, recolhidos */}
          <PasteHelp paste={paste} dates={dates} />
        </div>

        <DialogFooter className="px-4 sm:px-5 py-3 border-t border-border bg-surface-muted/60 gap-2">
          <Button type="button" variant="outline" className="rounded-lg" onClick={closePaste}>Cancelar</Button>
          {/* Com nome sem decisão o botão não aplica: fica "aparentemente desabilitado"
              (aria-disabled) e o clique leva ao bloco âmbar — um disabled de verdade
              não receberia o clique nem explicaria o porquê. */}
          {pasteUndecided.length > 0 && pasteApplyCount > 0 ? (
            <Button
              type="button" aria-disabled="true" onClick={goToUnknownNames}
              className="rounded-lg bg-primary/50 text-primary-foreground hover:bg-primary/60"
            >
              Defina {pasteUndecided.length === 1 ? "a função acima" : `as ${pasteUndecided.length} funções acima`}
            </Button>
          ) : (
            <Button type="button" onClick={applyPaste} disabled={pasteApplyCount === 0} className="rounded-lg bg-primary hover:bg-primary-hover">
              {pasteApplyCount > 0 ? `Aplicar ${plural(pasteApplyCount, "linha", "linhas")}` : "Aplicar na grade"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
