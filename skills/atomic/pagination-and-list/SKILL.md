---
name: pagination-and-list
description: 分页用 PaginationDTO+IPageData，Service 方法名含 Page；列表用 ListLimitDto+IListData；简单下拉用 simple-list 返回 id+name；分页与列表严格区分接口。
type: atomic
tags: [pagination, list]
strict: true
when_to_use: 关键词 — pagination, list, simple-list, IPageData, IListData, PaginationDTO, ListLimitDto
---


# 分页 / 列表 / 简单列表 ⚠️ Strict

## 1. 分页 (Page)

**用于数据量大、需要翻页的场景。**

```typescript
import { PaginationDTO, IPageData } from '@qyy-code-lego/nestjs/core/Pagination';
```

| 规则 | 内容 |
| - | - |
| 入参 | Controller 用 `PaginationDTO` 接收 `page`/`pageSize` |
| 返回 | 必须 `IPageData<T> = { rows, total, page, pageSize }` |
| 命名 | Service 方法必须含 `Page`（`findAccountPage`），禁用 `findAccountList` |
| 签名 | Service **分页参数单独传**，不要把整个 DTO 透给 Service |

```typescript
// Controller
@Get('page')
async findAccountPage(
  @Query() queryDto: AccountQueryDTO,
  @Query() pagination: PaginationDTO,
): Promise<ApiResBody<IPageData<OpAccount>>> {
  const result = await this.accountService.findAccountPage(
    queryDto, pagination.page, pagination.pageSize,
  );
  return ApiResBody.of(result);
}

// Service
async findAccountPage(query: AccountQueryDTO, page: number, pageSize: number): Promise<IPageData<OpAccount>> {
  const qb = this.accountRepository.createQueryBuilder('account');
  if (query.username) qb.andWhere('account.username LIKE :u', { u: `%${query.username}%` });
  const [rows, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
  return { rows, total, page, pageSize };
}
```

## 2. 列表 (List)

**用于数据量可控的场景**（管理后台基础配置、字典等）。

| 规则 | 内容 |
| - | - |
| 入参 | DTO **必须 extends `ListLimitDto`**（提供 `limit`，默认 10） |
| 返回 | 推荐 `IListData<T>` |
| 子资源参数 | URL 含父资源时（如 `/role/admins`），父 ID 用具名（`roleId`）而非通用 `id` |

```typescript
export class RoleAdminQueryDTO extends ListLimitDto {
  @IsString() roleId: string;
}

@Get('admins')
async listAdmins(@Query() query: RoleAdminQueryDTO) {}
```

## 3. 简单列表 (Simple List)

**仅返回 `id`/`name` 用于下拉、级联**。

| 规则 | 内容 |
| - | - |
| 路径 | `GET /xxx/simple-list` |
| 返回 | `{ id, name }[]` 扁平结构 |
| 入参 | 仅 `limit` 与基础关键词过滤 |

```typescript
export class SimpleItemDTO { id: string; name: string; }
```

## 4. Page vs List 区分

> 分页是分页，列表是列表。同一资源同时提供两者时分别命名 `/page` 与 `/list`。**禁止混淆**。

## 相关 skill

- `restful-style` — Query 参数定位资源
- `service-paradigm` — Service 查询分层
