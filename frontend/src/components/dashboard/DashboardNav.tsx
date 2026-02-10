'use client';

import { useRouter } from 'next/navigation';
import AppLink from '@/components/ui/AppLink';
import { useAuth } from '@/contexts/AuthContext';
import { Settings, LogOut } from 'lucide-react';

export function DashboardNav(): React.ReactElement {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
          <AppLink
            href="/dashboard"
            className="shrink-0 text-lg sm:text-xl font-semibold text-gray-900 hover:text-blue-600"
          >
            FrameSync
          </AppLink>
          <div className="flex items-center gap-2 sm:gap-4">
            <AppLink
              href="/settings"
              className="flex items-center gap-1.5 rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 sm:px-3 sm:py-2"
              aria-label="Settings"
            >
              <Settings size={20} className="sm:hidden" />
              <span className="hidden sm:inline text-sm">Settings</span>
            </AppLink>
            <span className="hidden sm:inline max-w-[120px] truncate text-sm text-gray-500" title={user?.name ?? ''}>
              {user?.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 sm:px-3 sm:py-2"
              aria-label="Log out"
            >
              <LogOut size={20} className="sm:hidden" />
              <span className="hidden sm:inline text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
