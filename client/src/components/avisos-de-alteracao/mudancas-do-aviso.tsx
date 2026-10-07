/**
 * O "de → para" de um aviso, já em texto (o servidor guarda pronto).
 *
 * Leitura de diff: o valor antigo riscado e apagado, a seta, o novo em peso
 * de texto normal. Duas formas:
 *  - lista (padrão, modal): rótulo numa coluna, mudança na outra — Compras lê
 *    de cima a baixo o que mudou;
 *  - `emLinha` (bloco da tela): as mudanças lado a lado, quebrando quando não
 *    cabem — com 15 avisos, cada linha a menos é uma vaga a mais na tela.
 */
import { ArrowRight } from "lucide-react";
import type { MudancaDoAviso } from "@shared/aviso-de-alteracao";
import { cn } from "@/lib/utils";

function DeParaValores({ m }: { m: MudancaDoAviso }) {
  return (
    <>
      <span className="sr-only">de</span>
      <span className="text-muted-foreground line-through decoration-muted-foreground/60 tabular-nums break-words">{m.de}</span>
      <ArrowRight className="w-3 h-3 text-warning-strong shrink-0" aria-hidden="true" />
      <span className="sr-only">para</span>
      <span className="font-semibold text-foreground tabular-nums break-words">{m.para}</span>
    </>
  );
}

export function MudancasDoAviso({ mudancas, className, emLinha }: { mudancas: MudancaDoAviso[]; className?: string; emLinha?: boolean }) {
  if (mudancas.length === 0) return null;
  if (emLinha) {
    return (
      <ul className={cn("m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1 text-xs", className)} aria-label="O que mudou">
        {mudancas.map((m) => (
          <li key={m.campo} className="inline-flex flex-wrap items-center gap-x-1.5 min-w-0">
            <span className="text-muted-foreground">{m.rotulo}</span>
            <DeParaValores m={m} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className={cn("pas-mudancas grid gap-x-3 gap-y-1 text-xs", className)}>
      {mudancas.map((m) => (
        <div key={m.campo} className="contents">
          <dt className="text-muted-foreground whitespace-nowrap">{m.rotulo}</dt>
          <dd className="m-0 flex flex-wrap items-center gap-x-1.5 min-w-0">
            <DeParaValores m={m} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default MudancasDoAviso;
