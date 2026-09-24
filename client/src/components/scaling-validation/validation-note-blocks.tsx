/**
 * Onde a observação da validação APARECE (24/09) — os mesmos dois blocos em
 * toda tela que mostra a vaga validada:
 *
 *  - `ValidationNoteBlock`: painel "Observação da validação" com o texto como
 *    foi escrito (quebras de linha preservadas) e, quando a tela sabe, quem
 *    validou e quando. Vai no drawer da Validação e nos diálogos da Aprovação.
 *  - `ValidationNoteHint`: ícone pequeno com a observação no tooltip, para a
 *    linha da lista (Validação e Aprovação) — nome acessível fixo, o texto
 *    completo está no tooltip e no painel.
 *
 * Só apresentação: nada aqui lê ou grava.
 */
import { MessageSquareText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateBr } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const VALIDATION_NOTE_HINT_LABEL = "Tem observação da validação";

/** "20/08/2026 14:32" — data e hora curtas; vazio/inválido → "". */
function fmtWhen(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export interface ValidationNoteBlockProps {
  note: string | null | undefined;
  /** Nome de quem validou, quando a tela consegue resolver o `validatedBy` (o GET só traz o id). */
  byName?: string | null;
  at?: string | Date | null;
  className?: string;
  /** Id do título, para `aria-labelledby` único quando há mais de um bloco na tela. */
  id?: string;
}

/** Painel da observação — não renderiza nada sem texto. */
export function ValidationNoteBlock({ note, byName, at, className, id = "obs-validacao" }: ValidationNoteBlockProps) {
  const text = note?.trim();
  if (!text) return null;
  const when = fmtWhen(at);
  const meta = [byName?.trim() || (when ? "Validada pela área" : ""), when].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby={id} className={cn("space-y-1 rounded-xl border border-info/30 bg-info-soft px-3.5 py-3", className)} data-testid="observacao-validacao">
      <p id={id} className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-info">
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> Observação da validação
      </p>
      <p className="whitespace-pre-line break-words text-sm text-foreground">{text}</p>
      {meta && <p className="text-2xs text-slate-600">{meta}</p>}
    </section>
  );
}

/** Ícone com a observação no tooltip (linha da lista). Nada sem texto. */
export function ValidationNoteHint({ note, className }: { note: string | null | undefined; className?: string }) {
  const text = note?.trim();
  if (!text) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={VALIDATION_NOTE_HINT_LABEL}
          className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1 text-xs">
        <p className="font-semibold">Observação da validação</p>
        <p className="whitespace-pre-line break-words">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}
