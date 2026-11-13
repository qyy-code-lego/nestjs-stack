---
name: architecture
description: qyy-code-lego NestJS Monorepo 工程结构、apps/libs 划分、路径别名与各 lib 职责。
tags: [architecture, monorepo, libs]
group: 架构与请求
---

# 工程结构与 Monorepo

本工程是基于 NestJS 的 Monorepo 模板，采用 `apps/` + `libs/` 划分。公共能力沉淀在 `libs/`，业务应用装配在 `apps/`。本节交代整体结构与导入路径别名，是理解后续所有规范页的前置。请求生命周期见 [请求生命周期与上下文](./request-lifecycle)。

## 目录划分

```text
apps/   # 应用入口（playground 演示 + qyy-code-lego-app 业务；khy/ykl/yypt 仅在 nest-cli.json 声明）
libs/
  core/      # 跨项目通用技术组件：Filter/Pipe/Interceptor、ALS、Cache、Redis、JwtAuth、Session、MQ、BullMQ
  common/    # 配置体系 + 共享业务模块（opUser/Role/Permission/Dept/User/file/runtime-config）+ Guard/Service/DTO
  entities/  # 数据实体与基类 Mixin：Account/Identity/CommonBusiness/Sys
  web/       # OSS 相关（极薄）
env/    # 各应用环境变量：{appName}.env（模板）/ {appName}.local（本地覆盖）
```

## 路径别名

导入统一用 `@qyy-code-lego/nestjs/<lib>` 别名，定义在 `tsconfig.json`：

```json
{
  "paths": {
    "@qyy-code-lego/nestjs/core":      ["./libs/core/src"],
    "@qyy-code-lego/nestjs/core/*":    ["./libs/core/src/*"],
    "@qyy-code-lego/nestjs/common":    ["./libs/common/src"],
    "@qyy-code-lego/nestjs/entities":  ["./libs/entities/src"],
    "@qyy-code-lego/nestjs/web":       ["./libs/web/src"]
  }
}
```

下面是真实导入写法，禁止用相对路径跨 lib 引用：

```typescript
import { ApiResBody, BizError } from '@qyy-code-lego/nestjs/core';
import { ThreadLocal } from '@qyy-code-lego/nestjs/core/nest/als/thread-local';
import { ConfigService } from '@nestjs/config';
import type { AllConfig } from '@qyy-code-lego/nestjs/common';
```

## 各 lib 导出

| lib | 入口 | 导出关键能力 |
| - | - | - |
| core | `libs/core/src/index.ts` | ApiResBody、BizCode、BizError、HttpUtil、Pagination、nest/*、utils/* |
| common | `libs/common/src/index.ts` | config/*、common-business/*、shared/*（Guard/Service/DTO）、utils/* |
| entities | `libs/entities/src/index.ts` | core/*（Account、Identity、CommonBusiness、Sys 实体与基类 Mixin） |
| web | `libs/web/src/index.ts` | oss/* |

## nest-cli 工程声明

`nest-cli.json` 注册了 4 个 library（common/core/entities/web）与多个 application。新增 app 需在此注册，详见 [新建工程](../guide/create-project)。

> ⚠️ 关键约束：禁止在 `apps/` 内重复实现 `libs/` 已有的通用基础设施（Filter/Guard/响应体等），必须复用。见 [业务模块组织与实现](./module-organization)。

## 规范要点

| 场景 | 做法 |
| - | - |
| 跨 lib 引用 | 用 `@qyy-code-lego/nestjs/<lib>` 别名 |
| 通用技术能力 | 沉淀到 `libs/core`，不散落在 app |
| 业务共享能力 | 放 `libs/common` 的 `common-business/*` |
| 数据实体 | 放 `libs/entities`，复用基类 Mixin |

## 权威源

- skill：[`app-module-composition`](../skills/atomic/app-module-composition)、[`create-new-app`](../skills/composite/create-new-app)
- 开发文档：`docs/development/intro.md`（<a href="../raw/docs/development/intro.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[请求生命周期与上下文](./request-lifecycle)、[应用启动与 main.ts](./app-bootstrap)
