---
name: module-organization
description: 业务模块目录组织（dto/vo/controller/service/vo-transform/module）、Controller/Service 实现流程、接口文档与功能设计文档。
tags: [module, structure, controller, service]
group: 横切能力
---

# 业务模块组织与实现

本节说明一个 NestJS 业务模块的目录组织与 Controller/Service 标准实现流程。Service 不依赖 vo-transform。

## 目录组织

```text
src/<module>/
  dto/                       # 入参 DTO（class-validator 校验）
  vo/                        # VO class（@Exclude/@Expose/@Transform）
  <module>.controller.ts     # 取 ALS + 调 Service + vo-transform，不写复杂业务
  <module>.service.ts        # 上下文无关、interface 入参、查询分层
  <module>.vo-transform.ts   # plainToInstance 把 Service DTO 转 VO
  <module>.module.ts
```

| 文件 | 允许 | 禁止 |
| - | - | - |
| controller | 取 ALS、调 Service、vo-transform、ApiResBody 返回 | 复杂业务逻辑 |
| service | 业务逻辑、查询、缓存、BizError | ThreadLocal、依赖 vo-transform、构造展示态 |
| vo-transform | plainToInstance 转 VO | 业务逻辑 |

## Controller 实现七步

1. 路由与参数（Query 定位，禁止 @Param，见 [RESTful 风格](./restful-style)）
2. 身份与权限（`@IdentityRequired` / `@PermissionRequired`）
3. DTO 校验（见 [DTO 校验](./dto-validation)）
4. 上下文（ThreadLocal 取 account/identity/searcher 后显式断言）
5. Service 调用（interface 入参）
6. 响应封装与 VO（`ApiResBody.of(toXxxVo(...))`）
7. 异常（Service 抛 BizError，Filter 自动封装）

## Service 实现要点

```typescript
async findPage(param: FindXxxPageParam): Promise<IPageData<XxxEntity>> {
  // 查重/前置校验抛 BizError → 查询（leftJoinAndSelect + 范围 + dataScopeEngine + 分页）
  // → 缓存包裹（cacheService.wrap）→ 返回实体聚合
}
```

## 接口文档与功能设计文档

| 文档 | 位置 | 说明 |
| - | - | - |
| 接口文档 | `docs/api-schema/{端}/{module}.md` | 一模块一文件，TS 类型内联，含鉴权/错误码/字段 |
| 功能设计 | `docs/feat-design/` | 强制章节：定位/字段/枚举/能力/模块/接口/其他 |

## 规范要点

| 场景 | 做法 |
| - | - |
| 目录 | dto/ + vo/ + controller/service/vo-transform/module |
| Controller | 取 ALS 传 Service，vo-transform 转 VO |
| Service | 上下文无关，返回实体聚合 |
| 文档 | 接口文档 + 功能设计同步维护 |

## 权威源

- skill：[`organize-nestjs-module`](../skills/composite/organize-nestjs-module)、[`implement-controller`](../skills/composite/implement-controller)、[`implement-service`](../skills/composite/implement-service)、[`design-api-doc`](../skills/composite/design-api-doc)、[`write-feat-design`](../skills/composite/write-feat-design)
- 开发文档：`docs/development/intro.md`（<a href="../raw/docs/development/intro.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[序列化与 VO](./serialization-vo)、[Service 层范式](./service-paradigm)、[模块速查](../guide/module-cheatsheet)
