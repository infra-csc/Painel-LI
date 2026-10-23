/**
 * SEM ACESSO — dois casos da casca.
 *
 *  - `variante="nenhuma"` (07/10): a conta entrou, mas o papel não abre
 *    nenhuma tela (App.tsx/HomeRedirect decide quando aparece). Diz quem está
 *    conectado (para conferir se entrou com a conta certa) e oferece
 *    recarregar — o caso comum é o administrador liberar o acesso na hora.
 *  - `variante="tela"` (23/10): o papel abre outras telas, mas não ESTA (URL
 *    digitada ou link antigo). Hoje aparece para o perfil Honorários, que abre
 *    só os Honorários da cenotécnica — em vez de um redirecionamento mudo, a
 *    pessoa entende o porquê e tem o botão para a tela dela.
 */
import { ArrowRight, Lock, LogOut, RotateCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getRoleLabel, type UserRole } from "@/lib/role-utils";
import { initials } from "@/lib/format";
import { usePageTitle } from "@/components/common/use-page-title";
import { visibleTabs } from "./nav-items";

export default function SemAcesso({ variante = "nenhuma" }: { variante?: "nenhuma" | "tela" }) {
  usePageTitle("Sem acesso");
  const { user, logout } = useAuth();
  const roleLabel = getRoleLabel((user?.role || "production") as UserRole);
  const nome = user?.name || "Usuário";
  const telas = variante === "tela" ? visibleTabs(user) : [];
  const destino = telas[0];
  const nomesDasTelas = telas.map((t) => t.label);

  return (
    <div className="casca-surgir min-h-[calc(100dvh-160px)] flex items-center justify-center" data-testid={variante === "tela" ? "sem-acesso-a-tela" : "sem-acesso"}>
      <div className="w-full max-w-[440px] text-center">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground mb-5">
          <Lock className="w-6 h-6" aria-hidden="true" />
        </span>
        {variante === "tela" ? (
          <>
            <h1 className="m-0 text-xl font-bold tracking-tight text-foreground">Sem acesso a esta tela</h1>
            <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
              {nomesDasTelas.length === 1
                ? <>O seu perfil abre só <strong className="font-semibold text-foreground">{nomesDasTelas[0]}</strong>. Se precisar de outra tela, peça ao administrador do sistema.</>
                : "Esta tela não faz parte do seu perfil. Se precisar dela, peça ao administrador do sistema."}
            </p>
          </>
        ) : (
          <>
            <h1 className="m-0 text-xl font-bold tracking-tight text-foreground">Nenhuma tela liberada ainda</h1>
            <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
              Sua conta entrou, mas ainda não tem permissão para nenhuma tela do painel.
              Peça ao administrador do sistema para liberar o seu acesso.
            </p>
          </>
        )}

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left">
          <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            {initials(nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[13px] font-semibold text-foreground truncate">{nome}</p>
            <p className="m-0 text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <span className="shrink-0 inline-flex items-center h-6 px-2 rounded-full bg-muted text-2xs font-medium text-muted-foreground">{roleLabel}</span>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2">
          {variante === "tela" && destino ? (
            <Button asChild>
              <Link href={destino.path}>
                Ir para {destino.label} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={logout}>
                <LogOut aria-hidden="true" /> Sair
              </Button>
              <Button type="button" onClick={() => window.location.reload()}>
                <RotateCw aria-hidden="true" /> Já liberaram? Recarregar
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
