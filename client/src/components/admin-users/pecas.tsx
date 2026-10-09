/**
 * Usuários — peças pequenas da lista e dos diálogos (08/10, redesenho).
 *
 *  - `AvatarDoUsuario`: iniciais com cor estável, só tons sem significado
 *    (verde/âmbar/vermelho no avatar competiam com a situação ao lado);
 *  - `PerfilDoUsuario`: o perfil em etiqueta NEUTRA — só o Administrador ganha
 *    a cor da marca e o escudo, porque é o único que abre tudo;
 *  - `SituacaoDaConta`: ponto + texto (Ativo, Pendente, Inativo, Rejeitado);
 *  - `MapaDeAcesso`: quatro filetes (Cadastros, Operacional, Financeiro,
 *    Gestão) cheios na proporção das telas abertas + "N telas". Clicar abre a
 *    lista das telas, agrupada como no menu.
 */
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CLASSE_DO_TONE, type ToneDoGrupo } from "@/components/layout/nav-items";
import {
  RESUMO_DO_PERFIL, TOTAL_DE_TELAS, acessoPorGrupo, ehAdmin, estadoDaConta, nomeDoPerfil, telasDoPerfil,
  type EstadoDaConta,
} from "./acesso";
import { normalizeRole } from "@shared/roles";
import type { User } from "@shared/schema";

// ─── Avatar ──────────────────────────────────────────────────────────────────
const CORES: [string, string][] = [
  ["bg-brand-soft", "text-primary"],
  ["bg-info-soft", "text-info"],
  ["bg-muted", "text-slate-700"],
];
function corDoAvatar(semente: string): [string, string] {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) >>> 0;
  return CORES[h % CORES.length];
}

const TAMANHO = { sm: "w-6 h-6 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-11 h-11 text-sm" } as const;

export function AvatarDoUsuario({ nome, tamanho = "md", className }: { nome: string; tamanho?: keyof typeof TAMANHO; className?: string }) {
  const [bg, txt] = corDoAvatar(nome);
  return (
    <span aria-hidden="true" className={cn("inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none", TAMANHO[tamanho], bg, txt, className)}>
      {initials(nome) || "?"}
    </span>
  );
}

// ─── Perfil ──────────────────────────────────────────────────────────────────
export function PerfilDoUsuario({ role, className }: { role: string; className?: string }) {
  const admin = ehAdmin(role);
  const conhecido = !!normalizeRole(role);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-[22px] max-w-full px-2 rounded-md text-xs font-medium whitespace-nowrap",
        admin ? "bg-brand-soft text-primary" : conhecido ? "bg-muted text-slate-700" : "bg-danger-soft text-danger",
        className,
      )}
      title={conhecido ? undefined : "Perfil desconhecido: o sistema não abre nenhuma tela para ele"}
    >
      {admin && <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span className="truncate">{nomeDoPerfil(role)}</span>
    </span>
  );
}

// ─── Situação ────────────────────────────────────────────────────────────────
const SITUACAO: Record<EstadoDaConta, { rotulo: string; ponto: string; cls: string; dica: string }> = {
  ativo:     { rotulo: "Ativo",     ponto: "bg-success-strong", cls: "text-success",          dica: "Entra no sistema normalmente" },
  pendente:  { rotulo: "Pendente",  ponto: "bg-warning-strong", cls: "text-warning-strong",   dica: "Aguardando aprovação de um administrador — ainda não entra" },
  inativo:   { rotulo: "Inativo",   ponto: "bg-slate-400",      cls: "text-muted-foreground", dica: "Acesso desativado — não entra no sistema" },
  rejeitado: { rotulo: "Rejeitado", ponto: "bg-danger-strong",  cls: "text-danger",           dica: "Cadastro rejeitado — não entra no sistema" },
};

export function SituacaoDaConta({ u }: { u: Pick<User, "status" | "isActive"> }) {
  const s = SITUACAO[estadoDaConta(u)];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", s.cls)} title={s.dica}>
      <span aria-hidden="true" className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.ponto)} />
      {s.rotulo}
    </span>
  );
}

// ─── Telas do perfil ─────────────────────────────────────────────────────────
const FUNDO_DO_TOM: Record<ToneDoGrupo, string> = {
  primary: "bg-primary",
  info: "bg-info-strong",
  success: "bg-success-strong",
  warning: "bg-warning-strong",
};

