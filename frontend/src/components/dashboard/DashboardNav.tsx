'use client';

import { useRouter } from 'next/navigation';
import AppLink from '@/components/ui/AppLink';
import AppLogo from '@/components/ui/AppLogo';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User } from 'lucide-react';

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

  const linkClass =
    'flex items-center gap-1.5 rounded-lg p-3 min-h-[44px] min-w-[44px] sm:min-w-0 sm:px-3 sm:py-2 text-fg-muted hover:bg-surface hover:text-fg transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-page';

  const displayName = user?.name ?? '';
  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : '';

  return (
    <nav className="sticky top-0 z-30 border-b border-border bg-elevated accent-glow">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
          <AppLogo href="/dashboard" />

          <div className="flex items-center gap-1 sm:gap-2">
            <AppLink
              href="/settings"
              className="flex items-center gap-2 rounded-lg p-1.5 sm:px-2 sm:py-1.5 min-h-[44px] min-w-[44px] sm:min-w-0 text-fg-muted hover:bg-surface hover:text-fg transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-page"
              aria-label="Profile and settings"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover border border-border shrink-0"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary border border-border shrink-0">
                  {initials ? (
                    <span className="text-xs font-medium">{initials}</span>
                  ) : (
                    <User size={14} aria-hidden />
                  )}
                </span>
              )}
              <span className="hidden sm:inline max-w-[120px] truncate text-sm text-fg-muted" title={displayName}>
                {displayName}
              </span>
            </AppLink>
            <button
              type="button"
              onClick={handleLogout}
              className={`${linkClass} text-left sm:min-w-0`}
              aria-label="Log out"
            >
              <LogOut size={20} className="shrink-0 sm:mr-0" aria-hidden />
              <span className="hidden sm:inline text-sm font-medium">
                Logout
              </span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
