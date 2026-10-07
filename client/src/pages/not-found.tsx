/**
 * 404 dentro da casca (07/10): diz o endereço que não existe, oferece voltar
 * à tela anterior e ir ao início. Antes era um ícone de alerta genérico — o
 * mesmo de erro — para algo que não é erro do sistema.
 */
import { Link, useLocation } from "wouter";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/components/common/use-page-title";

export default function NotFound() {
  usePageTitle("Página não encontrada");
  const [location] = useLocation();
  const temHistorico = typeof window !== "undefined" && window.history.length > 1;

  return (
    <div className="casca-surgir min-h-[calc(100dvh-160px)] w-full flex items-center justify-center px-4">
      <div className="w-full max-w-[460px] text-center">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-5">
          <Compass className="w-6 h-6" aria-hidden="true" />
        </span>
        <p className="m-0 mb-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Erro 404</p>
        <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">Página não encontrada</h1>
        <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
          A página que você tentou acessar não existe ou foi movida.
        </p>
        <p className="m-0 mt-4">
          <code className="inline-block max-w-full truncate align-middle rounded-md border border-border bg-surface-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            {location}
          </code>
        </p>
        <div className="mt-7 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2">
          {temHistorico && (
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft aria-hidden="true" /> Página anterior
            </Button>
          )}
          <Button asChild>
            <Link href="/">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
