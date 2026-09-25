/**
 * "Formatos aceitos" da colagem (25/09 — extraído do diálogo de colar):
 * seletor de formato + explicação curta de cada layout, recolhidos.
 */
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import { PASTE_FORMAT_LABELS, type PasteFormat } from "@/components/scaling-validation/scaling-grid-utils";
import { HINT } from "./suggestion-shared";
import type { SuggestionPaste } from "./use-suggestion-paste";

export function PasteHelp({ paste, dates }: { paste: SuggestionPaste; dates: string[] }) {
  const { showPasteHelp, setShowPasteHelp, pasteFormat, setPasteFormat, detectedPaste } = paste;
  const diasExemplo = `${dates.slice(0, 3).map((d) => formatDayMonthBr(d)).join(" | ")}${dates.length > 3 ? " | …" : ""}`;
  return (
    <details
      open={showPasteHelp}
      onToggle={(e) => setShowPasteHelp((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-lg border border-border bg-surface-muted/70"
    >
      <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        Formatos aceitos
      </summary>
      <div className="border-t border-border px-3 py-2.5 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="sug-paste-format" className={cn(HINT, "font-medium")}>Formato</Label>
          <Select value={pasteFormat} onValueChange={(v) => setPasteFormat(v as "auto" | PasteFormat)}>
            <SelectTrigger id="sug-paste-format" className="h-8 w-[320px] max-w-full text-xs rounded-lg bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Detectar automaticamente</SelectItem>
              <SelectItem value="logistica">{PASTE_FORMAT_LABELS.logistica}</SelectItem>
              <SelectItem value="briefing">{PASTE_FORMAT_LABELS.briefing}</SelectItem>
              <SelectItem value="grade">{PASTE_FORMAT_LABELS.grade}</SelectItem>
            </SelectContent>
          </Select>
          {pasteFormat === "auto" && detectedPaste && (
            <span className={HINT}>Detectado: {PASTE_FORMAT_LABELS[detectedPaste.format]}{detectedPaste.hadHeader ? " (com cabeçalho)" : ""}.</span>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div className="rounded-lg bg-card border border-border px-3 py-2 space-y-1">
            <p className="font-semibold text-slate-700">Planilha da logística</p>
            <p className="font-mono text-slate-600 whitespace-nowrap overflow-x-auto">(vazio) | ida | chegada (até…) | retorno | horario do retorno (a partir) | (vazio) | 08/set | 09/set | … | obs</p>
            <p className="font-mono text-muted-foreground whitespace-nowrap overflow-x-auto">ex.: produção → quarta-feira, 9 de setembro de 2026 → 23h → domingo, 13 de setembro de 2026 → 20h+ → … → 1 → 1</p>
            <p className="text-muted-foreground">
              As colunas são lidas pelo <strong>cabeçalho</strong> (colunas vazias no meio não atrapalham) e as quantidades pela <strong>data</strong> de cada coluna de dia.
              A coluna "chegada (até…)" vira o horário de <strong>desembarque da ida</strong> e "horario do retorno (a partir)" o de <strong>embarque da volta</strong> —
              em "14-18h" e "20h+" vale a primeira hora. Quem tem data de ida ou de volta já vem com <strong>passagem</strong> marcada (as linhas "local" não);
              hotel e os modais de ida/volta ficam em branco para você preencher na grade.
            </p>
          </div>
          <div className="rounded-lg bg-card border border-border px-3 py-2 space-y-1 overflow-x-auto">
            <p className="font-semibold text-slate-700">Formato do briefing</p>
            <p className="font-mono text-slate-600 whitespace-nowrap">Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta | Hora embarque | Hotel | {diasExemplo}</p>
            <p className="font-mono text-muted-foreground whitespace-nowrap">ex.: Kit → Aéreo → 09/09 → 10:00 → Aéreo → 13/09 → 18:00 → sim → 1 → 1 → 2</p>
          </div>
          <div className="rounded-lg bg-card border border-border px-3 py-2 space-y-1 overflow-x-auto">
            <p className="font-semibold text-slate-700">Formato completo</p>
            <p className="font-mono text-slate-600 whitespace-nowrap">Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta | Hora embarque | Hotel | Passagem | Observação | {diasExemplo}</p>
            <p className="font-mono text-muted-foreground whitespace-nowrap">ex.: Kit → Aéreo → 09/09 → 10:00 → Aéreo → 13/09 → 18:00 → sim → sim → obs → 1 → 1 → 2</p>
          </div>
          <p className={HINT}>Colunas separadas por TAB. Funções já na grade são substituídas pelas coladas (sem duplicar).</p>
        </div>
      </div>
    </details>
  );
}
