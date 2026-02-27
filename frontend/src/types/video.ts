export interface Video {
  id: string;
  user_id: number;
  title: string;
  description?: string;
  bucket_path: string;
  thumbnail_path?: string;
  thumbnail_url?: string | null;
  fps: number;
  duration: number;
  status: 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';
  views: number;
  is_public: boolean;
  public_token?: string;
  public_role: 'viewer' | 'editor';

  created_at: Date;
}

export type MyWorkVideo = Pick<
  Video,
  'id' | 'title' | 'thumbnail_path' | 'thumbnail_url' | 'status' | 'views' | 'created_at' | 'is_public' | 'public_token' | 'public_role'
>;

export interface SharedWithMeVideo extends MyWorkVideo {
  owner_name: string;
  role: 'viewer' | 'editor';
}

export interface PaginatedVideos<T> {
  data: T[];
  total: number;
}

export interface VideoShareEntry {
  user_id: number;
  email: string;
  name: string | null;
  role: 'viewer' | 'editor';
}

export interface UploadSession {
  videoId: string;
  uploadId: string;
  key: string;
  file: File;
  title: string;
  description?: string;
  isPublic: boolean;
  publicRole: 'viewer' | 'editor';
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

export interface MarkerSegmentPayload {
  startTime: number;
  endTime: number;
  strokes: DrawingStroke[];
}

export type CommentDrawingData = DrawingStroke[] | { segments: MarkerSegmentPayload[] };

export interface Comment {
  id: string;
  video_id: string;
  user_id: number | null;
  guest_name: string | null;
  text: string | null;
  drawing_data: CommentDrawingData | null;
  color: string;
  type: 'chat' | 'marker' | 'shape';
  timestamp: number;
  frame_number: number;
  duration_frames: number;
  is_resolved: boolean;
  created_at: string;
  user_name?: string;
  user_avatar?: string | null;
}

export interface DrawingStroke {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}
