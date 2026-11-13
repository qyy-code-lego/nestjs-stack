---
name: restful-style
description: 禁止用 Path 参数定位资源，ID 一律 Query 传；修改类 DTO 不携带 id（即便有也不使用）；PATCH/PUT 必须返回更新后的完整对象，不返回 null。
type: atomic
tags: [rest, controller]
strict: true
when_to_use: 关键词 — restful, controller, path-param, query-param, patch, update
---


# RESTful 风格规范 ⚠️ Strict

## 1. 禁止 Path 参数定位资源

资源标识（`id`/`xxxId`）必须以 Query 传。

```typescript
// ✅
@Patch()  async update(@Query('id') id: string, @Body() dto: UpdateDTO) {}
@Delete() async remove(@Query('id') id: string) {}
@Get('detail') async detail(@Query('id') id: string) {}

// ❌
@Patch(':id') async update(@Param('id') id: string, @Body() dto: UpdateDTO) {}
```

## 2. 修改类 DTO 不携带 id

修改接口 ID 来源**只能是 Query**；DTO 即便定义 `id`，Service 也不能据此定位资源。

```typescript
// ✅
export class UpdateAccountDTO {
  @IsOptional() @IsString() nickname?: string;
}

@Patch()
async updateAccount(@Query('id') id: string, @Body() dto: UpdateAccountDTO) {
  return this.service.updateAccount(id, dto);
}

// ❌ DTO 携带 id
export class UpdateAccountDTO {
  id: string;
  nickname?: string;
}
```

职责分离：URL 定位资源，Body 提供修改内容。

## 3. 更新接口必须返回完整对象

PATCH/PUT 完成后**必须返回更新后的完整对象**，不允许返回 `null` / `void`。前端可直接更新本地状态，无需重新拉详情。

## 相关 skill

- `dto-validation` — DTO 字段校验
- `pagination-and-list` — Query 参数承载分页/筛选
- `serialization-vo` — 返回 VO 时的转换
