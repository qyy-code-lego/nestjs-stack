---
name: write-ddl
description: 编写 PostgreSQL 建表 DDL — 一个表一个文件（模块入口 \ir 引入）；主键与关联 ID 一律 BIGINT；每表每列 COMMENT ON；格式化对齐与文件头注释；禁止物理外键；枚举 CHECK 与 Entity/DTO/dict 一致；改完同步开发库并用临时 schema 比对。
type: composite
tags: [ddl, sql, postgresql]
when_to_use: 关键词 — DDL, SQL, 建表, 改表, 迁移, migration, COMMENT, BIGINT, 索引, status, enum, ObjectActiveStatus
---


# 编写 PostgreSQL DDL

数据库**不启用 TypeORM synchronize**，表结构只由 `docs/DDL/` 下的 SQL 定义。Entity、DTO、dict 必须与 DDL 一致。本 skill 自包含全部规则；项目若有 `docs/DDL/sql-guide.md`，以其补充约定为准。

> 语法是 **PostgreSQL**：不用反引号，不支持行内 `COMMENT '...'`，注释一律 `COMMENT ON`。

## 1. 文件组织：一个表一个文件

```
docs/DDL/
├── sql-guide.md                  ← 项目补充约定（可选）
├── 00-公共基础初始化.sql          ← 仅空库：\ir 引入框架 libs/entities/DDL/core/*.sql
├── 01-空间与项目.sql              ← 模块入口：只有 \ir，按执行顺序引入
├── 01-空间与项目/
│   ├── team.sql                  ← 一个文件只定义一张表（含其注释与索引）
│   ├── team_member.sql
│   └── account.sql               ← 对公共表的补充（如索引）也按表名单独成文件
└── migration/
    └── 20260924-<说明>/<表名>.sql ← 已上线环境的增量变更，同样一表一文件
```

- 文件名 = 表名；模块目录与入口用 `NN-中文模块名`，NN 表示执行顺序。
- 入口脚本只含文件头注释与 `\ir <模块>/<表>.sql`，执行：`psql -X -v ON_ERROR_STOP=1 -1 -f docs/DDL/NN-模块.sql`。
- 表文件始终描述**当前最终结构**（新环境执行即得最新库）；已有数据的环境通过 `migration/` 变更，**并同步修改表文件**。
- 禁止把多张表写进同一个文件，禁止“按功能一个大 SQL”。

## 2. 类型

| 场景 | 类型 | 说明 |
| - | - | - |
| 主键 `id` | `BIGINT PRIMARY KEY` | `WithId` 应用层生成雪花 ID，不用 `BIGSERIAL`（框架公共表除外） |
| 关联 ID：`*_id`、`created_by`、`updated_by` | `BIGINT` | 与公共表 `account.id` / `user.id` / `identity.id` / `sys_file.id` 一致；**禁止 `VARCHAR(64)` 存 ID** |
| 外部系统 ID（第三方请求号、openid 等） | `VARCHAR(n)` | 不是本库雪花 ID，按外部长度定义 |
| 时间 | `TIMESTAMPTZ` | 公共时间列 `DEFAULT now()` |
| 通用启停状态 | `VARCHAR(16) NOT NULL DEFAULT 'active'` | 对齐 `WithStatus` / `ObjectActiveStatus`（active / disabled） |
| 业务枚举 | `VARCHAR(16)` + `CHECK (col IN (...))` | 取值与 TS enum、`public/dict/<key>.json` 完全一致 |
| 名称 / 编码 | `VARCHAR(n)` + 必要的 `CHECK` | 如 `CHECK (length(btrim(name)) > 0)`、`CHECK (code ~ '^[a-z][a-z0-9_]*$')` |
| 长文本 | `TEXT` | |
| 结构化扩展 | `JSONB NOT NULL DEFAULT '{}'::jsonb` + `CHECK (jsonb_typeof(col) = 'object')` | JSON 内的 ID 存字符串，避免前端精度丢失 |
| 乐观锁版本 | `INT NOT NULL DEFAULT 1 CHECK (version > 0)` | |

应用层 ID 统一按 **string** 处理（pg 驱动把 BIGINT 返回为字符串）；Entity 写 `@Column({ type: 'bigint' }) xxxId: string`，接口中的 ID 也是字符串。

## 3. 公共字段（对齐 extendable）

| Mixin | 列 |
| - | - |
| `WithId` | `id BIGINT PRIMARY KEY` |
| `WithTimeTrace` | `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`、`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` |
| `WithAuditor` | `created_by BIGINT`、`updated_by BIGINT`（操作人 identity.id） |
| `WithSoftDelete` | `deleted_at TIMESTAMPTZ` |
| `WithStatus` | `status VARCHAR(16) NOT NULL DEFAULT 'active'` |

公共字段放在表首，业务字段另起 `-- 业务字段` 分段；Entity 用了哪些 Mixin，DDL 就要有对应列，反之亦然。

