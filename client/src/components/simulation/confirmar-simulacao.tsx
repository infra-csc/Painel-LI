/**
 * Ver como usuário — a confirmação antes de entrar (redesenho 08/10).
 *
 * Diz QUEM (nome, e-mail, perfil, área), O QUE você vai ver (as telas do
 * perfil, do mesmo modelo do menu) e COMO SAIR, na confirmação padrão do app.
 * Entrar segue o mesmo caminho de antes (POST /api/simulation/start → limpa o
 * cache → recarrega em "/"); se o servidor recusar, o motivo fica aqui dentro.
 */
import { AlertCircle, Lock, LogOut } from "lucide-react";
import type { User } from "@shared/schema";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { initials, toTitleCase } from "@/lib/format";
import { perfilDe, telasDoPerfil, totalDeTelas } from "@/components/user-registration/perfis";
import { ListaDeTelas } from "@/components/user-registration/lista-de-telas";

export function ConfirmarSimulacao({ alvo, iniciando, erro, onConfirmar, onFechar }: {
  alvo: User | null;
  iniciando: boolean;
  erro: string | null;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  const nome = toTitleCase(alvo?.name || alvo?.email || "");
  const primeiro = nome.split(/\s+/)[0] || nome;
  const perfil = perfilDe(alvo?.role);
  const telas = telasDoPerfil(alvo?.role);

  return (
    <ConfirmDialog
      open={!!alvo}
      onOpenChange={(o) => { if (!o) onFechar(); }}
      title={<>Ver o sistema como {nome}?</>}
      confirmLabel={iniciando ? "Entrando…" : <>Ver como {primeiro}</>}
      pending={iniciando}
      onConfirm={onConfirmar}
      className="max-w-[560px] max-h-[calc(100dvh-32px)] overflow-y-auto"
      testId="sim-confirmar"
      confirmTestId="sim-confirmar-entrar"
    >
      {alvo && (
        <div className="flex flex-col gap-3 text-foreground">
          {/* Quem */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="sim-avatar" aria-hidden="true">{initials(alvo.name || alvo.email || "?")}</span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold text-foreground truncate">{nome}</p>
              <p className="m-0 text-xs text-muted-foreground truncate">
                {alvo.email}
                {alvo.area?.trim() && <> · {alvo.area}</>}
              </p>
            </div>
            {perfil && (
              <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 rounded-md bg-card px-2 py-1 text-xs font-medium text-foreground border border-border">
                <perfil.icon className="w-3.5 h-3.5 text-primary" aria-hidden="true" />{perfil.label}
              </span>
            )}
          </div>

          {/* O que você vai ver */}
          <div>
            <p className="m-0 mb-1.5 text-xs font-semibold text-foreground">
              O que você vai ver{perfil && <span className="sm:hidden font-normal text-muted-foreground"> · {perfil.label}</span>}
              <span className="font-normal text-muted-foreground"> · {totalDeTelas(telas)} telas no menu</span>
            </p>
            <ListaDeTelas grupos={telas} className="rounded-lg border border-border bg-card px-3 py-2.5" />
          </div>

          {/* Regras e saída */}
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5 text-xs leading-[18px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span><b className="font-semibold text-foreground">Somente leitura.</b> Nada pode ser salvo, aprovado ou enviado em nome de {primeiro}. Início e fim ficam no Log de auditoria.</span>
            </li>
            <li className="flex items-start gap-2">
              <LogOut className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span><b className="font-semibold text-foreground">Para voltar a ser você,</b> use “Sair da simulação” na faixa azul do topo. A página recarrega em seguida.</span>
            </li>
          </ul>

          {erro && (
            <p role="alert" className="pas-entra m-0 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger" data-testid="sim-erro-iniciar">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span><b className="font-semibold">Não foi possível iniciar a simulação.</b> {erro}</span>
            </p>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
