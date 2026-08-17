import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

/** Largura do menu lateral expandido (px). Fonte única — usada no aside, no
 *  deslocamento do <main> e em barras fixas que precisam "desviar" do menu. */
export const SIDEBAR_W = 248;
/** Largura do menu lateral no modo compacto (só ícones). */
export const SIDEBAR_COMPACT_W = 56;
/** Altura da barra superior exibida apenas em telas < lg. */
export const TOPBAR_H = 48;

// Breakpoint "lg" do Tailwind. Abaixo dele o menu vira gaveta (drawer) e não
// ocupa espaço no layout.
const LG_QUERY = "(min-width: 1024px)";

interface SidebarContextType {
  isCollapsed: boolean;
  isCompact: boolean;
  isFocusMode: boolean;
  /** Gaveta aberta (só relevante em telas < lg). */
  isMobileOpen: boolean;
  /** true em telas >= lg (o menu ocupa espaço no layout). */
  isDesktop: boolean;
  /** Largura EFETIVA que o menu ocupa no layout agora: 0 (oculto, foco ou
   *  mobile), SIDEBAR_COMPACT_W ou SIDEBAR_W. Use em `marginLeft`/`left`. */
  sidebarWidth: number;
  toggleCollapsed: () => void;
  toggleCompact: () => void;
  enterFocusMode: () => void;
  exitFocusMode: () => void;
  setMobileOpen: (open: boolean) => void;
  toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : true
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem("sidebar-compact");
    return saved === "true";
  });

  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery(LG_QUERY);

  useEffect(() => {
    localStorage.setItem("sidebar-compact", String(isCompact));
  }, [isCompact]);

  // Ao crescer para desktop, a gaveta mobile não faz mais sentido aberta.
  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  const toggleCollapsed = useCallback(() => setIsCollapsed(v => !v), []);
  const toggleCompact = useCallback(() => setIsCompact(v => !v), []);
  const enterFocusMode = useCallback(() => setIsFocusMode(true), []);
  const exitFocusMode = useCallback(() => setIsFocusMode(false), []);
  const toggleMobile = useCallback(() => setMobileOpen(v => !v), []);

  const sidebarWidth = !isDesktop || isCollapsed || isFocusMode
    ? 0
    : isCompact
      ? SIDEBAR_COMPACT_W
      : SIDEBAR_W;

  return (
    <SidebarContext.Provider value={{
      isCollapsed, isCompact, isFocusMode, isMobileOpen, isDesktop, sidebarWidth,
      toggleCollapsed, toggleCompact, enterFocusMode, exitFocusMode, setMobileOpen, toggleMobile,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
