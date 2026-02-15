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
import { LogIn } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

export default function LoginPage() {
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<LoginCredentials>>({});
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const { success, error } = useToast();

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof LoginCredentials]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-page py-8 px-4 sm:py-12 sm:px-6 lg:px-8 animate-fade-in">
      <AppLogo href="/" className="mb-6 sm:mb-8" />
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div>
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-fg">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-fg-muted">
            Or{' '}
            <AppLink
              href="/register"
              className="font-medium text-primary hover:text-accent transition-colors duration-150"
            >
              create a new account
            </AppLink>
          </p>
        </div>

        <form
          className="mt-6 sm:mt-8 space-y-6 animate-slide-up"
          onSubmit={handleSubmit}
        >
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
              icon={<LogIn className="w-[1.125em] h-[1.125em]" />}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-page text-fg-muted">
                  Or continue with
                </span>
              </div>
            </div>

            <GoogleButton disabled={isLoading} />
          </div>
        </form>
      </div>
    </div>
  );
}
