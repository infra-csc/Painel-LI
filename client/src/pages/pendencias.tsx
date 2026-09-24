/**
 * PENDÊNCIAS — página geral (dono, 15/09: "o ver todas as pendências teria que
 * ser um geral, não só do módulo de Escala, pois teria que ser todas as
 * notificações do sistema").
 *
 * Mesma fonte do sininho (`useShellData`): nada inventado, cada item já vem
 * filtrado pelo que ESTE usuário pode resolver. Agrupado por tela.
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { Hourglass, CloudOff, CircleCheckBig, ChevronRight } from "lucide-react";
import { useShellData, type ShellNotification } from "@/components/layout/use-shell-data";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/common/use-page-title";
import { useQueryKeysState } from "@/components/common/query-state";
import { SHELL_QUERY_KEYS } from "@/components/layout/notifications-menu";

export default function PendenciasPage() {
  usePageTitle("Pendências");
  const { notifications, pendingTotal, hasUnseen, markAllSeen } = useShellData();
  // Carregando/erro (23/09): antes a página dizia "Nada pendente" enquanto as
  // consultas ainda corriam — e também quando falhavam.
  const estado = useQueryKeysState(SHELL_QUERY_KEYS);
  const [, navegar] = useLocation();

  const porTela = useMemo(() => {
    const grupos = new Map<string, ShellNotification[]>();
    for (const n of notifications) {
      const lista = grupos.get(n.screen) ?? [];
      lista.push(n);
      grupos.set(n.screen, lista);
    }
    return Array.from(grupos.entries());
  }, [notifications]);

  const abrir = (href: string) => navegar(`${href}${href.includes("?") ? "&" : "?"}t=${Date.now()}`);

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold text-foreground">Pendências</h1>
          <p className="m-0 mt-0.5 text-sm text-muted-foreground">
            {pendingTotal > 0
              ? `Tudo que espera uma ação sua no sistema · ${pendingTotal}`
              : "Tudo que espera uma ação sua no sistema"}
          </p>
        </div>
        {hasUnseen && (
          <button
            type="button"
            onClick={markAllSeen}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Marcar tudo como visto
          </button>
        )}
      </div>

      {porTela.length === 0 && estado.isLoading ? (
        <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          <Hourglass className="mx-auto h-7 w-7" aria-hidden="true" />
          <p className="m-0 mt-2 text-sm">Carregando pendências…</p>
        </div>
      ) : porTela.length === 0 && estado.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-card px-6 py-12 text-center text-muted-foreground">
          <CloudOff className="mx-auto h-7 w-7" aria-hidden="true" />
          <p className="m-0 mt-2 text-sm font-medium text-foreground">Não foi possível carregar as pendências.</p>
          <p className="m-0 mt-1 text-xs">Verifique sua conexão e recarregue a página.</p>
        </div>
      ) : porTela.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          <CircleCheckBig className="mx-auto h-7 w-7" aria-hidden="true" />
          <p className="m-0 mt-2 text-sm text-muted-foreground">Nada pendente para você agora.</p>
        </div>
      ) : porTela.map(([tela, itens]) => (
        <section key={tela} className="overflow-hidden rounded-xl border border-border bg-card">
          <h2 className="m-0 border-b border-border bg-background/60 px-4 py-2.5 text-sm font-semibold text-slate-700">
            {tela} <span className="font-normal text-muted-foreground">· {itens.length}</span>
          </h2>
          {itens.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => abrir(n.href)}
              className={cn(
                "flex w-full items-center gap-3 border-0 border-b border-border px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-surface-muted cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                n.isNew ? "bg-brand-soft/35" : "bg-card",
              )}
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", n.iconClass)}>
                <n.icon className="h-[17px] w-[17px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{n.title}</span>
                {n.text && <span className="block text-xs text-muted-foreground">{n.text}</span>}
                {n.when && <span className="block mt-0.5 text-2xs text-muted-foreground">{n.when}</span>}
              </span>
              {n.isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-danger-strong" aria-hidden="true" />}{n.isNew && <span className="sr-only">Novo</span>}
              <span className="text-muted-foreground"><ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
