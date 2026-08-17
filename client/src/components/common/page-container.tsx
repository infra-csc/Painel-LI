import { cn } from "@/lib/utils";

export interface PageContainerProps {
  children: React.ReactNode;
  /** `true` para telas full-width (Escalação, Passagens, espelhos). Padrão: `max-w-6xl mx-auto`. */
  fluid?: boolean;
  className?: string;
}

/** Wrapper padrão de página: largura máxima centralizada + espaçamento vertical. */
export function PageContainer({ children, fluid = false, className }: PageContainerProps) {
  return (
    <div className={cn("space-y-5", !fluid && "max-w-6xl mx-auto", className)}>
      {children}
    </div>
  );
}

export default PageContainer;
