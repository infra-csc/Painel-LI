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
  /** O erro capturado, para a tela mostrar o texto técnico (11/09). */
  error: Error | null;
  componentStack: string | null;
}

// Flag anti-loop: se recarregarmos por causa de um chunk quebrado e a página
// voltar a quebrar, não entramos em loop infinito de reload.
const CHUNK_RELOAD_KEY = "chunk-reload-once";

// Quanto tempo depois de montar sem erro consideramos o reload "bem-sucedido"
// e liberamos a flag (23/09). Antes ela ficava para sempre na sessão: um
// SEGUNDO deploy na mesma aba não recarregava sozinho e caía na tela de erro.
const LIMPAR_FLAG_APOS_MS = 5_000;

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

function lerFlag(): boolean {
  try { return sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1"; } catch { return false; }
}
function gravarFlag(): void {
  try { sessionStorage.setItem(CHUNK_RELOAD_KEY, "1"); } catch { /* sem storage: só perde a proteção anti-loop */ }
}
function limparFlag(): void {
  try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* idem */ }
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private limpezaDaFlag: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidMount() {
    // Montou e ficou de pé por alguns segundos: o reload automático deu certo,
    // então a flag pode ser liberada para o próximo deploy.
    if (!lerFlag()) return;
    this.limpezaDaFlag = setTimeout(() => {
      if (!this.state.hasError) limparFlag();
    }, LIMPAR_FLAG_APOS_MS);
  }

  componentWillUnmount() {
    if (this.limpezaDaFlag) clearTimeout(this.limpezaDaFlag);
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Chunk quebrado: normalmente é um deploy novo. Recarrega uma vez de forma
    // automática (o novo index.html aponta para os chunks corretos). A flag em
    // sessionStorage impede o loop caso o reload não resolva.
    if (isChunkLoadError(error)) {
      if (!lerFlag()) {
        gravarFlag();
        window.location.reload();
        return;
      }
    }
    console.error("ErrorBoundary capturou um erro:", error, errorInfo);
    // Guardado para a tela: "Algo deu errado" sem o erro não dá para
    // investigar — o usuário via a página e não tinha o que mandar (11/09).
    this.setState({ error, componentStack: errorInfo.componentStack ?? null });
  }

  /** Texto técnico pronto para copiar e mandar para o suporte. */
  detalheTecnico(): string {
    const { error, componentStack } = this.state;
    const linhas = [
      `Página: ${window.location.pathname}${window.location.search}`,
      `Quando: ${new Date().toISOString()}`,
      `Erro: ${error?.name ?? "Error"}: ${error?.message ?? "(sem mensagem)"}`,
      error?.stack ? `Stack:\n${error.stack.split("\n").slice(0, 8).join("\n")}` : null,
      componentStack ? `Componentes:\n${componentStack.split("\n").filter(Boolean).slice(0, 8).join("\n")}` : null,
    ].filter(Boolean);
    return linhas.join("\n");
  }

  handleCopy = async () => {
    try { await navigator.clipboard.writeText(this.detalheTecnico()); } catch { /* sem clipboard: o texto está na tela */ }
  };

  handleReload = () => {
    // Limpa a flag para permitir um novo reload automático futuro.
    limparFlag();
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
          {/* O erro em si, para o usuário mandar ao suporte (11/09). Fechado
              por padrão em produção (23/09): a stack assustava quem só queria
              recarregar; em desenvolvimento abre direto. */}
          <details open={import.meta.env.DEV} className="w-full max-w-2xl text-left">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Detalhes técnicos (copie e envie ao suporte)</summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 text-2xs leading-snug text-foreground" data-testid="erro-detalhe">
              {this.detalheTecnico()}
            </pre>
            <Button variant="outline" size="sm" className="mt-2" onClick={this.handleCopy}>Copiar detalhes</Button>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
