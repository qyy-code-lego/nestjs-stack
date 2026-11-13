# 新建工程

本指南说明在 monorepo 内新增一个 app 的全流程。每个 app 独立 PORT 与 `REDIS_KEY_PREFIX`，复用 `libs/` 全部公共能力。

## 步骤总览

| # | 步骤 | 关键文件 |
| - | - | - |
| 1 | 注册 nest-cli 工程 | `nest-cli.json` |
| 2 | 建 tsconfig | `apps/<app>/tsconfig.app.json` |
| 3 | env 文件 | `env/<app>.env(.example)` |
| 4 | config 模块 | `apps/<app>/src/config/datasource.config.ts`、`mq.config.ts` |
| 5 | 根 Module | `apps/<app>/src/app.module.ts` |
| 6 | main.ts | `apps/<app>/src/main.ts` |
| 7 | package.json 脚本 | `dev:<app>` / `build:<app>` |
| 8 | 启动验证 | 健康检查端点 |
| 9 | 业务模块铺开 | dto/vo/controller/service/vo-transform/module |

## 根 Module 组合

```typescript
@Module({
  imports: [
    configModuleImport({ configs: [datasourceConfig, mqConfig], envName: '<app>' }),
    ...applyTypeOrmDs({ configKey: 'datasource', datasourceNameList: ['default'] }),
    GlobalModule,
    CoreEntityFeatureModule,
    AccountDeserializeModule,
    IdentityRequiredModule,
    PermissionModule,
    RedisModule,
    JwtAuthModule.forRoot(),
  ],
})
export class AppModule {}
```

详见 [应用启动与 main.ts](../specs/app-bootstrap)。imports 顺序：配置 → 数据源 → 基础设施 → 业务。

## env 约定

```bash
# env/<app>.env
PORT=25xx
APP_NAME=<app>
REDIS_KEY_PREFIX=nestjs-<app>:
DATABASE_HOST=...
JWT_SECRET=...
```

`env/<app>.env` 为可提交模板，`env/<app>.local` 为本地覆盖（不提交）。变量按模块前缀分组，必须同步 `.env.example`。详见 [配置体系](../specs/config)。

## 常见疏漏 checklist

- [ ] `nest-cli.json` 已注册新 app
- [ ] PORT 与 `REDIS_KEY_PREFIX` 与其他 app 不冲突
- [ ] 调试端口与其他 app 不同
- [ ] `env/<app>.env.example` 已同步
- [ ] 健康端点 `@Public()` 且带全局前缀时 exclude
- [ ] `tsconfig.app.json` 继承根并启用路径别名

## 权威源

- skill：[`create-new-app`](../skills/composite/create-new-app)、[`app-bootstrap-main`](../skills/atomic/app-bootstrap-main)、[`app-module-composition`](../skills/atomic/app-module-composition)、[`env-config-conventions`](../skills/atomic/env-config-conventions)
- 相关页：[应用启动与 main.ts](../specs/app-bootstrap)、[配置体系](../specs/config)
