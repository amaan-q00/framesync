import Redis, { type RedisOptions } from 'ioredis';
import { env } from './env';

/** Shared options: reconnection (e.g. Upstash idle disconnect) + TLS when REDIS_URL is rediss://. Works for local (redis://) and deployed (rediss://). */
function getRedisOptions(): RedisOptions {
  const base: RedisOptions = {
    maxRetriesPerRequest: null, // required for retryStrategy and for BullMQ blocking commands
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  };
  // TLS: ioredis uses TLS automatically for rediss://; set servername for correct SNI (e.g. Upstash)
  if (env.REDIS_URL.startsWith('rediss://')) {
    try {
      const url = new URL(env.REDIS_URL.replace(/^rediss:\/\//, 'https://'));
      base.tls = { servername: url.hostname };
    } catch {
      base.tls = {};
    }
  }
  return base;
}

const redisOptions = getRedisOptions();

export const redis = new Redis(env.REDIS_URL, redisOptions);

redis.on('connect', () => console.log('Redis Connected'));
redis.on('error', (err) => console.error('Redis Error:', err));
redis.on('reconnect', () => console.log('Redis Reconnected'));

/** Create a separate connection with the same options (retry + TLS). Use for BullMQ so queue and worker each have a resilient connection. */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, redisOptions);
}