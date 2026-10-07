/**
 * Estados fixos da Aprovação (07/10): carregando (esqueleto com a forma da
 * lista) e sem acesso. Os estados vazio e de erro usam as peças da Validação
 * (`EstadoDaValidacao`) — as quatro telas do módulo falam a mesma língua
 * quando não há o que mostrar ou algo dá errado.
 */
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Larguras das "colunas" de cada osso — variam de linha a linha, como o texto real. */
const OSSOS = [
  ["58%", "70%", "64%"], ["72%", "52%", "48%"], ["50%", "66%", "70%"], ["66%", "44%", "58%"], ["62%", "60%", "52%"],
];

/**
 * Esqueleto de uma aba (fila de pedidos ou vagas): a mesma forma do que vai
 * aparecer — linhas da tabela a partir de xl, cartões abaixo — com brilho que
 * passa (`val-osso`) em vez de blocos piscando.
 */
export function EsqueletoDaLista({ label, linhas = 5 }: { label: string; linhas?: number }) {
  return (
    <div aria-busy="true" data-testid="esqueleto-aprovacao">
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card xl:block" aria-hidden="true">
        <div className="h-10 border-b border-border bg-surface-muted" />
        {OSSOS.slice(0, linhas).map(([a, b, c], i) => (
          <div key={i} className="flex h-[76px] items-start gap-4 border-b border-border px-4 pt-3.5 last:border-b-0">
            <div className="val-osso h-4 w-4 shrink-0 rounded" />
            <div className="w-[120px] space-y-1.5"><div className="val-osso h-5 w-16 rounded-full" /><div className="val-osso h-2.5 w-12" /></div>
            <div className="min-w-0 flex-[1.2] space-y-1.5"><div className="val-osso h-3.5" style={{ width: a }} /><div className="val-osso h-2.5 w-2/5" /><div className="val-osso h-2.5 w-1/3" /></div>
            <div className="min-w-0 flex-1 space-y-1.5"><div className="val-osso h-3" style={{ width: b }} /><div className="val-osso h-3" style={{ width: c }} /></div>
            <div className="flex w-[200px] justify-end gap-1.5"><div className="val-osso h-8 w-8 rounded-lg" /><div className="val-osso h-8 w-8 rounded-lg" /><div className="val-osso h-8 w-[84px] rounded-lg" /></div>
          </div>
        ))}
      </div>
      <div className="grid gap-2.5 md:grid-cols-2 xl:hidden" aria-hidden="true">
        {OSSOS.slice(0, 4).map(([a, b], i) => (
          <div key={i} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
            <div className="flex gap-1.5"><div className="val-osso h-5 w-16 rounded-full" /><div className="val-osso h-5 w-16 rounded-full" /></div>
            <div className="val-osso h-4" style={{ width: a }} />
            <div className="val-osso h-2.5 w-1/3" />
            <div className="val-osso h-3" style={{ width: b }} />
            <div className="flex justify-end gap-1.5 border-t border-border pt-2.5"><div className="val-osso h-8 w-8 rounded-lg" /><div className="val-osso h-8 w-[84px] rounded-lg" /></div>
          </div>
        ))}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{label}</p>
    </div>
  );
}

/** Sem permissão para a tela — o texto de antes, no desenho dos estados do módulo. */
export function AcessoNegadoAprovacao({ className }: { className?: string }) {
  return (
    <div className={cn("val-entra mx-auto mt-6 max-w-xl rounded-xl border border-border bg-card px-8 py-12 text-center", className)} data-testid="aprovacao-sem-acesso">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3.5 text-[15px] font-semibold text-foreground">Você não tem acesso à Aprovação de Escala</h3>
      <p className="mx-auto mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
        Esta tela é dos aprovadores de função e dos perfis de decisão. Se você deveria decidir pedidos ou vagas de alguma função, fale com o administrador.
      </p>
    </div>
  );
}
