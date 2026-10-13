import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';

export interface SingleFlightOptions {
  // 锁超时（秒），须大于 fn 的最坏耗时；持有者崩溃时锁到期自动放行。默认 60
  lockTtlSec?: number;
  // 等待者超时（毫秒）：超时后兜底直接回源，避免持有者异常时无限阻塞。默认 lockTtlSec*1000+2000
  waitTimeoutMs?: number;
  // 等待者轮询缓存回填的间隔（毫秒）。默认 200
  pollIntervalMs?: number;
}

export interface WrapOptions<T> {
  key?: string | (() => string); // 缓存 key，支持函数动态生成
  ttl?: number; // 过期时间（秒）
  unless?: (result: T) => boolean | Promise<boolean>; // 条件，满足则不缓存
  /**
   * 单飞：缓存 miss 时只允许一个回源，其余并发请求等待缓存回填后命中。
   * 防止「缓存被清/失效后并发请求全部回源」的击穿死亡螺旋（如对大表的全量聚合）。
   * 默认关闭——轻量回源无需付出 SET NX + 轮询开销，仅重聚合场景按需开启。
   */
  singleFlight?: SingleFlightOptions;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private redisService: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    return this.redisService.get<T>(key);
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return this.redisService.mget<T>(keys);
  }

  async set<T>(key: string, value: T, ttl?: number) {
    await this.redisService.set(key, value, ttl);
  }

  async evict(key: string) {
    await this.redisService.del(key);
  }

  async evictMany(keys: string[]) {
    await this.redisService.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return this.redisService.exists(key);
  }

  async existsMany(keys: string[]): Promise<boolean[]> {
    return this.redisService.existsMany(keys);
  }

  async scan(pattern: string, count?: number): Promise<string[]> {
    return this.redisService.scan(pattern, count);
  }

  /**
   * Wrap 函数
   * @param options 配置，包括 key、ttl、unless 和可选的 singleFlight
   * @param fn 回调函数，返回 T 或 Promise<T>
   */
  async wrap<T>(
    options: {
      key: string | (() => string);
      ttl?: number;
      unless?: (result: T) => boolean | Promise<boolean>;
      singleFlight?: SingleFlightOptions;
    },
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const key = options?.key;
    if (!key) {
      throw new Error('Cache key is required');
    }
    const keyUse = typeof key === 'function' ? key() : key;

    // 快路径：绝大多数请求命中缓存直接返回
    const cached = await this.get<T>(keyUse);
    if (cached !== null) return cached;

    // 未开启单飞：保持原行为，直接回源后写入
    if (!options?.singleFlight) {
      const result = await Promise.resolve(fn());
      await this.persist(keyUse, result, options);
      return result;
    }

    return this.wrapSingleFlight(keyUse, options, fn);
  }

  /**
   * 单飞回源：缓存 miss 时用 Redis 互斥锁保证只有一个请求回源，
   * 其余并发请求轮询等待缓存回填后命中，避免对大表的全量聚合并发打爆 DB。
   *
   * 锁与释放复用 subject-export.service 既有 idiom（SET ... NX EX + GET+DEL）。
   * GET+DEL 释放存在极小竞态（锁自然到期后另一持有者刚 set，本进程的 GET 命中旧值后 DEL 误删新锁），
   * 仅在 fn 耗时超过 lockTtlSec 时可能发生；lockTtlSec 须取大于 fn 最坏耗时，正常情况下永不触发。
   */
  private async wrapSingleFlight<T>(
    keyUse: string,
    options: {
      ttl?: number;
      unless?: (result: T) => boolean | Promise<boolean>;
      singleFlight?: SingleFlightOptions;
    },
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const sf = options.singleFlight!;
    const lockTtlSec = sf.lockTtlSec ?? 60;
    const pollIntervalMs = sf.pollIntervalMs ?? 200;
    const waitTimeoutMs = sf.waitTimeoutMs ?? lockTtlSec * 1000 + 2000;
    const lockKey = `${keyUse}:lock`;
    const token = randomUUID();

    let acquired = false;
    try {
      acquired = await this.acquireLock(lockKey, token, lockTtlSec);
    } catch (err) {
      // Redis 异常时降级为直接回源，不因缓存设施故障阻断业务
      this.logger.warn(
        `[wrap] singleFlight acquireLock error, fallback to compute: ${String(err)}`,
      );
      const result = await Promise.resolve(fn());
      await this.persist(keyUse, result, options);
      return result;
    }

    if (acquired) {
      try {
        // 双检：抢锁期间可能有上一个持有者刚回填完缓存
        const recheck = await this.get<T>(keyUse);
        if (recheck !== null) return recheck;
        const result = await Promise.resolve(fn());
        await this.persist(keyUse, result, options);
        return result;
      } finally {
        await this.releaseLock(lockKey, token);
      }
    }

    // 等待者：轮询直到缓存回填或超时
    const deadline = Date.now() + waitTimeoutMs;
    while (Date.now() < deadline) {
      await this.sleep(pollIntervalMs);
      try {
        const recheck = await this.get<T>(keyUse);
        if (recheck !== null) return recheck;
      } catch {
        // 瞬时 Redis 抖动，继续轮询
      }
    }
    // 兜底：持有者超时/崩溃未回填，等待者自行回源（退化但仍远好于并发 stampede）
    this.logger.warn(
      `[wrap] singleFlight wait timeout for ${keyUse}, fallback to compute`,
    );
    const result = await Promise.resolve(fn());
    await this.persist(keyUse, result, options);
    return result;
  }

  private async acquireLock(
    lockKey: string,
    token: string,
    ttlSec: number,
  ): Promise<boolean> {
    const res = await this.redisService
      .getClient()
      .set(lockKey, token, 'EX', ttlSec, 'NX');
    return res === 'OK';
  }

  private async releaseLock(lockKey: string, token: string) {
    try {
      const client = this.redisService.getClient();
      const current = await client.get(lockKey);
      if (current === token) {
        await client.del(lockKey);
      }
    } catch (err) {
      // 释放失败不影响正确性：锁有 TTL，到期自动放行
      this.logger.warn(
        `[wrap] releaseLock error for ${lockKey}: ${String(err)}`,
      );
    }
  }

  private async sleep(ms: number) {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 按 unless 语义写入缓存
   */
  private async persist<T>(
    keyUse: string,
    result: T,
    options: {
      ttl?: number;
      unless?: (result: T) => boolean | Promise<boolean>;
    },
  ) {
    if (options?.unless) {
      const skipCache = await Promise.resolve(options.unless(result));
      if (!skipCache) {
        await this.set(keyUse, result, options.ttl);
      }
    } else {
      await this.set(keyUse, result, options?.ttl);
    }
  }
}
