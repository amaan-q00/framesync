import { LoginCredentials, RegisterCredentials, AuthResponse, GoogleAuthResponse, User } from '@/types/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Simple event emitter for auth errors
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
      // Emit auth error on 401 to trigger logout/redirect
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