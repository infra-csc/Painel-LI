/**
 * `renderComTudo` — render da Testing Library com os providers que o kit do
 * Painel-LI espera: React Query (client novo por teste, sem retry), Tooltip,
 * Router do wouter em memória, Toaster e o `useAuth` mockado (setup.ts).
 *
 *   const { user, navegar, historico } = renderComTudo(<Tela />, { user: usuarioFake(), rota: "/users?q=ana" });
 *   await user.click(screen.getByRole("button", { name: "Salvar" }));
 *   await esperarToast("Salvo");
 *
 * `criarWrapper` serve ao `renderHook` (mesmos providers, sem UI).
 */
import type { ReactElement, ReactNode } from "react";
import { render, screen, type RenderOptions, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, type BaseLocationHook, type BaseSearchHook } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { onTestFinished } from "vitest";
import type { User } from "@shared/schema";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { definirAuthMock, type AuthMockado } from "./auth-mock";

export interface OpcoesDoRender {
  /** Usuário logado (`useAuth().user`). Sem ele, deslogado. */
  user?: User | null;
  /** Ajustes no `useAuth` mockado (ex.: `{ precisaTrocarSenha: true }`). */
  auth?: Partial<AuthMockado>;
  /** Caminho inicial do Router em memória (pode ter `?query`). */
  rota?: string;
  /** Um `QueryClient` próprio (para pré-carregar cache). Padrão: novo, sem retry. */
  queryClient?: QueryClient;
  /** Opções do `userEvent.setup()` (ex.: `{ applyAccept: false }` para testar recusa de arquivo). */
  userEvent?: Parameters<typeof userEvent.setup>[0];
}

export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface WrapperCriado {
  Wrapper: (props: { children: ReactNode }) => ReactElement;
  queryClient: QueryClient;
  /** Navega por código (mesmo `navigate` do Router em memória). */
  navegar: (to: string, opcoes?: { replace?: boolean }) => void;
  /** Caminhos visitados, do inicial ao atual. */
  historico: string[];
  auth: AuthMockado;
}

/** Providers para `renderHook` ou para montar o próprio `render`. */
export function criarWrapper(opcoes: OpcoesDoRender = {}): WrapperCriado {
  const queryClient = opcoes.queryClient ?? criarQueryClient();
  const memoria = memoryLocation({ path: opcoes.rota ?? "/", record: true });
  const auth = definirAuthMock(opcoes.user ?? null, opcoes.auth);
  onTestFinished(() => queryClient.clear());

  // O `memoryLocation` guarda o caminho COM a query ("/users?q=ana") e o
  // `useSearch` padrão do wouter lê `window.location`. Para o Router se
  // comportar como no navegador — `useLocation` sem query e `useSearch` com
  // ela — separamos os dois aqui.
  const hook: BaseLocationHook = (...args) => {
    const [caminho, navigate] = memoria.hook(...args);
    return [caminho.split("?")[0], navigate];
  };
  const searchHook: BaseSearchHook = () => {
    const [caminho] = memoria.hook();
    const i = caminho.indexOf("?");
    return i >= 0 ? caminho.slice(i + 1) : "";
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <Router hook={hook} searchHook={searchHook}>
          {children}
          <Toaster />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
  const { navigate, history } = memoria;

  return { Wrapper, queryClient, navegar: navigate, historico: history, auth };
}

export type ResultadoDoRender = RenderResult & Omit<WrapperCriado, "Wrapper"> & {
  /** `userEvent.setup()` já pronto. */
  user: ReturnType<typeof userEvent.setup>;
};

export function renderComTudo(
  ui: ReactElement,
  opcoes: OpcoesDoRender & Omit<RenderOptions, "wrapper"> = {},
): ResultadoDoRender {
  const { user: usuario, auth, rota, queryClient: qc, userEvent: opcoesDoUserEvent, ...renderOptions } = opcoes;
  const { Wrapper, ...resto } = criarWrapper({ user: usuario, auth, rota, queryClient: qc });
  const user = userEvent.setup(opcoesDoUserEvent);
  const resultado = render(ui, { wrapper: Wrapper, ...renderOptions });
  return { ...resultado, ...resto, user };
}

/**
 * Espera um toast cujo título ou descrição contenha `texto` (substring, sem
 * diferenciar maiúsculas). Devolve o elemento do texto encontrado.
 */
export async function esperarToast(texto: string | RegExp): Promise<HTMLElement> {
  const matcher = typeof texto === "string" ? texto : texto;
  const opcoes = typeof texto === "string" ? { exact: false } : undefined;
  const encontrados = await screen.findAllByText(matcher, opcoes, { timeout: 2000 });
  const dentroDoToast = encontrados.find((el) => el.closest("[role='status'], [role='alert'], li[data-state]"));
  if (!dentroDoToast) throw new Error(`Texto "${String(texto)}" apareceu, mas fora de um toast.`);
  return dentroDoToast;
}
