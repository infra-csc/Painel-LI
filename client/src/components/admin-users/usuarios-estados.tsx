/**
 * Usuários — estados da tela fora do "normal" (08/10): carregando com a
 * geometria real (faixa, barra de filtros, linhas), erro com o motivo e
 * "Tentar novamente", e sem permissão — todos dentro da mesma casca.
 */
import { CloudOff, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CarregandoUsuarios() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando usuários" className="flex flex-col gap-4">
      <span className="sr-only">Carregando usuários…</span>
      <div aria-hidden="true" className="grid grid-cols-2 sm:flex rounded-xl border border-border bg-card overflow-hidden">
        {[0, 1, 2].map(i => (
          <div key={i} className={`flex-1 px-3.5 pt-3 pb-3 ${i > 0 ? "sm:border-l border-border" : ""} ${i === 2 ? "col-span-2 border-t sm:border-t-0" : ""} ${i === 1 ? "border-l" : ""}`}>
            <div className="pas-osso h-3 w-24" />
            <div className="pas-osso h-5 w-14 mt-2" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-2">
        <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[340px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[96px] rounded-lg" />
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-10 bg-surface-muted border-b border-border" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
            <div className="pas-osso h-9 w-9 !rounded-full shrink-0" />
            <div className="flex flex-col gap-1.5 w-[min(260px,40%)]"><div className="pas-osso h-3.5 w-3/4" /><div className="pas-osso h-3 w-full" /></div>
            <div className="pas-osso h-[22px] w-24 hidden md:block ml-[4%]" />
            <div className="pas-osso h-2 w-[84px] hidden lg:block ml-[4%]" />
            <div className="pas-osso h-3 w-14 hidden md:block ml-[4%]" />
            <div className="pas-osso h-7 w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FalhaAoCarregar({ mensagem, tentando, onTentar }: { mensagem: string; tentando: boolean; onTentar: () => void }) {
  return (
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="usr-erro">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <CloudOff className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar os usuários</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{mensagem}</p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={onTentar} disabled={tentando}>
        <RotateCw className={`w-4 h-4 mr-1.5 ${tentando ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        {tentando ? "Tentando…" : "Tentar novamente"}
      </Button>
    </div>
  );
}

export function SemPermissao() {
  return (
    <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="usr-sem-permissao">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
        <Lock className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Acesso negado</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        Você não tem permissão para acessar esta página. A lista de usuários é para administradores, RH, Compras e Logística Interna.
      </p>
    </div>
  );
}
