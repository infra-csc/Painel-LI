import { createContext, useContext, useState, useEffect } from "react";
import type { User } from "@shared/schema";

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: string;
  area?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // 1. Verificar SSO token na URL (?portal_sso=<JWT>)
      const params = new URLSearchParams(window.location.search);
      const ssoToken = params.get("portal_sso");

      if (ssoToken) {
        // Capturar portal_return antes de limpar a URL
        const portalReturn = params.get("portal_return");
        if (portalReturn) {
          localStorage.setItem("portal-return-url", portalReturn);
        }

        // Limpar os parâmetros da URL imediatamente (sem reload)
        window.history.replaceState({}, "", window.location.pathname);

        try {
          const response = await fetch(`/api/auth/sso?token=${encodeURIComponent(ssoToken)}`);
          if (response.ok) {
            const { user } = await response.json();
            setUser(user);
            localStorage.setItem("auth-user", JSON.stringify(user));
            setIsLoading(false);
            return; // Sessão SSO criada — pronto
          } else {
            console.warn("[SSO] Token inválido, redirecionando para login");
          }
        } catch (err) {
          console.error("[SSO] Erro ao validar token:", err);
        }
        // SSO falhou — cai no fluxo normal abaixo
      }

      // 2. Verificar sessão salva no localStorage
      const savedUser = localStorage.getItem("auth-user");
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
        } catch {
          localStorage.removeItem("auth-user");
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const { user } = await response.json();
        setUser(user);
        localStorage.setItem("auth-user", JSON.stringify(user));
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  const register = async (userData: RegisterData): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, message: error.message || "Erro ao criar conta" };
      }
    } catch (error) {
      return { success: false, message: "Erro interno do servidor" };
    }
  };

  const logout = () => {
    const portalReturn = localStorage.getItem("portal-return-url");

    localStorage.removeItem("auth-user");
    localStorage.removeItem("portal-return-url");

    if (portalReturn) {
      // Redirecionar imediatamente — sem mostrar tela de login
      window.location.href = portalReturn;
      return;
    }

    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      register, 
      logout,
      setUser, 
      isLoading, 
      isAuthenticated: !!user 
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
