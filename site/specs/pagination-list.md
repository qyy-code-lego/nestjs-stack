---
name: pagination-list
description: 分页 PaginationDTO+IPageData、列表 ListLimitDto+IListData、简单列表 simple-list 返回 id+name，三者严格区分。
tags: [pagination, list]
group: 接口与数据
---

# 分页 / 列表 / 简单列表 ⚠️ Strict

> ⚠️ Strict：本页为强约束，违反需审查。

本工程严格区分「分页」「列表」「简单列表」三种查询接口，禁止混淆。同一资源同时提供分页与列表时分别命名 `/page` 与 `/list`。

## 分页（Page）

入参 `PaginationDTO`，返回 `IPageData`，Service 方法名必须含 `Page`：

```typescript
@Get('/page')
findPage(@Query() q: PaginationDTO & QueryXxxDto): Promise<ApiResBody<IPageData<XxxVo>>> {}

// Service
async findPage(param: FindXxxPageParam): Promise<IPageData<XxxEntity>> {
  const [list, total] = await qb.skip(...).take(...).getManyAndCount();
  return { list, total, ... };
}
```

## 列表（List）

DTO extends `ListLimitDto`，返回 `IListData`：

```typescript
export class ListXxxDto extends ListLimitDto { /* 业务筛选字段 */ }

@Get('/list')
findList(@Query() q: ListXxxDto): Promise<ApiResBody<IListData<XxxVo>>> {}
```

## 简单列表（Simple List）

下拉场景用 `simple-list`，只返回 `id` + `name`：

```typescript
@Get('/simple-list')
findSimpleList(): Promise<ApiResBody<{ id: string; name: string }[]>> {}
```

## Page vs List 区别

| 维度 | 分页 Page | 列表 List |
| - | - | - |
| 是否带分页元信息 | 是（total/page/size） | 否（仅 limit 截断） |
| 适用场景 | 后台表格、带总数翻页 | 级联选择、固定上限取数 |
| 返回类型 | `IPageData` | `IListData` |
| Service 方法名 | 含 `Page` | 不含 `Page` |

## 规范要点

| 场景 | 入参 | 返回 | 命名 |
| - | - | - | - |
| 分页 | `PaginationDTO` | `IPageData` | `/page`，Service 方法含 `Page` |
| 列表 | `ListLimitDto` 子类 | `IListData` | `/list` |
| 下拉 | 无 / 极简 | `{id,name}[]` | `/simple-list` |

> ⚠️ 关键约束：Service 分页参数单独传，不把整个 DTO 透给 Service（见 [Service 层范式](./service-paradigm)）。

## 权威源

- skill：[`pagination-and-list`](../skills/atomic/pagination-and-list)、[`design-sql-query`](../skills/composite/design-sql-query)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[TypeORM 查询设计](./sql-query)、[RESTful 风格](./restful-style)
