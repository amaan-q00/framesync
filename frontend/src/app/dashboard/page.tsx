'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { profileApi } from '@/lib/api';
import AppLink from '@/components/ui/AppLink';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">FrameSync</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                Welcome, {user?.name}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-md"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Welcome to FrameSync Dashboard
            </h2>
            <p className="text-gray-600 mb-6">
              This is your protected dashboard. You can only access this page when you're logged in.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Videos</h3>
                <p className="text-gray-600 mb-4">Upload and synchronize your video content</p>
                <AppLink
                  href="/upload"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Get Started
                </AppLink>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900 mb-2">My Videos</h3>
                <p className="text-gray-600 mb-4">View and manage your uploaded videos</p>
                <button className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
                  View Videos
                </button>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Settings</h3>
                <p className="text-gray-600 mb-4">Manage your account settings</p>
                <AppLink
                  href="/settings"
                  className="inline-block px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Settings
                </AppLink>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
