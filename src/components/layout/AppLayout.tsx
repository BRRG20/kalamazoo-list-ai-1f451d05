import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Package, Settings, HelpCircle, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface AppLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', label: 'Batches', icon: Package },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/help', label: 'Help', icon: HelpCircle },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <>
      <div className="p-4 border-b border-sidebar-border">
        <h1 className="font-semibold text-lg text-sidebar-foreground">
          Kalamazoo Lister
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Vintage listing made easy</p>
      </div>
      
      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground">
          Version 1.0
        </p>
      </div>
    </>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-40 md:hidden bg-background border-b border-border">
        <div className="flex items-center justify-between p-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar">
              <div className="flex flex-col h-full">
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="font-semibold text-foreground">Kalamazoo Lister</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 border-r border-border bg-sidebar flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
