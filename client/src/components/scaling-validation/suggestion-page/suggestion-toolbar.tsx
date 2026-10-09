/**
 * Cabeçalho da grade da Sugestão de escala (25/09 — extraído da página):
 * título, legenda, atalhos do teclado e as ações de montar a grade.
 *
 * 07/10 (redesenho): as contagens (linhas, pessoas-dia, vagas) foram para o
 * resumo da grade, logo acima — aqui eram pílulas de 11px competindo com o
 * título. As ações de montar só aparecem com a grade já começada: com a grade
 * vazia, o próprio estado vazio oferece os três caminhos (eram dois botões
 * "Colar da planilha" cheios na mesma tela). "Colar" deixa de ser azul cheio —
 * o azul cheio da tela é o "Enviar", e dois primários brigavam pelo olho.
 */
import { useEffect, useRef } from "react";
import { ClipboardPaste, Eraser, FolderInput, Keyboard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SuggestionToolbarProps {
  rowsCount: number;
  liveText: string;
  gridReady: boolean;
  busy: boolean;
  readOnly: boolean;
  functionsError: boolean;
  hasContent: boolean;
  /** A grade passa dos dias do evento (margem de montagem/desmontagem): a legenda explica o filete. */
  showEventLegend: boolean;
  onPaste: () => void;
  onCopyEvent: () => void;
  onAddFunction: () => void;
  onClear: () => void;
}

const ACAO = "sug-alvo inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export function SuggestionToolbar({
  rowsCount, liveText, gridReady, busy, readOnly, functionsError, hasContent, showEventLegend,
  onPaste, onCopyEvent, onAddFunction, onClear,
}: SuggestionToolbarProps) {
  const disabled = !gridReady || busy || functionsError;
  // Atalhos: o <details> nativo só fechava clicando de novo no botão. Agora
  // fecha também com clique fora e com Esc (o foco volta ao botão).
  const atalhosRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = atalhosRef.current;
    if (!el) return;
    const fora = (e: PointerEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && el.open) { el.open = false; el.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", fora);
    el.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); el.removeEventListener("keydown", esc); };
  }, [gridReady]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id="sug-grade" className="text-[13px] font-semibold text-foreground">Grade função × dia</h2>
        {/* O anúncio ao leitor de tela sai daqui, com debounce — uma tecla, um anúncio, era demais. */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">{liveText}</span>
        {gridReady && showEventLegend && (
          <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className="h-[3px] w-4 rounded-full bg-primary" aria-hidden="true" /> dias do evento
          </span>
        )}
        {/* Atalhos do teclado: disclosure junto ao título (no rodapé da grade cortavam). */}
        {gridReady && (
          <details ref={atalhosRef} className="relative">
            <summary className="inline-flex h-6 cursor-pointer select-none items-center gap-1 rounded-full border border-border bg-card px-2 text-2xs font-medium text-slate-600 transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
              <Keyboard className="h-3 w-3" aria-hidden="true" /> Atalhos
            </summary>
            <div className="sug-entra absolute left-0 top-full z-40 mt-1.5 w-max max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card px-3 py-2.5 text-2xs text-slate-600 shadow-2">
              <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1.5">
                <dt><kbd className="sug-tecla">↑</kbd> <kbd className="sug-tecla">↓</kbd></dt><dd>+1 / −1 na célula</dd>
                <dt><kbd className="sug-tecla">←</kbd> <kbd className="sug-tecla">→</kbd></dt><dd>célula ao lado</dd>
                <dt><kbd className="sug-tecla">Enter</kbd></dt><dd>linha de baixo (Shift+Enter sobe)</dd>
                <dt><kbd className="sug-tecla">Ctrl</kbd> + <kbd className="sug-tecla">↑</kbd> <kbd className="sug-tecla">↓</kbd></dt><dd>linha acima / abaixo</dd>
                <dt><kbd className="sug-tecla">Delete</kbd></dt><dd>zera a célula</dd>
              </dl>
            </div>
          </details>
        )}
      </div>

      {/* Ações de montar: só com a grade começada (vazia, o estado vazio oferece as três). */}
      {(rowsCount > 0 || (hasContent && !readOnly)) && (
        <div className="flex flex-wrap items-center gap-2">
          {rowsCount > 0 && (<>
          <button type="button" className={cn(ACAO, "border-primary/20 bg-brand-soft text-primary hover:border-primary/35 hover:bg-brand-soft/70")} disabled={disabled} onClick={onPaste} aria-label="Colar da planilha">
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" /><span>Colar<span className="hidden sm:inline"> da planilha</span></span>
          </button>
          <button type="button" className={cn(ACAO, "border-border bg-card text-slate-700 hover:border-primary/30 hover:text-primary")} disabled={disabled} onClick={onCopyEvent} aria-label="Copiar de outro evento">
            <FolderInput className="h-4 w-4" aria-hidden="true" /><span>Copiar<span className="hidden sm:inline"> de outro evento</span></span>
          </button>
          <button type="button" className={cn(ACAO, "border-border bg-card text-slate-700 hover:border-primary/30 hover:text-primary")} disabled={disabled} onClick={onAddFunction} aria-label="Adicionar função">
            <Plus className="h-4 w-4" aria-hidden="true" /> <span className="sm:hidden">Função</span><span className="hidden sm:inline">Adicionar função</span>
          </button>
          </>)}
          {/* Apaga a grade inteira: separado das ações de montar por um filete, sem moldura. */}
          {hasContent && !readOnly && (
            <>
              {rowsCount > 0 && <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />}
              <button
                type="button"
                disabled={busy}
                onClick={onClear}
                className="sug-alvo inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-strong disabled:opacity-50"
                data-testid="scaling-suggestion-clear"
              >
                <Eraser className="h-4 w-4" aria-hidden="true" /> Limpar grade
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
