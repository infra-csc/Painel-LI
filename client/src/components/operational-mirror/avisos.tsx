/**
 * Avisos do Espelho Operacional (31/08).
 *
 * Por que não o toast do app: ele mostra UM por vez (TOAST_LIMIT = 1) e mora no
 * canto inferior direito — onde o drawer de edição abre. Numa tela em que se
 * grava célula a célula, o segundo aviso apagava o primeiro justamente quando
 * duas gravações seguidas dão errado.
 *
 * Aqui os avisos se empilham à esquerda, e o de ERRO não fecha sozinho: sucesso
 * e informação somem em 6s, erro espera ser lido. O botão "Desfazer" aparece
 * quando a ação tem volta.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TomDoAviso = "ok" | "info" | "erro";

export interface Aviso {
  id: number;
  tom: TomDoAviso;
  titulo: string;
  texto?: string;
  /** Quando a ação tem volta: rótulo e o que fazer. */
  desfazer?: { rotulo?: string; acao: () => void };
}

type Entrada = Omit<Aviso, "id">;

const Contexto = createContext<{ avisar: (a: Entrada) => void } | null>(null);

/** Chama os avisos desta tela. Fora do provedor, não faz nada (não quebra). */
export function useAvisos() {
  const ctx = useContext(Contexto);
  return ctx ?? { avisar: () => {} };
}

const SEGUNDOS_ATE_SUMIR = 6000;

const TOM: Record<TomDoAviso, { Icone: typeof CheckCircle2; caixa: string; icone: string }> = {
  ok: {
    Icone: CheckCircle2,
    caixa: "border-success/25 bg-success-soft",
    icone: "text-success",
  },
  info: {
    Icone: Info,
    caixa: "border-primary/25 bg-brand-soft",
    icone: "text-primary",
  },
  erro: {
    Icone: AlertCircle,
    caixa: "border-danger/25 bg-danger-soft",
    icone: "text-danger",
  },
};

export function ProvedorDeAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(1);

  const fechar = useCallback((id: number) => {
    setAvisos((atuais) => atuais.filter((a) => a.id !== id));
  }, []);

  const avisar = useCallback((entrada: Entrada) => {
    const id = proximoId.current++;
    setAvisos((atuais) => [...atuais, { ...entrada, id }]);
    // Erro fica: quem precisa reagir a ele não pode perdê-lo de vista.
    if (entrada.tom !== "erro") {
      setTimeout(() => setAvisos((atuais) => atuais.filter((a) => a.id !== id)), SEGUNDOS_ATE_SUMIR);
    }
  }, []);

  const valor = useMemo(() => ({ avisar }), [avisar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* À esquerda de propósito: a direita é do drawer de edição. */}
      <div
        className="pointer-events-none fixed bottom-5 left-4 z-[80] flex w-[380px] max-w-[92vw] flex-col gap-2 lg:left-[268px]"
        aria-live="polite"
        role="status"
      >
        {avisos.map((a) => {
          const { Icone, caixa, icone } = TOM[a.tom];
          return (
            <div
              key={a.id}
              className={cn("pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-2", caixa)}
              data-testid={`aviso-${a.tom}`}
            >
              <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", icone)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{a.titulo}</p>
                {a.texto && <p className="mt-0.5 text-xs leading-normal text-muted-foreground">{a.texto}</p>}
              </div>
              {a.desfazer && (
                <button
                  type="button"
                  onClick={() => { a.desfazer!.acao(); fechar(a.id); }}
                  className="h-[26px] shrink-0 rounded-md border bg-background px-2 text-2xs font-medium transition-colors hover:bg-muted"
                >
                  {a.desfazer.rotulo ?? "Desfazer"}
                </button>
              )}
              <button
                type="button"
                onClick={() => fechar(a.id)}
                aria-label="Fechar aviso"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </Contexto.Provider>
  );
}

export default ProvedorDeAvisos;
