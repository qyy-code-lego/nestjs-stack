---
name: auth-permission
description: "@IdentityRequired 限定身份、@Public 可选认证、@PermissionRequired RBAC 权限码、数据范围 WithScopeStrategy 与 DataScopeEngine。"
tags: [auth, identity, permission, rbac, data-scope]
group: 接口与数据
---

# 身份、权限与数据范围

身份与权限分两层：JWT 校验由 `JwtAuthGuard` 完成，身份校验由 `IdentityRequiredGuard` 完成，权限码校验由 `PermissionGuard` 完成。行级数据范围由 `WithScopeStrategy` + `DataScopeEngine` 实现。Guard 链顺序见 [请求生命周期与上下文](./request-lifecycle)。

## 身份限定 @IdentityRequired

多参数为 OR 关系：

```typescript
@IdentityRequired('student', 'hospital_admin')   // 二者之一即可
@Get('/xxx')
find() {}
```

`@Public()` 表示「可选认证」：token 有效时仍解析写入 `req.user`，无效时放行不抛异常。公开接口取 account/identity 必须判空。优先用 `@Public` 装饰器，`jwt.whiteList` 仅精确匹配作为补充。

## RBAC 权限 @PermissionRequired

基于 role → permission 两级模型，`@PermissionRequired` 支持单码 / AND（数组）/ OR（嵌套数组）/ 自定义函数；必须先有身份再挂权限：

```typescript
@PermissionRequired('xxx:view')                        // 单码
@PermissionRequired(['xxx:view', 'xxx:read'])          // AND
@PermissionRequired([['a'], ['b']])                    // OR
@PermissionRequired((perms) => perms.includes('a'))    // 自定义函数
```

超管（`isSuper=true`）跳过所有校验。

> ⚠️ 关键约束：Service 不应基于 HTTP 上下文做权限分支决策；权限分支应在 Controller 装饰器层表达。

## 数据范围 WithScopeStrategy

实体通过 Mixin 加范围字段，`DataScopeEngine.apply` 在查询时注入行级过滤：

```typescript
export class XxxEntity extends WithScopeStrategy(EntityWithIdAndTimeTrace) {
  // scopeStrategy / scopeDeptId / scopeCreatorId 由 Mixin 提供
}

// Service：searcher 由 Controller 显式传入，不在 Service 内读 ALS
await this.dataScopeEngine.apply({ qb, searcher });
```

| 策略 | 范围 |
| - | - |
| ALL | 全部 |
| SELF | 仅创建者本人 |
| DEPT_ONLY | 本部门 |
| DEPT_AND_CHILDREN | 本部门及子部门 |

创建者永远对记录可见（兜底规则）。

## 规范要点

| 场景 | 做法 |
| - | - |
| 限定身份 | `@IdentityRequired(...)`（OR） |
| 可选认证 | `@Public()`，取值判空 |
| 权限码 | `@PermissionRequired`，超管跳过 |
| 行级过滤 | `WithScopeStrategy` + `dataScopeEngine.apply`，searcher 由 Controller 传入 |

## 权威源

- skill：[`auth-identity-public`](../skills/atomic/auth-identity-public)、[`permission-rbac`](../skills/atomic/permission-rbac)、[`data-scope`](../skills/atomic/data-scope)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[请求生命周期与上下文](./request-lifecycle)、[TypeORM 查询设计](./sql-query)
