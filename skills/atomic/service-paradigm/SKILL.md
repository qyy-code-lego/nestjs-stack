---
name: service-paradigm
description: Service 层四条强约束 — 上下文无关（禁用 ThreadLocal）、参数用 interface 而非 DTO Class、超过 3 个参数用对象参数、查询分层（返回实体聚合，不构造展示态）。
type: atomic
tags: [service, paradigm]
strict: true
when_to_use: 关键词 — service, paradigm, threadlocal, interface, object-parameter, query-layering
---


# Service 层范式 ⚠️ Strict

四条强约束。每一条违反都需要审查。

## 1. 上下文无关（HTTP Protocol Agnostic）

**Service 禁止使用 `ThreadLocal`/Request/Response。** 否则 Service 无法在 Cron / 消息消费 / 单测中复用。

Controller 取出后显式传入：

```typescript
// ❌ Bad
async doWork() {
  const store = this.threadLocal.getStore();
  return this.repo.find({ where: { userId: store.account.id } });
}

// ✅ Good
// Controller
@Post()
doWork() {
  const store = this.threadLocal.getStore();
  return this.service.doWork(store.account.id);
}
// Service
async doWork(userId: string) {
  return this.repo.find({ where: { userId } });
}
```

## 2. 参数用 interface 而非 DTO Class

Service 不依赖视图层 DTO Class。即便字段一致，也单独维护 `interface` / `type`。运行时关键校验在 Service 内做（抛 `BizError`）。

```typescript
// service 内
interface CreateUserInput { name: string; phone: string; }
async createUser(input: CreateUserInput) {
  if (!input.phone) throw new BizError('手机号必填');
  // ...
}
```

## 3. 对象参数模式（超过 3 个参数必须）

```typescript
// ✅
private async syncEntities<T>(options: {
  repo: Repository<T>;
  sourceList: any[];
  uniqueKey: keyof T;
  mapper: (s: any) => Partial<T>;
  scope?: Partial<T>;
}) {
  const { repo, sourceList, uniqueKey, mapper, scope } = options;
}

// ❌ 位置参数 > 3
private async syncEntities(repo, sourceList, uniqueKey, mapper, scope) {}
```

注意：分页方法的 `page` 与 `pageSize` 是固定签名约定，不计入此规则（参见 `pagination-and-list`）。

## 4. 查询分层

- **优先 Entity Relation 查询**：能用 `leftJoinAndSelect` 拿到的就别退化成 `addSelect` + `getRawAndEntities` 手工映射
- **Service 返回实体或实体聚合对象**（如 `{ relation, profile, schedule }`），不构造 `snapshot`/`vo-ready` 这种展示态
- **软删过滤遵循 ORM 默认行为**，不在 join 条件里手拼 `deletedAt IS NULL`，确需历史数据用 `withDeleted()`
- **派生展示字段（hasXxx/拼接文案/格式转换）放 vo-transform**，不放 Service

```typescript
// Service：实体聚合
async findPage(query: QueryDto, page: number, pageSize: number) {
  const qb = this.repo.createQueryBuilder('relation')
    .leftJoinAndSelect('relation.profile', 'profile')
    .leftJoinAndSelect('profile.schedule', 'schedule');
  const total = await qb.clone().getCount();
  const rows = await qb.skip((page - 1) * pageSize).take(pageSize).getMany();
  return { rows, total, page, pageSize };
}
```

## 相关 skill

- `context-threadlocal` — Controller 侧取上下文
- `pagination-and-list` — 分页签名
- `serialization-vo` — vo-transform 承接展示态
- `biz-error` — Service 内运行时校验抛出
