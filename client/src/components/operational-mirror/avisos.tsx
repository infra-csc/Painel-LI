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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

/**
 * 07/10: cartão branco com o filete e o ícone na cor do tom — o fundo todo
 * tingido competia com a grade (que também usa verde/âmbar/vermelho por
 * célula) e o aviso se confundia com uma célula salva.
 */
const TOM: Record<TomDoAviso, { Icone: typeof CheckCircle2; caixa: string; icone: string }> = {
  ok: {
    Icone: CheckCircle2,
    caixa: "border-l-success-strong",
    icone: "text-success",
  },
  info: {
    Icone: Info,
    caixa: "border-l-primary",
    icone: "text-primary",
  },
  erro: {
    Icone: AlertCircle,
    caixa: "border-l-danger-strong",
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

  // A pilha começa onde começa o conteúdo — não por cima do menu lateral, que
  // muda de largura (compacto, foco, celular).
  const [esquerda, setEsquerda] = useState<number | null>(null);
  useEffect(() => {
    if (avisos.length === 0) return;
    const medir = () => {
      const el = document.getElementById("conteudo");
      setEsquerda(el ? Math.round(el.getBoundingClientRect().left) + 16 : null);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [avisos.length]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* À esquerda de propósito: a direita é do drawer de edição. */}
      <div
        className="pointer-events-none fixed bottom-5 left-4 z-[80] flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-2"
        style={esquerda !== null ? { left: esquerda } : undefined}
        aria-live="polite"
        role="status"
      >
        {avisos.map((a) => {
          const { Icone, caixa, icone } = TOM[a.tom];
          return (
            <div
              key={a.id}
              className={cn("pas-sobe pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border border-l-[3px] bg-card px-3 py-2.5 shadow-3", caixa)}
              data-testid={`aviso-${a.tom}`}
            >
              <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", icone)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-foreground">{a.titulo}</p>
                {a.texto && <p className="mt-0.5 text-xs leading-normal text-muted-foreground">{a.texto}</p>}
              </div>
              {a.desfazer && (
                <button
                  type="button"
                  onClick={() => { a.desfazer!.acao(); fechar(a.id); }}
                  className="h-[26px] shrink-0 rounded-md border border-border bg-card px-2 text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {a.desfazer.rotulo ?? "Desfazer"}
                </button>
              )}
              <button
                type="button"
                onClick={() => fechar(a.id)}
                aria-label="Fechar aviso"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
