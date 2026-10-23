/**
 * Detalhe da vaga na Aprovação de escala (23/10).
 *
 * Dono, sobre o modal da Escalação que a Aprovação passou a abrir: "apareceu o
 * modal, mas teria que ser no estilo do segundo, não do primeiro" — o segundo
 * é o detalhe da Validação de escala. Este é ELE (`SuggestionDetailDrawer`),
 * com o que muda de um papel para o outro:
 *  - o cabeçalho diz "você aprova esta função" (ou quem aprova);
 *  - os selos somam "aguardando aprovação há N dias" / "pendente há N dias";
 *  - a observação da validação traz quem validou e quando — e, sem observação,
 *    o aviso "Validada pela área" com quem e quando;
 *  - o rodapé é o do aprovador (`DecisaoNoDetalhe`), com os MESMOS diálogos e
 *    mutações da linha; vaga de outro aprovador diz quem decide;
 *  - vaga que já virou Inclusão ganha o link discreto "Abrir na Escalação",
 *    só para quem tem acesso à Escalação.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { CheckCircle2, ExternalLink, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import { SuggestionDetailDrawer } from "@/components/scaling-validation/suggestion-detail-drawer";
import { ondeEstaAVaga } from "@/components/scaling-validation/suggestion-detail-helpers";
import { PendingDaysBadge, StatusCell } from "@/components/scaling-validation/suggestions-list/suggestion-badges";
import type { SuggestionRow } from "@/components/scaling-validation/types";
import type { DetalheDaVaga } from "./use-detalhe-da-vaga";

interface DetalheDaVagaNaAprovacaoProps<T extends SuggestionRow> {
  detalhe: DetalheDaVaga<T>;
  functionNameById: Map<string, string>;
  /** Aprovador(es) da função da vaga — "quem aprova" e "quem decide". */
  approverNamesFor?: (row: T) => string[];
  /** userId → nome, para dizer quem validou (o GET só traz o id). */
  userNameById?: Map<string, string>;
  /** Selos no lugar dos padrão (status + "voltou do aprovador" + dias parada). */
  selos?: (row: T) => ReactNode;
  /** Avisos de destaque a mais, no topo (ex.: como a vaga decidida foi decidida). */
  historia?: (row: T) => ReactNode;
  /** O que a ABA deixa decidir sobre a vaga aberta (rodapé). Ausente/null = nada. */
  acoes?: (row: T) => ReactNode;
}

export function DetalheDaVagaNaAprovacao<T extends SuggestionRow>({
  detalhe, functionNameById, approverNamesFor, userNameById, selos, historia, acoes,
}: DetalheDaVagaNaAprovacaoProps<T>) {
  const { user } = useAuth();
  const podeVerEscalacao = hasPermission(user, "canAccessScreen2");
  const row = detalhe.vaga;
  const aprovadores = row ? approverNamesFor?.(row) : undefined;

  const papel = !row ? null : row.canDecide === true
    ? <span className="font-medium text-primary">você aprova esta função</span>
    : aprovadores?.length
      ? <span>quem aprova: {aprovadores.join(", ")}</span>
      : <span>somente leitura</span>;

  // A vaga já é Inclusão (aprovada): o detalhe completo dela mora na Escalação.
  // Em validação, a Escalação só a mostraria travada — o link não vale a viagem.
  const onde = row ? ondeEstaAVaga(row) : null;
  const linkEscalacao = podeVerEscalacao && onde?.label === "Abrir na Escalação" ? onde : null;
  const botoes = row ? acoes?.(row) ?? null : null;
  const rodape = linkEscalacao || botoes ? (
    <>
      {linkEscalacao && (
        <Link href={linkEscalacao.href} data-testid="detalhe-abrir-na-escalacao"
          className="val-alvo mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> {linkEscalacao.label}
        </Link>
      )}
      {botoes}
    </>
  ) : undefined;

  return (
    <SuggestionDetailDrawer
      open={detalhe.aberto && !!row}
      onOpenChange={(o) => { if (!o) detalhe.fechar(); }}
      row={row}
      functionName={row ? functionNameById.get(row.functionId) ?? "Sem função" : undefined}
      approverNames={aprovadores}
      list={detalhe.lista as T[]}
      onNavigate={(r) => detalhe.abrir(r as T)}
      papel={papel}
      selos={row ? (selos ? selos(row) : (
        <span className="flex flex-wrap items-center gap-1">
          <StatusCell row={row} approverNames={aprovadores} />
          <PendingDaysBadge row={row} approverNames={aprovadores} />
        </span>
      )) : undefined}
      historia={row && historia ? historia(row) : undefined}
      validadoPor={row?.validatedBy ? userNameById?.get(row.validatedBy) ?? null : null}
      mostrarQuemValidou
      rodape={rodape}
    />
  );
}

/**
 * Rodapé do aprovador — o mesmo desenho do rodapé da Validação: o caminho
 * destrutivo em texto vermelho à esquerda (lá "Pedir exclusão", aqui
 * "Reprovar"), o secundário em contorno ("Pedir ajuste" ↔ "Devolver") e UMA
 * ação cheia, verde ("Validar vaga" ↔ "Aprovar"). Os botões só abrem os
 * diálogos que a linha já abre.
 */
export function DecisaoNoDetalhe({ numero, busy, onReprovar, onDevolver, onAprovar, rotuloAprovar = "Aprovar" }: {
  numero: number | null | undefined;
  busy?: boolean;
  onReprovar: () => void;
  /** Sem esta prop não há "Devolver" (vaga parada: a área nunca validou). */
  onDevolver?: () => void;
  onAprovar: () => void;
  rotuloAprovar?: string;
}) {
  const n = numero ?? "—";
  return (
    <div role="group" aria-label={`Decidir a vaga #${n}`} data-testid="decisao-no-detalhe"
      className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-1">
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReprovar}
        className="val-alvo h-9 rounded-lg px-2.5 text-danger hover:bg-danger-soft hover:text-danger sm:mr-auto">
        <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" /> Reprovar
      </Button>
      {onDevolver && (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDevolver} className="val-alvo h-9 rounded-lg">
          <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Devolver
        </Button>
      )}
      <Button type="button" size="sm" disabled={busy} onClick={onAprovar} data-testid="button-aprovar-no-detalhe"
        className={cn("val-alvo h-9 rounded-lg bg-success px-3.5 font-semibold text-white shadow-1 hover:bg-success/90", "max-sm:w-full")}>
        <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> {rotuloAprovar}
      </Button>
    </div>
  );
}

/** Vaga de outro aprovador: o rodapé diz quem decide — sem botão que o servidor recusaria. */
export function QuemDecideNoDetalhe({ aprovadores }: { aprovadores: string[] }) {
  return (
    <p className="mr-auto text-xs leading-5 text-muted-foreground" data-testid="quem-decide-no-detalhe">
      {aprovadores.length ? <>Quem decide esta vaga: <span className="font-medium text-foreground">{aprovadores.join(", ")}</span>.</> : "Você não é aprovador desta função."}
    </p>
  );
}
