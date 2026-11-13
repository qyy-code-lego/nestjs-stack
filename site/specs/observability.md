---
name: observability
description: 进程健康检查 HealthModule（liveness/readiness）、日志文件落盘 setupAppLogger、HTTP 请求日志 RequestLogsModule 两个通道。
tags: [health, log, request-log, observability]
group: 横切能力
---

# 可观测性（健康/日志/请求日志）

本节聚合三项运维能力：进程健康检查、应用日志文件落盘、HTTP 请求日志。三者均默认关闭或可选，由 env/模块 Options 驱动启用。

## 健康检查 HealthModule

`HealthModule.forRoot()` 暴露 liveness / readiness 两端（`/health`、`/health/ready`）。业务用 `@HealthIndicator()` 实现 `HealthCheck`，`DiscoveryService` 自动发现并汇入 readiness；每个检查 `Promise.race` 超时保护，不拖垮接口。

```typescript
@HealthIndicator()
export class XxxCheck implements HealthCheck {
  async check(): Promise<HealthCheckResult> { /* ... */ }
}
```

健康端点需 `@Public()` 跳过 JWT；带全局前缀时 exclude `['health','health/ready']`。

## 日志文件落盘 setupAppLogger

默认关闭，由 `APP_LOG_FILE_*` env 驱动，异步滚动文件：

| 配置项 | 说明 |
| - | - |
| enabled | 是否启用 |
| format | json（推荐）/ text |
| size / interval | 按大小/时间翻转，gzip 压缩 |
| captureStd | 是否捕获 std |

落盘失败自动降级为仅控制台；在 `main.ts` 用 `setupAppLogger(app, appConfig.logFile)` 取代 `app.useLogger`。

## HTTP 请求日志 RequestLogsModule

两个独立通道，各自独立开关：访问日志（accessLog）与持久化（persist）。

| 装饰器/选项 | 作用 |
| - | - |
| `@IgnoreRequestLog()` | 跳过全部请求日志 |
| `@CaptureRequestLogBody()` | 控制 body 采集 |
| `ignorePaths` / `skip` | 按条件统一跳过 |
| `maskedHeaders` | 默认脱敏 authorization/cookie |

落库失败只 `warn`，不阻断请求。接入支持同步/异步两种方式。

> ⚠️ 关键约束：访问日志与持久化是两个通道，分别开关；敏感头默认脱敏，不要在 body 采集里暴露密钥。

## 规范要点

| 场景 | 做法 |
| - | - |
| 探活 | `/health`（liveness）、`/health/ready`（readiness） |
| 业务健康检查 | `@HealthIndicator` + `HealthCheck` |
| 文件日志 | `setupAppLogger`，env 驱动 |
| 请求日志 | `RequestLogsModule` 两通道，按需采集 body |

## 权威源

- skill：[`health-check`](../skills/atomic/health-check)、[`log-file`](../skills/atomic/log-file)、[`request-logging`](../skills/atomic/request-logging)
- 开发文档：`docs/development/health-check.md`（<a href="../raw/docs/development/health-check.md" target="_blank" rel="noopener">原文</a>）、`docs/development/log-file.md`（<a href="../raw/docs/development/log-file.md" target="_blank" rel="noopener">原文</a>）、`docs/development/request-log.md`（<a href="../raw/docs/development/request-log.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[应用启动与 main.ts](./app-bootstrap)、[配置体系](./config)
