import * as React from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * `page`: ocupa a tela inteira (limite externo, rotas públicas).
   * `content`: cabe na área de conteúdo do MainLayout (limite interno, keyed
   *  por rota em App.tsx — a sidebar continua visível e navegável).
   */
  variant?: "page" | "content";
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Flag anti-loop: se recarregarmos por causa de um chunk quebrado e a página
// voltar a quebrar, não entramos em loop infinito de reload.
const CHUNK_RELOAD_KEY = "chunk-reload-once";

// Erros típicos de import dinâmico (lazy) quando o chunk sai do ar após um
// novo deploy: o hash do arquivo muda e o navegador ainda pede o antigo.
function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("dynamically imported module") ||
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported")
  );
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Chunk quebrado: normalmente é um deploy novo. Recarrega uma vez de forma
    // automática (o novo index.html aponta para os chunks corretos). A flag em
    // sessionStorage impede o loop caso o reload não resolva.
    if (isChunkLoadError(error)) {
      const alreadyReloaded =
        sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
      if (!alreadyReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        return;
      }
    }
    console.error("ErrorBoundary capturou um erro:", error, errorInfo);
  }

  handleReload = () => {
    // Limpa a flag para permitir um novo reload automático futuro.
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isContent = this.props.variant === "content";
      return (
        <div
          role="alert"
          className={
            isContent
              ? "min-h-[50vh] w-full flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card text-foreground px-4 py-10 text-center"
              : "min-h-dvh w-full flex flex-col items-center justify-center gap-4 bg-background text-foreground px-4 text-center"
          }
        >
          <h1 className="text-2xl font-semibold">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            Não foi possível carregar esta página. Isso pode acontecer após uma
            atualização do sistema. Tente recarregar
            {isContent ? " ou abra outra página pelo menu" : ""}.
          </p>
          <Button onClick={this.handleReload}>Recarregar</Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
