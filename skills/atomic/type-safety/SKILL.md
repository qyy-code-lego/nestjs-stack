---
name: type-safety
description: 禁止随意 as any 绕过编译；ALS 取值应在第一时间显式断言为业务实体类型；密码等敏感信息更新必须独立接口与独立 Service 方法，不混入综合维护接口。
type: atomic
tags: [types, safety]
strict: true
when_to_use: 关键词 — type-safety, any, sensitive, password
---


# 代码质量与敏感信息 ⚠️ Strict

## 1. 严禁随意 `as any`

```typescript
// ❌
const identity = this.threadLocal.get('identity') as any;
const hospitalId = identity.hospitalAdmin.hospitalId;

// ✅
import { AccountIdentity } from '@qyy-code-lego/nestjs/entities/account/account-identity.entity';
const identity = this.threadLocal.get('identity') as AccountIdentity;
const hospitalId = identity?.hospitalAdmin?.hospitalId;
```

要求：

- 优先复用已有 Entity / DTO / Type
- 框架返回 `any` 的（如 ALS 取值）应在**取值第一行**断言为目标类型
- 修改后必须 `eslint` + `tsc` 通过

## 2. 敏感信息更新独立

**密码等敏感字段不得混入「基础信息维护接口」。**

| 规则 | 内容 |
| - | - |
| 接口 | 单独的 `updatePassword` 等路由，不在 `manageXxx`/`update` 中处理 |
| Service | 单独 `updatePassword` 方法，不与综合维护方法共用入口 |
| 安全 | 密码更新通常需要校验旧密码或额外鉴权 |

## 相关 skill

- `context-threadlocal` — ALS 取值后的断言
- `service-paradigm` — Service 参数 interface 定义
