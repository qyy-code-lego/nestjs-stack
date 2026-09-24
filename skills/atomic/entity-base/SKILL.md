---
name: entity-base
description: TypeORM 实体必须继承 EntityWithId 或 EntityWithIdAndTimeTrace，并优先复用 extendable 中的 WithStatus/ObjectActiveStatus 等固定能力；所有 @Column 必须显式声明 type。
type: atomic
tags: [entity, extendable]
when_to_use: 关键词 — entity, typeorm, base-entity, extendable, ObjectActiveStatus, @Column.type
---


# 数据库实体基类

`libs/entities` 提供基类与 extendable Mixin，自动处理 ID、时间戳和一批通用业务字段。**禁止自行定义 `id` / `createdAt` / `updatedAt` 字段。**

## 1. 基类

| 类 | 字段 |
| - | - |
| `EntityWithId` | `id` (Snowflake) |
| `EntityWithIdAndTimeTrace` | `id` + `createdAt` + `updatedAt`（自动维护） |

## 2. extendable 固定能力（优先复用）

优先复用 `libs/entities/src/core/base/extendable.ts` 中已有能力，不要重复造一套等价字段：

| 能力 | 用法 | 典型场景 |
| - | - | - |
| `WithAuditor(Base)` | 增加 `createdBy` / `updatedBy` | 需要审计人 |
| `WithSoftDelete(Base)` | 增加 `deletedAt` | 逻辑删除 |
| `WithStatus(Base)` | 增加 `status`，默认 `ObjectActiveStatus.ACTIVE` | 通用启停状态 |
| `WithScopeStrategy(Base)` | 增加数据范围字段 | 行级权限 |

其中状态字段优先复用：

- 通用“启用/禁用”场景，**直接使用 `WithStatus` + `ObjectActiveStatus`**
- 不要把 `status` 写成裸 `string`
- 只有当状态语义不是启停态时，才新建业务枚举对象

## 3. `@Column` 必须显式声明 `type`

**禁止写裸 `@Column()`。** 每个持久化字段都必须明确数据库类型，避免不同数据库或 TypeORM 推断产生偏差。

```typescript
@Column({ name: 'name', type: 'varchar', length: 64 })
name: string;

@Column({ name: 'sort', type: 'int', default: 0 })
sort: number;

// 关联 ID（雪花 ID）一律 bigint，TS 类型保持 string（pg 驱动返回字符串）
@Column({ name: 'project_id', type: 'bigint' })
projectId: string;
```

> 主键 `id` 与所有关联 ID（`*_id`、`created_by`、`updated_by`）在数据库中均为 `BIGINT`，**不要用 `varchar` 存 ID**。DDL 规则见 `write-ddl`。

## 4. 推荐组合

```typescript
import {
  EntityWithIdAndTimeTrace,
  WithAuditor,
  WithScopeStrategy,
  WithStatus,
} from '@qyy-code-lego/nestjs/entities';
import { Entity, Column } from 'typeorm';

@Entity('biz_knowledge_base')
export class KnowledgeBase extends WithAuditor(
  WithScopeStrategy(WithStatus(EntityWithIdAndTimeTrace)),
) {
  @Column({ name: 'name', type: 'varchar', length: 128 })
  name: string;

  @Column({ name: 'cover_file_id', type: 'bigint', nullable: true })
  coverFileId?: string | null;
}
```

> `WithStatus` 已经提供了显式类型的 `status` 列，无需在实体里再重复定义。

## 5. 业务枚举字段写法

业务枚举必须定义成 **TypeScript `enum` 对象**，不要直接用字符串字面量散落在 Entity / DTO / Service 中。

```typescript
export enum KnowledgeBaseSourceType {
  MANUAL = 'manual',
  IMPORT = 'import',
}

@Column({ name: 'source_type', type: 'varchar', length: 16 })
sourceType: KnowledgeBaseSourceType;
```

如果该枚举需要面向前端展示，通常还应同步维护字典分片 `public/dict/<key>.json`。详见 `dict-json`。

## 6. 不要做

- 不要重复定义与 `extendable` 等价的 `status` / `deletedAt` / `createdBy` / `updatedBy`
- 不要把业务状态写成裸字符串并在 Service 中到处比较
- 不要省略 `@Column({ type: ... })`
- 不要让 Entity 承担展示态字段，展示态交给 VO / `vo-transform`

## 相关 skill

- `design-database-entity` — 实体设计总流程
- `dto-validation` — DTO 枚举校验要与 Entity 对齐
- `dict-json` — 枚举 code 与字典翻译
- `data-scope` — 行级数据范围
- `service-paradigm` — Service 查询返回实体聚合
