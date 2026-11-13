# 改造现有工程

本指南面向把 qyy-code-lego NestJS 公共能力接入既有 NestJS 工程的场景。推荐以 git 子模块形式引入，保留本工程作为能力源。

## 引入方式

```bash
# 子模块引入公共能力
git submodule add https://github.com/qyy-code-lego/nestjs-stack.git packages/@qyy-code-lego/nestjs
git submodule update --init --recursive
```

参考 `nestjs-starter` 模板工程的做法：`packages/@qyy-code-lego/nestjs` 提供能力，`apps/` 下承载实际应用装配。

## 改造步骤

| # | 步骤 | 说明 |
| - | - | - |
| 1 | 配置路径别名 | `tsconfig.json` 加入 `@qyy-code-lego/nestjs/*` 别名 |
| 2 | 替换全局基础设施 | 用 `GlobalModule` 的 Filter/Pipe/Interceptor，删掉自写的等价机制 |
| 3 | 接入 Guard 链 | `connectGlobalGuards(app)` 取代散落的 `APP_GUARD` |
| 4 | 统一响应与异常 | Controller 返回 `ApiResBody.of`，业务异常抛 `BizError` |
| 5 | 实体继承基类 | 改为继承 `EntityWithIdAndTimeTrace` + Mixin |
| 6 | Service 改造 | 去掉 ThreadLocal/Request，interface 入参，查询分层 |
| 7 | 安装 skill | `node packages/@qyy-code-lego/nestjs/skills/bin/install-skills.mjs --target=<t>` |

> ⚠️ 关键约束：禁止保留与公共能力等价的本地实现（自写 ExceptionFilter、自写响应体、自写 BaseEntity 等），必须复用。见 [工程结构与 Monorepo](../specs/architecture)。

## 渐进式策略

不必一次性全改。建议按模块迁移：先迁一个垂直模块（Controller→Service→Entity→VO），验证全局基础设施可用后再铺开。`config-namespaces` 兼容入口可在迁移期保留旧关键词检索。

## 权威源

- skill：[`app-module-composition`](../skills/atomic/app-module-composition)、[`organize-nestjs-module`](../skills/composite/organize-nestjs-module)、[`config-service`](../skills/atomic/config-service)
- 相关页：[工程结构与 Monorepo](../specs/architecture)、[业务模块组织与实现](../specs/module-organization)、[安装 Skill](./install-skills)
