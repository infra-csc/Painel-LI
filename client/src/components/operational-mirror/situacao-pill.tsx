/**
 * Situação da linha e pendências com link (25/09 — extraídas da página).
 */
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { textoDaSituacao } from "@shared/mirror-pendencia";
import { cn } from "@/lib/utils";

// Pendências que só se resolvem em outra tela (anexo/voucher/reserva). As telas de
// Hospedagens/Passagens não leem query params, então o link é simples.
function pendencyLink(p: string): { href: string; label: string } | null {
  if (/^Passagem sem voucher/i.test(p)) return { href: "/tickets", label: "Abrir em Passagens" };
  if (/^Hospedagem sem anexo/i.test(p)) return { href: "/accommodations", label: "Abrir em Hospedagens" };
  return null;
}

export function PendencyBadge({ p, withLink = true }: { p: string; withLink?: boolean }) {
  const link = withLink ? pendencyLink(p) : null;
  return (
    <span className="inline-flex items-center gap-1 w-fit">
      <span className="inline-flex w-fit items-center rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-medium text-warning">{p}</span>
      {link && (
        <Link href={link.href} title={link.label} aria-label={link.label}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded text-2xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" /> {link.label}
        </Link>
      )}
    </span>
  );
}

/**
 * A situação da linha: "pronto" · "1 bloco aberto" · "N blocos abertos".
 *
 * Nunca conta campos (regra de 02/09). A lista detalhada do servidor —
 * voucher, anexo, gênero, divergência de data, com os links para a tela que
 * resolve — continua a um clique, porque é onde a pessoa descobre O QUE falta.
 */
export function SituacaoPill({ abertos, pendencies, testId }: { abertos: number; pendencies: string[]; testId?: string }) {
  const pronto = abertos === 0;
  const pill = (
    <button
      type="button"
      data-testid={testId}
      aria-label={`${textoDaSituacao(abertos)} — ver detalhes`}
      className={cn("inline-flex h-[22px] items-center gap-1 rounded-md px-[7px] text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", pronto ? "bg-success-soft text-success" : "bg-warning-soft text-warning hover:bg-warning/15")}
    >
      {textoDaSituacao(abertos)}
    </button>
  );
  if (pendencies.length === 0 && pronto) return pill;
  return (
    <Popover>
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-auto min-w-[220px] max-w-xs rounded-xl p-0">
        <p className="border-b border-border px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">O que falta</p>
        <div className="flex flex-col gap-1.5 p-3">
          {pendencies.length === 0
            ? <span className="text-xs leading-relaxed text-muted-foreground">Bloco em uso ainda sem todos os campos ou com sugestão a confirmar.</span>
            : pendencies.map((p, i) => <PendencyBadge key={i} p={p} />)}
        </div>
      </PopoverContent>
    </Popover>
  );
}
