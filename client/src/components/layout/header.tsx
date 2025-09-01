import NotificationsDropdown from "./notifications-dropdown";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-foreground">Sistema de Logística Interna</h1>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationsDropdown />
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
