'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/register', '/'];

/** Watch pages are public so shared links with ?token= work without login (backend uses optionalAuth). */
function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith('/watch/')) return true;
  return false;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    // Don't redirect while loading
    if (isLoading) return;

    // If not authenticated and on a protected route, redirect to login
    if (!isAuthenticated && !isPublic) {
      router.push('/login');
    }

    // If authenticated and on a public auth route, redirect to dashboard
    if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
      router.push('/dashboard');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render protected content if not authenticated
  if (!isAuthenticated && !isPublic) {
    return null;
  }

  return <>{children}</>;
}
