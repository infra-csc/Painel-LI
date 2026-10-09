/**
 * Cadastro de usuários — o resumo da conta que vai ser criada (redesenho
 * 08/10). Espelha o formulário enquanto a pessoa digita: como o nome aparece
 * no sistema, o perfil, a área e por onde ela entra. Só leitura do formulário.
 */
import { KeyRound, User } from "lucide-react";
import { initials, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Perfil } from "./perfis";

export function ResumoDoCadastro({ nome, email, emailValido, perfil, area }: {
  nome: string;
  email: string;
  emailValido: boolean;
  perfil: Perfil | undefined;
  area: string;
}) {
  const nomeLimpo = nome.trim();

  return (
    <section aria-labelledby="cad-resumo-titulo" className="cad-resumo rounded-xl border border-border bg-card" data-testid="cad-resumo">
      <h2 id="cad-resumo-titulo" className="m-0 px-4 pt-3.5 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Conta que será criada
      </h2>

      <div className="flex items-center gap-3 px-4 pt-3 pb-4">
        <span
          className={cn(
            "cad-avatar inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-full text-sm font-semibold",
            nomeLimpo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
          aria-hidden="true"
        >
          {nomeLimpo ? initials(nomeLimpo) : <User className="w-5 h-5" />}
        </span>
        <div className="min-w-0">
          <p className={cn("m-0 text-sm font-semibold truncate", nomeLimpo ? "text-foreground" : "text-muted-foreground")}>
            {nomeLimpo ? toTitleCase(nomeLimpo) : "Nome da pessoa"}
          </p>
          <p className={cn("m-0 text-xs truncate", email && emailValido ? "text-slate-700" : "text-muted-foreground")}>
            {email && emailValido ? email.trim() : "e-mail corporativo"}
          </p>
        </div>
      </div>

      <dl className="cad-resumo-linhas m-0 border-t border-border px-4 py-3 text-xs">
        <dt className="text-muted-foreground">Perfil</dt>
        <dd className="m-0 min-w-0">
          {perfil
            ? <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><perfil.icon className="w-3.5 h-3.5 text-primary" aria-hidden="true" />{perfil.label}</span>
            : <span className="text-muted-foreground">não escolhido</span>}
        </dd>
        <dt className="text-muted-foreground">Área</dt>
        <dd className={cn("m-0 min-w-0 truncate", area.trim() ? "text-foreground" : "text-muted-foreground")}>{area.trim() || "sem área"}</dd>
        <dt className="text-muted-foreground">Entra por</dt>
        <dd className="m-0 min-w-0 text-foreground">Portal Norte, com a conta Microsoft</dd>
      </dl>

      <div className="flex items-start gap-2 border-t border-border bg-surface-muted/70 px-4 py-3 rounded-b-xl">
        <KeyRound className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          Sem senha: o e-mail precisa ser o da conta Microsoft da pessoa — é por ele que o Portal Norte a reconhece.
        </p>
      </div>
    </section>
  );
}