/** Telas abertas pelo perfil, por grupo do menu (popover da lista e modal de edição). */
export function TelasDoPerfil({ role, compacto, destaque }: {
  role: string;
  compacto?: boolean;
  /** Ids de telas a realçar (ganhas na troca de perfil). */
  destaque?: ReadonlySet<string>;
}) {
  const grupos = acessoPorGrupo(role);
  return (
    <div className={cn("flex flex-col", compacto ? "gap-2.5" : "gap-3")}>
      {grupos.map(g => (
        <div key={g.titulo} className="min-w-0">
          <p className="m-0 mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            <span aria-hidden="true" className={cn("w-1.5 h-1.5 rounded-full", g.abertas.length ? FUNDO_DO_TOM[g.tom] : "bg-slate-300")} />
            {g.titulo}
            <span className="font-medium normal-case tracking-normal tabular-nums">· {g.abertas.length} de {g.total}</span>
          </p>
          {g.abertas.length === 0 ? (
            <p className="m-0 text-xs text-muted-foreground/80">Nenhuma tela deste grupo</p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1">
              {g.abertas.map(t => {
                const Icone = t.icon;
                const novo = destaque?.has(t.id);
                return (
                  <li key={t.id}
                    className={cn(
                      "inline-flex items-center gap-1 h-6 px-1.5 rounded-md border text-xs",
                      novo ? "usr-entra border-primary/40 bg-brand-soft text-primary font-medium" : "border-border bg-card text-slate-700",
                    )}>
                    <Icone className={cn("w-3 h-3 shrink-0", novo ? "text-primary" : CLASSE_DO_TONE[g.tom])} aria-hidden="true" />
                    {t.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** Os quatro filetes do mapa de acesso (sem texto). */
function Filetes({ role }: { role: string }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
      {acessoPorGrupo(role).map(g => (
        <span key={g.titulo} className="relative block w-[18px] h-1.5 rounded-full bg-muted overflow-hidden">
          {g.abertas.length > 0 && (
            <span className={cn("absolute inset-y-0 left-0 rounded-full", FUNDO_DO_TOM[g.tom])}
              style={{ width: `${Math.max(20, Math.round((g.abertas.length / g.total) * 100))}%` }} />
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * "17 telas" + os filetes; abre a lista das telas do perfil. O perfil decide
 * as telas — não há tela liberada por pessoa no sistema.
 */
export function MapaDeAcesso({ u, nome, extra }: { u: Pick<User, "id" | "role">; nome: string; extra?: ReactNode }) {
  const n = telasDoPerfil(u.role).length;
  const perfil = nomeDoPerfil(u.role);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="usr-mapa pas-alvo relative z-[1] inline-flex items-center gap-2 h-7 -ml-1.5 px-1.5 rounded-md text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
          aria-label={`Ver as ${n} telas que ${nome} abre como ${perfil}`}
          data-testid={`usr-telas-${u.id}`}
        >
          <Filetes role={u.role} />
          <span className={cn("text-xs tabular-nums whitespace-nowrap", n === 0 ? "text-danger font-medium" : "text-slate-600")}>
            {n === 0 ? "Nenhuma tela" : n === TOTAL_DE_TELAS ? "Todas as telas" : `${n} ${n === 1 ? "tela" : "telas"}`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(420px,calc(100vw-24px))] p-0 rounded-xl overflow-hidden">
        <div className="px-4 pt-3 pb-2.5 border-b border-border">
          <p className="m-0 text-sm font-semibold text-foreground">
            {perfil} <span className="font-normal text-muted-foreground">· {n} de {TOTAL_DE_TELAS} telas</span>
          </p>
          {normalizeRole(u.role) && (
            <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">{RESUMO_DO_PERFIL[normalizeRole(u.role)!]}</p>
          )}
        </div>
        <div className="px-4 py-3 max-h-[min(420px,60vh)] overflow-y-auto">
          <TelasDoPerfil role={u.role} compacto />
          {extra && <div className="mt-3 pt-2.5 border-t border-border text-xs text-slate-600">{extra}</div>}
        </div>
        <p className="m-0 px-4 py-2 border-t border-border bg-surface-muted text-2xs leading-4 text-muted-foreground">
          As telas vêm do perfil — todos com o mesmo perfil abrem as mesmas telas.
        </p>
      </PopoverContent>
    </Popover>
  );
}
