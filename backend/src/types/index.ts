export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url?: string;
  password_hash?: string;
  google_id?: string;
  created_at: Date;
}

export type SafeUser = Omit<User, 'password_hash' | 'google_id'>;

export interface TokenPayload {
  userId: number;
  email: string;
}

export interface CookieOptions {
  path?: string;
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

export interface ProfileUpdateInput {
  name?: string;
  avatar_url?: string;
}

export interface Video {
  id: string;
  user_id: number;
  title: string;
  description?: string;
  bucket_path: string;
  thumbnail_path?: string;
  fps: number;
  duration: number;
  status: 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';
  views: number;
  is_public: boolean;
  public_token?: string;
  public_role: 'viewer' | 'editor';
  created_at: Date;
}

export interface VideoShare {
  id: number;
  video_id: string;
  user_id: number;
  role: 'editor' | 'viewer';
  created_at: Date;
}

export interface Session {
  id: string;
  video_id: string;
  host_id: number | null; 
  is_live: boolean;
  active_editors: number[]; 
  created_at: Date;
}

export interface VectorStroke {
  points: number[]; 
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
}

export interface Comment {
  id: string;
  video_id: string;
  user_id?: number;
  guest_name?: string;
  
  text: string;
  type: 'chat' | 'marker' | 'shape';
  
  drawing_data?: VectorStroke[] | null;
  color?: string;
  timestamp: number;
  frame_number: number;
  duration: number;
  duration_frames: number;
  is_resolved: boolean;
  created_at: Date;
  user_name?: string;
  user_email?: string;
  user_avatar?: string;
}