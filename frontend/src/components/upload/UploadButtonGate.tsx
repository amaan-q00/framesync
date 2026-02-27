'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UploadButton } from './UploadButton';

const PUBLIC_ROUTES = ['/', '/login', '/register'] as const;

function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return PUBLIC_ROUTES.includes(pathname as (typeof PUBLIC_ROUTES)[number]);
}

export function UploadButtonGate(): React.ReactElement | null {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated || isPublicRoute(pathname)) {
    return null;
  }
  if (pathname?.startsWith('/watch')) {
    return null;
  }

  return <UploadButton />;
}
