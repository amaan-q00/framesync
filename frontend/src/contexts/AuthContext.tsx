'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User, LoginCredentials, RegisterCredentials } from '@/types/auth';
import { authApi, onAuthError } from '@/lib/api';

const PUBLIC_ROUTES = ['/login', '/register', '/'];

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
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // Handle auth errors (401s) from API calls
  useEffect(() => {
    const unsubscribe = onAuthError(() => {
      setUser(null);
      // Only redirect if not already on a public route
      if (!isPublicRoute) {
        router.push('/login');
      }
    });
    return unsubscribe;
  }, [router, isPublicRoute]);

  useEffect(() => {
    // Skip auth check on public routes (login, register, home)
    if (isPublicRoute) {
      setIsLoading(false);
      return;
    }

    // Validate user session by checking current auth status
    const validateAuth = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.data.user);
        } else if (response.status === 401) {
          // Unauthorized - clear user and redirect
          setUser(null);
          router.push('/login');
        } else {
          setUser(null);
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
      // Token will be set as HttpOnly cookie by backend
      setUser(response.data.user);
    } catch (error) {
      throw error;
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    try {
      const response = await authApi.register(credentials);
      // Token will be set as HttpOnly cookie by backend
      setUser(response.data.user);
    } catch (error) {
      throw error;
    }
  };

  const googleLogin = async (token: string) => {
    try {
      const response = await authApi.googleLogin(token);
      // Token will be set as HttpOnly cookie by backend
      setUser(response.data.user);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API call failed:', error);
    } finally {
      // Cookie will be cleared by backend
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
