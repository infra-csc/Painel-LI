import Sidebar from "./sidebar";
import { useSidebar } from "@/contexts/sidebar-context";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isCollapsed, isCompact } = useSidebar();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <main className={cn(
        "min-h-screen transition-all duration-300",
        isCollapsed ? "lg:ml-0" : isCompact ? "lg:ml-20" : "lg:ml-64"
      )}>
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
