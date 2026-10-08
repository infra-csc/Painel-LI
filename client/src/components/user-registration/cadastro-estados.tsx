/**
 * Cadastro de usuários — estados da tela (redesenho 08/10): esqueleto no
 * formato real, sem acesso com saída e a confirmação de conta criada, que fica
 * na página (com o próximo passo) em vez de sumir num aviso.
 */
import { CircleCheck, Info, Lock, UserCog, UserPlus, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { toTitleCase } from "@/lib/format";
import type { Perfil } from "./perfis";

export function EsqueletoDoCadastro() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando o cadastro de usuários" className="cad-pagina" data-testid="cad-carregando">
      <span className="sr-only">Carregando o cadastro de usuários…</span>
      <div className="cad-grade">
      <div aria-hidden="true" className="cad-cartao rounded-xl border border-border bg-card">
        {[2, 3, 1].map((n, i) => (
          <div key={i} className="cad-secao">
            <div className="cad-secao-texto space-y-2"><div className="pas-osso h-4 w-36" /><div className="pas-osso h-3 w-56 max-w-full" /></div>
            <div className="space-y-2.5">
              {Array.from({ length: n }).map((_, j) => <div key={j} className="pas-osso h-10 w-full rounded-lg" />)}
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3"><div className="pas-osso h-9 w-20 rounded-lg" /><div className="pas-osso h-9 w-32 rounded-lg" /></div>
      </div>
      <div aria-hidden="true" className="cad-lateral rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="pas-osso h-3 w-32" />
        <div className="flex items-center gap-3"><div className="pas-osso h-11 w-11 rounded-full" /><div className="space-y-1.5 flex-1"><div className="pas-osso h-3.5 w-32" /><div className="pas-osso h-3 w-40" /></div></div>
        <div className="pas-osso h-16 w-full" />
      </div>
      </div>
    </div>
  );
}

/** Defesa da própria página (a rota já desvia quem não tem `canCreateUsers`). */
export function SemAcessoAoCadastro({ logistica }: { logistica: boolean }) {
  return (
    <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16 max-w-[640px]" data-testid="cad-sem-acesso">
      <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full mb-3 ${logistica ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"}`} aria-hidden="true">
        {logistica ? <Info className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">
        {logistica ? "Cadastro de usuários indisponível para o seu perfil" : "Acesso restrito"}
      </h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        {logistica
          ? "Solicite ao RH ou à área de Compras a criação de novos usuários. Você continua podendo aprovar, resetar senha e ativar/desativar contas em Usuários."
          : "Apenas administradores, RH e Compras podem cadastrar usuários."}
      </p>
      <Button asChild variant="outline" className="mt-5 rounded-lg">
        {logistica ? <Link href="/admin-users">Ir para Usuários</Link> : <Link href="/">Voltar ao início</Link>}
      </Button>
    </div>
  );
}

export interface ContaCriada {
  nome: string;
  email: string;
  perfil: Perfil | undefined;
}

/** Faixa de sucesso: quem foi criado, como entra e para onde seguir. */
export function CadastroConcluido({ conta, podeVerUsuarios, onOutro, onFechar }: {
  conta: ContaCriada;
  podeVerUsuarios: boolean;
  onOutro: () => void;
  onFechar: () => void;
}) {
  return (
    <div
      role="status"
      tabIndex={-1}
      id="cad-concluido"
      className="cad-concluido pas-entra relative flex items-start gap-3 rounded-xl border border-success-strong/30 bg-success-soft px-4 py-3.5 pr-11 outline-none sm:items-center sm:gap-4"
      data-testid="cad-concluido"
    >
      <span className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-card text-success-strong" aria-hidden="true">
        <CircleCheck className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-foreground">
            Usuário criado: {toTitleCase(conta.nome.trim())}
            {conta.perfil && <span className="font-normal text-muted-foreground"> · {conta.perfil.label}</span>}
          </p>
          <p className="m-0 mt-0.5 text-xs leading-relaxed text-success">
            Já pode entrar pelo Portal Norte com a conta Microsoft <span className="font-medium [overflow-wrap:anywhere]">{conta.email.trim().toLowerCase()}</span>. Nenhuma senha foi enviada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {podeVerUsuarios && (
            <Button asChild variant="outline" size="sm" className="pas-alvo h-8 rounded-lg bg-card max-sm:w-full">
              <Link href="/admin-users"><UserCog className="w-3.5 h-3.5" aria-hidden="true" />Ver em Usuários</Link>
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="pas-alvo h-8 rounded-lg bg-card max-sm:w-full" onClick={onOutro} data-testid="cad-outro">
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />Cadastrar outra pessoa
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar o aviso"
        className="pas-alvo absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