## 4. 约束与索引

- **禁止物理外键**（`REFERENCES` / `FOREIGN KEY`）；关联只存 ID，关系校验与并发控制在 Service 层完成。
- 需要在并发下成立的唯一性，用**唯一索引兜底**（Service 查重给友好提示，唯一冲突统一转 409）；可用部分索引表达“仅某状态唯一”，如 `WHERE status = 'active'`、`WHERE status = 'pending'`。
- 软删除表的唯一索引必须带 `WHERE deleted_at IS NULL`。
- 可空列参与唯一性且 NULL 也要比较时用 `NULLS NOT DISTINCT`（PG 15+），如同级目录名唯一。
- 行内互斥规则写成表级 `CHECK` 并在上方注释含义（如“文本素材只存正文，文件素材只存文件”）。
- 命名：唯一索引 `uq_<表>_<含义>`，普通索引 `idx_<表>_<含义>`；**每个索引上方一行注释说明它服务的查询**。复合索引按“等值过滤列 → 排序列”排列，分页列表通常以 `created_at DESC, id DESC` 结尾。

## 5. 格式与注释

表文件固定四段，顺序不可变：**文件头注释 → `CREATE TABLE` → `COMMENT ON` → 索引**。

- 文件头注释（`-- ===` 包围）必须有四项：
  - 第一行：`<表名> <中文名>`；
  - `模块：`所属模块与功能设计文档路径；
  - `说明：`业务含义与关键规则（可多行，续行缩进对齐）；
  - `约定：`ID 类型、无物理外键、公共字段来源。
- 关键字与类型大写（`CREATE TABLE`、`BIGINT`、`NOT NULL`）；函数与字面量小写（`now()`、`'{}'::jsonb`）。
- 一列一行，**列名 / 类型 / 约束三列对齐**（以本表最长列名与类型为准，用空格对齐，不用 Tab）；无约束的列直接以逗号结尾，不留尾随空格。
- 列顺序：公共字段在前 → `-- 业务字段`（按含义可再分段，如 `-- 来源追溯`、`-- 执行过程`）→ 表级 `CHECK` 放最后。
- 表级 / 多行 `CHECK` 换行缩进，并在上方用一行注释说明规则。
- `COMMENT ON TABLE  <表>`（TABLE 后两个空格）与 `COMMENT ON COLUMN <表>.<列>` 对齐，`IS` 也对齐成一列。
- 索引段每个索引上方一行注释说明用途；同类索引名对齐。
- 文件以换行结束；不写 `DROP TABLE`、`IF NOT EXISTS`（表文件描述最终结构，重复执行应当报错而不是静默跳过）。
- **每张表 `COMMENT ON TABLE`，每个字段 `COMMENT ON COLUMN`，一个都不能少**：
  - 关联字段写明指向：`所属项目 ID（project.id）`；
  - 枚举字段写明 enum、dict 与每个取值含义：`状态（ProjectStatus，dict: project_status）：active 进行中 / archived 已归档`；
  - 可空字段写明 NULL 的含义：`父目录 ID（folder.id）；NULL 表示根层级`；
  - 版本、JSON 字段写明何时递增 / 存什么结构。

## 6. 禁止清单

| 禁止 | 原因 / 正确做法 |
| - | - |
| MySQL 语法：反引号、行内 `COMMENT '...'`、``PRIMARY KEY (`id`)``、`ENGINE=`、`AUTO_INCREMENT` | 项目是 PostgreSQL；用 `COMMENT ON`，主键写在列上 |
| `VARCHAR(64)` 等字符串类型存本库 ID | 与公共表 BIGINT 不一致，关联比较需强转；一律 `BIGINT` |
| 业务表用 `SERIAL` / `BIGSERIAL` 主键 | ID 由 `WithId` 生成雪花值；只有框架公共表沿用自增 |
| `TIMESTAMP`（无时区） | 用 `TIMESTAMPTZ` |
| 多张表写在一个文件、按功能写大 SQL | 一表一文件，模块入口 `\ir` |
| `REFERENCES` / `FOREIGN KEY` | 关联在 Service 校验 |
| 任何表或字段缺少 `COMMENT ON` | 注释是交付物的一部分，缺一条即不合格 |
| 枚举列只写 `VARCHAR(16)` 不加 `CHECK` | 取值必须由数据库兜底，并与 TS enum、dict 一致 |
| 索引无用途注释、无命名规范 | `uq_` / `idx_` 前缀 + 上方注释 |
| 只改 DDL 不同步开发库，或只改库不改表文件 | 两者必须一致，改完做临时 schema 比对 |
| 在入口脚本里写表定义 | 入口只 `\ir` |

## 7. 模板（`docs/DDL/NN-模块/biz_article.sql`）

