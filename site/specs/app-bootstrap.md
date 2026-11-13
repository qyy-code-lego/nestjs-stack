---
name: app-bootstrap
description: app 的 main.ts 推荐写法、根 Module 必备组合、日志落盘 setupAppLogger 与健康检查接入。
tags: [bootstrap, main, module, logger, health]
group: 架构与请求
---

# 应用启动与 main.ts

本节说明一个 app 的启动流程与根 Module 必备组合。启动参数一律从 `AppConfig` 取，禁止散落 `process.env`。配置体系见 [配置体系](./config)。

## main.ts 推荐写法

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AllConfig>);
  const appConfig = config.get('app')!;

  connectGlobalGuards(app);                       // 注入五环 Guard
  if (appConfig.apiPrefix) app.setGlobalPrefix(appConfig.apiPrefix);
  await setupAppLogger(app, appConfig.logFile);   // 取代 app.useLogger，env 驱动文件落盘

  // 微服务（按需）
  // MqModule.connectMicroservices(app);
  // await app.startAllMicroservices();

  await app.listen(appConfig.port, appConfig.host);
}
void bootstrap();
```

> ⚠️ 关键约束：启动参数（port/host/apiPrefix/logger）必须从 `ConfigService<AllConfig>` 取 `app.*`，禁止直接 `process.env.PORT`。

## 根 Module 必备组合

```typescript
@Module({
  imports: [
    configModuleImport({ configs: [datasourceConfig, mqConfig], envName: 'playground' }),
    ...applyTypeOrmDs({ configKey: 'datasource', datasourceNameList: ['default'] }),
    GlobalModule,              // Filter/Pipe/Interceptor + ThreadLocal + Cache + Dictionary + File
    CoreEntityFeatureModule,   // TypeOrmModule.forFeature(全部核心实体)
    AccountDeserializeModule,  // account 挂载 Guard
    IdentityRequiredModule,    // 身份校验 Guard
    PermissionModule,          // 权限拦截 Guard
    RedisModule,               // @Global RedisService
    JwtAuthModule.forRoot(),   // @Global JWT + Session + Passport
  ],
})
export class AppModule {}
```

imports 顺序有语义：配置 → 数据源 → 基础设施 → 业务。`configModuleImport` 内置注册 app/file/redis/session/jwt 配置；`applyTypeOrmDs` 注册数据源。

## 日志落盘 setupAppLogger

`setupAppLogger(app, appConfig.logFile)` 默认关闭、由 `APP_LOG_FILE_*` env 驱动，支持 json/text 格式、按大小/时间滚动、gzip 压缩；落盘失败自动降级为仅控制台。带全局前缀的 app 需 exclude 健康检查路径。

## 健康检查

`HealthModule.forRoot()` 暴露两个端点：

| 路径 | 类型 | 说明 |
| - | - | - |
| `/health` | liveness | 极轻量，进程存活即可 |
| `/health/ready` | readiness | 含 DB/Redis/业务检查 |

```typescript
@HealthIndicator()                          // 业务扩展 hook，DiscoveryService 自动汇入 readiness
export class MyCheck implements HealthCheck { async check() { /* ... */ } }
```

健康端点需 `@Public()` 跳过 JWT；带全局前缀时 exclude `['health','health/ready']`。

## 规范要点

| 场景 | 做法 |
| - | - |
| 启动参数 | 从 `ConfigService<AllConfig>` 取 `app.*` |
| 日志 | 用 `setupAppLogger`，不用裸 `app.useLogger` |
| 根 Module | 按配置→数据源→基础设施→业务顺序组合 |
| 多 app | 每个 app 独立 PORT 与 REDIS_KEY_PREFIX |

## 权威源

- skill：[`app-bootstrap-main`](../skills/atomic/app-bootstrap-main)、[`app-module-composition`](../skills/atomic/app-module-composition)、[`log-file`](../skills/atomic/log-file)、[`health-check`](../skills/atomic/health-check)、[`create-new-app`](../skills/composite/create-new-app)
- 开发文档：`docs/development/log-file.md`（<a href="../raw/docs/development/log-file.md" target="_blank" rel="noopener">原文</a>）、`docs/development/health-check.md`（<a href="../raw/docs/development/health-check.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[配置体系](./config)、[可观测性](./observability)
