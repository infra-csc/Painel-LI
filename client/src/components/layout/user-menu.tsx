import { useState } from "react";
import { useLocation } from "wouter";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getRoleLabel } from "@/lib/role-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ProfileEditModal from "../modals/profile-edit-modal";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setLocation("/auth");
  };

  const getUserInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center space-x-3 p-2 rounded-lg hover:bg-accent transition-colors" data-testid="button-user-menu">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground font-medium text-sm">
                {getUserInitials(user?.name)}
              </span>
            </div>
            <div className="text-sm text-left">
              <div className="font-medium text-foreground" data-testid="text-username">
                {user?.name || 'Usuário'}
              </div>
              <div className="text-muted-foreground" data-testid="text-user-role">
                {user?.role ? getRoleLabel(user.role as any) : 'Usuário'}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setIsProfileModalOpen(true)} data-testid="menu-edit-profile">
            <Settings className="w-4 h-4 mr-2" />
            <span>Editar Dados Pessoais</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive" data-testid="menu-logout">
            <LogOut className="w-4 h-4 mr-2" />
            <span>Sair do Sistema</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileEditModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
      />
    </>
  );
}