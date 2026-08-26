/**
 * CASCA DO APP — banner de simulação (quando ativo) + menu lateral + barra do
 * topo + conteúdo da página.
 *
 * Ordem vertical: banner fixo (40px) → topo sticky → faixa de aviso → página.
 * O `<main>` continua deslocado por `sidebarWidth` (telas com barra fixa no
 * rodapé leem essa mesma medida do contexto).
 */
import { useCallback, useEffect, useState } from "react";
import Sidebar from "./sidebar";
import Topbar from "./topbar";
import SimulationBanner, { SIMULATION_BANNER_H } from "./simulation-banner";
import SystemNoticeBar from "./system-notice";
import CommandPalette from "./command-palette";
import ShortcutsDialog from "./shortcuts-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar, TOPBAR_H } from "@/contexts/sidebar-context";
import { useShellMode } from "./use-shell-mode";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { sidebarWidth } = useSidebar();
  const { toggleMenu, toggleFoco, isMobileOpen, setMobileOpen } = useShellMode();
  // Modo Simulação: o banner global é fixo no topo — todo o layout desce a
  // altura dele (inclusive a sidebar, que lê o mesmo flag).
  const { simulation } = useAuth();
  const simActive = !!simulation?.active;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  // ── Atalhos globais ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // AltGr chega como Ctrl+Alt no teclado ABNT2: sem esta guarda os atalhos
      // engoliriam caracteres que o usuário está DIGITANDO.
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
      // Digitando num campo (motivo do pedido, busca, observações), o atalho não
      // rouba a tecla nem abre painel por cima do diálogo aberto.
      const el = e.target as HTMLElement | null;
      const typing = !!el && (
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
      );
      if (mod && typing) return;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); return; }
      if (mod && e.key === "\\") { e.preventDefault(); toggleMenu(); return; }
      if (mod && e.key === ".") { e.preventDefault(); toggleFoco(); return; }
      if (mod && e.key === "/") { e.preventDefault(); setShortcutsOpen((v) => !v); return; }
      if (e.key === "Escape") {
        // Diálogos e popovers do Radix já fecham sozinhos no Esc; aqui sobra a
        // gaveta mobile, que é um overlay nosso.
        if (isMobileOpen) setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMenu, toggleFoco, isMobileOpen, setMobileOpen]);

  return (
    <div
      className="min-h-dvh bg-background"
      style={{
        ...(simActive ? { paddingTop: SIMULATION_BANNER_H } : {}),
        // Onde termina o que está fixo no topo (barra do topo + banner de
        // simulação, quando ativo). Cabeçalhos `sticky` de tabela usam esta
        // medida — com `top-14` cravado eles ficavam ATRÁS da barra em
        // simulação, que empurra tudo 40px para baixo.
        ["--sticky-top" as string]: `${TOPBAR_H + (simActive ? SIMULATION_BANNER_H : 0)}px`,
      } as React.CSSProperties}
    >
      <SimulationBanner />
      <Sidebar />

      <div
        className="flex min-h-dvh flex-col transition-[margin] duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        <Topbar
          topOffset={simActive ? SIMULATION_BANNER_H : 0}
          onOpenPalette={openPalette}
          onOpenShortcuts={openShortcuts}
        />
        <SystemNoticeBar />
        <main className="flex-1">
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
