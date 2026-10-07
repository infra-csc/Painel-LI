/**
 * Estados fixos da Escalação (25/09 — extraídos de pages/scaling.tsx): vazio
 * com causa e próximo passo, acesso negado e o esqueleto da primeira carga.
 *
 * 07/10: o esqueleto tem a FORMA da tela (barra de filtros, fila e linhas com
 * as colunas), para a lista "assentar" no lugar em vez de surgir do nada; o
 * erro ganhou o "Tentar de novo" — antes a única saída era recarregar a página.
 */
import { Lock, RotateCw } from "lucide-react";

/** Um estado vazio da página, sempre com a causa e o que fazer a seguir. */
export function EstadoVazio({ icone, titulo, texto, acao, tom = "neutro", testId }: {
  icone: React.ReactNode; titulo: string; texto: string; acao?: React.ReactNode;
  /** `erro`: a moldura e o ícone dizem que algo falhou, não que está vazio. */
  tom?: "neutro" | "erro";
  testId?: string;
}) {
  const erro = tom === "erro";
  return (
    <div
      className={`esc-entra rounded-xl border px-6 py-12 text-center sm:px-8 ${erro ? "border-danger/25 bg-card" : "border-dashed border-slate-300 bg-card"}`}
      role={erro ? "alert" : undefined}
      data-testid={testId}
    >
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${erro ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground"}`}
        aria-hidden="true"
      >
        {icone}
      </div>
      <p className="mt-3.5 text-base font-semibold text-foreground">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{acao}</div>}
    </div>
  );
}

/** O botão de ação dos estados vazios — o mesmo desenho em todos. */
export function AcaoDoEstado({ onClick, children, testId, principal = true }: {
  onClick: () => void; children: React.ReactNode; testId?: string; principal?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`esc-alvo inline-flex h-[34px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        principal ? "bg-primary text-primary-foreground shadow-1 hover:bg-primary-hover" : "border border-border bg-card text-slate-700 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function BotaoTentarDeNovo({ onClick, tentando }: { onClick: () => void; tentando: boolean }) {
  return (
    <AcaoDoEstado onClick={onClick} testId="button-tentar-de-novo">
      <RotateCw className={`h-4 w-4 ${tentando ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
      {tentando ? "Tentando…" : "Tentar de novo"}
    </AcaoDoEstado>
  );
}

export function AcessoNegado() {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-card px-8 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Lock className="w-5 h-5" aria-hidden="true" />
      </div>
      <p className="mt-3.5 text-base font-semibold text-foreground">Acesso negado</p>
      <p className="mx-auto mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        Seu papel não tem permissão para abrir a Escalação. Se você precisa desta tela para trabalhar,
        peça acesso ao administrador do painel.
      </p>
    </div>
  );
}

/** Larguras das "colunas" de cada osso — variam de linha a linha, como o texto real. */
const OSSOS = [
  ["62%", "48%", "70%"], ["78%", "40%", "55%"], ["54%", "60%", "64%"], ["70%", "36%", "72%"],
  ["66%", "52%", "58%"], ["58%", "44%", "68%"], ["74%", "50%", "60%"], ["60%", "38%", "66%"],
];

/**
 * Esqueleto só na PRIMEIRA carga. Depois disso a lista anterior fica na tela
 * enquanto a nova chega — trocar um filtro não pode apagar os controles que a
 * pessoa está usando.
 */
export function EsqueletoDaLista() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando escalações" data-testid="esqueleto-escalacao">
      <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
        <div className="esc-osso h-[34px] w-full sm:w-[300px]" />
        {[132, 132, 120, 96].map((w, i) => <div key={i} className="esc-osso hidden h-[34px] sm:block" style={{ width: w }} />)}
      </div>
      <div className="hidden h-[70px] rounded-xl border border-border bg-card sm:grid sm:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 0 ? "border-l border-border" : ""}`}>
            <div className="esc-osso h-3 w-20" />
            <div className="esc-osso h-5 w-10" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden" aria-hidden="true">
        <div className="h-9 bg-surface-muted border-b border-border" />
        {OSSOS.map(([a, b, c], i) => (
          <div key={i} className="flex h-[52px] items-center gap-4 border-b border-border px-4 last:border-b-0">
            <div className="esc-osso h-4 w-4 shrink-0 rounded" />
            <div className="min-w-0 flex-[1.2] space-y-1.5"><div className="esc-osso h-3" style={{ width: a }} /><div className="esc-osso h-2.5" style={{ width: "45%" }} /></div>
            <div className="hidden min-w-0 flex-1 space-y-1.5 sm:block"><div className="esc-osso h-3" style={{ width: b }} /><div className="esc-osso h-2.5 w-1/3" /></div>
            <div className="hidden w-24 md:block"><div className="esc-osso h-3" style={{ width: c }} /></div>
            <div className="esc-osso h-5 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
