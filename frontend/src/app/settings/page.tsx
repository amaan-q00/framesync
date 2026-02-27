'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppLink from '@/components/ui/AppLink';
import AppLogo from '@/components/ui/AppLogo';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { authApi, profileApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { User, Camera, AlertTriangle, Save, ArrowLeft } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuth();
  const { success, error } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      error('Invalid file type. Only JPEG, PNG, and WebP are allowed');
      return;
    }

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

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = deleteConfirmEmail.trim();
    if (!trimmed) {
      error('Please enter your email to confirm');
      return;
    }
    setIsDeleting(true);
    try {
      await authApi.deleteMe(trimmed);
      success('Account deleted');
      await logout();
      router.replace('/');
    } catch (err: unknown) {
      error(getErrorMessage(err) || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-page">
      <nav className="bg-elevated border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16 items-center">
            <AppLogo href="/dashboard" />
            <AppLink
              href="/dashboard"
              className="text-sm text-fg-muted hover:text-fg min-h-[44px] flex items-center transition-colors duration-150"
            >
              Dashboard
            </AppLink>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-surface border border-border rounded-lg p-6 shadow-sm animate-slide-up">
          <h2 className="text-xl sm:text-2xl font-bold text-fg mb-6">Profile Settings</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              <div className="relative">
                <div
                  onClick={handleAvatarClick}
                  className="w-24 h-24 rounded-full overflow-hidden bg-elevated cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center border border-border"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12 text-fg-muted" aria-hidden />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full hover:opacity-90 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center transition-opacity"
                  aria-label="Upload avatar"
                >
                  <Camera className="w-4 h-4" aria-hidden />
                </button>
              </div>
              <div>
                <h3 className="text-lg font-medium text-fg">Profile Picture</h3>
                <p className="text-sm text-fg-muted mb-1">
                  Click the camera icon to upload a new avatar
                </p>
                <p className="text-xs text-fg-muted">
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
              <label className="block text-sm font-medium text-fg mb-1">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-border rounded-lg bg-elevated text-fg-muted cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-fg-muted">Email cannot be changed</p>
            </div>

            {/* Submit Button */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:space-x-4">
              <AppLink
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-sm font-medium text-fg bg-surface border border-border rounded-lg hover:bg-elevated hover:border-primary/50 transition-colors duration-150"
              >
                Cancel
              </AppLink>
              <Button
                type="submit"
                disabled={isLoading || isUploading}
                isLoading={isLoading}
                icon={<Save className="w-[1.125em] h-[1.125em]" />}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </div>

        {/* Danger zone: Delete account */}
        <div className="mt-6 sm:mt-8 bg-surface border border-danger/50 rounded-lg p-6 animate-slide-up">
          <h2 className="text-lg font-semibold text-danger mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden />
            Danger zone
          </h2>
          <p className="text-sm text-fg-muted mb-4">
            Permanently delete your account and all your videos and data. This cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowDeleteModal(true)}
            disabled={isDeleting}
          >
            Delete account
          </Button>
        </div>
      </main>

      {/* Delete account modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          aria-modal="true"
          role="dialog"
          aria-labelledby="delete-title"
        >
          <div
            className="bg-elevated border border-border rounded-lg shadow-xl max-w-md w-full p-6 animate-slide-up"
            onKeyDown={(e) => e.key === 'Escape' && (setShowDeleteModal(false), setDeleteConfirmEmail(''))}
          >
            <h2 id="delete-title" className="text-lg font-semibold text-fg mb-2">
              Delete account
            </h2>
            <p className="text-sm text-fg-muted mb-4">
              Type your account email below to confirm. All your data will be permanently deleted.
            </p>
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <Input
                label="Your email"
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder={user?.email || 'Enter your email'}
                disabled={isDeleting}
                autoComplete="email"
              />
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmEmail('');
                  }}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isDeleting}
                  isLoading={isDeleting}
                >
                  Delete account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
