import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => {
  const defaultHost = process.env.REDIS_HOST || 'localhost';
  const defaultPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const defaultUsername = process.env.REDIS_USERNAME || undefined;
  const defaultPassword = process.env.REDIS_PASSWORD || undefined;
  const defaultDb = parseInt(process.env.REDIS_DB || '0', 10);
  const defaultKeyPrefix = process.env.REDIS_KEY_PREFIX || 'nestjs-app';

  const resolveRedisClient = (name: 'bullmq' | 'session', dbOffset: number) => {
    const prefix = `REDIS_${name.toUpperCase()}`;

    return {
      host: process.env[`${prefix}_HOST`] || defaultHost,
      port: parseInt(process.env[`${prefix}_PORT`] || `${defaultPort}`, 10),
      username: process.env[`${prefix}_USERNAME`] || defaultUsername,
      password: process.env[`${prefix}_PASSWORD`] || defaultPassword,
      db: parseInt(
        process.env[`${prefix}_DB`] || `${defaultDb + dbOffset}`,
        10,
      ),
    };
  };

  return {
    default: {
      host: defaultHost,
      port: defaultPort,
      username: defaultUsername,
      password: defaultPassword,
      db: defaultDb,
      keyPrefix: defaultKeyPrefix,
    },
    session: resolveRedisClient('session', 1),
    bullmq: resolveRedisClient('bullmq', 2),
  };
});
