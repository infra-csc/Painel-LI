/**
 * PENDÊNCIAS — página geral (dono, 15/09: "o ver todas as pendências teria que
 * ser um geral, não só do módulo de Escala, pois teria que ser todas as
 * notificações do sistema").
 *
 * Mesma fonte do sininho (`useShellData`): nada inventado, cada item já vem
 * filtrado pelo que ESTE usuário pode resolver. Agrupado por tela.
 *
 * 07/10 (casca premium): linha-resumo com o total e as novidades, grupos como
 * listas (não cartões empilhados), "Novo" escrito em vez de um ponto vermelho
 * sem legenda, esqueleto no carregamento, "Tentar de novo" no erro e um vazio
 * que diz o que acontece quando algo chegar. O "· N" do grupo saiu: contava
 * LINHAS (2) enquanto os títulos falavam em pendências (5) — confundia.
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, CircleCheckBig, ChevronRight, CheckCheck, RotateCw, Bell } from "lucide-react";
import { useShellData, type ShellNotification } from "@/components/layout/use-shell-data";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { useQueryKeysState } from "@/components/common/query-state";
import { SHELL_QUERY_KEYS, LinhasCarregando } from "@/components/layout/notifications-menu";

export default function PendenciasPage() {
  usePageTitle("Pendências");
  const { notifications, pendingTotal, hasUnseen, markAllSeen } = useShellData();
  // Carregando/erro (23/09): antes a página dizia "Nada pendente" enquanto as
  // consultas ainda corriam — e também quando falhavam.
  const estado = useQueryKeysState(SHELL_QUERY_KEYS);
  const queryClient = useQueryClient();
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
  const novas = notifications.filter((n) => n.isNew).length;

  const abrir = (href: string) => navegar(`${href}${href.includes("?") ? "&" : "?"}t=${Date.now()}`);
  const tentarDeNovo = () => {
    for (const key of SHELL_QUERY_KEYS) void queryClient.refetchQueries({ queryKey: [...key] });
  };

  const carregando = porTela.length === 0 && estado.isLoading;
  const erro = porTela.length === 0 && !carregando && estado.isError;

  return (
    // Barra de 56px como as outras telas (09/10): a barra sangra até as bordas
    // e a caixa de entrada fica numa coluna de leitura de até 880px.
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      <PageHeader
        variant="bar"
        title="Pendências"
        subtitle="O que espera uma ação sua, em todo o sistema"
        className="mx-0 mt-0"
        actions={hasUnseen && (
          <Button type="button" variant="outline" size="sm" onClick={markAllSeen}>
            <CheckCheck className="h-4 w-4" aria-hidden="true" /> Marcar tudo como visto
          </Button>
        )}
      />
      <div className="px-[var(--page-gutter)] pt-5 pb-6">
        <div className="mx-auto w-full max-w-[880px] space-y-5">
          {/* Linha-resumo: o número que importa primeiro, e de onde ele vem. */}
          {porTela.length > 0 && (
            <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] text-muted-foreground" aria-live="polite">
              <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{pendingTotal}</span>
              <span>{pendingTotal === 1 ? "pendência" : "pendências"} em {porTela.length} {porTela.length === 1 ? "tela" : "telas"}</span>
              {novas > 0 && (
                <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-brand-soft text-2xs font-semibold text-primary self-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
                  {novas === 1 ? "1 novidade" : `${novas} novidades`} desde a última visita
                </span>
              )}
            </p>
          )}

          {carregando ? (
            <div role="status" aria-live="polite" className="overflow-hidden rounded-xl border border-border bg-card">
              <span className="sr-only">Carregando pendências…</span>
              <div className="h-10 border-b border-border bg-surface-muted" aria-hidden="true" />
              <LinhasCarregando linhas={4} className="[&>div]:py-4" />
            </div>
          ) : erro ? (
            <div role="alert" className="casca-surgir flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-danger-soft text-danger mb-4">
                <CloudOff className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="m-0 text-sm font-semibold text-foreground">Não foi possível carregar as pendências.</p>
              <p className="m-0 mt-1 max-w-sm text-xs text-muted-foreground">Verifique sua conexão. Nada foi perdido — as pendências continuam no servidor.</p>
              <Button type="button" variant="outline" size="sm" className="mt-5" onClick={tentarDeNovo}>
                <RotateCw className="h-4 w-4" aria-hidden="true" /> Tentar de novo
              </Button>
            </div>
          ) : porTela.length === 0 ? (
            <div className="casca-surgir flex flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-success-soft text-success-strong mb-4">
                <CircleCheckBig className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="m-0 text-base font-semibold text-foreground">Tudo em dia</p>
              <p className="m-0 mt-1 text-sm text-muted-foreground">Nada pendente para você agora.</p>
              <p className="m-0 mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                Quando algo precisar de você, aparece aqui e no sino do topo.
              </p>
            </div>
          ) : porTela.map(([tela, itens]) => (
            <section key={tela} aria-label={tela} className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
              <h2 className="m-0 flex items-center h-10 px-4 border-b border-border bg-surface-muted text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {tela}
              </h2>
              <ul className="m-0 p-0 list-none divide-y divide-border">
                {itens.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => abrir(n.href)}
                      className={cn(
                        "group flex w-full items-center gap-3.5 border-0 px-4 py-3.5 text-left cursor-pointer transition-colors",
                        "hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                        n.isNew ? "bg-brand-soft/40" : "bg-card",
                      )}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", n.iconClass)}>
                        <n.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-sm font-semibold text-foreground">{n.title}</span>
                          {n.isNew && (
                            <span className="inline-flex items-center h-[18px] px-1.5 rounded-full bg-brand-soft text-2xs font-semibold text-primary ring-1 ring-inset ring-primary/15">Novo</span>
                          )}
                        </span>
                        {n.text && <span className="block mt-0.5 text-[13px] text-muted-foreground">{n.text}</span>}
                        {n.when && <span className="block mt-1 text-2xs text-muted-foreground">{n.when}</span>}
                      </span>
                      <span className="hidden sm:inline text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        Abrir
                      </span>
                      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
