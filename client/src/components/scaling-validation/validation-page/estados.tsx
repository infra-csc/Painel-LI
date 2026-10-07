/**
 * Estados fixos da Validação (07/10): vazio, erro e sem acesso — o mesmo
 * desenho dos estados da Escalação (círculo com o ícone, título, a causa e o
 * próximo passo), para as duas telas do módulo falarem a mesma língua quando
 * não há o que mostrar ou algo dá errado.
 */
import type { ReactNode } from "react";
import { Lock, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Um estado da página, sempre com a causa e o que fazer a seguir. */
export function EstadoDaValidacao({ icone, titulo, texto, acao, tom = "neutro", testId, className }: {
  icone: ReactNode;
  titulo: ReactNode;
  texto?: ReactNode;
  acao?: ReactNode;
  /** `erro`: a moldura e o ícone dizem que algo falhou, não que está vazio. */
  tom?: "neutro" | "erro";
  testId?: string;
  className?: string;
}) {
  const erro = tom === "erro";
  return (
    <div
      className={cn(
        "val-entra rounded-xl border bg-card px-6 py-10 text-center sm:px-8",
        erro ? "border-danger/25" : "border-dashed border-slate-300",
        className,
      )}
      role={erro ? "alert" : "status"}
      data-testid={testId}
    >
      <div
        className={cn("mx-auto flex h-11 w-11 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5", erro ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground")}
        aria-hidden="true"
      >
        {icone}
      </div>
      <p className="mt-3.5 text-[15px] font-semibold text-foreground">{titulo}</p>
      {texto && <p className="mx-auto mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">{texto}</p>}
      {acao && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{acao}</div>}
    </div>
  );
}

/** Botão dos estados — o mesmo desenho em todos (principal cheio, secundário em contorno). */
export function AcaoDoEstado({ onClick, children, testId, principal = true }: {
  onClick: () => void; children: ReactNode; testId?: string; principal?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "val-alvo inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        principal ? "bg-primary text-primary-foreground shadow-1 hover:bg-primary-hover" : "border border-border bg-card text-slate-700 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function BotaoTentarDeNovo({ onClick, tentando }: { onClick: () => void; tentando: boolean }) {
  return (
    <AcaoDoEstado onClick={onClick} testId="button-tentar-de-novo">
      <RotateCw className={cn("h-4 w-4", tentando && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      {tentando ? "Tentando…" : "Tentar de novo"}
    </AcaoDoEstado>
  );
}

/** Sem permissão para a tela — mesmo texto de antes, no desenho dos estados. */
export function AcessoNegadoValidacao() {
  return (
    <div className="val-entra mx-auto mt-6 max-w-xl rounded-xl border border-border bg-card px-8 py-12 text-center" data-testid="validacao-sem-acesso">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3.5 text-[15px] font-semibold text-foreground">Acesso negado</h3>
      <p className="mx-auto mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
        Você não tem permissão para acessar a Validação de Escala. Se você valida vagas da sua área, peça acesso ao administrador do painel.
      </p>
    </div>
  );
}
