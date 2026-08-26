/**
 * MODOS DO MENU — traduz o estado do SidebarContext (isCollapsed / isCompact /
 * isFocusMode) para os três modos do desenho aprovado e devolve ações diretas
 * ("vá para compacto") no lugar dos toggles.
 *
 * Continuamos usando o contexto existente (o `sidebarWidth` dele é lido por
 * telas que fixam barras no rodapé) — aqui não há estado novo.
 */
import { useCallback } from "react";
import { useSidebar } from "@/contexts/sidebar-context";

export type ShellMode = "expandido" | "compacto" | "oculto";

export function useShellMode() {
  const s = useSidebar();
  const { isCollapsed, isCompact, isFocusMode, isDesktop, isMobileOpen, setMobileOpen, toggleCollapsed, toggleCompact, enterFocusMode, exitFocusMode } = s;

  const hidden = isCollapsed || isFocusMode;
  // Compacto só vale em desktop: abaixo de `lg` o menu é gaveta e abre com rótulos.
  const mode: ShellMode = hidden ? "oculto" : isCompact && isDesktop ? "compacto" : "expandido";

  const setExpandido = useCallback(() => {
    if (isFocusMode) exitFocusMode();
    if (isCollapsed) toggleCollapsed();
    if (isCompact) toggleCompact();
  }, [isFocusMode, isCollapsed, isCompact, exitFocusMode, toggleCollapsed, toggleCompact]);

  const setCompacto = useCallback(() => {
    if (isFocusMode) exitFocusMode();
    if (isCollapsed) toggleCollapsed();
    if (!isCompact) toggleCompact();
  }, [isFocusMode, isCollapsed, isCompact, exitFocusMode, toggleCollapsed, toggleCompact]);

  /** Modo foco: o menu some e fica só a aba azul na borda. */
  const setOculto = useCallback(() => {
    if (!isFocusMode) enterFocusMode();
  }, [isFocusMode, enterFocusMode]);

  /**
   * ALTERNADOR DE DUAS POSIÇÕES — botão da barra do topo e ⌘\.
   *
   *   expandido           → compacto
   *   compacto | oculto   → expandido
   *
   * Nunca leva para "oculto": esconder o menu é uma escolha deliberada (botão
   * "Foco", ⌘.), não a consequência de um clique a mais. Com um ciclo de três
   * posições, quem estava no compacto precisava de dois cliques para reabrir.
   */
  const toggleMenu = useCallback(() => {
    // Abaixo de `lg` não existe "compacto": o menu é gaveta. Sem esta guarda, o
    // ⌘\ numa janela estreita gravava `sidebar-compact = true` calado (nada
    // acontecia na tela) e o menu reabria compacto quando a janela crescesse.
    if (!isDesktop) { setMobileOpen(!isMobileOpen); return; }
    if (mode === "expandido") setCompacto(); else setExpandido();
  }, [isDesktop, isMobileOpen, setMobileOpen, mode, setExpandido, setCompacto]);

  /** ⌘. — entra e sai do modo foco; sair sempre devolve o menu EXPANDIDO. */
  const toggleFoco = useCallback(() => {
    if (hidden) setExpandido(); else setOculto();
  }, [hidden, setExpandido, setOculto]);

  return { ...s, mode, hidden, setExpandido, setCompacto, setOculto, toggleMenu, toggleFoco };
}
