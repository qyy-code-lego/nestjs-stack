---
name: entity-base
description: TypeORM 实体继承 EntityWithId/EntityWithIdAndTimeTrace、Mixin 复用、@Column 显式 type、DDL 一表一文件 BIGINT+COMMENT。
tags: [entity, extendable, ddl]
group: 数据层
---

# 实体基类与 Mixin

TypeORM 实体必须继承 `EntityWithId` 或 `EntityWithIdAndTimeTrace`，禁止自定义 id/createdAt/updatedAt。固定能力通过 `extendable` Mixin 叠加。基类位于 `libs/entities/src/core/base/extendable.ts`。

## 基类与 Mixin

```typescript
export class XxxEntity extends WithScopeStrategy(
  WithAuditor(WithStatus(EntityWithIdAndTimeTrace)),
) {
  @Index()
  @Column({ length: 64 })
  name!: string;

  @Column({ type: 'bigint', nullable: true })   // 关联 ID 一律 bigint，TS 类型 string
  deptId?: string;
}
```

| Mixin | 提供字段 |
| - | - |
| `WithId` | id（snowflake，`@BeforeInsert` 自动生成） |
| `WithTimeTrace` | createdAt / updatedAt（timestamptz） |
| `WithAuditor` | createdBy / updatedBy |
| `WithSoftDelete` | deletedAt（`@DeleteDateColumn`） |
| `WithStatus` | status: ObjectActiveStatus（ACTIVE/DISABLED） |
| `WithScopeStrategy` | scopeStrategy / scopeDeptId / scopeCreatorId |

雪花 ID 生成器 `snowflakeIdGenerator`（`libs/common/src/utils/id.ts`，纪元 2023-01-01，workerId 取自 `SNOWFLAKE_WORKER_ID`）。

> ⚠️ 关键约束：每个 `@Column` 必须显式声明 `type`，禁止裸 `@Column()`；关联 ID 一律 `type: 'bigint'`、TS 类型 `string`。

## 实体设计要点

- 选基类：默认 `EntityWithIdAndTimeTrace`。
- 叠 Mixin：`WithScopeStrategy` / `WithAuditor` / `WithStatus` 按需。
- 列名 snake_case，属性 camelCase。
- 业务枚举同步维护 TS enum + 字典（见 [业务字典](./dict-json)）。
- 关系定义优先 TypeORM 装饰器（`@ManyToOne` 等）。

## DDL 约定（write-ddl）

PostgreSQL 建表 DDL 一表一文件，模块入口用 `\ir` 引入：

- 所有 ID 列 `BIGINT`，禁止 varchar 存 ID。
- 每表每列 `COMMENT ON`，一个都不能少。
- 禁止物理外键（`REFERENCES` / `FOREIGN KEY`）。
- 文件四段：头注释 → `CREATE TABLE` → `COMMENT ON` → 索引。
- 改表：改表文件 + migration 增量脚本 + 同步 Entity/DTO/dict。

## 规范要点

| 场景 | 做法 |
| - | - |
| 基类 | 继承 EntityWithId / EntityWithIdAndTimeTrace |
| 固定能力 | 叠加 extendable Mixin |
| @Column | 显式 type，关联 ID bigint |
| DDL | 一表一文件，BIGINT + COMMENT，无物理外键 |

## 权威源

- skill：[`entity-base`](../skills/atomic/entity-base)、[`design-database-entity`](../skills/composite/design-database-entity)、[`write-ddl`](../skills/composite/write-ddl)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[TypeORM 查询设计](./sql-query)、[身份、权限与数据范围](./auth-permission)
