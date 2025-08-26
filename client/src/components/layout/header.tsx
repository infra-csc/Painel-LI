import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Header() {
  const { user } = useAuth();

  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-foreground">Sistema de Gestão de Produção</h1>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <button 
                className="p-2 rounded-lg hover:bg-accent transition-colors" 
                data-testid="button-notifications"
              >
                <Bell className="w-5 h-5 text-muted-foreground" />
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  3
                </span>
              </button>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-primary-foreground font-medium text-sm">
                  {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'JP'}
                </span>
              </div>
              <div className="text-sm">
                <div className="font-medium text-foreground" data-testid="text-username">
                  {user?.name || 'João Pedro Silva'}
                </div>
                <div className="text-muted-foreground" data-testid="text-user-role">
                  {user?.role === 'admin' ? 'Administrador' : user?.role || 'Administrador'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
