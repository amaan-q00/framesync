'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLink from '@/components/ui/AppLink';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import GoogleButton from '@/components/auth/GoogleButton';
import { RegisterCredentials } from '@/types/auth';
import { getErrorMessage } from '@/lib/utils';

export default function RegisterPage() {
  const [formData, setFormData] = useState<RegisterCredentials>({
    name: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<RegisterCredentials>>({});
  const [isLoading, setIsLoading] = useState(false);

  const { register } = useAuth();
  const router = useRouter();
  const { error } = useToast();

  const validateForm = (): boolean => {
    const newErrors: Partial<RegisterCredentials> = {};

    if (!formData.name) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await register(formData);
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = getErrorMessage(err) || 'Registration failed';
      setErrors({ email: msg, password: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof RegisterCredentials]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <AppLink href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              sign in to your existing account
            </AppLink>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <Input
              label="Full name"
              name="name"
              type="text"
              autoComplete="name"
              value={formData.name}
              onChange={handleChange}
              error={errors.name}
              placeholder="Enter your full name"
              disabled={isLoading}
            />
            
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
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              placeholder="Create a password"
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
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">Or continue with</span>
              </div>
            </div>

            <GoogleButton disabled={isLoading} />
          </div>
        </form>
      </div>
    </div>
  );
}
