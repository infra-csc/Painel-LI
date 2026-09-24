import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@shared/schema";
import { NETWORK_ERROR_MESSAGE, TROCAR_SENHA_EVENT, queryClient } from "@/lib/queryClient";

/**
 * Modo Simulação ("Ver como usuário"): quando o admin está simulando outro
 * usuário, o /api/auth/me devolve o usuário SIMULADO em `user` e estes
 * metadados para o banner global. Fora da simulação é null.
 */
export interface SimulationInfo {
  active: boolean;
  realUserName: string;
  simulatedSince: string | null;
}

/**
 * Resultado do login (23/09). Antes `login()` devolvia `false` para tudo e a
 * tela mostrava "Credenciais inválidas" até para 429 (limite de tentativas)
 * e 500 — a pessoa trocava a senha certa achando que tinha errado.
 */
export type LoginResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

interface AuthContextType {
  user: User | null;
  simulation: SimulationInfo | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * Troca de senha obrigatória (23/09): true quando o servidor marcou o
   * usuário com `mustChangePassword` — vem no /me e no login, ou de um 403
   * `{ mustChangePassword: true }` em qualquer rota (evento do queryClient).
   * Enquanto true, `TrocarSenhaObrigatoria` cobre o app com um diálogo que
   * não fecha; `senhaTrocada()` libera depois do PATCH bem-sucedido.
   */
  precisaTrocarSenha: boolean;
  senhaTrocada: (usuarioAtualizado?: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PORTAL_RETURN_KEY = "portal-return-url";
const AUTH_USER_KEY = "auth-user";

/**
 * Domínios aceitos para o `portal_return` (VITE_PORTAL_ORIGIN, separados por
 * vírgula; aceita origem completa ou só o host). Vazio = qualquer host, mas
 * sempre só `https:`.
 */
function dominiosPermitidosDoPortal(): string[] {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  const raw = typeof env.VITE_PORTAL_ORIGIN === "string" ? env.VITE_PORTAL_ORIGIN : "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try { return new URL(s.includes("://") ? s : `https://${s}`).hostname.toLowerCase(); } catch { return ""; }
    })
    .filter(Boolean);
}

/**
 * Valida a URL de retorno ao portal ANTES de gravar ou redirecionar (23/09).
 * O valor vem da query string / do servidor e ia direto para
 * `window.location.href`: `javascript:` ou um site qualquer no parâmetro
 * viravam redirecionamento no logout. Só `https:`, sem credenciais na URL e,
 * havendo VITE_PORTAL_ORIGIN, só hosts desse domínio (ou subdomínios).
 */
export function portalReturnSeguro(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const permitidos = dominiosPermitidosDoPortal();
  if (permitidos.length === 0) return url.href;
  const host = url.hostname.toLowerCase();
  return permitidos.some((d) => host === d || host.endsWith(`.${d}`)) ? url.href : null;
}

