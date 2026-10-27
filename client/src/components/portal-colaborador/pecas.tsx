/**
 * Peças visuais do portal do colaborador: a casca (barra do topo + coluna
 * estreita), avisos, a pílula do estado e o campo de senha com mostrar/ocultar.
 *
 * Quem usa: freela ou produtor da casa, no CELULAR, na arena, com sol, luva e
 * sinal ruim. Por isso: letra 16 px nos campos, alvos de 44 px ou mais, uma
 * ação principal por tela, textos curtos.
 */
import { forwardRef, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, LogOut, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { TomDoEstado } from "./formatos";

export function MarcaDoPortal({ tamanho = 32 }: { tamanho?: number }) {
  return <img src="/selo-app.svg" alt="" className="block shrink-0" style={{ width: tamanho, height: tamanho }} />;
}

/** Internet do aparelho (eventos online/offline do navegador). */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

/**
 * Casca das telas logadas: barra do topo (marca, nome, Sair) e a coluna
 * central de no máximo 520 px — no tablet e no computador fica centralizada.
 */
export function CascaDoPortal({ nome, aoSair, saindo, children }: { nome?: string; aoSair?: () => void; saindo?: boolean; children: ReactNode }) {
  const online = useOnline();
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto flex h-14 max-w-[520px] items-center gap-3 px-4">
          <MarcaDoPortal tamanho={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="m-0 text-sm font-semibold tracking-tight text-foreground">Portal do colaborador</p>
            {nome && <p className="m-0 truncate text-xs text-muted-foreground">{nome}</p>}
          </div>
          {aoSair && (
            <button
              type="button"
              onClick={aoSair}
              disabled={saindo}
              className="-mr-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {saindo ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
              Sair
            </button>
          )}
        </div>
        {!online && (
          <div role="status" className="border-t border-warning/20 bg-warning-soft">
            <p className="mx-auto m-0 flex max-w-[520px] items-center gap-2 px-4 py-2 text-[13px] font-medium text-warning">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              Sem internet. Quando o sinal voltar, é só tentar de novo.
            </p>
          </div>
        )}
      </header>
      <main id="conteudo" className="casca-surgir mx-auto max-w-[520px] px-4 pb-16 pt-5">
        {children}
      </main>
    </div>
  );
}

const TOM_DO_AVISO = {
  erro: { caixa: "bg-danger-soft border-danger/20", texto: "text-danger", icone: AlertTriangle },
  atencao: { caixa: "bg-warning-soft border-warning/25", texto: "text-warning", icone: AlertTriangle },
  info: { caixa: "bg-info-soft border-info/15", texto: "text-info", icone: Info },
  ok: { caixa: "bg-success-soft border-success/20", texto: "text-success", icone: CheckCircle2 },
} as const;

export function Aviso({ tom = "info", titulo, children, icone, role, className, acao, id }: {
  tom?: keyof typeof TOM_DO_AVISO; titulo?: ReactNode; children?: ReactNode; icone?: LucideIcon;
  role?: "alert" | "status"; className?: string; acao?: ReactNode; id?: string;
}) {
  const t = TOM_DO_AVISO[tom];
  const Icone = icone ?? t.icone;
  return (
    <div id={id} role={role} className={cn("flex gap-3 rounded-xl border px-3.5 py-3", t.caixa, className)}>
      <Icone className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", t.texto)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {titulo && <p className={cn("m-0 text-sm font-semibold leading-snug", t.texto)}>{titulo}</p>}
        {children && <div className={cn("text-sm leading-snug text-foreground/85", titulo && "mt-0.5")}>{children}</div>}
        {acao && <div className="mt-2.5">{acao}</div>}
      </div>
    </div>
  );
}

const TOM_DA_PILULA: Record<TomDoEstado, string> = {
  neutro: "bg-neutral-soft text-neutral",
  acao: "bg-brand-soft text-primary",
  andamento: "bg-info-soft text-info",
  ok: "bg-success-soft text-success",
  atencao: "bg-warning-soft text-warning",
  falta: "bg-danger-soft text-danger",
};
const PONTO_DA_PILULA: Record<TomDoEstado, string> = {
  neutro: "bg-neutral/60",
  acao: "bg-primary",
  andamento: "bg-info-strong",
  ok: "bg-success-strong",
  atencao: "bg-warning-strong",
  falta: "bg-danger-strong",
};

export function Pilula({ tom, children, className }: { tom: TomDoEstado; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none", TOM_DA_PILULA[tom], className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PONTO_DA_PILULA[tom], (tom === "acao" || tom === "andamento") && "casca-pulso")} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Campo do portal: 48 px de altura e letra de 16 px (o iPhone não dá zoom). */
export const CampoDoPortal = forwardRef<HTMLInputElement, ComponentProps<typeof Input> & { invalido?: boolean }>(
  ({ className, invalido, ...props }, ref) => (
    <Input
      ref={ref}
      aria-invalid={invalido || undefined}
      className={cn("h-12 rounded-lg bg-card px-3.5 text-base md:text-base", invalido && "border-danger focus-visible:ring-danger", className)}
      {...props}
    />
  ),
);
CampoDoPortal.displayName = "CampoDoPortal";

export const CampoDeSenha = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, "type"> & { invalido?: boolean }>(
  ({ className, invalido, ...props }, ref) => {
    const [visivel, setVisivel] = useState(false);
    return (
      <div className="relative">
        <CampoDoPortal ref={ref} type={visivel ? "text" : "password"} invalido={invalido} className={cn("pr-14", className)} {...props} />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          className="absolute right-0.5 top-1/2 flex h-11 w-12 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visivel ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    );
  },
);
CampoDeSenha.displayName = "CampoDeSenha";

/** Botão principal do portal: 56 px, largura toda. */
export function BotaoPrincipal({ carregando, textoCarregando, children, className, icone: Icone, ...props }: ComponentProps<"button"> & {
  carregando?: boolean; textoCarregando?: string; icone?: LucideIcon;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(
        "inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow-1 transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none",
        className,
      )}
    >
      {carregando ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : Icone && <Icone className="h-5 w-5" aria-hidden="true" />}
      {carregando && textoCarregando ? textoCarregando : children}
    </button>
  );
}

/** Botão secundário (contorno), 48 px. */
export function BotaoSecundario({ className, icone: Icone, children, ...props }: ComponentProps<"button"> & { icone?: LucideIcon }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55",
        className,
      )}
    >
      {Icone && <Icone className="h-[18px] w-[18px]" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Link com cara de texto, mas com alvo de 44 px. */
export function BotaoTexto({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[15px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TituloDaSecao({ children, id, acao }: { children: ReactNode; id?: string; acao?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <h2 id={id} className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{children}</h2>
      {acao}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
      {texto}
    </div>
  );
}