```sql
-- =============================================================================
-- biz_article 文章
-- -----------------------------------------------------------------------------
-- 模块：NN 内容管理（docs/feat-design/NN-内容管理.md）
-- 说明：栏目下的文章；支持草稿 / 发布 / 下线，逻辑删除。
-- 约定：主键与关联 ID 均为 BIGINT（雪花 ID）；无物理外键；公共字段对齐 extendable
-- =============================================================================

CREATE TABLE biz_article (
  id             BIGINT        PRIMARY KEY,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_by     BIGINT,
  updated_by     BIGINT,
  deleted_at     TIMESTAMPTZ,
  -- 业务字段
  column_id      BIGINT        NOT NULL,
  title          VARCHAR(128)  NOT NULL CHECK (length(btrim(title)) > 0),
  status         VARCHAR(16)   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'offline')),
  cover_file_id  BIGINT,
  extra          JSONB         NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object'),
  version        INT           NOT NULL DEFAULT 1 CHECK (version > 0)
);

COMMENT ON TABLE  biz_article               IS '文章；归属栏目，逻辑删除';
COMMENT ON COLUMN biz_article.id            IS '主键，雪花 ID';
COMMENT ON COLUMN biz_article.created_at    IS '创建时间';
COMMENT ON COLUMN biz_article.updated_at    IS '更新时间';
COMMENT ON COLUMN biz_article.created_by    IS '创建人身份 ID（identity.id）';
COMMENT ON COLUMN biz_article.updated_by    IS '更新人身份 ID（identity.id）';
COMMENT ON COLUMN biz_article.deleted_at    IS '逻辑删除时间；NULL 表示未删除';
COMMENT ON COLUMN biz_article.column_id     IS '所属栏目 ID（biz_article_column.id）';
COMMENT ON COLUMN biz_article.title         IS '标题；同栏目未删除文章内唯一';
COMMENT ON COLUMN biz_article.status        IS '状态（ArticleStatus，dict: article_status）：draft 草稿 / published 已发布 / offline 已下线';
COMMENT ON COLUMN biz_article.cover_file_id IS '封面文件 ID（sys_file.id）；NULL 表示无封面';
COMMENT ON COLUMN biz_article.extra         IS '扩展属性，JSON 对象';
COMMENT ON COLUMN biz_article.version       IS '乐观锁版本，修改时递增';

-- 同栏目未删除文章标题唯一
CREATE UNIQUE INDEX uq_biz_article_title ON biz_article (column_id, title) WHERE deleted_at IS NULL;
-- 栏目文章列表（按状态、创建时间倒序分页）
CREATE INDEX idx_biz_article_column ON biz_article (column_id, status, created_at DESC, id DESC);
```

模块入口 `docs/DDL/NN-内容管理.sql`：

```sql
-- =============================================================================
-- NN 内容管理：模块入口脚本
-- 依赖：00-公共基础初始化.sql
-- 执行：psql -X -v ON_ERROR_STOP=1 -1 -f docs/DDL/NN-内容管理.sql
-- =============================================================================

\ir NN-内容管理/biz_article_column.sql
\ir NN-内容管理/biz_article.sql
```

## 8. 改表与迁移

1. 修改表文件，使其保持最终结构（列、CHECK、索引、COMMENT 一起改）。
2. 已有数据的环境在 `migration/<日期>-<说明>/<表名>.sql` 写增量脚本：先写只读预检（如 `WHERE col !~ '^\d+$'`），再在单事务内 `ALTER`；`ALTER COLUMN TYPE` 会持有 ACCESS EXCLUSIVE 锁，注明低峰执行。
3. 类型变更后，引用该列的 CHECK / 部分索引可能保留旧的 `::text` 转换，需按表文件定义重建。
4. 同步修改 Entity（`type`）、DTO 校验、dict 与功能设计文档。

## 9. 完成检查

- [ ] 一表一文件，入口脚本已 `\ir` 新文件，执行顺序正确。
- [ ] 文件四段结构完整（头注释 → 建表 → 注释 → 索引），列与注释已对齐、无尾随空格。
- [ ] 所有 ID 列为 `BIGINT`；无 `REFERENCES`。
- [ ] 每张表、每个字段都有 `COMMENT ON`；枚举注释与 `CHECK` 取值、TS enum、dict 一致。
- [ ] 每个索引都有用途注释；并发唯一性已由唯一索引兜底。
- [ ] 开发库已同步（结构 + 注释），并完成比对：用入口脚本在临时 schema 重建，与目标 schema 比对列、约束、索引、注释后删除临时 schema。

注释覆盖自查（应返回 0 行）：

```sql
SELECT c.relname AS table_name, a.attname AS column_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('biz_article')          -- 本次涉及的表
  AND d.description IS NULL;
```

## 相关 skill

- `design-database-entity` / `entity-base` — Entity 与 DDL 一一对应，ID 列 `type: 'bigint'`
- `dict-json` — 枚举字典分片 `public/dict/<key>.json`
- `write-feat-design` — 功能设计中的字段表与 DDL 保持一致
