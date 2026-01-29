import { Pool } from 'pg';
import { env } from './env';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected Error on Idle DB Client', err);
  process.exit(-1);
});

export default pool;