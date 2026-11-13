---
name: response-error
description: 统一响应体 ApiResBody 结构、CatchEverythingFilter 自动封装、BizError 链式 codeAs/httpStatusAs/dataAs 与 BizCode。
tags: [response, apiresbody, error, bizerror]
group: 接口与数据
---

# 统一响应体与异常

API 响应统一为 `ApiResBody` 结构，由全局 `CatchEverythingFilter` 自动封装。Controller 只返回 data 部分，业务预期错误抛 `BizError`。

## ApiResBody 结构

`libs/core/src/ApiResBody.ts`：

```typescript
export class ApiResBody<T = Record<string, unknown>> {
  code: number;
  message?: string;
  data?: T | null;
  details?: any;
  fullUrl?: string;       // 由 ApiResBodyInterceptor 填充
  method?: string;

  static of<T = any>(): ApiResBody<T>                    // code=200, message="请求完成"
  static of<T = any>(data: T): ApiResBody<T>             // 同上 + data
  static ofWith<T = any>(code: number, message: string, data?: T): ApiResBody<T>
}
```

Controller 显式声明返回类型并用 `ApiResBody.of` 包裹：

```typescript
@Get()
async findOne(@Query('id') id: string): Promise<ApiResBody<XxxVo>> {
  return ApiResBody.of(await this.xxxService.findOne(id));
}
```

## BizError 业务异常

`libs/core/src/BizError.ts`，默认 httpStatus=400 / code=400，链式自定义：

```typescript
throw new BizError('身份已冻结').codeAs(40301).httpStatusAs(403);
throw new BizError('余额不足').codeAs(1001).dataAs({ balance: 0 });  // dataAs 携带业务数据写入错误响应 data
```

| 方法 | 作用 |
| - | - |
| `codeAs(n)` | 业务码 |
| `httpStatusAs(n)` | HTTP 状态 |
| `dataAs(d)` | 错误响应携带的业务数据 |

`BizCode` 枚举内置常用码：`BAD_REQUEST=400`、`UNAUTHORIZED=401`、`FORBIDDEN=403`、`NOT_FOUND=404`、`CONFLICT=409`、`INTERNAL_ERROR=500`、`SESSION_TIMEOUT=40111`、`SESSION_KICK_OUT=40112`。

> ⚠️ 关键约束：禁止直接 `throw new Error` 或 `HttpException` 表达业务异常；业务码应在团队内做枚举管理。

## CatchEverythingFilter 异常映射

`libs/core/src/nest/catch.filter.ts` 按顺序匹配并统一封装为 `ApiResBody`：

| 异常 | 映射 |
| - | - |
| `BizError` | 取其 httpStatus/code/message/data |
| `ValidationException` | 400 + 字段校验 message 拼接 |
| `JwtAuthException` | MISSING/INVALID/EXPIRED → 4001/4002/4003 |
| `HttpException` | 取其 status |
| TypeORM `QueryFailedError` | 唯一冲突 23505 → 409；其余 → 500 |
| 兜底 | 500 + "服务出错，请稍后重试"（不泄露堆栈） |

## 规范要点

| 场景 | 做法 |
| - | - |
| 正常返回 | Controller 返回 `ApiResBody.of(data)` |
| 业务预期错误 | 抛 `BizError`，链式 codeAs/httpStatusAs |
| 业务码 | 复用/扩展 `BizCode` 枚举 |
| 异常封装 | 复用 `CatchEverythingFilter`，不自写 |

## 权威源

- skill：[`response-apiresbody`](../skills/atomic/response-apiresbody)、[`biz-error`](../skills/atomic/biz-error)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[请求生命周期与上下文](./request-lifecycle)、[Service 层范式](./service-paradigm)
