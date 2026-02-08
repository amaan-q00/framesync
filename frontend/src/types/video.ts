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

export interface UploadSession {
  videoId: string;
  uploadId: string;
  key: string;
  file: File;
  title: string;
  description?: string;
  isPublic: boolean;        // Access setting at upload time
  publicRole: 'viewer' | 'editor';  // Role for public access
  chunks: UploadChunk[];
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;
  error?: string;
}

export interface UploadChunk {
  partNumber: number;
  start: number;
  end: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  etag?: string;
  retries: number;
}

export interface InitializeUploadResponse {
  status: string;
  data: {
    videoId: string;
    uploadId: string;
    key: string;
  };
}

export interface SignPartResponse {
  status: string;
  data: {
    url: string;
  };
}

export interface CompleteUploadResponse {
  status: string;
  message: string;
}

export interface PublicAccessResponse {
  status: string;
  data: {
    is_public: boolean;
    public_token?: string;
    public_role: 'viewer' | 'editor';
  };
}
