'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, UserPlus, Link2 } from 'lucide-react';
import { videoApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { getErrorMessage } from '@/lib/utils';
import Button from '@/components/ui/Button';
import type { VideoShareEntry } from '@/types/video';

export interface AccessManagementPopupProps {
  videoId: string;
  isPublic: boolean;
  publicToken?: string | null;
  publicRole: 'viewer' | 'editor';
  onClose: () => void;
  onUpdated?: () => void;
}

const FRONTEND_URL = typeof window !== 'undefined' ? window.location.origin : '';

export function AccessManagementPopup({
  videoId,
  isPublic,
  publicToken,
  publicRole,
  onClose,
  onUpdated,
}: AccessManagementPopupProps): React.ReactElement {
  const { success, error: showError } = useToast();
  const [shares, setShares] = useState<VideoShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer');
  const [adding, setAdding] = useState(false);
  const [publicEnabled, setPublicEnabled] = useState(isPublic);
  const [publicRoleLocal, setPublicRoleLocal] = useState<'viewer' | 'editor'>(publicRole);
  const [publicTokenLocal, setPublicTokenLocal] = useState<string | null>(publicToken ?? null);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<number | null>(null);

  const loadShares = useCallback(async () => {
    try {
      const res = await videoApi.getVideoShares(videoId);
      setShares(res.data);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [videoId, showError]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  const handleAddShare = async () => {
    const email = shareEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    try {
      await videoApi.shareVideo(videoId, { email, role: shareRole });
      success('Invitation sent');
      setShareEmail('');
      await loadShares();
      onUpdated?.();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const handleTogglePublic = async () => {
    setTogglingPublic(true);
    try {
      const res = await videoApi.setPublicAccess(videoId, {
        enabled: !publicEnabled,
        role: publicRoleLocal,
      });
      setPublicEnabled(res.data.is_public);
      setPublicTokenLocal(res.data.public_token ?? null);
      setPublicRoleLocal(res.data.public_role);
      success(res.data.is_public ? 'Public link enabled' : 'Public link disabled');
      onUpdated?.();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setTogglingPublic(false);
    }
  };

  const handleCopyPublicLink = () => {
    const token = publicTokenLocal;
    if (!token) return;
    const url = `${FRONTEND_URL}/watch/${videoId}?token=${token}`;
    navigator.clipboard.writeText(url).then(
      () => success('Link copied to clipboard'),
      () => showError('Failed to copy')
    );
  };

  const handleRemoveShare = async (userId: number) => {
    setRemovingUserId(userId);
    try {
      await videoApi.removeShare(videoId, userId);
      success('Access removed');
      await loadShares();
      onUpdated?.();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleUpdateShareRole = async (userId: number, email: string, newRole: 'viewer' | 'editor') => {
    setUpdatingRoleUserId(userId);
    try {
      await videoApi.shareVideo(videoId, { email: email.trim().toLowerCase(), role: newRole });
      success('Role updated');
      await loadShares();
      onUpdated?.();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl text-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-title"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-4 bg-white">
          <h2 id="access-title" className="text-lg font-semibold text-gray-900">
            Manage access
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-6 bg-white text-gray-900">
          {/* Share with someone */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
              <UserPlus size={16} />
              Share with someone
            </h3>
            <div className="flex gap-2">
              <input
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value as 'viewer' | 'editor')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [&>option]:bg-white [&>option]:text-gray-900"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <Button
                type="button"
                size="sm"
                onClick={handleAddShare}
                disabled={!shareEmail.trim() || adding}
                isLoading={adding}
              >
                Add
              </Button>
            </div>
          </section>

          {/* People with access */}
          <section>
            <h3 className="text-sm font-medium text-gray-900 mb-2">People with access</h3>
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : shares.length === 0 ? (
              <p className="text-sm text-gray-500">No one else has been invited.</p>
            ) : (
              <ul className="space-y-2">
                {shares.map((s) => (
                  <li
                    key={s.user_id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900">{s.email}</span>
                      {s.name && s.name !== s.email && (
                        <span className="ml-2 text-gray-500">({s.name})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={s.role}
                        onChange={(e) => handleUpdateShareRole(s.user_id, s.email, e.target.value as 'viewer' | 'editor')}
                        disabled={updatingRoleUserId === s.user_id}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 [&_option]:bg-white [&_option]:text-gray-900"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveShare(s.user_id)}
                        disabled={removingUserId === s.user_id}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Public link */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
              <Link2 size={16} />
              Public link
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={publicEnabled}
                  onChange={handleTogglePublic}
                  disabled={togglingPublic}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Anyone with the link can view</span>
              </label>
              {publicEnabled && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Link access</label>
                    <select
                      value={publicRoleLocal}
                      onChange={async (e) => {
                        const role = e.target.value as 'viewer' | 'editor';
                        setPublicRoleLocal(role);
                        if (!publicEnabled) return;
                        setTogglingPublic(true);
                        try {
                          const res = await videoApi.setPublicAccess(videoId, { enabled: true, role });
                          setPublicTokenLocal(res.data.public_token ?? null);
                          setPublicRoleLocal(res.data.public_role);
                          onUpdated?.();
                        } catch (err) {
                          showError(getErrorMessage(err));
                        } finally {
                          setTogglingPublic(false);
                        }
                      }}
                      disabled={togglingPublic}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [&>option]:bg-white [&>option]:text-gray-900"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                  </div>
                  {publicTokenLocal && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyPublicLink}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Copy size={16} />
                      Copy link
                    </Button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
