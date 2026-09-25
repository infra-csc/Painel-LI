import { useId } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Descrição quando o `motivo` é JSX (não dá para virar texto do leitor de tela). */
export const MOTIVO_PADRAO = "Ação indisponível";

/**
 * Tooltip para botões de ação, inclusive DESABILITADOS (24/09).
 *
 * O `title` nativo não aparece no toque nem para leitor de tela, e um botão
 * `disabled` não dispara eventos de ponteiro nem recebe foco — o Radix
 * Tooltip nunca abre nele. Aqui, quando `desabilitado` é verdadeiro, o botão
 * ganha um invólucro focável em volta que recebe hover/foco e mostra o motivo;
 * habilitado, o tooltip vai direto no botão (`asChild`).
 *
 * Acessibilidade do invólucro (25/09): um `<span tabIndex=0 aria-label>` sem
 * papel é inválido (aria-label é proibido no papel genérico). O invólucro é
 * `role="button" aria-disabled="true"`: o nome vem do próprio botão filho
 * ("Exportar") e o motivo entra como DESCRIÇÃO (`aria-describedby` → um
 * `<span>` só para leitor de tela), sempre presente, mesmo com o tooltip
 * fechado. O span é `aria-hidden` para não duplicar o motivo no nome — a
 * descrição por referência continua sendo lida.
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
  const descricaoId = useId();
  if (!motivo) return children;
  const descricao = typeof motivo === "string" ? motivo : MOTIVO_PADRAO;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        {desabilitado ? (
          <span
            role="button"
            aria-disabled="true"
            tabIndex={0}
            aria-describedby={descricaoId}
            className={className ?? "inline-flex"}
          >
            {children}
            <span id={descricaoId} className="sr-only" aria-hidden="true">{descricao}</span>
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
