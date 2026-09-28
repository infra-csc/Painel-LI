/**
 * Estados fixos da Escalação (25/09 — extraídos de pages/scaling.tsx): vazio
 * com causa e próximo passo, acesso negado e o esqueleto da primeira carga.
 */
import { Lock } from "lucide-react";

/** Um estado vazio da página, sempre com a causa e o que fazer a seguir. */
export function EstadoVazio({ icone, titulo, texto, acao }: {
  icone: React.ReactNode; titulo: string; texto: string; acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-card px-8 py-11 text-center">
      <div className="flex justify-center text-muted-foreground" aria-hidden="true">{icone}</div>
      <p className="mt-2.5 text-base font-semibold text-foreground">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function AcessoNegado() {
  return (
    <div className="rounded-xl border border-border bg-card px-8 py-12 text-center">
      <div className="flex justify-center text-muted-foreground" aria-hidden="true"><Lock className="w-7 h-7" aria-hidden="true" /></div>
      <p className="mt-3 text-base font-semibold text-foreground">Acesso negado</p>
      <p className="mx-auto mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        Seu papel não tem permissão para abrir a Escalação. Se você precisa desta tela para trabalhar,
        peça acesso ao administrador do painel.
      </p>
    </div>
  );
}

/**
 * Esqueleto só na PRIMEIRA carga. Depois disso a lista anterior fica na tela
 * enquanto a nova chega — trocar um filtro não pode apagar os controles que a
 * pessoa está usando.
 */
export function EsqueletoDaLista() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando escalações">
      <div className="h-[84px] rounded-xl border border-border bg-card animate-pulse motion-reduce:animate-none" />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-[34px] bg-background border-b border-border" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[52px] border-b border-border animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}
