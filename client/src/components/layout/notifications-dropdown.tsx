import { Link } from "wouter";
import { Bell, CheckCircle, Users, UserCheck, Plane, Calculator, FileText, ShieldAlert } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "inclusion": return Users;
    case "scaling": return UserCheck;
    case "tickets": return Plane;
    case "closure": return Calculator;
    case "approval": return CheckCircle;
    case "production": return ShieldAlert;
    default: return FileText;
  }
};

export default function NotificationsDropdown() {
  const { notifications, totalCount } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="relative p-2 rounded-lg hover:bg-accent transition-colors" 
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma notificação pendente</p>
          </div>
        ) : (
          notifications.map((notification) => {
            const Icon = getNotificationIcon(notification.type);
            return (
              <DropdownMenuItem key={notification.id} asChild>
                <Link href={notification.route} className="flex items-start space-x-3 p-3 cursor-pointer hover:bg-accent">
                  <div className="flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground truncate">
                        {notification.title}
                      </p>
                      <Badge variant="secondary" className="ml-2">
                        {notification.count}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notification.description}
                    </p>
                  </div>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}