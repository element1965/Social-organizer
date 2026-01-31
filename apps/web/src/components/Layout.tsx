import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, Bell, PlusCircle, Users, Settings } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { cn } from '../lib/utils';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/notifications', icon: Bell, label: 'Notifications', badge: true },
  { path: '/create', icon: PlusCircle, label: 'Create' },
  { path: '/network', icon: Users, label: 'Network' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: unread } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <main className="flex-1 pb-16 overflow-y-auto">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around items-center h-16 z-50">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full relative',
                active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.badge && unread && unread.count > 0 && (
                <span className="absolute top-1 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                  {unread.count > 9 ? '9+' : unread.count}
                </span>
              )}
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
