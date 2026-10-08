/**
 * Ver como usuário — a lista de quem pode ser simulado (redesenho 08/10).
 *
 * Uma lista só, medida pela PRÓPRIA largura: colunas Pessoa · Perfil · Área ·
 * ação quando cabe, cartão de duas linhas quando não. A linha inteira abre a
 * confirmação (o ::after do nome cobre a linha) e o "Ver como" fica sempre à
 * vista. Estados: esqueleto no formato real, erro com "Tentar novamente",
 * vazio com saída e sem resultado com "Limpar busca".
 */
import { AlertCircle, Eye, RotateCw, SearchX, UserPlus, Users } from "lucide-react";
import { Link } from "wouter";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { initials, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { perfilDe, telasDoPerfil, totalDeTelas } from "@/components/user-registration/perfis";

function Cabecalho() {
  return (
    <div className="sim-cabecalho" aria-hidden="true">
      <span>Pessoa</span><span>Perfil</span><span>Área</span><span className="sr-only">Ação</span>
    </div>
  );
}

export function ListaDePessoas({ pessoas, bloqueado, iniciandoId, onEscolher }: {
  pessoas: User[];
  /** Simulação já ativa: nada pode começar daqui. */
  bloqueado: boolean;
  iniciandoId: string | null;
  onEscolher: (u: User) => void;
}) {
  return (
    <div className="sim-moldura rounded-xl border border-border bg-card" data-testid="sim-lista">
      <Cabecalho />
      <ul className="m-0 p-0 list-none" aria-label="Pessoas que podem ser simuladas">
        {pessoas.map((u) => {
          const perfil = perfilDe(u.role);
          const nome = toTitleCase(u.name || u.email || "");
          const n = totalDeTelas(telasDoPerfil(u.role));
          const iniciando = iniciandoId === u.id;
          return (
            <li key={u.id} className={cn("sim-linha", bloqueado && "sim-linha-bloqueada")} data-testid={`sim-pessoa-${u.id}`}>
              <div className="sim-pessoa">
                <span className="sim-avatar" aria-hidden="true">{initials(u.name || u.email || "?")}</span>
                <div className="min-w-0">
                  <button
                    type="button"
                    className="sim-abrir"
                    onClick={() => onEscolher(u)}
                    disabled={bloqueado || iniciandoId !== null}
                    aria-label={`Ver o sistema como ${nome}`}
                  >
                    {nome}
                  </button>
                  <p className="m-0 text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>
              <div className="sim-perfil">
                {perfil ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <perfil.icon className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />{perfil.label}
                  </span>
                ) : <span className="text-sm text-muted-foreground">Perfil desconhecido</span>}
                <span className="sim-perfil-telas text-xs tabular-nums text-muted-foreground">{n} telas</span>
              </div>
              <div className="sim-area">
                {u.area?.trim()
                  ? <span className="text-sm text-slate-700 truncate">{u.area}</span>
                  : <span className="text-sm text-muted-foreground">—</span>}
              </div>
              <div className="sim-acao">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={bloqueado || iniciandoId !== null}
                  onClick={() => onEscolher(u)}
                  className="sim-ver pas-alvo h-8 rounded-lg px-3 text-xs font-semibold"
                >
                  <Eye className="w-3.5 h-3.5" />{iniciando ? "Entrando…" : "Ver como"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EsqueletoDaLista() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando os usuários" className="sim-moldura rounded-xl border border-border bg-card" data-testid="sim-carregando">
      <span className="sr-only">Carregando os usuários…</span>
      <Cabecalho />
      <div aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sim-linha">
            <div className="sim-pessoa"><div className="pas-osso w-9 h-9 rounded-full shrink-0" /><div className="space-y-1.5 flex-1"><div className="pas-osso h-3.5 w-40 max-w-full" /><div className="pas-osso h-3 w-48 max-w-full" /></div></div>
            <div className="sim-perfil"><div className="pas-osso h-3.5 w-28" /></div>
            <div className="sim-area"><div className="pas-osso h-3.5 w-20" /></div>
            <div className="sim-acao"><div className="pas-osso h-8 w-24 rounded-lg" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErroDaLista({ onRetry, tentando }: { onRetry: () => void; tentando: boolean }) {
  return (
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="sim-erro">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <AlertCircle className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar os usuários</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        Sem a lista não dá para escolher quem simular. Nada foi alterado — verifique sua conexão e tente de novo.
      </p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={onRetry} disabled={tentando} data-testid="sim-tentar-novamente">
        <RotateCw className={cn("w-4 h-4", tentando && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />Tentar novamente
      </Button>
    </div>
  );
}

/** Ninguém além de você está ativo e aprovado. */
export function NinguemParaSimular({ podeCadastrar }: { podeCadastrar: boolean }) {
  return (
    <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="sim-vazio">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
        <Users className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Nenhum outro usuário ativo para simular</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        Só contas ativas e aprovadas podem ser simuladas. Cadastre alguém ou reative uma conta em Usuários.
      </p>
      {podeCadastrar && (
        <Button asChild variant="outline" className="mt-5 rounded-lg">
          <Link href="/user-registration"><UserPlus className="w-4 h-4" aria-hidden="true" />Cadastrar usuário</Link>
        </Button>
      )}
    </div>
  );
}

export function SemResultado({ busca, onLimpar }: { busca: string; onLimpar: () => void }) {
  return (
    <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-12" data-testid="sim-sem-resultado">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
        <SearchX className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Nenhum usuário ativo encontrado</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        {busca.trim() ? <>Ninguém com “{busca.trim()}” no nome ou no e-mail neste filtro.</> : <>Ninguém com este perfil entre os usuários ativos.</>}
      </p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={onLimpar} data-testid="sim-limpar">
        Limpar busca e filtro
      </Button>
    </div>
  );
}
