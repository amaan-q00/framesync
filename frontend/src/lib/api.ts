import { LoginCredentials, RegisterCredentials, AuthResponse, GoogleAuthResponse, User } from '@/types/auth';
import { getToken } from './authToken';
import {
  InitializeUploadResponse,
  SignPartResponse,
  CompleteUploadResponse,
  PublicAccessResponse,
  Video,
  MyWorkVideo,
  SharedWithMeVideo,
  VideoShareEntry,
  Comment,
} from '@/types/video';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type AuthErrorListener = () => void;
const authErrorListeners: AuthErrorListener[] = [];

export const onAuthError = (listener: AuthErrorListener) => {
  authErrorListeners.push(listener);
  return () => {
    const index = authErrorListeners.indexOf(listener);
    if (index > -1) authErrorListeners.splice(index, 1);
  };
};

const emitAuthError = () => {
  authErrorListeners.forEach(listener => listener());
};

class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}/api${endpoint}`;
  
  const isFormData = options.body instanceof FormData;
  
  const defaultHeaders: Record<string, string> = isFormData 
    ? {} 
    : { 'Content-Type': 'application/json' };

  const token = getToken();
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include',
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        emitAuthError();
      }
      throw new ApiError(data.message || 'Request failed', response.status);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error occurred');
  }
};

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  register: async (credentials: RegisterCredentials): Promise<AuthResponse> => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  googleLogin: async (token: string): Promise<GoogleAuthResponse> => {
    return apiRequest('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  logout: async (): Promise<{ status: string; message: string }> => {
    return apiRequest('/auth/logout', {
      method: 'POST',
    });
  },

  deleteMe: async (confirmEmail: string): Promise<{ status: string; message: string }> => {
    return apiRequest('/auth/me', {
      method: 'DELETE',
      body: JSON.stringify({ confirmEmail }),
    });
  },
};

export const profileApi = {
  getMe: async (): Promise<{ status: string; data: { user: User } }> => {
    return apiRequest('/profile/me', {
      method: 'GET',
    });
  },

  updateMe: async (data: { name?: string; avatar_url?: string }): Promise<{ status: string; data: { user: User } }> => {
    return apiRequest('/profile/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  uploadAvatar: async (file: File): Promise<{ status: string; data: { avatar_url: string } }> => {
    const formData = new FormData();
    formData.append('avatar', file);
    
    return apiRequest('/profile/avatar', {
      method: 'POST',
      body: formData,
    });
  },
};

export const videoApi = {
  initializeMultipart: async (data: {
    fileName: string;
    fileType: string;
    title: string;
    description?: string;
  }): Promise<InitializeUploadResponse> => {
    return apiRequest('/videos/initialize', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  signPart: async (data: {
    key: string;
    uploadId: string;
    partNumber: number;
  }): Promise<SignPartResponse> => {
    return apiRequest('/videos/sign-part', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  uploadPart: async (
    key: string,
    uploadId: string,
    partNumber: number,
    chunk: Blob,
    signal?: AbortSignal
  ): Promise<{ status: string; data: { etag: string } }> => {
    const params = new URLSearchParams({ key, uploadId, partNumber: String(partNumber) });
    const url = `${API_BASE_URL}/api/videos/upload-part?${params}`;
    const response = await fetch(url, {
      method: 'POST',
      body: chunk,
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.message || 'Upload part failed', response.status);
    return data;
  },

  completeMultipart: async (data: {
    videoId: string;
    key: string;
    uploadId: string;
    parts: Array<{ ETag: string; PartNumber: number }>;
  }): Promise<CompleteUploadResponse> => {
    return apiRequest('/videos/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  setPublicAccess: async (videoId: string, data: {
    enabled: boolean;
    role: 'viewer' | 'editor';
  }): Promise<PublicAccessResponse> => {
    return apiRequest(`/videos/${videoId}/public`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMyWorks: async (params?: { limit?: number; offset?: number; search?: string }): Promise<{ status: string; data: MyWorkVideo[]; total: number }> => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    if (params?.search?.trim()) sp.set('search', params.search.trim());
    const q = sp.toString();
    return apiRequest(`/videos/my-works${q ? `?${q}` : ''}`, { method: 'GET' });
  },

  getSharedWithMe: async (params?: { limit?: number; offset?: number; search?: string }): Promise<{ status: string; data: SharedWithMeVideo[]; total: number }> => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    if (params?.search?.trim()) sp.set('search', params.search.trim());
    const q = sp.toString();
    return apiRequest(`/videos/shared-with-me${q ? `?${q}` : ''}`, { method: 'GET' });
  },

  getVideoShares: async (videoId: string): Promise<{ status: string; data: VideoShareEntry[] }> => {
    return apiRequest(`/videos/${videoId}/shares`, { method: 'GET' });
  },

  deleteVideo: async (videoId: string): Promise<{ status: string; message: string }> => {
    return apiRequest(`/videos/${videoId}`, { method: 'DELETE' });
  },

  removeMyAccess: async (videoId: string): Promise<{ status: string; message: string }> => {
    return apiRequest(`/videos/${videoId}/share/me`, { method: 'DELETE' });
  },

  getVideo: async (videoId: string, token?: string): Promise<{ status: string; data: Video & { role: string; manifestUrl: string; isPublicAccess?: boolean } }> => {
    const url = token ? `/videos/${videoId}?token=${token}` : `/videos/${videoId}`;
    return apiRequest(url, {
      method: 'GET',
    });
  },

  shareVideo: async (videoId: string, data: {
    email: string;
    role?: 'viewer' | 'editor';
  }): Promise<{ status: string; message: string }> => {
    return apiRequest(`/videos/${videoId}/share`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeShare: async (videoId: string, userId: number): Promise<{ status: string; message: string }> => {
    return apiRequest(`/videos/${videoId}/share`, {
      method: 'DELETE',
      body: JSON.stringify({ userId }),
    });
  },

  getComments: async (videoId: string, token?: string): Promise<{ status: string; data: Comment[] }> => {
    const url = token ? `/videos/${videoId}/comments?token=${token}` : `/videos/${videoId}/comments`;
    return apiRequest(url, { method: 'GET' });
  },

  addComment: async (
    videoId: string,
    body: {
      text?: string;
      timestamp: number;
      type: 'chat' | 'marker' | 'shape';
      drawing_data?: unknown;
      color?: string;
      duration?: number;
      guestName?: string;
    },
    token?: string
  ): Promise<{ status: string; data: Comment }> => {
    const url = token ? `/videos/${videoId}/comments?token=${token}` : `/videos/${videoId}/comments`;
    return apiRequest(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  deleteComment: async (
    videoId: string,
    commentId: string,
    token?: string,
    options?: { guestName?: string }
  ): Promise<{ status: string; message: string }> => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (options?.guestName) params.set('guestName', options.guestName);
    const qs = params.toString();
    const url = qs ? `/videos/${videoId}/comments/${commentId}?${qs}` : `/videos/${videoId}/comments/${commentId}`;
    return apiRequest(url, { method: 'DELETE' });
  },
};