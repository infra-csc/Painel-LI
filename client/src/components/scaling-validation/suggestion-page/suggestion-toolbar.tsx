/**
 * Cabeçalho da grade da Sugestão de escala (25/09 — extraído da página):
 * título, chips de contagem, atalhos do teclado e as ações de montar a grade.
 */
import { ClipboardPaste, FolderInput, Keyboard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PILL, PILL_BRAND, SECTION_TITLE, plural } from "./suggestion-shared";

export interface SuggestionToolbarProps {
  eventId: string;
  rowsCount: number;
  summary: { funcoes: number; pessoasDia: number };
  vagasLabel: string;
  overLimit: boolean;
  liveText: string;
  gridReady: boolean;
  busy: boolean;
  readOnly: boolean;
  functionsError: boolean;
  hasContent: boolean;
  onPaste: () => void;
  onCopyEvent: () => void;
  onAddFunction: () => void;
  onClear: () => void;
}

export function SuggestionToolbar({
  eventId, rowsCount, summary, vagasLabel, overLimit, liveText, gridReady, busy, readOnly, functionsError, hasContent,
  onPaste, onCopyEvent, onAddFunction, onClear,
}: SuggestionToolbarProps) {
  const disabled = !gridReady || busy || functionsError;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="sug-grade" className={SECTION_TITLE}>Grade função × dia</h2>
        {/* Chips visuais só com evento escolhido (sem evento não há grade para contar).
            Ficam aria-hidden: o anúncio ao leitor de tela sai da região
            sr-only abaixo, com debounce — uma tecla, um anúncio, era demais. */}
        {!!eventId && rowsCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
            <span className={PILL}>{plural(summary.funcoes, "linha", "linhas")}</span>
            <span className={PILL}>{summary.pessoasDia} pessoas-dia</span>
            <span className={cn(PILL_BRAND, overLimit && "bg-danger-soft text-danger")}>{vagasLabel}</span>
          </div>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">{liveText}</span>
        {/* Atalhos do teclado: saíram do rodapé da grade (onde cortavam
            em telas estreitas) para um disclosure junto ao título. */}
        {gridReady && (
          <details className="relative">
            <summary className="inline-flex h-6 cursor-pointer select-none items-center gap-1 rounded-full border border-border bg-card px-2 text-2xs font-medium text-slate-600 transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
              <Keyboard className="h-3 w-3" aria-hidden="true" /> Atalhos
            </summary>
            <div className="absolute left-0 top-full z-30 mt-1 w-max rounded-lg border border-border bg-card px-3 py-2 text-2xs text-slate-600 shadow-2">
              <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
                <dt className="font-mono font-semibold text-foreground">↑ / ↓</dt><dd>+1 / −1 na célula</dd>
                <dt className="font-mono font-semibold text-foreground">← / →</dt><dd>célula ao lado</dd>
                <dt className="font-mono font-semibold text-foreground">Enter</dt><dd>linha de baixo (Shift+Enter sobe)</dd>
                <dt className="font-mono font-semibold text-foreground">Ctrl+↑ / ↓</dt><dd>linha acima / abaixo</dd>
                <dt className="font-mono font-semibold text-foreground">Delete</dt><dd>zera a célula</dd>
              </dl>
            </div>
          </details>
        )}
      </div>
      {/*
        Quatro botões do mesmo peso não diziam por onde começar — e
        "Limpar", que apaga a grade inteira, ficava do lado de
        "Adicionar função" com a mesma aparência. Agora colar é o
        caminho principal (é como a produção monta de verdade), copiar
        e adicionar são as alternativas, e limpar virou link discreto do
        outro lado, visível só quando há o que limpar.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="rounded-lg h-8 bg-primary hover:bg-primary-hover" disabled={disabled} onClick={onPaste}>
          <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Colar da planilha
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={disabled} onClick={onCopyEvent}>
          <FolderInput className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Copiar de outro evento
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={disabled} onClick={onAddFunction}>
          <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Adicionar função
        </Button>
        {/* Isolado dos botões de montar: no celular vai para uma linha
            própria (w-full) para não ficar colado em "Adicionar função". */}
        {hasContent && !readOnly && (
          <button
            type="button"
            disabled={busy}
            onClick={onClear}
            className="w-full text-left sm:w-auto sm:ml-auto sm:text-right rounded text-xs font-semibold text-muted-foreground transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-strong disabled:opacity-50"
            data-testid="scaling-suggestion-clear"
          >
            Limpar grade
          </button>
        )}
      </div>
    </div>
  );
}
