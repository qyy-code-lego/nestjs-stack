---
name: restful-style
description: 禁止 Path 参数定位资源、ID 一律 Query 传、修改类 DTO 不携带 id、PATCH/PUT 必须返回完整对象。
tags: [rest, controller]
group: 接口与数据
---

# RESTful 风格 ⚠️ Strict

> ⚠️ Strict：本页为强约束，违反需审查。

本工程对 RESTful 风格有三条硬性约束，目的是让资源定位统一、修改语义清晰。

## 1. 禁止 Path 参数定位资源

ID 一律用 Query 传，不用 Path 参数：

```typescript
// ✅ 正确：Query 定位
@Get()
findPage(@Query() q: QueryXxxDto) {}

@Patch()
update(@Query('id') id: string, @Body() dto: UpdateXxxDto) {}

// ❌ 错误：Path 参数定位资源
@Get(':id')
findOne(@Param('id') id: string) {}
```

## 2. 修改类 DTO 不携带 id

URL 定位资源 + Body 提供内容。修改 DTO 即便含 id 字段也不使用：

```typescript
export class UpdateXxxDto {
  // ❌ 不应在此声明 id
  name!: string;
  status!: ObjectActiveStatus;
}
```

## 3. PATCH/PUT 必须返回完整对象

修改类接口必须返回更新后的完整对象，不返回 `null` / `void`：

```typescript
@Patch()
@ApiOperation({ summary: '更新' })
async update(@Query('id') id: string, @Body() dto: UpdateXxxDto): Promise<ApiResBody<XxxVo>> {
  const data = await this.xxxService.update(id, dto);
  return ApiResBody.of(data);
}
```

## 规范要点

| 场景 | 做法 |
| - | - |
| 资源定位 | Query 传 ID，禁止 `@Param` |
| 修改 DTO | 不携带 id |
| PATCH/PUT 返回 | 完整对象，不返回 null/void |

## 权威源

- skill：[`restful-style`](../skills/atomic/restful-style)、[`implement-controller`](../skills/composite/implement-controller)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[分页 / 列表 / 简单列表](./pagination-list)、[统一响应体与异常](./response-error)
