'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLink from '@/components/ui/AppLink';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import GoogleButton from '@/components/auth/GoogleButton';
import { LoginCredentials } from '@/types/auth';
import { getErrorMessage } from '@/lib/utils';

export default function LoginPage() {
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<LoginCredentials>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login, googleLogin } = useAuth();
  const router = useRouter();
  const { success, error, warning } = useToast();

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginCredentials> = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await login(formData);
      success('Login successful! Redirecting...');
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = getErrorMessage(err) || 'Login failed';
      error(msg);
      setErrors({ email: msg, password: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      // TODO: Implement Google OAuth flow
      // For now, we'll show a message that it's disabled
      warning('Google login will be available soon. Please use email/password for now.');
    } catch (err: unknown) {
      error('Google login failed');
      console.error('Google login error:', err);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof LoginCredentials]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <AppLink href="/register" className="font-medium text-blue-600 hover:text-blue-500">
              create a new account
            </AppLink>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <Input
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              placeholder="Enter your email"
              disabled={isLoading}
            />
            
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              placeholder="Enter your password"
              disabled={isLoading}
            />
          </div>

          
          <div className="space-y-3">
            <Button
              type="submit"
              disabled={isLoading}
              isLoading={isLoading}
              className="w-full"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">Or continue with</span>
              </div>
            </div>

            <GoogleButton
              onClick={handleGoogleLogin}
              disabled={true} // Disabled as requested
              isLoading={googleLoading}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
