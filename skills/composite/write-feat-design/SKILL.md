---
name: write-feat-design
description: 在 docs/feat-design/ 下编写功能设计文档 — 遵循 design-guide.md 强制章节（字段/枚举定义/业务能力/模块/接口/其他注意事项），可用引用语法复用已有文档段落。
type: composite
tags: [design, docs]
when_to_use: 关键词 — feat-design, 功能设计, 需求, design-guide, 文档
---


# 编写功能设计文档

## 1. 文档位置

```
docs/feat-design/
├── design-guide.md          ← 规范（必读）
├── {功能名}.md              ← 独立功能（如：知识库管理.md）
└── {模块组}/
    └── {功能名}.md          ← 多子功能时按模块组织
```

**必须在 monorepo 根目录的 `docs/feat-design/` 下创建，不得放在 `server/docs/` 或其他位置。**

## 2. 强制章节结构

按以下固定顺序，缺一不可：

| 顺序 | 章节 | 核心内容 |
| - | - | - |
| 开头（无标题） | 1-2 句定位说明 | 功能定位、默认视图约束、与其他模块关系 |
| `## 字段` | 实体字段表 | 每个实体一个小节，字段名/类型/说明 |
| `## 枚举定义` | 枚举/字典 | 来源（`public/dict/<key>.json` 字典或业务 enum） |
| `## 业务能力` | 业务规则 | `###` 子节，每个操作一个子节 |
| `## 模块` | 命名空间 | NestJS Module 的命名标识 |
| `## 接口` | 接口列表 | 路径/方法/参数/错误码 |
| `## 其他注意事项` | 实现细节 | 编号列表 |

## 3. 引用复用规范

相同内容不重复写，用引用格式：

```markdown
> 同 [用户管理 - 字段](./用户管理.md#字段)，无差异。

> 基于 [用户管理 - 字段](./用户管理.md#字段)，差异如下：
> - 移除：`fieldName`（原因）
> - 新增：`fieldName`：说明
```

## 4. 接口通用约定（已有文档说明，不再重复）

- 禁止 path 参数，ID 一律 `?id=` query 传
- DELETE 无 body，批量 id 用 `?ids=1,2,3`
- 分页默认：`page=1`，`pageSize=20`
- 逻辑删除：写 `deleted_at`

## 5. 模板骨架

```markdown
# {功能名}

简短定位说明，1-2 句。

## 字段

### {实体名}（{表名}）

| 字段名 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | Snowflake ID |
| `tenantId` | `string` | 所属租户 |

## 枚举定义

### {枚举名}

| 值 | 说明 |
|---|---|
| `draft` | 草稿 |
| `published` | 已发布 |

## 业务能力

### {操作名}

- 业务规则 1
- 业务规则 2

## 模块

- {功能}采用 `{moduleName}` 作为命名空间

## 接口

路径前缀：`/{modulePath}`，认证：均需要医院管理端 JWT。

### {接口名}

- 方法：`GET / POST / PATCH / DELETE`
- 路径：`/{modulePath}/{sub-path}`
- 参数：...
- 返回：...
- 错误码：...

## 其他注意事项

1. ...
```

## 相关 skill

- `design-database-entity` — 数据库实体设计
- `write-ddl` — DDL SQL 编写
- `design-api-doc` — 接口文档（api-schema）
