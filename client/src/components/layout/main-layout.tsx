import Sidebar from "./sidebar";
import { useSidebar } from "@/contexts/sidebar-context";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isCollapsed, isCompact, isFocusMode, exitFocusMode } = useSidebar();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      {isFocusMode && (
        <button
          onClick={exitFocusMode}
          className="fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg transition-all duration-200"
          title="Sair do modo foco"
        >
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">Sair do Foco</span>
        </button>
      )}
      <main className={cn(
        "min-h-screen transition-all duration-300",
        (isCollapsed || isFocusMode) ? "lg:ml-0" : isCompact ? "lg:ml-14" : "lg:ml-[260px]"
      )}>
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
