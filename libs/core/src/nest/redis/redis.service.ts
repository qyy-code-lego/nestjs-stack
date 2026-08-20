import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { RedisConfig, RedisClientConfig } from './redis.types';
import { RedisHelper } from './redis.helper';

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = parseInt((value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly clients = new Map<string, Redis>();
  /** 不带 keyPrefix 的客户端，供跨 app 共享缓存使用；见 {@link getGlobalHelper}。 */
  private readonly globalClients = new Map<string, Redis>();

  constructor(private readonly configService: ConfigService) {}

  private readonly logger = new Logger(RedisService.name);

  getClient(name: keyof RedisConfig = 'default'): Redis {
    if (this.clients.has(name as string)) {
      return this.clients.get(name as string)!;
    }

    const redisConfig = this.configService.get<RedisConfig>('redis');
    const config =
      redisConfig && redisConfig[name]
        ? redisConfig[name]
        : this.getDefaultConfig();

    const client = this.createClient(config);

    this.clients.set(name as string, client);
    return client;
  }

  /**
   * 仅限于KV模式的工具
   * @param name
   * @returns
   */
  getHelper(name: keyof RedisConfig = 'default'): RedisHelper {
    const client = this.getClient(name);
    return new RedisHelper(client);
  }

  /**
   * 不带 `REDIS_KEY_PREFIX` 的客户端，用于**跨 app 共享**的缓存。
   *
   * `keyPrefix` 设在 ioredis 客户端上（见 {@link createClient}），无法在单次调用里
   * 绕过，因此共享缓存需要一个独立客户端。
   *
   * ## 什么时候该用它
   *
   * 判据是**数据的作用域**，不是方便与否：若缓存的数据由多个 app 共享同一份事实
   * （典型如 `sys_runtime_config`——同一张表、同一个 code、所有 app 必须读到同一个值），
   * 就必须落在同一个命名空间。否则 A 应用改完只清掉自己前缀下的键，B 应用继续读它
   * 那份旧的，失效根本不跨 app 生效，只能等 TTL 到期。
   *
   * 反过来，会话、字典翻译、业务临时态这些**各 app 私有**的缓存一律继续走
   * {@link getHelper}：`REDIS_KEY_PREFIX` 的用途正是隔离它们。
   *
   * ## 调用方的义务
   *
   * 没有了 app 前缀，键名必须自带足以表达**数据来源**的限定词（例如数据源标识），
   * 否则两套指向不同数据库的部署共用一个 Redis 时会互相污染。
   */
  getGlobalHelper(name: keyof RedisConfig = 'default'): RedisHelper {
    const key = name as string;
    const existing = this.globalClients.get(key);
    if (existing) return new RedisHelper(existing);

    const redisConfig = this.configService.get<RedisConfig>('redis');
    const config =
      redisConfig && redisConfig[name]
        ? redisConfig[name]
        : this.getDefaultConfig();

    // 复用同一份连接参数，只去掉 keyPrefix。
    const client = this.createClient({ ...config, keyPrefix: undefined });
    this.globalClients.set(key, client);
    return new RedisHelper(client);
  }

  private createClient(config: RedisClientConfig): Redis {
    const options: RedisOptions = {
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      lazyConnect: true,
      keyPrefix: config.keyPrefix,
      // 命令级超时：Redis 慢/连接异常时命令快速 reject，
      // 避免 await 永久悬挂（每个请求都经 SessionGuard 打 Redis，否则会拖垮全站）。
      commandTimeout: parseIntEnv(process.env.REDIS_COMMAND_TIMEOUT_MS, 5000),
      connectTimeout: parseIntEnv(process.env.REDIS_CONNECT_TIMEOUT_MS, 5000),
      // 收敛重试：普通 KV/session/lock 客户端有限重试即失败。
      // （BullMQ 的 blocking 连接在 worker/queue.factory 内独立创建并自带 null，不受此影响。）
      maxRetriesPerRequest: parseIntEnv(process.env.REDIS_MAX_RETRIES, 3),
    };

    const client = new Redis(options);

    client.on('connect', () => {
      this.logger.log(
        `[Redis] connected ${options.host}:${options.port} db:${options.db}`,
      );
    });

    client.on('error', (err) => {
      this.logger.error('[Redis] error', err);
    });

    return client;
  }

  private getDefaultConfig(): RedisClientConfig {
    return {
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
    };
  }

  async get<T = string>(key: string): Promise<T | null> {
    return this.getHelper().get<T>(key);
  }

  async mget<T = string>(keys: string[]): Promise<(T | null)[]> {
    return this.getHelper().mget<T>(keys);
  }

  async set(key: string, value: unknown, ttlSeconds?: number) {
    await this.getHelper().set(key, value, ttlSeconds);
  }

  async del(...keys: string[]) {
    await this.getHelper().del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return this.getHelper().exists(key);
  }

  async existsMany(keys: string[]): Promise<boolean[]> {
    return this.getHelper().existsMany(keys);
  }

  async scan(pattern: string, count?: number): Promise<string[]> {
    return this.getHelper().scan(pattern, count);
  }

  async hset(key: string, field: string, value: unknown) {
    await this.getHelper().hset(key, field, value);
  }

  async hmset(key: string, data: Record<string, unknown>) {
    await this.getHelper().hmset(key, data);
  }

  async hget<T = string>(key: string, field: string): Promise<T | null> {
    return this.getHelper().hget<T>(key, field);
  }

  async hmget<T = string>(
    key: string,
    fields: string[],
  ): Promise<(T | null)[]> {
    return this.getHelper().hmget<T>(key, fields);
  }

  async hdel(key: string, ...fields: string[]) {
    await this.getHelper().hdel(key, ...fields);
  }

  async onModuleDestroy() {
    for (const client of this.globalClients.values()) {
      await client.quit();
    }
    for (const client of this.clients.values()) {
      await client.quit();
    }
  }
}
