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
  const { isCollapsed, isCompact, isFocusMode, isDesktop, toggleCollapsed, toggleCompact, enterFocusMode, exitFocusMode } = s;

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

  /** ⌘\ — alterna expandido ↔ compacto (saindo do foco, se estiver nele). */
  const toggleCompacto = useCallback(() => {
    if (hidden) { setExpandido(); return; }
    if (isCompact) setExpandido(); else setCompacto();
  }, [hidden, isCompact, setExpandido, setCompacto]);

  /** ⌘. — entra e sai do modo foco. */
  const toggleFoco = useCallback(() => {
    if (hidden) setExpandido(); else setOculto();
  }, [hidden, setExpandido, setOculto]);

  /** Botão da barra do topo: expandido → compacto → oculto → expandido. */
  const cycle = useCallback(() => {
    if (hidden) setExpandido();
    else if (isCompact) setOculto();
    else setCompacto();
  }, [hidden, isCompact, setExpandido, setCompacto, setOculto]);

  return { ...s, mode, hidden, setExpandido, setCompacto, setOculto, toggleCompacto, toggleFoco, cycle };
}
