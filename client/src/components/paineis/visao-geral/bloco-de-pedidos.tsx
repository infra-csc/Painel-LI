/**
 * Visão geral (30/10) — pedidos de ajuste/inclusão/exclusão esperando o
 * aprovador (os mais antigos primeiro: é a lista de quem cobrar) e as trocas
 * de colaborador pendentes. Cada pedido abre direto na Aprovação de escala.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight, MessageSquareWarning } from "lucide-react";
import type { User } from "@shared/schema";
import { hasPermission } from "@/lib/role-utils";
import { DIAS_PEDIDO_PARADO, ROTULO_DO_PEDIDO, plural, type ResumoDosPedidos } from "../comum/paineis-dados";
import { AvisoDoBloco, CartaoDoPainel, LinkDoRodape } from "../comum/ui";

const LINHAS_POR_VEZ = 5;

export function BlocoDePedidos({ pedidos, disponiveis, trocasPendentes, user }: {
  pedidos: ResumoDosPedidos;
  disponiveis: boolean;
  trocasPendentes: number;
  user: User | null;
}) {
  const [todos, setTodos] = useState(false);
  const podeAprovar = hasPermission(user, "canAccessScalingApproval");
  const visiveis = todos ? pedidos.maisAntigos : pedidos.maisAntigos.slice(0, LINHAS_POR_VEZ);
  const hrefDoPedido = (eventId: string, id: string) => (podeAprovar
    ? `/scaling-approval?eventId=${encodeURIComponent(eventId)}&request=${encodeURIComponent(id)}`
    : `/scaling?eventId=${encodeURIComponent(eventId)}`);

  return (
    <CartaoDoPainel
      id="bloco-pedidos"
      icone={MessageSquareWarning}
      tom={pedidos.parados > 0 ? "danger" : pedidos.total > 0 ? "warning" : "success"}
      titulo="Pedidos de ajuste pendentes"
      subtitulo="Ajuste, inclusão e exclusão esperando o aprovador — os mais antigos primeiro"
      testId="bloco-pedidos"
      contagem={
        <span className="block leading-tight">
          <span className={`block text-xl font-semibold tabular-nums ${pedidos.total > 0 ? "text-warning" : "text-success"}`} data-testid="bloco-pedidos-total">{pedidos.total}</span>
          <span className="block text-2xs text-muted-foreground">{pedidos.total === 1 ? "pendente" : "pendentes"}</span>
        </span>
      }
      acao={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LinkDoRodape href="/scaling?fila=troca" testId="link-trocas-pendentes">
            {trocasPendentes > 0 ? `${plural(trocasPendentes, "troca de colaborador pendente", "trocas de colaborador pendentes")}` : "Trocas de colaborador"}
          </LinkDoRodape>
          {podeAprovar && <LinkDoRodape href="/scaling-approval">Abrir a Aprovação de escala</LinkDoRodape>}
        </div>
      }
    >
      {!disponiveis ? (
        <AvisoDoBloco tom="neutral">Carregando os pedidos…</AvisoDoBloco>
      ) : pedidos.total === 0 ? (
        <AvisoDoBloco testId="bloco-pedidos-vazio">Nenhum pedido de ajuste esperando decisão.</AvisoDoBloco>
      ) : (
        <>
          <p className="border-b border-border bg-surface-muted/40 px-4 py-1.5 text-2xs text-slate-600">
            {plural(pedidos.total, "pedido", "pedidos")} em {plural(pedidos.porEvento.length, "evento", "eventos")}
            {pedidos.parados > 0 && <> · <span className="font-semibold text-danger">{pedidos.parados} há {DIAS_PEDIDO_PARADO} dias ou mais</span></>}
          </p>
          <ul className="m-0 p-0">
            {visiveis.map((p) => (
              <li key={p.id} className="list-none">
                <Link
                  href={hrefDoPedido(p.eventId, p.id)}
                  className="group flex items-start gap-3 border-b border-border px-4 py-2.5 no-underline last:border-b-0 hover:bg-surface-muted focus-visible:bg-brand-soft focus-visible:outline-none"
                  data-testid={`pedido-${p.id}`}
                >
                  <span className="mt-0.5 shrink-0 rounded-md bg-brand-soft px-1.5 py-px text-2xs font-semibold text-primary">{ROTULO_DO_PEDIDO[p.requestType] ?? p.requestType}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground" title={p.eventName ?? undefined}>
                      <span className="font-medium">{p.eventName || "Evento"}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[p.inclusionNumber ? `#${p.inclusionNumber}` : null, p.functionName, p.requestedByName ? `por ${p.requestedByName}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${(p.diasEsperando ?? 0) >= DIAS_PEDIDO_PARADO ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                    {p.diasEsperando === null ? "" : p.diasEsperando === 0 ? "hoje" : `há ${plural(p.diasEsperando, "dia", "dias")}`}
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {pedidos.maisAntigos.length > LINHAS_POR_VEZ && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="border-t border-border px-4 py-2 text-left text-xs font-medium text-primary hover:bg-surface-muted"
              aria-expanded={todos}
            >
              {todos ? "Mostrar menos" : `Mostrar todos os ${pedidos.maisAntigos.length} pedidos`}
            </button>
          )}
        </>
      )}
    </CartaoDoPainel>
  );
}
