/**
 * MOLDURA DAS TELAS PÚBLICAS (entrar, redefinir senha) — 07/10.
 *
 * Desktop (lg+): painel de marca à esquerda (azul da marca com uma grade
 * técnica leve — a matéria do produto é planilha de escala, não gradiente
 * genérico) e o formulário solto à direita, sem cartão dentro de cartão.
 * Abaixo de lg: só a coluna do formulário, num cartão sobre o fundo.
 *
 * Só apresentação: quem decide login por senha × Portal Norte continua sendo
 * cada página (`import.meta.env.DEV`).
 */
import type { ReactNode } from "react";
import { ClipboardList, Plane, Luggage, Wallet } from "lucide-react";

const MODULOS = [
  { icon: ClipboardList, texto: "Escala, validação e aprovação da equipe" },
  { icon: Plane, texto: "Passagens e hospedagem de cada evento" },
  { icon: Luggage, texto: "Bagagem e espelho operacional" },
  { icon: Wallet, texto: "Planejado, realizado e notas fiscais" },
];

/** Marca: selo Trupp (`/selo-app.svg`, 30/10) — quadrado branco arredondado com o
 *  símbolo da Trupp; já traz fundo e borda, então vai sem moldura. */
export function MarcaDoApp({ tamanho = 40 }: { tamanho?: number }) {
  return (
    <img src="/selo-app.svg" alt="" className="block shrink-0" style={{ width: tamanho, height: tamanho }} />
  );
}

export function AuthLayout({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="min-h-dvh flex bg-background">
      {/* ── Painel de marca (só desktop) ── */}
      <div className="casca-grade relative hidden lg:flex lg:w-[44%] 2xl:w-[40%] flex-col justify-between p-12 xl:p-16 text-white">
        <div className="flex items-center gap-3">
          <MarcaDoApp tamanho={40} />
          <div className="leading-tight">
            <p className="m-0 text-lg font-bold tracking-tight">Trupp</p>
            <p className="m-0 text-xs text-white/70">Operação de Eventos</p>
          </div>
        </div>

        <div className="max-w-[440px] xl:max-w-[520px]">
          <p className="m-0 text-[28px] xl:text-[34px] 2xl:text-[38px] font-semibold leading-[1.15] tracking-tight">
            A logística de cada evento, da escala da equipe à prestação de contas.
          </p>
          <ul className="m-0 mt-8 p-0 list-none space-y-3.5">
            {MODULOS.map(({ icon: Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <p className="m-0 text-xs text-white/60">Acesso restrito a colaboradores autorizados.</p>
      </div>

      {/* ── Coluna do formulário ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="casca-surgir w-full max-w-[400px] rounded-2xl border border-border bg-card p-6 shadow-1 sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {children}
        </div>
        {rodape && <div className="w-full max-w-[400px] mt-6 text-center text-xs leading-relaxed text-muted-foreground">{rodape}</div>}
      </main>
    </div>
  );
}

/**
 * Cabeçalho do formulário: `acima` (ex.: "Voltar ao login") → marca (só fora do
 * desktop, onde o painel já a mostra) → `selo` (ex.: ambiente de desenvolvimento) → título.
 */
export function AuthHeader({ titulo, descricao, acima, selo }: { titulo: ReactNode; descricao?: ReactNode; acima?: ReactNode; selo?: ReactNode }) {
  return (
    <div className="mb-7">
      {acima}
      <div className="flex items-center gap-2.5 mb-6 lg:hidden">
        <MarcaDoApp tamanho={36} />
        <p className="m-0 text-base font-bold tracking-tight text-primary">Trupp</p>
      </div>
      {selo}
      <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">{titulo}</h1>
      {descricao && <p className="m-0 mt-1.5 text-sm text-muted-foreground leading-relaxed">{descricao}</p>}
    </div>
  );
}
