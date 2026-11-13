---
name: serialization-vo
description: 全局 ClassSerializeInterceptor 序列化、VO class 与 @Exclude/@Expose/@Transform、vo-transform 把 Service DTO 转 VO。
tags: [vo, serialization]
group: 接口与数据
---

# 序列化与 VO ⚠️ Strict

> ⚠️ Strict：本页为强约束，违反需审查。

工程全局启用 `ClassSerializeInterceptor`（基于 `class-transformer.instanceToPlain`），尊重类装饰器；之后 `DateSerializeInterceptor` 按 `x-timezone` 头统一格式化 Date 字段。接口返回默认用 VO class。

## VO 装饰器

```typescript
import { Exclude, Expose, Transform } from 'class-transformer';

export class XxxVo {
  @Expose() id!: string;
  @Expose() name!: string;
  @Exclude()           // 排除敏感字段
  password?: string;
  @Transform(({ value }) => value ? '启用' : '停用')
  statusText!: string;
}
```

## Entity-Extension VO 模式

继承 Entity 写 VO，复用字段定义并叠加展示态：

```typescript
export class XxxVo extends XxxEntity {
  @Expose() deptName?: string;   // 关联字段在 vo-transform 中装配
}
```

## DTO → VO 分层

Service 返回 Entity/DTO 聚合，模块内 `vo-transform` 用 `plainToInstance` 转 VO，Controller 调用：

```typescript
// xxx.vo-transform.ts
export function toXxxVo(data: XxxEntity & { deptName?: string }): XxxVo {
  return plainToInstance(XxxVo, data, { excludeExtraneousValues: true });
}

// Controller
const entity = await this.xxxService.findOne(id);
return ApiResBody.of(toXxxVo(entity));
```

> ⚠️ Strict：VO 必须是 class，禁止用 interface 作为最终 HTTP 返回类型；禁止直接 `return` 普通对象充当 VO；Service 不依赖 vo-transform（见 [Service 层范式](./service-paradigm)）。

## 规范要点

| 场景 | 做法 |
| - | - |
| 接口返回 | VO class + `@Expose`/`@Exclude`/`@Transform` |
| Entity 复用 | Entity-Extension VO 模式 |
| DTO→VO | 模块内 `vo-transform` + `plainToInstance` |
| Service | 不依赖 vo-transform，返回实体聚合 |

## 权威源

- skill：[`serialization-vo`](../skills/atomic/serialization-vo)、[`organize-nestjs-module`](../skills/composite/organize-nestjs-module)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[业务模块组织与实现](./module-organization)、[Service 层范式](./service-paradigm)
