import pool from '../config/db';

const createTables = async () => {
  const queryText = `
    -- 1. USERS TABLE
    -- Modified for Google Auth: password_hash is now optional
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255), -- Nullable for Google/OAuth users
      google_id VARCHAR(255) UNIQUE, -- Stores the Google Subject ID
      name VARCHAR(100),
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. VIDEOS TABLE
    -- Stores metadata, storage paths, and public access settings
    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      
      -- S3/Storage Paths
      bucket_path VARCHAR(255), -- Path to index.m3u8
      thumbnail_path VARCHAR(255),
      
      -- Technical Metadata (Critical for Frame Accuracy)
      fps FLOAT DEFAULT 24.0, 
      duration FLOAT DEFAULT 0.0,
      
      -- Processing Status
      status VARCHAR(50) DEFAULT 'queued', -- 'uploading', 'queued', 'processing', 'ready', 'failed'
      
      -- Analytics & Access
      views INTEGER DEFAULT 0,
      is_public BOOLEAN DEFAULT FALSE,
      public_token VARCHAR(255) UNIQUE, -- For unlisted public links
      public_role VARCHAR(20) DEFAULT 'viewer', -- 'viewer' or 'editor'
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. VIDEO SHARES TABLE
    -- Manages explicit team permissions (User A invites User B)
    CREATE TABLE IF NOT EXISTS video_shares (
      id SERIAL PRIMARY KEY,
      video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) DEFAULT 'editor', -- 'viewer', 'editor'
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(video_id, user_id) -- Prevent duplicate invites
    );

    -- 4. SESSIONS TABLE
    -- Manages "Live Mode" state. If a row exists, the room is "Live".
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
      host_id INTEGER REFERENCES users(id), -- The "Driver"
      is_live BOOLEAN DEFAULT FALSE,
      active_editors JSONB DEFAULT '[]', -- JSON Array of UserIDs
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. COMMENTS & MARKERS TABLE
    -- The core collaboration data. Supports text, drawings, and frame anchoring.
    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Null if user deleted
      guest_name VARCHAR(100), -- For public guests without accounts
      
      -- Content
      text TEXT,
      drawing_data JSONB, -- Vector strokes: [{points:[], color, width}]
      color VARCHAR(20) DEFAULT '#FF0000',
      type VARCHAR(20) CHECK (type IN ('chat', 'marker', 'shape')),
      
      -- Temporal Data (The "When")
      timestamp FLOAT NOT NULL,    -- Approximate seconds (for UI timeline)
      frame_number INTEGER NOT NULL, -- Exact frame index (for Sync/Playback)
      duration_frames INTEGER DEFAULT 0, -- How long the drawing persists
      
      -- Workflow Status
      is_resolved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- INDEXES (Optimization)
    -- Speeds up "Get all comments for video X"
    CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
    -- Speeds up "Get active session for video X"
    CREATE INDEX IF NOT EXISTS idx_sessions_video ON sessions(video_id);
    -- Speeds up "My Dashboard" queries
    CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);
    -- Speeds up "Shared with me" queries
    CREATE INDEX IF NOT EXISTS idx_shares_user ON video_shares(user_id);
  `;

  try {
    await pool.query(queryText);
    console.log('Database Schema Synced Successfully');
  } catch (err) {
    console.error('Database Setup Failed:', err);
    process.exit(1);
  }
};

export default createTables;