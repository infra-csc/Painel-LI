/**
 * "O que muda ao aprovar" — o mesmo quadro no pedido, na Escalação, em
 * Passagens e em Hospedagem (dono, 16/09). O texto vem de
 * shared/swap-explicacao.ts; aqui só a forma.
 */
import { AlertTriangle, ArrowRight, Info, MapPin, XCircle } from "lucide-react";
import { explicarTroca, type TrocaParaExplicar } from "@shared/swap-explicacao";
import { motivoTrocaDesatualizada } from "@shared/troca-desatualizada";
import { toTitleCase } from "@/lib/format";

/**
 * A troca com os nomes dos ocupantes atuais no padrão do app (09/10) — o join
 * da API devolve o nome como está no cadastro.
 */
export function comOcupantesFormatados<T extends TrocaParaExplicar>(t: T): T {
  return {
    ...t,
    ...(t.inclusionCollaboratorName ? { inclusionCollaboratorName: toTitleCase(t.inclusionCollaboratorName) } : {}),
    ...(t.pairedCollaboratorName ? { pairedCollaboratorName: toTitleCase(t.pairedCollaboratorName) } : {}),
  };
}

/**
 * Pedido PENDENTE que não vale mais (09/10): a mesma conferência do servidor
 * na aprovação (shared/troca-desatualizada.ts). `null` quando ainda vale ou
 * quando o pedido já foi decidido.
 */
export function motivoDaTrocaPendente(status: string | null | undefined, troca: TrocaParaExplicar): string | null {
  return status === "pendente" ? motivoTrocaDesatualizada(troca) : null;
}

/** Aviso no topo do quadro do pedido quando as vagas mudaram depois dele (09/10). */
export function AvisoTrocaDesatualizada({ motivo }: { motivo: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-left" role="status" data-testid="aviso-troca-desatualizada">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-strong" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5 text-xs leading-snug text-danger">
        <p className="m-0 font-semibold">As vagas mudaram desde o pedido</p>
        <p className="m-0">{motivo}</p>
        <p className="m-0 font-medium">Recuse e peça de novo com as vagas como estão hoje.</p>
      </div>
    </div>
  );
}

export function ExplicacaoDaTroca({ troca, titulo = "O que muda ao aprovar", compacta = false }: {
  troca: TrocaParaExplicar;
  titulo?: string;
  /** Só as vagas (sem observações nem recusa) — para o cartão pequeno. */
  compacta?: boolean;
}) {
  const e = explicarTroca(troca);
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2 text-left" data-testid="swap-explicacao">
      <p className="text-2xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo} <span className="font-semibold normal-case tracking-normal text-muted-foreground">· {e.tipo}</span>
      </p>
      <ul className="space-y-1.5">
        {e.vagas.map((v) => (
          <li key={v.chave} className="rounded-lg border border-border bg-surface-muted px-2.5 py-2">
            <p className="text-2xs font-semibold text-slate-700 break-words">{v.vaga}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">Hoje:</span>
              <span className="font-medium text-slate-600 break-words">{v.antes}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">Depois:</span>
              <span className="font-semibold text-success break-words">{v.depois}</span>
            </p>
            {v.saiDe && (
              <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground" data-testid={`swap-explicacao-sai-de-${v.chave}`}>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                {v.depois} sai de <span className="font-semibold text-slate-700">{v.saiDe}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {!compacta && (
        <ul className="space-y-1 text-2xs leading-snug">
          {e.observacoes.map((o) => (
            <li key={o} className="flex items-start gap-1.5 text-slate-600">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{o}</span>
            </li>
          ))}
          <li className="flex items-start gap-1.5 text-danger">
            <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{e.recusa}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
