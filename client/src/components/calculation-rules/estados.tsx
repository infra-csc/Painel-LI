/**
 * Estados das Regras de cálculo (redesenho 08/10): esqueleto no formato real
 * (índice + documento com título, texto e tabela) e erro com "Tentar novamente".
 * Sem os valores vigentes a página não desenha tabela nenhuma: mostraria o
 * padrão do slide como se fosse o valor aplicado hoje.
 */
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";

export function EsqueletoDasRegras() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando os valores vigentes" className="rgc-casca" data-testid="rgc-carregando">
      <span className="sr-only">Carregando os valores vigentes…</span>
      <div aria-hidden="true" className="rgc-lateral">
        <div className="rgc-indice space-y-3">
          <div className="pas-osso h-3 w-24" />
          {[0, 1, 2, 3].map(g => (
            <div key={g} className="space-y-2 pt-2">
              <div className="pas-osso h-2.5 w-20" />
              {[0, 1].map(i => <div key={i} className="pas-osso h-3.5 w-36" />)}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="min-w-0">
        <div className="rgc-faixa"><div className="flex gap-2 py-2">{[0, 1, 2, 3].map(i => <div key={i} className="pas-osso h-8 w-24 rounded-full" />)}</div></div>
        <div className="rgc-documento">
          {[0, 1].map(s => (
            <div key={s} className="rgc-secao">
              <div className="pas-osso h-2.5 w-20" />
              <div className="pas-osso h-5 w-56 mt-2.5" />
              <div className="pas-osso h-3.5 w-full max-w-[560px] mt-3" />
              <div className="pas-osso h-3.5 w-2/3 max-w-[420px] mt-2" />
              <div className="rgc-quadro mt-5">
                <div className="h-9 bg-surface-muted border-b border-border" />
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between gap-6 px-4 py-3 border-b border-border last:border-0">
                    <div className="pas-osso h-3.5 w-48" /><div className="pas-osso h-3.5 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ErroDasRegras({ error, onRetry, tentando }: { error: unknown; onRetry: () => void; tentando: boolean }) {
  return (
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="rgc-erro">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <AlertCircle className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar os valores vigentes</h2>
      <p className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">
        Sem eles, as tabelas mostrariam os valores do slide como se fossem os aplicados hoje. Verifique sua conexão e tente de novo.
      </p>
      <p className="m-0 mt-2 max-w-[480px] text-xs text-muted-foreground">{apiErrorMessage(error, "O servidor não respondeu.")}</p>
      <Button variant="outline" className="pas-alvo mt-5 rounded-lg" onClick={onRetry} disabled={tentando} data-testid="rgc-tentar-novamente">
        <RotateCw className={tentando ? "w-4 h-4 mr-1.5 animate-spin motion-reduce:animate-none" : "w-4 h-4 mr-1.5"} aria-hidden="true" />
        {tentando ? "Tentando…" : "Tentar novamente"}
      </Button>
    </div>
  );
}
