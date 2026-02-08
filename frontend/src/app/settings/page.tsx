'use client';

import React, { useState, useRef } from 'react';
import AppLink from '@/components/ui/AppLink';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { profileApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { User, Camera } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { success, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      error('Invalid file type. Only JPEG, PNG, and WebP are allowed');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      error('File too large. Maximum size is 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const response = await profileApi.uploadAvatar(file);
      const newAvatarUrl = response.data.avatar_url;
      setAvatarUrl(newAvatarUrl);
      
      // Update user in context with new avatar
      if (user) {
        updateUser({ ...user, avatar_url: newAvatarUrl });
      }
      
      success('Avatar uploaded successfully');
    } catch (err: unknown) {
      error(getErrorMessage(err) || 'Avatar upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      error('Name is required');
      return;
    }

    setIsLoading(true);
    try {
      const response = await profileApi.updateMe({ name: name.trim() });
      
      // Update user in context
      if (user) {
        updateUser({ ...user, name: response.data.user.name });
      }
      
      success('Profile updated successfully');
    } catch (err: unknown) {
      error(getErrorMessage(err) || 'Profile update failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <AppLink href="/dashboard" className="text-xl font-semibold text-gray-900 hover:text-blue-600">
                FrameSync
              </AppLink>
            </div>
            <div className="flex items-center space-x-4">
              <AppLink
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Dashboard
              </AppLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Profile Settings</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center space-x-6">
              <div className="relative">
                <div 
                  onClick={handleAvatarClick}
                  className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
                >
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Avatar" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12 text-gray-400" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Profile Picture</h3>
                <p className="text-sm text-gray-500 mb-2">
                  Click the camera icon to upload a new avatar
                </p>
                <p className="text-xs text-gray-400">
                  JPEG, PNG, or WebP. Max 5MB.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Name Field */}
            <Input
              label="Name"
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your name"
              disabled={isLoading}
            />

            {/* Email Field (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500">
                Email cannot be changed
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <AppLink
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </AppLink>
              <Button
                type="submit"
                disabled={isLoading || isUploading}
                isLoading={isLoading}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
