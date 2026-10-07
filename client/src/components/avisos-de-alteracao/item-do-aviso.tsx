/**
 * Um aviso de alteração: de quem é a vaga, o que mudou, quem pediu e por quê,
 * quem aprovou e quando — e as ações. Usado no bloco da tela, na lista de
 * resolvidos e (sem a identificação da vaga) no topo do modal da passagem.
 *
 * Três linhas por aviso no bloco (vaga · o que mudou · quem pediu/aprovou),
 * com as ações lado a lado à direita: com 15 avisos, a altura de cada um é o
 * que decide se a lista de passagens continua à vista.
 */
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { MudancasDoAviso } from "./mudancas-do-aviso";
import { JaAtuei } from "./ja-atuei";
import { haQuanto, nomeProprio, quando, type AvisoDeAlteracao } from "./use-avisos-de-alteracao";

/** Texto entre aspas tipográficas, ou nada. */
const citacao = (t: string | null | undefined) => (t && t.trim() ? `“${t.trim()}”` : null);

/**
 * Quem pediu (e o motivo) e quem aprovou (quando e o comentário). `emLinha`
 * junta tudo num parágrafo (bloco da tela); sem ele, uma linha para cada (modal).
 */
export function QuemPediuEAprovou({ aviso, className, emLinha }: { aviso: AvisoDeAlteracao; className?: string; emLinha?: boolean }) {
  const motivo = citacao(aviso.motivo);
  const comentario = citacao(aviso.comentarioDoAprovador);
  const pedido = (
    <>
      Pedido por <span className="font-medium text-slate-700">{aviso.pedidoPorNome || "—"}</span>
      {motivo && <>: <span className="text-slate-600">{motivo}</span></>}
    </>
  );
  const aprovado = (
    <>
      Aprovado por <span className="font-medium text-slate-700">{aviso.aprovadoPorNome}</span>{" "}
      <time dateTime={aviso.aprovadoEm} title={quando(aviso.aprovadoEm)}>{haQuanto(aviso.aprovadoEm)}</time>
      <span className="text-muted-foreground/80"> · {quando(aviso.aprovadoEm)}</span>
      {comentario && <> — <span className="text-slate-600">{comentario}</span></>}
    </>
  );
  if (emLinha) {
    return (
      <p className={cn("m-0 text-xs leading-relaxed text-muted-foreground", className)}>
        {pedido}<span className="mx-1.5 text-border" aria-hidden="true">|</span>{aprovado}
      </p>
    );
  }
  return (
    <div className={cn("space-y-0.5 text-xs leading-relaxed text-muted-foreground", className)}>
      <p className="m-0">{pedido}</p>
      <p className="m-0">{aprovado}</p>
    </div>
  );
}

export function ItemDoAviso({ aviso, onAbrir, rotuloAbrir = "Abrir passagem", resolvido }: {
  aviso: AvisoDeAlteracao;
  /** "Abrir passagem" — abre o modal da vaga. Sem ele o botão não aparece. */
  onAbrir?: (aviso: AvisoDeAlteracao) => void;
  /** Texto do botão de abrir ("Abrir passagem" / "Abrir hospedagem"). */
  rotuloAbrir?: string;
  /** Lista de resolvidos: sem ações, com quem resolveu e o que fez. */
  resolvido?: boolean;
}) {
  const nome = nomeProprio(aviso.collaboratorName) || "Sem colaborador";
  return (
    <article
      className="pas-aviso flex flex-col gap-2.5 px-4 py-3 md:flex-row md:items-start md:gap-6"
      aria-label={`Vaga #${aviso.inclusionNumber ?? "?"} · ${nome}`}
      data-testid={`aviso-${aviso.id}`}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm leading-5">
          <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-brand-soft font-mono text-2xs font-semibold tabular-nums text-primary">
            #{aviso.inclusionNumber ?? "?"}
          </span>
          <span className="font-semibold text-foreground">{nome}</span>
          {aviso.functionName && <span className="text-muted-foreground">{aviso.functionName}</span>}
        </p>
        <MudancasDoAviso mudancas={aviso.mudancas} emLinha />
        <QuemPediuEAprovou aviso={aviso} emLinha />
        {resolvido && (
          <p className="m-0 inline-flex flex-wrap items-baseline gap-x-1 rounded-md bg-success-soft px-2 py-1 text-xs text-success">
            <span>Resolvido por <span className="font-semibold">{aviso.resolvidoPorNome ?? "—"}</span> · {quando(aviso.resolvidoEm)}</span>
            {aviso.resolucao && <span className="text-success/90">— {citacao(aviso.resolucao)}</span>}
          </p>
        )}
      </div>
      {!resolvido && (
        <div className="flex items-center gap-2 shrink-0">
          {onAbrir && (
            <button
              type="button"
              onClick={() => onAbrir(aviso)}
              className="pas-alvo inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              data-testid={`aviso-abrir-${aviso.id}`}
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              {rotuloAbrir}
            </button>
          )}
          <JaAtuei aviso={aviso} />
        </div>
      )}
    </article>
  );
}

export default ItemDoAviso;
