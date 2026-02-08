'use client';

import { useRouter } from 'next/navigation';
import AppLink from '@/components/ui/AppLink';
import { useAuth } from '@/contexts/AuthContext';

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
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <AppLink href="/dashboard" className="text-xl font-semibold text-gray-900 hover:text-blue-600">
              FrameSync
            </AppLink>
            <div className="hidden sm:flex gap-4">
              <AppLink href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </AppLink>
              <AppLink href="/dashboard/my" className="text-sm text-gray-600 hover:text-gray-900">
                My work
              </AppLink>
              <AppLink href="/dashboard/shared" className="text-sm text-gray-600 hover:text-gray-900">
                Shared with me
              </AppLink>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <AppLink href="/settings" className="text-sm text-gray-600 hover:text-gray-900">
              Settings
            </AppLink>
            <span className="text-sm text-gray-500">{user?.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
