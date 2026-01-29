import pool from '../config/db';

const createTables = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      bucket_path VARCHAR(255) NOT NULL,
      thumbnail_path VARCHAR(255),
      status VARCHAR(50) DEFAULT 'queued',
      views INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Database Tables Verified');
  } catch (err) {
    console.error('Database Migration Failed:', err);
    process.exit(1);
  }
};

export default createTables;