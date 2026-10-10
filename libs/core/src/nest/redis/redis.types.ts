// config/redis.config.ts
export interface RedisClientConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export interface RedisConfig {
  default: RedisClientConfig;
  // 根据需要自行扩展
  [key: string]: RedisClientConfig;
}
