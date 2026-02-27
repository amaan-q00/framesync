import Redis, { type RedisOptions } from 'ioredis';
import { env } from './env';

function getRedisOptions(): RedisOptions {
  const base: RedisOptions = {
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  };
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

export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, redisOptions);
}