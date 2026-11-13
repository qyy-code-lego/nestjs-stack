---
name: request-lifecycle
description: NestJS 请求生命周期、全局 Filter/Pipe/Interceptor 注册位置、Guard 链顺序与 ThreadLocal(ALS) 上下文。
tags: [lifecycle, filter, pipe, interceptor, guard, als]
group: 架构与请求
---

# 请求生命周期与上下文

本节说明一次请求经过的全局基础设施及其执行顺序，以及如何通过 ThreadLocal(ALS) 在请求生命周期内取上下文。全局响应封装见 [统一响应体与异常](./response-error)。

## 全局基础设施注册

全局 Filter/Pipe/Interceptor 通过 `GlobalModule` 的 `APP_*` provider 注册（`libs/core/src/nest/global.module.ts`）：

```typescript
@Global()
@Module({
  imports: [ThreadLocalModule, CacheModule, DictionaryModule, CityModule, FileManagementModule],
  providers: [
    { provide: APP_FILTER,      useClass: CatchEverythingFilter },        // 全局异常过滤器
    { provide: APP_PIPE,        useClass: ValidationPipeWithTransform },  // 参数校验 + 转换
    { provide: APP_INTERCEPTOR, useClass: DateSerializeInterceptor },     // 日期格式化 + 时区
    { provide: APP_INTERCEPTOR, useClass: ClassSerializeInterceptor },    // class-transformer 序列化
  ],
})
export class GlobalModule {}
```

同级 `APP_INTERCEPTOR` 按注册顺序执行：`DateSerializeInterceptor` 先于 `ClassSerializeInterceptor`。

## Guard 链

全局 Guard 不走 `APP_GUARD`，而在 `main.ts` 调用 `connectGlobalGuards(app)` 注入，顺序固定（`libs/common/src/shared/guards/global-guards.module.ts`）：

| # | Guard | 职责 |
| - | - | - |
| 1 | JwtAuthGuard | JWT 校验，失败抛 JwtAuthException |
| 2 | SessionGuard | 会话校验（超时/踢出） |
| 3 | AccountDeserializeGuard | 解析 token 挂载 account 到 ThreadLocal |
| 4 | IdentityRequiredGuard | 按 `@IdentityRequired` 校验身份 |
| 5 | PermissionGuard | 按 `@PermissionRequired` 校验权限码 |

```typescript
// main.ts
connectGlobalGuards(app);                       // 默认五环全开
connectGlobalGuards(app, { guardMap: { permission: false } }); // 按需关闭某一环
```

## 执行顺序

```text
Middleware(ThreadLocal) → Guards(5环) → Interceptor(in) → Pipe → Controller
   → Interceptor(out: Date→ClassSerialize) → Filter(异常时封装为 ApiResBody)
```

## ThreadLocal (ALS) 上下文

`ThreadLocalMiddleware` 在请求入口建立 ALS 作用域并写入 `requestId`；各 Guard 逐步补充字段。Store 字段（core 与 common 两处声明合并）：

| 字段 | 来源 | 说明 |
| - | - | - |
| requestId | middleware（`x-request-id` 头） | 请求追踪 |
| account | AccountDeserializeGuard | 当前登录账号 |
| identity | IdentityRequiredGuard | 当前使用的身份 |
| roles / permissionCodes | PermissionGuard | 角色 / 权限码 |

```typescript
// 仅 Controller / Guard / Interceptor 层使用
constructor(private readonly threadLocal: ThreadLocal) {}
const account = this.threadLocal.get('account');   // ALS 取值后应第一时间显式断言类型（见 type-safety）
```

> ⚠️ Strict：Service 层禁止使用 ThreadLocal / Request / Response，避免上下文耦合。详见 [Service 层范式](./service-paradigm)。

## 规范要点

| 场景 | 做法 |
| - | - |
| 取请求上下文 | Controller 注入 ThreadLocal，取后显式断言类型传给 Service |
| 关闭某 Guard | `connectGlobalGuards(app, { guardMap: { xxx: false } })` |
| 全局异常封装 | 复用 CatchEverythingFilter，不自写 ExceptionFilter |
| Service 取上下文 | 禁止；由 Controller 显式传参 |

## 权威源

- skill：[`context-threadlocal`](../skills/atomic/context-threadlocal)、[`response-apiresbody`](../skills/atomic/response-apiresbody)、[`auth-identity-public`](../skills/atomic/auth-identity-public)
- 开发文档：`docs/development/intro.md`（<a href="../raw/docs/development/intro.md" target="_blank" rel="noopener">原文</a>）、`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[统一响应体与异常](./response-error)、[身份、权限与数据范围](./auth-permission)
