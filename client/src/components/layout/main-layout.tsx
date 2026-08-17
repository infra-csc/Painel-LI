import Sidebar from "./sidebar";
import { useSidebar, TOPBAR_H } from "@/contexts/sidebar-context";
import { X, Menu } from "lucide-react";
import logoImg from "@assets/image_1776349526988.png";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isFocusMode, exitFocusMode, sidebarWidth, isMobileOpen, toggleMobile } = useSidebar();

  return (
    <div className="min-h-dvh bg-gray-50">
      <Sidebar />

      {/* Barra superior — só em telas < lg. Fica no fluxo (sticky), então o
          h1 da página nunca fica escondido atrás do botão de menu. */}
      <header
        className="lg:hidden sticky top-0 z-30 flex items-center gap-2 px-2 bg-white/90 backdrop-blur border-b border-slate-200"
        style={{ height: TOPBAR_H }}
      >
        <button
          type="button"
          onClick={toggleMobile}
          aria-label={isMobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={isMobileOpen}
          aria-controls="app-sidebar"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-100 active:bg-slate-200"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <img src={logoImg} alt="" aria-hidden="true" className="w-6 h-6 object-contain shrink-0" />
          <span className="text-sm font-bold text-[#0033CC] truncate">Norte</span>
          <span className="text-xs text-slate-400 truncate">Logística Interna</span>
        </div>
      </header>

      {/* Modo foco só existe em desktop (em < lg o menu já é uma gaveta), então
          o botão de sair não aparece no mobile e não disputa espaço com o
          hambúrguer da barra superior. */}
      {isFocusMode && (
        <button
          onClick={exitFocusMode}
          className="hidden lg:flex fixed top-4 left-4 z-50 items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg transition-all duration-200"
          title="Sair do modo foco"
        >
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">Sair do Foco</span>
        </button>
      )}

      <main
        className="min-h-dvh transition-[margin] duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
