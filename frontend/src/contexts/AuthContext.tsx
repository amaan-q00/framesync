'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User, LoginCredentials, RegisterCredentials } from '@/types/auth';
import { authApi, onAuthError } from '@/lib/api';
import { setToken, clearToken, getToken } from '@/lib/authToken';

const PUBLIC_ROUTES = ['/login', '/register', '/', '/auth'];

/** Watch pages and auth callback are public. */
function isPublicRoutePath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith('/watch/')) return true;
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  googleLogin: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const pathname = usePathname();
  const isPublicRoute = isPublicRoutePath(pathname);

  // Handle auth errors (401s) from API calls
  useEffect(() => {
    const unsubscribe = onAuthError(() => {
      setUser(null);
      // Only redirect if not already on a public route (e.g. don't redirect from /watch/xyz)
      if (!isPublicRoute) {
        router.push('/login');
      }
    });
    return unsubscribe;
  }, [router, isPublicRoute]);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = getToken();
    const validateAuth = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${apiBase}/api/auth/me`, {
          credentials: 'include',
          headers,
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.data.user);
        } else {
          setUser(null);
          // Only redirect to login on 401 when not on a public route (e.g. watch page with cookie still valid after refresh)
          if (!isPublicRoute && response.status === 401) {
            router.push('/login');
          }
        }
      } catch (error) {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateAuth();
  }, [isPublicRoute, router]);

  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authApi.login(credentials);
      if (response.data.token) setToken(response.data.token);
      setUser(response.data.user);
    } catch (error) {
      throw error;
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    try {
      const response = await authApi.register(credentials);
      if (response.data.token) setToken(response.data.token);
      setUser(response.data.user);
    } catch (error) {
      throw error;
    }
  };

  const googleLogin = async (token: string) => {
    try {
      const response = await authApi.googleLogin(token);
      if (response.data.token) setToken(response.data.token);
      setUser(response.data.user);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err: unknown) {
      console.error('Logout API call failed:', err);
    } finally {
      clearToken();
      setUser(null);
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    register,
    googleLogin,
    logout,
    updateUser,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
