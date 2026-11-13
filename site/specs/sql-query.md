---
name: sql-query
description: TypeORM 查询设计：leftJoinAndSelect 取关系、ParseRange 拼 BETWEEN、dataScopeEngine.apply 行级权限、skip+take 分页。
tags: [sql, query, typeorm]
group: 数据层
---

# TypeORM 查询设计

本节说明 Service 内 TypeORM QueryBuilder 的标准写法：优先 `leftJoinAndSelect` 取关系数据，范围条件按 `ParseRange` 解析结果拼接，行级权限用 `dataScopeEngine.apply` 注入，分页用 `skip + take + getManyAndCount`。

## 关系查询

优先 `leftJoinAndSelect` 拿关系数据，不退化到 raw 字段映射：

```typescript
const qb = this.repo.createQueryBuilder('t')
  .leftJoinAndSelect('t.dept', 'dept')
  .leftJoinAndSelect('t.creator', 'creator');
```

> ⚠️ 关键约束：不在 join 条件手拼 `deletedAt IS NULL`，软删由 `@DeleteDateColumn` 自动处理。

## 范围条件拼接

按 `ParseRange` / `ParseDateTimeRange` 解析后的数组元素是否存在拼条件（DTO 见 [DTO 校验与范围查询](./dto-validation)）：

```typescript
if (amount?.[0] != null) qb.andWhere('t.amount >= :min', { min: amount[0] });
if (amount?.[1] != null) qb.andWhere('t.amount <= :max', { max: amount[1] });
if (createdAt?.[0] != null) qb.andWhere('t.created_at >= :cMin', { cMin: createdAt[0] });
if (createdAt?.[1] != null) qb.andWhere('t.created_at <= :cMax', { cMax: createdAt[1] });
```

## 行级权限与分页

`searcher` 由 Controller 显式传入，不在 Service 内读 ALS：

```typescript
await this.dataScopeEngine.apply({ qb, searcher });   // SELF/DEPT_ONLY/DEPT_AND_CHILDREN/ALL

const [list, total] = await qb
  .skip((page - 1) * size)
  .take(size)
  .getManyAndCount();
```

复杂去重/聚合分页用 `qb.clone().getCount()` 单独取总数。

## 写入流程

先查重抛 `BizError` 再 `save`：

```typescript
const exists = await this.repo.findOne({ where: { name } });
if (exists) throw new BizError('名称已存在').codeAs(1002).httpStatusAs(409);
await this.repo.save(entity);
```

## 规范要点

| 场景 | 做法 |
| - | - |
| 关系数据 | `leftJoinAndSelect`，不 raw 映射 |
| 范围条件 | 按 ParseRange 元素存在性拼 BETWEEN/>=/<= |
| 行级权限 | `dataScopeEngine.apply`，searcher 由 Controller 传入 |
| 分页 | `skip + take + getManyAndCount` |
| 写入 | 先查重抛 BizError 再 save |

## 权威源

- skill：[`design-sql-query`](../skills/composite/design-sql-query)、[`range-query`](../skills/atomic/range-query)、[`data-scope`](../skills/atomic/data-scope)、[`biz-error`](../skills/atomic/biz-error)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[实体基类与 Mixin](./entity-base)、[身份、权限与数据范围](./auth-permission)、[Service 层范式](./service-paradigm)
