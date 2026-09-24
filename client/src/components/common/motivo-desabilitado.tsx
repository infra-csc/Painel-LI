import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Tooltip para botões de ação, inclusive DESABILITADOS (24/09).
 *
 * O `title` nativo não aparece no toque nem para leitor de tela, e um botão
 * `disabled` não dispara eventos de ponteiro — o Radix Tooltip nunca abre nele.
 * Aqui, quando `desabilitado` é verdadeiro, o botão ganha um `<span tabIndex=0>`
 * em volta que recebe hover/foco e mostra o motivo; habilitado, o tooltip vai
 * direto no botão (`asChild`).
 *
 *   <MotivoDesabilitado motivo="Selecione um evento" desabilitado={!eventId}>
 *     <Button disabled={!eventId}>Exportar</Button>
 *   </MotivoDesabilitado>
 */
export function MotivoDesabilitado({
  motivo,
  desabilitado,
  children,
  side = "top",
  className,
}: {
  motivo: React.ReactNode;
  desabilitado?: boolean;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  /** Classes do `<span>` invólucro (só quando desabilitado). */
  className?: string;
}) {
  if (!motivo) return children;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        {desabilitado ? (
          <span tabIndex={0} className={className ?? "inline-flex"} aria-label={typeof motivo === "string" ? motivo : undefined}>
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[260px] text-xs">{motivo}</TooltipContent>
    </Tooltip>
  );
}

export default MotivoDesabilitado;
