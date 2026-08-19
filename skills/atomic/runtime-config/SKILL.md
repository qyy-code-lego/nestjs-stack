---
name: runtime-config
description: 数据库驱动的运行时业务配置 SysRuntimeConfig —— 存 sys_runtime_config 表、异步读取带 Redis 缓存、后台改完即时生效；与 env/yaml 进程配置是两套东西，访问方式不同不可混用。
type: atomic
tags: [config, runtime, database, jsonb]
when_to_use: 关键词 — runtime-config, 运行时配置, 业务配置, 动态配置, sys_runtime_config, RuntimeConfigService, 不重启改配置, jsonb 配置
---


# 运行时业务配置（SysRuntimeConfig）

## 1. 先分清两套配置，别选错

工程里有**两套互不对等**的配置体系，判断标准是「改这个值要不要重启进程」：

| | 进程配置 | 运行时配置 |
| - | - | - |
| 载体 | `env/{app}.env`、yaml | `sys_runtime_config` 表（jsonb） |
| 读取 | `ConfigService<AllConfig>`，**同步** | `RuntimeConfigService`，**异步**（Redis 缓存） |
| 生效 | 启动期加载，改动需重启 | 后台改完即时生效 |
| 适用 | 连接串、端口、密钥、日志开关等基础设施参数 | 频繁调整的业务参数：阈值、开关、文案、默认参数包、白名单 |
| 规范 | `config-service` / `env-config-conventions` | 本 skill |

**禁止**把运行时配置塞进 `AllConfig` 命名空间，也**禁止**把数据库连接这类基础设施参数放进 `sys_runtime_config`。

## 2. 业务侧读取

注入 `RuntimeConfigService`（由 `RuntimeConfigModule` 导出，`CommonBusinessModule` 已传递导出）：

```typescript
import { Injectable } from '@nestjs/common';
import { RuntimeConfigService } from '@qyy-code-lego/nestjs/core';

interface GenerationDefaults {
  retryLimit: number;
  timeoutMs: number;
}

@Injectable()
export class GenerationService {
  constructor(private readonly runtimeConfig: RuntimeConfigService) {}

  async dispatch() {
    // 不存在或已停用时返回传入的缺省值
    const defaults = await this.runtimeConfig.getValue<GenerationDefaults>(
      'generation.defaults',
      { retryLimit: 3, timeoutMs: 60_000 },
    );

    // 缺配置就该直接失败的场景
    const whitelist =
      await this.runtimeConfig.getValueOrThrow<string[]>('generation.whitelist');

    // 一次取多个，减少往返
    const values = await this.runtimeConfig.getValues([
      'generation.defaults',
      'generation.whitelist',
    ]);
  }
}
```

要点：

- 泛型只做**调用侧类型断言**，不做运行时校验。库里的 JSON 由后台人工维护，对结构有强要求时自己兜底（给 fallback、做 guard）。
- `status = disabled` 的配置项在读取侧等同于**不存在**，返回 fallback。
- 缓存 TTL 300 秒，写操作自动失效对应 key；不要自己再包一层缓存。
- **不要**直接注入 `Repository<SysRuntimeConfigEntity>` 绕过缓存与失效逻辑。

## 3. 声明代码依赖的配置项

代码里新依赖一个配置项时，用 `ensure` 在启动期幂等补齐，避免手写 SQL 初始化：

```typescript
@Injectable()
export class GenerationBootstrap implements OnModuleInit {
  constructor(private readonly runtimeConfig: RuntimeConfigService) {}

  async onModuleInit() {
    await this.runtimeConfig.ensure([
      {
        code: 'generation.defaults',
        name: '生成默认参数',
        group: 'generation',
        remark: '生成任务的重试与超时缺省值',
        defaultValue: { retryLimit: 3, timeoutMs: 60_000 },
      },
    ]);
  }
}
```

`ensure` 的语义：不存在则按 `defaultValue` 建并标记 `builtin`；**已存在则不覆盖 value**，只同步名称 / 分组 / 备注 / schema。内置项禁止删除，只能停用。

## 4. 后台维护接口（开箱即用）

`RuntimeConfigAdminModule` 提供整套通用端点，消费工程 import 即可（`CommonBusinessModule` 已内置），无需自写 Controller：

| 方法 | 路径 | 权限码 |
| - | - | - |
| GET | `/runtime-config/page` | `runtime-config:list` |
| GET | `/runtime-config/detail?code=` | `runtime-config:list` |
| GET | `/runtime-config/groups` | `runtime-config:list` |
| POST | `/runtime-config` | `runtime-config:create` |
| PATCH | `/runtime-config?code=` | `runtime-config:update` |
| PATCH | `/runtime-config/value?code=` | `runtime-config:update` |
| DELETE | `/runtime-config?code=` | `runtime-config:delete` |

均限定 `IdentityType.OP_USER` + `PermissionGuard`。消费工程需要自行往 `op_permission` 表 seed 这 4 个权限码。

`PATCH /runtime-config/value` 是后台 JSON 编辑器的保存入口，body 带 `expectedVersion` 做乐观锁：与库中 `version` 不一致时返回 409，提示刷新后重试。

## 5. 字段约定

- `code`：主键，建议点分命名（`generation.defaults`），只允许字母数字点下划线中划线。
- `group`：分组，实际列名是 `group_code`（`group` 是 PG 保留字）。QueryBuilder 里用属性名 `runtimeConfig.group`，**原始 select 必须写 `group_code`**。
- `value_type`：`object/array/string/number/boolean`，只是给后台挑编辑器形态的提示，不参与后端校验。
- `value_schema`：可选 JSON Schema，供后台编辑器提示，后端同样不强制校验。
- `version`：改 value 时自增，用于乐观锁。

## 6. 不要做

- 不要在 `registerAs` 工厂里读运行时配置（工厂是同步的，且启动期数据库未必就绪）。
- 不要把密钥、AK/SK 放进来——本表的值会原样回给后台前端，没有脱敏。密钥走 env 或 `sys_oss_config` 那类专用表。
- 不要在热路径里对同一 code 反复 `getValue` 却又自己加内存缓存，Redis 那层已经够了；真要减少往返用 `getValues` 批量取。

## 相关 skill

- `config-service` — 进程配置体系，与本 skill 互斥关系
- `env-config-conventions` — env 命名与配置来源
- `redis-kv` — 缓存读写约定
- `permission-rbac` — 权限码校验
- `entity-base` — 实体基类与 extendable mixin
