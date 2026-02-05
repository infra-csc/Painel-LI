import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  isCompact: boolean;
  isFocusMode: boolean;
  toggleCollapsed: () => void;
  toggleCompact: () => void;
  enterFocusMode: () => void;
  exitFocusMode: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });

  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem("sidebar-compact");
    return saved === "true";
  });

  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem("sidebar-compact", String(isCompact));
  }, [isCompact]);

  const toggleCollapsed = () => setIsCollapsed(!isCollapsed);
  const toggleCompact = () => setIsCompact(!isCompact);
  const enterFocusMode = () => setIsFocusMode(true);
  const exitFocusMode = () => setIsFocusMode(false);

  return (
    <SidebarContext.Provider value={{ isCollapsed, isCompact, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode, exitFocusMode }}>
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
