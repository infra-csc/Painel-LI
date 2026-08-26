import { createContext, useContext, useState, useEffect } from "react";
import type { User } from "@shared/schema";

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

interface AuthContextType {
  user: User | null;
  simulation: SimulationInfo | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [simulation, setSimulation] = useState<SimulationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // 1. Se há token SSO na URL (fallback client-side para casos onde o
      //    middleware do servidor não interceptou, ex: chamadas diretas via JS)
      const params = new URLSearchParams(window.location.search);
      const ssoToken = params.get("portal_sso");

      if (ssoToken) {
        const portalReturn = params.get("portal_return");
        if (portalReturn) localStorage.setItem("portal-return-url", portalReturn);
        window.history.replaceState({}, "", window.location.pathname);

        try {
          const res = await fetch(`/api/auth/sso?token=${encodeURIComponent(ssoToken)}`);
          if (res.ok) {
            const { user: ssoUser } = await res.json();
            setUser(ssoUser);
            localStorage.setItem("auth-user", JSON.stringify(ssoUser));
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
          localStorage.setItem("auth-user", JSON.stringify(sessionUser));
          if (portalReturnUrl) localStorage.setItem("portal-return-url", portalReturnUrl);
          setIsLoading(false);
          return;
        }
      } catch {
        // Sem sessão ativa
      }

      // 3. Nenhuma sessão válida — limpar cache local e ir para login
      localStorage.removeItem("auth-user");
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const { user } = await res.json();
        setUser(user);
        localStorage.setItem("auth-user", JSON.stringify(user));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // O registro público (/api/auth/register) foi removido em 17/08/2026: contas
  // são criadas pelo RH/Compras/admin em "Cadastro de Usuários" ou via SSO.

  const logout = () => {
    const portalReturn = localStorage.getItem("portal-return-url");
    localStorage.removeItem("auth-user");
    localStorage.removeItem("portal-return-url");

    // Encerrar sessão no servidor (fire-and-forget)
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});

    if (portalReturn) {
      window.location.href = portalReturn;
      return;
    }
    setUser(null);
    setSimulation(null);
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
