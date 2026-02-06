// --- 1. USER & AUTH ---
export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url?: string;
  
  // UPDATED: Password is now optional (undefined for Google users)
  password_hash?: string; 
  
  // ADDED: To track external providers
  google_id?: string; 
  
  created_at: Date;
}

// SafeUser automatically excludes password_hash (even if undefined)
// You might also want to exclude google_id from the frontend response to keep it clean
export type SafeUser = Omit<User, 'password_hash' | 'google_id'>;

export interface TokenPayload {
  userId: number;
  email: string;
}

export interface CookieOptions {
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

export interface ProfileUpdateInput {
  name?: string;
  avatar_url?: string;
}

// --- 2. VIDEO ASSET (Matches DB) ---
export interface Video {
  id: string;
  user_id: number;
  title: string;
  description?: string;
  
  // Storage
  bucket_path: string;
  thumbnail_path?: string;
  
  // Metadata
  fps: number;       // Default 24.0
  duration: number;  // Total seconds
  
  // State
  status: 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';
  views: number;
  
  // Access Control
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

// --- 3. LIVE SESSION STATE (Matches Redis/DB) ---
export interface Session {
  id: string;
  video_id: string;
  host_id: number | null; 
  is_live: boolean;
  active_editors: number[]; 
  created_at: Date;
}

// --- 4. COMMENTS & MARKERS (Matches DB) ---
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
  
  // Sync Data
  timestamp: number;       // UI Time
  frame_number: number;    // Absolute Frame
  duration: number;        // UI Duration
  duration_frames: number; // Absolute Duration
  
  is_resolved: boolean;
  created_at: Date;
  
  // Hydrated Fields
  user_name?: string;
  user_email?: string;
  user_avatar?: string;
}