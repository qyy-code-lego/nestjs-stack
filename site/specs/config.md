---
name: config
description: AllConfig 命名空间、ConfigService 类型化读取、registerAs 扩展、env 约定与运行时配置 sys_runtime_config。
tags: [config, allconfig, env, runtime]
group: 架构与请求
---

# 配置体系

本工程配置分两层：**进程配置**（env/yaml，启动期）与 **运行时配置**（`sys_runtime_config` 表，后台改完即时生效）。统一通过 `ConfigService<AllConfig>` 类型化读取，禁止直接 `process.env.X`。

## AllConfig 命名空间

通过 `declare global` 扩展 `AllConfig` 接口定义命名空间类型（`libs/common/src/config/config.interface.ts`）：

```typescript
declare global {
  interface AllConfig {
    app: AppConfig;                               // port/apiPrefix/name/host/logger/requestLogs/logFile/health
    session: SessionConfig;                       // maxTime/debounceTime/kickOutEnable
    datasource: Record<string, DataSourceConfig>; // { default: { type/host/port/... } }
    file: FileConfig;                             // local: { storageRoot/serveRoot/... }
    questionBank: QuestionBankConfig;
  }
}
```

扩展新命名空间：`declare global` 同名 interface 合并 → `registerAs` 注册 → `configModuleImport` 传入。

## ConfigService 读取

```typescript
constructor(private readonly config: ConfigService<AllConfig>) {}

this.config.get<number>('app.port')!;                   // 点路径取嵌套字段
this.config.getOrThrow<string>('jwt.secret');           // 缺失即抛
this.config.get<string[]>('jwt.whiteList', []);         // 带默认值
```

## configModuleImport

```typescript
configModuleImport({ configs: [datasourceConfig, mqConfig], envName: 'playground' })
// → ConfigModule.forRoot({ isGlobal: true, load: [..configs, appConfig, fileConfig, redisConfig, sessionConfig, jwtConfig],
//                          envFilePath: ['./env/playground.local', './env/playground.env'] })
```

内置配置总是注册：app / file / redis / session / jwt。

## env 约定

| 约定 | 说明 |
| - | - |
| 文件位置 | `env/{appName}.env`（模板，可提交）、`env/{appName}.local`（本地覆盖，不提交） |
| 变量分组前缀 | PORT / APP_ / DATABASE_ / REDIS_ / JWT_ / KAFKA_ / RABBIT_ / FILE_ |
| REDIS_KEY_PREFIX | 必填，推荐 `nestjs-{appName}:` |
| .env.example | 新增/删除变量必须同步维护 |

```typescript
// 扩展命名空间示例
export default registerAs('myModule', () => ({
  foo: process.env.MY_MODULE_FOO ?? 'bar',
}));
```

> ⚠️ 关键约束：禁止在 `registerAs` 同步工厂里做异步或依赖注入；禁止把密钥/AK/SK 放进运行时配置。

## 运行时配置 sys_runtime_config

与 env/yaml 是两套东西，互不对等。`RuntimeConfigService` 异步读取 + Redis 缓存（TTL 300s），后台改完即时生效：

```typescript
const v = await runtimeConfigService.getValue<string>('biz.switch');
const strict = await runtimeConfigService.getValueOrThrow<number>('biz.threshold');
// 启动期用 ensure 幂等补齐依赖项
```

## 规范要点

| 场景 | 做法 |
| - | - |
| 读进程配置 | `ConfigService<AllConfig>` 点路径 |
| 扩展命名空间 | declare global 合并 + registerAs + configModuleImport |
| 运行时可调配置 | RuntimeConfigService，不放 env |
| env 变更 | 同步 `.env.example` |

## 权威源

- skill：[`config-service`](../skills/atomic/config-service)、[`config-namespaces`](../skills/atomic/config-namespaces)、[`env-config-conventions`](../skills/atomic/env-config-conventions)、[`runtime-config`](../skills/atomic/runtime-config)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[应用启动与 main.ts](./app-bootstrap)
