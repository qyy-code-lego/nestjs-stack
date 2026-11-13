---
name: dto-validation
description: class-validator/class-transformer 校验请求 DTO、时间字段 @ToDate、枚举 @IsEnum、范围查询 @ParseRange/@ParseDateTimeRange。
tags: [dto, validation, range]
group: 接口与数据
---

# DTO 校验与范围查询

请求 DTO 用 `class-validator` + `class-transformer` 校验，全局 `ValidationPipeWithTransform`（`whitelist: true`，自动删除未装饰字段）自动执行。本节覆盖常用装饰器与范围查询。

## 基础校验

```typescript
import { IsEnum, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ToDate, EnsureNotBlank, parseBooleanGeneral, ObjectActiveStatus } from '@qyy-code-lego/nestjs/common';

export class CreateXxxDto {
  @EnsureNotBlank()                  // 非空字符串，优于裸 @IsNotEmpty
  name!: string;

  @ToDate()                          // 时间字段必须，否则 timestamptz 写入异常
  startAt!: Date;

  @IsEnum(ObjectActiveStatus)        // 枚举字段必须声明枚举对象类型
  status!: ObjectActiveStatus;

  @IsObject()
  @ValidateNested()
  @Type(() => InnerDto)              // 嵌套对象必须 @Type + @ValidateNested
  inner!: InnerDto;

  enabled = parseBooleanGeneral;     // 布尔字段用通用解析器
}
```

| 字段类型 | 装饰器 |
| - | - |
| 非空字符串 | `@EnsureNotBlank()` |
| 时间 | `@ToDate()`（必须） |
| 枚举 | `@IsEnum(枚举对象)` + 字段声明为枚举类型 |
| 布尔 | `parseBooleanGeneral` |
| 嵌套对象 | `@IsObject` + `@ValidateNested` + `@Type(() => X)` |

> ⚠️ 关键约束：时间字段漏 `@ToDate` 会导致 timestamptz 写入异常；通用启停状态优先复用 `ObjectActiveStatus`。

## 范围查询

范围字段用 `@ParseRange` / `@ParseDateTimeRange`，声明为可选数组，开区间通过留空的逗号分隔字符串支持：

```typescript
export class QueryXxxDto {
  @ParseRange()              // 声明为可选数组
  amount?: [number | null, number | null];

  @ParseDateTimeRange()
  createdAt?: [Date | null, Date | null];
}
// 请求 ?amount=,100  → [null, 100]   开区间 ≤100
// 请求 ?amount=50,   → [50, null]    开区间 ≥50
```

Service 按数组元素是否存在拼条件（详见 [TypeORM 查询设计](./sql-query)）：

```typescript
if (amount?.[0] != null) qb.andWhere('t.amount >= :min', { min: amount[0] });
if (amount?.[1] != null) qb.andWhere('t.amount <= :max', { max: amount[1] });
```

## 规范要点

| 场景 | 做法 |
| - | - |
| 时间字段 | 必须 `@ToDate` |
| 枚举 | `@IsEnum(枚举对象)`，字段类型为枚举 |
| 嵌套对象 | `@Type` + `@ValidateNested` |
| 范围 | `@ParseRange`/`@ParseDateTimeRange`，可选数组 |

## 权威源

- skill：[`dto-validation`](../skills/atomic/dto-validation)、[`range-query`](../skills/atomic/range-query)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[RESTful 风格](./restful-style)、[TypeORM 查询设计](./sql-query)
