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
      {/* Link de pulo (23/09): quem navega por teclado/leitor de tela chega ao
          conteúdo sem atravessar o menu inteiro. Invisível até receber foco. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Ir para o conteúdo
      </a>
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
        {/* `--page-gutter` (23/09): a margem da página em UMA variável. Telas com
            barra de contexto colada nas bordas (Passagens, Escalação, Espelho)
            usam `-mx-[var(--page-gutter)]`/`px-[var(--page-gutter)]` — antes
            cravavam `-mx-6` e, com o padding responsivo daqui, sobrava rolagem
            horizontal em 375px e uma fresta de 8px em 1024+. */}
        <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
          <div className="[--page-gutter:1rem] sm:[--page-gutter:1.5rem] lg:[--page-gutter:2rem] p-[var(--page-gutter)]">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
