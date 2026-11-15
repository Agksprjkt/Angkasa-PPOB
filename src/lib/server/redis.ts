import 'server-only';

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type RedisClientType } from 'redis';

type RedisClient = RedisClientType;
type RedisLease = {
  acquired: boolean;
  release?: () => Promise<void>;
};

let client: RedisClient | null = null;
let connecting: Promise<RedisClient | null> | null = null;

function isConfigured() {
  return Boolean(process.env.REDIS_URL);
}

async function getConnectedClient() {
  if (!isConfigured()) return null;
  if (client?.isOpen) return client;
  if (connecting) return connecting;

  const password = process.env.REDIS_PASSWORD_FILE
    ? readFileSync(process.env.REDIS_PASSWORD_FILE, 'utf8').trim()
    : undefined;
  const nextClient = createClient({
    url: process.env.REDIS_URL,
    password,
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: false,
    },
  });
  nextClient.on('error', (error) => {
    console.error('[REDIS_CONNECTION_ERROR]', error.message);
  });
  client = nextClient;
  connecting = nextClient.connect()
    .then(() => nextClient)
    .catch((error: unknown) => {
      console.error(
        '[REDIS_CONNECT_FAILED]',
        error instanceof Error ? error.message : 'Unknown Redis error',
      );
      nextClient.destroy();
      if (client === nextClient) client = null;
      return null;
    })
    .finally(() => { connecting = null; });
  return connecting;
}

export async function consumeRedisRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean | null> {
  const redis = await getConnectedClient();
  if (!redis) return null;
  try {
    const result = await redis.eval(
      'local count = redis.call("INCR", KEYS[1]); if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]); end; return count',
      { keys: [key], arguments: [String(windowMs)] },
    );
    const count = Number(result);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error('Redis returned an invalid rate-limit counter');
    }
    return count <= limit;
  } catch (error) {
    console.error(
      '[REDIS_RATE_LIMIT_FAILED]',
      error instanceof Error ? error.message : 'Unknown Redis error',
    );
    return null;
  }
}

export async function acquireRedisLease(
  key: string,
  ttlMs: number,
): Promise<RedisLease | null> {
  const redis = await getConnectedClient();
  if (!redis) return null;
  const token = randomUUID();
  try {
    const result = await redis.set(key, token, { NX: true, PX: ttlMs });
    if (result !== 'OK') return { acquired: false };
  } catch (error) {
    console.error(
      '[REDIS_LOCK_FAILED]',
      error instanceof Error ? error.message : 'Unknown Redis error',
    );
    return null;
  }

  return {
    acquired: true,
    release: async () => {
      try {
        await redis.eval(
          'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]); end; return 0',
          { keys: [key], arguments: [token] },
        );
      } catch (error) {
        console.error(
          '[REDIS_LOCK_RELEASE_FAILED]',
          error instanceof Error ? error.message : 'Unknown Redis error',
        );
      }
    },
  };
}
