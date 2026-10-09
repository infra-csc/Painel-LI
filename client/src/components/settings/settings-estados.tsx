// Valores padrão — estados da tela (redesenho 08/10): esqueleto no formato
// real (resumo + grupos em linhas), erro com "Tentar novamente" e sem acesso.
import { AlertCircle, Lock, RotateCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function EsqueletoDosValores() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando os valores padrão" className="flex flex-col gap-4" data-testid="cfg-carregando">
      <span className="sr-only">Carregando os valores padrão…</span>
      <div aria-hidden="true" className="cfg-resumo rounded-xl border border-border bg-card overflow-hidden">
        <div className="cfg-resumo-grade">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="cfg-metrica px-4 pt-3.5 pb-3 space-y-2">
              <div className="pas-osso h-3 w-24" /><div className="pas-osso h-5 w-28" /><div className="pas-osso h-2.5 w-20" />
            </div>
          ))}
        </div>
        <div className="h-10 border-t border-border bg-surface-muted/60" />
      </div>
      {[3, 1].map((linhas, g) => (
        <div key={g} aria-hidden="true" className="cfg-grupo rounded-xl border border-border bg-card">
          <div className="px-5 pt-4 pb-3.5 border-b border-border space-y-2"><div className="pas-osso h-4 w-32" /><div className="pas-osso h-3 w-80 max-w-full" /></div>
          {Array.from({ length: linhas }).map((_, i) => (
            <div key={i} className="cfg-linha">
              <div className="cfg-linha-texto space-y-2"><div className="pas-osso h-3.5 w-40" /><div className="pas-osso h-3 w-52 max-w-full" /></div>
              <div className="cfg-campos cfg-campos-3">
                {[0, 1, 2].map(j => <div key={j} className="space-y-1.5"><div className="pas-osso h-3 w-20" /><div className="pas-osso h-10 w-full rounded-lg" /></div>)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErroDosValores({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="cfg-erro">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <AlertCircle className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar os valores padrão</h2>
      <p className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">
        As tarifas, as funções ou as empresas pagadoras não chegaram. Nada foi alterado — sem esses dados o formulário apareceria com valores errados. Verifique sua conexão e tente de novo.
      </p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={onRetry} data-testid="cfg-tentar-novamente">
        <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
      </Button>
    </div>
  );
}

export function SemAcessoAosValores() {
  return (
    <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="cfg-sem-acesso">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
        <Lock className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Acesso restrito</h2>
      <p className="m-0 mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
        Os valores padrão mexem no dinheiro de todos os eventos — só administradores e o Financeiro/RH abrem esta tela. Se precisar de um ajuste, fale com o Financeiro.
      </p>
      <Button asChild variant="outline" className="mt-5 rounded-lg">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