function guardarPortalReturn(raw: string | null | undefined): void {
  const seguro = portalReturnSeguro(raw);
  if (seguro) localStorage.setItem(PORTAL_RETURN_KEY, seguro);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [simulation, setSimulation] = useState<SimulationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [precisaTrocarSenha, setPrecisaTrocarSenha] = useState(false);

  // Qualquer resposta 403 com `mustChangePassword: true` (queryClient.ts)
  // liga o estado — uma vez, para todas as telas.
  useEffect(() => {
    const ligar = () => setPrecisaTrocarSenha(true);
    window.addEventListener(TROCAR_SENHA_EVENT, ligar);
    return () => window.removeEventListener(TROCAR_SENHA_EVENT, ligar);
  }, []);

  const senhaTrocada = useCallback((usuarioAtualizado?: User) => {
    setPrecisaTrocarSenha(false);
    if (usuarioAtualizado) {
      setUser(usuarioAtualizado);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(usuarioAtualizado));
    } else {
      setUser((atual) => (atual ? { ...atual, mustChangePassword: false } : atual));
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      // 1. Se há token SSO na URL (fallback client-side para casos onde o
      //    middleware do servidor não interceptou, ex: chamadas diretas via JS)
      const params = new URLSearchParams(window.location.search);
      const ssoToken = params.get("portal_sso");

      if (ssoToken) {
        guardarPortalReturn(params.get("portal_return"));
        window.history.replaceState({}, "", window.location.pathname);

        try {
          const res = await fetch(`/api/auth/sso?token=${encodeURIComponent(ssoToken)}`);
          if (res.ok) {
            const { user: ssoUser } = await res.json();
            // Troca de usuário pelo portal: nada do cache do usuário anterior
            // pode sobrar (máquina compartilhada).
            queryClient.clear();
            setUser(ssoUser);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(ssoUser));
            setIsLoading(false);
            return;
          }
        } catch {
          // SSO falhou — continua para verificar sessão ativa
        }
      }

      // 2. Verificar sessão ativa no servidor
      //    O middleware SSO server-side já cria a sessão e redireciona para /
      //    sem o token na URL — então aqui simplesmente verificamos se há sessão
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const { user: sessionUser, portalReturnUrl, simulation: sim } = await res.json();
          setUser(sessionUser);
          setSimulation(sim?.active ? sim : null);
          // Já entra com o diálogo aberto, sem esperar a primeira tela levar 403.
          if (sessionUser?.mustChangePassword === true) setPrecisaTrocarSenha(true);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(sessionUser));
          guardarPortalReturn(portalReturnUrl);
          setIsLoading(false);
          return;
        }
      } catch {
        // Sem sessão ativa
      }

      // 3. Nenhuma sessão válida — limpar cache local e ir para login
      localStorage.removeItem(AUTH_USER_KEY);
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // O login devolve `{ mustChangePassword: true, user }` quando a senha
        // é provisória: a sessão existe, mas a API inteira responderá 403 até
        // a troca — já abrimos o diálogo aqui.
        const { user, mustChangePassword } = await res.json();
        // Outro usuário entrando na mesma aba: zera o cache do anterior.
        queryClient.clear();
        setUser(user);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        setPrecisaTrocarSenha(mustChangePassword === true || user?.mustChangePassword === true);
        return { ok: true };
      }
      let doServidor: string | null = null;
      try {
        const body = await res.json();
        if (body && typeof body.message === "string" && body.message.trim()) doServidor = body.message.trim();
      } catch {
        // corpo não é JSON (proxy, HTML) — usa o texto por status
      }
      const status = res.status;
      const padrao =
        status === 400 || status === 401 ? "Credenciais inválidas. Verifique e-mail e senha."
        : status === 403 ? "Acesso não liberado. Fale com o administrador."
        : status === 429 ? "Muitas tentativas. Aguarde um minuto e tente de novo."
        : "Erro no servidor. Tente de novo em instantes.";
      return { ok: false, status, message: doServidor ?? padrao };
    } catch {
      return { ok: false, status: 0, message: NETWORK_ERROR_MESSAGE };
    }
  };

  // O registro público (/api/auth/register) foi removido em 17/08/2026: contas
  // são criadas pelo RH/Compras/admin em "Cadastro de Usuários" ou via SSO.

  const logout = () => {
    const portalReturn = portalReturnSeguro(localStorage.getItem(PORTAL_RETURN_KEY));
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(PORTAL_RETURN_KEY);

    // Encerrar sessão no servidor (fire-and-forget)
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});

    // Cache do React Query fora: vagas, colaboradores (CPF, telefone) e o
    // resto ficavam em memória para quem entrasse em seguida na mesma aba.
    queryClient.clear();

    if (portalReturn) {
      window.location.href = portalReturn;
      return;
    }
    setUser(null);
    setSimulation(null);
    setPrecisaTrocarSenha(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      simulation,
      login,
      logout,
      setUser,
      isLoading,
      isAuthenticated: !!user,
      precisaTrocarSenha,
      senhaTrocada,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
