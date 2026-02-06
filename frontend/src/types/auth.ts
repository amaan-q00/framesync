export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  status: string;
  data: {
    user: User;
  };
}

export interface GoogleAuthResponse {
  status: string;
  data: {
    user: User;
  };
}
