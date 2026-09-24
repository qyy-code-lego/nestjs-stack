---
name: design-database-entity
description: 设计数据库实体 — 继承 EntityWithIdAndTimeTrace，优先复用 extendable 的 WithStatus/ObjectActiveStatus/WithAuditor/WithScopeStrategy；所有 @Column 必须显式声明 type，并让 DTO/DDL/dict 保持一致。
type: composite
tags: [entity, database]
when_to_use: 关键词 — entity, database, schema, typeorm, design, ObjectActiveStatus, @Column.type
---


# 数据库实体设计

## 1. 选基类

| 场景 | 基类 |
| - | - |
| 仅需 ID | `EntityWithId` |
| 业务实体（默认） | `EntityWithIdAndTimeTrace` — 自动维护 `createdAt`/`updatedAt` |

**禁止自定义 `id`/`createdAt`/`updatedAt` 字段。** 详见 `entity-base`。

## 2. 叠加 Mixin（按需）

- 行级数据权限 → `WithScopeStrategy(Base)`，配合 `data-scope`
- 创建/更新人审计 → `WithAuditor(Base)`
- 通用启停状态 → `WithStatus(Base)` + `ObjectActiveStatus`
- 通常组合：`WithAuditor(WithScopeStrategy(WithStatus(EntityWithIdAndTimeTrace)))`

## 3. 字段命名

- 列名使用 `snake_case`（数据库），TypeScript 属性 `camelCase`
- 业务编码列保留语义后缀：`xxxCode`、`xxxType`、`xxxStatus`
- 软删用 TypeORM `@DeleteDateColumn() deletedAt: Date`，查询不要手拼 `deletedAt IS NULL`
- **每个 `@Column` 必须显式写 `type`**，禁止裸 `@Column()`
- 关联 ID（`xxxId`）一律 `type: 'bigint'`，TS 类型 `string`；与 DDL 的 `BIGINT` 一致，不要用 `varchar` 存 ID

## 4. 业务枚举 / 状态字段

- `status` 是普通启停态时，优先复用 `WithStatus` / `ObjectActiveStatus`
- 自定义业务枚举时，必须新建 `enum` 对象，Entity / DTO / Service / VO 统一使用该枚举
- 面向前端展示的业务枚举，通常还要同步维护字典分片 `public/dict/<key>.json`
- 不要在 Entity 中把状态字段定义成宽泛 `string`

## 5. 索引建议

- 查询条件高频字段（`hospitalId`、`createdAt`、状态码）建索引
- 唯一性约束（手机号、用户名）建唯一索引并在 Service 层显式查重抛 `BizError`
- 复合索引按区分度高的列在前

## 6. 关系定义

- 使用 TypeORM 关系装饰器（`@OneToMany` / `@ManyToOne` / `@OneToOne`），通过 `leftJoinAndSelect` 取数（参见 `service-paradigm` 查询分层）
- 反向关系字段建议命名为复数（`profiles`、`schedules`）

## 7. 模板

```typescript
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import {
  EntityWithIdAndTimeTrace,
  WithAuditor,
  WithScopeStrategy,
  WithStatus,
} from '@qyy-code-lego/nestjs/entities';

export enum SubjectType {
  SYSTEM = 'system',
  CUSTOM = 'custom',
}

@Entity('biz_custom_subject')
export class CustomSubject extends WithAuditor(
  WithScopeStrategy(WithStatus(EntityWithIdAndTimeTrace)),
) {
  @Column({ name: 'name', type: 'varchar', length: 64 })
  name: string;

  @Column({ name: 'hospital_id', type: 'bigint' })
  hospitalId: string;

  @Column({ name: 'subject_type', type: 'varchar', length: 16 })
  subjectType: SubjectType;

  @ManyToOne(() => CustomCategory, c => c.subjects)
  @JoinColumn({ name: 'category_id' })
  category: CustomCategory;
}
```

## 相关 skill

- `entity-base` — extendable 与固定写法
- `dto-validation` — DTO 枚举校验与 Entity 对齐
- `dict-json` — 业务枚举与字典同步
- `write-ddl` — PostgreSQL DDL 规范（一表一文件、ID BIGINT、COMMENT ON），SQL 字段定义必须与 Entity 一致
- `data-scope`
- `service-paradigm` — 查询基于实体关系
