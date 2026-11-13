---
name: cache-redis
description: CacheService.wrap 自动 cache-aside、RedisService 内置 JSON 序列化、key 命名与 TTL、写入后主动 del 失效。
tags: [cache, redis]
group: 数据层
---

# 缓存与 Redis

缓存走 `CacheService.wrap`（自动 cache-aside），KV 存储走 `RedisService`（已内置 JSON 序列化）。两者均为 `@Global`，可直接注入。

## CacheService.wrap

一行替代手写「查缓存 → miss 回源 → 写缓存 → 返回」，防止缓存击穿：

```typescript
constructor(private readonly cacheService: CacheService) {}

const data = await this.cacheService.wrap({
  key: `xxx:detail:${id}`,        // 业务前缀 + 资源类型 + ID
  ttl: 60,                         // 必填，避免无界缓存
  loader: () => this.repo.findOne({ where: { id } }),
  unless: (v) => v == null,        // 不缓存空对象
});

// 写入操作后主动失效
await this.cacheService.del(`xxx:detail:${id}`);
```

| 参数 | 说明 |
| - | - |
| key | 业务前缀 + 资源类型 + ID |
| ttl | 必填（秒） |
| loader | miss 时回源函数 |
| unless | 条件不缓存（如空对象） |

## RedisService KV

`set/get` 已内置 JSON 序列化，禁止手动 `JSON.stringify` / `parse`；`get` 用泛型指定返回类型：

```typescript
// ✅ 正确
await this.redisService.set('my:key', { foo: 1 });
const v = this.redisService.get<{ foo: number }>('my:key');

// ❌ 错误：手动序列化
await this.redisService.set('my:key', JSON.stringify({ foo: 1 }));
```

> ⚠️ 关键约束：读 → miss → 回源 → 写缓存 的整合流程走 `cache-wrap`，不要在 Service 内手写 cache-aside；`REDIS_KEY_PREFIX` 必填（推荐 `nestjs-{appName}:`）。

## 常见误用

```typescript
// ❌ 手写 cache-aside，遗漏 unless 导致缓存空对象
const cached = await this.redisService.get('xxx:detail:${id}');
if (cached) return cached;
const data = await this.repo.findOne({ where: { id } });
await this.redisService.set(`xxx:detail:${id}`, data);   // data 可能为 null，缓存穿透

// ✅ CacheService.wrap 一行覆盖，unless 防穿透
const data = await this.cacheService.wrap({
  key: `xxx:detail:${id}`, ttl: 60,
  loader: () => this.repo.findOne({ where: { id } }),
  unless: (v) => v == null,
});
```

`file:translate:map` 等内置缓存复用同一套 Redis 序列化机制，禁止在外层再手动序列化。

## 规范要点

| 场景 | 做法 |
| - | - |
| cache-aside | `CacheService.wrap`，不手写 |
| KV 读写 | `RedisService.set/get`，泛型指定类型 |
| 空对象 | `unless` 不缓存 |
| 写入后 | 主动 `del` 失效 |

## 权威源

- skill：[`cache-wrap`](../skills/atomic/cache-wrap)、[`redis-kv`](../skills/atomic/redis-kv)、[`env-config-conventions`](../skills/atomic/env-config-conventions)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[配置体系](./config)、[Service 层范式](./service-paradigm)
