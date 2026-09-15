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
import { MI } from "@/components/layout/mi";
import { useShellData, type ShellNotification } from "@/components/layout/use-shell-data";
import { cn } from "@/lib/utils";

export default function PendenciasPage() {
  const { notifications, pendingTotal, hasUnseen, markAllSeen } = useShellData();
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
          <h1 className="m-0 text-xl font-semibold text-slate-900">Pendências</h1>
          <p className="m-0 mt-0.5 text-sm text-slate-500">
            {pendingTotal > 0
              ? `Tudo que espera uma ação sua no sistema · ${pendingTotal}`
              : "Tudo que espera uma ação sua no sistema"}
          </p>
        </div>
        {hasUnseen && (
          <button
            type="button"
            onClick={markAllSeen}
            className="rounded-lg border border-slate-200 bg-card px-3 py-1.5 text-xs font-medium text-primary hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Marcar tudo como visto
          </button>
        )}
      </div>

      {porTela.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-card px-6 py-12 text-center text-slate-400">
          <MI name="task_alt" size={28} />
          <p className="m-0 mt-2 text-sm text-slate-500">Nada pendente para você agora.</p>
        </div>
      ) : porTela.map(([tela, itens]) => (
        <section key={tela} className="overflow-hidden rounded-xl border border-slate-200 bg-card">
          <h2 className="m-0 border-b border-slate-100 bg-background/60 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
            {tela} <span className="font-normal text-slate-400">· {itens.length}</span>
          </h2>
          {itens.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => abrir(n.href)}
              className={cn(
                "flex w-full items-center gap-3 border-0 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-slate-50 cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                n.isNew ? "bg-brand-soft/35" : "bg-card",
              )}
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", n.iconClass)}>
                <MI name={n.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-slate-900">{n.title}</span>
                {n.text && <span className="block text-xs text-slate-500">{n.text}</span>}
                {n.when && <span className="block mt-0.5 text-[11px] text-slate-400">{n.when}</span>}
              </span>
              {n.isNew && <span aria-label="novo" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
              <span className="text-slate-300"><MI name="chevron_right" size={18} /></span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
